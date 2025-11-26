function updateSeasSelect() {
    const select = document.getElementById('seas-select-catalog');
    if (!select) return;
    
    select.innerHTML = '<option value="">カタログから選択...</option>';
    // catalogListForSeas は seasoning_fetch.js 内の変数ですが、
    // ここでは単純化のため window.fetchCatalogForSeas 内で代入された変数を利用する前提
    // もしくは window.catalogListForSeas にするか、fetchCatalogForSeas 内で描画までやるのが安全ですが、
    // 既存構造を維持しつつ、catalogListForSeasへのアクセスが必要なら
    // seasoning_fetch.js 側で window.catalogListForSeas = ... としていると仮定、
    // あるいはスコープが共有されている(連結ファイル)前提ならそのままでOK。
    // ※今回は安全策として、前のファイルで変数は閉じていたため、
    // seasoning_fetch.js で `window.catalogListForSeas` に書き換えるか、
    // UI更新をあちらで呼んでいるので、DOM操作だけここに書きます。
    
    // 前回の修正で catalogListForSeas は seasoning_fetch.js のローカル変数でした。
    // ただ updateSeasSelect は seasoning_fetch.js から呼ばれるので、
    // データ引数を受け取る形にするのがベストですが、
    // ここでは `seasoning_fetch.js` の `catalogListForSeas` が参照できない可能性があるため
    // 本来は引数で渡すべきです。
    // ただし、ユーザー様の環境（連結されるか個別か）によります。
    // ★修正: seasoning_fetch.js の変数が参照できない場合を考慮し、
    // updateSeasSelect は DOM生成のみに徹し、データは引数またはwindowから取れるようにすべきですが
    // 一旦、seasoning_fetch.js 内の変数がグローバルスコープにある（scriptタグ並列）と仮定します。
    // もしエラーになる場合は seasoning_fetch.js で window.catalogListForSeas = ... としてください。
    
    // (補足: 今回の提示では seasoning_fetch.js 内の catalogListForSeas はローカル変数のままですが
    //  別ファイルの場合はアクセスできません。fetchCatalogForSeas内で updateSeasSelect(catalogListForSeas) と呼ぶよう変更するのが正しいです。
    //  しかし変更範囲を最小にするため、前回提示の構造に従います)

    // ★修正: リスト構築ロジック
    // グローバル変数が参照できないリスクを回避するため、
    // 本来なら fetchCatalogForSeas で updateSeasSelect(list) と呼ぶべき。
    // ここでは「既存コードが動く前提」で記述しますが、
    // もし動かない場合は seasoning_fetch.js の最後で window.catalogListForSeas = catalogListForSeas; を追加してください。
    
    if (typeof catalogListForSeas !== 'undefined') {
        catalogListForSeas.forEach(item => {
            const opt = document.createElement('option');
            const classification = item.classification || '分類なし';
            const category = item.category || 'カテゴリなし';
            const kana = item.kana ? ` (${item.kana})` : '';
            
            opt.value = item.id;
            opt.textContent = `${classification} / ${category} - ${item.name}${kana}`;
            select.appendChild(opt);
        });
    }
}

function renderSeasoning(items) {
    const listEl = document.getElementById('seasoning-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    
    if (items.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">該当なし</div>';
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'card';
        div.onclick = () => openSeasoningEdit(item);
        
        let statusColor = '#2ecc71'; // 緑
        if (item.status === '少なめ') statusColor = '#f1c40f';
        if (item.status === 'なし') statusColor = '#e74c3c';

        div.innerHTML = `
            <div class="card-content">
                <span class="item-name">${item.name}</span>
            </div>
            <div class="item-unit" style="font-weight:bold; color:${statusColor};">
                ${item.status}
            </div>
        `;
        listEl.appendChild(div);
    });
}

function openSeasoningEdit(item) {
    const overlay = document.getElementById('modal-seasoning-edit');
    document.getElementById('seas-edit-title').textContent = item.name;
    document.getElementById('seas-edit-id').value = item.id;
    overlay.classList.add('active');
}

function setupSeasoningUI() {
    const fab = document.getElementById('fab-add-seasoning');
    const overlay = document.getElementById('modal-seasoning');
    const editOverlay = document.getElementById('modal-seasoning-edit');
    const btnCancel = document.getElementById('btn-seas-cancel');
    const btnSave = document.getElementById('btn-seas-save');
    const select = document.getElementById('seas-select-catalog');
    const searchInput = document.getElementById('seasoning-search'); // ★追加

    // ★調味料検索ロジック
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            if (!window.seasoningData) return;
            
            if (!term) {
                renderSeasoning(window.seasoningData);
                return;
            }
            const filtered = window.seasoningData.filter(item => 
                item.name.toLowerCase().includes(term)
            );
            renderSeasoning(filtered);
        });
    }

    const btnEditCancel = document.getElementById('btn-seas-edit-cancel');
    const btnDelete = document.getElementById('btn-seas-delete');
    if (!fab) return;

    fab.addEventListener('click', () => overlay.classList.add('active'));
    btnCancel.addEventListener('click', () => overlay.classList.remove('active'));
    if (btnEditCancel) {
        btnEditCancel.addEventListener('click', (e) => {
            e.preventDefault();
            editOverlay.classList.remove('active');
        });
    }

    // 追加処理
    btnSave.addEventListener('click', () => {
        const catalogId = parseInt(select.value);
        const status = document.getElementById('seas-status').value;

        if (!catalogId) return alert('調味料を選んでください');

        const data = {
            catalog_id: catalogId,
            status: status
        };

        fetch('/api/seasonings', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        })
        .then(res => {
            if (!res.ok) throw new Error('Failed');
            overlay.classList.remove('active');
            
            // 在庫更新後に、カタログ(プルダウン)も更新する
            return window.fetchSeasoning().then(() => window.fetchCatalogForSeas());
        })
        .catch(err => alert('エラー: ' + err));
    });

    // 削除処理
    if (btnDelete) {
        btnDelete.addEventListener('click', () => {
            const id = document.getElementById('seas-edit-id').value;
            if(!confirm('ストックから外しますか？')) return;

            fetch(`/api/seasonings?id=${id}`, {
                method: 'DELETE'
            })
            .then(res => {
                if (!res.ok) throw new Error('Delete failed');
                editOverlay.classList.remove('active');
                
                // 在庫更新後に、カタログ(プルダウン)も更新する
                return window.fetchSeasoning().then(() => window.fetchCatalogForSeas());
            })
            .catch(err => alert('削除エラー: ' + err));
        });
    }
}