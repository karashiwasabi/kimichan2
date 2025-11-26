package main

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"time"
)

func exportCatalogCSV(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query("SELECT name, classification, category, default_unit, kana FROM item_catalog ORDER BY classification, name")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	fileName := fmt.Sprintf("catalog_export_%s.csv", time.Now().Format("20060102150405"))
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+fileName+"\"")

	writer := csv.NewWriter(w)
	defer writer.Flush()

	for rows.Next() {
		var name, classification, category, defaultUnit, kana NullString
		if err := rows.Scan(&name, &classification, &category, &defaultUnit, &kana); err != nil {
			http.Error(w, "行データの読み取りに失敗しました: "+err.Error(), http.StatusInternalServerError)
			return
		}
		record := []string{name.String, classification.String, category.String, defaultUnit.String, kana.String}
		if err := writer.Write(record); err != nil {
			http.Error(w, "CSV行の書き込みに失敗しました: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "行の処理中にエラーが発生しました: "+err.Error(), http.StatusInternalServerError)
		return
	}
}
