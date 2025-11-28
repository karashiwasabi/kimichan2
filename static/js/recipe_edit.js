function openRecipeEditModal() {
    const detailModal = document.getElementById('modal-recipe-detail');
    if(detailModal) detailModal.classList.remove('active');
    
    document.getElementById('modal-recipe-title').textContent = 'レシピ編集';
    
    if (typeof currentRecipeDetail === 'undefined' || !currentRecipeDetail) return;

    document.getElementById('rec-id').value = currentRecipeDetail.id;
    document.getElementById('rec-name').value = currentRecipeDetail.name;
    document.getElementById('rec-yield').value = currentRecipeDetail.yield || '';
    document.getElementById('rec-url').value = currentRecipeDetail.url;
    
    document.getElementById('rec-process').value = currentRecipeDetail.process;
    document.getElementById('rec-original-process').value = currentRecipeDetail.original_process || '';

    let csvLines = [];
    let lastGroup = null;

    if (typeof currentIngredients !== 'undefined' && currentIngredients && currentIngredients.length > 0) {
        currentIngredients.forEach(ing => {
            if (ing.group_name && ing.group_name !== lastGroup) {
                csvLines.push(`=${ing.group_name}=`);
                lastGroup = ing.group_name;
            } else if (!ing.group_name && lastGroup !== null) {
                lastGroup = null;
            }
            
            const details = ing.details || '';
            const combinedAmount = ing.unit ? `${ing.amount}${ing.unit}` : ing.amount;
            
            csvLines.push(`${ing.name},${combinedAmount},${details}`);
        });
    }
    document.getElementById('rec-csv').value = csvLines.join('\n');
    
    document.getElementById('rec-original-ingredients').value = currentRecipeDetail.original_ingredients || '';

    document.getElementById('modal-recipe').classList.add('active');
}

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

    fab.addEventListener('click', () => {
        document.getElementById('modal-recipe-title').textContent = 'レシピ登録';
        document.getElementById('rec-id').value = ''; 
        document.getElementById('rec-name').value = '';
        document.getElementById('rec-yield').value = '';
        document.getElementById('rec-url').value = '';
        
        document.getElementById('rec-process').value = '';
        document.getElementById('rec-original-process').value = '';
        
        document.getElementById('rec-csv').value = '';
        document.getElementById('rec-original-ingredients').value = '';
        
        overlay.classList.add('active');
    });

    if(btnCancel) btnCancel.addEventListener('click', () => overlay.classList.remove('active'));
    if(btnDetailClose) btnDetailClose.addEventListener('click', () => detailOverlay.classList.remove('active'));
    if(btnDetailEdit) btnDetailEdit.addEventListener('click', () => openRecipeEditModal());

    if(btnSave) btnSave.addEventListener('click', () => saveRecipe());
    if(btnMissingCancel) btnMissingCancel.addEventListener('click', () => missingOverlay.classList.remove('active'));
    if(btnMissingRegister) btnMissingRegister.addEventListener('click', () => registerMissingItemsAndRetry());
}

function saveRecipe() {
    const id = document.getElementById('rec-id').value;
    const name = document.getElementById('rec-name').value;
    const yieldVal = document.getElementById('rec-yield').value;
    const url = document.getElementById('rec-url').value;
    
    const process = document.getElementById('rec-process').value;
    const origProcess = document.getElementById('rec-original-process').value;
    
    const csvData = document.getElementById('rec-csv').value;
    const origIng = document.getElementById('rec-original-ingredients').value;

    if (!name) return alert('レシピ名は必須です');
    if (!csvData) return alert('材料CSVを入力してください');

    const payload = {
        name: name,
        yield: yieldVal,
        url: url,
        process: process,
        original_process: origProcess,
        csv_data: csvData,
        original_ingredients: origIng
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
        if (typeof fetchRecipes === 'function') fetchRecipes();
    })
    .catch(err => {
        if (err.message !== 'missing_ingredients') {
            alert(err.message);
        }
    });
}

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
        document.getElementById('modal-missing-ing').classList.remove('active');
        saveRecipe(); 
    })
    .catch(err => alert(err.message));
}