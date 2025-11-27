package main

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
)

type RecipeRequest struct {
	Name    string `json:"name"`
	Yield   string `json:"yield"`
	Process string `json:"process"`
	URL     string `json:"url"`
	CsvData string `json:"csv_data"`
}

type RecipeResponse struct {
	Recipe
	HasIngredients bool `json:"has_ingredients"`
	HasSeasonings  bool `json:"has_seasonings"`
}

func handleRecipes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		getRecipes(w, r)
	case "POST":
		addRecipe(w, r)
	case "PUT":
		updateRecipe(w, r)
	default:
		sendJSONError(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

func sendJSONError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func sendMissingIngredientsError(w http.ResponseWriter, items []string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error_code": "missing_ingredients",
		"items":      items,
	})
}

func getRecipes(w http.ResponseWriter, r *http.Request) {
	// 検索フィルタ
	filterIngredientID := r.URL.Query().Get("ingredient_id")
	// ★追加: 全件取得フラグ
	isAll := r.URL.Query().Get("all") == "true"

	var query string
	var args []interface{}

	// 基本のクエリ (ORDER BYまで)
	if filterIngredientID != "" {
		query = `SELECT r.id, r.name, r.yield, r.process, r.url, r.created_at FROM recipes r JOIN recipe_ingredients ri ON r.id = ri.recipe_id WHERE ri.catalog_id = ? ORDER BY r.created_at DESC`
		args = append(args, filterIngredientID)
	} else {
		query = `SELECT id, name, yield, process, url, created_at FROM recipes ORDER BY created_at DESC`
	}

	// ★変更: クラウド(Cloud Run)上で、かつ合言葉がない時だけ制限をかける
	// ローカル(PC)なら制限なしで全件表示
	isCloud := os.Getenv("K_SERVICE") != "" // Cloud Runにはこの変数が自動である
	if isCloud && !isAll {
		query += " LIMIT 50"
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// --- (以下、変更なし) ---
	recipes := []RecipeResponse{}
	for rows.Next() {
		var r RecipeResponse
		var yield sql.NullString
		if err := rows.Scan(&r.ID, &r.Name, &yield, &r.Process, &r.URL, &r.CreatedAt); err != nil {
			continue
		}
		r.Yield = yield.String
		recipes = append(recipes, r)
	}

	if len(recipes) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(recipes)
		return
	}

	// --- 材料の一括取得 (高速化ロジック) ---
	recipeIDs := make([]interface{}, len(recipes))
	placeholders := make([]string, len(recipes))
	for i, r := range recipes {
		recipeIDs[i] = r.ID
		placeholders[i] = "?"
	}

	queryIng := fmt.Sprintf(`
		SELECT ri.recipe_id, ri.catalog_id, c.classification 
		FROM recipe_ingredients ri 
		JOIN item_catalog c ON ri.catalog_id = c.id 
		WHERE ri.recipe_id IN (%s)
	`, strings.Join(placeholders, ","))

	rowsIng, err := db.Query(queryIng, recipeIDs...)
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rowsIng.Close()

	type IngInfo struct {
		CatalogID      int
		Classification string
	}
	recipeIngMap := make(map[int][]IngInfo)

	for rowsIng.Next() {
		var rID, cID int
		var cls string
		if err := rowsIng.Scan(&rID, &cID, &cls); err == nil {
			recipeIngMap[rID] = append(recipeIngMap[rID], IngInfo{CatalogID: cID, Classification: cls})
		}
	}

	// 在庫・調味料マップの作成
	invMap := make(map[int]bool)
	rowsInv, _ := db.Query("SELECT catalog_id FROM refrigerator_ingredients")
	if rowsInv != nil {
		for rowsInv.Next() {
			var cid int
			rowsInv.Scan(&cid)
			invMap[cid] = true
		}
		rowsInv.Close()
	}

	seasMap := make(map[int]bool)
	rowsSeas, _ := db.Query("SELECT catalog_id FROM refrigerator_seasonings WHERE status != 'なし'")
	if rowsSeas != nil {
		for rowsSeas.Next() {
			var cid int
			rowsSeas.Scan(&cid)
			seasMap[cid] = true
		}
		rowsSeas.Close()
	}

	// 判定
	for i := range recipes {
		hasIng := true
		hasSeas := true
		ingredients := recipeIngMap[recipes[i].ID]

		for _, ing := range ingredients {
			if ing.Classification == "調味料" {
				if !seasMap[ing.CatalogID] {
					hasSeas = false
				}
			} else {
				if !invMap[ing.CatalogID] {
					hasIng = false
				}
			}
		}
		recipes[i].HasIngredients = hasIng
		recipes[i].HasSeasonings = hasSeas
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(recipes)
}

func addRecipe(w http.ResponseWriter, r *http.Request) {
	saveRecipeCommon(w, r, 0)
}

func updateRecipe(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		sendJSONError(w, "ID required", http.StatusBadRequest)
		return
	}
	var id int
	fmt.Sscanf(idStr, "%d", &id)
	saveRecipeCommon(w, r, id)
}
func saveRecipeCommon(w http.ResponseWriter, r *http.Request, id int) {
	var req RecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		sendJSONError(w, "レシピ名は必須です", http.StatusBadRequest)
		return
	}

	type parsedIng struct {
		CatalogID int
		Unit      string
		Amount    string
		GroupName string
	}
	var ingredients []parsedIng
	var unknownItems []string

	tx, err := db.Begin()
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// ★修正箇所: スラッシュを改行コードに置換し、解析を容易にする
	csvDataProcessed := strings.ReplaceAll(req.CsvData, "/", "\n")

	scanner := bufio.NewScanner(strings.NewReader(csvDataProcessed))
	var currentGroup string

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "=") || strings.HasPrefix(line, "＝") {
			currentGroup = strings.Trim(line, "=＝ \t　")
			continue
		}

		var name, amount, unit string

		if strings.Contains(line, "…") {
			parts := strings.SplitN(line, "…", 2)
			name = strings.TrimSpace(parts[0])
			if len(parts) > 1 {
				amount = strings.TrimSpace(parts[1])
			}
		} else if strings.Contains(line, "...") {
			parts := strings.SplitN(line, "...", 2)
			name = strings.TrimSpace(parts[0])
			if len(parts) > 1 {
				amount = strings.TrimSpace(parts[1])
			}
		} else if strings.Contains(line, ",") {
			parts := strings.Split(line, ",")
			name = strings.TrimSpace(parts[0])
			if len(parts) > 1 {
				amount = strings.TrimSpace(parts[1])
			}
			if len(parts) > 2 {
				unit = strings.TrimSpace(parts[2])
			}
		} else {
			name = line
		}

		if name == "" {
			continue
		}

		var catalogID int
		err = tx.QueryRow("SELECT id FROM item_catalog WHERE name = ? OR kana = ?", name, name).Scan(&catalogID)
		if err != nil {
			unknownItems = append(unknownItems, name)
			continue
		}

		ingredients = append(ingredients, parsedIng{
			CatalogID: catalogID,
			Unit:      unit,
			Amount:    amount,
			GroupName: currentGroup,
		})
	}

	if len(unknownItems) > 0 {
		tx.Rollback()
		sendMissingIngredientsError(w, unknownItems)
		return
	}

	if id == 0 {
		res, err := tx.Exec("INSERT INTO recipes(name, yield, process, url) VALUES(?, ?, ?, ?)", req.Name, req.Yield, req.Process, req.URL)
		if err != nil {
			tx.Rollback()
			sendJSONError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		newID, _ := res.LastInsertId()
		id = int(newID)
	} else {
		_, err := tx.Exec("UPDATE recipes SET name=?, yield=?, process=?, url=? WHERE id=?", req.Name, req.Yield, req.Process, req.URL, id)
		if err != nil {
			tx.Rollback()
			sendJSONError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_, err = tx.Exec("DELETE FROM recipe_ingredients WHERE recipe_id=?", id)
		if err != nil {
			tx.Rollback()
			sendJSONError(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	ingStmt, err := tx.Prepare("INSERT INTO recipe_ingredients(recipe_id, catalog_id, unit, amount, group_name) VALUES(?, ?, ?, ?, ?)")
	if err != nil {
		tx.Rollback()
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer ingStmt.Close()

	for _, ing := range ingredients {
		if _, err := ingStmt.Exec(id, ing.CatalogID, ing.Unit, ing.Amount, ing.GroupName); err != nil {
			tx.Rollback()
			sendJSONError(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func handleRecipeIngredients(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		sendJSONError(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	recipeID := r.URL.Query().Get("id")
	if recipeID == "" {
		sendJSONError(w, "id is required", http.StatusBadRequest)
		return
	}

	query := `
		SELECT 
			c.name, 
			ri.amount, 
			ri.unit,
			ri.group_name,
			CASE 
				WHEN c.classification = '調味料' THEN 
					(SELECT COUNT(*) FROM refrigerator_seasonings WHERE catalog_id = c.id AND status != 'なし')
				ELSE 
					(SELECT COUNT(*) FROM refrigerator_ingredients WHERE catalog_id = c.id)
			END as stock_count
		FROM recipe_ingredients ri
		JOIN item_catalog c ON ri.catalog_id = c.id
		WHERE ri.recipe_id = ?
	`

	rows, err := db.Query(query, recipeID)
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type ResIngredient struct {
		Name      string `json:"name"`
		Amount    string `json:"amount"`
		Unit      string `json:"unit"`
		GroupName string `json:"group_name"`
		InStock   bool   `json:"in_stock"`
	}

	var ingredients []ResIngredient
	for rows.Next() {
		var i ResIngredient
		var stockCount int
		var gn sql.NullString
		if err := rows.Scan(&i.Name, &i.Amount, &i.Unit, &gn, &stockCount); err != nil {
			sendJSONError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		i.GroupName = gn.String
		i.InStock = (stockCount > 0)
		ingredients = append(ingredients, i)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ingredients)
}
