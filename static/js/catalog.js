let catalogData = [];
let currentCategory = 'すべて';

function initCatalog() {
    fetchCatalog();
    setupCatalogUI();
}

function fetchCatalog() {
    fetch('/api/catalog')
        .then(res => res.json())
        .then(data => {
            catalogData = data;
            renderCategoryButtons(catalogData);
            filterAndRender();
        })
        .catch(err => console.error('Fetch error:', err));
}

function renderCategoryButtons(items) {
    const container = document.getElementById('category-filters');
    if (!container) return;

    const categories = new Set(['すべて']);
    items.forEach(item => {
        if (item.category) categories.add(item.category);
        else if (item.classification === '調味料') categories.add('調味料');
        else categories.add('未分類');
    });

    container.innerHTML = '';
    categories.forEach(cat => {
        const displayCat = cat === '未分類' ? 'その他' : cat;
        const btn = document.createElement('div');
        btn.className = `cat-chip ${cat === currentCategory ? 'active' : ''}`;
        btn.textContent = displayCat;
        btn.onclick = () => {
            currentCategory = cat;
            document.querySelectorAll('.cat-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterAndRender();
        };
        container.appendChild(btn);
    });
}

function filterAndRender() {
    const term = document.getElementById('catalog-search').value.toLowerCase();
    const sortOrder = document.getElementById('sort-order').value;
    const filterNoKana = document.getElementById('filter-no-kana').checked;
    
    let displayData = [...catalogData];
    
    if (sortOrder === 'id_desc') {
        displayData.sort((a, b) => b.id - a.id);
    } else {
        displayData.sort((a, b) => {
            const ka = a.kana || a.name;
            const kb = b.kana || b.name;
            return ka.localeCompare(kb, 'ja');
        });
    }

    const filtered = displayData.filter(item => {
        let catMatch = true;
        if (currentCategory !== 'すべて') {
            const itemCat = item.category || (item.classification === '調味料' ? '調味料' : '未分類');
            catMatch = (itemCat === currentCategory);
        }

        let termMatch = true;
        if (term) {
            termMatch = 
                item.name.toLowerCase().includes(term) || 
                (item.kana && item.kana.toLowerCase().includes(term)) ||
                (item.category && item.category.toLowerCase().includes(term));
        }

        let noKanaMatch = true;
        if (filterNoKana) {
            noKanaMatch = !item.kana || item.kana.trim() === '';
        }

        return catMatch && termMatch && noKanaMatch;
    });

    renderCatalog(filtered);
}

function renderCatalog(items) {
    const listEl = document.getElementById('catalog-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    
    if (items.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">該当なし</div>';
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'card';
        div.onclick = () => openCatalogEditModal(item);
        
        const tagText = `${item.classification} / ${item.category || (item.classification === '調味料' ? 'スパイス等' : '未分類')}`;
        
        const kanaHtml = item.kana 
            ? `<span style="font-size:11px; color:#999; font-weight:normal; margin-left:5px;">(${item.kana})</span>` 
            : `<span style="font-size:10px; color:#e74c3c; background:#ffebee; padding:1px 4px; border-radius:4px; margin-left:5px;">未登録</span>`;

        div.innerHTML = `
            <div class="card-content">
                <span class="tag">${tagText}</span>
                <div class="item-name">
                    ${item.name}
                    ${kanaHtml}
                </div>
            </div>
            <div class="item-unit">${item.default_unit || ''}</div>
        `;
        listEl.appendChild(div);
    });
}

function openCatalogEditModal(item) {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const tabSingle = document.getElementById('tab-single');
    const tabCsv = document.getElementById('tab-csv');
    const singleContainer = document.getElementById('form-single');
    const csvContainer = document.getElementById('form-csv');
    
    tabSingle.classList.add('active');
    tabCsv.classList.remove('active');
    singleContainer.style.display = 'block';
    csvContainer.style.display = 'none';
    document.getElementById('csv-result-area').style.display = 'none';
    document.getElementById('reference-area').style.display = 'none'; 
    
    title.textContent = 'アイテム編集';

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

function updateCategorySelect(selectedCategory) {
    const select = document.getElementById('select-category');
    const input = document.getElementById('input-category');
    
    const categories = new Set();
    catalogData.forEach(d => {
        if(d.category) categories.add(d.category);
    });

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

function updateReferenceList(name) {
    const refArea = document.getElementById('reference-area');
    const refList = document.getElementById('reference-list');
    
    if (!name || name.length < 1) {
        refArea.style.display = 'none';
        return;
    }

    const term = name.toLowerCase();
    
    // 双方向の部分一致検索 (DBが入力を含む OR 入力がDBを含む)
    const hits = catalogData.filter(d => {
        const targetName = d.name.toLowerCase();
        const targetKana = d.kana ? d.kana.toLowerCase() : '';

        // DBの名前が、入力文字を含んでいる
        const dbContainsInput = targetName.includes(term) || (targetKana && targetKana.includes(term));
        
        // 入力文字が、DBの名前を含んでいる
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

    if(scrollLeft && scrollContainer) {
        scrollLeft.onclick = () => scrollContainer.scrollBy({ left: -100, behavior: 'smooth' });
        scrollRight.onclick = () => scrollContainer.scrollBy({ left: 100, behavior: 'smooth' });
    }

    if (!fab) return;

    fab.addEventListener('click', () => {
        document.getElementById('modal-title').textContent = 'アイテム登録';
        document.getElementById('edit-id').value = '';
        document.getElementById('original-unit').value = '';
        document.getElementById('original-name').value = '';
        document.getElementById('input-name').value = '';
        document.getElementById('input-kana').value = '';
        document.getElementById('input-unit').value = '';
        document.getElementById('input-csv-text').value = '';
        document.getElementById('reference-area').style.display = 'none';
        
        updateCategorySelect(currentCategory !== 'すべて' && currentCategory !== '未分類' ? currentCategory : '');

        document.getElementById('csv-result-area').style.display = 'none';
        
        tabCsv.classList.remove('active');
        tabSingle.classList.add('active');
        singleContainer.style.display = 'block';
        csvContainer.style.display = 'none';
        
        overlay.classList.add('active');
    });

    btnCancel.addEventListener('click', () => {
        overlay.classList.remove('active');
        removeConflictUI();
    });

    searchInput.addEventListener('input', filterAndRender);
    sortSelect.addEventListener('change', filterAndRender);
    noKanaCheck.addEventListener('change', filterAndRender);

    nameInput.addEventListener('input', (e) => {
        updateReferenceList(e.target.value);
    });

    tabSingle.addEventListener('click', () => {
        tabSingle.classList.add('active');
        tabCsv.classList.remove('active');
        singleContainer.style.display = 'block';
        csvContainer.style.display = 'none';
        removeConflictUI();
        document.getElementById('csv-result-area').style.display = 'none';
    });

    tabCsv.addEventListener('click', () => {
        tabCsv.classList.add('active');
        tabSingle.classList.remove('active');
        singleContainer.style.display = 'none';
        csvContainer.style.display = 'block';
        removeConflictUI();
    });

    btnSave.addEventListener('click', () => {
        if (singleContainer.style.display !== 'none') {
            saveSingleItem();
        } else {
            saveCsvItem();
        }
    });
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

async function saveSingleItem() {
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('input-name').value;
    const originalUnit = document.getElementById('original-unit').value;
    const originalName = document.getElementById('original-name').value;
    const newUnit = document.getElementById('input-unit').value;

    if (!name) return alert('名前を入力してください');

    // 名前が変更された場合、影響範囲（レシピ）を確認する
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
        fetchCatalog();
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
        headers: {
            'Content-Type': 'text/plain'
        },
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

        fetchCatalog();
        document.getElementById('input-csv-text').value = '';
    })
    .catch(err => alert('エラー: ' + err.message));
}