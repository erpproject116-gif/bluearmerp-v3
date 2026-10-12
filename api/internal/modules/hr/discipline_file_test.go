package hr

import "testing"

func TestDisciplineFileRules(t *testing.T) {
	if !disciplineAdvanceNeedsFile("under_review") || !disciplineAdvanceNeedsFile("decide") || !disciplineAdvanceNeedsFile("close") {
		t.Fatal("review, decide, and close require a stored file")
	}
	if disciplineAdvanceNeedsFile("cancel") {
		t.Fatal("cancel stays available without a file")
	}
	if !isStoredDisciplineFile(12, "", 9, 4) {
		t.Fatal("a linked file with bytes counts")
	}
	if isStoredDisciplineFile(0, "", 9, 0) {
		t.Fatal("empty bytes do not count")
	}
	if isStoredDisciplineFile(40, generatedDisciplineLetterNote, 4, 0) {
		t.Fatal("generated letter bytes do not count")
	}
	if isStoredDisciplineFile(40, "", 4, 4) {
		t.Fatal("the case letter document does not count")
	}
}
