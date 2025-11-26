// --- 編集画面 ---

function openRecipeEditModal() {
    // 詳細画面を閉じる
    document.getElementById('modal-recipe-detail').classList.remove('active');
    
    // タイトル変更
    document.getElementById('modal-recipe-title').textContent = 'レシピ編集';
    
    // 既存データをフォームにセット
    document.getElementById('rec-id').value = currentRecipeDetail.id;
    document.getElementById('rec-name').value = currentRecipeDetail.name;
    document.getElementById('rec-yield').value = currentRecipeDetail.yield || '';
    document.getElementById('rec-url').value = currentRecipeDetail.url;
    document.getElementById('rec-process').value = currentRecipeDetail.process;

    // 材料リストをCSVテキストに変換してセット
    let csvText = "";
    if (currentIngredients && currentIngredients.length > 0) {
        csvText = currentIngredients.map(ing => {
            // 形式: 名前,分量,単位
            return `${ing.name},${ing.amount},${ing.unit}`;
        }).join('\n');
    }
    document.getElementById('rec-csv').value = csvText;

    // 登録モーダルを開く
    document.getElementById('modal-recipe').classList.add('active');
}

// --- UIイベント設定 ---

function setupRecipeUI() {
    const fab = document.getElementById('fab-add-recipe');
    const overlay = document.getElementById('modal-recipe');
    const detailOverlay = document.getElementById('modal-recipe-detail');
    const missingOverlay = document.getElementById('modal-missing-ing');

    const btnCancel = document.getElementById('btn-rec-cancel');
    const btnSave = document.getElementById('btn-rec-save');
    const btnDetailClose = document.getElementById('btn-detail-close');
    const btnDetailEdit = document.getElementById('btn-detail-edit');
    
    const btnMissingCancel = document.getElementById('btn-missing-cancel');
    const btnMissingRegister = document.getElementById('btn-missing-register');

    if (!fab) return;

    // 新規登録ボタン
    fab.addEventListener('click', () => {
        document.getElementById('modal-recipe-title').textContent = 'レシピ登録';
        document.getElementById('rec-id').value = ''; 
        document.getElementById('rec-name').value = '';
        document.getElementById('rec-yield').value = '';
        document.getElementById('rec-url').value = '';
        document.getElementById('rec-process').value = '';
        document.getElementById('rec-csv').value = '';
        overlay.classList.add('active');
    });
    
    // キャンセル・閉じる
    btnCancel.addEventListener('click', () => overlay.classList.remove('active'));
    btnDetailClose.addEventListener('click', () => detailOverlay.classList.remove('active'));
    
    // 編集ボタン
    btnDetailEdit.addEventListener('click', () => openRecipeEditModal());

    // 保存実行
    btnSave.addEventListener('click', () => saveRecipe());

    // 不足食材モーダル
    btnMissingCancel.addEventListener('click', () => missingOverlay.classList.remove('active'));
    btnMissingRegister.addEventListener('click', () => registerMissingItemsAndRetry());
}

// --- 保存処理 ---

function saveRecipe() {
    const id = document.getElementById('rec-id').value;
    const name = document.getElementById('rec-name').value;
    const yieldVal = document.getElementById('rec-yield').value;
    const url = document.getElementById('rec-url').value;
    const process = document.getElementById('rec-process').value;
    const csvData = document.getElementById('rec-csv').value;

    if (!name) return alert('レシピ名は必須です');
    if (!csvData) return alert('材料CSVを入力してください');

    const payload = {
        name: name,
        yield: yieldVal,
        url: url,
        process: process,
        csv_data: csvData
    };

    let method = 'POST';
    let endpoint = '/api/recipes';
    if (id) {
        method = 'PUT';
        endpoint = `/api/recipes?id=${id}`;
    }

    fetch(endpoint, {
        method: method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    })
    .then(async res => {
        const data = await res.json();
        
        // エラーハンドリング: 不足食材がある場合
        if (!res.ok && data.error_code === 'missing_ingredients') {
            showMissingIngredientsModal(data.items);
            throw new Error('missing_ingredients');
        }

        if (!res.ok) throw new Error(data.error || '登録エラー');
        return data;
    })
    .then(() => {
        alert(id ? 'レシピを更新しました！' : 'レシピを登録しました！');
        document.getElementById('modal-recipe').classList.remove('active');
        fetchRecipes();
    })
    .catch(err => {
        if (err.message !== 'missing_ingredients') {
            alert(err.message);
        }
    });
}

// --- 不足食材のクイック登録 ---

function showMissingIngredientsModal(items) {
    const overlay = document.getElementById('modal-missing-ing');
    const listArea = document.getElementById('missing-list-area');
    listArea.innerHTML = '';

    items.forEach((name, index) => {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.style.background = '#f9f9f9';
        div.style.padding = '10px';
        div.style.borderRadius = '8px';
        
        div.innerHTML = `
            <div style="font-weight:bold; margin-bottom:5px;">${name}</div>
            <div style="display:flex; gap:10px;">
                <select id="missing-class-${index}" class="input-field" style="padding:8px; font-size:12px;">
                    <option value="食材">食材</option>
                    <option value="調味料">調味料</option>
                </select>
                <input type="hidden" id="missing-name-${index}" value="${name}">
            </div>
        `;
        listArea.appendChild(div);
    });

    overlay.classList.add('active');
}

function registerMissingItemsAndRetry() {
    const listArea = document.getElementById('missing-list-area');
    const itemsToRegister = [];
    
    const divs = listArea.querySelectorAll('.form-group');
    divs.forEach((div, index) => {
        const name = document.getElementById(`missing-name-${index}`).value;
        const cls = document.getElementById(`missing-class-${index}`).value;
        
        itemsToRegister.push({
            name: name,
            classification: cls,
            category: cls === '調味料' ? '' : 'その他',
            default_unit: cls === '調味料' ? '' : '個'
        });
    });

    // カタログへの一括登録
    fetch('/api/catalog', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(itemsToRegister)
    })
    .then(res => {
        if (!res.ok) throw new Error('カタログ登録に失敗しました');
        return res.json();
    })
    .then(() => {
        // 成功したらモーダルを閉じて、レシピ保存を再試行
        document.getElementById('modal-missing-ing').classList.remove('active');
        saveRecipe(); 
    })
    .catch(err => alert(err.message));
}