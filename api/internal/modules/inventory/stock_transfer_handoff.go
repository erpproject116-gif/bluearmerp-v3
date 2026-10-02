package inventory

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/branchiso"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const entityStockTransfer = "inv_stock_entry_transfer"

func registerStockTransferHandoffRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessWrite)).
		Post("/stock-entries/{id}/submit-transfer", submitTransfer(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessWrite)).
		Post("/stock-entries/{id}/approve-transfer", approveTransfer(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessWrite)).
		Post("/stock-entries/{id}/ship-transfer", shipTransfer(pool))
	// Receive: store_admin+ OR inventory.stock_transfer_receive
	r.Post("/stock-entries/{id}/receive-transfer", receiveTransfer(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessWrite)).
		Post("/stock-entries/{id}/cancel-transfer", cancelTransfer(pool))
}

func requireTransferHandoff(tu auth.TenantUser) bool {
	return tu.TransferHandoffV2
}

func submitTransfer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !requireTransferHandoff(tu) {
			response.Err(w, http.StatusBadRequest, "Transfer handoff is not enabled for this business.", "ERR_HANDOFF_OFF")
			return
		}
		if !branchiso.CanOperateTransfer(tu) {
			response.Err(w, http.StatusForbidden, "Only store admins and owners can submit transfers.", "ERR_FORBIDDEN")
			return
		}
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		entry, err := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		if err != nil || entry.EntryType != "transfer" {
			response.Err(w, http.StatusNotFound, "Transfer not found.", "ERR_NOT_FOUND")
			return
		}
		if entry.Status != "draft" {
			response.Validation(w, map[string]string{"status": "Only draft transfers can be submitted."})
			return
		}
		notes := ""
		if entry.Notes != nil {
			notes = strings.TrimSpace(*entry.Notes)
		}
		if notes == "" {
			response.Validation(w, map[string]string{"notes": "Reason is required."})
			return
		}
		if entry.FromLocationID == nil || entry.ToLocationID == nil || *entry.FromLocationID == *entry.ToLocationID {
			response.Validation(w, map[string]string{"to_location_id": "Valid from/to locations required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit transfer.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		tag, err := tx.Exec(r.Context(), `
			update public.inv_stock_entries
			set status = 'pending_approval',
			    requested_by_user_id = $3, requested_at = now(),
			    cross_branch_reason = coalesce(nullif(cross_branch_reason, ''), notes),
			    updated_at = now()
			where id = $1 and tenant_id = $2 and status = 'draft'`, id, tu.TenantID, tu.AppUserID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusConflict, "Could not submit transfer.", "ERR_CONFLICT")
			return
		}
		label := entry.EntryNo
		submitter := strings.TrimSpace(tu.FullName)
		if submitter == "" {
			submitter = strings.TrimSpace(tu.Email)
		}
		if err := approval.EnqueuePendingApprovalTx(r.Context(), tx, tu.TenantID, entityStockTransfer, id, label, submitter); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to queue approval email.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit transfer.", "ERR_INTERNAL")
			return
		}
		notifyTransferParties(r.Context(), pool, tu.TenantID, tu.AppUserID, id, entry.ToLocationID, label,
			"Transfer needs approval", "A location transfer is waiting for approval.")
		_ = approval.DrainOutbox(r.Context(), pool)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.transfer.submit", "inv_stock_entry", &id, nil, nil)
		out, _ := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		response.OK(w, out, "Transfer submitted for approval.")
	}
}

func approveTransfer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !requireTransferHandoff(tu) {
			response.Err(w, http.StatusBadRequest, "Transfer handoff is not enabled for this business.", "ERR_HANDOFF_OFF")
			return
		}
		if !branchiso.CanOperateTransfer(tu) {
			response.Err(w, http.StatusForbidden, "Only store admins and owners can approve transfers.", "ERR_FORBIDDEN")
			return
		}
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		entry, err := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		if err != nil || entry.EntryType != "transfer" {
			response.Err(w, http.StatusNotFound, "Transfer not found.", "ERR_NOT_FOUND")
			return
		}
		if entry.Status != "pending_approval" {
			response.Validation(w, map[string]string{"status": "Only pending transfers can be approved."})
			return
		}
		sameUserWarn := entry.RequestedByUserID != nil && *entry.RequestedByUserID == tu.AppUserID

		tag, err := pool.Exec(r.Context(), `
			update public.inv_stock_entries
			set status = 'approved', approved_by_user_id = $3, approved_at = now(), updated_at = now()
			where id = $1 and tenant_id = $2 and status = 'pending_approval'`, id, tu.TenantID, tu.AppUserID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusConflict, "Could not approve transfer.", "ERR_CONFLICT")
			return
		}
		notifyTransferParties(r.Context(), pool, tu.TenantID, tu.AppUserID, id, entry.ToLocationID, entry.EntryNo,
			"Transfer approved — ready to ship", "An approved transfer is ready to ship from the source branch.")
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.transfer.approve", "inv_stock_entry", &id, nil, map[string]any{
			"same_user_approver": sameUserWarn,
		})
		out, _ := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		msg := "Transfer approved."
		if sameUserWarn {
			msg = "Transfer approved (warning: same user submitted and approved)."
		}
		response.OK(w, out, msg)
	}
}

func shipTransfer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !requireTransferHandoff(tu) {
			response.Err(w, http.StatusBadRequest, "Transfer handoff is not enabled for this business.", "ERR_HANDOFF_OFF")
			return
		}
		if !branchiso.CanOperateTransfer(tu) {
			response.Err(w, http.StatusForbidden, "Only store admins and owners can ship transfers.", "ERR_FORBIDDEN")
			return
		}
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		entry, err := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		if err != nil || entry.EntryType != "transfer" {
			response.Err(w, http.StatusNotFound, "Transfer not found.", "ERR_NOT_FOUND")
			return
		}
		if entry.Status != "approved" {
			response.Validation(w, map[string]string{"status": "Only approved transfers can be shipped."})
			return
		}
		transitID, err := branchiso.EnsureInTransitLocation(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to resolve in-transit location.", "ERR_INTERNAL")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to ship transfer.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		reason := ""
		if entry.Notes != nil {
			reason = strings.TrimSpace(*entry.Notes)
		}
		for _, ln := range entry.Lines {
			if err := ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, *entry.FromLocationID, -ln.Qty, tu.AppUserID, "stock_entry", id, "transfer_out", reason); err != nil {
				response.ValidationSmart(w, map[string]string{"lines": err.Error()})
				return
			}
			if err := ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, transitID, ln.Qty, tu.AppUserID, "stock_entry", id, "transfer_in", reason); err != nil {
				response.ValidationSmart(w, map[string]string{"lines": err.Error()})
				return
			}
		}
		if err := moveStockEntryTracking(r.Context(), tx, tu.TenantID, id, tu.AppUserID, *entry.FromLocationID, transitID); err != nil {
			response.ValidationSmart(w, map[string]string{"lines": err.Error()})
			return
		}
		tag, err := tx.Exec(r.Context(), `
			update public.inv_stock_entries
			set status = 'in_transit',
			    in_transit_location_id = $3,
			    shipped_by_user_id = $4, shipped_at = now(),
			    updated_at = now()
			where id = $1 and tenant_id = $2 and status = 'approved'`, id, tu.TenantID, transitID, tu.AppUserID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusConflict, "Could not ship transfer.", "ERR_CONFLICT")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to ship transfer.", "ERR_INTERNAL")
			return
		}
		notifyTransferParties(r.Context(), pool, tu.TenantID, tu.AppUserID, id, entry.ToLocationID, entry.EntryNo,
			"Transfer in transit — ready to receive", "Stock has shipped and is waiting to be received at the destination.")
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.transfer.ship", "inv_stock_entry", &id, nil, nil)
		out, _ := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		response.OK(w, out, "Transfer shipped (in transit).")
	}
}

func receiveTransfer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !requireTransferHandoff(tu) {
			response.Err(w, http.StatusBadRequest, "Transfer handoff is not enabled for this business.", "ERR_HANDOFF_OFF")
			return
		}
		if !branchiso.CanReceiveTransfer(tu) {
			response.Err(w, http.StatusForbidden, "You cannot receive transfers.", "ERR_FORBIDDEN")
			return
		}
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		entry, err := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		if err != nil || entry.EntryType != "transfer" {
			response.Err(w, http.StatusNotFound, "Transfer not found.", "ERR_NOT_FOUND")
			return
		}
		if entry.Status != "in_transit" {
			response.Validation(w, map[string]string{"status": "Only in-transit transfers can be received."})
			return
		}
		if entry.ToLocationID == nil {
			response.Validation(w, map[string]string{"to_location_id": "Destination is required."})
			return
		}
		// Non–store-admin receivers may only receive into home/assigned destination.
		if !branchiso.CanOperateTransfer(tu) {
			allowed, aerr := branchiso.CommercialLocationIDs(r.Context(), pool, tu)
			if aerr != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to check branch access.", "ERR_INTERNAL")
				return
			}
			okDest := false
			for _, loc := range allowed {
				if loc == *entry.ToLocationID {
					okDest = true
					break
				}
			}
			if !okDest && tu.HomeLocationID != *entry.ToLocationID {
				response.Err(w, http.StatusForbidden, "You can only receive transfers into your home/assigned branch.", "ERR_BRANCH_FORBIDDEN")
				return
			}
		}
		transitID := int64(0)
		if entry.InTransitLocationID != nil {
			transitID = *entry.InTransitLocationID
		}
		if transitID == 0 {
			transitID, err = branchiso.EnsureInTransitLocation(r.Context(), pool, tu.TenantID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to resolve in-transit location.", "ERR_INTERNAL")
				return
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to receive transfer.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		reason := ""
		if entry.Notes != nil {
			reason = strings.TrimSpace(*entry.Notes)
		}
		for _, ln := range entry.Lines {
			if err := ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, transitID, -ln.Qty, tu.AppUserID, "stock_entry", id, "transfer_out", reason); err != nil {
				response.ValidationSmart(w, map[string]string{"lines": err.Error()})
				return
			}
			if err := ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, *entry.ToLocationID, ln.Qty, tu.AppUserID, "stock_entry", id, "transfer_in", reason); err != nil {
				response.ValidationSmart(w, map[string]string{"lines": err.Error()})
				return
			}
		}
		if err := moveStockEntryTracking(r.Context(), tx, tu.TenantID, id, tu.AppUserID, transitID, *entry.ToLocationID); err != nil {
			response.ValidationSmart(w, map[string]string{"lines": err.Error()})
			return
		}
		tag, err := tx.Exec(r.Context(), `
			update public.inv_stock_entries
			set status = 'received',
			    posted_at = coalesce(posted_at, now()),
			    received_by_user_id = $3, received_at = now(),
			    updated_at = now()
			where id = $1 and tenant_id = $2 and status = 'in_transit'`, id, tu.TenantID, tu.AppUserID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusConflict, "Could not receive transfer.", "ERR_CONFLICT")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to receive transfer.", "ERR_INTERNAL")
			return
		}
		notifyTransferParties(r.Context(), pool, tu.TenantID, tu.AppUserID, id, entry.ToLocationID, entry.EntryNo,
			"Transfer received", "Destination confirmed receipt of a location transfer.")
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.transfer.receive", "inv_stock_entry", &id, nil, nil)
		out, _ := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		response.OK(w, out, "Transfer received.")
	}
}

func cancelTransfer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !branchiso.CanOperateTransfer(tu) {
			response.Err(w, http.StatusForbidden, "Only store admins and owners can cancel transfers.", "ERR_FORBIDDEN")
			return
		}
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		entry, err := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		if err != nil || entry.EntryType != "transfer" {
			response.Err(w, http.StatusNotFound, "Transfer not found.", "ERR_NOT_FOUND")
			return
		}
		switch entry.Status {
		case "draft", "pending_approval", "approved":
		default:
			response.Validation(w, map[string]string{"status": "In-transit or completed transfers cannot be cancelled here."})
			return
		}
		_, err = pool.Exec(r.Context(), `
			update public.inv_stock_entries
			set status = 'cancelled', updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to cancel.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.transfer.cancel", "inv_stock_entry", &id, nil, nil)
		out, _ := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		response.OK(w, out, "Transfer cancelled.")
	}
}

func notifyTransferParties(ctx context.Context, pool *pgxpool.Pool, tenantID, actorUserID, entryID int64, toLocationID *int64, label, title, body string) {
	if label == "" {
		label = fmt.Sprintf("Transfer #%d", entryID)
	}
	fullBody := body + " " + label
	var destID int64
	if toLocationID != nil {
		destID = *toLocationID
	}
	rows, err := pool.Query(ctx, `
		select distinct u.id
		from public.users u
		where u.tenant_id = $1 and u.status = 'active' and u.id <> $2
		  and (
		    u.tenant_role in ('store_admin', 'owner', 'store_owner')
		    or u.id = (select owner_user_id from public.tenants where id = $1)
		    or (
		      $3::bigint > 0
		      and (
		        u.home_location_id = $3
		        or exists (
		          select 1 from public.user_data_scopes s
		          where s.tenant_id = u.tenant_id and s.user_id = u.id
		            and s.scope_type in ('location', 'warehouse') and s.record_id = $3
		        )
		      )
		      and (
		        exists (
		          select 1 from public.tenant_user_roles tur
		          join public.tenant_role_permissions trp
		            on trp.tenant_id = tur.tenant_id and trp.role_code = tur.role_code
		          where tur.tenant_id = u.tenant_id and tur.user_id = u.id
		            and trp.permission_code = 'inventory.stock_transfer_receive'
		            and trp.access_level in ('write', 'submit', 'admin')
		        )
		        or exists (
		          select 1 from public.user_permission_overrides upo
		          where upo.tenant_id = u.tenant_id and upo.user_id = u.id
		            and upo.permission_code = 'inventory.stock_transfer_receive'
		            and upo.access_level in ('write', 'submit', 'admin')
		        )
		      )
		    )
		  )`, tenantID, actorUserID, destID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var userID int64
		if err := rows.Scan(&userID); err != nil || userID <= 0 {
			continue
		}
		dedupe := fmt.Sprintf("inv_transfer:%d:%d:%d:%d", tenantID, entryID, hashTitle(title), userID)
		_, _ = pool.Exec(ctx, `
			insert into public.crm_notifications
			  (tenant_id, user_id, severity, title, body, entity_type, entity_id, dedupe_key, actor_user_id, source)
			values ($1, $2, 'warning', $3, $4, $5, $6, $7, $8, 'system')
			on conflict (tenant_id, dedupe_key) do nothing`,
			tenantID, userID, title, fullBody, entityStockTransfer, entryID, dedupe, actorUserID)
	}
	_ = trySendTransferPush(ctx, pool, tenantID, entryID, title, fullBody)
}

func hashTitle(s string) int64 {
	var h int64
	for _, c := range s {
		h = h*31 + int64(c)
	}
	if h < 0 {
		h = -h
	}
	return h
}
