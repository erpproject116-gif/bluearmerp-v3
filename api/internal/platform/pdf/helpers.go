package pdf

import "fmt"

func StrVal(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func ToParty(companyName string, address, phone, mobile, email *string) Party {
	return Party{
		CompanyName: companyName,
		Address:     StrVal(address),
		Phone:       StrVal(phone),
		Mobile:      StrVal(mobile),
		Email:       StrVal(email),
	}
}

func FmtQty(q float64) string {
	return fmt.Sprintf("%.2f", q)
}

func FmtAmt(q float64) string {
	return fmt.Sprintf("%.2f", q)
}

// StandardLineTable builds headers/rows for item line documents.
func StandardLineTable(currency string, lines []struct {
	LineNo   int
	ItemCode string
	ItemName string
	Qty      float64
	UnitAmt  float64
	LineAmt  float64
}) (headers []string, rows [][]string) {
	headers = []string{"#", "Item", "Qty", "Unit", "Total"}
	for _, ln := range lines {
		item := ln.ItemCode
		if ln.ItemName != "" {
			item += " — " + ln.ItemName
		}
		rows = append(rows, []string{
			fmt.Sprintf("%d", ln.LineNo),
			item,
			FmtQty(ln.Qty),
			FormatMoney(ln.UnitAmt, currency),
			FormatMoney(ln.LineAmt, currency),
		})
	}
	return headers, rows
}
