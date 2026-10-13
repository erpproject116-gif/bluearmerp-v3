package finance

import "testing"

func TestKeepFirstSource(t *testing.T) {
	dst := map[int64]journalSource{}
	keepFirstSource(dst, 7, journalSource{Type: "sa_sales", ID: 3, No: "SI-1"})
	keepFirstSource(dst, 7, journalSource{Type: "fin_credit_note", ID: 9, No: "CN-1"})
	keepFirstSource(dst, 0, journalSource{Type: "sa_sales", ID: 1, No: "x"})
	if dst[7].Type != "sa_sales" || dst[7].No != "SI-1" {
		t.Fatalf("first source lost: %+v", dst[7])
	}
	if _, ok := dst[0]; ok {
		t.Fatal("zero id was stored")
	}
}

func TestAssignReversalSourceOneHop(t *testing.T) {
	dst := map[int64]journalSource{
		10: {Type: "sa_sales", ID: 4, No: "SI-4"},
	}
	parentSrc := map[int64]journalSource{
		20: {Type: "official_receipt", ID: 8, No: "OR-8"},
	}
	assignReversalSource(dst, 11, 10, parentSrc)
	assignReversalSource(dst, 21, 20, parentSrc)
	assignReversalSource(dst, 30, 30, parentSrc)
	assignReversalSource(dst, 11, 99, parentSrc)
	if dst[11].No != "SI-4" {
		t.Fatalf("reversal did not follow the original already on the page: %+v", dst[11])
	}
	if dst[21].Type != "official_receipt" || dst[21].ID != 8 {
		t.Fatalf("reversal did not follow the parent lookup: %+v", dst[21])
	}
	if _, ok := dst[30]; ok {
		t.Fatal("self reversal was stored")
	}
	if _, ok := dst[11]; ok && dst[11].No != "SI-4" {
		t.Fatal("existing source was replaced")
	}
}
