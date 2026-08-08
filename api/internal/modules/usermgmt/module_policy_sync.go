package usermgmt

import (
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
)

// Policy sync map: when a module is disabled, force related process gates off
// so users never hit a required step they cannot open.
// Re-enabling a module does NOT turn policies back on.

type policyDeltaMsg struct {
	Field   string `json:"field"`
	Value   bool   `json:"value"`
	Message string `json:"message"`
}

type moduleToggle struct {
	ModuleCode string `json:"module_code"`
	IsEnabled  bool   `json:"is_enabled"`
}

type policySyncPreview struct {
	ModulesDelta []moduleToggle   `json:"modules_delta"`
	PolicyDelta  []policyDeltaMsg `json:"policy_delta"`
	Messages     []string         `json:"messages"`
	Preset       string           `json:"preset,omitempty"`
}

func boolPtr(v bool) *bool { return &v }

// policyFieldsToRelax returns process-policy fields that must be false when moduleCode is disabled.
func policyFieldsToRelax(moduleCode string) []policyDeltaMsg {
	switch moduleCode {
	case "quotation":
		return []policyDeltaMsg{
			{Field: "sales_require_quotation", Value: false, Message: "Sales orders can start without a quotation."},
		}
	case "sales_order":
		return []policyDeltaMsg{
			{Field: "sales_require_so", Value: false, Message: "You can bill customers without a sales order / pick-delivery chain."},
			{Field: "sales_require_reservation", Value: false, Message: "Stock reservation on release is no longer required."},
			{Field: "sales_require_delivery_receipt", Value: false, Message: "Delivery receipt before invoice is no longer required."},
		}
	case "purchase_request":
		return []policyDeltaMsg{
			{Field: "purchase_require_pr", Value: false, Message: "Purchase orders can start without a purchase request."},
			{Field: "purchase_require_pr_approval", Value: false, Message: "Purchase request approval is no longer required."},
		}
	default:
		return nil
	}
}

// buildPolicyPatchFromDisabled merges relaxations for every module that is (or will be) disabled.
// currentEnabled: module_code -> currently enabled before patch
// nextEnabled: desired state after patch (after cascade intent; caller passes intended map)
func buildPolicyPatchFromDisabled(nextEnabled map[string]bool) (processpolicy.Patch, []policyDeltaMsg, []string) {
	seen := map[string]bool{}
	var deltas []policyDeltaMsg
	var messages []string
	patch := processpolicy.Patch{}

	for code, on := range nextEnabled {
		if on {
			continue
		}
		for _, d := range policyFieldsToRelax(code) {
			if seen[d.Field] {
				continue
			}
			seen[d.Field] = true
			deltas = append(deltas, d)
			messages = append(messages, d.Message)
			applyDeltaField(&patch, d.Field, false)
		}
	}
	return patch, deltas, messages
}

func applyDeltaField(patch *processpolicy.Patch, field string, value bool) {
	v := boolPtr(value)
	switch field {
	case "sales_require_quotation":
		patch.SalesRequireQuotation = v
	case "sales_require_so":
		patch.SalesRequireSO = v
	case "sales_require_reservation":
		patch.SalesRequireReservation = v
	case "sales_require_delivery_receipt":
		patch.SalesRequireDeliveryReceipt = v
	case "purchase_require_pr":
		patch.PurchaseRequirePR = v
	case "purchase_require_pr_approval":
		patch.PurchaseRequirePRApproval = v
	case "purchase_require_gr_before_supplier_invoice":
		patch.PurchaseRequireGRBeforeSupplierInv = v
	}
}

// applyPresetModules returns intended enable flags for a named preset (partial map — merge onto current).
func applyPresetModules(preset string) (map[string]bool, processpolicy.Patch, []string) {
	p := strings.TrimSpace(strings.ToLower(preset))
	msgs := []string{}
	patch := processpolicy.Patch{}
	mods := map[string]bool{}

	switch p {
	case "simple_store":
		// Hide quote + SO (+ PR); keep Sales, POS, Inventory, Purchases, PO.
		mods["quotation"] = false
		mods["sales_order"] = false
		mods["purchase_request"] = false
		mods["sales"] = true
		mods["pos"] = true
		mods["inventory"] = true
		mods["purchases"] = true
		mods["purchase_order"] = true
		f := false
		patch.SalesRequireQuotation = &f
		patch.SalesRequireSO = &f
		patch.SalesRequireReservation = &f
		patch.SalesRequireDeliveryReceipt = &f
		patch.PurchaseRequirePR = &f
		patch.PurchaseRequirePRApproval = &f
		patch.PurchaseRequireGRBeforeSupplierInv = &f
		msgs = append(msgs,
			"Simple store: Quotation and Sales Order are hidden.",
			"You can bill customers without a sales order / pick-delivery chain.",
			"Purchase orders can start without a purchase request.",
			"Supplier invoices can be entered without a goods receipt first.",
		)
	case "full_process":
		mods["quotation"] = true
		mods["sales_order"] = true
		mods["purchase_request"] = true
		mods["sales"] = true
		mods["purchases"] = true
		mods["purchase_order"] = true
		t := true
		patch.SalesRequireQuotation = &t
		patch.SalesRequireSO = &t
		patch.SalesRequireReservation = &t
		patch.SalesRequireDeliveryReceipt = &t
		patch.PurchaseRequirePR = &t
		patch.PurchaseRequirePRApproval = &t
		patch.PurchaseRequireGRBeforeSupplierInv = &t
		msgs = append(msgs,
			"Full process: Quotation, Sales Order, and Purchase Request are on.",
			"Strict sell and buy gates are turned on.",
		)
	}
	return mods, patch, msgs
}

func mergePolicyPatches(a, b processpolicy.Patch) processpolicy.Patch {
	out := a
	if b.SalesRequireQuotation != nil {
		out.SalesRequireQuotation = b.SalesRequireQuotation
	}
	if b.SalesRequireSO != nil {
		out.SalesRequireSO = b.SalesRequireSO
	}
	if b.SalesRequireReservation != nil {
		out.SalesRequireReservation = b.SalesRequireReservation
	}
	if b.SalesRequireDeliveryReceipt != nil {
		out.SalesRequireDeliveryReceipt = b.SalesRequireDeliveryReceipt
	}
	if b.PurchaseRequirePR != nil {
		out.PurchaseRequirePR = b.PurchaseRequirePR
	}
	if b.PurchaseRequirePRApproval != nil {
		out.PurchaseRequirePRApproval = b.PurchaseRequirePRApproval
	}
	if b.PurchaseRequireGRBeforeSupplierInv != nil {
		out.PurchaseRequireGRBeforeSupplierInv = b.PurchaseRequireGRBeforeSupplierInv
	}
	return out
}

func patchHasAny(p processpolicy.Patch) bool {
	return p.SalesRequireQuotation != nil ||
		p.SalesRequireSO != nil ||
		p.SalesRequireReservation != nil ||
		p.SalesRequireDeliveryReceipt != nil ||
		p.PurchaseRequirePR != nil ||
		p.PurchaseRequirePRApproval != nil ||
		p.PurchaseRequireGRBeforeSupplierInv != nil
}

func policyDeltaList(p processpolicy.Patch) []policyDeltaMsg {
	var out []policyDeltaMsg
	add := func(field string, ptr *bool, msg string) {
		if ptr == nil {
			return
		}
		out = append(out, policyDeltaMsg{Field: field, Value: *ptr, Message: msg})
	}
	add("sales_require_quotation", p.SalesRequireQuotation, "Sales orders can start without a quotation.")
	add("sales_require_so", p.SalesRequireSO, "You can bill customers without a sales order / pick-delivery chain.")
	add("sales_require_reservation", p.SalesRequireReservation, "Stock reservation on release is no longer required.")
	add("sales_require_delivery_receipt", p.SalesRequireDeliveryReceipt, "Delivery receipt before invoice is no longer required.")
	add("purchase_require_pr", p.PurchaseRequirePR, "Purchase orders can start without a purchase request.")
	add("purchase_require_pr_approval", p.PurchaseRequirePRApproval, "Purchase request approval is no longer required.")
	add("purchase_require_gr_before_supplier_invoice", p.PurchaseRequireGRBeforeSupplierInv, "New Bill posts stock on confirm (Bill-first). Turn on only for legacy Receive-then-Bill.")
	// Fix messages for true values (full process)
	for i := range out {
		if out[i].Value {
			switch out[i].Field {
			case "sales_require_quotation":
				out[i].Message = "Sales orders will require a quotation."
			case "sales_require_so":
				out[i].Message = "Sales invoices will require a sales order."
			case "sales_require_reservation":
				out[i].Message = "Stock reservation on release is required."
			case "sales_require_delivery_receipt":
				out[i].Message = "Delivery receipt before invoice is required."
			case "purchase_require_pr":
				out[i].Message = "Purchase orders will require a purchase request."
			case "purchase_require_pr_approval":
				out[i].Message = "Purchase request approval is required."
			case "purchase_require_gr_before_supplier_invoice":
				out[i].Message = "Supplier invoices will require a goods receipt first."
			}
		}
	}
	return out
}
