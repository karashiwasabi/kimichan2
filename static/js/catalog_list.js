// グローバル変数
let catalogData = [];
// ★変更: 固定カテゴリリストを定義 (マスタCSVと同じもの)
const FIXED_CATEGORIES = [
    "野菜", "肉", "肉加工品", "魚介", "缶詰", "卵・乳製品", 
    "大豆製品", "調味料", "乾物・粉類", "麺類", "パン", "穀物", "その他"
];

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
            setupCategoryFilter(); // フィルタ準備
            filterAndRender();     // 初期表示
        })
        .catch(err => console.error('Fetch error:', err));
}

// ★修正: プルダウンの選択肢を作る
function setupCategoryFilter() {
    const select = document.getElementById('catalog-category-filter');
    if (!select) return;

    // 一旦クリア
    select.innerHTML = '<option value="すべて">すべてのカテゴリ</option>';

    // 固定リストから選択肢を作成
    FIXED_CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    });
    
    // 未分類のものがある場合のために、データ内の独自カテゴリも追加するか？
    // 今回は「固定リスト」で運用するため、あえて追加しない（"その他"に含める）方針とします
    
    // イベントリスナー
    select.addEventListener('change', () => {
        filterAndRender();
    });
}

// フィルタリングとソートの実行
function filterAndRender() {
    const term = document.getElementById('catalog-search').value.toLowerCase();
    const sortOrder = document.getElementById('sort-order').value;
    const filterNoKana = document.getElementById('filter-no-kana').checked;
    // ★プルダウンの値を取得
    const selectedCategory = document.getElementById('catalog-category-filter').value;
    
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
        // ★カテゴリフィルタ
        let catMatch = true;
        if (selectedCategory !== 'すべて') {
            // アイテムのカテゴリが空なら「その他」、それ以外はそのまま比較
            const itemCat = item.category || (item.classification === '調味料' ? '調味料' : 'その他');
            // 固定リストに含まれないカテゴリは「その他」として扱うか、部分一致にするか
            // ここではシンプルに完全一致で判定
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
        div.onclick = () => {
            if (typeof openCatalogEditModal === 'function') {
                openCatalogEditModal(item);
            }
        };
        
        const tagText = `${item.classification} / ${item.category || '未分類'}`;
        
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