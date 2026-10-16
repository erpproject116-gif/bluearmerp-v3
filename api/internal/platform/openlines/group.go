package openlines

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrMixedSlipSource is returned when Load Slip lines do not share one source document.
var ErrMixedSlipSource = errors.New("load slip lines must come from one document")

// SourceCounts is every line on a source document, and how many of those have no inventory item.
type SourceCounts struct {
	Source   int
	NullItem int
}

// DocumentLines is one source document and every open line returned for it.
type DocumentLines[T any] struct {
	ID                 int64
	Lines              []T
	OpenLineCount      int
	SourceLineCount    int
	SkippedNoItemCount int
}

// AssembleDocuments keeps every open line of each document in docOrder.
// A line whose item is missing is not skipped when that line is itself in the open set.
// Null-item lines that the open query excluded are SkippedNoItemCount.
func AssembleDocuments[T any](docOrder []int64, lines []T, docID func(T) int64, counts map[int64]SourceCounts, lineHasNoItem func(T) bool) []DocumentLines[T] {
	grouped := make(map[int64][]T, len(docOrder))
	openNull := map[int64]int{}
	for _, ln := range lines {
		id := docID(ln)
		grouped[id] = append(grouped[id], ln)
		if lineHasNoItem != nil && lineHasNoItem(ln) {
			openNull[id]++
		}
	}
	out := make([]DocumentLines[T], 0, len(docOrder))
	for _, id := range docOrder {
		ls := grouped[id]
		if len(ls) == 0 {
			continue
		}
		c := counts[id]
		skipped := c.NullItem - openNull[id]
		if skipped < 0 {
			skipped = 0
		}
		source := c.Source
		if source < len(ls) {
			source = len(ls)
		}
		out = append(out, DocumentLines[T]{
			ID:                 id,
			Lines:              ls,
			OpenLineCount:      len(ls),
			SourceLineCount:    source,
			SkippedNoItemCount: skipped,
		})
	}
	return out
}

// SingleDocumentID accepts only one positive source id. Duplicates of that id are the same document.
func SingleDocumentID(ids []int64) (int64, error) {
	var chosen int64
	seen := map[int64]struct{}{}
	for _, id := range ids {
		if id <= 0 {
			continue
		}
		seen[id] = struct{}{}
		chosen = id
	}
	if len(seen) != 1 {
		return 0, ErrMixedSlipSource
	}
	return chosen, nil
}

type documentQueryer interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// QueryDocumentPage pages distinct documents that match fromWhere.
// fromWhere is the FROM ... WHERE clause with no ORDER BY or LIMIT.
// docExpr is the document id column (q.id, so.id, sh.id, gr.id, po.id, sq.id, pr.id).
// sortExpr is ordered with max() so a document is not split across pages.
func QueryDocumentPage(ctx context.Context, db documentQueryer, fromWhere, docExpr, sortExpr string, args []any, pageSize, offset int) ([]int64, int64, error) {
	var total int64
	countSQL := fmt.Sprintf(`select count(*) from (select %s %s group by %s) docs`, docExpr, fromWhere, docExpr)
	if err := db.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return []int64{}, 0, nil
	}
	limitArg := len(args) + 1
	pageSQL := fmt.Sprintf(`
		select doc_id from (
		  select %s as doc_id, max(%s) as sort_key
		  %s
		  group by %s
		) docs
		order by sort_key desc nulls last, doc_id desc
		limit $%d offset $%d`, docExpr, sortExpr, fromWhere, docExpr, limitArg, limitArg+1)
	pageArgs := append(append([]any{}, args...), pageSize, offset)
	rows, err := db.Query(ctx, pageSQL, pageArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, 0, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return ids, total, nil
}

// LoadSourceCounts reads source and null-item counts. sql must return (id, source_count, null_item_count) for id = any($1).
func LoadSourceCounts(ctx context.Context, pool *pgxpool.Pool, sql string, ids []int64) (map[int64]SourceCounts, error) {
	out := map[int64]SourceCounts{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, sql, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var c SourceCounts
		if err := rows.Scan(&id, &c.Source, &c.NullItem); err != nil {
			return nil, err
		}
		out[id] = c
	}
	return out, rows.Err()
}
