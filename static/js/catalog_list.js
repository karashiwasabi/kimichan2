// グローバル変数
let catalogData = [];
let currentCategory = 'すべて';

// 初期化 (app.jsから呼ばれる)
function initCatalog() {
    fetchCatalog();
    // catalog_edit.js にあるセットアップ関数を呼ぶ
    if (typeof setupCatalogUI === 'function') {
        setupCatalogUI();
    }
}

// データ取得
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

// カテゴリフィルタボタンの描画
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

// フィルタリングとソートの実行
function filterAndRender() {
    const term = document.getElementById('catalog-search').value.toLowerCase();
    const sortOrder = document.getElementById('sort-order').value;
    const filterNoKana = document.getElementById('filter-no-kana').checked;
    
    let displayData = [...catalogData];
    
    // ソート処理
    if (sortOrder === 'id_desc') {
        displayData.sort((a, b) => b.id - a.id);
    } else {
        displayData.sort((a, b) => {
            const ka = a.kana || a.name;
            const kb = b.kana || b.name;
            return ka.localeCompare(kb, 'ja');
        });
    }

    // フィルタ処理
    const filtered = displayData.filter(item => {
        // カテゴリ
        let catMatch = true;
        if (currentCategory !== 'すべて') {
            const itemCat = item.category || (item.classification === '調味料' ? '調味料' : '未分類');
            catMatch = (itemCat === currentCategory);
        }

        // 検索語句
        let termMatch = true;
        if (term) {
            termMatch = 
                item.name.toLowerCase().includes(term) || 
                (item.kana && item.kana.toLowerCase().includes(term)) ||
                (item.category && item.category.toLowerCase().includes(term));
        }

        // よみがな未登録
        let noKanaMatch = true;
        if (filterNoKana) {
            noKanaMatch = !item.kana || item.kana.trim() === '';
        }

        return catMatch && termMatch && noKanaMatch;
    });

    renderCatalog(filtered);
}

// 一覧の描画
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
        // catalog_edit.js の関数を呼ぶ
        div.onclick = () => {
            if (typeof openCatalogEditModal === 'function') {
                openCatalogEditModal(item);
            }
        };
        
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