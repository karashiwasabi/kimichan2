package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
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

func getIngredients(w http.ResponseWriter, _ *http.Request) {
	const query = `
		SELECT
			i.id, i.catalog_id, i.amount, i.unit, i.expiration_date, i.location, 
			i.created_at, i.updated_at, c.name,
			(SELECT COUNT(DISTINCT recipe_id) FROM recipe_ingredients WHERE catalog_id = i.catalog_id) as recipe_count
		FROM refrigerator_ingredients i
		JOIN item_catalog c ON i.catalog_id = c.id
		LEFT JOIN locations l ON i.location = l.name
		ORDER BY 
			CASE WHEN l.priority IS NULL THEN 9999 ELSE l.priority END ASC,
			c.kana ASC,
			c.name ASC;
	`
	rows, err := db.Query(query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := []Ingredient{}
	for rows.Next() {
		var item Ingredient
		var loc sql.NullString

		if err := rows.Scan(&item.ID, &item.CatalogID, &item.Amount, &item.Unit, &item.ExpirationDate, &loc, &item.CreatedAt, &item.UpdatedAt, &item.Name, &item.RecipeCount); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		item.Location = loc.String
		items = append(items, item)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
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
