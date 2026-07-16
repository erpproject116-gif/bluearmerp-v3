package pos

import (
	"fmt"
	"strings"
)

// checkoutGuestBody is one cover on a multi-guest POS ticket.
type checkoutGuestBody struct {
	GuestNo        int     `json:"guest_no"`
	DisplayName    string  `json:"display_name"`
	PrivilegeType  string  `json:"privilege_type"`
	PrivilegeIDNo  string  `json:"privilege_id_no"`
	PrivilegeName  string  `json:"privilege_name"`
	ManualDiscount float64 `json:"manual_discount"`
}

type guestApplied struct {
	GuestNo        int
	DisplayName    string
	PrivilegeType  PrivilegeType
	PrivilegeIDNo  string
	PrivilegeName  string
	PrivilegePct   float64
	ShareAmount    float64
	DiscountAmount float64
	NetAmount      float64
	VATExempted    bool
}

type guestDiscountBundle struct {
	Guests        []guestApplied
	DiscountTotal float64
	TaxableBase   float64 // after discount, still VAT-liable
	ExemptBase    float64 // after discount, VAT-exempt (senior/PWD)
}

// applyGuestDiscounts splits the cart by guest_no (or equal share) and applies
// privilege discounts per person. Empty guests → caller should use ticket-level privilege.
func applyGuestDiscounts(lines []CartLine, guests []checkoutGuestBody, cfg privilegeSettings) (guestDiscountBundle, error) {
	out := guestDiscountBundle{}
	if len(guests) == 0 {
		return out, nil
	}

	var cartTotal float64
	for _, ln := range lines {
		cartTotal += ln.LineTotal
	}
	cartTotal = roundMoney(cartTotal)
	if cartTotal < 0 {
		cartTotal = 0
	}

	// Normalize guest numbers; assign sequential if missing.
	normalized := make([]checkoutGuestBody, 0, len(guests))
	seen := map[int]bool{}
	nextNo := 1
	for _, g := range guests {
		no := g.GuestNo
		if no <= 0 {
			for seen[nextNo] {
				nextNo++
			}
			no = nextNo
			nextNo++
		}
		if seen[no] {
			return out, fmt.Errorf("duplicate guest_no %d", no)
		}
		seen[no] = true
		g.GuestNo = no
		normalized = append(normalized, g)
	}

	// Shares: sum line totals by guest_no when any line is assigned; else equal split.
	assigned := false
	for _, ln := range lines {
		if ln.GuestNo > 0 {
			assigned = true
			break
		}
	}
	shares := map[int]float64{}
	if assigned {
		for _, ln := range lines {
			gno := ln.GuestNo
			if gno <= 0 {
				gno = 1
			}
			shares[gno] += ln.LineTotal
		}
		// Guests with no lines get 0 share (allowed — e.g. empty cover).
		for _, g := range normalized {
			if _, ok := shares[g.GuestNo]; !ok {
				shares[g.GuestNo] = 0
			}
		}
	} else {
		n := float64(len(normalized))
		base := roundMoney(cartTotal / n)
		allocated := 0.0
		for i, g := range normalized {
			if i == len(normalized)-1 {
				shares[g.GuestNo] = roundMoney(cartTotal - allocated)
			} else {
				shares[g.GuestNo] = base
				allocated = roundMoney(allocated + base)
			}
		}
	}

	for _, g := range normalized {
		share := roundMoney(shares[g.GuestNo])
		ptype := normalizePrivilegeType(g.PrivilegeType)
		if ptype == PrivilegeNone && g.ManualDiscount > 0 {
			ptype = PrivilegeManual
		}
		priv, err := applyPrivilegeDiscount(share, privilegeInput{
			Type:           ptype,
			IDNo:           g.PrivilegeIDNo,
			Name:           g.PrivilegeName,
			ManualDiscount: g.ManualDiscount,
		}, cfg)
		if err != nil {
			label := strings.TrimSpace(g.DisplayName)
			if label == "" {
				label = fmt.Sprintf("Guest %d", g.GuestNo)
			}
			return out, fmt.Errorf("%s: %w", label, err)
		}
		name := strings.TrimSpace(g.DisplayName)
		if name == "" {
			name = fmt.Sprintf("Guest %d", g.GuestNo)
		}
		ga := guestApplied{
			GuestNo:        g.GuestNo,
			DisplayName:    name,
			PrivilegeType:  priv.Type,
			PrivilegeIDNo:  priv.IDNo,
			PrivilegeName:  priv.Name,
			PrivilegePct:   priv.Pct,
			ShareAmount:    share,
			DiscountAmount: priv.Discount,
			NetAmount:      priv.BaseAfterDisc,
			VATExempted:    priv.VATExempted,
		}
		out.Guests = append(out.Guests, ga)
		out.DiscountTotal = roundMoney(out.DiscountTotal + ga.DiscountAmount)
		if ga.VATExempted {
			out.ExemptBase = roundMoney(out.ExemptBase + ga.NetAmount)
		} else {
			out.TaxableBase = roundMoney(out.TaxableBase + ga.NetAmount)
		}
	}
	return out, nil
}
