package main

import (
	"database/sql"
	"encoding/json"
)

type CatalogItem struct {
	ID             int    `json:"id"`
	Name           string `json:"name"`
	Kana           string `json:"kana"`
	Classification string `json:"classification"`
	Category       string `json:"category"`
	DefaultUnit    string `json:"default_unit"`
}

type Ingredient struct {
	ID             int     `json:"id"`
	CatalogID      int     `json:"catalog_id"`
	Amount         float64 `json:"amount"`
	Unit           string  `json:"unit"`
	ExpirationDate string  `json:"expiration_date"`
	Location       string  `json:"location"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
	Name           string  `json:"name,omitempty"`
	RecipeCount    int     `json:"recipe_count"`
}

type Seasoning struct {
	ID             int    `json:"id"`
	CatalogID      int    `json:"catalog_id"`
	Status         string `json:"status"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
	Name           string `json:"name,omitempty"`
	Classification string `json:"classification,omitempty"`
	Category       string `json:"category,omitempty"`
}

type Recipe struct {
	ID          int                `json:"id"`
	Name        string             `json:"name"`
	Yield       string             `json:"yield"`
	Process     string             `json:"process"`
	URL         string             `json:"url"`
	SourceType  string             `json:"source_type"`
	CreatedAt   string             `json:"created_at"`
	Ingredients []RecipeIngredient `json:"ingredients,omitempty"`
}

type RecipeIngredient struct {
	ID        int    `json:"id"`
	RecipeID  int    `json:"recipe_id"`
	CatalogID int    `json:"catalog_id"`
	Name      string `json:"name"`
	Quantity  string `json:"quantity"`
	GroupName string `json:"group_name"`
}

type FridgePhoto struct {
	ID        int    `json:"id"`
	ImagePath string `json:"image_path"`
	Location  string `json:"location"` // 追加
	CreatedAt string `json:"created_at"`
}

type Location struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Priority int    `json:"priority"`
}

type NullString struct {
	sql.NullString
}

func (ns *NullString) Scan(value interface{}) error {
	return ns.NullString.Scan(value)
}

func (ns NullString) MarshalJSON() ([]byte, error) {
	if ns.Valid {
		return json.Marshal(ns.String)
	}
	return json.Marshal(nil)
}
