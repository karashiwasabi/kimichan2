var recipeData = [];
var currentRecipeDetail = null;
var currentIngredients = [];
var currentMissingItems = []; // ★追加: 一括追加用に不足リストを保持

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
    bar.className = 'recipe-group-header';
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
            currentMissingItems = []; // ★リセット

            if (!ingredients || ingredients.length === 0) {
                ingArea.innerHTML = '<div style="color:#999;">材料登録なし</div>';
                return;
            }

            let html = '<ul style="list-style:none; padding:0;">';
            let missingItemsNames = [];
            let currentGroup = "";

            ingredients.forEach(ing => {
                const statusIcon = ing.in_stock ? '✅' : '❌';
                const statusClass = ing.in_stock ? 'ing-status-ok' : 'ing-status-missing';
                
                let addBtnHtml = '';
                if (!ing.in_stock) {
                    missingItemsNames.push(ing.name);
                    // ★一括追加用に保持
                    currentMissingItems.push({ id: ing.catalog_id, name: ing.name });

                    // 個別追加ボタンも残す
                    addBtnHtml = `<button class="btn-quick-add" onclick="quickAddToInventory(${ing.catalog_id}, '${ing.name}')">＋在庫へ</button>`;
                }

                if (ing.group_name && ing.group_name !== currentGroup) {
                    currentGroup = ing.group_name;
                    html += `<li class="recipe-group-header">${currentGroup}</li>`;
                } else if (!ing.group_name && currentGroup !== "") {
                    currentGroup = "";
                }

                const detailsHtml = ing.details ? `<span style="font-size:11px; color:#666; margin-left:4px;">(${ing.details})</span>` : '';
                const combinedAmount = ing.unit ? `${ing.amount}${ing.unit}` : ing.amount;

                html += `
                <li style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed #eee; padding:8px 0;">
                    <div style="display:flex; align-items:center;">
                        <span class="${statusClass}">
                             ${statusIcon} ${ing.name}${detailsHtml}
                        </span>
                        ${addBtnHtml}
                    </div>
                    <span style="font-weight:bold; font-size:13px;">${combinedAmount}</span>
                </li>`;
            });
            html += '</ul>';
            ingArea.innerHTML = html;

            if (missingItemsNames.length > 0 && missingAlert) {
                missingAlert.style.display = 'block';
                // ★一括追加ボタンを含めたHTMLに変更
                missingAlert.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <strong>⚠️ 足りないもの (${missingItemsNames.length})</strong>
                        <button class="btn-save" style="padding:4px 12px; font-size:11px; background:#27ae60;" onclick="bulkAddMissingToInventory()">まとめて在庫へ</button>
                    </div>
                    <div style="font-size:12px;">${missingItemsNames.join('、')}</div>
                `;
            }
        })
        .catch(err => {
            console.error(err);
            ingArea.innerHTML = '<div style="color:red;">読み込みエラー</div>';
        });

    modal.classList.add('active');
}

// 個別追加
window.quickAddToInventory = function(catalogId, name) {
    if (!confirm(`「${name}」を在庫(その他)に追加しますか？`)) return;
    postIngredientToInventory(catalogId, name).then(() => {
        alert(`「${name}」に追加しました！`);
        document.getElementById('modal-recipe-detail').classList.remove('active');
        if (typeof fetchInventory === 'function') fetchInventory();
    });
};

// ★一括追加
window.bulkAddMissingToInventory = function() {
    if (currentMissingItems.length === 0) return;
    if (!confirm(`不足している食材 ${currentMissingItems.length} 点を全て在庫に追加しますか？`)) return;

    // Promise.allで並列実行
    const promises = currentMissingItems.map(item => postIngredientToInventory(item.id, item.name));

    Promise.all(promises)
        .then(() => {
            alert('全ての不足食材を追加しました！');
            document.getElementById('modal-recipe-detail').classList.remove('active');
            if (typeof fetchInventory === 'function') fetchInventory();
        })
        .catch(err => alert('エラーが発生しました: ' + err));
};

// 共通の追加API呼び出し
function postIngredientToInventory(catalogId, name) {
    const catId = parseInt(catalogId, 10);
    if (isNaN(catId) || catId <= 0) {
        return Promise.reject("ID不正");
    }

    const data = {
        catalog_id: catId,
        amount: -1, 
        unit: "",
        expiration_date: "",
        location: "その他"
    };

    return fetch('/api/ingredients', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    }).then(async res => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    });
}