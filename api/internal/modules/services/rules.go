package services

import (
	"errors"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/branchiso"
)

var (
	errStatusCannotConfirm = errors.New("approval status cannot be set from the status update")
	errCrossTenant         = errors.New("cross-tenant read denied")
	errFractionalSerial    = errors.New("a serialized item cannot be split")
	errNotDraft            = errors.New("only drafts can be deleted")
	errEquipmentMissing    = errors.New("customer equipment was not found")
	errInsufficientCustody = errors.New("release quantity is greater than the quantity in custody")
)

// TypeConfig is copied onto a job at creation. Later type edits must not rewrite it.
type TypeConfig struct {
	EquipmentTracking        bool   `json:"equipment_tracking"`
	TechnicianRequired       bool   `json:"technician_required"`
	SchedulingRequired       bool   `json:"scheduling_required"`
	DiagnosisRequired        bool   `json:"diagnosis_required"`
	QualityCheckRequired     bool   `json:"quality_check_required"`
	CustomerApprovalRequired bool   `json:"customer_approval_required"`
	LoadSlipRequired         bool   `json:"load_slip_required"`
	SLATracking              bool   `json:"sla_tracking"`
	Internal                 bool   `json:"internal"`
	ChecklistTemplateID      *int64 `json:"checklist_template_id"`
}

func partnerRequired(cfg TypeConfig, partnerID *int64) error {
	if cfg.Internal {
		return nil
	}
	if partnerID == nil || *partnerID <= 0 {
		return errors.New("customer is required for this service type")
	}
	return nil
}

// existingOrCreate keeps convert and sales-order generate idempotent.
func existingOrCreate(existingID int64) (id int64, shouldCreate bool) {
	if existingID > 0 {
		return existingID, false
	}
	return 0, true
}

func validateStatusPatch(approvalStatus, operationalStatus string) error {
	if strings.TrimSpace(approvalStatus) != "" {
		return errStatusCannotConfirm
	}
	if strings.EqualFold(strings.TrimSpace(operationalStatus), "approved") {
		return errStatusCannotConfirm
	}
	return nil
}

func validateSlipItemQty(serialized bool, qty float64) error {
	if qty <= 0 {
		return errors.New("quantity must be positive")
	}
	if serialized && qty != 1 {
		return errFractionalSerial
	}
	return nil
}

func denyCrossTenant(rowTenant, sessionTenant int64) error {
	if rowTenant != sessionTenant {
		return errCrossTenant
	}
	return nil
}

// authorizeSlipReceive denies a destination branch the user cannot access.
func authorizeSlipReceive(destAllowed bool) error {
	if !destAllowed {
		return branchiso.ErrForbiddenLocation
	}
	return nil
}

func authorizeSlipDispatch(originAllowed bool) error {
	if !originAllowed {
		return branchiso.ErrForbiddenLocation
	}
	return nil
}

func moduleAccessDecision(enabled bool, err error) (status int, code string) {
	if err != nil {
		return 500, "ERR_INTERNAL"
	}
	if !enabled {
		return 403, "ERR_MODULE_DISABLED"
	}
	return 0, ""
}

func canSoftDeleteDraft(status string) error {
	if status != "draft" && status != "new" {
		return errNotDraft
	}
	return nil
}
