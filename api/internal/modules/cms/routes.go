package cms

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	r.Route("/cms", func(sr chi.Router) {
		sr.Group(func(pr chi.Router) {
			pr.Use(auth.RequirePermission("cms.pages", auth.AccessRead))
			pr.Get("/pages", listPages(pool))
			pr.Get("/pages/by-slug/{slug}", getPageBySlug(pool))
			pr.Get("/pages/{id}/revisions", listPageRevisions(pool))
			pr.Get("/pages/{id}", getPage(pool))
			pr.Get("/topics", listTopics(pool))
			pr.Get("/redirects", listRedirects(pool))
		})
		sr.Group(func(pr chi.Router) {
			pr.Use(auth.RequirePermission("cms.pages_write", auth.AccessWrite))
			pr.Post("/pages", createPage(pool))
			pr.Patch("/pages/{id}", patchPage(pool))
			pr.Post("/pages/{id}/clone", clonePage(pool))
			pr.Post("/pages/{id}/preview-token", issuePreviewToken(pool))
			pr.Post("/pages/{id}/generate", generatePage(pool, cfg))
			pr.Post("/pages/{id}/revisions/{rid}/restore", restorePageRevision(pool))
			pr.Delete("/pages/{id}", deletePage(pool))
			pr.Post("/redirects", createRedirect(pool))
			pr.Delete("/redirects/{id}", deleteRedirect(pool))
		})
		sr.Group(func(pr chi.Router) {
			pr.Use(auth.RequirePermission("cms.pages_publish", auth.AccessWrite))
			pr.Post("/pages/{id}/publish", publishPage(pool))
			pr.Post("/pages/{id}/unpublish", unpublishPage(pool))
			pr.Post("/pages/{id}/archive", archivePage(pool))
		})
		sr.Group(func(mr chi.Router) {
			mr.Use(auth.RequirePermission("cms.media", auth.AccessRead))
			mr.Get("/media", listMedia(pool))
		})
		sr.With(requireMediaOrPagesRead).Get("/media/{id}/download", downloadMedia(pool))
		sr.Group(func(mw chi.Router) {
			mw.Use(auth.RequirePermission("cms.media_write", auth.AccessWrite))
			mw.Post("/media", uploadMedia(pool))
			mw.Patch("/media/{id}", patchMedia(pool))
			mw.Delete("/media/{id}", deleteMedia(pool))
		})
	})
}

func requireMediaOrPagesRead(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if tu.HasPermission("cms.media", auth.AccessRead) || tu.HasPermission("cms.pages", auth.AccessRead) {
			next.ServeHTTP(w, r)
			return
		}
		response.Err(w, http.StatusForbidden, "You do not have permission for this action.", "ERR_FORBIDDEN")
	})
}

func canWritePages(tu auth.TenantUser) bool {
	return tu.HasPermission("cms.pages_write", auth.AccessWrite)
}

func orderSQL(order string) string {
	if order == "desc" {
		return "desc"
	}
	return "asc"
}
