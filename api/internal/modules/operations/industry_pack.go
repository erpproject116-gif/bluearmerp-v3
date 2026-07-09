package operations

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"time"
)

//go:embed packs/construction.json
var constructionPackJSON []byte

type IndustryColumn struct {
	Key       string `json:"key"`
	Name      string `json:"name"`
	SortOrder int    `json:"sort_order"`
	Color     string `json:"color"`
}

type IndustryWorkItem struct {
	Title               string `json:"title"`
	ColumnKey           string `json:"column_key"`
	Priority            string `json:"priority"`
	StartDateOffsetDays int    `json:"start_date_offset_days"`
	EndDateOffsetDays   int    `json:"end_date_offset_days"`
}

type IndustryAutomationRule struct {
	RuleName       string         `json:"rule_name"`
	TriggerEvent   string         `json:"trigger_event"`
	TriggerConfig  map[string]any `json:"trigger_config"`
	ActionType     string         `json:"action_type"`
	ActionConfig   map[string]any `json:"action_config"`
}

type IndustryDashboardWidget struct {
	WidgetType string         `json:"widget_type"`
	Title      string         `json:"title"`
	GridX      int            `json:"grid_x"`
	GridY      int            `json:"grid_y"`
	GridW      int            `json:"grid_w"`
	GridH      int            `json:"grid_h"`
	SortOrder  int            `json:"sort_order"`
	Config     map[string]any `json:"config"`
}

type IndustryPack struct {
	PackCode           string                    `json:"pack_code"`
	PackName           string                    `json:"pack_name"`
	Columns            []IndustryColumn          `json:"columns"`
	SampleWorkItems    []IndustryWorkItem        `json:"sample_work_items"`
	AutomationRules    []IndustryAutomationRule  `json:"automation_rules"`
	DashboardWidgets   []IndustryDashboardWidget `json:"dashboard_widgets"`
}

func loadIndustryPack(code string) (IndustryPack, error) {
	switch code {
	case "construction":
		var pack IndustryPack
		if err := json.Unmarshal(constructionPackJSON, &pack); err != nil {
			return IndustryPack{}, err
		}
		return pack, nil
	default:
		return IndustryPack{}, fmt.Errorf("unknown industry pack: %s", code)
	}
}

func listIndustryPacks() []map[string]string {
	return []map[string]string{
		{"pack_code": "construction", "pack_name": "Construction"},
	}
}

func offsetDate(days int) *time.Time {
	d := time.Now().UTC().AddDate(0, 0, days)
	return &d
}
