package pos

import "testing"

func TestCatalogTrackedIncludesLot(t *testing.T) {
	if !catalogTracked(CatalogItem{TrackLot: true}) {
		t.Fatal("track_lot alone should be tracked for stock badges")
	}
	if catalogTracked(CatalogItem{}) {
		t.Fatal("untracked item")
	}
}
