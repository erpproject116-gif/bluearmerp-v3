package finance

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	ofxDateRe  = regexp.MustCompile(`<DTPOSTED>([^<\r\n]+)`)
	ofxAmtRe   = regexp.MustCompile(`<TRNAMT>([^<\r\n]+)`)
	ofxFitRe   = regexp.MustCompile(`<FITID>([^<\r\n]+)`)
	ofxNameRe  = regexp.MustCompile(`<NAME>([^<\r\n]+)`)
	ofxMemoRe  = regexp.MustCompile(`<MEMO>([^<\r\n]+)`)
	ofxStmtBlk = regexp.MustCompile(`(?is)<STMTTRN>(.*?)</STMTTRN>`)
)

type ofxStatementRow struct {
	statementDate time.Time
	referenceNo   string
	description   string
	amount        float64
}

func isOFXContent(name string, peek []byte) bool {
	lower := strings.ToLower(name)
	if strings.HasSuffix(lower, ".ofx") || strings.HasSuffix(lower, ".qfx") {
		return true
	}
	body := strings.ToUpper(string(peek))
	return strings.Contains(body, "<OFX>") || strings.Contains(body, "<STMTTRN>")
}

func parseOFXTransactions(content string) ([]ofxStatementRow, error) {
	blocks := ofxStmtBlk.FindAllStringSubmatch(content, -1)
	if len(blocks) == 0 {
		return nil, fmtError("no STMTTRN transactions found in OFX/QFX file")
	}
	var out []ofxStatementRow
	for _, blk := range blocks {
		block := blk[1]
		amtStr := strings.TrimSpace(firstMatch(ofxAmtRe, block))
		if amtStr == "" {
			continue
		}
		amount, err := strconv.ParseFloat(strings.ReplaceAll(amtStr, ",", ""), 64)
		if err != nil || amount == 0 {
			continue
		}
		dateStr := strings.TrimSpace(firstMatch(ofxDateRe, block))
		stmtDate, err := parseOFXDate(dateStr)
		if err != nil {
			continue
		}
		ref := strings.TrimSpace(firstMatch(ofxFitRe, block))
		name := strings.TrimSpace(firstMatch(ofxNameRe, block))
		memo := strings.TrimSpace(firstMatch(ofxMemoRe, block))
		desc := name
		if memo != "" {
			if desc != "" {
				desc += " — " + memo
			} else {
				desc = memo
			}
		}
		out = append(out, ofxStatementRow{
			statementDate: stmtDate,
			referenceNo:   ref,
			description:   desc,
			amount:        amount,
		})
	}
	if len(out) == 0 {
		return nil, fmtError("no valid transactions parsed from OFX/QFX file")
	}
	return out, nil
}

func firstMatch(re *regexp.Regexp, s string) string {
	m := re.FindStringSubmatch(s)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}

func parseOFXDate(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if len(raw) >= 8 {
		if t, err := time.Parse("20060102", raw[:8]); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmtError("invalid OFX date")
}

type simpleError string

func (e simpleError) Error() string { return string(e) }

func fmtError(msg string) error { return simpleError(msg) }
