package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
)

const unclearedPaymentsCode = "2611"

var (
	errSaleNotCompleted     = errors.New("Sale must be Completed before it can be collected.")
	errPurchaseNotCompleted = errors.New("Purchase must be Completed before it can be paid.")
	errMixedReceivable      = errors.New("Applied sales use different receivable accounts.")
	errMixedPayable         = errors.New("Applied purchases use different payable accounts.")
)

// documentCompleted is true only for progress_status "completed".
func documentCompleted(progress string) bool {
	return progress == "completed"
}

// shouldVoidUnfinishedInvoiceJournal is the one-time repair rule: an invoice
// journal linked to a document that is not completed is reversed. Completed
// documents, and journals with no id, are left alone.
func shouldVoidUnfinishedInvoiceJournal(progress string, journalID int64) bool {
	return journalID > 0 && progress != "completed"
}

// payableDebitCode is the supplier-invoice payable: the bill's withdrawal
// account, otherwise the payable-role account, otherwise 2010. 2611 is never
// used for these applications.
func payableDebitCode(withdrawalCode, roleCode string) string {
	if code := strings.TrimSpace(withdrawalCode); code != "" && code != unclearedPaymentsCode {
		return code
	}
	if code := strings.TrimSpace(roleCode); code != "" && code != unclearedPaymentsCode {
		return code
	}
	return "2010"
}

func chooseOneAccount(codes []string) (string, error) {
	seen := map[string]struct{}{}
	chosen := ""
	for _, code := range codes {
		code = strings.TrimSpace(code)
		if code == "" {
			continue
		}
		seen[code] = struct{}{}
		chosen = code
	}
	if len(seen) == 0 {
		return "", errors.New("account is not mapped")
	}
	if len(seen) > 1 {
		return "", errors.New("applied documents use different accounts")
	}
	return chosen, nil
}

func accountCodeByID(ctx context.Context, q rowQuerier, tenantID, accountID int64) string {
	if accountID <= 0 {
		return ""
	}
	var code string
	if err := q.QueryRow(ctx, `
		select account_code from public.fin_accounts
		where id = $1 and tenant_id = $2 and deleted_at is null`, accountID, tenantID).Scan(&code); err != nil {
		return ""
	}
	return strings.TrimSpace(code)
}

func roleAccountCode(ctx context.Context, q rowQuerier, tenantID int64, role financedefaults.Role) string {
	id, err := financedefaults.ResolveByRole(ctx, q, tenantID, role)
	if err != nil {
		return ""
	}
	return accountCodeByID(ctx, q, tenantID, id)
}

func sharedSaleReceivableCode(ctx context.Context, q rowQuerier, tenantID int64, salesIDs []int64) (string, error) {
	if len(salesIDs) == 0 {
		return "", nil
	}
	fallback := roleAccountCode(ctx, q, tenantID, financedefaults.RoleReceivable)
	if fallback == "" {
		fallback = "1100"
	}
	codes := make([]string, 0, len(salesIDs))
	for _, id := range salesIDs {
		var progress, code string
		err := q.QueryRow(ctx, `
			select coalesce(s.progress_status, ''), coalesce(a.account_code, '')
			from public.sa_sales s
			left join public.fin_accounts a
			  on a.id = s.deposit_account_id and a.tenant_id = s.tenant_id and a.deleted_at is null
			where s.id = $1 and s.tenant_id = $2 and s.deleted_at is null`,
			id, tenantID).Scan(&progress, &code)
		if err != nil {
			return "", fmt.Errorf("sale %d: %w", id, err)
		}
		if !documentCompleted(progress) {
			return "", errSaleNotCompleted
		}
		if strings.TrimSpace(code) == "" {
			code = fallback
		}
		codes = append(codes, code)
	}
	code, err := chooseOneAccount(codes)
	if err != nil {
		return "", errMixedReceivable
	}
	return code, nil
}

func sharedSupplierPayableCode(ctx context.Context, q rowQuerier, tenantID int64, invoiceIDs []int64) (string, error) {
	if len(invoiceIDs) == 0 {
		return "", nil
	}
	roleCode := roleAccountCode(ctx, q, tenantID, financedefaults.RolePayable)
	codes := make([]string, 0, len(invoiceIDs))
	for _, id := range invoiceIDs {
		var progress, withdrawal string
		err := q.QueryRow(ctx, `
			select coalesce(si.progress_status, ''), coalesce(a.account_code, '')
			from public.fin_supplier_invoices si
			left join public.fin_accounts a
			  on a.id = si.withdrawal_account_id and a.tenant_id = si.tenant_id and a.deleted_at is null
			where si.id = $1 and si.tenant_id = $2 and si.deleted_at is null`,
			id, tenantID).Scan(&progress, &withdrawal)
		if err != nil {
			return "", fmt.Errorf("supplier invoice %d: %w", id, err)
		}
		if !documentCompleted(progress) {
			return "", errPurchaseNotCompleted
		}
		codes = append(codes, payableDebitCode(withdrawal, roleCode))
	}
	code, err := chooseOneAccount(codes)
	if err != nil {
		return "", errMixedPayable
	}
	if code == unclearedPaymentsCode {
		return "2010", nil
	}
	return code, nil
}
