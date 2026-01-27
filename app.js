// ============================================
// SmartSpesa App - JavaScript
// ============================================

const DEFAULT_CATEGORIES = {
    dairy: { id: 'dairy', name: 'Latticini', emoji: '🥛', isDefault: true },
    fruit: { id: 'fruit', name: 'Frutta e Verdura', emoji: '🍎', isDefault: true },
    meat: { id: 'meat', name: 'Carne e Pesce', emoji: '🥩', isDefault: true },
    bakery: { id: 'bakery', name: 'Panetteria', emoji: '🥖', isDefault: true },
    drinks: { id: 'drinks', name: 'Bevande', emoji: '🥤', isDefault: true },
    frozen: { id: 'frozen', name: 'Surgelati', emoji: '🧊', isDefault: true },
    snacks: { id: 'snacks', name: 'Snack e Dolci', emoji: '🍪', isDefault: true },
    household: { id: 'household', name: 'Casa e Igiene', emoji: '🧴', isDefault: true },
    other: { id: 'other', name: 'Altro', emoji: '📦', isDefault: true }
};

const DEFAULT_SHOPS = {
    // Nessun supermercato di default - l'utente li crea
};

const SHOP_EMOJI_OPTIONS = [
    '🛒', '🏪', '🏬', '🛍️', '🏢', '🌿', '💰', '⭐',
    '🔵', '🟢', '🔴', '🟡', '🟠', '🟣', '⚫', '⚪'
];

const EMOJI_OPTIONS = [
    '🥛', '🧀', '🥚', '🍎', '🥬', '🍌', '🥕', '🍅',
    '🥩', '🍗', '🐟', '🥖', '🍞', '🥐', '🥤', '🧃',
    '☕', '🍺', '🧊', '🍦', '🍕', '🍪', '🍫', '🍿',
    '🧴', '🧹', '🧻', '💊', '🐱', '🐶', '👶', '🌿',
    '🥫', '🍝', '🌶️', '🧈', '🍯', '🥜', '🌰', '📦'
];

const DB_NAME = 'SmartSpesaDB';
const DB_VERSION = 3;

let db = null;
let shoppingList = [];
let productHistory = [];
let categories = {};
let shops = {};
let activeShopFilter = null; // null = tutti, altrimenti ID del supermercato
let currentTheme = 'dark';
let html5QrCode = null;
let scannerMode = 'main';

// ============================================
// IndexedDB
// ============================================

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { db = request.result; resolve(db); };
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains('shoppingList')) {
                database.createObjectStore('shoppingList', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('productHistory')) {
                database.createObjectStore('productHistory', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('categories')) {
                database.createObjectStore('categories', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('shops')) {
                database.createObjectStore('shops', { keyPath: 'id' });
            }
        };
    });
}

async function loadData() {
    const [list, history, cats, shopsData] = await Promise.all([
        getAllFromStore('shoppingList'),
        getAllFromStore('productHistory'),
        getAllFromStore('categories'),
        getAllFromStore('shops')
    ]);
    
    shoppingList = list || [];
    productHistory = (history || []).sort((a, b) => b.lastUsed - a.lastUsed);
    categories = { ...DEFAULT_CATEGORIES };
    (cats || []).forEach(cat => { categories[cat.id] = cat; });
    shops = { ...DEFAULT_SHOPS };
    (shopsData || []).forEach(shop => { shops[shop.id] = shop; });
}

function getAllFromStore(storeName) {
    return new Promise((resolve) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve([]);
    });
}

async function saveToStore(storeName, item) {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

async function deleteFromStore(storeName, id) {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

async function clearStore(storeName) {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

// ============================================
// Open Food Facts API
// ============================================

async function fetchProductByBarcode(barcode) {
    try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
        const data = await response.json();
        if (data.status === 1 && data.product) {
            const p = data.product;
            return {
                name: p.product_name || p.product_name_it || 'Prodotto sconosciuto',
                brand: p.brands || '',
                image: p.image_front_small_url || p.image_url || null,
                category: guessCategory(p),
                barcode: barcode
            };
        }
        return null;
    } catch (error) {
        console.error('API error:', error);
        return null;
    }
}

function guessCategory(product) {
    const cats = (product.categories || '').toLowerCase();
    if (cats.includes('lait') || cats.includes('milk') || cats.includes('latte') || cats.includes('fromage') || cats.includes('cheese') || cats.includes('yogurt')) return 'dairy';
    if (cats.includes('fruit') || cats.includes('vegetable') || cats.includes('frutta') || cats.includes('verdur')) return 'fruit';
    if (cats.includes('meat') || cats.includes('carne') || cats.includes('fish') || cats.includes('pesce')) return 'meat';
    if (cats.includes('bread') || cats.includes('pane') || cats.includes('bakery')) return 'bakery';
    if (cats.includes('beverage') || cats.includes('drink') || cats.includes('bevand') || cats.includes('water') || cats.includes('juice')) return 'drinks';
    if (cats.includes('frozen') || cats.includes('surgel')) return 'frozen';
    if (cats.includes('snack') || cats.includes('sweet') || cats.includes('chocolate') || cats.includes('biscuit')) return 'snacks';
    return 'other';
}

// ============================================
// Modal System
// ============================================

function showModal(options) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('modalOverlay');
        const icon = document.getElementById('modalIcon');
        const title = document.getElementById('modalTitle');
        const message = document.getElementById('modalMessage');
        const body = document.getElementById('modalBody');
        const input = document.getElementById('modalInput');
        const footer = document.getElementById('modalFooter');

        icon.textContent = options.icon || '❓';
        icon.className = 'modal-icon' + (options.danger ? ' danger' : '');
        title.textContent = options.title || '';
        message.textContent = options.message || '';

        if (options.input) {
            body.classList.remove('hidden');
            input.value = options.inputValue || '';
            input.placeholder = options.inputPlaceholder || '';
            setTimeout(() => input.focus(), 100);
        } else {
            body.classList.add('hidden');
        }

        footer.innerHTML = '';
        (options.buttons || []).forEach(btn => {
            const button = document.createElement('button');
            button.className = 'modal-btn ' + (btn.type || 'secondary');
            button.textContent = btn.text;
            button.onclick = () => {
                overlay.classList.remove('active');
                resolve(options.input && btn.type === 'primary' ? input.value : btn.value);
            };
            footer.appendChild(button);
        });

        overlay.classList.add('active');
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                resolve(null);
            }
        };
    });
}

async function showConfirm(title, message, icon = '❓', danger = false) {
    return showModal({
        icon, title, message, danger,
        buttons: [
            { text: 'Annulla', type: 'secondary', value: false },
            { text: 'Conferma', type: danger ? 'danger' : 'primary', value: true }
        ]
    });
}

async function showPrompt(title, message, placeholder = '', defaultValue = '', icon = '✏️') {
    return showModal({
        icon, title, message,
        input: true, inputPlaceholder: placeholder, inputValue: defaultValue,
        buttons: [
            { text: 'Annulla', type: 'secondary', value: null },
            { text: 'OK', type: 'primary', value: true }
        ]
    });
}

// ============================================
// UI Helpers
// ============================================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function hapticFeedback() {
    if (navigator.vibrate) navigator.vibrate(10);
}

// ============================================
// Theme Management
// ============================================

function initTheme() {
    const savedTheme = localStorage.getItem('smartspesa-theme');
    if (savedTheme) {
        currentTheme = savedTheme;
    } else {
        // Check system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            currentTheme = 'light';
        }
    }
    applyTheme();
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeUI();
    
    // Update meta theme-color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.setAttribute('content', currentTheme === 'light' ? '#f5f5f7' : '#0a0a0f');
    }
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('smartspesa-theme', currentTheme);
    applyTheme();
    hapticFeedback();
}

function updateThemeUI() {
    const toggle = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');
    const name = document.getElementById('themeName');
    const desc = document.getElementById('themeDesc');
    
    if (currentTheme === 'light') {
        toggle?.classList.add('active');
        if (icon) icon.textContent = '☀️';
        if (name) name.textContent = 'Tema Chiaro';
        if (desc) desc.textContent = 'Passa alla modalità scura';
    } else {
        toggle?.classList.remove('active');
        if (icon) icon.textContent = '🌙';
        if (name) name.textContent = 'Tema Scuro';
        if (desc) desc.textContent = 'Passa alla modalità chiara';
    }
}

function openSheet(id) {
    document.getElementById('sheetOverlay').classList.add('active');
    document.getElementById(id).classList.add('active');
}

function closeSheet(id) {
    document.getElementById('sheetOverlay').classList.remove('active');
    document.getElementById(id).classList.remove('active');
}

function closeAllSheets() {
    document.getElementById('sheetOverlay').classList.remove('active');
    document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active'));
}

// ============================================
// Rendering
// ============================================

function renderShoppingList() {
    const container = document.getElementById('mainContent');
    
    // Filtra per supermercato se attivo
    let filteredList = shoppingList;
    if (activeShopFilter) {
        filteredList = shoppingList.filter(p => p.shops && p.shops.includes(activeShopFilter));
    }
    
    // Render shop filter chips
    renderShopFilter();
    
    if (filteredList.length === 0) {
        const message = activeShopFilter 
            ? `Nessun prodotto per ${shops[activeShopFilter]?.name || 'questo supermercato'}`
            : 'Scansiona un codice a barre o aggiungi un prodotto manualmente';
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${activeShopFilter ? '🏪' : '🛒'}</div>
                <h2 class="empty-title">Lista vuota</h2>
                <p class="empty-text">${message}</p>
            </div>`;
        updateStats();
        return;
    }

    const grouped = {};
    filteredList.forEach(p => {
        const cat = p.category || 'other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });

    const order = Object.keys(categories);
    const sorted = Object.keys(grouped).sort((a, b) => order.indexOf(a) - order.indexOf(b));

    container.innerHTML = sorted.map(catKey => {
        const cat = categories[catKey] || categories.other;
        const products = grouped[catKey];
        return `
            <div class="category-group fade-in">
                <div class="category-header">
                    <div class="category-dot"></div>
                    <span class="category-name">${cat.name}</span>
                    <span class="category-count">${products.length}</span>
                </div>
                <div class="product-list">
                    ${products.map(p => renderProductItem(p, cat)).join('')}
                </div>
            </div>`;
    }).join('');

    attachProductListeners();
    updateStats();
}

function renderProductItem(product, category) {
    const checked = product.checked ? 'checked' : '';
    const shopBadges = (product.shops || [])
        .map(shopId => shops[shopId])
        .filter(s => s)
        .map(s => `<span class="shop-badge" title="${s.name}">${s.emoji}</span>`)
        .join('');
    
    return `
        <div class="product-item ${checked}" data-id="${product.id}">
            <div class="product-checkbox ${checked}" data-action="toggle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg>
            </div>
            <div class="product-image">
                ${product.image ? `<img src="${product.image}" alt="">` : category.emoji}
            </div>
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-meta">
                    <span class="product-brand">${product.brand || category.name}</span>
                    ${shopBadges ? `<span class="product-shops">${shopBadges}</span>` : ''}
                </div>
            </div>
            <div class="product-quantity">
                <button class="qty-btn" data-action="decrease">−</button>
                <span class="qty-value">${product.quantity}</span>
                <button class="qty-btn" data-action="increase">+</button>
            </div>
        </div>`;
}

function updateStats() {
    const total = shoppingList.reduce((s, p) => s + p.quantity, 0);
    const checked = shoppingList.filter(p => p.checked).reduce((s, p) => s + p.quantity, 0);
    document.getElementById('totalItems').textContent = total;
    document.getElementById('checkedItems').textContent = checked;
}

function renderShopFilter() {
    const container = document.getElementById('shopFilterContainer');
    if (!container) return;
    
    const shopList = Object.values(shops);
    
    if (shopList.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="shop-filter-chips">
            <button class="shop-chip ${!activeShopFilter ? 'active' : ''}" data-shop="">
                🛒 Tutti
            </button>
            ${shopList.map(shop => `
                <button class="shop-chip ${activeShopFilter === shop.id ? 'active' : ''}" data-shop="${shop.id}">
                    ${shop.emoji} ${shop.name}
                </button>
            `).join('')}
        </div>
    `;
    
    container.querySelectorAll('.shop-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            activeShopFilter = chip.dataset.shop || null;
            renderShoppingList();
            hapticFeedback();
        });
    });
}

function renderShopSelector(selectedShops = []) {
    const container = document.getElementById('shopSelector');
    if (!container) return;
    
    const shopList = Object.values(shops);
    
    if (shopList.length === 0) {
        container.innerHTML = `
            <p class="no-shops-hint">Nessun supermercato configurato. 
            <a href="#" id="addShopFromForm">Aggiungine uno</a></p>
        `;
        document.getElementById('addShopFromForm')?.addEventListener('click', (e) => {
            e.preventDefault();
            closeSheet('addSheet');
            openEditShop(null);
        });
        return;
    }
    
    container.innerHTML = shopList.map(shop => `
        <label class="shop-option ${selectedShops.includes(shop.id) ? 'selected' : ''}" data-shop="${shop.id}">
            <input type="checkbox" name="shops" value="${shop.id}" ${selectedShops.includes(shop.id) ? 'checked' : ''}>
            <span class="shop-emoji">${shop.emoji}</span>
            <span class="shop-name">${shop.name}</span>
        </label>
    `).join('');
    
    container.querySelectorAll('.shop-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                const checkbox = opt.querySelector('input');
                checkbox.checked = !checkbox.checked;
            }
            opt.classList.toggle('selected', opt.querySelector('input').checked);
            hapticFeedback();
        });
    });
}

function getSelectedShops() {
    const checkboxes = document.querySelectorAll('#shopSelector input[name="shops"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function renderShopManagement() {
    const container = document.getElementById('shopManageList');
    const shopList = Object.values(shops);
    
    if (shopList.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 30px 0;">
                <div class="empty-icon" style="width:60px;height:60px;font-size:28px;">🏪</div>
                <p class="empty-text">Nessun supermercato configurato</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = shopList.map(shop => `
        <div class="category-manage-item" data-shop-id="${shop.id}">
            <span class="cat-emoji">${shop.emoji}</span>
            <div class="cat-info">
                <div class="cat-name">${shop.name}</div>
                <div class="cat-id">${shop.id}</div>
            </div>
            <div class="cat-actions">
                <button class="cat-btn edit" data-action="edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button class="cat-btn delete" data-action="delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.closest('.category-manage-item').dataset.shopId;
            const action = btn.dataset.action;
            
            if (action === 'edit') {
                openEditShop(id);
            } else if (action === 'delete') {
                const shop = shops[id];
                const confirmed = await showConfirm('Elimina Supermercato', `Vuoi eliminare "${shop.name}"?`, '🗑️', true);
                if (confirmed) {
                    await deleteFromStore('shops', id);
                    delete shops[id];
                    // Rimuovi il supermercato dai prodotti
                    shoppingList.forEach(p => {
                        if (p.shops && p.shops.includes(id)) {
                            p.shops = p.shops.filter(s => s !== id);
                            saveToStore('shoppingList', p);
                        }
                    });
                    if (activeShopFilter === id) activeShopFilter = null;
                    renderShopManagement();
                    renderShoppingList();
                    showToast('Supermercato eliminato', 'success');
                }
            }
        });
    });
}

function openEditShop(id = null) {
    const isNew = !id;
    document.getElementById('editShopTitle').textContent = isNew ? 'Nuovo Supermercato' : 'Modifica Supermercato';
    document.getElementById('shopId').value = id || '';
    
    if (isNew) {
        document.getElementById('shopNameInput').value = '';
        document.getElementById('shopEmoji').value = '🛒';
        renderShopEmojiPicker('🛒');
    } else {
        const shop = shops[id];
        document.getElementById('shopNameInput').value = shop.name;
        document.getElementById('shopEmoji').value = shop.emoji;
        renderShopEmojiPicker(shop.emoji);
    }
    
    openSheet('editShopSheet');
}

function renderShopEmojiPicker(selected = '🛒') {
    const container = document.getElementById('shopEmojiGrid');
    container.innerHTML = SHOP_EMOJI_OPTIONS.map(e => `<button type="button" class="emoji-btn ${e === selected ? 'selected' : ''}" data-emoji="${e}">${e}</button>`).join('');
    
    container.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('shopEmoji').value = btn.dataset.emoji;
            hapticFeedback();
        });
    });
}

// ============================================
// Product Detail
// ============================================

async function openProductDetail(productId) {
    const product = shoppingList.find(p => p.id === productId);
    if (!product) return;
    
    const container = document.getElementById('productDetailContent');
    const cat = categories[product.category] || categories.other;
    
    // Show loading state if we need to fetch from API
    if (product.barcode) {
        container.innerHTML = `
            <div class="detail-loading">
                <div class="loading-spinner"></div>
                <p>Caricamento informazioni...</p>
            </div>
        `;
        openSheet('productDetailSheet');
        
        // Fetch full product data from API
        const fullData = await fetchFullProductData(product.barcode);
        renderProductDetail(product, cat, fullData);
    } else {
        // No barcode, show basic info
        renderProductDetail(product, cat, null);
        openSheet('productDetailSheet');
    }
}

async function fetchFullProductData(barcode) {
    try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
        const data = await response.json();
        if (data.status === 1 && data.product) {
            return data.product;
        }
        return null;
    } catch (error) {
        console.error('Error fetching full product data:', error);
        return null;
    }
}

function renderProductDetail(product, category, apiData) {
    const container = document.getElementById('productDetailContent');
    
    // Basic product header
    let html = `
        <div class="product-detail-header">
            <div class="product-detail-image">
                ${product.image ? `<img src="${product.image}" alt="${product.name}">` : `<span class="emoji">${category.emoji}</span>`}
            </div>
            <div class="product-detail-info">
                <div class="product-detail-name">${product.name}</div>
                <div class="product-detail-brand">${product.brand || category.name}</div>
                ${product.barcode ? `<div class="product-detail-barcode">📊 ${product.barcode}</div>` : ''}
            </div>
        </div>
    `;
    
    if (!apiData) {
        html += `<div class="no-data-message">ℹ️ Nessuna informazione aggiuntiva disponibile per questo prodotto</div>`;
        container.innerHTML = html;
        return;
    }
    
    // Nutri-Score & NOVA
    html += renderNutriSection(apiData);
    
    // Nutritional Info
    html += renderNutritionSection(apiData);
    
    // Allergens & Diet
    html += renderAllergensSection(apiData);
    
    // Package Info
    html += renderPackageSection(apiData);
    
    container.innerHTML = html;
}

function renderNutriSection(apiData) {
    const nutriScore = apiData.nutriscore_grade || apiData.nutrition_grades;
    const novaGroup = apiData.nova_group;
    
    if (!nutriScore && !novaGroup) return '';
    
    const nutriScoreLabels = {
        'a': 'Eccellente qualità nutrizionale',
        'b': 'Buona qualità nutrizionale',
        'c': 'Qualità nutrizionale media',
        'd': 'Scarsa qualità nutrizionale',
        'e': 'Cattiva qualità nutrizionale'
    };
    
    const novaLabels = {
        1: { title: 'Alimenti non trasformati', desc: 'Alimenti freschi o minimamente trasformati' },
        2: { title: 'Ingredienti culinari', desc: 'Sale, zucchero, olio, burro...' },
        3: { title: 'Alimenti trasformati', desc: 'Verdure in scatola, formaggi, pane fresco...' },
        4: { title: 'Ultra-trasformati', desc: 'Snack, bibite, piatti pronti industriali...' }
    };
    
    let html = `<div class="detail-section">
        <div class="detail-section-title"><span>📊</span> Qualità Nutrizionale</div>`;
    
    if (nutriScore) {
        html += `
            <div class="nutri-score-container">
                <div class="nutri-score ${nutriScore.toLowerCase()}">${nutriScore.toUpperCase()}</div>
                <div class="nutri-score-label">
                    <strong>Nutri-Score</strong>
                    ${nutriScoreLabels[nutriScore.toLowerCase()] || 'Non disponibile'}
                </div>
            </div>
        `;
    }
    
    if (novaGroup && novaLabels[novaGroup]) {
        html += `
            <div class="nova-group">
                <div class="nova-badge nova-${novaGroup}">${novaGroup}</div>
                <div class="nova-info">
                    <div class="nova-title">${novaLabels[novaGroup].title}</div>
                    <div class="nova-desc">${novaLabels[novaGroup].desc}</div>
                </div>
            </div>
        `;
    }
    
    html += `</div>`;
    return html;
}

function renderNutritionSection(apiData) {
    const n = apiData.nutriments || {};
    
    const nutritionData = [
        { label: 'Energia', value: n['energy-kcal_100g'], unit: 'kcal' },
        { label: 'Grassi', value: n.fat_100g, unit: 'g' },
        { label: 'Grassi Saturi', value: n['saturated-fat_100g'], unit: 'g' },
        { label: 'Carboidrati', value: n.carbohydrates_100g, unit: 'g' },
        { label: 'Zuccheri', value: n.sugars_100g, unit: 'g' },
        { label: 'Fibre', value: n.fiber_100g, unit: 'g' },
        { label: 'Proteine', value: n.proteins_100g, unit: 'g' },
        { label: 'Sale', value: n.salt_100g, unit: 'g' }
    ].filter(item => item.value !== undefined && item.value !== null);
    
    if (nutritionData.length === 0) return '';
    
    let html = `
        <div class="detail-section">
            <div class="detail-section-title"><span>🍽️</span> Valori Nutrizionali (per 100g)</div>
            <div class="nutrition-grid">
    `;
    
    nutritionData.forEach(item => {
        const displayValue = typeof item.value === 'number' ? item.value.toFixed(1) : item.value;
        html += `
            <div class="nutrition-item">
                <div class="nutrition-label">${item.label}</div>
                <div class="nutrition-value">${displayValue}<span class="nutrition-unit"> ${item.unit}</span></div>
            </div>
        `;
    });
    
    html += `</div></div>`;
    return html;
}

function renderAllergensSection(apiData) {
    const allergens = apiData.allergens_tags || [];
    const traces = apiData.traces_tags || [];
    const ingredientsAnalysis = apiData.ingredients_analysis_tags || [];
    
    if (allergens.length === 0 && traces.length === 0 && ingredientsAnalysis.length === 0) return '';
    
    // Clean allergen names
    const cleanAllergen = (tag) => {
        return tag.replace('en:', '').replace('it:', '').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
    };
    
    // Diet analysis
    const dietLabels = {
        'en:vegan': { label: 'Vegano', positive: true },
        'en:vegetarian': { label: 'Vegetariano', positive: true },
        'en:non-vegan': { label: 'Non Vegano', positive: false },
        'en:non-vegetarian': { label: 'Non Vegetariano', positive: false },
        'en:maybe-vegan': { label: 'Forse Vegano', warning: true },
        'en:maybe-vegetarian': { label: 'Forse Vegetariano', warning: true },
        'en:palm-oil-free': { label: 'Senza Olio di Palma', positive: true },
        'en:palm-oil': { label: 'Contiene Olio di Palma', positive: false }
    };
    
    let html = `<div class="detail-section">
        <div class="detail-section-title"><span>⚠️</span> Allergeni e Dieta</div>
        <div class="allergen-list">`;
    
    // Allergens
    allergens.forEach(a => {
        html += `<span class="allergen-tag">⚠️ ${cleanAllergen(a)}</span>`;
    });
    
    // Traces
    traces.forEach(t => {
        html += `<span class="allergen-tag" style="opacity: 0.7;">Tracce: ${cleanAllergen(t)}</span>`;
    });
    
    // Diet tags
    ingredientsAnalysis.forEach(tag => {
        if (dietLabels[tag]) {
            const d = dietLabels[tag];
            const className = d.positive ? 'diet-tag' : (d.warning ? 'diet-tag warning' : 'diet-tag negative');
            html += `<span class="${className}">${d.label}</span>`;
        }
    });
    
    html += `</div></div>`;
    return html;
}

function renderPackageSection(apiData) {
    const quantity = apiData.quantity;
    const servingSize = apiData.serving_size;
    const packaging = apiData.packaging;
    const origins = apiData.origins;
    
    if (!quantity && !servingSize && !packaging && !origins) return '';
    
    let html = `
        <div class="detail-section">
            <div class="detail-section-title"><span>📦</span> Confezione</div>
            <div class="package-info">
    `;
    
    if (quantity) {
        html += `
            <div class="package-item">
                <span class="package-label">Quantità</span>
                <span class="package-value">${quantity}</span>
            </div>
        `;
    }
    
    if (servingSize) {
        html += `
            <div class="package-item">
                <span class="package-label">Porzione consigliata</span>
                <span class="package-value">${servingSize}</span>
            </div>
        `;
    }
    
    if (packaging) {
        const cleanPackaging = packaging.split(',').slice(0, 3).join(', ');
        html += `
            <div class="package-item">
                <span class="package-label">Imballaggio</span>
                <span class="package-value">${cleanPackaging}</span>
            </div>
        `;
    }
    
    if (origins) {
        html += `
            <div class="package-item">
                <span class="package-label">Origine</span>
                <span class="package-value">${origins}</span>
            </div>
        `;
    }
    
    html += `</div></div>`;
    return html;
}

function renderCategorySelector(selected = 'dairy') {
    const container = document.getElementById('categorySelector');
    container.innerHTML = Object.entries(categories).map(([id, cat]) => `
        <div class="category-option ${id === selected ? 'selected' : ''}" data-category="${id}">
            <span class="cat-emoji">${cat.emoji}</span>
            <span class="cat-name">${cat.name}</span>
        </div>
    `).join('');

    container.querySelectorAll('.category-option').forEach(opt => {
        opt.addEventListener('click', () => {
            container.querySelectorAll('.category-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            hapticFeedback();
        });
    });
}

function renderHistoryChips() {
    const container = document.getElementById('historyList');
    const section = document.getElementById('historySection');
    
    if (productHistory.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    section.classList.remove('hidden');
    container.innerHTML = productHistory.slice(0, 8).map(item => {
        const cat = categories[item.category] || categories.other;
        return `<div class="history-chip" data-history-id="${item.id}"><span>${cat.emoji}</span>${item.name}</div>`;
    }).join('');

    container.querySelectorAll('.history-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const item = productHistory.find(h => h.id === chip.dataset.historyId);
            if (item) addProductFromHistory(item);
        });
    });
}

function renderFullHistory() {
    const container = document.getElementById('fullHistoryList');
    
    if (productHistory.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding:40px 0;"><div class="empty-icon" style="width:60px;height:60px;font-size:28px;">📋</div><p class="empty-text">Nessun prodotto nello storico</p></div>`;
        return;
    }

    container.innerHTML = `<div class="product-list">${productHistory.map(item => {
        const cat = categories[item.category] || categories.other;
        return `
            <div class="product-item" data-history-id="${item.id}" style="cursor:pointer;">
                <div class="product-image">${item.image ? `<img src="${item.image}" alt="">` : cat.emoji}</div>
                <div class="product-info">
                    <div class="product-name">${item.name}</div>
                    <div class="product-brand">${item.brand || cat.name}</div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" style="color:var(--text-muted);"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>`;
    }).join('')}</div>`;

    container.querySelectorAll('.product-item').forEach(el => {
        el.addEventListener('click', () => {
            const item = productHistory.find(h => h.id === el.dataset.historyId);
            if (item) {
                addProductFromHistory(item);
                closeSheet('historySheet');
                showToast('Prodotto aggiunto!', 'success');
            }
        });
    });
}

function renderCategoryManagement() {
    const container = document.getElementById('categoryManageList');
    container.innerHTML = Object.entries(categories).map(([id, cat]) => `
        <div class="category-manage-item ${cat.isDefault ? 'default' : ''}" data-category-id="${id}">
            <span class="cat-emoji">${cat.emoji}</span>
            <div class="cat-info">
                <div class="cat-name">${cat.name}</div>
                <div class="cat-id">${id}${cat.isDefault ? ' (default)' : ''}</div>
            </div>
            <div class="cat-actions">
                <button class="cat-btn edit" data-action="edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button class="cat-btn delete" data-action="delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.closest('.category-manage-item').dataset.categoryId;
            const action = btn.dataset.action;
            
            if (action === 'edit') {
                openEditCategory(id);
            } else if (action === 'delete') {
                const cat = categories[id];
                const confirmed = await showConfirm('Elimina Categoria', `Vuoi eliminare "${cat.name}"?`, '🗑️', true);
                if (confirmed) {
                    await deleteFromStore('categories', id);
                    delete categories[id];
                    shoppingList.filter(p => p.category === id).forEach(p => {
                        p.category = 'other';
                        saveToStore('shoppingList', p);
                    });
                    renderCategoryManagement();
                    renderShoppingList();
                    showToast('Categoria eliminata', 'success');
                }
            }
        });
    });
}

function renderEmojiPicker(selected = '📦') {
    const container = document.getElementById('emojiGrid');
    container.innerHTML = EMOJI_OPTIONS.map(e => `<button type="button" class="emoji-btn ${e === selected ? 'selected' : ''}" data-emoji="${e}">${e}</button>`).join('');
    
    container.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('categoryEmoji').value = btn.dataset.emoji;
            hapticFeedback();
        });
    });
}

// ============================================
// Product Actions
// ============================================

function attachProductListeners() {
    document.querySelectorAll('.product-item[data-id]').forEach(item => {
        const id = item.dataset.id;

        // Click sul prodotto per aprire dettaglio
        item.addEventListener('click', (e) => {
            // Non aprire se si è cliccato su checkbox o quantità
            if (e.target.closest('[data-action]') || e.target.closest('.qty-btn')) return;
            openProductDetail(id);
        });

        item.querySelector('[data-action="toggle"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleProduct(id);
            hapticFeedback();
        });

        item.querySelector('[data-action="decrease"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            updateQuantity(id, -1);
            hapticFeedback();
        });

        item.querySelector('[data-action="increase"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            updateQuantity(id, 1);
            hapticFeedback();
        });

        // Swipe to delete
        let startX = 0, currentX = 0, isSwiping = false;
        
        item.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isSwiping = true;
            item.classList.add('swiping');
        });

        item.addEventListener('touchmove', (e) => {
            if (!isSwiping) return;
            currentX = e.touches[0].clientX;
            const diff = startX - currentX;
            if (diff > 0) item.style.transform = `translateX(${-Math.min(diff, 100)}px)`;
        });

        item.addEventListener('touchend', () => {
            const diff = startX - currentX;
            item.classList.remove('swiping');
            if (diff > 80) {
                item.classList.add('removing');
                setTimeout(() => removeProduct(id), 300);
            } else {
                item.style.transform = '';
            }
            isSwiping = false;
        });
    });
}

async function toggleProduct(id) {
    const product = shoppingList.find(p => p.id === id);
    if (product) {
        product.checked = !product.checked;
        await saveToStore('shoppingList', product);
        renderShoppingList();
    }
}

async function updateQuantity(id, delta) {
    const product = shoppingList.find(p => p.id === id);
    if (product) {
        product.quantity = Math.max(1, product.quantity + delta);
        await saveToStore('shoppingList', product);
        renderShoppingList();
    }
}

async function removeProduct(id) {
    await deleteFromStore('shoppingList', id);
    shoppingList = shoppingList.filter(p => p.id !== id);
    renderShoppingList();
    showToast('Prodotto rimosso', 'success');
}

async function addProductFromHistory(historyItem) {
    const existing = shoppingList.find(p => 
        p.name.toLowerCase() === historyItem.name.toLowerCase() ||
        (p.barcode && p.barcode === historyItem.barcode)
    );

    if (existing) {
        existing.quantity += 1;
        await saveToStore('shoppingList', existing);
    } else {
        const newProduct = {
            id: Date.now().toString(),
            name: historyItem.name,
            brand: historyItem.brand,
            category: historyItem.category,
            image: historyItem.image,
            barcode: historyItem.barcode,
            quantity: 1,
            checked: false,
            createdAt: Date.now()
        };
        shoppingList.push(newProduct);
        await saveToStore('shoppingList', newProduct);
    }

    // Update history
    historyItem.lastUsed = Date.now();
    await saveToStore('productHistory', historyItem);
    const idx = productHistory.findIndex(h => h.id === historyItem.id);
    if (idx >= 0) productHistory.splice(idx, 1);
    productHistory.unshift(historyItem);

    renderShoppingList();
}

// ============================================
// Scanner
// ============================================

async function addProductByBarcode(barcode) {
    showToast('Cerco prodotto...', 'success');
    const productInfo = await fetchProductByBarcode(barcode);
    
    // Cerca nello storico per recuperare i supermercati
    const historyItem = productHistory.find(h => h.barcode === barcode);
    const shopsFromHistory = historyItem?.shops || [];
    
    if (productInfo) {
        // Prodotto trovato - aggiungilo direttamente
        const existing = shoppingList.find(p => p.barcode === barcode);
        
        if (existing) {
            existing.quantity += 1;
            await saveToStore('shoppingList', existing);
            showToast(`${existing.name} - quantità aggiornata!`, 'success');
        } else {
            const product = {
                id: Date.now().toString(),
                name: productInfo.name,
                brand: productInfo.brand,
                category: productInfo.category,
                barcode: productInfo.barcode,
                image: productInfo.image,
                shops: shopsFromHistory,
                quantity: 1,
                checked: false,
                createdAt: Date.now()
            };
            shoppingList.push(product);
            await saveToStore('shoppingList', product);
            
            // Save to history
            const newHistoryItem = {
                id: barcode,
                name: product.name,
                brand: product.brand,
                category: product.category,
                image: product.image,
                barcode: barcode,
                shops: shopsFromHistory,
                lastUsed: Date.now()
            };
            await saveToStore('productHistory', newHistoryItem);
            const idx = productHistory.findIndex(h => h.id === newHistoryItem.id);
            if (idx >= 0) productHistory.splice(idx, 1);
            productHistory.unshift(newHistoryItem);
            
            showToast(`${product.name} aggiunto!`, 'success');
        }
        
        renderShoppingList();
        hapticFeedback();
    } else {
        // Prodotto non trovato - apri form per inserimento manuale
        openAddSheet();
        document.getElementById('productBarcode').value = barcode;
        document.getElementById('addSheetTitle').textContent = 'Prodotto non trovato';
        // Pre-seleziona i supermercati dallo storico
        if (shopsFromHistory.length > 0) {
            renderShopSelector(shopsFromHistory);
        }
        showToast('Prodotto non nel database. Aggiungilo manualmente.', 'error');
    }
}

async function startScanner() {
    if (html5QrCode) {
        try { await html5QrCode.stop(); } catch (e) {}
    }

    html5QrCode = new Html5Qrcode('scanner-reader');

    try {
        await html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 100 }, aspectRatio: 1 },
            onScanSuccess,
            () => {}
        );
    } catch (err) {
        console.error('Scanner error:', err);
        showToast('Errore fotocamera. Controlla i permessi.', 'error');
    }
}

async function stopScanner() {
    if (html5QrCode) {
        try { await html5QrCode.stop(); } catch (e) {}
        html5QrCode = null;
    }
}

async function onScanSuccess(decodedText) {
    hapticFeedback();
    await stopScanner();
    closeSheet('scannerSheet');

    if (scannerMode === 'form') {
        // Modalità form: compila solo i campi
        document.getElementById('productBarcode').value = decodedText;
        showToast('Codice inserito: ' + decodedText, 'success');
        
        const productInfo = await fetchProductByBarcode(decodedText);
        if (productInfo) {
            document.getElementById('productName').value = productInfo.name;
            document.getElementById('productBrand').value = productInfo.brand || '';
            document.getElementById('productImage').value = productInfo.image || '';
            renderCategorySelector(productInfo.category);
            showToast('Dati prodotto compilati!', 'success');
        }
        scannerMode = 'main';
        return;
    }

    // Modalità principale: aggiungi direttamente
    await addProductByBarcode(decodedText);
}

function showProductFound(productInfo) {
    openAddSheet();
    document.getElementById('addSheetTitle').textContent = 'Prodotto Trovato!';

    const container = document.getElementById('productFoundContainer');
    container.classList.remove('hidden');
    const cat = categories[productInfo.category] || categories.other;
    container.innerHTML = `
        <div class="product-found">
            <div class="product-found-header">
                <div class="product-found-image">
                    ${productInfo.image ? `<img src="${productInfo.image}" alt="">` : `<span>${cat.emoji}</span>`}
                </div>
                <div class="product-found-info">
                    <div class="product-found-name">${productInfo.name}</div>
                    <div class="product-found-brand">${productInfo.brand || 'Marca sconosciuta'}</div>
                    <div class="product-found-barcode">${productInfo.barcode}</div>
                </div>
            </div>
        </div>`;

    document.getElementById('productName').value = productInfo.name;
    document.getElementById('productBrand').value = productInfo.brand || '';
    document.getElementById('productBarcode').value = productInfo.barcode;
    document.getElementById('productImage').value = productInfo.image || '';
    renderCategorySelector(productInfo.category);
}

// ============================================
// Category Management
// ============================================

function openEditCategory(id = null) {
    const isNew = !id;
    document.getElementById('editCategoryTitle').textContent = isNew ? 'Nuova Categoria' : 'Modifica Categoria';
    document.getElementById('categoryId').value = id || '';
    
    if (isNew) {
        document.getElementById('categoryNameInput').value = '';
        document.getElementById('categoryEmoji').value = '📦';
        renderEmojiPicker('📦');
    } else {
        const cat = categories[id];
        document.getElementById('categoryNameInput').value = cat.name;
        document.getElementById('categoryEmoji').value = cat.emoji;
        renderEmojiPicker(cat.emoji);
    }
    
    openSheet('editCategorySheet');
}

// ============================================
// Data Export/Import
// ============================================

function exportData() {
    const data = {
        version: 3,
        exportDate: new Date().toISOString(),
        shoppingList,
        productHistory,
        categories: Object.values(categories).filter(c => !c.isDefault),
        shops: Object.values(shops)
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartspesa-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Dati esportati!', 'success');
}

async function importData(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.shoppingList || !Array.isArray(data.shoppingList)) {
            throw new Error('Formato file non valido');
        }

        await clearStore('shoppingList');
        for (const product of data.shoppingList) {
            await saveToStore('shoppingList', product);
        }

        if (data.productHistory) {
            for (const item of data.productHistory) {
                await saveToStore('productHistory', item);
            }
        }

        if (data.categories) {
            for (const cat of data.categories) {
                await saveToStore('categories', cat);
            }
        }

        if (data.shops) {
            for (const shop of data.shops) {
                await saveToStore('shops', shop);
            }
        }

        await loadData();
        renderShoppingList();
        closeAllSheets();
        showToast('Dati importati con successo!', 'success');
    } catch (error) {
        console.error('Import error:', error);
        showToast('Errore importazione: ' + error.message, 'error');
    }
}

// ============================================
// Sheet Helpers
// ============================================

function openAddSheet() {
    document.getElementById('addProductForm').reset();
    document.getElementById('productFoundContainer').classList.add('hidden');
    document.getElementById('productFoundContainer').innerHTML = '';
    document.getElementById('addSheetTitle').textContent = 'Aggiungi Prodotto';
    document.getElementById('productImage').value = '';
    renderCategorySelector('dairy');
    renderShopSelector([]);
    renderHistoryChips();
    openSheet('addSheet');
}

// ============================================
// Event Listeners
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Init theme first (before any rendering)
    initTheme();
    
    try {
        await initDB();
        await loadData();
        renderShoppingList();

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js');
        }
    } catch (error) {
        console.error('Init error:', error);
        showToast('Errore inizializzazione', 'error');
    }
});

// Main buttons
document.getElementById('btnScan').addEventListener('click', () => {
    scannerMode = 'main';
    openSheet('scannerSheet');
    startScanner();
});

document.getElementById('btnAdd').addEventListener('click', openAddSheet);
document.getElementById('btnSettings').addEventListener('click', () => openSheet('settingsSheet'));
document.getElementById('btnHistory').addEventListener('click', () => {
    renderFullHistory();
    openSheet('historySheet');
});

// Close buttons
document.getElementById('closeScannerSheet').addEventListener('click', () => { stopScanner(); closeSheet('scannerSheet'); });
document.getElementById('closeAddSheet').addEventListener('click', () => closeSheet('addSheet'));
document.getElementById('closeSettingsSheet').addEventListener('click', () => closeSheet('settingsSheet'));
document.getElementById('closeHistorySheet').addEventListener('click', () => closeSheet('historySheet'));
document.getElementById('closeCategoriesSheet').addEventListener('click', () => closeSheet('categoriesSheet'));
document.getElementById('closeEditCategorySheet').addEventListener('click', () => closeSheet('editCategorySheet'));
document.getElementById('closeProductDetailSheet').addEventListener('click', () => closeSheet('productDetailSheet'));

document.getElementById('sheetOverlay').addEventListener('click', () => { stopScanner(); closeAllSheets(); });

// Scanner actions
document.getElementById('btnManualBarcode').addEventListener('click', async () => {
    await stopScanner();
    closeSheet('scannerSheet');
    const barcode = await showPrompt('Inserisci Barcode', 'Digita il codice a barre del prodotto', 'es. 8001234567890', '', '📷');
    if (barcode && barcode.trim()) {
        await addProductByBarcode(barcode.trim());
    }
});

document.getElementById('btnScanInForm').addEventListener('click', () => {
    closeSheet('addSheet');
    scannerMode = 'form';
    openSheet('scannerSheet');
    startScanner();
});

// Cerca prodotto quando si inserisce barcode manualmente nel form
document.getElementById('productBarcode').addEventListener('change', async (e) => {
    const barcode = e.target.value.trim();
    if (barcode && barcode.length >= 8) {
        showToast('Cerco prodotto...', 'success');
        const productInfo = await fetchProductByBarcode(barcode);
        if (productInfo) {
            document.getElementById('productName').value = productInfo.name;
            document.getElementById('productBrand').value = productInfo.brand || '';
            document.getElementById('productImage').value = productInfo.image || '';
            renderCategorySelector(productInfo.category);
            showToast('Dati prodotto compilati!', 'success');
        } else {
            showToast('Prodotto non trovato nel database', 'error');
        }
    }
});

// Cerca anche premendo Invio nel campo barcode
document.getElementById('productBarcode').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const barcode = e.target.value.trim();
        if (barcode && barcode.length >= 8) {
            showToast('Cerco prodotto...', 'success');
            const productInfo = await fetchProductByBarcode(barcode);
            if (productInfo) {
                document.getElementById('productName').value = productInfo.name;
                document.getElementById('productBrand').value = productInfo.brand || '';
                document.getElementById('productImage').value = productInfo.image || '';
                renderCategorySelector(productInfo.category);
                showToast('Dati prodotto compilati!', 'success');
            } else {
                showToast('Prodotto non trovato nel database', 'error');
            }
        }
    }
});

// Add product form
document.getElementById('addProductForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('productName').value.trim();
    if (!name) return;

    const selectedCat = document.querySelector('.category-option.selected');
    const category = selectedCat?.dataset.category || 'other';
    const selectedShops = getSelectedShops();

    const product = {
        id: Date.now().toString(),
        name,
        brand: document.getElementById('productBrand').value.trim(),
        category,
        barcode: document.getElementById('productBarcode').value || null,
        image: document.getElementById('productImage').value || null,
        shops: selectedShops,
        quantity: 1,
        checked: false,
        createdAt: Date.now()
    };

    const existing = shoppingList.find(p => 
        p.name.toLowerCase() === name.toLowerCase() ||
        (p.barcode && p.barcode === product.barcode)
    );

    if (existing) {
        existing.quantity += 1;
        // Merge shops
        if (selectedShops.length > 0) {
            existing.shops = [...new Set([...(existing.shops || []), ...selectedShops])];
        }
        await saveToStore('shoppingList', existing);
        showToast('Quantità aggiornata!', 'success');
    } else {
        shoppingList.push(product);
        await saveToStore('shoppingList', product);
        showToast('Prodotto aggiunto!', 'success');
    }

    // Save to history
    const historyItem = {
        id: product.barcode || product.name.toLowerCase().replace(/\s+/g, '_'),
        name: product.name,
        brand: product.brand,
        category: product.category,
        image: product.image,
        barcode: product.barcode,
        shops: selectedShops,
        lastUsed: Date.now()
    };
    await saveToStore('productHistory', historyItem);
    const idx = productHistory.findIndex(h => h.id === historyItem.id);
    if (idx >= 0) productHistory.splice(idx, 1);
    productHistory.unshift(historyItem);
    productHistory = productHistory.slice(0, 50);

    closeSheet('addSheet');
    renderShoppingList();
    hapticFeedback();
});

// Settings
document.getElementById('btnManageCategories').addEventListener('click', () => {
    renderCategoryManagement();
    closeSheet('settingsSheet');
    openSheet('categoriesSheet');
});

document.getElementById('btnAddCategory').addEventListener('click', () => {
    closeSheet('categoriesSheet');
    openEditCategory(null);
});

document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('categoryNameInput').value.trim();
    if (!name) return;

    const existingId = document.getElementById('categoryId').value;
    const emoji = document.getElementById('categoryEmoji').value || '📦';
    const id = existingId || name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    const category = { id, name, emoji, isDefault: false };
    await saveToStore('categories', category);
    categories[id] = category;

    closeSheet('editCategorySheet');
    renderCategoryManagement();
    openSheet('categoriesSheet');
    showToast(existingId ? 'Categoria aggiornata!' : 'Categoria creata!', 'success');
});

document.getElementById('btnExport').addEventListener('click', exportData);

// Theme toggle
document.getElementById('btnToggleTheme').addEventListener('click', toggleTheme);

// Shop management
document.getElementById('btnManageShops').addEventListener('click', () => {
    renderShopManagement();
    closeSheet('settingsSheet');
    openSheet('shopsSheet');
});

document.getElementById('btnAddShop').addEventListener('click', () => {
    closeSheet('shopsSheet');
    openEditShop(null);
});

document.getElementById('closeShopsSheet').addEventListener('click', () => closeSheet('shopsSheet'));
document.getElementById('closeEditShopSheet').addEventListener('click', () => closeSheet('editShopSheet'));

document.getElementById('shopForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('shopNameInput').value.trim();
    if (!name) return;

    const existingId = document.getElementById('shopId').value;
    const emoji = document.getElementById('shopEmoji').value || '🛒';
    const id = existingId || name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    const shop = { id, name, emoji };
    await saveToStore('shops', shop);
    shops[id] = shop;

    closeSheet('editShopSheet');
    renderShopManagement();
    openSheet('shopsSheet');
    showToast(existingId ? 'Supermercato aggiornato!' : 'Supermercato creato!', 'success');
});

document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        importData(file);
        e.target.value = '';
    }
});

document.getElementById('btnClearChecked').addEventListener('click', async () => {
    const checked = shoppingList.filter(p => p.checked);
    if (checked.length === 0) {
        showToast('Nessun prodotto completato', 'error');
        return;
    }

    const confirmed = await showConfirm('Rimuovi Completati', `Rimuovere ${checked.length} prodotti completati?`, '✨', false);
    if (confirmed) {
        for (const product of checked) {
            await deleteFromStore('shoppingList', product.id);
        }
        shoppingList = shoppingList.filter(p => !p.checked);
        renderShoppingList();
        closeAllSheets();
        showToast('Prodotti rimossi!', 'success');
    }
});

document.getElementById('btnClearAll').addEventListener('click', async () => {
    if (shoppingList.length === 0) {
        showToast('Lista già vuota', 'error');
        return;
    }

    const confirmed = await showConfirm('Svuota Lista', 'Vuoi davvero eliminare tutti i prodotti?', '🗑️', true);
    if (confirmed) {
        await clearStore('shoppingList');
        shoppingList = [];
        renderShoppingList();
        closeAllSheets();
        showToast('Lista svuotata!', 'success');
    }
});
