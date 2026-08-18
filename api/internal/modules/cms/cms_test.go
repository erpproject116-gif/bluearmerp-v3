package cms

import (
	"path/filepath"
	"testing"

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
