package inventory

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var locationImportHeaders = []string{"location_name", "location_type", "is_rma", "production_process"}

func locationImportTemplateHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="locations-import-template.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write(locationImportHeaders)
		_ = cw.Write([]string{"Main warehouse", "location", "false", "bundle"})
		cw.Flush()
	}
}

type locationImportResult struct {
	Created   int              `json:"created"`
	Skipped   int              `json:"skipped"`
	Failed    int              `json:"failed"`
	RowErrors []importRowError `json:"row_errors,omitempty"`
}

func locationImportCSVHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if err := r.ParseMultipartForm(itemImportMaxBytes); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid upload."})
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "CSV file is required."})
			return
		}
		defer file.Close()
		records, err := csv.NewReader(file).ReadAll()
		if err != nil {
			response.Validation(w, map[string]string{"file": "Could not read CSV."})
			return
		}
		if len(records) < 2 {
			response.Validation(w, map[string]string{"file": "CSV must include a header row and at least one data row."})
			return
		}
		colIdx, err := mapCSVHeaders(records[0], []string{"location_name"})
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}
		dataRows := records[1:]
		if len(dataRows) > itemImportMaxRows {
			response.Validation(w, map[string]string{"file": fmt.Sprintf("Maximum %d rows per import.", itemImportMaxRows)})
			return
		}

		result := locationImportResult{}
		seen := map[string]struct{}{}
		for i, raw := range dataRows {
			rowNum := i + 2
			if isEmptyCSVRow(raw) {
				continue
			}
			row := map[string]string{}
			for _, col := range locationImportHeaders {
				if i, ok := colIdx[col]; ok && i < len(raw) {
					row[col] = strings.TrimSpace(raw[i])
				}
			}
			body, err := parseLocationImportRow(row)
			if err != nil {
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: err.Error()})
				continue
			}
			key := strings.ToLower(body.LocationName)
			if _, dup := seen[key]; dup {
				result.Skipped++
				continue
			}
			exists, err := locationNameExists(r.Context(), pool, tu.TenantID, body.LocationName)
			if err != nil {
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: "Could not check existing locations."})
				continue
			}
			if exists {
				seen[key] = struct{}{}
				result.Skipped++
				continue
			}
			_, _, err = createWithCode(r.Context(), pool, tu, "location", func(ctx context.Context, tx pgxpoolConn, code string) (int64, Location, error) {
				var id int64
				var created Location
				err := tx.QueryRow(ctx, `
					insert into public.inv_locations (tenant_id, location_code, location_name, location_type, production_process, status, is_rma)
					values ($1,$2,$3,$4,$5,'active',$6)
					returning id, location_code, location_name, location_type, production_process, status, coalesce(is_rma, false)`,
					tu.TenantID, code, body.LocationName, body.LocationType, body.ProductionProcess, body.IsRMA).
					Scan(&id, &created.LocationCode, &created.LocationName, &created.LocationType, &created.ProductionProcess, &created.Status, &created.IsRMA)
				created.ID = id
				return id, created, err
			})
			if err != nil {
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: "Could not create location."})
				continue
			}
			seen[key] = struct{}{}
			result.Created++
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.location.import", "inv_location", nil, nil, map[string]any{
			"created": result.Created, "skipped": result.Skipped, "failed": result.Failed,
		})
		response.OK(w, result, fmt.Sprintf("Imported %d, skipped %d, failed %d.", result.Created, result.Skipped, result.Failed))
	}
}

func parseLocationImportRow(row map[string]string) (locationBody, error) {
	name := strings.TrimSpace(row["location_name"])
	if name == "" {
		return locationBody{}, fmt.Errorf("location_name is required")
	}
	locType := strings.ToLower(strings.TrimSpace(row["location_type"]))
	if locType == "" {
		locType = "location"
	}
	if locType != "location" && locType != "factory" && locType != "factory_oe_manage" {
		return locationBody{}, fmt.Errorf("type must be location, factory, or factory_oe_manage")
	}
	process := strings.ToLower(strings.TrimSpace(row["production_process"]))
	if process == "" {
		process = "bundle"
	}
	if process != "bundle" && process != "service" {
		return locationBody{}, fmt.Errorf("production process must be bundle or service")
	}
	return locationBody{
		LocationName:      name,
		LocationType:      locType,
		ProductionProcess: process,
		Status:            "active",
		IsRMA:             parseCSVYes(row["is_rma"]),
	}, nil
}

func parseCSVYes(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "1", "true", "yes", "y":
		return true
	default:
		return false
	}
}

func locationNameExists(ctx context.Context, pool *pgxpool.Pool, tenantID int64, name string) (bool, error) {
	var exists bool
	err := pool.QueryRow(ctx, `
		select exists(
		  select 1 from public.inv_locations
		  where tenant_id = $1 and deleted_at is null and lower(location_name) = lower($2)
		)`, tenantID, strings.TrimSpace(name)).Scan(&exists)
	return exists, err
}
