package copilot

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

const toolCacheTTL = 45 * time.Second

type toolCacheEntry struct {
	result    toolResult
	expiresAt time.Time
}

var (
	toolCacheMu sync.Mutex
	toolCache   = map[string]toolCacheEntry{}
)

func cacheableTool(name string) bool {
	switch name {
	case "get_financial_health", "smart_notifications", "lookup_entities", "list_overdue_ar", "crm_follow_ups":
		return true
	default:
		return false
	}
}

func toolCacheKeySimple(tenantID, userID int64, name string, args map[string]any) string {
	raw, _ := json.Marshal(args)
	sum := sha256.Sum256(raw)
	return fmt.Sprintf("%d|%d|%s|%s", tenantID, userID, name, hex.EncodeToString(sum[:]))
}

func getCachedTool(tenantID, userID int64, name string, args map[string]any) (toolResult, bool) {
	if !cacheableTool(name) {
		return toolResult{}, false
	}
	key := toolCacheKeySimple(tenantID, userID, name, args)
	toolCacheMu.Lock()
	defer toolCacheMu.Unlock()
	ent, ok := toolCache[key]
	if !ok || time.Now().After(ent.expiresAt) {
		if ok {
			delete(toolCache, key)
		}
		return toolResult{}, false
	}
	return ent.result, true
}

func putCachedTool(tenantID, userID int64, name string, args map[string]any, tr toolResult) {
	if !cacheableTool(name) || !tr.OK || tr.Denied {
		return
	}
	key := toolCacheKeySimple(tenantID, userID, name, args)
	toolCacheMu.Lock()
	defer toolCacheMu.Unlock()
	if len(toolCache) > 500 {
		now := time.Now()
		for k, e := range toolCache {
			if now.After(e.expiresAt) {
				delete(toolCache, k)
			}
		}
	}
	toolCache[key] = toolCacheEntry{result: tr, expiresAt: time.Now().Add(toolCacheTTL)}
}
