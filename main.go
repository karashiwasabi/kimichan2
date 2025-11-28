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

	// データ保存場所
	DataDir = filepath.Join(currentDir, "data")
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

	// ハンドラ登録（調味料は削除済み）
	mux.HandleFunc("/api/catalog", handleCatalog)
	mux.HandleFunc("/api/catalog/usage", handleCatalogUsage)
	mux.HandleFunc("/api/catalog/export", exportCatalogCSV)
	mux.HandleFunc("/api/ingredients", handleIngredients)
	mux.HandleFunc("/api/recipes", handleRecipes)
	mux.HandleFunc("/api/recipes/ingredients", handleRecipeIngredients)
	mux.HandleFunc("/api/locations", handleLocations)
	mux.HandleFunc("/import/catalog", handleCatalogImport)
	mux.HandleFunc("/api/upload", handleUpload)
	mux.HandleFunc("/api/fridge_photos", handleFridgePhotos)

	// 静的ファイル（画像とHTML）
	mux.Handle("/images/", http.StripPrefix("/images/", http.FileServer(http.Dir(imagesPath))))

	staticFS, _ := fs.Sub(staticFiles, "static")
	mux.Handle("/", http.FileServer(http.FS(staticFS)))

	fmt.Println("Server is running at http://localhost:8080")

	// ★Basic認証を適用して起動
	if err := http.ListenAndServe(":8080", basicAuth(mux)); err != nil {
		log.Fatal(err)
	}
}

// Basic認証ミドルウェア
func basicAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// ▼▼ ここでIDとパスワードを設定してください ▼▼
		const expectedUser = "wasabi"  // ← 好きなIDに変更
		const expectedPass = "karashi" // ← 好きなパスワードに変更
		// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

		user, pass, ok := r.BasicAuth()
		if !ok || user != expectedUser || pass != expectedPass {
			w.Header().Set("WWW-Authenticate", `Basic realm="Restricted"`)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
