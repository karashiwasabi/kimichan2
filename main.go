package main

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed static/*
var staticFiles embed.FS

var DataDir string

func main() {
	currentDir, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}

	// ★変更: "data" フォルダの中に保存するように書き換える
	DataDir = filepath.Join(currentDir, "data")

	// ★追加: dataフォルダがなければ作る
	if err := os.MkdirAll(DataDir, 0755); err != nil {
		log.Fatal(err)
	}

	imagesPath := filepath.Join(DataDir, "images")
	if err := os.MkdirAll(imagesPath, 0755); err != nil {
		log.Fatal(err)
	}

	dbPath := filepath.Join(DataDir, "kimichan.db")
	db, err = sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("DB connection failed: %v", err)
	}
	defer db.Close()

	if err := initDatabase(); err != nil {
		log.Fatalf("DB init failed: %v", err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/api/catalog", handleCatalog)
	mux.HandleFunc("/api/catalog/usage", handleCatalogUsage) // 追加
	mux.HandleFunc("/api/catalog/export", exportCatalogCSV)
	mux.HandleFunc("/api/ingredients", handleIngredients)
	mux.HandleFunc("/api/seasonings", handleSeasonings)
	mux.HandleFunc("/api/recipes", handleRecipes)
	mux.HandleFunc("/api/recipes/ingredients", handleRecipeIngredients)
	mux.HandleFunc("/api/locations", handleLocations)
	mux.HandleFunc("/import/catalog", handleCatalogImport)
	mux.HandleFunc("/api/upload", handleUpload)
	mux.HandleFunc("/api/fridge_photos", handleFridgePhotos)

	mux.Handle("/images/", http.StripPrefix("/images/", http.FileServer(http.Dir(imagesPath))))

	staticFS, _ := fs.Sub(staticFiles, "static")
	mux.Handle("/", http.FileServer(http.FS(staticFS)))

	fmt.Println("Server is running at http://localhost:8080")
	if err := http.ListenAndServe(":8080", basicAuth(mux)); err != nil {
		log.Fatal(err)
	}
}

// Basic認証を行うミドルウェア
func basicAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// ▼▼ ここでIDとパスワードを決めます ▼▼
		const expectedUser = "wasabi"
		const expectedPass = "karashi"
		// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

		user, pass, ok := r.BasicAuth()
		if !ok || user != expectedUser || pass != expectedPass {
			w.Header().Set("WWW-Authenticate", `Basic realm="Restricted"`)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
