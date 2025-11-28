var catalogListForInv = [];
var currentSelectorCategory = 'すべて';
// ★「ドアポケット」を追加
var FIXED_LOCATIONS_EDIT = ["冷蔵室", "チルド", "冷凍室", "野菜室", "ドアポケット", "その他"];

function initInventoryEdit() {
    setupLocationSelects();
    fetchCatalogForInv();
    setupEditEventListeners();
}

function fetchCatalogForInv() {
    fetch('/api/catalog')
        .then(res => res.json())
        .then(data => {
            // ★修正: フィルタなし（調味料も含む）
            let filteredData = data;
            filteredData.sort((a, b) => {
                const ka = a.kana || a.name;
                const kb = b.kana || b.name;
                return ka.localeCompare(kb, 'ja');
            });
            catalogListForInv = filteredData;
        });
}

function setupLocationSelects() {
    const ids = ['inv-location', 'inv-edit-location'];
    ids.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const current = select.value;
        select.innerHTML = '';
        FIXED_LOCATIONS_EDIT.forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc;
            opt.textContent = loc;
            select.appendChild(opt);
        });
        if (current && FIXED_LOCATIONS_EDIT.includes(current)) select.value = current;
        else select.value = FIXED_LOCATIONS_EDIT[0];
    });
}

function setupEditEventListeners() {
    const fab = document.getElementById('fab-add-inventory');
    const overlay = document.getElementById('modal-inventory');
    const editOverlay = document.getElementById('modal-inv-edit');
    const btnCancel = document.getElementById('btn-inv-cancel');
    const btnSave = document.getElementById('btn-inv-save');
    const btnEditCancel = document.getElementById('btn-inv-edit-cancel');
    const btnUpdate = document.getElementById('btn-inv-update');
    const btnDelete = document.getElementById('btn-inv-delete');

    if (fab) {
        fab.onclick = () => {
            document.getElementById('inv-detail-toggle').checked = false;
            document.getElementById('inv-detail-area').style.display = 'none';
            document.getElementById('inv-amount').value = 1; 
            
            const idInput = document.getElementById('inv-select-catalog-id');
            if(idInput) idInput.value = "";
            
            const btn = document.getElementById('btn-open-selector');
            if(btn) {
                btn.textContent = "食材を選択してください...";
                btn.style.fontWeight = 'normal';
                btn.style.color = '#333';
            }
            setupLocationSelects();
            overlay.classList.add('active');
        };
    }

    if (btnCancel) btnCancel.onclick = () => overlay.classList.remove('active');
    if (btnEditCancel) btnEditCancel.onclick = () => editOverlay.classList.remove('active');

    if (btnSave) {
        btnSave.onclick = () => {
            const idInput = document.getElementById('inv-select-catalog-id');
            const val = idInput ? idInput.value : "";
            
            if (!val) {
                alert('食材を選択してください');
                return;
            }
            
            const catalogId = parseInt(val, 10);
            if (isNaN(catalogId)) {
                alert('IDエラー');
                return;
            }

            const location = document.getElementById('inv-location').value;
            const unit = document.getElementById('inv-unit').value;
            let amount = -1;
            let date = "";
            
            if (document.getElementById('inv-detail-toggle').checked) {
                amount = parseFloat(document.getElementById('inv-amount').value) || 1;
                date = document.getElementById('inv-date').value;
            }
            let expirationDate = date ? date + "T00:00:00Z" : "";

            const data = {
                catalog_id: catalogId,
                amount: amount,
                unit: unit,
                expiration_date: expirationDate,
                location: location
            };

            // 在庫テーブルへ保存
            fetch('/api/ingredients', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                overlay.classList.remove('active');
                if(window.fetchInventory) window.fetchInventory();
            })
            .catch(err => alert('保存エラー: ' + err));
        };
    }

    if (btnUpdate) {
        btnUpdate.onclick = () => {
            const id = document.getElementById('inv-edit-id').value;
            const amount = parseFloat(document.getElementById('inv-edit-amount').value);
            const date = document.getElementById('inv-edit-date').value;
            const location = document.getElementById('inv-edit-location').value;

            const data = {
                id: parseInt(id),
                amount: amount,
                expiration_date: date ? date + "T00:00:00Z" : "",
                location: location
            };

            fetch('/api/ingredients', {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            }).then(async res => {
                if(!res.ok) throw new Error(await res.text());
                editOverlay.classList.remove('active');
                if(window.fetchInventory) window.fetchInventory();
            }).catch(err => alert('更新エラー: ' + err));
        };
    }

    if (btnDelete) {
        btnDelete.onclick = () => {
            if(!confirm('削除しますか？')) return;
            const id = document.getElementById('inv-edit-id').value;
            fetch(`/api/ingredients?id=${id}`, { method: 'DELETE' })
            .then(async res => {
                if(!res.ok) throw new Error(await res.text());
                editOverlay.classList.remove('active');
                if(window.fetchInventory) window.fetchInventory();
            }).catch(err => alert('削除エラー: ' + err));
        };
    }

    setupItemSelector();
}

function setupItemSelector() {
    const btnOpen = document.getElementById('btn-open-selector');
    const modal = document.getElementById('modal-item-selector');
    const btnClose = document.getElementById('btn-selector-close');
    const searchInput = document.getElementById('selector-search');

    if(!btnOpen) return;

    btnOpen.onclick = () => {
        modal.classList.add('active');
        renderSelectorCategories();
        renderSelectorList();
    };
    if(btnClose) btnClose.onclick = () => modal.classList.remove('active');
    if(searchInput) searchInput.oninput = () => renderSelectorList();
}

function renderSelectorCategories() {
    const container = document.getElementById('selector-tabs');
    if (!container) return;
    container.innerHTML = '';
    const categories = new Set(['すべて']);
    catalogListForInv.forEach(item => {
        if(item.category) categories.add(item.category);
        else categories.add('未分類');
    });
    categories.forEach(cat => {
        const div = document.createElement('div');
        div.className = `selector-tab ${cat === currentSelectorCategory ? 'active' : ''}`;
        div.textContent = cat;
        div.onclick = () => {
            currentSelectorCategory = cat;
            renderSelectorCategories();
            renderSelectorList();
        };
        container.appendChild(div);
    });
}

function renderSelectorList() {
    const container = document.getElementById('selector-list');
    const term = document.getElementById('selector-search').value.toLowerCase();
    container.innerHTML = '';

    const filtered = catalogListForInv.filter(item => {
        let catMatch = (currentSelectorCategory === 'すべて') || (item.category === currentSelectorCategory);
        let termMatch = true;
        if(term) {
            termMatch = item.name.toLowerCase().includes(term) || (item.kana && item.kana.toLowerCase().includes(term));
        }
        return catMatch && termMatch;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#999;">該当なし</div>';
        return;
    }

    filtered.forEach(item => {
        const div = document.createElement('div');
        div.className = 'selector-item';
        // アイコン分け
        const icon = item.classification === '調味料' ? '🧂' : '🥬';
        div.innerHTML = `${icon} ${item.name} <span class="selector-item-kana">${item.kana || ''}</span>`;
        
        div.onclick = () => {
            document.getElementById('inv-select-catalog-id').value = item.id;
            const btn = document.getElementById('btn-open-selector');
            btn.textContent = item.name;
            btn.style.fontWeight = 'bold';
            btn.style.color = '#000';
            document.getElementById('inv-unit').value = item.default_unit || '';
            document.getElementById('modal-item-selector').classList.remove('active');
        };
        container.appendChild(div);
    });
}

window.openInventoryEdit = function(item) {
    const modal = document.getElementById('modal-inv-edit');
    if (!modal) return;
    document.getElementById('inv-edit-title').textContent = item.name;
    document.getElementById('inv-edit-id').value = item.id;
    document.getElementById('inv-edit-amount').value = item.amount;
    document.getElementById('inv-edit-unit').textContent = item.unit;
    document.getElementById('inv-edit-date').value = item.expiration_date.split('T')[0];

    setupLocationSelects();
    const locSelect = document.getElementById('inv-edit-location');
    let loc = item.location;
    if (!FIXED_LOCATIONS_EDIT.includes(loc)) loc = 'その他';
    locSelect.value = loc;
    
    modal.classList.add('active');
};

window.addAmount = function(val) {
    const input = document.getElementById('inv-amount');
    let current = parseFloat(input.value) || 0;
    let nextVal = current + val;
    if (nextVal < 0) nextVal = 0;
    input.value = Math.round(nextVal * 10) / 10;
};