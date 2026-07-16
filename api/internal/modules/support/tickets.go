package support

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Ticket struct {
	ID              int64            `json:"id"`
	TicketNo        string           `json:"ticket_no"`
	TicketDate      string           `json:"ticket_date"`
	Subject         string           `json:"subject"`
	Description     *string          `json:"description,omitempty"`
	PartnerID       *int64           `json:"partner_id,omitempty"`
	PartnerName     string           `json:"partner_name,omitempty"`
	WarrantyAssetID *int64           `json:"warranty_asset_id,omitempty"`
	RepairOrderID   *int64           `json:"repair_order_id,omitempty"`
	Category        string           `json:"category"`
	Priority        string           `json:"priority"`
	Status          string           `json:"status"`
	AssignedUserID  *int64           `json:"assigned_user_id,omitempty"`
	AssignedName    string           `json:"assigned_name,omitempty"`
	CreatedByUserID *int64           `json:"created_by_user_id,omitempty"`
	CreatedByName   string           `json:"created_by_name,omitempty"`
	ResolvedAt      *string          `json:"resolved_at,omitempty"`
	Comments        []TicketComment  `json:"comments,omitempty"`
}

type TicketComment struct {
	ID         int64  `json:"id"`
	UserID     *int64 `json:"user_id,omitempty"`
	AuthorName string `json:"author_name"`
	Body       string `json:"body"`
	CreatedAt  string `json:"created_at"`
}

type ticketBody struct {
	Subject         string  `json:"subject"`
	Description     *string `json:"description"`
	PartnerID       *int64  `json:"partner_id"`
	WarrantyAssetID *int64  `json:"warranty_asset_id"`
	RepairOrderID   *int64  `json:"repair_order_id"`
	Category        string  `json:"category"`
	Priority        string  `json:"priority"`
	AssignedUserID  *int64  `json:"assigned_user_id"`
}

type ticketPatchBody struct {
	Subject         *string `json:"subject"`
	Description     *string `json:"description"`
	Category        *string `json:"category"`
	Priority        *string `json:"priority"`
	Status          *string `json:"status"`
	AssignedUserID  *int64  `json:"assigned_user_id"`
	WarrantyAssetID *int64  `json:"warranty_asset_id"`
	RepairOrderID   *int64  `json:"repair_order_id"`
}

type commentBody struct {
	Body string `json:"body"`
}

func registerTicketRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/tickets", listTickets(pool))
	r.With(auth.RequirePermission("support.tickets_new", auth.AccessWrite)).Post("/tickets", createTicket(pool))
	r.Get("/tickets/{id}", getTicket(pool))
	r.With(auth.RequirePermission("support.tickets_assign", auth.AccessWrite)).Patch("/tickets/{id}", patchTicket(pool))
	r.Post("/tickets/{id}/comments", addTicketComment(pool))
	registerTicketAttachmentRoutes(r, pool)
}

func listTickets(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"ticket_no": "t.ticket_no", "status": "t.status", "priority": "t.priority", "ticket_date": "t.ticket_date",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "ticket_date", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		where := "t.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (t.ticket_no ilike $%d or t.subject ilike $%d or coalesce(p.company_name, '') ilike $%d)", n, n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and t.status = $%d", n)
			args = append(args, st)
			n++
		} else if p.Status != "" {
			where += fmt.Sprintf(" and t.status = $%d", n)
			args = append(args, p.Status)
			n++
		}
		if !tu.CanManageAllSupportTickets() {
			where += fmt.Sprintf(" and t.created_by_user_id = $%d", n)
			args = append(args, tu.AppUserID)
			n++
		}

		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "t.ticket_date"
		}
		q := fmt.Sprintf(`
			select t.id, t.ticket_no, t.ticket_date::text, t.subject, t.description,
			  t.partner_id, coalesce(p.company_name, ''), t.warranty_asset_id, t.repair_order_id,
			  t.category, t.priority, t.status,
			  t.assigned_user_id, coalesce(au.full_name, ''),
			  t.created_by_user_id, coalesce(cu.full_name, ''),
			  t.resolved_at::text,
			  count(*) over()
			from public.sup_support_tickets t
			left join public.inv_partners p on p.id = t.partner_id
			left join public.users au on au.id = t.assigned_user_id
			left join public.users cu on cu.id = t.created_by_user_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list tickets.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []Ticket
		var total int64
		for rows.Next() {
			var row Ticket
			var desc *string
			var resolved *string
			if err := rows.Scan(
				&row.ID, &row.TicketNo, &row.TicketDate, &row.Subject, &desc,
				&row.PartnerID, &row.PartnerName, &row.WarrantyAssetID, &row.RepairOrderID,
				&row.Category, &row.Priority, &row.Status,
				&row.AssignedUserID, &row.AssignedName, &row.CreatedByUserID, &row.CreatedByName, &resolved, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read ticket.", "ERR_INTERNAL")
				return
			}
			row.Description = desc
			row.ResolvedAt = resolved
			out = append(out, row)
		}
		if out == nil {
			out = []Ticket{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getTicket(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		ticket, err := loadTicket(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Ticket not found.", "ERR_NOT_FOUND")
			return
		}
		if !tu.CanAccessSupportTicket(ticket.CreatedByUserID) {
			response.Err(w, http.StatusNotFound, "Ticket not found.", "ERR_NOT_FOUND")
			return
		}
		comments, err := loadTicketComments(r.Context(), pool, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load comments.", "ERR_INTERNAL")
			return
		}
		ticket.Comments = comments
		response.OK(w, ticket, "OK")
	}
}

func createTicket(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body ticketBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateTicketBody(body); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}

		partnerID := optionalPositiveID(body.PartnerID)
		warrantyID := optionalPositiveID(body.WarrantyAssetID)
		repairID := optionalPositiveID(body.RepairOrderID)
		assignedID := optionalPositiveID(body.AssignedUserID)
		if assignedID != nil && !tu.CanManageAllSupportTickets() {
			response.Err(w, http.StatusForbidden, "Only IT staff may assign tickets.", "ERR_FORBIDDEN")
			return
		}

		ticketDate := time.Now()
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create ticket.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var seq int
		_ = tx.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1 from public.sup_support_tickets
			where tenant_id = $1 and ticket_date = $2::date`, tu.TenantID, ticketDate.Format("2006-01-02")).Scan(&seq)
		ticketNo := fmt.Sprintf("TK-%s-%03d", ticketDate.Format("20060102"), seq)

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.sup_support_tickets (
			  tenant_id, ticket_date, date_seq, ticket_no, subject, description,
			  partner_id, warranty_asset_id, repair_order_id, category, priority,
			  assigned_user_id, created_by_user_id
			) values ($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			returning id`,
			tu.TenantID, ticketDate.Format("2006-01-02"), seq, ticketNo,
			strings.TrimSpace(body.Subject), nullIfBlankPtr(body.Description),
			partnerID, warrantyID, repairID,
			normalizeCategory(body.Category), normalizePriority(body.Priority),
			assignedID, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert ticket.", "ERR_INTERNAL")
			return
		}

		payload := ticketCreatedPayload{
			TicketID: id, TicketNo: ticketNo, Subject: strings.TrimSpace(body.Subject),
			PartnerID: partnerID, AssignedUserID: assignedID, NotifyStub: true,
		}
		idemKey := fmt.Sprintf("support.ticket_created:%d:%d", tu.TenantID, id)
		// Never block ticket create on notification enqueue failures.
		if err := outbox.EnqueueTx(r.Context(), tx, tu.TenantID, "support.ticket_created", idemKey, payload); err != nil {
			// continue without outbox row
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save ticket.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "support.ticket_create", "support_ticket", &id, nil, body)
		_ = DrainOutbox(r.Context(), pool)
		ticket, _ := loadTicket(r.Context(), pool, tu.TenantID, id)
		ticket.Comments = []TicketComment{}
		response.OK(w, ticket, "Ticket created.")
	}
}

func patchTicket(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body ticketPatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		if !tu.CanManageAllSupportTickets() {
			response.Err(w, http.StatusForbidden, "Only IT staff may update ticket status and fields.", "ERR_FORBIDDEN")
			return
		}

		before, err := loadTicket(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Ticket not found.", "ERR_NOT_FOUND")
			return
		}

		subject := before.Subject
		if body.Subject != nil {
			subject = strings.TrimSpace(*body.Subject)
			if subject == "" {
				response.Validation(w, map[string]string{"subject": "Subject is required."})
				return
			}
		}
		desc := before.Description
		if body.Description != nil {
			desc = body.Description
		}
		category := before.Category
		if body.Category != nil {
			category = normalizeCategory(*body.Category)
		}
		priority := before.Priority
		if body.Priority != nil {
			priority = normalizePriority(*body.Priority)
		}
		status := before.Status
		if body.Status != nil {
			status = normalizeStatus(*body.Status)
		}
		assignedID := before.AssignedUserID
		if body.AssignedUserID != nil {
			assignedID = body.AssignedUserID
		}
		warrantyID := before.WarrantyAssetID
		if body.WarrantyAssetID != nil {
			warrantyID = body.WarrantyAssetID
		}
		repairID := before.RepairOrderID
		if body.RepairOrderID != nil {
			repairID = body.RepairOrderID
		}

		_, err = pool.Exec(r.Context(), `
			update public.sup_support_tickets set
			  subject = $1, description = $2, category = $3, priority = $4,
			  status = $5, assigned_user_id = $6, warranty_asset_id = $7, repair_order_id = $8,
			  resolved_at = case when $5 in ('resolved','closed') then coalesce(resolved_at, now()) else null end,
			  updated_at = now()
			where id = $9 and tenant_id = $10`,
			subject, desc, category, priority, status, assignedID, warrantyID, repairID, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update ticket.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "support.ticket_update", "support_ticket", &id, before, body)
		ticket, _ := loadTicket(r.Context(), pool, tu.TenantID, id)
		comments, _ := loadTicketComments(r.Context(), pool, id)
		ticket.Comments = comments
		response.OK(w, ticket, "Ticket updated.")
	}
}

func addTicketComment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var createdBy *int64
		if err := pool.QueryRow(r.Context(), `
			select created_by_user_id from public.sup_support_tickets where id = $1 and tenant_id = $2`,
			id, tu.TenantID).Scan(&createdBy); err != nil {
			response.Err(w, http.StatusNotFound, "Ticket not found.", "ERR_NOT_FOUND")
			return
		}
		if !tu.CanAccessSupportTicket(createdBy) {
			response.Err(w, http.StatusNotFound, "Ticket not found.", "ERR_NOT_FOUND")
			return
		}

		var body commentBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		text := strings.TrimSpace(body.Body)
		if text == "" {
			response.Validation(w, map[string]string{"body": "Comment is required."})
			return
		}

		authorName := tu.FullName
		if authorName == "" {
			authorName = tu.Email
		}
		var commentID int64
		err = pool.QueryRow(r.Context(), `
			insert into public.sup_support_ticket_comments (ticket_id, user_id, author_name, body)
			values ($1, $2, $3, $4) returning id`,
			id, tu.AppUserID, authorName, text).Scan(&commentID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add comment.", "ERR_INTERNAL")
			return
		}

		_, _ = pool.Exec(r.Context(), `update public.sup_support_tickets set updated_at = now() where id = $1`, id)

		ticket, _ := loadTicket(r.Context(), pool, tu.TenantID, id)
		comments, _ := loadTicketComments(r.Context(), pool, id)
		ticket.Comments = comments
		response.OK(w, ticket, "Comment added.")
	}
}

func loadTicket(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Ticket, error) {
	var row Ticket
	var desc *string
	var resolved *string
	err := pool.QueryRow(ctx, `
		select t.id, t.ticket_no, t.ticket_date::text, t.subject, t.description,
		  t.partner_id, coalesce(p.company_name, ''), t.warranty_asset_id, t.repair_order_id,
		  t.category, t.priority, t.status,
		  t.assigned_user_id, coalesce(au.full_name, ''),
		  t.created_by_user_id, coalesce(cu.full_name, ''), t.resolved_at::text
		from public.sup_support_tickets t
		left join public.inv_partners p on p.id = t.partner_id
		left join public.users au on au.id = t.assigned_user_id
		left join public.users cu on cu.id = t.created_by_user_id
		where t.id = $1 and t.tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.TicketNo, &row.TicketDate, &row.Subject, &desc,
		&row.PartnerID, &row.PartnerName, &row.WarrantyAssetID, &row.RepairOrderID,
		&row.Category, &row.Priority, &row.Status,
		&row.AssignedUserID, &row.AssignedName, &row.CreatedByUserID, &row.CreatedByName, &resolved,
	)
	if err != nil {
		return Ticket{}, err
	}
	row.Description = desc
	row.ResolvedAt = resolved
	return row, nil
}

func loadTicketComments(ctx context.Context, pool *pgxpool.Pool, ticketID int64) ([]TicketComment, error) {
	rows, err := pool.Query(ctx, `
		select id, user_id, author_name, body, created_at::text
		from public.sup_support_ticket_comments
		where ticket_id = $1 order by created_at`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TicketComment
	for rows.Next() {
		var c TicketComment
		if err := rows.Scan(&c.ID, &c.UserID, &c.AuthorName, &c.Body, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if out == nil {
		out = []TicketComment{}
	}
	return out, nil
}

func validateTicketBody(b ticketBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(b.Subject) == "" {
		errs["subject"] = "Subject is required."
	}
	if b.Priority != "" && normalizePriority(b.Priority) == "" {
		errs["priority"] = "Invalid priority (use low, normal, high, or urgent)."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func optionalPositiveID(id *int64) *int64 {
	if id == nil || *id <= 0 {
		return nil
	}
	return id
}

func nullIfBlankPtr(s *string) *string {
	if s == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*s)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizePriority(p string) string {
	switch strings.ToLower(strings.TrimSpace(p)) {
	case "low", "normal", "high", "urgent":
		return strings.ToLower(strings.TrimSpace(p))
	case "":
		return "normal"
	default:
		return ""
	}
}

func normalizeStatus(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "open", "in_progress", "waiting", "resolved", "closed":
		return strings.ToLower(strings.TrimSpace(s))
	default:
		return "open"
	}
}

func normalizeCategory(c string) string {
	c = strings.TrimSpace(c)
	if c == "" {
		return "general"
	}
	return c
}

func orderSQL(order string) string {
	if strings.EqualFold(order, "desc") {
		return "desc"
	}
	return "asc"
}

func ticketAccessOK(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, tenantID, ticketID int64) bool {
	var createdBy *int64
	if err := pool.QueryRow(ctx, `
		select created_by_user_id from public.sup_support_tickets where id = $1 and tenant_id = $2`,
		ticketID, tenantID).Scan(&createdBy); err != nil {
		return false
	}
	return tu.CanAccessSupportTicket(createdBy)
}
