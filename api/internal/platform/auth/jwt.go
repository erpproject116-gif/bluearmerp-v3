package auth

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// JWTValidator verifies Supabase access tokens (ES256 JWKS and legacy HS256).
type JWTValidator struct {
	jwks        keyfunc.Keyfunc
	hs256Secret []byte
}

func NewJWTValidator(supabaseURL, jwtSecret string) (*JWTValidator, error) {
	v := &JWTValidator{hs256Secret: []byte(jwtSecret)}

	base := strings.TrimRight(strings.TrimSpace(supabaseURL), "/")
	if base != "" {
		jwksURL := base + "/auth/v1/.well-known/jwks.json"
		jwks, err := keyfunc.NewDefaultCtx(context.Background(), []string{jwksURL})
		if err != nil {
			return nil, fmt.Errorf("load JWKS from %s: %w", jwksURL, err)
		}
		v.jwks = jwks
	}

	if v.jwks == nil && len(v.hs256Secret) == 0 {
		return nil, fmt.Errorf("set SUPABASE_URL and/or SUPABASE_JWT_SECRET")
	}

	return v, nil
}

func (v *JWTValidator) Parse(tokenStr string) (*Claims, error) {
	claims := &Claims{}

	keyFunc := func(t *jwt.Token) (any, error) {
		if t.Method == jwt.SigningMethodHS256 {
			if len(v.hs256Secret) == 0 {
				return nil, fmt.Errorf("HS256 token but SUPABASE_JWT_SECRET is empty")
			}
			return v.hs256Secret, nil
		}
		if v.jwks != nil {
			return v.jwks.Keyfunc(t)
		}
		return nil, fmt.Errorf("unsupported signing method: %v", t.Header["alg"])
	}

	token, err := jwt.ParseWithClaims(tokenStr, claims, keyFunc)
	if err != nil {
		return nil, err
	}
	if !token.Valid || claims.Sub == "" {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}

// singleton for tests / hot reload not required in MVP
var (
	validatorOnce sync.Once
	cachedValidator *JWTValidator
	cachedValidatorErr error
)

func getValidator(supabaseURL, jwtSecret string) (*JWTValidator, error) {
	validatorOnce.Do(func() {
		cachedValidator, cachedValidatorErr = NewJWTValidator(supabaseURL, jwtSecret)
	})
	return cachedValidator, cachedValidatorErr
}
