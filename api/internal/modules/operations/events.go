package operations

import "context"

// EmitERPEvent is a stub hook for future ERP event bus integration.
// Call sites record intent; delivery is deferred to a later phase.
func EmitERPEvent(_ context.Context, _ int64, _ string, _ map[string]any) {
	// no-op stub
}
