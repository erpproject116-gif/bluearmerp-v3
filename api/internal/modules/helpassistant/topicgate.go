package helpassistant

import (
	"regexp"
	"strings"
)

const OffTopicRefuseMessage = `I only help with Bluearm ERP and your company’s data in this workspace.

I can help with:
• How to use ERP screens and workflows
• Looking up your company’s quotations, orders, inventory, AR/AP, and similar tenant data (when tools allow)

I cannot help with writing or debugging code, general programming, unrelated tech questions, or topics outside this ERP.`

var (
	codeFenceRe = regexp.MustCompile("(?i)```|\\bfunction\\s*\\(|\\bconsole\\.log\\b|\\bnpm\\s+install\\b|\\bpip\\s+install\\b")
	offTopicRes = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\b(write|generate|debug|fix|refactor|implement)\b.{0,40}\b(code|script|program|function|component|class|sql query|regex)\b`),
		regexp.MustCompile(`(?i)\b(react|vue|angular|typescript|javascript|python|golang|java|c\+\+|rust|kotlin)\b.{0,40}\b(code|component|function|app|script|comprehension|error|bug)\b`),
		regexp.MustCompile(`(?i)\b(explain|teach|learn)\b.{0,30}\b(python|javascript|typescript|java|golang|rust|react|vue)\b`),
		regexp.MustCompile(`(?i)\b(python|javascript|typescript|golang|java)\b.{0,20}\b(list|array|comprehension|coroutine|async|promise)\b`),
		regexp.MustCompile(`(?i)\b(leetcode|hackerrank|interview question|unit test|jest|pytest)\b`),
		regexp.MustCompile(`(?i)\b(write me a|help me code|coding question|programming problem)\b`),
		regexp.MustCompile(`(?i)\b(weather|who won|sports score|movie recommendation|joke|poem|recipe)\b`),
		regexp.MustCompile(`(?i)\b(capital of|president of|history of|explain quantum|general knowledge)\b`),
		regexp.MustCompile(`(?i)\b(shell command|bash script|powershell|kubectl|docker compose)\b`),
		regexp.MustCompile(`(?i)\b(drop table|delete from|alter table)\b`),
	}
	erpRescueRes = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\b(quotation|sales order|purchase|invoice|inventory|warehouse|serial|lot|rma|customer|vendor|partner|receivable|payable|ar\b|ap\b|cash|ledger|journal|payroll|crm|ticket|bluearm|erp)\b`),
		regexp.MustCompile(`(?i)\b(how (do|to)|where (is|can)|create|post|approve|void|print)\b`),
	}
)

// IsOffTopicERPQuery returns true when the user is asking for coding/general knowledge
// unrelated to Bluearm ERP or this tenant’s ERP data.
func IsOffTopicERPQuery(query string) bool {
	q := strings.TrimSpace(query)
	if q == "" {
		return false
	}
	if codeFenceRe.MatchString(q) {
		// Allow if clearly about ERP data import / mapping
		if erpRescueRes[0].MatchString(q) && (strings.Contains(strings.ToLower(q), "import") || strings.Contains(strings.ToLower(q), "csv")) {
			return false
		}
		return true
	}
	off := false
	for _, re := range offTopicRes {
		if re.MatchString(q) {
			off = true
			break
		}
	}
	if !off {
		return false
	}
	// Soft rescue: clearly ERP workflow questions that happened to mention a tech word.
	for _, re := range erpRescueRes {
		if re.MatchString(q) {
			return false
		}
	}
	return true
}
