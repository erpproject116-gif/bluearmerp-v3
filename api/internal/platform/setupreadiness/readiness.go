package setupreadiness

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ttlcache"
)

// One active account per core type (asset, liability, income, expense).
const minCOAAccounts = 4
const minCOATypes = 4

type StepDef struct {
	ID       string
	Label    string
	Href     string
	Required bool
}

var WizardSteps = []StepDef{
	{ID: "company", Label: "Business name and logo", Href: "/app/setup/company", Required: true},
	{ID: "chart_of_accounts", Label: "List of money accounts", Href: "/app/setup/chart-of-accounts", Required: true},
	{ID: "currency_tax", Label: "Peso and sales tax", Href: "/app/setup/currency-tax", Required: true},
	{ID: "process_policies", Label: "The order you use for selling and buying", Href: "/app/setup/process-policies", Required: true},
	{ID: "location", Label: "Where you keep products", Href: "/app/setup/location", Required: true},
	{ID: "partners", Label: "A person or company you sell to or buy from", Href: "/app/setup/partners", Required: true},
	{ID: "items", Label: "Something you sell", Href: "/app/setup/items", Required: true},
	{ID: "team", Label: "Invite your team", Href: "/app/setup/team", Required: false},
	{ID: "first_sale", Label: "Create your first invoice", Href: "/app/sales/sales/new", Required: false},
	{ID: "bank", Label: "Add a bank or cash account", Href: "/app/finance/banking", Required: false},
	{ID: "ready", Label: "The workspace is ready", Href: "/app/setup/ready", Required: false},
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
	Percent              int       `json:"percent"`
	Ready                bool      `json:"ready"`
	RequiredComplete     bool      `json:"required_complete"`
	Steps                []Step    `json:"steps"`
	NextStep             *NextStep `json:"next_step,omitempty"`
	BlockingReason       string    `json:"blocking_reason,omitempty"`
	ShowSetupBanner      bool      `json:"show_setup_banner"`
	ShowBreadcrumbHint   bool      `json:"show_breadcrumb_hint"`
	SetupWizardSkipped   bool      `json:"setup_wizard_skipped"`
}

type progressStore struct {
	ChartOfAccountsAck bool   `json:"chart_of_accounts_ack"`
	CompanyAck         bool   `json:"company_ack"`
	CurrencyTaxAck     bool   `json:"currency_tax_ack"`
	LocationAck        bool   `json:"location_ack"`
	ProcessPoliciesAck bool   `json:"process_policies_ack"`
	RemindLaterAt      string `json:"remind_later_at,omitempty"`
}

var foundationAckKeys = map[string]string{
	"company":           "company_ack",
	"currency_tax":      "currency_tax_ack",
	"location":          "location_ack",
	"process_policies":  "process_policies_ack",
	"chart_of_accounts": "chart_of_accounts_ack",
}

// SETUP_READY_CACHE_TTL_SECONDS=0 disables the cache and restores full detection per request.
var readyCache = ttlcache.New[bool]("SETUP_READY_CACHE_TTL_SECONDS", 15, 10000)

// InvalidateTenant forces the next readiness check to re-detect.
func InvalidateTenant(tenantID int64) {
	readyCache.Invalidate(strconv.FormatInt(tenantID, 10))
}

// cachedReady reports whether detection can be skipped. Only a cached "ready"
// counts; a cached "not ready" never short-circuits.
func cachedReady(tenantID int64) bool {
	ready, ok := readyCache.Get(strconv.FormatInt(tenantID, 10))
	return ok && ready
}

// ResetCache clears every cached tenant (tests).
func ResetCache() { readyCache.Reset() }

func Load(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (Payload, error) {
	store := loadProgress(ctx, pool, tenantID)
	detected, err := detect(ctx, pool, tenantID, store)
	if err != nil {
		return Payload{}, err
	}

	steps := make([]Step, 0, len(WizardSteps))
	requiredDone := 0
	requiredTotal := 0
	var next *NextStep

	for _, def := range WizardSteps {
		isDone := detected[def.ID]
		if def.Required {
			requiredTotal++
			if isDone {
				requiredDone++
			}
		}
		if !isDone && next == nil && def.ID != "ready" && def.ID != "first_sale" && def.ID != "bank" && def.ID != "team" {
			next = &NextStep{ID: def.ID, Label: def.Label, Href: def.Href}
		}
		steps = append(steps, Step{
			ID: def.ID, Label: def.Label, Href: def.Href, Done: isDone, Required: def.Required,
		})
	}

	pct := 0
	if requiredTotal > 0 {
		pct = (requiredDone * 100) / requiredTotal
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

func LoadForUser(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser) (Payload, error) {
	p, err := Load(ctx, pool, tu.TenantID)
	if err != nil {
		return p, err
	}
	canManage := tu.IsTenantOwner || tu.TenantRole == "store_admin" || tu.IsPlatformSuperadmin
	userState, err := loadUserReminderState(ctx, pool, tu.AppUserID)
	if err != nil {
		return p, err
	}
	now := time.Now()
	p.ShowSetupBanner = showSetupBanner(p.RequiredComplete, canManage, userState, now)
	p.ShowBreadcrumbHint = showBreadcrumbHint(p.RequiredComplete, canManage, userState, now)
	p.SetupWizardSkipped = userState.SkippedAt != nil
	return p, nil
}

// IsReady is the gate consulted before every blocked mutation. Load() fans out
// across a dozen foundation tables, so the answer is cached briefly per tenant.
// Only "ready" is cached: an incomplete workspace keeps re-detecting so finishing
// setup unblocks the very next request instead of after the TTL.
func IsReady(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (bool, error) {
	if cachedReady(tenantID) {
		return true, nil
	}
	p, err := Load(ctx, pool, tenantID)
	if err != nil {
		return false, err
	}
	if p.RequiredComplete {
		readyCache.Set(strconv.FormatInt(tenantID, 10), true)
	}
	return p.RequiredComplete, nil
}

func AckChartOfAccounts(ctx context.Context, pool *pgxpool.Pool, tenantID int64) error {
	return AckFoundationStep(ctx, pool, tenantID, "chart_of_accounts")
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

	coaReady, err := financedefaults.HasMinimumCoreAccounts(ctx, pool, tenantID, minCOAAccounts, minCOATypes)
	if err != nil {
		return nil, err
	}
	out["chart_of_accounts"] = coaReady

	var currencies int
	_ = pool.QueryRow(ctx, `
		select count(*)::int from public.quo_currencies
		where tenant_id = $1 and is_default = true and status = 'active'`, tenantID).Scan(&currencies)
	var taxes int
	_ = pool.QueryRow(ctx, `
		select count(*)::int from public.quo_tax_types
		where tenant_id = $1 and status = 'active'`, tenantID).Scan(&taxes)
	out["currency_tax"] = currencies >= 1 && taxes >= 1

	out["process_policies"] = store.ProcessPoliciesAck

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

	var sales int
	_ = pool.QueryRow(ctx, `
		select count(*)::int from public.sa_sales
		where tenant_id = $1 and deleted_at is null`, tenantID).Scan(&sales)
	out["first_sale"] = sales >= 1

	var banks int
	_ = pool.QueryRow(ctx, `
		select count(*)::int from public.fin_bank_accounts
		where tenant_id = $1 and is_active = true`, tenantID).Scan(&banks)
	out["bank"] = banks >= 1

	requiredDone := out["company"] && out["chart_of_accounts"] && out["currency_tax"] &&
		out["process_policies"] && out["location"] && out["partners"] && out["items"]
	out["ready"] = requiredDone

	return out, nil
}

func mergeOnboardingProgress(ctx context.Context, pool *pgxpool.Pool, tenantID int64, patch map[string]any) error {
	blob, err := json.Marshal(patch)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `
		update public.platform_customers
		set onboarding_progress = coalesce(onboarding_progress, '{}'::jsonb) || $2::jsonb,
		    updated_at = now()
		where tenant_id = $1`, tenantID, string(blob))
	return err
}

func AckFoundationStep(ctx context.Context, pool *pgxpool.Pool, tenantID int64, stepID string) error {
	key, ok := foundationAckKeys[stepID]
	if !ok {
		return fmt.Errorf("unknown foundation step: %s", stepID)
	}
	err := mergeOnboardingProgress(ctx, pool, tenantID, map[string]any{key: true})
	if err == nil {
		InvalidateTenant(tenantID)
	}
	return err
}

func blockingMessage(stepID string) string {
	switch stepID {
	case "company":
		return "Add your business name before you continue."
	case "chart_of_accounts":
		return "Add your list of money accounts before you continue."
	case "currency_tax":
		return "Set the peso and a sales tax before you continue."
	case "process_policies":
		return "Look at the order you use for selling and buying, then say it looks right."
	case "location":
		return "Add the place where you keep products before you continue."
	case "partners":
		return "Add a person or company you sell to or buy from before you continue."
	case "items":
		return "Add something you sell before you continue."
	default:
		return "Finish the required steps before you continue."
	}
}
