document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app-container');
    const navItems = document.querySelectorAll('.nav-item');

    function loadView(viewName) {
        navItems.forEach(nav => {
            if (nav.dataset.view === viewName) {
                nav.classList.add('active');
            } else {
                nav.classList.remove('active');
            }
        });

        fetch(`views/${viewName}_view.html`)
            .then(response => {
                if (!response.ok) throw new Error('View not found');
                return response.text();
            })
            .then(html => {
                appContainer.innerHTML = html;
                
                if (viewName === 'catalog' && typeof initCatalog === 'function') {
                    initCatalog();
                } else if (viewName === 'inventory' && typeof initInventory === 'function') {
                    initInventory();
                } else if (viewName === 'recipes' && typeof initRecipes === 'function') {
                    initRecipes();
                }
                // 調味料(seasoning)は削除
            })
            .catch(err => {
                appContainer.innerHTML = '<p style="text-align:center; margin-top:50px;">読み込みエラー</p>';
                console.error(err);
            });
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const viewName = item.dataset.view;
            loadView(viewName);
        });
    });

    loadView('inventory');
});