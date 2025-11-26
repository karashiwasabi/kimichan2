package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func handleSeasonings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		getSeasonings(w, r)
	case "POST":
		addSeasoning(w, r)
	case "DELETE":
		deleteSeasoning(w, r)
	default:
		http.Error(w, "サポートされていないメソッドです。", http.StatusMethodNotAllowed)
	}
}

func getSeasonings(w http.ResponseWriter, _ *http.Request) {
	const query = `
		SELECT
			s.id, s.catalog_id, s.status, s.created_at, s.updated_at,
			c.name, c.classification, c.category
		FROM refrigerator_seasonings s
		JOIN item_catalog c ON s.catalog_id = c.id
		ORDER BY c.kana ASC, c.name ASC; 
` // ★修正: kana順を優先
	rows, err := db.Query(query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := []Seasoning{}
	for rows.Next() {
		var item Seasoning
		if err := rows.Scan(
			&item.ID, &item.CatalogID, &item.Status, &item.CreatedAt, &item.UpdatedAt,
			&item.Name, &item.Classification, &item.Category,
		); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		items = append(items, item)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

func addSeasoning(w http.ResponseWriter, r *http.Request) {
	var item Seasoning
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if item.CatalogID == 0 {
		http.Error(w, "catalog_idは必須です", http.StatusBadRequest)
		return
	}
	if item.Status == "" {
		item.Status = "あり"
	}

	stmt, err := db.Prepare("INSERT INTO refrigerator_seasonings(catalog_id, status) VALUES(?, ?)")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	res, err := stmt.Exec(item.CatalogID, item.Status)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()
	item.ID = int(id)

	w.WriteHeader(http.StatusCreated)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(item)
}

func deleteSeasoning(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	var id int
	fmt.Sscanf(idStr, "%d", &id)

	_, err := db.Exec("DELETE FROM refrigerator_seasonings WHERE id=?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}
