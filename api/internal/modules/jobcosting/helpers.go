package jobcosting

import "strings"

func orderSQL(order string) string {
	if strings.EqualFold(order, "desc") {
		return "desc"
	}
	return "asc"
}
