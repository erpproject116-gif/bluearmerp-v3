package support

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ticketExportRow struct {
	TicketNo      string
	TicketDate    string
	Subject       string
	Description   string
	PartnerName   string
	Category      string
	Priority      string
	Status        string
	AssignedName  string
	CreatedByName string
	ResolvedAt    string
	Comments      string
}

// exportTickets downloads all visible tickets with title (subject) and full body (description + comments).
// Query: format=csv|md (default csv), optional q/status filters (same as list).
func exportTickets(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
		if format == "" {
			format = "csv"
		}
		if format != "csv" && format != "md" && format != "markdown" {
			response.Validation(w, map[string]string{"format": "Use format=csv or format=md."})
			return
		}
		if format == "markdown" {
			format = "md"
		}

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
		}
		if !tu.CanManageAllSupportTickets() {
			where += fmt.Sprintf(" and t.created_by_user_id = $%d", n)
			args = append(args, tu.AppUserID)
			n++
		}
		_ = n

		q := fmt.Sprintf(`
			select t.id, t.ticket_no, t.ticket_date::text, t.subject, coalesce(t.description, ''),
			  coalesce(p.company_name, ''), t.category, t.priority, t.status,
			  coalesce(au.full_name, ''), coalesce(cu.full_name, ''), coalesce(t.resolved_at::text, '')
			from public.sup_support_tickets t
			left join public.inv_partners p on p.id = t.partner_id
			left join public.users au on au.id = t.assigned_user_id
			left join public.users cu on cu.id = t.created_by_user_id
			where %s
			order by t.ticket_date desc, t.id desc
			limit %d`, where, reports.ExportMaxRows)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export tickets.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []ticketExportRow
		var ids []int64
		idIndex := map[int64]int{}
		for rows.Next() {
			var id int64
			var row ticketExportRow
			if err := rows.Scan(
				&id, &row.TicketNo, &row.TicketDate, &row.Subject, &row.Description,
				&row.PartnerName, &row.Category, &row.Priority, &row.Status,
				&row.AssignedName, &row.CreatedByName, &row.ResolvedAt,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read ticket for export.", "ERR_INTERNAL")
				return
			}
			idIndex[id] = len(out)
			ids = append(ids, id)
			out = append(out, row)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export tickets.", "ERR_INTERNAL")
			return
		}

		if len(ids) > 0 {
			crows, err := pool.Query(r.Context(), `
				select ticket_id, coalesce(author_name, ''), body, created_at::text
				from public.sup_support_ticket_comments
				where ticket_id = any($1)
				order by ticket_id, created_at`, ids)
			if err == nil {
				defer crows.Close()
				byID := map[int64][]string{}
				for crows.Next() {
					var tid int64
					var author, body, at string
					if crows.Scan(&tid, &author, &body, &at) != nil {
						continue
					}
					line := fmt.Sprintf("[%s] %s: %s", at, author, body)
					byID[tid] = append(byID[tid], line)
				}
				for tid, lines := range byID {
					if i, ok := idIndex[tid]; ok {
						out[i].Comments = strings.Join(lines, "\n---\n")
					}
				}
			}
		}

		stamp := time.Now().UTC().Format("20060102")
		if format == "md" {
			writeTicketsMarkdown(w, out, stamp)
			return
		}
		writeTicketsCSV(w, out, stamp)
	}
}

func writeTicketsCSV(w http.ResponseWriter, rows []ticketExportRow, stamp string) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="support-tickets-%s.csv"`, stamp))
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{
		"ticket_no", "ticket_date", "title", "body", "customer", "category", "priority", "status",
		"assigned", "created_by", "resolved_at", "comments",
	})
	for _, row := range rows {
		_ = cw.Write([]string{
			row.TicketNo, row.TicketDate, row.Subject, row.Description, row.PartnerName,
			row.Category, row.Priority, row.Status, row.AssignedName, row.CreatedByName,
			row.ResolvedAt, row.Comments,
		})
	}
	cw.Flush()
}

func writeTicketsMarkdown(w http.ResponseWriter, rows []ticketExportRow, stamp string) {
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="support-tickets-%s.md"`, stamp))
	var b strings.Builder
	b.WriteString("# Support tickets export\n\n")
	b.WriteString(fmt.Sprintf("Exported %s UTC · %d ticket(s)\n\n", stamp, len(rows)))
	for _, row := range rows {
		b.WriteString("---\n\n")
		b.WriteString(fmt.Sprintf("## %s — %s\n\n", row.TicketNo, escapeMDHeading(row.Subject)))
		b.WriteString(fmt.Sprintf("- **Date:** %s\n", row.TicketDate))
		b.WriteString(fmt.Sprintf("- **Status:** %s · **Priority:** %s · **Category:** %s\n", row.Status, row.Priority, row.Category))
		if row.PartnerName != "" {
			b.WriteString(fmt.Sprintf("- **Customer:** %s\n", row.PartnerName))
		}
		if row.AssignedName != "" {
			b.WriteString(fmt.Sprintf("- **Assigned:** %s\n", row.AssignedName))
		}
		if row.CreatedByName != "" {
			b.WriteString(fmt.Sprintf("- **Created by:** %s\n", row.CreatedByName))
		}
		if row.ResolvedAt != "" {
			b.WriteString(fmt.Sprintf("- **Resolved at:** %s\n", row.ResolvedAt))
		}
		b.WriteString("\n### Body\n\n")
		if strings.TrimSpace(row.Description) == "" {
			b.WriteString("_(empty)_\n\n")
		} else {
			b.WriteString(row.Description)
			b.WriteString("\n\n")
		}
		if strings.TrimSpace(row.Comments) != "" {
			b.WriteString("### Comments\n\n")
			b.WriteString(row.Comments)
			b.WriteString("\n\n")
		}
	}
	_, _ = w.Write([]byte(b.String()))
}

func escapeMDHeading(s string) string {
	return strings.ReplaceAll(strings.TrimSpace(s), "\n", " ")
}
