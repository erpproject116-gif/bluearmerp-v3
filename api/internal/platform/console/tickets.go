package console

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
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
	page, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("page")))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("page_size")))
	if pageSize < 1 {
		pageSize = 50
	}
	if pageSize > 200 {
		pageSize = 200
	}
	offset := (page - 1) * pageSize

	args := []any{}
	where := "where 1=1"
	n := 1
	if status == "all" {
		// no status filter
	} else if status != "" {
		args = append(args, status)
		where += " and t.status = $" + strconv.Itoa(n)
		n++
	} else {
		where += " and t.status in ('open','in_progress','waiting')"
	}
	if q != "" {
		args = append(args, "%"+strings.ToLower(q)+"%")
		where += " and (lower(t.subject) like $" + strconv.Itoa(n) + " or lower(coalesce(t.ticket_no,'')) like $" + strconv.Itoa(n) +
			" or lower(coalesce(p.company_name,'')) like $" + strconv.Itoa(n) + ")"
		n++
	}

	var total int64
	countArgs := append([]any{}, args...)
	if err := s.pool.QueryRow(r.Context(), `
		select count(*) from public.sup_support_tickets t
		join public.tenants tn on tn.id = t.tenant_id
		left join public.inv_partners p on p.id = t.partner_id and p.tenant_id = t.tenant_id
		`+where, countArgs...).Scan(&total); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list tickets.", "ERR_INTERNAL")
		return
	}

	args = append(args, pageSize, offset)
	limitParam := "$" + strconv.Itoa(n)
	offsetParam := "$" + strconv.Itoa(n+1)
	rows, err := s.pool.Query(r.Context(), `
		select t.id, t.tenant_id, t.ticket_no, t.subject, t.status, t.priority, t.created_at, t.updated_at,
		       pc.id as customer_id, coalesce(pc.company_name, pc.full_name, '') as customer_name,
		       tn.company_code, coalesce(tn.company_name, '') as tenant_name,
		       coalesce(p.company_name, '') as partner_name
		from public.sup_support_tickets t
		join public.tenants tn on tn.id = t.tenant_id
		left join public.inv_partners p on p.id = t.partner_id and p.tenant_id = t.tenant_id
		left join lateral (
		  select id, company_name, full_name
		  from public.platform_customers
		  where tenant_id = t.tenant_id
		  order by id
		  limit 1
		) pc on true
		`+where+`
		order by t.updated_at desc nulls last, t.created_at desc
		limit `+limitParam+` offset `+offsetParam, args...)
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
		var customerName, companyCode, tenantName, partnerName string
		if rows.Scan(&id, &tenantID, &ticketNo, &subject, &st, &priority, &created, &updated, &customerID, &customerName, &companyCode, &tenantName, &partnerName) != nil {
			continue
		}
		list = append(list, map[string]any{
			"id": id, "tenant_id": tenantID, "ticket_no": ticketNo, "subject": subject,
			"status": st, "priority": priority, "created_at": created, "updated_at": updated,
			"customer_id": customerID, "customer_name": customerName, "company_code": companyCode,
			"tenant_name": tenantName, "partner_name": partnerName,
		})
	}
	response.OK(w, map[string]any{
		"tickets": list,
		"page":    page,
		"page_size": pageSize,
		"total":   total,
	}, "OK")
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
	var companyCode, tenantName, partnerName string
	var created, updated time.Time
	err := s.pool.QueryRow(r.Context(), `
		select t.tenant_id, t.ticket_no, t.subject, t.status, t.priority, coalesce(t.description,''),
		       coalesce(t.product_gap_tag,''), coalesce(t.product_gap_note,''), t.created_at, t.updated_at,
		       tn.company_code, coalesce(tn.company_name, ''), coalesce(p.company_name, '')
		from public.sup_support_tickets t
		join public.tenants tn on tn.id = t.tenant_id
		left join public.inv_partners p on p.id = t.partner_id and p.tenant_id = t.tenant_id
		where t.id = $1`, id).
		Scan(&tenantID, &ticketNo, &subject, &status, &priority, &description, &gapTag, &gapNote, &created, &updated,
			&companyCode, &tenantName, &partnerName)
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

	comments := []map[string]any{}
	crows, cerr := s.pool.Query(r.Context(), `
		select id, user_id, author_name, body, created_at
		from public.sup_support_ticket_comments
		where ticket_id = $1
		order by created_at`, id)
	if cerr == nil {
		defer crows.Close()
		for crows.Next() {
			var cid int64
			var userID *int64
			var name, body string
			var at time.Time
			if crows.Scan(&cid, &userID, &name, &body, &at) == nil {
				comments = append(comments, map[string]any{
					"id": cid, "user_id": userID, "author_name": name, "body": body, "created_at": at,
				})
			}
		}
	}

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
		"company_code": companyCode, "tenant_name": tenantName, "partner_name": partnerName,
		"comments": comments,
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

// exportTickets downloads all matching tickets with title (subject) and full body for documentation.
// Query: format=csv|md, optional status/q. Default status filter matches list (open/in_progress/waiting) unless status=all.
func (s *service) exportTickets(w http.ResponseWriter, r *http.Request) {
	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = "csv"
	}
	if format == "markdown" {
		format = "md"
	}
	if format != "csv" && format != "md" {
		response.Validation(w, map[string]string{"format": "Use format=csv or format=md."})
		return
	}

	status := strings.TrimSpace(r.URL.Query().Get("status"))
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	args := []any{}
	where := "where 1=1"
	n := 1
	if status == "all" {
		// no status filter
	} else if status != "" {
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
		select t.id, t.ticket_no, t.subject, coalesce(t.description,''), t.status, t.priority,
		       coalesce(t.category,''), tn.company_code, coalesce(pc.company_name, pc.full_name, ''),
		       t.created_at::text, t.updated_at::text,
		       coalesce(t.product_gap_tag,''), coalesce(t.product_gap_note,'')
		from public.sup_support_tickets t
		join public.tenants tn on tn.id = t.tenant_id
		left join lateral (
		  select company_name, full_name
		  from public.platform_customers
		  where tenant_id = t.tenant_id
		  order by id
		  limit 1
		) pc on true
		`+where+`
		order by t.updated_at desc nulls last, t.created_at desc
		limit 5000`, args...)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to export tickets.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()

	type row struct {
		ID, TicketNo, Subject, Body, Status, Priority, Category, CompanyCode, Customer string
		Created, Updated, GapTag, GapNote                                              string
		Comments, Notes                                                                string
	}
	var out []row
	var ids []int64
	idx := map[int64]int{}
	for rows.Next() {
		var id int64
		var rrow row
		if rows.Scan(
			&id, &rrow.TicketNo, &rrow.Subject, &rrow.Body, &rrow.Status, &rrow.Priority,
			&rrow.Category, &rrow.CompanyCode, &rrow.Customer, &rrow.Created, &rrow.Updated,
			&rrow.GapTag, &rrow.GapNote,
		) != nil {
			continue
		}
		rrow.ID = strconv.FormatInt(id, 10)
		idx[id] = len(out)
		ids = append(ids, id)
		out = append(out, rrow)
	}

	if len(ids) > 0 {
		if crows, err := s.pool.Query(r.Context(), `
			select ticket_id, coalesce(author_name,''), body, created_at::text
			from public.sup_support_ticket_comments
			where ticket_id = any($1)
			order by ticket_id, created_at`, ids); err == nil {
			defer crows.Close()
			by := map[int64][]string{}
			for crows.Next() {
				var tid int64
				var author, body, at string
				if crows.Scan(&tid, &author, &body, &at) != nil {
					continue
				}
				by[tid] = append(by[tid], fmt.Sprintf("[%s] %s: %s", at, author, body))
			}
			for tid, lines := range by {
				if i, ok := idx[tid]; ok {
					out[i].Comments = strings.Join(lines, "\n---\n")
				}
			}
		}
		if nrows, err := s.pool.Query(r.Context(), `
			select ticket_id, coalesce(author_name,''), body, created_at::text
			from public.platform_ticket_internal_notes
			where ticket_id = any($1)
			order by ticket_id, created_at`, ids); err == nil {
			defer nrows.Close()
			by := map[int64][]string{}
			for nrows.Next() {
				var tid int64
				var author, body, at string
				if nrows.Scan(&tid, &author, &body, &at) != nil {
					continue
				}
				by[tid] = append(by[tid], fmt.Sprintf("[%s] %s: %s", at, author, body))
			}
			for tid, lines := range by {
				if i, ok := idx[tid]; ok {
					out[i].Notes = strings.Join(lines, "\n---\n")
				}
			}
		}
	}

	stamp := time.Now().UTC().Format("20060102")
	if format == "md" {
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="platform-tickets-%s.md"`, stamp))
		var b strings.Builder
		b.WriteString("# Platform support tickets export\n\n")
		b.WriteString(fmt.Sprintf("Exported %s UTC · %d ticket(s)\n\n", stamp, len(out)))
		for _, rrow := range out {
			b.WriteString("---\n\n")
			b.WriteString(fmt.Sprintf("## %s — %s\n\n", rrow.TicketNo, strings.ReplaceAll(rrow.Subject, "\n", " ")))
			b.WriteString(fmt.Sprintf("- **Tenant:** %s\n", rrow.CompanyCode))
			if rrow.Customer != "" {
				b.WriteString(fmt.Sprintf("- **Customer:** %s\n", rrow.Customer))
			}
			b.WriteString(fmt.Sprintf("- **Status:** %s · **Priority:** %s · **Category:** %s\n", rrow.Status, rrow.Priority, rrow.Category))
			b.WriteString(fmt.Sprintf("- **Created:** %s · **Updated:** %s\n", rrow.Created, rrow.Updated))
			if rrow.GapTag != "" || rrow.GapNote != "" {
				b.WriteString(fmt.Sprintf("- **Product gap:** %s — %s\n", rrow.GapTag, rrow.GapNote))
			}
			b.WriteString("\n### Body\n\n")
			if strings.TrimSpace(rrow.Body) == "" {
				b.WriteString("_(empty)_\n\n")
			} else {
				b.WriteString(rrow.Body)
				b.WriteString("\n\n")
			}
			if strings.TrimSpace(rrow.Comments) != "" {
				b.WriteString("### Comments\n\n")
				b.WriteString(rrow.Comments)
				b.WriteString("\n\n")
			}
			if strings.TrimSpace(rrow.Notes) != "" {
				b.WriteString("### Internal notes\n\n")
				b.WriteString(rrow.Notes)
				b.WriteString("\n\n")
			}
		}
		_, _ = w.Write([]byte(b.String()))
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="platform-tickets-%s.csv"`, stamp))
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{
		"ticket_no", "title", "body", "company_code", "customer", "status", "priority", "category",
		"created_at", "updated_at", "product_gap_tag", "product_gap_note", "comments", "internal_notes",
	})
	for _, rrow := range out {
		_ = cw.Write([]string{
			rrow.TicketNo, rrow.Subject, rrow.Body, rrow.CompanyCode, rrow.Customer,
			rrow.Status, rrow.Priority, rrow.Category, rrow.Created, rrow.Updated,
			rrow.GapTag, rrow.GapNote, rrow.Comments, rrow.Notes,
		})
	}
	cw.Flush()
}
