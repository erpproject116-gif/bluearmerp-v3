package hr

import (
	"strings"
	"testing"
)

func TestValidateColumnMapRequired(t *testing.T) {
	tests := []struct {
		name      string
		columnMap map[string]string
		required  []string
		wantErr   string
	}{
		{
			name:      "nil map",
			columnMap: nil,
			required:  []string{"employee_no", "full_name"},
			wantErr:   "column_map is required",
		},
		{
			name:      "missing keys",
			columnMap: map[string]string{"employee_no": "Emp #"},
			required:  []string{"employee_no", "full_name"},
			wantErr:   "missing required column mapping: full_name",
		},
		{
			name:      "empty source header",
			columnMap: map[string]string{"employee_no": "Emp #", "full_name": "  "},
			required:  []string{"employee_no", "full_name"},
			wantErr:   "missing required column mapping: full_name",
		},
		{
			name:      "ok",
			columnMap: map[string]string{"employee_no": "Emp #", "full_name": "Name"},
			required:  []string{"employee_no", "full_name"},
			wantErr:   "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateColumnMapRequired(tt.columnMap, tt.required)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("want error containing %q, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestRemapCSVWithColumnMap(t *testing.T) {
	records := [][]string{
		{"Emp #", "Name", "Dept", "Extra"},
		{"00001", "Juan dela Cruz", "Ops", "x"},
		{"", "", "", ""},
		{"00002", "Maria Santos", "HR", "y"},
	}
	colMap := map[string]string{
		"employee_no": "Emp #",
		"full_name":   "Name",
		"department":  "Dept",
	}
	out, err := remapCSVWithColumnMap(records, colMap, []string{"employee_no", "full_name"}, employeeCSVHeaders)
	if err != nil {
		t.Fatalf("remap: %v", err)
	}
	if len(out) != 3 {
		t.Fatalf("want 3 rows (header+2 data), got %d", len(out))
	}
	if out[0][0] != "employee_no" || out[0][1] != "full_name" {
		t.Fatalf("unexpected headers: %v", out[0])
	}
	if out[1][0] != "00001" || out[1][1] != "Juan dela Cruz" || out[1][2] != "Ops" {
		t.Fatalf("unexpected first data row: %v", out[1])
	}
	if out[2][0] != "00002" || out[2][1] != "Maria Santos" || out[2][2] != "HR" {
		t.Fatalf("unexpected second data row: %v", out[2])
	}
}

func TestRemapCSVWithColumnMapMissingSourceHeader(t *testing.T) {
	records := [][]string{
		{"Emp #", "Name"},
		{"00001", "Juan"},
	}
	colMap := map[string]string{
		"employee_no": "Emp #",
		"full_name":   "Full Name",
	}
	_, err := remapCSVWithColumnMap(records, colMap, []string{"employee_no", "full_name"}, employeeCSVHeaders)
	if err == nil || !strings.Contains(err.Error(), "not found in file") {
		t.Fatalf("want source header not found error, got %v", err)
	}
}

func TestRemapCSVWithColumnMapMissingRequired(t *testing.T) {
	records := [][]string{
		{"Emp #", "Name"},
		{"00001", "Juan"},
	}
	colMap := map[string]string{
		"employee_no": "Emp #",
	}
	_, err := remapCSVWithColumnMap(records, colMap, []string{"employee_no", "full_name"}, employeeCSVHeaders)
	if err == nil || !strings.Contains(err.Error(), "missing required column mapping") {
		t.Fatalf("want missing required mapping error, got %v", err)
	}
}
