package cms

import (
	_ "embed"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/helpassistant"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/llm"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

//go:embed prompts/system.txt
var articleSystemPrompt string

//go:embed prompts/example.md
var articleExample string

//go:embed prompts/capabilities.json
var articleCapabilitiesJSON []byte

var articleHeadings = []string{
	"Akala ninyo okay pa",
	"Magkano",
	"Bakit hindi kaya ng Excel o Viber",
	"Ano ang itsura ng proper system",
	"Kung ito ang Lunes ninyo",
}

var generateRateMu sync.Mutex
var generateRates = map[string]*rateBucket{}

type rateBucket struct {
	count   int
	resetAt time.Time
}

func allowGenerateRate(tenantID, userID int64) bool {
	key := strconv.FormatInt(tenantID, 10) + ":" + strconv.FormatInt(userID, 10)
	now := time.Now()
	generateRateMu.Lock()
	defer generateRateMu.Unlock()
	b, ok := generateRates[key]
	if !ok || now.After(b.resetAt) {
		generateRates[key] = &rateBucket{count: 1, resetAt: now.Add(time.Minute)}
		return true
	}
	if b.count >= 5 {
		return false
	}
	b.count++
	return true
}

func generatePage(pool *pgxpool.Pool, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		hcfg := helpassistant.ConfigFromEnv()
		if !hcfg.CopilotAvailable() {
			response.Err(w, http.StatusServiceUnavailable, "Baiko is not enabled.", "ERR_COPILOT_DISABLED")
			return
		}
		pubID, ok := publicTenantID(r, pool, cfg)
		if !ok || pubID != tu.TenantID {
			response.Err(w, http.StatusForbidden, "Article generation is only for the public catalog tenant.", "ERR_FORBIDDEN")
			return
		}
		if !allowGenerateRate(tu.TenantID, tu.AppUserID) {
			response.Err(w, http.StatusTooManyRequests, "Too many generate requests. Please wait a moment.", "ERR_COPILOT_RATE")
			return
		}
		if err := helpassistant.CheckDailyCap(r.Context(), pool, tu.TenantID, hcfg.DailyCap); err != nil {
			if err == helpassistant.ErrDailyTokenCap {
				response.Err(w, http.StatusTooManyRequests, "Daily AI token cap reached.", "ERR_COPILOT_CAP")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to check AI usage cap.", "ERR_INTERNAL")
			return
		}
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		existing, err := loadPage(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		var body struct {
			Ugat string `json:"ugat"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		topic := existing.Topic
		if topic == "" {
			topic = defaultTopic
		}
		facts := capabilitiesForTopic(topic)
		user := "TOPIC: " + topic + "\nUGAT: " + strings.TrimSpace(body.Ugat) + "\nTITLE hint: " + existing.Title + "\n\nPRODUCT FACTS:\n" + facts + "\n\nEXAMPLE:\n" + articleExample
		client := hcfg.NewDashScopeClient()
		out, err := client.ChatCompletionWithUsage(r.Context(), llm.ChatRequest{
			Model: hcfg.MediumModel,
			Messages: []llm.Message{
				{Role: "system", Content: articleSystemPrompt},
				{Role: "user", Content: user},
			},
			Temperature: 0.4,
			MaxTokens:   4096,
		})
		if err != nil {
			response.Err(w, http.StatusBadGateway, "Generation failed.", "ERR_COPILOT_ACTION")
			return
		}
		helpassistant.RecordUsage(r.Context(), pool, tu.TenantID, helpassistant.UsageOrEstimate(out.Usage, articleSystemPrompt+"\n"+user, out.Content))
		parsed, verr := validateGeneratedArticle(out.Content, topic)
		if verr != nil {
			response.Validation(w, verr)
			return
		}
		insertPageRevision(r.Context(), pool, tu.TenantID, tu.AppUserID, existing)
		_, err = pool.Exec(r.Context(), `
			update public.cms_pages set
			  title=$1, topic=$2, slug=$3, body=$4, seo_title=$5, seo_description=$6,
			  lang='tl', status='draft', updated_by_user_id=$7, updated_at=now()
			where id=$8 and tenant_id=$9 and deleted_at is null`,
			parsed.Title, parsed.Topic, parsed.Slug, parsed.Body, parsed.SEOTitle, parsed.SEODescription,
			tu.AppUserID, id, tu.TenantID)
		if err != nil {
			if isUniqueViolation(err) {
				response.Validation(w, map[string]string{"slug": "That slug is already used."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to save draft.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.page.generate", "cms_page", &id, nil, nil)
		row, _ := loadPage(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Draft generated")
	}
}

func capabilitiesForTopic(topic string) string {
	var m map[string][]string
	if err := json.Unmarshal(articleCapabilitiesJSON, &m); err != nil {
		return ""
	}
	list := m[topic]
	if len(list) == 0 {
		list = m["blog"]
	}
	return strings.Join(list, "\n")
}

type generatedArticle struct {
	Title          string
	Topic          string
	Slug           string
	Body           string
	SEOTitle       *string
	SEODescription *string
}

func validateGeneratedArticle(raw, wantTopic string) (generatedArticle, map[string]string) {
	s := strings.TrimSpace(raw)
	s = strings.TrimPrefix(s, "```markdown")
	s = strings.TrimPrefix(s, "```md")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "---") {
		return generatedArticle{}, map[string]string{"body": "Expected YAML frontmatter."}
	}
	end := strings.Index(s[3:], "\n---")
	if end < 0 {
		return generatedArticle{}, map[string]string{"body": "Expected YAML frontmatter."}
	}
	fm := s[4 : 3+end]
	body := strings.TrimSpace(s[3+end+4:])
	if strings.HasPrefix(body, "\n") {
		body = strings.TrimPrefix(body, "\n")
	}
	errs := map[string]string{}
	title := yamlLine(fm, "title")
	topic := normalizeSlug(yamlLine(fm, "topic"))
	slug := normalizeSlug(yamlLine(fm, "slug"))
	seoT := yamlLine(fm, "seo_title")
	seoD := yamlLine(fm, "seo_description")
	if !isPrintableTitle(title) {
		errs["title"] = "Required."
	}
	if strings.Contains(strings.ToLower(title), "bluearm") {
		errs["title"] = "Do not put Bluearm in the H1."
	}
	if !strings.Contains(title, "?") {
		errs["title"] = "Title must be a question."
	}
	if topic == "" {
		topic = wantTopic
	}
	if topic != wantTopic {
		errs["topic"] = "Topic must match the page."
	}
	if !validSlug(slug) {
		errs["slug"] = "Use lowercase letters, numbers, and hyphens."
	}
	if len(body) > maxPageBodyBytes {
		errs["body"] = "Body too large (max 200KB)."
	}
	if strings.Contains(strings.ToLower(body), "facebook.com/bluearmerpglobal") {
		errs["body"] = "Do not paste the Facebook footer into the body."
	}
	if strings.Contains(body, "<") && strings.Contains(body, ">") {
		errs["body"] = "No raw HTML."
	}
	words := wordCount(body)
	if words < 400 || words > 1100 {
		errs["body"] = "Word count must be about 500–900."
	}
	for _, h := range articleHeadings {
		if !strings.Contains(body, "## "+h) {
			errs["body"] = "Missing heading: " + h
			break
		}
	}
	if len(errs) > 0 {
		return generatedArticle{}, errs
	}
	var st, sd *string
	if seoT != "" {
		st = &seoT
	}
	if seoD != "" {
		if len(seoD) > maxSEODescLen {
			seoD = seoD[:maxSEODescLen]
		}
		sd = &seoD
	}
	return generatedArticle{Title: title, Topic: topic, Slug: slug, Body: body, SEOTitle: st, SEODescription: sd}, nil
}

func yamlLine(fm, key string) string {
	re := regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(key) + `:\s*(.*)$`)
	m := re.FindStringSubmatch(fm)
	if len(m) < 2 {
		return ""
	}
	s := strings.TrimSpace(m[1])
	s = strings.Trim(s, `"'`)
	return s
}

func wordCount(s string) int {
	n := 0
	in := false
	for _, r := range s {
		if unicode.IsSpace(r) {
			in = false
			continue
		}
		if !in {
			n++
			in = true
		}
	}
	return n
}
