package middleware

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"strings"
)

const gzipMinBytes = 8 << 10

// captureWriter buffers the body and owns a separate header map.
// Embedding ResponseWriter alone makes Header() return the outer map, so copying
// with Add() would duplicate CORS and Content-Type headers already set upstream.
type captureWriter struct {
	http.ResponseWriter
	h      http.Header
	status int
	buf    bytes.Buffer
}

func (c *captureWriter) Header() http.Header {
	if c.h == nil {
		c.h = make(http.Header)
	}
	return c.h
}

func (c *captureWriter) Write(b []byte) (int, error) {
	return c.buf.Write(b)
}

func (c *captureWriter) WriteHeader(statusCode int) {
	c.status = statusCode
}

func flushCapturedHeaders(dst http.ResponseWriter, src http.Header) {
	for k, vals := range src {
		for i, v := range vals {
			if i == 0 {
				dst.Header().Set(k, v)
			} else {
				dst.Header().Add(k, v)
			}
		}
	}
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
			// SSE / streaming endpoints must not be buffered (captureWriter is not a Flusher).
			if strings.Contains(r.URL.Path, "/help/compose") || strings.Contains(r.URL.Path, "/copilot/") {
				next.ServeHTTP(w, r)
				return
			}
			cw := &captureWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(cw, r)
			body := cw.buf.Bytes()
			if cw.status == 0 {
				cw.status = http.StatusOK
			}
			flushCapturedHeaders(w, cw.Header())
			if len(body) < gzipMinBytes {
				w.WriteHeader(cw.status)
				_, _ = w.Write(body)
				return
			}
			w.Header().Set("Content-Encoding", "gzip")
			w.Header().Add("Vary", "Accept-Encoding")
			w.WriteHeader(cw.status)
			gz := gzip.NewWriter(w)
			_, _ = gz.Write(body)
			_ = gz.Close()
		})
	}
}
