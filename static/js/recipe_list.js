// ★修正: varに変更して再宣言エラーを防止
var recipeData = [];
var currentRecipeDetail = null;
var currentIngredients = [];

function initRecipes() {
    const filterId = sessionStorage.getItem('recipe_filter_id');
    const filterName = sessionStorage.getItem('recipe_filter_name');
    
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
    
    if (typeof setupRecipeUI === 'function') {
        setupRecipeUI();
    }
}

function fetchRecipes() {
    showFilterHeader(null);
    // PCでは全件取得したい場合は ?all=true をつける（API側の制限回避）
    fetch('/api/recipes?all=true')
        .then(res => res.json())
        .then(data => {
            recipeData = data;
            renderRecipes(recipeData);
        })
        .catch(err => console.error(err));
}

function fetchFilteredRecipes(catalogId, itemName) {
    showFilterHeader(itemName);
    fetch(`/api/recipes?ingredient_id=${catalogId}`)
        .then(res => res.json())
        .then(data => {
            recipeData = data;
            renderRecipes(recipeData);
        })
        .catch(err => console.error(err));
}

function showFilterHeader(itemName) {
    const listEl = document.getElementById('recipe-list');
    const existing = document.getElementById('filter-status-bar');
    if (existing) existing.remove();
    if (!itemName) return;

    const bar = document.createElement('div');
    bar.id = 'filter-status-bar';
    bar.className = 'recipe-group-header'; // CSSクラス利用
    bar.style.display = 'flex';
    bar.style.justifyContent = 'space-between';
    bar.style.alignItems = 'center';
    
    bar.innerHTML = `
        <span>🔍 ${itemName} のレシピ</span>
        <button id="btn-clear-filter" style="background:#ddd; border:none; padding:4px 10px; border-radius:15px; font-size:11px; cursor:pointer;">解除</button>
    `;
    listEl.parentNode.insertBefore(bar, listEl);

    document.getElementById('btn-clear-filter').addEventListener('click', () => {
        sessionStorage.removeItem('recipe_filter_id');
        sessionStorage.removeItem('recipe_filter_name');
        fetchRecipes();
    });
}

function renderRecipes(items) {
    const listEl = document.getElementById('recipe-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!items || items.length === 0) {
        listEl.innerHTML = '<p class="inventory-empty-msg">レシピが見つかりません</p>';
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'card';
        div.onclick = () => openRecipeDetail(item);
        
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
                const statusIcon = ing.in_stock ? '✅' : '❌';
                const statusClass = ing.in_stock ? 'ing-status-ok' : 'ing-status-missing';
                
                let addBtnHtml = '';
                if (!ing.in_stock) {
                    missingItems.push(ing.name);
                    // ★修正: 確実にIDを渡す
                    addBtnHtml = `<button class="btn-quick-add" onclick="quickAddToInventory(${ing.catalog_id}, '${ing.name}')">＋在庫へ</button>`;
                }

                if (ing.group_name && ing.group_name !== currentGroup) {
                    currentGroup = ing.group_name;
                    html += `<li class="recipe-group-header">${currentGroup}</li>`;
                } else if (!ing.group_name && currentGroup !== "") {
                    currentGroup = "";
                }

                html += `
                <li style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed #eee; padding:8px 0;">
                    <div style="display:flex; align-items:center;">
                        <span class="${statusClass}">
                            ${statusIcon} ${ing.name}
                        </span>
                        ${addBtnHtml}
                    </div>
                    <span style="font-weight:bold; font-size:13px;">${ing.amount}${ing.unit}</span>
                </li>`;
            });
            html += '</ul>';
            ingArea.innerHTML = html;

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

// クイック在庫追加
window.quickAddToInventory = function(catalogId, name) {
    if (!confirm(`「${name}」を在庫(その他)に追加しますか？`)) return;

    const catId = parseInt(catalogId, 10);
    if (isNaN(catId) || catId <= 0) {
        alert("エラー: 食材IDが不正です(カタログに未登録の可能性があります)");
        return;
    }

    const data = {
        catalog_id: catId,
        amount: -1, 
        unit: "",
        expiration_date: "",
        location: "その他"
    };

    fetch('/api/ingredients', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
    .then(async res => {
        if (!res.ok) throw new Error(await res.text());
        alert(`「${name}」を追加しました！`);
        // モーダル閉じて在庫画面なら更新
        document.getElementById('modal-recipe-detail').classList.remove('active');
        if (typeof fetchInventory === 'function') fetchInventory();
    })
    .catch(err => alert('追加失敗: ' + err));
};