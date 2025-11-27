let inventoryData = [];
let catalogListForInv = [];

function initInventory() {
    if (window.fetchLocations) window.fetchLocations();
    // 写真と在庫の取得
    if (window.fetchFridgePhotos) window.fetchFridgePhotos();

    // 初回: 在庫取得 -> カタログ取得(フィルタリング)
    window.fetchInventory().then(fetchCatalogForInv);
    
    setupInventoryUI();
    if (window.setupLocationUI) window.setupLocationUI();
    if (window.setupPhotoUI) window.setupPhotoUI();
}

window.fetchInventory = function() {
    return fetch('/api/ingredients')
        .then(res => res.json())
        .then(data => {
            inventoryData = data;
            renderInventory(inventoryData);
        })
        .catch(err => console.error(err));
};

function fetchCatalogForInv() {
    fetch('/api/catalog')
        .then(res => res.json())
        .then(data => {
            const inventoryCatalogIds = new Set(
                inventoryData.map(item => item.catalog_id)
            );

            // 調味料を除外し、かつ在庫にないものをフィルタリング
            let filteredData = data.filter(item => {
                const isSeasoning = item.classification === '調味料';
                const isInInventory = inventoryCatalogIds.has(item.id);
                return !isSeasoning && !isInInventory;
            });

            // ソート
            filteredData.sort((a, b) => {
                const compare = (keyA, keyB) => keyA.localeCompare(keyB, 'ja');
                let result = compare(a.classification || '', b.classification || '');
                if (result !== 0) return result;
                result = compare(a.category || '', b.category || '');
                if (result !== 0) return result;
                const ka = a.kana || a.name;
                const kb = b.kana || b.name;
                return compare(ka, kb);
            });
            
            catalogListForInv = filteredData;
            updateCatalogSelect();
        });
}

function updateCatalogSelect() {
    const select = document.getElementById('inv-select-catalog');
    if (!select) return;
    select.innerHTML = '<option value="">カタログから選択...</option>';
    catalogListForInv.forEach(item => {
        const opt = document.createElement('option');
        const classification = item.classification || '分類なし';
        const category = item.category || 'カテゴリなし';
        const kana = item.kana ? ` (${item.kana})` : '';

        opt.value = item.id;
        opt.textContent = `${classification} / ${category} - ${item.name}${kana}`;
        opt.dataset.unit = item.default_unit;
        select.appendChild(opt);
    });
}

function renderInventory(items) {
    const listEl = document.getElementById('inventory-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    // 場所リスト定義（固定）
    const fixedLocations = ["冷蔵室", "チルド", "冷凍室", "野菜室", "その他"];
    
    // アイテムを場所ごとに振り分け
    const itemsByLoc = {};
    fixedLocations.forEach(loc => itemsByLoc[loc] = []);
    
    // 定義外の場所も考慮して振り分け
    items.forEach(item => {
        const loc = item.location || 'その他';
        if (itemsByLoc[loc]) {
            itemsByLoc[loc].push(item);
        } else {
            // 定義外は「その他」に入れるか、新たなキーを作るか。
            // 今回は「その他」にまとめる方針で実装
            itemsByLoc['その他'].push(item);
        }
    });

    // 描画ループ
    fixedLocations.forEach(loc => {
        const locItems = itemsByLoc[loc] || [];

        // 1. 場所ヘッダー
        const header = document.createElement('div');
        header.className = 'loc-header-badge';
        header.textContent = loc;
        listEl.appendChild(header);

        // 2. 写真エリア
        if (window.renderLocationPhotos) {
            const photoStrip = window.renderLocationPhotos(loc);
            listEl.appendChild(photoStrip);
        }

        // 3. アイテムリスト
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
                    if (!e.target.classList.contains('recipe-badge-btn')) {
                        openInventoryEdit(item);
                    }
                };
            
                // --- 日付の色判定 (クラス切り替え) ---
                const today = new Date();
                today.setHours(0,0,0,0);
                const expDate = new Date(item.expiration_date);
                expDate.setHours(0,0,0,0);
                
                const diffTime = expDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                let dateClass = 'status-normal'; // 黒
                let dateText = item.expiration_date.split('T')[0];

                if (diffDays < 0) {
                    dateClass = 'status-expired'; // 赤
                    dateText += ' (期限切れ)';
                } else if (diffDays <= 2) {
                    dateClass = 'status-soon'; // 青
                    if (diffDays === 0) dateText += ' (今日)';
                    else dateText += ` (あと${diffDays}日)`;
                }

                // バッジ
                let badgeHtml = '';
                if (item.recipe_count > 0) {
                    badgeHtml = `<span class="recipe-badge-btn" onclick="goToFilteredRecipes(${item.catalog_id}, '${item.name}')">🍳 ${item.recipe_count}</span>`;
                }

                // サムネイル
                let thumbHtml = '';
                if (item.image_path) {
                    thumbHtml = `<img src="/images/${item.image_path}" class="list-thumbnail">`;
                }

                // 在庫数
                let amountDisplay = '';
                if (item.amount === -1) {
                    amountDisplay = '<span class="stock-status-ok">在庫あり</span>';
                } else {
                    amountDisplay = `${item.amount} ${item.unit}`;
                }

                div.innerHTML = `
                    <div style="display:flex; align-items:center;">
                        ${thumbHtml}
                        <div class="card-content" style="flex:1;">
                            <div style="display:flex; align-items:center;">
                                <span class="tag date-tag ${dateClass}">期限: ${dateText}</span>
                            </div>
                            <div style="display:flex; align-items:center; margin-top:4px;">
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

window.goToFilteredRecipes = function(catalogId, itemName) {
    sessionStorage.setItem('recipe_filter_id', catalogId);
    sessionStorage.setItem('recipe_filter_name', itemName);
    const recipeTab = document.querySelector('a[data-view="recipes"]');
    if(recipeTab) recipeTab.click();
};

function openInventoryEdit(item) {
    const overlay = document.getElementById('modal-inv-edit');
    document.getElementById('inv-edit-title').textContent = item.name + ' の管理';
    document.getElementById('inv-edit-id').value = item.id;
    document.getElementById('inv-edit-amount').value = item.amount;
    document.getElementById('inv-edit-unit').textContent = item.unit;
    document.getElementById('inv-edit-date').value = item.expiration_date.split('T')[0];

    const locSelect = document.getElementById('inv-edit-location');
    if(item.location) {
        locSelect.value = item.location;
    }
    overlay.classList.add('active');
}

window.addAmount = function(val) {
    const input = document.getElementById('inv-amount');
    let current = parseFloat(input.value) || 0;
    let nextVal = current + val;
    
    if (nextVal < 0) nextVal = 0;
    
    input.value = Math.round(nextVal * 10) / 10;
};

function setupInventoryUI() {
    const fab = document.getElementById('fab-add-inventory');
    const overlay = document.getElementById('modal-inventory');
    const editOverlay = document.getElementById('modal-inv-edit');
    const btnCancel = document.getElementById('btn-inv-cancel');
    const btnSave = document.getElementById('btn-inv-save');
    const btnEditCancel = document.getElementById('btn-inv-edit-cancel');
    const btnUpdate = document.getElementById('btn-inv-update');
    const btnDelete = document.getElementById('btn-inv-delete');
    const select = document.getElementById('inv-select-catalog');
    const unitInput = document.getElementById('inv-unit');
    const searchInput = document.getElementById('inventory-search');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            if (!term) {
                renderInventory(inventoryData);
                return;
            }
            // 検索時も場所分け表示を維持するため、フィルタリング後に renderInventory に渡す
            // ただし renderInventory は全件再描画で場所分けするので、
            // フィルタ後のデータを渡しても正しく動く
            const filtered = inventoryData.filter(item => 
                item.name.toLowerCase().includes(term)
            );
            renderInventory(filtered);
        });
    }

    const detailToggle = document.getElementById('inv-detail-toggle');
    const detailArea = document.getElementById('inv-detail-area');
    if (detailToggle) {
        detailToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                detailArea.style.display = 'block';
            } else {
                detailArea.style.display = 'none';
            }
        });
    }

    if (!fab) return;

    fab.addEventListener('click', () => {
        document.getElementById('inv-detail-toggle').checked = false;
        document.getElementById('inv-detail-area').style.display = 'none';
        document.getElementById('inv-amount').value = 1; 
        overlay.classList.add('active');
    });
    btnCancel.addEventListener('click', () => overlay.classList.remove('active'));
    btnEditCancel.addEventListener('click', (e) => {
        e.preventDefault();
        editOverlay.classList.remove('active');
    });
    select.addEventListener('change', () => {
        const selected = select.options[select.selectedIndex];
        const u = selected.dataset.unit || '';
        unitInput.value = u;
    });

    btnSave.addEventListener('click', () => {
        const catalogId = parseInt(select.value);
        const location = document.getElementById('inv-location').value;

        let amount = -1;
        let date = "";
        
        if (document.getElementById('inv-detail-toggle').checked) {
            amount = parseFloat(document.getElementById('inv-amount').value);
            if (isNaN(amount)) amount = 1; 
            date = document.getElementById('inv-date').value;
        }

        let expirationDate = "";
        if (date) {
            expirationDate = date + "T00:00:00Z";
        }

        if (!catalogId) return alert('食材を選んでください');

        const data = {
            catalog_id: catalogId,
            amount: amount,
            unit: unitInput.value,
            expiration_date: expirationDate,
            location: location
        };

        fetch('/api/ingredients', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        })
        .then(res => {
            if (!res.ok) throw new Error('Failed');
            overlay.classList.remove('active');
            window.fetchInventory().then(() => fetchCatalogForInv());
        })
        .catch(err => alert('エラー: ' + err));
    });

    btnUpdate.addEventListener('click', () => {
        const id = document.getElementById('inv-edit-id').value;
        const amount = parseFloat(document.getElementById('inv-edit-amount').value);
        const date = document.getElementById('inv-edit-date').value;
        const location = document.getElementById('inv-edit-location').value;

        if (isNaN(amount)) return alert('数量を入力してください');

        let expirationDate = "";
        if (date) {
            expirationDate = date.includes('T') ? date : date + "T00:00:00Z";
        }

        const data = {
            id: parseInt(id),
            amount: amount,
            expiration_date: expirationDate,
            location: location
        };

        fetch('/api/ingredients', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        })
        .then(res => {
            if (!res.ok) throw new Error('Update failed');
            editOverlay.classList.remove('active');
            window.fetchInventory().then(() => fetchCatalogForInv());
        })
        .catch(err => alert('更新エラー: ' + err));
    });

    btnDelete.addEventListener('click', () => {
        if (!confirm('本当に削除しますか？（使い切ったことになります）')) return;
        const id = document.getElementById('inv-edit-id').value;
        fetch(`/api/ingredients?id=${id}`, { method: 'DELETE' })
        .then(res => {
            if (!res.ok) throw new Error('Delete failed');
            editOverlay.classList.remove('active');
            window.fetchInventory().then(() => fetchCatalogForInv());
        })
        .catch(err => alert('削除エラー: ' + err));
    });
}