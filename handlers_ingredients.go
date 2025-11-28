package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

func handleIngredients(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		getIngredients(w, r)
	case "POST":
		addIngredient(w, r)
	case "PUT":
		updateIngredient(w, r)
	case "DELETE":
		deleteIngredient(w, r)
	default:
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

func getIngredients(w http.ResponseWriter, r *http.Request) {
	isAll := r.URL.Query().Get("all") == "true"

	// ★修正: c.kana も取得する
	query := `
		SELECT 
			i.id, i.catalog_id, i.amount, i.unit, i.expiration_date, i.location, i.created_at, i.updated_at,
			c.name, c.kana,
			(SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.catalog_id = c.id) as recipe_count
		FROM refrigerator_ingredients i
		JOIN item_catalog c ON i.catalog_id = c.id
		ORDER BY i.location ASC, c.name ASC
	`

	if isCloud := os.Getenv("K_SERVICE") != ""; isCloud && !isAll {
		query += " LIMIT 100"
	}

	rows, err := db.Query(query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	ingredients := []Ingredient{}
	for rows.Next() {
		var item Ingredient
		var kana sql.NullString // カナは空の可能性があるのでNullStringで受ける
		if err := rows.Scan(
			&item.ID, &item.CatalogID, &item.Amount, &item.Unit, &item.ExpirationDate, &item.Location, &item.CreatedAt, &item.UpdatedAt,
			&item.Name, &kana, &item.RecipeCount,
		); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		item.Kana = kana.String // 文字列に変換してセット
		ingredients = append(ingredients, item)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ingredients)
}
func addIngredient(w http.ResponseWriter, r *http.Request) {
	var item Ingredient
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if item.CatalogID == 0 {
		http.Error(w, "catalog_id required", http.StatusBadRequest)
		return
	}
	if item.Location == "" {
		item.Location = "その他"
	}

	stmt, err := db.Prepare("INSERT INTO refrigerator_ingredients(catalog_id, amount, unit, expiration_date, location) VALUES(?, ?, ?, ?, ?)")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	res, err := stmt.Exec(item.CatalogID, item.Amount, item.Unit, item.ExpirationDate, item.Location)
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

func updateIngredient(w http.ResponseWriter, r *http.Request) {
	var item Ingredient
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if item.ID == 0 {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	_, err := db.Exec("UPDATE refrigerator_ingredients SET amount=?, expiration_date=?, location=?, updated_at=datetime('now','localtime') WHERE id=?", item.Amount, item.ExpirationDate, item.Location, item.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
}

func deleteIngredient(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	var id int
	fmt.Sscanf(idStr, "%d", &id)

	_, err := db.Exec("DELETE FROM refrigerator_ingredients WHERE id=?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}
