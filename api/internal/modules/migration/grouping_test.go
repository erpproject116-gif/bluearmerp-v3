package migration

import "testing"

func TestGroupBySourceDoc(t *testing.T) {
	rows := []map[string]string{
		{"source_doc_no": "SI-1", "item": "A"},
		{"source_doc_no": "SI-1", "item": "B"},
		{"source_doc_no": "", "item": "C"},
		{"source_doc_no": "SI-2", "item": "D"},
	}
	docs, errs := groupBySourceDoc(rows, 2)
	if len(errs) != 1 || errs[0].Row != 4 {
		t.Fatalf("errs = %+v", errs)
	}
	if len(docs) != 2 {
		t.Fatalf("docs = %d", len(docs))
	}
	if docs[0].SourceDocNo != "SI-1" || len(docs[0].Rows) != 2 {
		t.Fatalf("doc0 = %+v", docs[0])
	}
	if docs[1].SourceDocNo != "SI-2" || len(docs[1].Rows) != 1 {
		t.Fatalf("doc1 = %+v", docs[1])
	}
}

func TestLineUnitPrice(t *testing.T) {
	u, q, err := lineUnitPrice(2, 100)
	if err != "" || u != 50 || q != 2 {
		t.Fatalf("got %v %v %q", u, q, err)
	}
	u, q, err = lineUnitPrice(0, 80)
	if err != "" || u != 80 || q != 1 {
		t.Fatalf("header remaining: %v %v %q", u, q, err)
	}
	_, _, err = lineUnitPrice(1, 0)
	if err == "" {
		t.Fatal("expected amount error")
	}
}
