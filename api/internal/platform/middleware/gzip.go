package middleware

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"strings"
)

const gzipMinBytes = 8 << 10

type captureWriter struct {
	http.ResponseWriter
	status int
	buf    bytes.Buffer
}

func (c *captureWriter) Write(b []byte) (int, error) {
	return c.buf.Write(b)
}

func (c *captureWriter) WriteHeader(statusCode int) {
	c.status = statusCode
}

// SelectiveGzip buffers the response and compresses when body >= 8KB.
func SelectiveGzip(enabled bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !enabled || !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
				next.ServeHTTP(w, r)
				return
			}
			if r.URL.Path == "/health" || r.URL.Path == "/health/db" || strings.Contains(r.URL.Path, "/download") {
				next.ServeHTTP(w, r)
				return
			}
			cw := &captureWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(cw, r)
			body := cw.buf.Bytes()
			if cw.status == 0 {
				cw.status = http.StatusOK
			}
			if len(body) < gzipMinBytes {
				for k, vals := range cw.ResponseWriter.Header() {
					for _, v := range vals {
						w.Header().Add(k, v)
					}
				}
				w.WriteHeader(cw.status)
				_, _ = w.Write(body)
				return
			}
			w.Header().Set("Content-Encoding", "gzip")
			w.Header().Set("Vary", "Accept-Encoding")
			w.WriteHeader(cw.status)
			gz := gzip.NewWriter(w)
			_, _ = gz.Write(body)
			_ = gz.Close()
		})
	}
}
