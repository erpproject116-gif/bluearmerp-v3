package migration

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

var bomCanonical = []string{
	"bom_code", "bom_name", "finished_item_code", "bom_type",
	"component_item_code", "qty", "scrap_qty", "yield_pct",
}
var bomRequired = []string{"bom_code", "finished_item_code", "component_item_code", "qty"}

func importBomsMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedBomsHandler(pool, false)
}

func previewBomsMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedBomsHandler(pool, true)
}

type bomImportLine struct {
	ComponentItemID int64
	Qty             float64
	ScrapQty        float64
	Row             int
}

type bomImportGroup struct {
	BomCode        string
	BomName        string
	FinishedItemID int64
	BomType        string
	YieldPct       float64
	Lines          map[int64]bomImportLine
	FirstRow       int
}

func mappedBomsHandler(pool *pgxpool.Pool, forcePreview bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, ok := readMapped(w, r, pool, "boms", bomRequired, bomCanonical)
		if !ok {
			return
		}
		dry := forcePreview || parseJobDefaults(r).DryRun
		result := importResult{}

		groups := map[string]*bomImportGroup{}
		order := []string{}

		for i, row := range rows {
			rowNum := i + 2
			bomCode := strings.TrimSpace(row["bom_code"])
			if bomCode == "" {
				failRow(&result, rowNum, "bom_code is required")
				continue
			}
			finished, errMsg := lookupItem(r.Context(), pool, tu.TenantID, strings.TrimSpace(row["finished_item_code"]), "")
			if errMsg != "" {
				failRow(&result, rowNum, errMsg)
				continue
			}
			component, compErr := lookupItem(r.Context(), pool, tu.TenantID, strings.TrimSpace(row["component_item_code"]), "")
			if compErr != "" {
				failRow(&result, rowNum, compErr)
				continue
			}
			if component.ID == finished.ID {
				failRow(&result, rowNum, "component cannot be the finished item")
				continue
			}
			bomType := normalizeImportBomType(row["bom_type"])
			if bomType != "assembly" && bomType != "disassembly" {
				failRow(&result, rowNum, "bom_type must be assembly or disassembly")
				continue
			}
			qty := parseFloatDefault(row["qty"], 0)
			if qty <= 0 {
				failRow(&result, rowNum, "qty must be greater than 0")
				continue
			}
			scrapQty := parseFloatDefault(row["scrap_qty"], 0)
			if scrapQty < 0 {
				failRow(&result, rowNum, "scrap_qty cannot be negative")
				continue
			}
			yieldPct := parseFloatDefault(row["yield_pct"], 100)
			if yieldPct <= 0 {
				failRow(&result, rowNum, "yield_pct must be greater than 0")
				continue
			}
			bomName := strings.TrimSpace(row["bom_name"])
			if bomName == "" {
				bomName = bomCode
			}

			g, exists := groups[bomCode]
			if !exists {
				g = &bomImportGroup{
					BomCode:        bomCode,
					BomName:        bomName,
					FinishedItemID: finished.ID,
					BomType:        bomType,
					YieldPct:       yieldPct,
					Lines:          map[int64]bomImportLine{},
					FirstRow:       rowNum,
				}
				groups[bomCode] = g
				order = append(order, bomCode)
			} else {
				if g.FinishedItemID != finished.ID {
					failRow(&result, rowNum, fmt.Sprintf("finished_item_code mismatch for BOM %s", bomCode))
					continue
				}
				if g.BomType != bomType {
					failRow(&result, rowNum, fmt.Sprintf("bom_type mismatch for BOM %s", bomCode))
					continue
				}
				if strings.TrimSpace(row["bom_name"]) != "" && g.BomName != bomName {
					g.BomName = bomName
				}
				if strings.TrimSpace(row["yield_pct"]) != "" && g.YieldPct != yieldPct {
					g.YieldPct = yieldPct
				}
			}
			g.Lines[component.ID] = bomImportLine{
				ComponentItemID: component.ID,
				Qty:             qty,
				ScrapQty:        scrapQty,
				Row:             rowNum,
			}
		}

		if dry {
			for _, code := range order {
				g := groups[code]
				if len(g.Lines) == 0 {
					continue
				}
				var existingID int64
				_ = pool.QueryRow(r.Context(), `
					select id from public.mfg_boms where tenant_id = $1 and bom_code = $2`,
					tu.TenantID, g.BomCode).Scan(&existingID)
				if existingID > 0 {
					result.Updated++
				} else {
					result.Created++
				}
			}
			writeImportResult(w, result, true)
			return
		}

		for _, code := range order {
			g := groups[code]
			if len(g.Lines) == 0 {
				continue
			}
			if err := importBomGroup(r, pool, tu, g, &result); err != nil {
				failRow(&result, g.FirstRow, err.Error())
			}
		}
		writeImportResult(w, result, false)
	}
}

func importBomGroup(r *http.Request, pool *pgxpool.Pool, tu auth.TenantUser, g *bomImportGroup, result *importResult) error {
	tx, err := pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())

	var bomID int64
	var created bool
	err = tx.QueryRow(r.Context(), `
		select id from public.mfg_boms where tenant_id = $1 and bom_code = $2`,
		tu.TenantID, g.BomCode).Scan(&bomID)
	if err != nil {
		if err != pgx.ErrNoRows {
			return err
		}
		err = tx.QueryRow(r.Context(), `
			insert into public.mfg_boms (
			  tenant_id, bom_code, bom_name, finished_item_id, output_qty, yield_pct, bom_type, is_active
			) values ($1,$2,$3,$4,1,$5,$6,true)
			returning id`,
			tu.TenantID, g.BomCode, g.BomName, g.FinishedItemID, g.YieldPct, g.BomType).Scan(&bomID)
		if err != nil {
			return err
		}
		created = true
	} else {
		_, err = tx.Exec(r.Context(), `
			update public.mfg_boms set
			  bom_name = $2, finished_item_id = $3, yield_pct = $4, bom_type = $5, updated_at = now()
			where id = $1 and tenant_id = $6`,
			bomID, g.BomName, g.FinishedItemID, g.YieldPct, g.BomType, tu.TenantID)
		if err != nil {
			return err
		}
	}

	for _, ln := range g.Lines {
		var lineID int64
		err = tx.QueryRow(r.Context(), `
			select id from public.mfg_bom_lines
			where bom_id = $1 and component_item_id = $2`, bomID, ln.ComponentItemID).Scan(&lineID)
		if err == nil {
			_, err = tx.Exec(r.Context(), `
				update public.mfg_bom_lines set qty = $2, scrap_qty = $3
				where id = $1`, lineID, ln.Qty, ln.ScrapQty)
			if err != nil {
				return err
			}
			continue
		}
		if err != pgx.ErrNoRows {
			return err
		}
		var nextLine int
		_ = tx.QueryRow(r.Context(), `
			select coalesce(max(line_no), 0) + 1 from public.mfg_bom_lines where bom_id = $1`, bomID).Scan(&nextLine)
		var baseUnitID int64
		_ = tx.QueryRow(r.Context(), `
			select coalesce(base_unit_id, 0) from public.inv_items
			where id = $1 and tenant_id = $2`, ln.ComponentItemID, tu.TenantID).Scan(&baseUnitID)
		var unitID any
		if baseUnitID > 0 {
			unitID = baseUnitID
		}
		_, err = tx.Exec(r.Context(), `
			insert into public.mfg_bom_lines (bom_id, line_no, component_item_id, qty, unit_id, scrap_qty)
			values ($1,$2,$3,$4,$5,$6)`,
			bomID, nextLine, ln.ComponentItemID, ln.Qty, unitID, ln.ScrapQty)
		if err != nil {
			return err
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		return err
	}
	if created {
		result.Created++
	} else {
		result.Updated++
	}
	return nil
}

func normalizeImportBomType(v string) string {
	switch strings.TrimSpace(strings.ToLower(v)) {
	case "disassembly":
		return "disassembly"
	case "", "assembly":
		return "assembly"
	default:
		return strings.TrimSpace(strings.ToLower(v))
	}
}
