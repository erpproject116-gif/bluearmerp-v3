package config

import (
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

// Env files are merged in order; later files override earlier ones.
// Supports web/.env.local (Vite convention) when running the API from api/.
var envFilePaths = []string{
	".env",
	"../.env",
	"web/.env",
	"../web/.env",
	"web/.env.local",
	"../web/.env.local",
	"api/.env",
	"../api/.env",
}

func loadEnvFiles() {
	for _, p := range envFilePaths {
		if fileExists(p) {
			_ = godotenv.Overload(p)
		}
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(filepath.Clean(path))
	return err == nil
}
