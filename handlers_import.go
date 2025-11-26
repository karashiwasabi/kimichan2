package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

type ImportResult struct {
	Added   int      `json:"added"`
	Skipped int      `json:"skipped"`
	Errors  []string `json:"errors,omitempty"`
}

func handleCatalogImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "データの読み込みに失敗しました", http.StatusBadRequest)
		return
	}
	r.Body.Close()

	if len(bodyBytes) >= 3 && bodyBytes[0] == 0xEF && bodyBytes[1] == 0xBB && bodyBytes[2] == 0xBF {
		bodyBytes = bodyBytes[3:]
	}

	reader := csv.NewReader(bytes.NewReader(bodyBytes))
	reader.FieldsPerRecord = -1

	tx, err := db.Begin()
	if err != nil {
		http.Error(w, "データベースエラー: "+err.Error(), http.StatusInternalServerError)
		return
	}

	checkStmt, err := tx.Prepare("SELECT id FROM item_catalog WHERE name = ?")
	if err != nil {
		tx.Rollback()
		http.Error(w, "DB準備エラー: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer checkStmt.Close()

	insertStmt, err := tx.Prepare("INSERT INTO item_catalog (name, classification, category, default_unit, kana) VALUES (?, ?, ?, ?, ?)")
	if err != nil {
		tx.Rollback()
		http.Error(w, "DB準備エラー: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer insertStmt.Close()

	result := ImportResult{}

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		if len(record) < 1 {
			continue
		}

		name := strings.TrimSpace(record[0])
		if name == "" {
			continue
		}

		classification := "食材"
		if len(record) > 1 {
			classification = strings.TrimSpace(record[1])
		}

		category := ""
		if len(record) > 2 {
			category = strings.TrimSpace(record[2])
		}

		unit := ""
		if len(record) > 3 {
			unit = strings.TrimSpace(record[3])
		}

		kana := ""
		if len(record) > 4 {
			kana = strings.TrimSpace(record[4])
		}

		if classification == "" {
			classification = "食材"
		}
		if classification == "調味料" {
			category = ""
		}

		var existingID int
		err = checkStmt.QueryRow(name).Scan(&existingID)
		if err == nil {
			result.Skipped++
			continue
		}

		_, err = insertStmt.Exec(name, classification, category, unit, kana)
		if err != nil {
			result.Errors = append(result.Errors, name+": "+err.Error())
			continue
		}
		result.Added++
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "保存に失敗しました: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
