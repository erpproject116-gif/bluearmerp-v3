package operations

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// allocateInventoryProject reserves the next tenant project code and inserts inv_projects.
// Must use allocate_tenant_code (not preview_next_tenant_code) so each workspace gets a unique code.
func allocateInventoryProject(ctx context.Context, tx pgx.Tx, tenantID int64, projectName string) (int64, string, error) {
	var invProjectCode string
	if err := tx.QueryRow(ctx, `select public.allocate_tenant_code($1, 'project')`, tenantID).Scan(&invProjectCode); err != nil {
		return 0, "", fmt.Errorf("allocate project code: %w", err)
	}
	var invProjectID int64
	if err := tx.QueryRow(ctx, `
		insert into public.inv_projects (tenant_id, project_code, project_name, status)
		values ($1, $2, $3, 'active')
		returning id`,
		tenantID, invProjectCode, strings.TrimSpace(projectName),
	).Scan(&invProjectID); err != nil {
		return 0, "", fmt.Errorf("insert inventory project: %w", err)
	}
	return invProjectID, invProjectCode, nil
}

func createJobCostProject(ctx context.Context, tx pgx.Tx, tenantID int64, projectCode, projectName string, invProjectID int64) (int64, error) {
	var jobCostProjectID int64
	if err := tx.QueryRow(ctx, `
		insert into public.job_cost_projects (
		  tenant_id, project_code, project_name, inv_project_id, status
		) values ($1, $2, $3, $4, 'active')
		returning id`,
		tenantID, strings.TrimSpace(projectCode), strings.TrimSpace(projectName), invProjectID,
	).Scan(&jobCostProjectID); err != nil {
		return 0, fmt.Errorf("insert job cost project: %w", err)
	}
	return jobCostProjectID, nil
}

func inventoryProjectErrorMessage(err error) string {
	if err == nil {
		return "Failed to create inventory project."
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "duplicate") || strings.Contains(msg, "unique") {
		return "Failed to create inventory project: project code already in use. Create a project from Stock → Projects or contact support to reset project numbering."
	}
	if strings.Contains(msg, "code limit exceeded") {
		return "Failed to create inventory project: tenant project code limit (99,999) reached."
	}
	return "Failed to create inventory project."
}
