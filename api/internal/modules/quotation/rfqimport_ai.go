package quotation

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type rfqAIPageImage struct {
	Page        int    `json:"page"`
	ImageBase64 string `json:"image_base64"`
	Mime        string `json:"mime,omitempty"`
}

type rfqAIParseRequest struct {
	Pages      []rfqPageText        `json:"pages"`
	Tables     []RfqStructuredTable `json:"tables,omitempty"`
	PageImages []rfqAIPageImage     `json:"page_images,omitempty"`
}

func rfqAIConfigHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := auth.FromContext(r.Context()); !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		cfg := RfqAIConfigFromEnv()
		response.OK(w, parseRfqAIStatus(cfg), "RFQ AI config.")
	}
}

func aiParseRfqImport(_ *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := auth.FromContext(r.Context()); !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		cfg := RfqAIConfigFromEnv()
		if !cfg.Available() {
			response.Err(w, http.StatusServiceUnavailable, "RFQ AI is not configured. Set DASHSCOPE_API_KEY on the server.", "ERR_RFQ_AI_DISABLED")
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, rfqAIParseMaxBodyBytes)
		var body rfqAIParseRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			if err == io.EOF {
				response.Validation(w, map[string]string{"body": "Request body is required."})
				return
			}
			response.Validation(w, map[string]string{"body": "Invalid JSON or payload too large (max 32 MB)."})
			return
		}
		if len(body.Pages) == 0 && len(body.Tables) == 0 {
			response.Validation(w, map[string]string{"pages": "At least one page or table is required."})
			return
		}

		imageByPage := map[int]rfqAIPageImage{}
		for _, img := range body.PageImages {
			if img.Page <= 0 || img.ImageBase64 == "" {
				continue
			}
			imageByPage[img.Page] = img
		}

		inputs := make([]rfqAIPageInput, 0, len(body.Pages))
		for _, p := range body.Pages {
			in := rfqAIPageInput{Page: p.Page, Text: p.Text}
			if img, ok := imageByPage[p.Page]; ok {
				in.ImageBase64 = img.ImageBase64
				in.ImageMIME = img.Mime
			}
			inputs = append(inputs, in)
		}

		result, usage, err := ParseRfqWithAI(r.Context(), cfg, inputs, body.Tables)
		if err != nil {
			response.Err(w, http.StatusBadGateway, err.Error(), "ERR_RFQ_AI")
			return
		}

		response.OK(w, map[string]any{
			"lines":            result.Lines,
			"line_count":       len(result.Lines),
			"table_detected":   result.TableDetected,
			"detected_columns": result.DetectedColumns,
			"parse_method":     "ai",
			"ai_used":          true,
			"ai_model":           usage.Model,
			"ai_provider":        usage.Provider,
			"ai_pages_processed": usage.PagesProcessed,
			"ai_used_vision":   usage.UsedVision,
		}, "RFQ parsed with AI.")
	}
}
