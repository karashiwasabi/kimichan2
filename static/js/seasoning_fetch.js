// グローバル変数として window に公開
window.seasoningData = [];
let catalogListForSeas = [];

function initSeasoning() {
    // 初回: 在庫取得 -> カタログ取得(フィルタリング) の順で実行
    window.fetchSeasoning().then(() => window.fetchCatalogForSeas());
    if (typeof setupSeasoningUI === 'function') {
        setupSeasoningUI();
    }
}

window.fetchSeasoning = function() {
    return fetch('/api/seasonings')
        .then(res => res.json())
        .then(data => {
            window.seasoningData = data; // windowに保存
            if (typeof renderSeasoning === 'function') {
                renderSeasoning(window.seasoningData);
            }
        })
        .catch(err => console.error(err));
};

// グローバルから呼べるようにwindowに登録
window.fetchCatalogForSeas = function() {
    return fetch('/api/catalog')
        .then(res => res.json())
        .then(data => {
            // 1. 在庫に含まれる catalog_id のセットを作成
            const inventoryCatalogIds = new Set(
                window.seasoningData.map(item => item.catalog_id)
            );
            
            // 2. 調味料であり、かつ在庫にないものをフィルタリング
            let filteredData = data.filter(item => {
                const isSeasoning = item.classification === '調味料';
                const isInInventory = inventoryCatalogIds.has(item.id);
                return isSeasoning && !isInInventory;
            });

            // 3. 分類 -> カテゴリ -> 名前/よみがな 順でソート
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
            
            catalogListForSeas = filteredData;
            
            // UI側のプルダウン更新関数を呼び出し
            if (typeof updateSeasSelect === 'function') {
                updateSeasSelect();
            }
        });
};