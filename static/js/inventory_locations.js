let locations = []; 
// グローバルから呼べるようにwindowに登録
window.fetchLocations = function() {
    return fetch('/api/locations')
        .then(res => res.json())
        .then(data => {
            locations = data;
            // 読み込み完了時にプルダウンを更新
            renderLocationSelects(); 
        })
        .catch(err => console.error(err));
};

window.renderLocationSelects = function() {
    const selects = [document.getElementById('inv-location'), document.getElementById('inv-edit-location')]; 
    selects.forEach(sel => {
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '';
        locations.forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc.name;
            opt.textContent = loc.name;
            sel.appendChild(opt);
  
        }); 
        if (currentVal && locations.some(l => l.name === currentVal)) {
            sel.value = currentVal;
        } else if (locations.length > 0) {
            const other = locations.find(l => l.name === 'その他');
            sel.value = other ? other.name : locations[0].name;
        }
    });
};

window.setupLocationUI = function() {
    const btnManageLoc = document.getElementById('btn-manage-loc');
    const btnLocClose = document.getElementById('btn-loc-close');
    const btnAddLoc = document.getElementById('btn-add-loc'); 
    const locManageOverlay = document.getElementById('modal-loc-manage');

    if(btnManageLoc) {
        btnManageLoc.addEventListener('click', () => {
            renderLocationManageList(); 
            locManageOverlay.classList.add('active');
        });
    }
    if(btnLocClose) {
        btnLocClose.addEventListener('click', () => {
            locManageOverlay.classList.remove('active');
            renderLocationSelects(); 
            // 在庫リスト再描画（グローバル関数を呼ぶ）
            if(typeof fetchInventory === 'function') fetchInventory();
        });
    }
    if(btnAddLoc) {
        btnAddLoc.addEventListener('click', () => {
            const name = document.getElementById('new-loc-name').value;
            if(!name) return;
            fetch('/api/locations', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
        
                body: JSON.stringify({name: name}) 
            })
            .then(res => res.json())
            .then(() => {
                document.getElementById('new-loc-name').value = '';
                window.fetchLocations().then(renderLocationManageList); 
            });
    
        });
    }
};

function renderLocationManageList() {
    const ul = document.getElementById('loc-manage-list');
    ul.innerHTML = ''; 
    locations.forEach((loc, index) => {
        const li = document.createElement('li');
        li.className = 'location-manage-item';
        li.innerHTML = `
            <span>${loc.name}</span>
            <div class="loc-actions">
                ${index > 0 ? `<button onclick="moveLocation(${loc.id}, -1)">↑</button>` : ''}
                ${index 
< locations.length - 1 ? `<button onclick="moveLocation(${loc.id}, 1)">↓</button>` : ''} 
                <button onclick="deleteLocation(${loc.id})" style="color:red;">×</button>
            </div>
        `;
        ul.appendChild(li); 
    });
}

window.moveLocation = function(id, direction) {
    const idx = locations.findIndex(l => l.id === id); 
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= locations.length) return; 
    const temp = locations[idx];
    locations[idx] = locations[newIdx];
    locations[newIdx] = temp; 
    fetch('/api/locations', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(locations) 
    }).then(() => {
        window.fetchLocations().then(renderLocationManageList); 
    });
};

window.deleteLocation = function(id) {
    if(!confirm('削除しますか？')) return; 
    fetch(`/api/locations?id=${id}`, { method: 'DELETE' }) 
    .then(() => {
        window.fetchLocations().then(renderLocationManageList); 
    });
};