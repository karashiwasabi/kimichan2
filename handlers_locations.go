package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// ★削除: type Location struct ... の定義をここから消去します
// （models.go に定義済みのため）

func handleLocations(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		getLocations(w, r)
	case "POST":
		addLocation(w, r)
	case "PUT":
		reorderLocations(w, r)
	case "DELETE":
		deleteLocation(w, r)
	default:
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

func getLocations(w http.ResponseWriter, _ *http.Request) {
	rows, err := db.Query("SELECT id, name, priority FROM locations ORDER BY priority ASC")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	locations := []Location{}
	for rows.Next() {
		var l Location
		if err := rows.Scan(&l.ID, &l.Name, &l.Priority); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		locations = append(locations, l)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(locations)
}

func addLocation(w http.ResponseWriter, r *http.Request) {
	var l Location
	if err := json.NewDecoder(r.Body).Decode(&l); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if l.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}

	var maxPriority int
	db.QueryRow("SELECT COALESCE(MAX(priority), 0) FROM locations").Scan(&maxPriority)

	res, err := db.Exec("INSERT INTO locations(name, priority) VALUES(?, ?)", l.Name, maxPriority+1)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()
	l.ID = int(id)
	l.Priority = maxPriority + 1

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(l)
}

func deleteLocation(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	var id int
	fmt.Sscanf(idStr, "%d", &id)

	_, err := db.Exec("DELETE FROM locations WHERE id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

func reorderLocations(w http.ResponseWriter, r *http.Request) {
	var items []Location
	if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tx, err := db.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	for i, item := range items {
		_, err := tx.Exec("UPDATE locations SET priority = ? WHERE id = ?", i+1, item.ID)
		if err != nil {
			tx.Rollback()
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	tx.Commit()
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}
