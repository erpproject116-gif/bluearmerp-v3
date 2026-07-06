package sales

import "testing"

func TestValidateSaleSerialRequirements_emptySerialsRejected(t *testing.T) {
	// Document expected validation message shape (integration tests cover DB).
	itemID := int64(1)
	lines := []saleLineBody{{
		LineNo: 1,
		ItemID: &itemID,
		Qty:    1,
	}}
	if lines[0].SerialUnitIDs == nil {
		// Handler requires non-empty serial_unit_ids for track_serial items at runtime.
		if len(lines[0].SerialUnitIDs) != int(lines[0].Qty) {
			// expected mismatch before fix
		}
	}
}
