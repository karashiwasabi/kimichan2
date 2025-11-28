// catalog_list.js で定義した FIXED_CATEGORIES を参照したいが、
// モジュール分割されていないため再定義して安全策を取ります
const FIXED_CATEGORIES_EDIT = [
    "野菜", "肉", "肉加工品", "魚介", "缶詰", "卵・乳製品", 
    "大豆製品", "調味料", "乾物・粉類", "麺類", "パン", "穀物", "その他"
];

function setupCatalogUI() {
    const fab = document.getElementById('fab-add');
    const overlay = document.getElementById('modal-overlay');
    const btnCancel = document.getElementById('btn-cancel');
    const btnSave = document.getElementById('btn-save');
    const btnDelete = document.getElementById('btn-delete-catalog');
    
    const tabSingle = document.getElementById('tab-single');
    const tabCsv = document.getElementById('tab-csv');
    const singleContainer = document.getElementById('form-single');
    const csvContainer = document.getElementById('form-csv');
    
    const searchInput = document.getElementById('catalog-search');
    const sortSelect = document.getElementById('sort-order');
    const noKanaCheck = document.getElementById('filter-no-kana');
    const nameInput = document.getElementById('input-name');

    if (!fab) return;

    // 新規登録
    fab.addEventListener('click', () => {
        resetModal('アイテム登録');
        document.getElementById('edit-id').value = '';
        document.getElementById('original-name').value = '';
        if(btnDelete) btnDelete.style.display = 'none';
        
        // カテゴリプルダウンを初期化
        updateCategorySelectEdit('');
        overlay.classList.add('active');
    });

    btnCancel.addEventListener('click', () => {
        overlay.classList.remove('active');
        removeConflictUI();
    });

    if (btnDelete) {
        btnDelete.addEventListener('click', () => {
            const id = document.getElementById('edit-id').value;
            const name = document.getElementById('input-name').value;
            if(id) deleteCatalogItem(id, name);
        });
    }

    if (typeof filterAndRender === 'function') {
        searchInput.addEventListener('input', filterAndRender);
        sortSelect.addEventListener('change', filterAndRender);
        noKanaCheck.addEventListener('change', filterAndRender);
    }

    nameInput.addEventListener('input', (e) => {
        updateReferenceList(e.target.value);
    });

    tabSingle.addEventListener('click', () => switchTab('single'));
    tabCsv.addEventListener('click', () => switchTab('csv'));

    btnSave.addEventListener('click', () => {
        if (singleContainer.style.display !== 'none') {
            saveSingleItem();
        } else {
            saveCsvItem();
        }
    });
}

// --- ヘルパー関数 ---

function switchTab(mode) {
    const tabSingle = document.getElementById('tab-single');
    const tabCsv = document.getElementById('tab-csv');
    const singleContainer = document.getElementById('form-single');
    const csvContainer = document.getElementById('form-csv');

    if (mode === 'single') {
        tabSingle.classList.add('active');
        tabCsv.classList.remove('active');
        singleContainer.style.display = 'block';
        csvContainer.style.display = 'none';
    } else {
        tabCsv.classList.add('active');
        tabSingle.classList.remove('active');
        singleContainer.style.display = 'none';
        csvContainer.style.display = 'block';
    }
    removeConflictUI();
    document.getElementById('csv-result-area').style.display = 'none';
}

function resetModal(titleText) {
    document.getElementById('modal-title').textContent = titleText;
    document.getElementById('original-unit').value = '';
    document.getElementById('input-name').value = '';
    document.getElementById('input-kana').value = '';
    document.getElementById('input-unit').value = '';
    document.getElementById('input-csv-text').value = '';
    document.getElementById('reference-area').style.display = 'none';
    document.getElementById('csv-result-area').style.display = 'none';
    switchTab('single');
}

async function openCatalogEditModal(item) {
    resetModal('アイテム編集');
    const overlay = document.getElementById('modal-overlay');
    const btnDelete = document.getElementById('btn-delete-catalog');
    
    document.getElementById('edit-id').value = item.id;
    document.getElementById('original-unit').value = item.default_unit || '';
    document.getElementById('original-name').value = item.name || ''; 
    document.getElementById('input-classification').value = item.classification;
    document.getElementById('input-name').value = item.name;
    document.getElementById('input-kana').value = item.kana || '';
    document.getElementById('input-unit').value = item.default_unit;

    // ★カテゴリプルダウンをセット
    updateCategorySelectEdit(item.category);

    if (btnDelete) {
        btnDelete.style.display = 'none';
        try {
            const res = await fetch(`/api/catalog/usage?id=${item.id}`);
            const usage = await res.json();
            if (usage.recipe_count === 0) {
                btnDelete.style.display = 'inline-block';
            }
        } catch(e) { console.error(e); }
    }

    if (item.name) updateReferenceList(item.name);
    overlay.classList.add('active');
}

function removeConflictUI() {
    const conflictDiv = document.getElementById('conflict-resolution-area');
    if (conflictDiv) conflictDiv.remove();
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
        btnSave.style.display = 'block';
        btnSave.textContent = '保存';
    }
}

// ★修正: 固定リストを使ってプルダウンを作る
function updateCategorySelectEdit(selectedCategory) {
    const select = document.getElementById('select-category');
    // 手入力欄は廃止（固定リストのみにする）
    const input = document.getElementById('input-category');
    if(input) input.style.display = 'none'; 

    select.innerHTML = '';
    
    // 固定リストを展開
    FIXED_CATEGORIES_EDIT.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
    });

    // 選択
    if (selectedCategory && FIXED_CATEGORIES_EDIT.includes(selectedCategory)) {
        select.value = selectedCategory;
    } else {
        select.value = "その他"; // デフォルト
    }
}

function updateReferenceList(name) {
    const refArea = document.getElementById('reference-area');
    const refList = document.getElementById('reference-list');
    
    if (!name || name.length < 1) {
        refArea.style.display = 'none';
        return;
    }
    // catalogData (list.js) がある前提
    if (typeof catalogData === 'undefined') return;

    const term = name.toLowerCase();
    const hits = catalogData.filter(d => {
        const n = d.name.toLowerCase();
        const k = d.kana ? d.kana.toLowerCase() : '';
        return n.includes(term) || k.includes(term) || term.includes(n);
    }).slice(0, 8);

    if (hits.length === 0) {
        refArea.style.display = 'none';
        return;
    }

    refList.innerHTML = '';
    hits.forEach(hit => {
        const chip = document.createElement('div');
        chip.className = 'preset-chip'; // CSS流用
        chip.innerHTML = `<strong>${hit.name}</strong>`;
        chip.onclick = () => applyReferenceItem(hit);
        refList.appendChild(chip);
    });
    refArea.style.display = 'block';
}

function applyReferenceItem(item) {
    if (!confirm(`この食材を「${item.name}」として設定（統合）しますか？`)) return;
    document.getElementById('input-name').value = item.name;
    document.getElementById('input-kana').value = item.kana || '';
    document.getElementById('input-classification').value = item.classification;
    document.getElementById('input-unit').value = item.default_unit || '';
    updateCategorySelectEdit(item.category);
}

async function saveSingleItem() {
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('input-name').value;
    const originalName = document.getElementById('original-name').value;
    
    // カテゴリはプルダウンから取得（手入力廃止）
    const category = document.getElementById('select-category').value;
    
    if (!name) return alert('名前を入力してください');

    if (id && name !== originalName) {
        try {
            const res = await fetch(`/api/catalog/usage?id=${id}`);
            const usage = await res.json();
            if (usage.recipe_count > 0) {
                 if (!confirm(`この食材は ${usage.recipe_count} 件のレシピで使用されています。\n名前を変更すると全てに影響します。よろしいですか？`)) return;
            }
        } catch(e) {}
    }

    const item = {
        id: id ? parseInt(id) : 0,
        classification: document.getElementById('input-classification').value,
        category: category,
        name: name,
        kana: document.getElementById('input-kana').value,
        default_unit: document.getElementById('input-unit').value,
        force_merge: false
    };

    let method = 'POST';
    if (id) method = 'PUT';

    fetch('/api/catalog', {
        method: method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(id ? item : [item])
    })
    .then(async res => {
        const data = await res.json();
        if (res.status === 409 && data.error_code === 'merge_confirmation_required') {
             if (confirm(`${data.message}\n\n「OK」を押すとデータを統合します。`)) {
                item.force_merge = true;
                return fetch('/api/catalog', {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(item)
                }).then(r => r.json());
            } else {
                throw new Error('キャンセルしました');
            }
        }
        if (!res.ok) throw new Error(data.error || 'Save failed');
        return data;
    })
    .then(() => {
        document.getElementById('modal-overlay').classList.remove('active');
        if (typeof fetchCatalog === 'function') fetchCatalog();
        alert('保存しました');
    })
    .catch(err => {
        if (err.message !== 'キャンセルしました') alert('エラー: ' + err.message);
    });
}

function deleteCatalogItem(id, name) {
    if (!confirm(`本当に「${name}」を削除しますか？`)) return;
    fetch(`/api/catalog?id=${id}`, { method: 'DELETE' })
    .then(async res => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    })
    .then(() => {
        alert('削除しました');
        document.getElementById('modal-overlay').classList.remove('active');
        if (typeof fetchCatalog === 'function') fetchCatalog();
    })
    .catch(err => alert('削除エラー: ' + err.message));
}

// CSV一括登録 (省略なし)
function saveCsvItem() {
    const text = document.getElementById('input-csv-text').value;
    if (!text) return alert('CSVを入力してください');

    fetch('/import/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text
    })
    .then(async res => {
        if (!res.ok) {
             const data = await res.json().catch(() => ({ error: res.statusText }));
             throw new Error(data.error || res.statusText);
        }
        return res.json();
    })
    .then(result => {
        const area = document.getElementById('csv-result-area');
        area.style.display = 'block';
        area.innerHTML = `
            <p>成功: <strong>${result.added}</strong> / 重複: <strong>${result.skipped}</strong></p>
        `;
        if (result.errors && result.errors.length > 0) {
            area.innerHTML += `<div style="color:red;font-size:11px;margin-top:5px;">${result.errors.join('<br>')}</div>`;
        }
        if (typeof fetchCatalog === 'function') fetchCatalog();
        document.getElementById('input-csv-text').value = '';
    })
    .catch(err => alert('エラー: ' + err.message));
}