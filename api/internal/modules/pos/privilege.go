package pos

import (
	"fmt"
	"strings"
)

// PrivilegeType identifies POS order discount classification.
type PrivilegeType string

const (
	PrivilegeNone    PrivilegeType = "none"
	PrivilegeSenior  PrivilegeType = "senior"
	PrivilegePWD     PrivilegeType = "pwd"
	PrivilegeStudent PrivilegeType = "student"
	PrivilegeManual  PrivilegeType = "manual"
)

type privilegeSettings struct {
	SeniorPct  float64
	PwdPct     float64
	StudentPct float64
}

type privilegeInput struct {
	Type           PrivilegeType
	IDNo           string
	Name           string
	ManualDiscount float64
	VoucherAmount  float64
}

type privilegeResult struct {
	Type         PrivilegeType
	IDNo         string
	Name         string
	Pct          float64
	Discount     float64
	VATExempted  bool
	BaseAfterDisc float64
}

func normalizePrivilegeType(s string) PrivilegeType {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "senior":
		return PrivilegeSenior
	case "pwd":
		return PrivilegePWD
	case "student":
		return PrivilegeStudent
	case "manual":
		return PrivilegeManual
	default:
		return PrivilegeNone
	}
}

func applyPrivilegeDiscount(cartSubtotal float64, in privilegeInput, cfg privilegeSettings) (privilegeResult, error) {
	cartSubtotal = roundMoney(cartSubtotal)
	if cartSubtotal < 0 {
		cartSubtotal = 0
	}
	out := privilegeResult{Type: PrivilegeNone, BaseAfterDisc: cartSubtotal}
	t := in.Type
	if t == "" {
		t = PrivilegeNone
	}

	switch t {
	case PrivilegeSenior, PrivilegePWD:
		id := strings.TrimSpace(in.IDNo)
		if id == "" {
			label := "OSCA / senior citizen ID"
			if t == PrivilegePWD {
				label = "PWD ID"
			}
			return out, fmt.Errorf("%s number is required for %s discount", label, t)
		}
		pct := cfg.SeniorPct
		if t == PrivilegePWD {
			pct = cfg.PwdPct
		}
		if pct <= 0 {
			pct = 20
		}
		disc := roundMoney(cartSubtotal * pct / 100)
		if disc > cartSubtotal {
			disc = cartSubtotal
		}
		base := roundMoney(cartSubtotal - disc)
		return privilegeResult{
			Type: t, IDNo: id, Name: strings.TrimSpace(in.Name),
			Pct: pct, Discount: disc, VATExempted: true, BaseAfterDisc: base,
		}, nil

	case PrivilegeStudent:
		pct := cfg.StudentPct
		if pct < 0 {
			pct = 0
		}
		if pct > 100 {
			pct = 100
		}
		disc := roundMoney(cartSubtotal * pct / 100)
		if disc > cartSubtotal {
			disc = cartSubtotal
		}
		base := roundMoney(cartSubtotal - disc)
		return privilegeResult{
			Type: PrivilegeStudent, IDNo: strings.TrimSpace(in.IDNo), Name: strings.TrimSpace(in.Name),
			Pct: pct, Discount: disc, VATExempted: false, BaseAfterDisc: base,
		}, nil

	case PrivilegeManual:
		disc := roundMoney(in.ManualDiscount + in.VoucherAmount)
		if disc < 0 {
			disc = 0
		}
		if disc > cartSubtotal {
			disc = cartSubtotal
		}
		return privilegeResult{
			Type: PrivilegeManual, Discount: disc, VATExempted: false,
			BaseAfterDisc: roundMoney(cartSubtotal - disc),
		}, nil

	default:
		disc := roundMoney(in.VoucherAmount)
		if disc < 0 {
			disc = 0
		}
		if disc > cartSubtotal {
			disc = cartSubtotal
		}
		return privilegeResult{
			Type: PrivilegeNone, Discount: disc, VATExempted: false,
			BaseAfterDisc: roundMoney(cartSubtotal - disc),
		}, nil
	}
}
