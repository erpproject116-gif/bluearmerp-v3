package documentlifecycle

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const (
	Active  = "active"
	Deleted = "deleted"
	All     = "all"
)

type detailLifecycleKey struct{}

type Dependency struct {
	Code         string
	Kind         string
	Label        string
	Query        string
	BlockDelete  bool
	BlockRestore bool
}

type Config struct {
	Table        string
	DocumentType string
	DisplayName  string
	AuditTarget  string
	Dependencies []Dependency
}

type Blocker struct {
	Code  string `json:"code"`
	Kind  string `json:"kind"`
	Label string `json:"label"`
	Count int64  `json:"count"`
}

type Impact struct {
	DocumentType string    `json:"document_type"`
	DocumentID   int64     `json:"document_id"`
	Lifecycle    string    `json:"lifecycle"`
	CanDelete    bool      `json:"can_delete"`
	CanRestore   bool      `json:"can_restore"`
	Blockers     []Blocker `json:"blockers"`
}

var identifierRE = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

func ValidateConfig(c Config) error {
	if !identifierRE.MatchString(c.Table) {
		return fmt.Errorf("invalid lifecycle table %q", c.Table)
	}
	if strings.TrimSpace(c.DocumentType) == "" || strings.TrimSpace(c.DisplayName) == "" {
		return errors.New("document type and display name are required")
	}
	for _, d := range c.Dependencies {
		if strings.TrimSpace(d.Code) == "" || strings.TrimSpace(d.Query) == "" {
			return errors.New("dependency code and query are required")
		}
	}
	return nil
}

func Parse(value string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", Active:
		return Active, nil
	case Deleted:
		return Deleted, nil
	case All:
		return All, nil
	default:
		return "", errors.New("must be active, deleted, or all")
	}
}

func ListPredicate(r *http.Request, alias string) (string, error) {
	lifecycle, err := Parse(r.URL.Query().Get("lifecycle"))
	if err != nil {
		return "", err
	}
	return predicate(alias, lifecycle)
}

func WithDetailLifecycle(ctx context.Context, lifecycle string) context.Context {
	return context.WithValue(ctx, detailLifecycleKey{}, lifecycle)
}

func DetailPredicate(ctx context.Context, alias string) string {
	lifecycle, _ := ctx.Value(detailLifecycleKey{}).(string)
	if lifecycle == "" {
		lifecycle = Active
	}
	p, err := predicate(alias, lifecycle)
	if err != nil {
		return alias + ".deleted_at is null"
	}
	return p
}

func predicate(alias, lifecycle string) (string, error) {
	if !identifierRE.MatchString(alias) {
		return "", errors.New("invalid SQL alias")
	}
	switch lifecycle {
	case Active:
		return alias + ".deleted_at is null", nil
	case Deleted:
		return alias + ".deleted_at is not null", nil
	case All:
		return "true", nil
	default:
		return "", errors.New("invalid lifecycle")
	}
}

func PrepareDetailRequest(w http.ResponseWriter, r *http.Request) (*http.Request, bool) {
	lifecycle, err := Parse(r.URL.Query().Get("lifecycle"))
	if err != nil {
		response.Validation(w, map[string]string{"lifecycle": err.Error()})
		return r, false
	}
	return r.WithContext(WithDetailLifecycle(r.Context(), lifecycle)), true
}

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool, base string, cfg Config) {
	if err := ValidateConfig(cfg); err != nil {
		panic(err)
	}
	r.Get(base+"/{id}/delete-impact", impactHandler(pool, cfg))
	r.Get(base+"/{id}/lifecycle", metadataHandler(pool, cfg))
	r.Post(base+"/{id}/actions/delete", actionHandler(pool, cfg, "delete"))
	r.Post(base+"/{id}/actions/restore", actionHandler(pool, cfg, "restore"))
}

func DeleteHandler(pool *pgxpool.Pool, cfg Config) http.HandlerFunc {
	if err := ValidateConfig(cfg); err != nil {
		panic(err)
	}
	return actionHandler(pool, cfg, "delete")
}

func impactHandler(pool *pgxpool.Pool, cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, ok := parseID(w, r)
		if !ok {
			return
		}
		impact, err := loadImpact(r.Context(), pool, cfg, tu.TenantID, id)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusNotFound, cfg.DisplayName+" not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to inspect dependencies.", "ERR_INTERNAL")
			return
		}
		response.OK(w, impact, "OK")
	}
}

func metadataHandler(pool *pgxpool.Pool, cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, ok := parseID(w, r)
		if !ok {
			return
		}
		q := fmt.Sprintf(`
			select deleted_at, deleted_by_user_id, delete_reason,
			       restored_at, restored_by_user_id, restore_reason, lifecycle_version
			from public.%s where id = $1 and tenant_id = $2`, cfg.Table)
		var deletedAt, restoredAt any
		var deletedBy, restoredBy *int64
		var deleteReason, restoreReason *string
		var version int
		if err := pool.QueryRow(r.Context(), q, id, tu.TenantID).Scan(
			&deletedAt, &deletedBy, &deleteReason, &restoredAt, &restoredBy, &restoreReason, &version,
		); err != nil {
			response.Err(w, http.StatusNotFound, cfg.DisplayName+" not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select action, reason, actor_user_id, created_at
			from public.document_lifecycle_actions
			where tenant_id = $1 and document_type = $2 and document_id = $3
			order by id desc`, tu.TenantID, cfg.DocumentType, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load lifecycle history.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		actions := []map[string]any{}
		for rows.Next() {
			var action, reason string
			var actorID int64
			var createdAt any
			if err := rows.Scan(&action, &reason, &actorID, &createdAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read lifecycle history.", "ERR_INTERNAL")
				return
			}
			actions = append(actions, map[string]any{"action": action, "reason": reason, "actor_user_id": actorID, "created_at": createdAt})
		}
		response.OK(w, map[string]any{
			"document_type": cfg.DocumentType, "document_id": id,
			"lifecycle":  map[bool]string{true: Deleted, false: Active}[deletedAt != nil],
			"deleted_at": deletedAt, "deleted_by_user_id": deletedBy, "delete_reason": deleteReason,
			"restored_at": restoredAt, "restored_by_user_id": restoredBy, "restore_reason": restoreReason,
			"lifecycle_version": version, "actions": actions,
		}, "OK")
	}
}

type actionBody struct {
	Reason string `json:"reason"`
}

func actionHandler(pool *pgxpool.Pool, cfg Config, action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, ok := parseID(w, r)
		if !ok {
			return
		}
		reason := strings.TrimSpace(r.URL.Query().Get("reason"))
		if reason == "" {
			reason = strings.TrimSpace(r.Header.Get("X-Lifecycle-Reason"))
		}
		if reason == "" && r.Body != nil {
			var body actionBody
			if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
				reason = strings.TrimSpace(body.Reason)
			}
		}
		if reason == "" {
			response.Validation(w, map[string]string{"reason": "Reason is required."})
			return
		}
		if len(reason) > 2000 {
			response.Validation(w, map[string]string{"reason": "Reason must not exceed 2000 characters."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to begin lifecycle action.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		lockKey := fmt.Sprintf("document-lifecycle:%d:%s:%d", tu.TenantID, cfg.DocumentType, id)
		if _, err := tx.Exec(r.Context(), `select pg_advisory_xact_lock(hashtextextended($1, 0))`, lockKey); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to lock document.", "ERR_INTERNAL")
			return
		}

		q := fmt.Sprintf(`select deleted_at from public.%s where id = $1 and tenant_id = $2 for update`, cfg.Table)
		var deletedAt any
		if err := tx.QueryRow(r.Context(), q, id, tu.TenantID).Scan(&deletedAt); err != nil {
			response.Err(w, http.StatusNotFound, cfg.DisplayName+" not found.", "ERR_NOT_FOUND")
			return
		}
		if (action == "delete" && deletedAt != nil) || (action == "restore" && deletedAt == nil) {
			response.Err(w, http.StatusConflict, cfg.DisplayName+" is already "+map[bool]string{true: "deleted", false: "active"}[deletedAt != nil]+".", "ERR_LIFECYCLE_STATE")
			return
		}

		blockers, err := loadBlockers(r.Context(), tx, cfg, tu.TenantID, id, action)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to inspect dependencies.", "ERR_INTERNAL")
			return
		}
		if len(blockers) > 0 {
			impact := Impact{
				DocumentType: cfg.DocumentType, DocumentID: id,
				Lifecycle: map[bool]string{true: Deleted, false: Active}[deletedAt != nil],
				CanDelete: action != "delete", CanRestore: action != "restore", Blockers: blockers,
			}
			response.JSON(w, http.StatusConflict, response.Envelope{
				Success: false, Message: "Lifecycle action blocked by dependencies.",
				Data: impact, Errors: map[string]string{}, Code: "ERR_DEPENDENCY_BLOCKED",
			})
			return
		}

		var update string
		if action == "delete" {
			update = fmt.Sprintf(`
				update public.%s set deleted_at = now(), deleted_by_user_id = $3, delete_reason = $4,
				  updated_at = now(), lifecycle_version = lifecycle_version + 1
				where id = $1 and tenant_id = $2 and deleted_at is null`, cfg.Table)
		} else {
			update = fmt.Sprintf(`
				update public.%s set deleted_at = null, restored_at = now(), restored_by_user_id = $3,
				  restore_reason = $4, updated_at = now(), lifecycle_version = lifecycle_version + 1
				where id = $1 and tenant_id = $2 and deleted_at is not null`, cfg.Table)
		}
		tag, err := tx.Exec(r.Context(), update, id, tu.TenantID, tu.AppUserID, reason)
		if err != nil || tag.RowsAffected() != 1 {
			response.Err(w, http.StatusConflict, "Lifecycle state changed concurrently.", "ERR_LIFECYCLE_STATE")
			return
		}
		if _, err := tx.Exec(r.Context(), `
			insert into public.document_lifecycle_actions
			  (tenant_id, document_type, document_id, action, reason, actor_user_id)
			values ($1,$2,$3,$4,$5,$6)`,
			tu.TenantID, cfg.DocumentType, id, action, reason, tu.AppUserID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preserve lifecycle history.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit lifecycle action.", "ERR_INTERNAL")
			return
		}
		auditAction := cfg.DocumentType + "." + action
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, auditAction, cfg.AuditTarget, &id, nil, map[string]any{"reason": reason})
		response.OK(w, map[string]any{
			"document_type": cfg.DocumentType, "document_id": id,
			"lifecycle": map[string]string{"delete": Deleted, "restore": Active}[action],
		}, strings.Title(action)+"d.")
	}
}

type querier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func loadImpact(ctx context.Context, q querier, cfg Config, tenantID, id int64) (Impact, error) {
	stateQuery := fmt.Sprintf(`select deleted_at from public.%s where id = $1 and tenant_id = $2`, cfg.Table)
	var deletedAt any
	if err := q.QueryRow(ctx, stateQuery, id, tenantID).Scan(&deletedAt); err != nil {
		return Impact{}, err
	}
	deleteBlockers, err := loadBlockers(ctx, q, cfg, tenantID, id, "delete")
	if err != nil {
		return Impact{}, err
	}
	restoreBlockers, err := loadBlockers(ctx, q, cfg, tenantID, id, "restore")
	if err != nil {
		return Impact{}, err
	}
	blockers := deleteBlockers
	if deletedAt != nil {
		blockers = restoreBlockers
	}
	return Impact{
		DocumentType: cfg.DocumentType, DocumentID: id,
		Lifecycle:  map[bool]string{true: Deleted, false: Active}[deletedAt != nil],
		CanDelete:  deletedAt == nil && len(deleteBlockers) == 0,
		CanRestore: deletedAt != nil && len(restoreBlockers) == 0,
		Blockers:   blockers,
	}, nil
}

func loadBlockers(ctx context.Context, q querier, cfg Config, tenantID, id int64, action string) ([]Blocker, error) {
	blockers := []Blocker{}
	for _, d := range cfg.Dependencies {
		if (action == "delete" && !d.BlockDelete) || (action == "restore" && !d.BlockRestore) {
			continue
		}
		var count int64
		if err := q.QueryRow(ctx, d.Query, tenantID, id).Scan(&count); err != nil {
			return nil, fmt.Errorf("%s: %w", d.Code, err)
		}
		if count > 0 {
			blockers = append(blockers, Blocker{Code: d.Code, Kind: d.Kind, Label: d.Label, Count: count})
		}
	}
	return blockers, nil
}

func parseID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid id."})
		return 0, false
	}
	return id, true
}
