package quotation

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

type rfqCorpusExpectedLine struct {
	ItemName  string `json:"item_name"`
	Qty       string `json:"qty"`
	Unit      string `json:"unit"`
	UnitPrice string `json:"unit_price"`
}

func TestRunRfqImportPipelineBlocksInvoiceBeforeMatch(t *testing.T) {
	result, err := RunRfqImportPipeline(context.Background(), nil, auth.TenantUser{}, RfqRunInput{
		Pages: []RfqPageInput{{
			Page: 1,
			Text: "INVOICE\nBILL TO\nINVOICE NO. INV-1\nSERVICE DESCRIPTION HOURS RATE TOTAL",
		}},
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if !result.Blocked || result.DocumentType != RfqDocumentInvoiceLike {
		t.Fatalf("result=%+v", result)
	}
	if len(result.Lines) != 0 || len(result.Matched) != 0 {
		t.Fatal("invoice must not produce quotation lines")
	}
}

type rfqCorpusCase struct {
	Name     string               `json:"name"`
	Pages    []RfqPageInput       `json:"pages"`
	Tables   []RfqStructuredTable `json:"tables"`
	Expected struct {
		DocumentType RfqDocumentType         `json:"document_type"`
		Lines        []rfqCorpusExpectedLine `json:"lines"`
	} `json:"expected"`
}

func TestRfqGoldenCorpus(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "rfq_corpus", "corpus.json"))
	if err != nil {
		t.Fatalf("read corpus: %v", err)
	}
	var corpus []rfqCorpusCase
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatalf("decode corpus: %v", err)
	}
	if len(corpus) < 5 {
		t.Fatalf("expected at least five corpus cases, got %d", len(corpus))
	}

	for _, tc := range corpus {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			result, documentType := ParseRfqDeterministic(tc.Pages, tc.Tables, RfqParseOptions{})
			if documentType != tc.Expected.DocumentType {
				t.Fatalf("document type = %q, want %q", documentType, tc.Expected.DocumentType)
			}
			if len(result.Lines) != len(tc.Expected.Lines) {
				t.Fatalf("line count = %d, want %d: %+v", len(result.Lines), len(tc.Expected.Lines), result.Lines)
			}
			for i, want := range tc.Expected.Lines {
				got := result.Lines[i]
				if got.ItemName != want.ItemName || got.Qty != want.Qty || got.Unit != want.Unit {
					t.Fatalf("line %d = %+v, want name=%q qty=%q unit=%q", i, got, want.ItemName, want.Qty, want.Unit)
				}
				if want.UnitPrice != "" && got.UnitPrice != want.UnitPrice {
					t.Fatalf("line %d unit price = %q, want %q", i, got.UnitPrice, want.UnitPrice)
				}
			}
		})
	}
}

func TestGovernmentSectionKeepsWarrantyInsideItem(t *testing.T) {
	pages := []RfqPageInput{{
		Page: 1,
		Text: "REQUEST FOR QUOTATION\nPhilGEPS\nI. LAPTOP (8 units)\nProcessor: Intel Core i5\nWarranty: Three years\nFINANCIAL PROPOSAL",
	}}
	result, documentType := ParseRfqDeterministic(pages, nil, RfqParseOptions{})
	if documentType != RfqDocumentGovernmentSpec || len(result.Lines) != 1 {
		t.Fatalf("unexpected parse: type=%s result=%+v", documentType, result)
	}
	if result.Lines[0].Description == "" {
		t.Fatal("expected technical specification text")
	}
	if result.Lines[0].Description != "Processor: Intel Core i5\nWarranty: Three years" {
		t.Fatalf("description = %q", result.Lines[0].Description)
	}
}

func TestRfqMatchQueryUsesShortItemNameNotLongSpecifications(t *testing.T) {
	line := ParsedRfqLine{
		ItemName:    "Mid-Range Laptop",
		Description: "Processor: Intel Core Ultra 5\nMemory: 16GB DDR5\nStorage: 512GB NVMe",
	}
	if got := rfqMatchQuery(line); got != "Mid-Range Laptop" {
		t.Fatalf("match query=%q", got)
	}
}
