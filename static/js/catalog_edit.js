// --- UIセットアップ ---
function setupCatalogUI() {
    const fab = document.getElementById('fab-add');
    const overlay = document.getElementById('modal-overlay');
    const btnCancel = document.getElementById('btn-cancel');
    const btnSave = document.getElementById('btn-save');
    
    const tabSingle = document.getElementById('tab-single');
    const tabCsv = document.getElementById('tab-csv');
    const singleContainer = document.getElementById('form-single');
    const csvContainer = document.getElementById('form-csv');
    
    const searchInput = document.getElementById('catalog-search');
    const sortSelect = document.getElementById('sort-order');
    const noKanaCheck = document.getElementById('filter-no-kana');
    const nameInput = document.getElementById('input-name');

    const scrollLeft = document.getElementById('scroll-left');
    const scrollRight = document.getElementById('scroll-right');
    const scrollContainer = document.getElementById('category-filters');

    // 横スクロール制御
    if(scrollLeft && scrollContainer) {
        scrollLeft.onclick = () => scrollContainer.scrollBy({ left: -100, behavior: 'smooth' });
        scrollRight.onclick = () => scrollContainer.scrollBy({ left: 100, behavior: 'smooth' });
    }

    if (!fab) return;

    // 新規登録ボタン
    fab.addEventListener('click', () => {
        resetModal('アイテム登録');
        document.getElementById('edit-id').value = '';
        document.getElementById('original-name').value = ''; // 新規なので空
        
        // 現在のカテゴリを選択状態にする
        updateCategorySelect(currentCategory !== 'すべて' && currentCategory !== '未分類' ? currentCategory : '');
        
        overlay.classList.add('active');
    });

    btnCancel.addEventListener('click', () => {
        overlay.classList.remove('active');
        removeConflictUI();
    });

    // リスト側のフィルタ関数を呼び出すイベント
    if (typeof filterAndRender === 'function') {
        searchInput.addEventListener('input', filterAndRender);
        sortSelect.addEventListener('change', filterAndRender);
        noKanaCheck.addEventListener('change', filterAndRender);
    }

    // 名前入力時の類似検索
    nameInput.addEventListener('input', (e) => {
        updateReferenceList(e.target.value);
    });

    // タブ切り替え
    tabSingle.addEventListener('click', () => switchTab('single'));
    tabCsv.addEventListener('click', () => switchTab('csv'));

    // 保存実行
    btnSave.addEventListener('click', () => {
        if (singleContainer.style.display !== 'none') {
            saveSingleItem();
        } else {
            saveCsvItem();
        }
    });
}

// --- モーダル制御・ヘルパー ---

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

function openCatalogEditModal(item) {
    resetModal('アイテム編集');
    
    const overlay = document.getElementById('modal-overlay');
    
    document.getElementById('edit-id').value = item.id;
    document.getElementById('original-unit').value = item.default_unit || '';
    document.getElementById('original-name').value = item.name || ''; 

    document.getElementById('input-classification').value = item.classification;
    updateCategorySelect(item.category);

    document.getElementById('input-name').value = item.name;
    document.getElementById('input-kana').value = item.kana || '';
    document.getElementById('input-unit').value = item.default_unit;

    if (item.name) {
        updateReferenceList(item.name);
    }

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

function updateCategorySelect(selectedCategory) {
    const select = document.getElementById('select-category');
    const input = document.getElementById('input-category');
    
    // catalogDataは catalog_list.js で定義されたグローバル変数
    const categories = new Set();
    if (typeof catalogData !== 'undefined') {
        catalogData.forEach(d => {
            if(d.category) categories.add(d.category);
        });
    }

    select.innerHTML = '<option value="">(新規入力)</option>';
    categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
    });

    if (categories.has(selectedCategory)) {
        select.value = selectedCategory;
        input.style.display = 'none';
        input.value = selectedCategory;
    } else {
        select.value = "";
        input.style.display = 'block';
        input.value = selectedCategory || "";
    }

    select.onchange = () => {
        if (select.value === "") {
            input.style.display = 'block';
            input.value = "";
        } else {
            input.style.display = 'none';
            input.value = select.value;
        }
    };
}

// --- 類似・参考機能 ---

function updateReferenceList(name) {
    const refArea = document.getElementById('reference-area');
    const refList = document.getElementById('reference-list');
    
    if (!name || name.length < 1 || typeof catalogData === 'undefined') {
        refArea.style.display = 'none';
        return;
    }

    const term = name.toLowerCase();
    
    // 双方向部分一致
    const hits = catalogData.filter(d => {
        const targetName = d.name.toLowerCase();
        const targetKana = d.kana ? d.kana.toLowerCase() : '';
        
        const dbContainsInput = targetName.includes(term) || (targetKana && targetKana.includes(term));
        const inputContainsDb = term.includes(targetName) || (targetKana && term.includes(targetKana));

        return dbContainsInput || inputContainsDb;
    }).slice(0, 8); 

    if (hits.length === 0) {
        refArea.style.display = 'none';
        return;
    }

    refList.innerHTML = '';
    hits.forEach(hit => {
        const chip = document.createElement('div');
        chip.style.cssText = 'background:white; border:1px solid #ccc; padding:4px 8px; border-radius:12px; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:5px;';
        chip.innerHTML = `
            <span style="color:#888;">[${hit.classification}/${hit.category||'-'}]</span>
            <strong>${hit.name}</strong>
        `;
        chip.onclick = () => applyReferenceItem(hit);
        refList.appendChild(chip);
    });
    refArea.style.display = 'block';
}

function applyReferenceItem(item) {
    if (!confirm(`この食材を「${item.name}」として設定（統合）しますか？\n\n※保存時に統合の確認が表示されます。`)) return;

    document.getElementById('input-name').value = item.name;
    document.getElementById('input-kana').value = item.kana || '';
    document.getElementById('input-classification').value = item.classification;
    
    updateCategorySelect(item.category);
    document.getElementById('input-unit').value = item.default_unit || '';
}

// --- 保存処理 ---

async function saveSingleItem() {
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('input-name').value;
    const originalUnit = document.getElementById('original-unit').value;
    const originalName = document.getElementById('original-name').value;
    const newUnit = document.getElementById('input-unit').value;

    if (!name) return alert('名前を入力してください');

    // 影響範囲チェック
    if (id && name !== originalName) {
        try {
            const usageRes = await fetch(`/api/catalog/usage?id=${id}`);
            const usage = await usageRes.json();
            
            if (usage.recipe_count > 0) {
                const examples = usage.recipe_names.join('、') + (usage.recipe_count > 3 ? '...' : '');
                const msg = `⚠️ この食材は ${usage.recipe_count} 件のレシピで使用されています。\n` +
                            `（使用例: ${examples}）\n\n` +
                            `名前を「${originalName}」から「${name}」に変更すると、それらのレシピの表示も全て変わります。\n\n` +
                            `変更してよろしいですか？`;
                
                if (!confirm(msg)) return;
            }
        } catch(e) {
            console.error('Usage check failed', e);
        }
    }

    // 単位変更チェック
    if (id && originalUnit !== newUnit) {
        if (!confirm(`単位が「${originalUnit || '(なし)'}」から「${newUnit || '(なし)'}」に変更されています。\n在庫の数値（例: 3個 → 3${newUnit}）の意味が変わってしまいますが、よろしいですか？`)) {
            return;
        }
    }

    const item = {
        id: id ? parseInt(id) : 0,
        classification: document.getElementById('input-classification').value,
        category: document.getElementById('input-category').value,
        name: name,
        kana: document.getElementById('input-kana').value,
        default_unit: newUnit,
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
            if (confirm(`${data.message}\n\n「OK」を押すとデータを統合します（元のデータは削除され、関連データは移動します）。`)) {
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
        if (typeof fetchCatalog === 'function') fetchCatalog(); // リスト更新
        alert('保存しました');
    })
    .catch(err => {
        if (err.message !== 'キャンセルしました') alert('エラー: ' + err.message);
    });
}

function saveCsvItem() {
    const text = document.getElementById('input-csv-text').value;
    const resultArea = document.getElementById('csv-result-area');
    
    if (!text) return alert('CSVを入力してください');

    fetch('/import/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text
    })
    .then(async res => {
        if (!res.ok) {
             const errorData = await res.json().catch(() => ({ error: `サーバーエラー: ${res.status}` }));
             throw new Error(errorData.error || `サーバーエラー: ${res.status}`);
        }
        return res.json();
    })
    .then(result => {
        resultArea.style.display = 'block';
        resultArea.innerHTML = `
            <h3>処理結果</h3>
            <p>登録成功: <strong>${result.added}</strong> 件</p>
            <p>重複スキップ: <strong>${result.skipped}</strong> 件</p>
        `;

        if (result.errors && result.errors.length > 0) {
            resultArea.innerHTML += `
                <div style="color: red; margin-top:10px; border: 1px solid red; padding: 5px; border-radius: 4px;">
                    <h4>エラー詳細:</h4>
                    <ul>${result.errors.map(e => `<li>${e}</li>`).join('')}</ul>
                </div>
            `;
        }

        if (typeof fetchCatalog === 'function') fetchCatalog();
        document.getElementById('input-csv-text').value = '';
    })
    .catch(err => alert('エラー: ' + err.message));
}