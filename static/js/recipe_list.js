// グローバル変数（edit.jsでも使用）
let recipeData = [];
let currentRecipeDetail = null;
let currentIngredients = [];

// --- 初期化とデータ取得 ---

function initRecipes() {
    // フィルタ情報（冷蔵庫からの遷移など）があるか確認
    const filterId = sessionStorage.getItem('recipe_filter_id');
    const filterName = sessionStorage.getItem('recipe_filter_name');
    
    // ★追加: レシピ検索イベントの設定
    const searchInput = document.getElementById('recipe-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            if (!term) {
                renderRecipes(recipeData);
                return;
            }
            const filtered = recipeData.filter(item => 
                item.name.toLowerCase().includes(term)
            );
            renderRecipes(filtered);
        });
    }
    
    if (filterId) {
        fetchFilteredRecipes(filterId, filterName);
    } else {
        fetchRecipes();
    }
    
    // 編集機能のセットアップ（recipe_edit.jsの関数）
    if (typeof setupRecipeUI === 'function') {
        setupRecipeUI();
    }
}

function fetchRecipes() {
    showFilterHeader(null); // フィルタ表示をクリア
    fetch('/api/recipes')
        .then(res => res.json())
        .then(data => {
            recipeData = data;
            renderRecipes(recipeData);
        })
        .catch(err => console.error(err));
}

function fetchFilteredRecipes(catalogId, itemName) {
    showFilterHeader(itemName); // 「〇〇のレシピ」ヘッダー表示
    fetch(`/api/recipes?ingredient_id=${catalogId}`)
        .then(res => res.json())
        .then(data => {
            recipeData = data;
            renderRecipes(recipeData);
        })
        .catch(err => console.error(err));
}

// フィルタ解除バーの表示
function showFilterHeader(itemName) {
    const listEl = document.getElementById('recipe-list');
    const existing = document.getElementById('filter-status-bar');
    if (existing) existing.remove();

    if (!itemName) return;

    const bar = document.createElement('div');
    bar.id = 'filter-status-bar';
    bar.style.cssText = 'background:#fff3e0; padding:10px 15px; margin-bottom:15px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; color:#e67e22; font-weight:bold; font-size:14px;';
    bar.innerHTML = `
        <span>🔍 ${itemName} のレシピ</span>
        <button id="btn-clear-filter" style="background:#ddd; border:none; padding:5px 10px; border-radius:15px; font-size:12px; cursor:pointer;">解除</button>
    `;
    listEl.parentNode.insertBefore(bar, listEl);

    document.getElementById('btn-clear-filter').addEventListener('click', () => {
        sessionStorage.removeItem('recipe_filter_id');
        sessionStorage.removeItem('recipe_filter_name');
        fetchRecipes(); // 全件再取得
    });
}

// --- リスト描画 ---

function renderRecipes(items) {
    const listEl = document.getElementById('recipe-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (items.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">レシピが見つかりません</p>';
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'card';
        div.onclick = () => openRecipeDetail(item);
        
        // 在庫状況アイコン (クラスを使って視認性を制御)
        const ingIcon = item.has_ingredients ? '<span class="icon-strong">🥦</span>' : '<span class="icon-faint">🥦</span>';
        const seasIcon = item.has_seasonings ? '<span class="icon-strong">🧂</span>' : '<span class="icon-faint">🧂</span>';

        div.innerHTML = `
            <div class="card-content">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="item-name">${item.name}</span>
                    <span>${ingIcon} ${seasIcon}</span>
                </div>
                <div style="font-size:11px; color:#666;">${item.yield || ''}</div>
            </div>
            <div style="font-size:20px; color:#ccc;">›</div>
        `;
        listEl.appendChild(div);
    });
}

// --- 詳細画面表示 ---

function openRecipeDetail(recipe) {
    currentRecipeDetail = recipe;
    
    const modal = document.getElementById('modal-recipe-detail');
    const title = document.getElementById('detail-title');
    const yieldDisplay = document.getElementById('detail-yield');
    const link = document.getElementById('detail-link');
    const process = document.getElementById('detail-process');
    const ingArea = document.getElementById('detail-ingredients');
    const missingAlert = document.getElementById('detail-missing-alert');

    title.textContent = recipe.name;
    yieldDisplay.textContent = recipe.yield ? `(${recipe.yield})` : '';
    process.textContent = recipe.process || '（作り方の登録なし）';

    if (recipe.url) {
        link.style.display = 'inline-block';
        link.href = recipe.url;
    } else {
        link.style.display = 'none';
    }

    ingArea.innerHTML = '<div style="text-align:center; color:#999;">読み込み中...</div>';
    if (missingAlert) missingAlert.style.display = 'none';

    // 材料APIを叩いて詳細情報を取得
    fetch(`/api/recipes/ingredients?id=${recipe.id}`)
        .then(res => res.json())
        .then(ingredients => {
            currentIngredients = ingredients || [];

            if (!ingredients || ingredients.length === 0) {
                ingArea.innerHTML = '<div style="color:#999;">材料登録なし</div>';
                return;
            }

            let html = '<ul style="list-style:none; padding:0;">';
            let missingItems = [];
            let currentGroup = "";

            ingredients.forEach(ing => {
                // 在庫チェック
                const statusIcon = ing.in_stock ? '✅' : '❌';
                const statusClass = ing.in_stock ? 'ing-status-ok' : 'ing-status-missing';
                
                if (!ing.in_stock) {
                    missingItems.push(ing.name);
                }

                // グループ見出しの挿入 (＝ソース＝ など)
                if (ing.group_name && ing.group_name !== currentGroup) {
                    currentGroup = ing.group_name;
                    html += `<li class="recipe-group-header">${currentGroup}</li>`;
                } else if (!ing.group_name && currentGroup !== "") {
                    currentGroup = "";
                }

                html += `
                <li style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed #eee; padding:8px 0;">
                    <span class="${statusClass}">
                        ${statusIcon} ${ing.name}
                    </span>
                    <span style="font-weight:bold; font-size:13px;">${ing.amount}${ing.unit}</span>
                </li>`;
            });
            html += '</ul>';
            ingArea.innerHTML = html;

            // 足りないものリストを表示
            if (missingItems.length > 0 && missingAlert) {
                missingAlert.style.display = 'block';
                missingAlert.innerHTML = `
                    <strong>⚠️ 足りないもの (${missingItems.length})</strong><br>
                    ${missingItems.join('、')}
                `;
            }
        })
        .catch(err => {
            console.error(err);
            ingArea.innerHTML = '<div style="color:red;">読み込みエラー</div>';
        });
        
    modal.classList.add('active');
}