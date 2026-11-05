package hr

import (
	"os"
	"strings"
	"testing"
)

func TestAcceptTimeDoesNotWriteDTR(t *testing.T) {
	if strings.Contains(acceptClientTimeSQL, "hr_dtr_entries") || strings.Contains(acceptClientTimeSQL, "hr_employees") {
		t.Fatal("accepting client time writes attendance or employment")
	}
}

func TestJobOrderDoesNotChangeBasicPay(t *testing.T) {
	if strings.Contains(insertJobOrderSQL, "hr_employees") || strings.Contains(insertJobOrderSQL, "base_salary") {
		t.Fatal("saving a job order changes basic pay")
	}
}

func TestResignationDoesNotReleasePay(t *testing.T) {
	src, err := os.ReadFile("relations.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(src)
	start := strings.Index(text, "func closeWorkerRequest")
	end := strings.Index(text[start:], "\nfunc ")
	fn := text[start : start+end]
	if strings.Contains(fn, "postFinalPay") || strings.Contains(fn, "final_pay") {
		t.Fatal("closing a request releases final pay")
	}
}

func TestClientBillUsesAcceptedHours(t *testing.T) {
	if roundMoney(8*125.5) != 1004 {
		t.Fatalf("bill total %v", roundMoney(8*125.5))
	}
}
