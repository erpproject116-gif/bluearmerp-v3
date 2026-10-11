package services

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/services", func(sr chi.Router) {
		sr.Use(requireEnabled(pool))

		sr.With(auth.RequirePermission("services.settings", auth.AccessRead)).Get("/settings", getSettings(pool))
		sr.With(auth.RequirePermission("services.settings", auth.AccessWrite)).Patch("/settings", patchSettings(pool))
		sr.Get("/types", listTypes(pool))
		sr.With(auth.RequirePermission("services.settings", auth.AccessWrite)).Post("/types", createType(pool))
		sr.With(auth.RequirePermission("services.settings", auth.AccessWrite)).Patch("/types/{id}", patchType(pool))
		sr.With(auth.RequirePermission("services.settings", auth.AccessRead)).Get("/transitions", listTransitions(pool))
		sr.With(auth.RequirePermission("services.settings", auth.AccessWrite)).Post("/transitions", createTransition(pool))
		sr.With(auth.RequirePermission("services.settings", auth.AccessRead)).Get("/checklists", listChecklistTemplates(pool))
		sr.With(auth.RequirePermission("services.settings", auth.AccessWrite)).Post("/checklists", createChecklistTemplate(pool))

		sr.With(auth.RequirePermission("services.requests", auth.AccessRead)).Get("/requests", listRequests(pool))
		sr.With(auth.RequirePermission("services.requests", auth.AccessRead)).Get("/requests/{id}", getRequest(pool))
		sr.With(auth.RequirePermission("services.requests", auth.AccessWrite)).Post("/requests", createRequest(pool))
		sr.With(auth.RequirePermission("services.requests", auth.AccessWrite)).Patch("/requests/{id}", patchRequest(pool))
		sr.With(auth.RequirePermission("services.requests", auth.AccessWrite)).Delete("/requests/{id}", deleteRequest(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessWrite)).Post("/requests/{id}/convert", convertRequest(pool))

		sr.With(auth.RequirePermission("services.jobs", auth.AccessRead)).Get("/jobs", listJobs(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessRead)).Get("/jobs/{id}", getJob(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessWrite)).Post("/jobs", createJob(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessWrite)).Patch("/jobs/{id}", patchJob(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessWrite)).Patch("/jobs/{id}/status", patchJobStatus(pool))
		sr.With(auth.RequirePermission("services.jobs_confirm", auth.AccessWrite)).Post("/jobs/{id}/confirm", confirmJob(pool))
		sr.With(auth.RequirePermission("services.jobs_reopen", auth.AccessWrite)).Post("/jobs/{id}/reopen", reopenJob(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessWrite)).Delete("/jobs/{id}", deleteJob(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessWrite)).Post("/jobs/from-sales-order/{salesOrderId}", jobFromSalesOrder(pool))

		sr.With(auth.RequirePermission("services.jobs", auth.AccessRead)).Get("/jobs/{id}/tasks", listTasks(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessWrite)).Post("/jobs/{id}/tasks", createTask(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessWrite)).Patch("/tasks/{id}", patchTask(pool))
		sr.With(auth.RequirePermission("services.schedule", auth.AccessRead)).Get("/jobs/{id}/assignments", listJobAssignments(pool))
		sr.With(auth.RequirePermission("services.schedule", auth.AccessWrite)).Post("/jobs/{id}/assignments", createAssignment(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessWrite)).Post("/jobs/{id}/time-entries", createTimeEntry(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessRead)).Get("/jobs/{id}/checklists", listChecklistResults(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessWrite)).Patch("/checklist-results/{id}", patchChecklistResult(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessRead)).Get("/jobs/{id}/materials", listMaterials(pool))
		sr.With(auth.RequirePermission("services.jobs", auth.AccessWrite)).Post("/jobs/{id}/materials", createMaterial(pool))

		sr.With(auth.RequirePermission("services.schedule", auth.AccessRead)).Get("/schedule", listSchedule(pool))

		sr.With(auth.RequirePermission("services.equipment", auth.AccessRead)).Get("/equipment", listEquipment(pool))
		sr.With(auth.RequirePermission("services.equipment", auth.AccessRead)).Get("/equipment/{id}", getEquipment(pool))
		sr.With(auth.RequirePermission("services.equipment", auth.AccessRead)).Get("/equipment/{id}/custody", listCustody(pool))
		sr.With(auth.RequirePermission("services.equipment", auth.AccessWrite)).Post("/equipment", createEquipment(pool))
		sr.With(auth.RequirePermission("services.equipment", auth.AccessWrite)).Patch("/equipment/{id}", patchEquipment(pool))
		sr.With(auth.RequirePermission("services.equipment_correct", auth.AccessWrite)).Post("/equipment/{id}/ownership", correctOwnership(pool))

		sr.With(auth.RequirePermission("services.releases", auth.AccessRead)).Get("/load-slips", listSlips(pool))
		sr.With(auth.RequirePermission("services.releases", auth.AccessRead)).Get("/load-slips/{id}", getSlip(pool))
		sr.With(auth.RequirePermission("services.releases", auth.AccessRead)).Get("/load-slips/{id}/print", getSlip(pool))
		sr.With(auth.RequirePermission("services.releases", auth.AccessWrite)).Post("/load-slips", createSlip(pool))
		sr.With(auth.RequirePermission("services.releases", auth.AccessWrite)).Post("/load-slips/{id}/submit", submitSlip(pool))
		sr.With(auth.RequirePermission("services.releases_approve", auth.AccessWrite)).Post("/load-slips/{id}/approve", approveSlip(pool))
		sr.With(auth.RequirePermission("services.releases", auth.AccessWrite)).Post("/load-slips/{id}/dispatch", dispatchSlip(pool))
		sr.With(auth.RequirePermission("services.releases", auth.AccessWrite)).Post("/load-slips/{id}/receive", receiveSlip(pool))
		sr.With(auth.RequirePermission("services.releases", auth.AccessWrite)).Post("/load-slips/{id}/release", releaseSlip(pool))
		sr.With(auth.RequirePermission("services.releases", auth.AccessWrite)).Delete("/load-slips/{id}", deleteSlip(pool))

		sr.With(auth.RequirePermission("services.jobs", auth.AccessRead)).Get("/history", searchHistory(pool))
		sr.With(auth.RequirePermission("services.reports", auth.AccessRead)).Get("/reports/summary", reportSummary(pool))
	})
}
