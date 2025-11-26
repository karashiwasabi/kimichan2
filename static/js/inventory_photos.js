let fridgePhotos = [];
let uploadTargetLocation = 'その他';

window.fetchFridgePhotos = function() {
    return fetch('/api/fridge_photos')
        .then(res => res.json())
        .then(data => {
            fridgePhotos = data;
        })
        .catch(err => console.error(err));
};

window.renderLocationPhotos = function(locationName) {
    const photos = fridgePhotos.filter(p => {
        const pLoc = p.location || 'その他';
        return pLoc === locationName;
    });

    const container = document.createElement('div');
    container.className = 'fridge-snapshot-area';

    // 撮るボタン
    const addBtn = document.createElement('div');
    addBtn.className = 'btn-add-snapshot';
    addBtn.innerHTML = '<span style="font-size:20px;">📷</span><br>撮る';
    addBtn.onclick = () => {
        uploadTargetLocation = locationName;
        const fileInput = document.getElementById('snapshot-file');
        fileInput.value = ''; 
        fileInput.click();
    };
    container.appendChild(addBtn);

    // 写真リスト
    photos.forEach(photo => {
        const div = document.createElement('div');
        div.className = 'snapshot-card';
        
        const img = document.createElement('img');
        img.src = `/images/${photo.image_path}`;
        img.className = 'snapshot-img';
        img.onclick = () => openPhotoView(photo.image_path);
        
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete-snapshot';
        delBtn.textContent = '×';
        delBtn.onclick = (e) => deleteFridgePhoto(photo.id, e);

        div.appendChild(img);
        div.appendChild(delBtn);
        container.appendChild(div);
    });

    return container;
};

function openPhotoView(path) {
    const modal = document.getElementById('modal-photo-view');
    const img = document.getElementById('photo-view-img');
    img.src = `/images/${path}`;
    modal.classList.add('active');
}

window.deleteFridgePhoto = function(id, e) {
    e.stopPropagation();
    if (!confirm('この写真を削除しますか？')) return;
    fetch(`/api/fridge_photos?id=${id}`, { method: 'DELETE' })
    .then(() => {
        // 再取得と再描画は inventory.js 側で制御するため、イベント発行またはデータ更新のみ
        return window.fetchFridgePhotos();
    })
    .then(() => {
        if (typeof renderInventory === 'function') {
             // インベントリ全体を再描画して写真も更新
             renderInventory(inventoryData);
        }
    });
};

window.setupPhotoUI = function() {
    const snapshotFile = document.getElementById('snapshot-file');
    const btnPhotoClose = document.getElementById('btn-photo-close');
    const photoViewOverlay = document.getElementById('modal-photo-view');

    if (snapshotFile) {
        snapshotFile.addEventListener('change', () => {
            const file = snapshotFile.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('photo', file);
            fetch('/api/upload', { method: 'POST', body: formData })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    return fetch('/api/fridge_photos', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ 
                            image_path: data.filename,
                            location: uploadTargetLocation
                        })
                    });
                }
            })
            .then(() => window.fetchFridgePhotos())
            .then(() => {
                if (typeof renderInventory === 'function') {
                     renderInventory(inventoryData);
                }
            })
            .catch(err => alert('アップロード失敗'));
        });
    }

    if(btnPhotoClose) {
        btnPhotoClose.addEventListener('click', () => photoViewOverlay.classList.remove('active'));
        photoViewOverlay.addEventListener('click', () => photoViewOverlay.classList.remove('active'));
    }
    
    // 各モーダル内の画像アップロード設定 (ここは変更なし)
    setupImageUpload('inv-file', 'inv-preview', 'inv-image-path');
    setupImageUpload('inv-edit-file', 'inv-edit-preview', 'inv-edit-image-path');
};

function setupImageUpload(inputId, previewId, pathInputId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const pathInput = document.getElementById(pathInputId);

    if(!input) return;

    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('photo', file);

        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.classList.add('active');
        };
        reader.readAsDataURL(file);

        fetch('/api/upload', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                pathInput.value = data.filename;
            } else {
                alert('画像のアップロードに失敗しました');
            }
        })
        .catch(err => {
            console.error(err);
            alert('通信エラー');
        });
    });
}