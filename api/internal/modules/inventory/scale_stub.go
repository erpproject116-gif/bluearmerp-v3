package inventory

// ScaleReading is a weight sample from a scale device or manual entry.
type ScaleReading struct {
	WeightKg float64 `json:"weight_kg"`
	Stable   bool    `json:"stable"`
	Source   string  `json:"source"`
}

// ScaleDriver reads weight from a connected scale. Phase 4 defers hardware integration.
type ScaleDriver interface {
	ReadWeight() (ScaleReading, error)
}

// ManualScaleDriver returns operator-entered weight (fallback when no hardware is connected).
type ManualScaleDriver struct {
	WeightKg float64
}

func (d ManualScaleDriver) ReadWeight() (ScaleReading, error) {
	return ScaleReading{
		WeightKg: d.WeightKg,
		Stable:   true,
		Source:   "manual",
	}, nil
}

// NewManualScaleDriver creates a manual fallback scale driver.
func NewManualScaleDriver(weightKg float64) ScaleDriver {
	return ManualScaleDriver{WeightKg: weightKg}
}
