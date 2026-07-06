package setupreadiness

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
)

const minCOAAccounts = 10

type StepDef struct {
	ID       string
	Label    string
	Href     string
	Required bool
}

var WizardSteps = []StepDef{
	{ID: "company", Label: "Set your company name and logo", Href: "/app/setup/company", Required: true},
	{ID: "chart_of_accounts", Label: "Review your chart of accounts", Href: "/app/setup/chart-of-accounts", Required: true},
	{ID: "currency_tax", Label: "Confirm currency and tax types", Href: "/app/setup/currency-tax", Required: true},
	{ID: "location", Label: "Add your first stock location", Href: "/app/setup/location", Required: true},
	{ID: "partners", Label: "Add a customer or supplier", Href: "/app/setup/partners", Required: true},
	{ID: "items", Label: "Add your first product", Href: "/app/setup/items", Required: true},
	{ID: "team", Label: "Invite your team", Href: "/app/setup/team", Required: false},
	{ID: "ready", Label: "You are ready", Href: "/app/setup/ready", Required: false},
}

type Step struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Href     string `json:"href"`
	Done     bool   `json:"done"`
	Required bool   `json:"required"`
}

type NextStep struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Href  string `json:"href"`
}

type Payload struct {
	Percent          int       `json:"percent"`
	Ready            bool      `json:"ready"`
	RequiredComplete bool      `json:"required_complete"`
	Steps            []Step    `json:"steps"`
	NextStep         *NextStep `json:"next_step,omitempty"`
	BlockingReason   string    `json:"blocking_reason,omitempty"`
}

type progressStore struct {
	ChartOfAccountsAck bool `json:"chart_of_accounts_ack"`
	RemindLaterAt      string `json:"remind_later_at,omitempty"`
}

func Load(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (Payload, error) {
	store := loadProgress(ctx, pool, tenantID)
	detected, err := detect(ctx, pool, tenantID, store)
	if err != nil {
		return Payload{}, err
	}

	steps := make([]Step, 0, len(WizardSteps))
	requiredDone := 0
	requiredTotal := 0
	doneCount := 0
	var next *NextStep

	for _, def := range WizardSteps {
		isDone := detected[def.ID]
		if def.Required {
			requiredTotal++
			if isDone {
				requiredDone++
			}
		}
		if isDone {
			doneCount++
		} else if next == nil && def.ID != "ready" {
			next = &NextStep{ID: def.ID, Label: def.Label, Href: def.Href}
		}
		steps = append(steps, Step{
			ID: def.ID, Label: def.Label, Href: def.Href, Done: isDone, Required: def.Required,
		})
	}

	pct := 0
	if len(WizardSteps) > 0 {
		pct = (doneCount * 100) / len(WizardSteps)
	}
	requiredComplete := requiredDone == requiredTotal
	ready := requiredComplete

	var blocking string
	if !requiredComplete && next != nil {
		blocking = blockingMessage(next.ID)
	}

	return Payload{
		Percent:          pct,
		Ready:            ready,
		RequiredComplete: requiredComplete,
		Steps:            steps,
		NextStep:         next,
		BlockingReason:   blocking,
	}, nil
}

func IsReady(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (bool, error) {
	p, err := Load(ctx, pool, tenantID)
	if err != nil {
		return false, err
	}
	return p.RequiredComplete, nil
}

func AckChartOfAccounts(ctx context.Context, pool *pgxpool.Pool, tenantID int64) error {
	blob, _ := json.Marshal(map[string]any{"chart_of_accounts_ack": true})
	_, err := pool.Exec(ctx, `
		update public.platform_customers
		set onboarding_progress = coalesce(onboarding_progress, '{}'::jsonb) || $2::jsonb,
		    updated_at = now()
		where tenant_id = $1`, tenantID, string(blob))
	return err
}

func loadProgress(ctx context.Context, pool *pgxpool.Pool, tenantID int64) progressStore {
	var raw []byte
	_ = pool.QueryRow(ctx, `
		select coalesce(onboarding_progress, '{}'::jsonb)
		from public.platform_customers where tenant_id = $1 limit 1`, tenantID).Scan(&raw)
	var store progressStore
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &store)
	}
	return store
}

func detect(ctx context.Context, pool *pgxpool.Pool, tenantID int64, store progressStore) (map[string]bool, error) {
	out := make(map[string]bool)

	var companyName string
	_ = pool.QueryRow(ctx, `select coalesce(company_name, '') from public.tenants where id = $1`, tenantID).Scan(&companyName)
	var brandingName string
	_ = pool.QueryRow(ctx, `
		select coalesce(settings->'receipt'->>'company_name', '')
		from public.tenant_branding where tenant_id = $1`, tenantID).Scan(&brandingName)
	out["company"] = companyName != "" || brandingName != ""

	var coaCount int
	_ = pool.QueryRow(ctx, `
		select count(*)::int from public.fin_accounts
		where tenant_id = $1 and deleted_at is null`, tenantID).Scan(&coaCount)
	out["chart_of_accounts"] = coaCount >= minCOAAccounts && store.ChartOfAccountsAck

	var currencies int
	_ = pool.QueryRow(ctx, `
		select count(*)::int from public.quo_currencies
		where tenant_id = $1 and is_default = true and status = 'active'`, tenantID).Scan(&currencies)
	var taxes int
	_ = pool.QueryRow(ctx, `
		select count(*)::int from public.quo_tax_types
		where tenant_id = $1 and status = 'active'`, tenantID).Scan(&taxes)
	out["currency_tax"] = currencies >= 1 && taxes >= 1

	var locations int
	_ = pool.QueryRow(ctx, `
		select count(*)::int from public.inv_locations
		where tenant_id = $1 and deleted_at is null`, tenantID).Scan(&locations)
	out["location"] = locations >= 1

	var partners int
	_ = pool.QueryRow(ctx, `
		select count(*)::int from public.inv_partners
		where tenant_id = $1 and deleted_at is null`, tenantID).Scan(&partners)
	out["partners"] = partners >= 1

	var items int
	_ = pool.QueryRow(ctx, `
		select count(*)::int from public.inv_items
		where tenant_id = $1 and deleted_at is null`, tenantID).Scan(&items)
	out["items"] = items >= 1

	var users int
	_ = pool.QueryRow(ctx, `
		select count(*)::int from public.users
		where tenant_id = $1 and status = 'active'`, tenantID).Scan(&users)
	out["team"] = users > 1

	requiredDone := out["company"] && out["chart_of_accounts"] && out["currency_tax"] &&
		out["location"] && out["partners"] && out["items"]
	out["ready"] = requiredDone

	return out, nil
}

func blockingMessage(stepID string) string {
	switch stepID {
	case "company":
		return "Set your company name before creating transactions."
	case "chart_of_accounts":
		return "Review your chart of accounts before creating transactions."
	case "currency_tax":
		return "Configure currency and tax types before creating transactions."
	case "location":
		return "Add at least one stock location before creating transactions."
	case "partners":
		return "Add at least one customer or supplier before creating transactions."
	case "items":
		return "Add at least one product before creating transactions."
	default:
		return "Complete workspace setup before creating transactions."
	}
}
