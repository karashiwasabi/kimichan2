let fridgePhotos = [];
let uploadTargetLocation = 'その他';

// 写真データの取得
window.fetchFridgePhotos = function() {
    return fetch('/api/fridge_photos')
        .then(res => res.json())
        .then(data => {
            fridgePhotos = data;
        })
        .catch(err => console.error(err));
};

// 場所ごとの写真エリア生成 (inventory_list.jsから呼ばれる)
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
        if (fileInput) {
            fileInput.value = ''; 
            fileInput.click();
        } else {
            console.error("snapshot-file element not found");
        }
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
    if (modal && img) {
        img.src = `/images/${path}`;
        modal.classList.add('active');
    }
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
             // データを再描画（inventory_list.jsの関数）
             // 引数がないとエラーになる場合があるので、現在のデータを渡すかリロード
             // ここでは簡易的に window.fetchInventory を呼ぶ
             if(window.fetchInventory) window.fetchInventory();
        }
    });
};

// UIセットアップ (app.js または initInventory から呼ばれる)
window.setupPhotoUI = function() {
    const snapshotFile = document.getElementById('snapshot-file');
    const btnPhotoClose = document.getElementById('btn-photo-close');
    const photoViewOverlay = document.getElementById('modal-photo-view');

    if (snapshotFile) {
        snapshotFile.addEventListener('change', async () => {
            const files = snapshotFile.files;
            if (!files || files.length === 0) return;

            // 複数枚対応（最大2枚まで処理）
            const filesToUpload = Array.from(files).slice(0, 2);

            for (const file of filesToUpload) {
                try {
                    // リサイズ (最大800px, 品質0.7)
                    const resizedBlob = await resizeImage(file, 800, 0.7);
                    
                    const formData = new FormData();
                    formData.append('photo', resizedBlob, file.name);

                    const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
                    const uploadData = await uploadRes.json();
                    
                    if (uploadData.status === 'success') {
                        await fetch('/api/fridge_photos', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ 
                                image_path: uploadData.filename,
                                location: uploadTargetLocation
                            })
                        });
                    }
                } catch(e) {
                    console.error("アップロード失敗", e);
                    alert(`写真 ${file.name} の処理に失敗しました。`);
                }
            }

            // 更新
            window.fetchFridgePhotos().then(() => {
                if(window.fetchInventory) window.fetchInventory();
            });
        });
    }

    if(btnPhotoClose) {
        btnPhotoClose.addEventListener('click', () => photoViewOverlay.classList.remove('active'));
    }
    if(photoViewOverlay) {
        photoViewOverlay.addEventListener('click', (e) => {
            if(e.target === photoViewOverlay) photoViewOverlay.classList.remove('active');
        });
    }
    
    // アイテム編集用などもセットアップ
    setupImageUpload('inv-file', 'inv-preview', 'inv-image-path');
    setupImageUpload('inv-edit-file', 'inv-edit-preview', 'inv-edit-image-path');
};

// 画像リサイズ関数 (共通で使用)
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
            const resizedBlob = await resizeImage(file, 600, 0.7);
            const formData = new FormData();
            formData.append('photo', resizedBlob, file.name);

            // プレビュー即時表示
            const reader = new FileReader();
            reader.onload = (e) => {
                if(preview) {
                    preview.src = e.target.result;
                    preview.style.display = 'block'; // activeクラスではなくdisplay制御の方が確実
                }
            };
            reader.readAsDataURL(resizedBlob);

            fetch('/api/upload', { method: 'POST', body: formData })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    if(pathInput) pathInput.value = data.filename;
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