package cms

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
)

func TestNormalizeSlug(t *testing.T) {
	cases := map[string]string{
		"Hello World":     "hello-world",
		"  Load  Slip!! ": "load-slip",
		"a--b":            "a-b",
		"":                "",
	}
	for in, want := range cases {
		if got := normalizeSlug(in); got != want {
			t.Fatalf("normalizeSlug(%q)=%q want %q", in, got, want)
		}
	}
}

func TestValidSlug(t *testing.T) {
	if !validSlug("load-slip") || !validSlug("a") {
		t.Fatal("expected valid slugs")
	}
	if validSlug("") || validSlug("-a") || validSlug("A") || validSlug("hello_world") {
		t.Fatal("expected invalid slugs")
	}
}

func TestSlugFromTitle(t *testing.T) {
	if slugFromTitle("!!!") != "page" {
		t.Fatal("empty title should become page")
	}
	if slugFromTitle("Open this area") != "open-this-area" {
		t.Fatal(slugFromTitle("Open this area"))
	}
}

func TestArticlePermalink(t *testing.T) {
	if articlePermalink("sme-walang-sistema", "meron-pa-na-palaging-mali") != "/articles/sme-walang-sistema/meron-pa-na-palaging-mali" {
		t.Fatal(articlePermalink("sme-walang-sistema", "meron-pa-na-palaging-mali"))
	}
	if articlePermalink("", "store-hours") != "/articles/blog/store-hours" {
		t.Fatal(articlePermalink("", "store-hours"))
	}
}

func TestAllowedUpload(t *testing.T) {
	if !allowedUpload("image/png", "logo.png") || !allowedUpload("application/pdf", "a.pdf") {
		t.Fatal("expected allow")
	}
	if allowedUpload("image/svg+xml", "x.svg") || allowedUpload("text/html", "x.html") || allowedUpload("application/javascript", "x.js") {
		t.Fatal("expected reject scriptable types")
	}
	if allowedUpload("image/png", "x.svg") {
		t.Fatal("extension must match mime")
	}
}

func TestSniffAllowedMIME(t *testing.T) {
	png := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	got, ok := sniffAllowedMIME(png, "application/octet-stream", "x.bin")
	if !ok || got != "image/png" {
		t.Fatalf("png sniff %q %v", got, ok)
	}
	if _, ok := sniffAllowedMIME([]byte("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "image/svg+xml", "x.svg"); ok {
		t.Fatal("svg must be rejected")
	}
}

func TestAttachmentxCmsDir(t *testing.T) {
	got := attachmentx.Dir("cms")
	if got != "data/cms-media" && filepath.Base(got) != "cms-media" {
		t.Fatalf("cms dir %q", got)
	}
	if attachmentx.Dir("quotation") == got {
		t.Fatal("cms dir must not replace quotation")
	}
}

func TestPageVisibleToReader(t *testing.T) {
	if pageVisibleToReader("published") != true {
		t.Fatal("published")
	}
	if pageVisibleToReader("draft") || pageVisibleToReader("archived") {
		t.Fatal("draft/archived hidden from readers")
	}
}

func TestNormalizeLangVisibility(t *testing.T) {
	if normalizeLang("") != "tl" || normalizeLang("en-us") != "en-US" {
		t.Fatal(normalizeLang(""), normalizeLang("en-us"))
	}
	if normalizeVisibility("public") != "public" || normalizeVisibility("") != "internal" {
		t.Fatal(normalizeVisibility("public"))
	}
}

func TestPreviewTokenRoundTrip(t *testing.T) {
	tok := signPreviewToken(42, 7, time.Now().Add(time.Minute))
	tenant, page, ok := parsePreviewToken(tok)
	if !ok || tenant != 7 || page != 42 {
		t.Fatalf("token %s -> %d %d %v", tok, tenant, page, ok)
	}
	expired := signPreviewToken(1, 1, time.Now().Add(-time.Minute))
	if _, _, ok := parsePreviewToken(expired); ok {
		t.Fatal("expired token must fail")
	}
}

func TestValidateGeneratedArticle(t *testing.T) {
	raw := `---
title: Bakit palaging mali ang stock?
topic: bodega-at-stock
slug: meron-pa-test
seo_title: Bakit mali
seo_description: Short desk.
---

Opening scene that is long enough to count. ` + strings.Repeat("salita ", 450) + `

## Akala ninyo okay pa
x
## Magkano
x
## Bakit hindi kaya ng Excel o Viber
x
## Ano ang itsura ng proper system
x
## Kung ito ang Lunes ninyo
x
`
	got, errs := validateGeneratedArticle(raw, "bodega-at-stock")
	if errs != nil {
		t.Fatalf("%v", errs)
	}
	if got.Slug != "meron-pa-test" {
		t.Fatal(got.Slug)
	}
	_, bad := validateGeneratedArticle(raw+"\nSee facebook.com/BluearmERPGlobal\n", "bodega-at-stock")
	if bad == nil {
		t.Fatal("expected facebook chrome rejection")
	}
}

func TestValidateGeneratedArticleExamplePrompt(t *testing.T) {
	got, errs := validateGeneratedArticle(articleExample, "bodega-at-stock")
	if errs != nil {
		t.Fatalf("embedded example.md must pass validator: %v", errs)
	}
	if got.Topic != "bodega-at-stock" {
		t.Fatal(got.Topic)
	}
	htmlRaw := strings.Replace(articleExample, "counter — at ang totoo ay nasa rack na wala na.", "counter.<div>hack</div>", 1)
	if _, bad := validateGeneratedArticle(htmlRaw, "bodega-at-stock"); bad == nil {
		t.Fatal("expected raw HTML rejection")
	}
}

func TestCacheControlForPublicMedia(t *testing.T) {
	if cacheControlForPublicMedia("image/png") != publicImageCacheControl {
		t.Fatal(cacheControlForPublicMedia("image/png"))
	}
	if cacheControlForPublicMedia("application/pdf") != "" {
		t.Fatal("pdf should not be immutable public cache")
	}
}
