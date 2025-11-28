// グローバル変数
let catalogData = [];

// ★修正: 固定カテゴリリストから「調味料」を削除
const FIXED_CATEGORIES = [
    "野菜", "肉", "肉加工品", "魚介", "缶詰", "卵・乳製品", 
    "大豆製品", "乾物・粉類", "麺類", "パン", "穀物", "その他"
];

function initCatalog() {
    fetchCatalog();
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
            setupCategoryFilter(); 
            filterAndRender();     
        })
        .catch(err => console.error('Fetch error:', err));
}

function setupCategoryFilter() {
    const select = document.getElementById('catalog-category-filter');
    const classSelect = document.getElementById('catalog-classification-filter'); // ★追加

    if (!select) return;

    select.innerHTML = '<option value="すべて">すべてのカテゴリ</option>';

    FIXED_CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    });
    
    // イベントリスナー
    select.addEventListener('change', () => {
        filterAndRender();
    });

    // ★追加: 分類フィルタのイベント
    if (classSelect) {
        classSelect.addEventListener('change', () => {
            // 分類で「調味料」を選んだら、カテゴリは意味をなさないのでリセットする等の挙動も可能だが
            // ここではシンプルにフィルタ実行のみ行う
            filterAndRender();
        });
    }
}

// フィルタリングとソートの実行
function filterAndRender() {
    const term = document.getElementById('catalog-search').value.toLowerCase();
    const sortOrder = document.getElementById('sort-order').value;
    const filterNoKana = document.getElementById('filter-no-kana').checked;
    
    // プルダウンの値を取得
    const selectedCategory = document.getElementById('catalog-category-filter').value;
    const selectedClassification = document.getElementById('catalog-classification-filter').value; // ★追加
    
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
        // ★追加: 分類フィルタ
        let classMatch = true;
        if (selectedClassification !== 'すべて') {
            classMatch = (item.classification === selectedClassification);
        }

        // カテゴリフィルタ
        let catMatch = true;
        if (selectedCategory !== 'すべて') {
            // アイテムのカテゴリが空なら「その他」
            const itemCat = item.category || 'その他';
            catMatch = (itemCat === selectedCategory);
        }

        // 検索語句
        let termMatch = true;
        if (term) {
            termMatch = 
                item.name.toLowerCase().includes(term) || 
                (item.kana && item.kana.toLowerCase().includes(term));
        }

        // よみがな未登録
        let noKanaMatch = true;
        if (filterNoKana) {
            noKanaMatch = !item.kana || item.kana.trim() === '';
        }

        return classMatch && catMatch && termMatch && noKanaMatch;
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
        div.onclick = () => {
            if (typeof openCatalogEditModal === 'function') {
                openCatalogEditModal(item);
            }
        };
        
        // 表示用タグ: 分類が調味料なら「調味料」のみ表示、食材なら「食材 / カテゴリ」
        let tagText = "";
        if (item.classification === '調味料') {
            tagText = "調味料";
        } else {
            tagText = `${item.classification} / ${item.category || '未分類'}`;
        }
        
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