var inventoryData = [];
// ★ドアポケットを追加
var FIXED_LOCATIONS = ["冷蔵室", "チルド", "冷凍室", "野菜室", "ドアポケット", "その他"];

function initInventory() {
    if (window.fetchFridgePhotos) window.fetchFridgePhotos();
    fetchInventory();
    if (typeof initInventoryEdit === 'function') initInventoryEdit();
    if (typeof setupPhotoUI === 'function') setupPhotoUI();
}

window.fetchInventory = function() {
    return fetch('/api/ingredients')
        .then(res => res.json())
        .then(data => {
            inventoryData = data;
            const searchInput = document.getElementById('inventory-search');
            if (searchInput && searchInput.value) {
                const term = searchInput.value.toLowerCase().trim();
                const filtered = inventoryData.filter(item => 
                    item.name.toLowerCase().includes(term) || 
                    (item.kana && item.kana.toLowerCase().includes(term))
                );
                renderInventory(filtered);
            } else {
                renderInventory(inventoryData);
            }
        })
        .catch(err => console.error(err));
};

function renderInventory(items) {
    const listEl = document.getElementById('inventory-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const itemsByLoc = {};
    FIXED_LOCATIONS.forEach(loc => itemsByLoc[loc] = []);
    
    items.forEach(item => {
        let loc = item.location || 'その他';
        if (!FIXED_LOCATIONS.includes(loc)) loc = 'その他';
        itemsByLoc[loc].push(item);
    });

    FIXED_LOCATIONS.forEach(loc => {
        const locItems = itemsByLoc[loc] || [];
        const header = document.createElement('div');
        header.className = 'loc-header-badge';
        header.textContent = loc;
        listEl.appendChild(header);

        if (typeof window.renderLocationPhotos === 'function') {
            const photoStrip = window.renderLocationPhotos(loc);
            listEl.appendChild(photoStrip);
        }

        if (locItems.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'inventory-empty-msg';
            emptyMsg.textContent = '（在庫なし）';
            listEl.appendChild(emptyMsg);
        } else {
            locItems.forEach(item => {
                const div = document.createElement('div');
                div.className = 'card';
                div.onclick = (e) => {
                    if (!e.target.closest('.recipe-badge-btn')) {
                        if (typeof openInventoryEdit === 'function') openInventoryEdit(item);
                    }
                };
            
                const today = new Date();
                today.setHours(0,0,0,0);
                const expDate = new Date(item.expiration_date);
                expDate.setHours(0,0,0,0);
                const diffTime = expDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                let dateClass = 'status-normal';
                let dateText = item.expiration_date.split('T')[0];
                if (diffDays < 0) { dateClass = 'status-expired'; dateText += ' (期限切れ)'; }
                else if (diffDays <= 2) { dateClass = 'status-soon'; dateText += (diffDays===0?' (今日)':` (あと${diffDays}日)`); }

                let badgeHtml = '';
                if (item.recipe_count > 0) {
                    badgeHtml = `<button class="recipe-badge-btn" onclick="goToFilteredRecipes(${item.catalog_id}, '${item.name}')">🍳 ${item.recipe_count}</button>`;
                }
                let thumbHtml = item.image_path ? `<img src="/images/${item.image_path}" class="list-thumbnail">` : '';
                let amountDisplay = item.amount === -1 ? '<span class="stock-status-ok">在庫あり</span>' : `${item.amount} ${item.unit}`;

                div.innerHTML = `
                    <div class="card-content-wrapper">
                        ${thumbHtml}
                        <div class="card-text-area">
                            <div class="card-tag-row">
                                <span class="tag date-tag ${dateClass}">期限: ${dateText}</span>
                            </div>
                            <div class="card-name-row">
                                <span class="item-name">${item.name}</span>
                                ${badgeHtml}
                            </div>
                        </div>
                    </div>
                    <div class="item-unit">${amountDisplay}</div>
                `;
                listEl.appendChild(div);
            });
        }
    });
}

document.addEventListener('input', (e) => {
    if (e.target.id === 'inventory-search') {
        const term = e.target.value.toLowerCase().trim();
        if (!term) { renderInventory(inventoryData); return; }
        const filtered = inventoryData.filter(item => {
            const nameMatch = item.name.toLowerCase().includes(term);
            const kanaMatch = item.kana && item.kana.toLowerCase().includes(term);
            return nameMatch || kanaMatch;
        });
        renderInventory(filtered);
    }
});

window.goToFilteredRecipes = function(catalogId, itemName) {
    sessionStorage.setItem('recipe_filter_id', catalogId);
    sessionStorage.setItem('recipe_filter_name', itemName);
    const recipeTab = document.querySelector('a[data-view="recipes"]');
    if(recipeTab) recipeTab.click();
};