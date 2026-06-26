package branding

import (
	"os"
	"strings"
)

const maxAvatarBytes = 5 * 1024 * 1024
const maxLogoBytes = 2 * 1024 * 1024

func uploadDir() string {
	if d := strings.TrimSpace(os.Getenv("BRANDING_UPLOAD_DIR")); d != "" {
		return d
	}
	return "data/branding-assets"
}
