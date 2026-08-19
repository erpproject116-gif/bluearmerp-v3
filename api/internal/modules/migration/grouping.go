package migration

import "strings"

type groupedDoc struct {
	SourceDocNo string
	Rows        []map[string]string
	RowNums     []int
}

func groupBySourceDoc(rows []map[string]string, startRow int) ([]groupedDoc, []importRowError) {
	if startRow <= 0 {
		startRow = 2
	}
	order := []string{}
	index := map[string]int{}
	var errs []importRowError
	for i, row := range rows {
		rowNum := i + startRow
		key := strings.TrimSpace(row["source_doc_no"])
		if key == "" {
			errs = append(errs, importRowError{Row: rowNum, Message: "source_doc_no is required"})
			continue
		}
		if _, ok := index[key]; !ok {
			index[key] = len(order)
			order = append(order, key)
		}
		g := index[key]
		if g >= len(order) {
			continue
		}
	}
	docs := make([]groupedDoc, len(order))
	for i, key := range order {
		docs[i].SourceDocNo = key
	}
	for i, row := range rows {
		rowNum := i + startRow
		key := strings.TrimSpace(row["source_doc_no"])
		if key == "" {
			continue
		}
		g := index[key]
		docs[g].Rows = append(docs[g].Rows, row)
		docs[g].RowNums = append(docs[g].RowNums, rowNum)
	}
	return docs, errs
}
