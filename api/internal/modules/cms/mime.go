package cms

import (
	"bytes"
	"path/filepath"
	"strings"
)

var allowedMIME = map[string]struct{}{
	"image/png":       {},
	"image/jpeg":      {},
	"image/gif":       {},
	"image/webp":      {},
	"application/pdf": {},
}

var allowedExt = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".gif":  "image/gif",
	".webp": "image/webp",
	".pdf":  "application/pdf",
}

func mimeFromExt(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	return allowedExt[ext]
}

func allowedUpload(mime, filename string) bool {
	mime = strings.ToLower(strings.TrimSpace(strings.Split(mime, ";")[0]))
	if mime == "image/svg+xml" || mime == "text/html" || mime == "application/javascript" || mime == "text/javascript" {
		return false
	}
	if _, ok := allowedMIME[mime]; ok {
		ext := strings.ToLower(filepath.Ext(filename))
		if ext == "" {
			return true
		}
		want, ok := allowedExt[ext]
		return ok && want == mime
	}
	return false
}

func sniffAllowedMIME(data []byte, claimed, filename string) (string, bool) {
	n := 256
	if len(data) < n {
		n = len(data)
	}
	head := data[:n]
	lower := bytes.ToLower(head)
	if bytes.Contains(lower, []byte("<svg")) || bytes.Contains(lower, []byte("<html")) || bytes.Contains(lower, []byte("<script")) {
		return "", false
	}
	switch {
	case bytes.HasPrefix(data, []byte{0x89, 0x50, 0x4E, 0x47}):
		return "image/png", true
	case len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF:
		return "image/jpeg", true
	case bytes.HasPrefix(data, []byte("GIF87a")) || bytes.HasPrefix(data, []byte("GIF89a")):
		return "image/gif", true
	case bytes.HasPrefix(data, []byte("RIFF")) && bytes.Contains(head, []byte("WEBP")):
		return "image/webp", true
	case bytes.HasPrefix(data, []byte("%PDF")):
		return "application/pdf", true
	}
	claimed = strings.ToLower(strings.TrimSpace(strings.Split(claimed, ";")[0]))
	if claimed == "" || claimed == "application/octet-stream" {
		claimed = mimeFromExt(filename)
	}
	if allowedUpload(claimed, filename) {
		return claimed, true
	}
	return "", false
}

func isImageMIME(mime string) bool {
	return strings.HasPrefix(strings.ToLower(mime), "image/")
}
