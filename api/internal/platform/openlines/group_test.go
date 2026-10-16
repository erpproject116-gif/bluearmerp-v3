package openlines

import "testing"

func TestAssembleDocumentsKeepsEveryLineOfOneDocument(t *testing.T) {
	type line struct {
		Doc  int64
		Item *int64
		Name string
	}
	item := int64(1)
	lines := []line{
		{Doc: 10, Item: &item, Name: "A"},
		{Doc: 20, Item: &item, Name: "B"},
		{Doc: 10, Item: &item, Name: "C"},
	}
	counts := map[int64]SourceCounts{
		10: {Source: 4, NullItem: 2},
		20: {Source: 1, NullItem: 0},
	}
	docs := AssembleDocuments([]int64{10, 20}, lines, func(l line) int64 { return l.Doc }, counts, func(l line) bool { return l.Item == nil })
	if len(docs) != 2 {
		t.Fatalf("documents = %d, want 2", len(docs))
	}
	if docs[0].ID != 10 || docs[0].OpenLineCount != 2 || len(docs[0].Lines) != 2 {
		t.Fatalf("first document = %+v", docs[0])
	}
	if docs[0].Lines[0].Name != "A" || docs[0].Lines[1].Name != "C" {
		t.Fatalf("line order = %s, %s", docs[0].Lines[0].Name, docs[0].Lines[1].Name)
	}
	if docs[0].SourceLineCount != 4 || docs[0].SkippedNoItemCount != 2 {
		t.Fatalf("counts = source %d skipped %d", docs[0].SourceLineCount, docs[0].SkippedNoItemCount)
	}
	if docs[1].OpenLineCount != 1 || docs[1].SkippedNoItemCount != 0 {
		t.Fatalf("second document = %+v", docs[1])
	}
}

func TestAssembleDocumentsDoesNotSkipNullItemThatIsOpen(t *testing.T) {
	type line struct {
		Doc int64
	}
	docs := AssembleDocuments([]int64{1}, []line{{Doc: 1}}, func(l line) int64 { return l.Doc }, map[int64]SourceCounts{
		1: {Source: 1, NullItem: 1},
	}, func(line) bool { return true })
	if len(docs) != 1 || docs[0].SkippedNoItemCount != 0 {
		t.Fatalf("skipped = %+v, want 0 because the null-item line is in the open set", docs)
	}
}

func TestSingleDocumentID(t *testing.T) {
	id, err := SingleDocumentID([]int64{4, 4, 0})
	if err != nil || id != 4 {
		t.Fatalf("same document id = %d err %v", id, err)
	}
	if _, err := SingleDocumentID([]int64{4, 5}); err != ErrMixedSlipSource {
		t.Fatalf("mixed err = %v", err)
	}
	if _, err := SingleDocumentID(nil); err != ErrMixedSlipSource {
		t.Fatalf("empty err = %v", err)
	}
	if _, err := SingleDocumentID([]int64{0, -1}); err != ErrMixedSlipSource {
		t.Fatalf("non-positive err = %v", err)
	}
}
