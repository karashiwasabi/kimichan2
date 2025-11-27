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
        return window.fetchFridgePhotos();
    })
    .then(() => {
        if (typeof renderInventory === 'function') {
             renderInventory(inventoryData);
        }
    });
};

window.setupPhotoUI = function() {
    const snapshotFile = document.getElementById('snapshot-file');
    const btnPhotoClose = document.getElementById('btn-photo-close');
    const photoViewOverlay = document.getElementById('modal-photo-view');

    if (snapshotFile) {
        snapshotFile.addEventListener('change', async () => {
            const file = snapshotFile.files[0];
            if (!file) return;

            // リサイズ処理 (最大800px, 品質0.7)
            try {
                const resizedBlob = await resizeImage(file, 800, 0.7);
                
                const formData = new FormData();
                formData.append('photo', resizedBlob, file.name);

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
                .catch(err => alert('アップロード失敗: ' + err));
            } catch(e) {
                console.error(e);
                alert('画像処理に失敗しました');
            }
        });
    }

    if(btnPhotoClose) {
        btnPhotoClose.addEventListener('click', () => photoViewOverlay.classList.remove('active'));
        photoViewOverlay.addEventListener('click', () => photoViewOverlay.classList.remove('active'));
    }
    
    // アイテム編集用などもリサイズ対応
    setupImageUpload('inv-file', 'inv-preview', 'inv-image-path');
    setupImageUpload('inv-edit-file', 'inv-edit-preview', 'inv-edit-image-path');
};

// 画像リサイズ関数
function resizeImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function setupImageUpload(inputId, previewId, pathInputId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const pathInput = document.getElementById(pathInputId);

    if(!input) return;

    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;

        try {
            // サムネイル用は小さめでOK
            const resizedBlob = await resizeImage(file, 600, 0.7);

            const formData = new FormData();
            formData.append('photo', resizedBlob, file.name);

            // プレビュー表示
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.classList.add('active');
            };
            reader.readAsDataURL(resizedBlob);

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
        } catch(e) {
            console.error(e);
        }
    });
}