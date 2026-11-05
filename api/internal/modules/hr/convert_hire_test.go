package hr

import (
	"os"
	"strings"
	"testing"
)

func TestConvertHireDoesNotRelyOnStatusFlip(t *testing.T) {
	if applicationCreatesEmployee("hired") {
		t.Fatal("status hired must not create employees")
	}
	src, err := os.ReadFile("applications.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(src)
	start := strings.Index(text, "func patchApplication")
	if start < 0 {
		t.Fatal("patchApplication missing")
	}
	end := strings.Index(text[start+1:], "\nfunc ")
	if end < 0 {
		t.Fatal("patchApplication bounds")
	}
	fn := text[start : start+1+end]
	if strings.Contains(fn, "insert into public.hr_employees") {
		t.Fatal("status PATCH must not insert employees")
	}
}

func TestConvertHireRegistersRoute(t *testing.T) {
	src, err := os.ReadFile("convert_hire.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(src)
	if !strings.Contains(text, `Post("/applications/{id}/convert-hire"`) {
		t.Fatal("convert-hire route missing")
	}
	if !strings.Contains(text, "hr.application.convert_hire") {
		t.Fatal("convert hire audit action missing")
	}
	if !strings.Contains(text, "source_application_id") {
		t.Fatal("source_application_id missing")
	}
	if !strings.Contains(text, "spawnHireOnboarding") {
		t.Fatal("onboarding spawn missing")
	}
}
