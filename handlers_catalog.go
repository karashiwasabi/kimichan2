package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
)

func handleCatalog(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		getCatalogItems(w, r)
	case "POST":
		addCatalogItems(w, r)
	case "PUT":
		updateCatalogItem(w, r)
	default:
		sendJSONError(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

// 追加: 使用状況確認API
func handleCatalogUsage(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		sendJSONError(w, "id required", http.StatusBadRequest)
		return
	}

	var recipeCount int
	err := db.QueryRow("SELECT COUNT(DISTINCT recipe_id) FROM recipe_ingredients WHERE catalog_id = ?", idStr).Scan(&recipeCount)
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	rows, err := db.Query("SELECT DISTINCT r.name FROM recipes r JOIN recipe_ingredients ri ON r.id = ri.recipe_id WHERE ri.catalog_id = ? LIMIT 3", idStr)
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var recipeNames []string
	for rows.Next() {
		var name string
		rows.Scan(&name)
		recipeNames = append(recipeNames, name)
	}

	response := map[string]interface{}{
		"recipe_count": recipeCount,
		"recipe_names": recipeNames,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func getCatalogItems(w http.ResponseWriter, _ *http.Request) {
	rows, err := db.Query("SELECT id, name, kana, classification, category, default_unit FROM item_catalog ORDER BY name ASC")
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := []CatalogItem{}
	for rows.Next() {
		var item CatalogItem
		var kana sql.NullString
		if err := rows.Scan(&item.ID, &item.Name, &kana, &item.Classification, &item.Category, &item.DefaultUnit); err != nil {
			sendJSONError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		item.Kana = kana.String
		items = append(items, item)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

func addCatalogItems(w http.ResponseWriter, r *http.Request) {
	var items []CatalogItem
	if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
		sendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	tx, err := db.Begin()
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	query := `
	INSERT INTO item_catalog(name, kana, classification, category, default_unit) 
	VALUES(?, ?, ?, ?, ?)
	ON CONFLICT(name) DO UPDATE SET
	kana = excluded.kana,
	classification = excluded.classification,
	category = excluded.category,
	default_unit = excluded.default_unit
	`

	stmt, err := tx.Prepare(query)
	if err != nil {
		tx.Rollback()
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	for _, item := range items {
		if item.Name == "" {
			tx.Rollback()
			sendJSONError(w, "name required", http.StatusBadRequest)
			return
		}
		if item.Classification == "調味料" {
			item.Category = ""
			item.DefaultUnit = "g"
		}
		item.DefaultUnit = ""

		_, err := stmt.Exec(item.Name, item.Kana, item.Classification, item.Category, item.DefaultUnit)
		if err != nil {
			tx.Rollback()
			sendJSONError(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func updateCatalogItem(w http.ResponseWriter, r *http.Request) {
	type UpdateReq struct {
		ID             int    `json:"id"`
		Name           string `json:"name"`
		Kana           string `json:"kana"`
		Classification string `json:"classification"`
		Category       string `json:"category"`
		DefaultUnit    string `json:"default_unit"`
		ForceMerge     bool   `json:"force_merge"`
	}

	var req UpdateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	tx, err := db.Begin()
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var targetID int
	err = tx.QueryRow("SELECT id FROM item_catalog WHERE name = ? AND id != ?", req.Name, req.ID).Scan(&targetID)

	if err == nil {
		if !req.ForceMerge {
			tx.Rollback()
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error_code": "merge_confirmation_required",
				"message":    fmt.Sprintf("「%s」は既に存在します。統合しますか？", req.Name),
				"target_id":  targetID,
			})
			return
		}

		if _, err := tx.Exec("UPDATE refrigerator_ingredients SET catalog_id = ? WHERE catalog_id = ?", targetID, req.ID); err != nil {
			tx.Rollback()
			sendJSONError(w, "在庫マージ失敗", http.StatusInternalServerError)
			return
		}
		if _, err := tx.Exec("UPDATE refrigerator_seasonings SET catalog_id = ? WHERE catalog_id = ?", targetID, req.ID); err != nil {
			tx.Rollback()
			sendJSONError(w, "調味料マージ失敗", http.StatusInternalServerError)
			return
		}
		if _, err := tx.Exec("UPDATE recipe_ingredients SET catalog_id = ? WHERE catalog_id = ?", targetID, req.ID); err != nil {
			tx.Rollback()
			sendJSONError(w, "レシピマージ失敗", http.StatusInternalServerError)
			return
		}

		if _, err := tx.Exec("DELETE FROM item_catalog WHERE id = ?", req.ID); err != nil {
			tx.Rollback()
			sendJSONError(w, "旧アイテム削除失敗", http.StatusInternalServerError)
			return
		}

	} else {
		query := `UPDATE item_catalog SET name=?, kana=?, classification=?, category=?, default_unit=? WHERE id=?`
		if req.Classification == "調味料" {
			req.Category = ""
			req.DefaultUnit = "g"
		}
		if _, err := tx.Exec(query, req.Name, req.Kana, req.Classification, req.Category, req.DefaultUnit, req.ID); err != nil {
			tx.Rollback()
			sendJSONError(w, "更新失敗: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}
