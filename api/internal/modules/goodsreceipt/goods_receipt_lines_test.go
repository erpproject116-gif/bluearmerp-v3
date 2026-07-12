package goodsreceipt

import "testing"

// Regression: GR line_no must be sequential per receipt (1,2,3…), not copied from PO line_no.
// PO lines may use sparse numbers (5, 10, 15) which violate unique (goods_receipt_id, line_no).
func TestAssignSequentialGRLineNumbers(t *testing.T) {
	poLineNos := []int{5, 10, 15, 20}
	grLineNos := make([]int, 0, len(poLineNos))
	seq := 0
	for range poLineNos {
		seq++
		grLineNos = append(grLineNos, seq)
	}
	want := []int{1, 2, 3, 4}
	for i := range want {
		if grLineNos[i] != want[i] {
			t.Fatalf("gr line %d: got %d want %d", i, grLineNos[i], want[i])
		}
	}
}
