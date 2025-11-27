package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"kimichan/tools/common" // ★共通部品
)

type CleaningResult struct {
	BaseName string `json:"base_name"`
	Details  string `json:"details"`
	IsSplit  bool   `json:"is_split"`
}

func main() {
	cfg, err := common.LoadConfig()
	if err != nil {
		log.Fatal(err)
	}

	db, err := common.ConnectDB()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	fmt.Println("🧹 お掃除ロボット起動...")

	rows, _ := db.Query("SELECT id, name FROM item_catalog")
	defer rows.Close()

	for rows.Next() {
		var id int
		var name string
		rows.Scan(&id, &name)

		// チェック＆Gemini呼び出し
		prompt := fmt.Sprintf("食材「%s」を一般名と詳細に分離してJSON出力(base_name, details, is_split)", name)
		resStr, err := common.CallGemini(prompt, cfg.GeminiApiKey)

		if err == nil {
			var res CleaningResult
			if json.Unmarshal([]byte(resStr), &res) == nil && res.IsSplit {
				fmt.Printf("修正: %s -> %s (%s)\n", name, res.BaseName, res.Details)
				// ここにDB更新処理 (executeSplit)
			}
		}
		time.Sleep(1 * time.Second)
	}
}
