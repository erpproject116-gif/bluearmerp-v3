package console

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func (s *service) listTickets(w http.ResponseWriter, r *http.Request) {
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	args := []any{}
	where := "where 1=1"
	n := 1
	if status != "" {
		args = append(args, status)
		where += " and t.status = $" + strconv.Itoa(n)
		n++
	} else {
		where += " and t.status in ('open','in_progress','waiting')"
	}
	if q != "" {
		args = append(args, "%"+strings.ToLower(q)+"%")
		where += " and (lower(t.subject) like $" + strconv.Itoa(n) + " or lower(coalesce(t.ticket_no,'')) like $" + strconv.Itoa(n) + ")"
		n++
	}
	_ = n
	rows, err := s.pool.Query(r.Context(), `
		select t.id, t.tenant_id, t.ticket_no, t.subject, t.status, t.priority, t.created_at, t.updated_at,
		       pc.id as customer_id, coalesce(pc.company_name, pc.full_name, '') as customer_name,
		       tn.company_code
		from public.sup_support_tickets t
		join public.tenants tn on tn.id = t.tenant_id
		left join lateral (
		  select id, company_name, full_name
		  from public.platform_customers
		  where tenant_id = t.tenant_id
		  order by id
		  limit 1
		) pc on true
		`+where+`
		order by t.updated_at desc nulls last, t.created_at desc
		limit 100`, args...)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list tickets.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id, tenantID int64
		var ticketNo, subject, st, priority string
		var created, updated time.Time
		var customerID *int64
		var customerName, companyCode string
		if rows.Scan(&id, &tenantID, &ticketNo, &subject, &st, &priority, &created, &updated, &customerID, &customerName, &companyCode) != nil {
			continue
		}
		list = append(list, map[string]any{
			"id": id, "tenant_id": tenantID, "ticket_no": ticketNo, "subject": subject,
			"status": st, "priority": priority, "created_at": created, "updated_at": updated,
			"customer_id": customerID, "customer_name": customerName, "company_code": companyCode,
		})
	}
	response.OK(w, map[string]any{"tickets": list}, "OK")
}

func (s *service) customerTickets(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	c, err := s.resolveCustomer(r.Context(), id)
	if err != nil || c.TenantID == nil {
		response.Err(w, http.StatusNotFound, "Customer tenant not found.", "ERR_NOT_FOUND")
		return
	}
	rows, err := s.pool.Query(r.Context(), `
		select id, ticket_no, subject, status, priority, created_at, updated_at
		from public.sup_support_tickets
		where tenant_id = $1
		order by created_at desc
		limit 100`, *c.TenantID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list tickets.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var tid int64
		var ticketNo, subject, st, priority string
		var created, updated time.Time
		if rows.Scan(&tid, &ticketNo, &subject, &st, &priority, &created, &updated) != nil {
			continue
		}
		list = append(list, map[string]any{
			"id": tid, "ticket_no": ticketNo, "subject": subject, "status": st,
			"priority": priority, "created_at": created, "updated_at": updated,
		})
	}
	response.OK(w, map[string]any{"tickets": list, "tenant_id": *c.TenantID}, "OK")
}

func (s *service) getTicket(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	var tenantID int64
	var ticketNo, subject, status, priority, description, gapTag, gapNote string
	var created, updated time.Time
	err := s.pool.QueryRow(r.Context(), `
		select tenant_id, ticket_no, subject, status, priority, coalesce(description,''),
		       coalesce(product_gap_tag,''), coalesce(product_gap_note,''), created_at, updated_at
		from public.sup_support_tickets where id = $1`, id).
		Scan(&tenantID, &ticketNo, &subject, &status, &priority, &description, &gapTag, &gapNote, &created, &updated)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Ticket not found.", "ERR_NOT_FOUND")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load ticket.", "ERR_INTERNAL")
		return
	}
	var customerID *int64
	var customerName string
	_ = s.pool.QueryRow(r.Context(), `
		select id, coalesce(company_name, full_name, '') from public.platform_customers where tenant_id = $1 order by id limit 1`, tenantID).
		Scan(&customerID, &customerName)

	notes := []map[string]any{}
	nrows, err := s.pool.Query(r.Context(), `
		select id, author_email, author_name, body, created_at
		from public.platform_ticket_internal_notes
		where ticket_id = $1
		order by created_at desc
		limit 50`, id)
	if err == nil {
		defer nrows.Close()
		for nrows.Next() {
			var nid int64
			var email, name, body string
			var at time.Time
			if nrows.Scan(&nid, &email, &name, &body, &at) == nil {
				notes = append(notes, map[string]any{
					"id": nid, "author_email": email, "author_name": name, "body": body, "created_at": at,
				})
			}
		}
	}

	tu, _ := auth.FromContext(r.Context())
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.ticket.view", EventKind: "access",
		HTTPMethod: "GET", RoutePath: r.URL.Path,
		PlatformCustomerID: customerID, TenantID: &tenantID,
		TargetType: "sup_support_tickets", TargetID: &id,
		Summary: "Viewed ticket " + ticketNo,
	})

	response.OK(w, map[string]any{
		"id": id, "tenant_id": tenantID, "ticket_no": ticketNo, "subject": subject,
		"status": status, "priority": priority, "description": description,
		"product_gap_tag": gapTag, "product_gap_note": gapNote,
		"created_at": created, "updated_at": updated,
		"customer_id": customerID, "customer_name": customerName,
		"internal_notes": notes,
	}, "OK")
}

func (s *service) addTicketInternalNote(w http.ResponseWriter, r *http.Request) {
	tu, _ := auth.FromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	var body struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Body) == "" {
		response.Validation(w, map[string]string{"body": "Note is required."})
		return
	}
	var tenantID int64
	if err := s.pool.QueryRow(r.Context(), `select tenant_id from public.sup_support_tickets where id = $1`, id).Scan(&tenantID); err != nil {
		response.Err(w, http.StatusNotFound, "Ticket not found.", "ERR_NOT_FOUND")
		return
	}
	var noteID int64
	err := s.pool.QueryRow(r.Context(), `
		insert into public.platform_ticket_internal_notes (
		  tenant_id, ticket_id, platform_user_id, author_email, author_name, body
		) values ($1,$2,$3,$4,$5,$6) returning id`,
		tenantID, id, nullIfZero(tu.PlatformUserID), tu.Email, tu.FullName, strings.TrimSpace(body.Body),
	).Scan(&noteID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to save note.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{"id": noteID}, "Saved.")
}

func (s *service) patchTicket(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	var body struct {
		Status         *string `json:"status"`
		Priority       *string `json:"priority"`
		ProductGapTag  *string `json:"product_gap_tag"`
		ProductGapNote *string `json:"product_gap_note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	sets := []string{"updated_at = now()"}
	args := []any{}
	n := 1
	if body.Status != nil {
		args = append(args, strings.TrimSpace(*body.Status))
		sets = append(sets, "status = $"+strconv.Itoa(n))
		n++
	}
	if body.Priority != nil {
		args = append(args, strings.TrimSpace(*body.Priority))
		sets = append(sets, "priority = $"+strconv.Itoa(n))
		n++
	}
	if body.ProductGapTag != nil {
		args = append(args, strings.TrimSpace(*body.ProductGapTag))
		sets = append(sets, "product_gap_tag = $"+strconv.Itoa(n))
		n++
	}
	if body.ProductGapNote != nil {
		args = append(args, strings.TrimSpace(*body.ProductGapNote))
		sets = append(sets, "product_gap_note = $"+strconv.Itoa(n))
		n++
	}
	if len(args) == 0 {
		response.Validation(w, map[string]string{"body": "No changes."})
		return
	}
	args = append(args, id)
	_, err := s.pool.Exec(r.Context(),
		`update public.sup_support_tickets set `+strings.Join(sets, ", ")+` where id = $`+strconv.Itoa(n),
		args...)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to update ticket.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{"id": id}, "Updated.")
}

func nullIfZero(v int64) any {
	if v <= 0 {
		return nil
	}
	return v
}
