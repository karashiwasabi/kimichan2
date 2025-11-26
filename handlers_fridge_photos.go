package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
)

func handleFridgePhotos(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		getFridgePhotos(w, r)
	case "POST":
		addFridgePhoto(w, r)
	case "DELETE":
		deleteFridgePhoto(w, r)
	default:
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

func getFridgePhotos(w http.ResponseWriter, _ *http.Request) {
	// location も取得するように変更
	rows, err := db.Query("SELECT id, image_path, location, created_at FROM fridge_photos ORDER BY id DESC")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	photos := []FridgePhoto{}
	for rows.Next() {
		var p FridgePhoto
		var loc sql.NullString
		// location をスキャン
		if err := rows.Scan(&p.ID, &p.ImagePath, &loc, &p.CreatedAt); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		p.Location = loc.String
		photos = append(photos, p)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(photos)
}

func addFridgePhoto(w http.ResponseWriter, r *http.Request) {
	var p FridgePhoto
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if p.ImagePath == "" {
		http.Error(w, "image_path required", http.StatusBadRequest)
		return
	}
	// 場所が指定されていなければ「その他」とする
	if p.Location == "" {
		p.Location = "その他"
	}

	// location をDBに保存
	res, err := db.Exec("INSERT INTO fridge_photos(image_path, location) VALUES(?, ?)", p.ImagePath, p.Location)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()
	p.ID = int(id)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(p)
}

func deleteFridgePhoto(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	var id int
	fmt.Sscanf(idStr, "%d", &id)

	_, err := db.Exec("DELETE FROM fridge_photos WHERE id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}
