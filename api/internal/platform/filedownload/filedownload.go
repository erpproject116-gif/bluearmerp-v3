package filedownload

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ResolveSafePath joins uploadRoot with storagePath and rejects traversal escapes.
func ResolveSafePath(uploadRoot, storagePath string) (string, error) {
	storagePath = filepath.ToSlash(strings.TrimSpace(storagePath))
	if storagePath == "" || strings.Contains(storagePath, "..") || strings.HasPrefix(storagePath, "/") {
		return "", os.ErrInvalid
	}
	root := filepath.Clean(uploadRoot)
	abs := filepath.Clean(filepath.Join(root, filepath.FromSlash(storagePath)))
	sep := string(os.PathSeparator)
	if abs != root && !strings.HasPrefix(abs, root+sep) {
		return "", os.ErrPermission
	}
	return abs, nil
}

// ServeStoredFile streams a file with http.ServeContent (sendfile when possible).
func ServeStoredFile(w http.ResponseWriter, r *http.Request, uploadRoot, storagePath, downloadName, mime string, modTime time.Time) error {
	abs, err := ResolveSafePath(uploadRoot, storagePath)
	if err != nil {
		return err
	}
	f, err := os.Open(abs)
	if err != nil {
		return err
	}
	defer f.Close()
	if mime != "" {
		w.Header().Set("Content-Type", mime)
	}
	if downloadName != "" {
		w.Header().Set("Content-Disposition", `attachment; filename="`+strings.ReplaceAll(downloadName, `"`, "")+`"`)
	}
	http.ServeContent(w, r, downloadName, modTime, f)
	return nil
}
