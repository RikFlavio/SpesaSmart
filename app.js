// ===================================
// SpesaSmart - App JavaScript
// ===================================

const DB_NAME = 'SpesaSmartDB';
const DB_VERSION = 1;

const DEFAULT_CATEGORIES = [
    { id: 'dairy', name: 'Latticini', emoji: '🥛' },
    { id: 'fruit', name: 'Frutta/Verdura', emoji: '🍎' },
    { id: 'meat', name: 'Carne/Pesce', emoji: '🥩' },
    { id: 'bakery', name: 'Panetteria', emoji: '🥖' },
    { id: 'drinks', name: 'Bevande', emoji: '🥤' },
    { id: 'frozen', name: 'Surgelati', emoji: '🧊' },
    { id: 'snacks', name: 'Snack/Dolci', emoji: '🍪' },
    { id: 'household', name: 'Casa/Igiene', emoji: '🧴' },
    { id: 'other', name: 'Altro', emoji: '📦' }
];

const CATEGORY_EMOJIS = ['🥛','🧀','🥚','🍎','🥬','🍌','🥕','🍅','🥩','🍗','🐟','🥖','🍞','🥐','🥤','🧃','☕','🍺','🧊','🍦','🍕','🍪','🍫','🍿','🧴','🧹','🧻','💊','🐱','🐶','👶','🌿','🥫','🍝','🌶️','🧈','🍯','🥜','📦','🏷️'];
const SHOP_EMOJIS = ['🛒','🏪','🏬','🛍️','🏢','💰','⭐','🔵','🟢','🔴','🟡','🟠','🟣','⚫','🌿','💎'];

let db = null;
let products = [];
let history = [];
let categories = [];
let shops = [];
let activeFilter = null;
let currentTheme = 'dark';
let scanner = null;
let scanMode = 'main';

// === Database ===
async function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => { db = req.result; resolve(); };
        req.onupgradeneeded = (e) => {
            const d = e.target.result;
            ['products', 'history', 'categories', 'shops'].forEach(s => {
                if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
            });
        };
    });
}

function dbGet(store) {
    return new Promise(resolve => {
        const req = db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });
}

function dbPut(store, item) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(item);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

function dbDelete(store, id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

function dbClear(store) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

async function loadData() {
    products = await dbGet('products');
    history = (await dbGet('history')).sort((a, b) => b.lastUsed - a.lastUsed);
    const savedCats = await dbGet('categories');
    categories = savedCats.length ? savedCats : [...DEFAULT_CATEGORIES];
    if (!savedCats.length) for (const c of categories) await dbPut('categories', c);
    shops = await dbGet('shops');
}

// === Theme ===
function initTheme() {
    currentTheme = localStorage.getItem('spesasmart-theme') || 
        (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    applyTheme();
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    const meta = document.getElementById('metaTheme');
    if (meta) meta.content = currentTheme === 'light' ? '#f2f2f7' : '#0a0a0f';
    updateThemeUI();
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('spesasmart-theme', currentTheme);
    applyTheme();
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
        if (desc) desc.textContent = 'Passa al tema scuro';
    } else {
        toggle?.classList.remove('active');
        if (icon) icon.textContent = '🌙';
        if (name) name.textContent = 'Tema Scuro';
        if (desc) desc.textContent = 'Passa al tema chiaro';
    }
}

// === UI Helpers ===
const $ = id => document.getElementById(id);
const show = id => $(id)?.classList.add('active');
const hide = id => $(id)?.classList.remove('active');

function openModal(id) { show('overlay'); show(id); }
function closeModal(id) { hide('overlay'); hide(id); if (id === 'modalScanner') stopScanner(); }
function closeAllModals() { hide('overlay'); document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active')); stopScanner(); }

function toast(msg, type = 'success') {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast ' + type + ' show';
    setTimeout(() => t.classList.remove('show'), 3000);
}

function vibrate() { if (navigator.vibrate) navigator.vibrate(10); }

// === Dialog ===
function showDialog(opts) {
    return new Promise(resolve => {
        $('dialogIcon').textContent = opts.icon || '❓';
        $('dialogTitle').textContent = opts.title || 'Conferma';
        $('dialogMessage').textContent = opts.message || '';
        
        const inputWrap = $('dialogInputWrap');
        const input = $('dialogInput');
        if (opts.input) {
            inputWrap.classList.add('active');
            input.value = opts.inputValue || '';
            input.placeholder = opts.placeholder || '';
        } else {
            inputWrap.classList.remove('active');
        }
        
        const btn = $('dialogConfirm');
        btn.textContent = opts.confirmText || 'Conferma';
        btn.style.background = opts.danger ? 'var(--danger)' : '';
        
        show('dialog');
        
        const done = (r) => { hide('dialog'); $('dialogConfirm').onclick = null; $('dialogCancel').onclick = null; resolve(r); };
        $('dialogConfirm').onclick = () => done(opts.input ? input.value : true);
        $('dialogCancel').onclick = () => done(null);
    });
}

const confirm = (title, message, icon = '❓', danger = false) => showDialog({ title, message, icon, danger });
const prompt = (title, message, placeholder = '', value = '') => showDialog({ title, message, icon: '✏️', input: true, placeholder, inputValue: value });

// === Render ===
function renderShopFilter() {
    const c = $('shopFilter');
    if (!shops.length) { c.innerHTML = ''; return; }
    c.innerHTML = `<button class="filter-chip ${!activeFilter ? 'active' : ''}" data-filter="">🛒 Tutti</button>` +
        shops.map(s => `<button class="filter-chip ${activeFilter === s.id ? 'active' : ''}" data-filter="${s.id}">${s.emoji} ${s.name}</button>`).join('');
    c.querySelectorAll('.filter-chip').forEach(chip => {
        chip.onclick = () => { activeFilter = chip.dataset.filter || null; renderShopFilter(); renderList(); vibrate(); };
    });
}

function renderList() {
    const c = $('mainList');
    let list = activeFilter ? products.filter(p => p.shops?.includes(activeFilter)) : products;
    
    $('statTotal').textContent = list.reduce((s, p) => s + p.qty, 0);
    $('statChecked').textContent = list.filter(p => p.done).reduce((s, p) => s + p.qty, 0);
    
    if (!list.length) {
        c.innerHTML = `<div class="empty"><div class="empty-icon">${activeFilter ? '🏪' : '🛒'}</div><h3>Lista vuota</h3><p>${activeFilter ? 'Nessun prodotto qui' : 'Scansiona o aggiungi un prodotto'}</p></div>`;
        return;
    }
    
    const groups = {};
    list.forEach(p => { const cat = p.category || 'other'; if (!groups[cat]) groups[cat] = []; groups[cat].push(p); });
    const order = categories.map(c => c.id);
    
    c.innerHTML = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(catId => {
        const cat = categories.find(c => c.id === catId) || { emoji: '📦', name: 'Altro' };
        return `<div class="category-group"><div class="category-header"><span>${cat.emoji}</span> ${cat.name}</div>${groups[catId].map(p => renderProduct(p, cat)).join('')}</div>`;
    }).join('');
    
    c.querySelectorAll('.product').forEach(el => {
        const id = el.dataset.id;
        el.querySelector('.product-check').onclick = e => { e.stopPropagation(); toggleProduct(id); };
        el.querySelector('.qty-minus')?.addEventListener('click', e => { e.stopPropagation(); updateQty(id, -1); });
        el.querySelector('.qty-plus')?.addEventListener('click', e => { e.stopPropagation(); updateQty(id, 1); });
        el.onclick = () => openDetail(id);
    });
}

function renderProduct(p, cat) {
    const badges = (p.shops || []).map(sid => shops.find(x => x.id === sid)?.emoji || '').filter(Boolean).join('');
    return `<div class="product ${p.done ? 'checked' : ''}" data-id="${p.id}">
        <div class="product-check">✓</div>
        <div class="product-image">${p.image ? `<img src="${p.image}">` : cat.emoji}</div>
        <div class="product-info">
            <div class="product-name">${p.name}</div>
            <div class="product-meta">${p.brand || cat.name}</div>
            ${badges ? `<div class="product-shops">${badges.split('').map(e => `<span>${e}</span>`).join('')}</div>` : ''}
        </div>
        <div class="product-qty">
            <button class="qty-btn qty-minus">−</button>
            <span class="qty-value">${p.qty}</span>
            <button class="qty-btn qty-plus">+</button>
        </div>
    </div>`;
}

function renderCategoryGrid(sel = 'dairy') {
    const c = $('categoryGrid');
    c.innerHTML = categories.map(cat => `<div class="category-item ${cat.id === sel ? 'selected' : ''}" data-id="${cat.id}"><span>${cat.emoji}</span><span>${cat.name}</span></div>`).join('');
    c.querySelectorAll('.category-item').forEach(el => {
        el.onclick = () => { c.querySelectorAll('.category-item').forEach(x => x.classList.remove('selected')); el.classList.add('selected'); vibrate(); };
    });
}

function renderShopGrid(sel = []) {
    const c = $('shopGrid');
    if (!shops.length) { c.innerHTML = '<p class="hint">Nessun supermercato</p>'; return; }
    c.innerHTML = shops.map(s => `<label class="shop-item ${sel.includes(s.id) ? 'selected' : ''}" data-id="${s.id}"><input type="checkbox" name="shop" value="${s.id}" ${sel.includes(s.id) ? 'checked' : ''} hidden><span>${s.emoji}</span><span>${s.name}</span></label>`).join('');
    c.querySelectorAll('.shop-item').forEach(el => {
        el.onclick = () => { el.classList.toggle('selected'); el.querySelector('input').checked = el.classList.contains('selected'); vibrate(); };
    });
}

function getSelectedCategory() { return $('categoryGrid').querySelector('.selected')?.dataset.id || 'other'; }
function getSelectedShops() { return Array.from($('shopGrid').querySelectorAll('input:checked')).map(cb => cb.value); }

function renderEmojiPicker(containerId, selected, emojis, inputId) {
    const c = $(containerId);
    c.innerHTML = emojis.map(e => `<button type="button" class="emoji-btn ${e === selected ? 'selected' : ''}" data-emoji="${e}">${e}</button>`).join('');
    c.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.onclick = () => { c.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); $(inputId).value = btn.dataset.emoji; vibrate(); };
    });
}

// === Product Actions ===
async function toggleProduct(id) {
    const p = products.find(x => x.id === id);
    if (p) { p.done = !p.done; await dbPut('products', p); renderList(); vibrate(); }
}

async function updateQty(id, delta) {
    const p = products.find(x => x.id === id);
    if (p) { p.qty = Math.max(1, p.qty + delta); await dbPut('products', p); renderList(); vibrate(); }
}

async function deleteProduct(id) {
    await dbDelete('products', id);
    products = products.filter(p => p.id !== id);
    renderList();
    toast('Prodotto eliminato');
}

async function addProduct(data) {
    const existing = products.find(p => p.name.toLowerCase() === data.name.toLowerCase() || (data.barcode && p.barcode === data.barcode));
    if (existing) {
        existing.qty += 1;
        if (data.shops) existing.shops = [...new Set([...(existing.shops || []), ...data.shops])];
        await dbPut('products', existing);
        toast(`${existing.name} - quantità aggiornata`);
    } else {
        const product = { id: Date.now().toString(), name: data.name, brand: data.brand || '', category: data.category || 'other', barcode: data.barcode || null, image: data.image || null, shops: data.shops || [], qty: 1, done: false, createdAt: Date.now() };
        products.push(product);
        await dbPut('products', product);
        toast(`${product.name} aggiunto`);
        await addToHistory(product);
    }
    renderList();
    renderShopFilter();
}

async function addToHistory(p) {
    const item = { id: p.barcode || p.name.toLowerCase().replace(/\s+/g, '_'), name: p.name, brand: p.brand, category: p.category, barcode: p.barcode, image: p.image, shops: p.shops, lastUsed: Date.now() };
    await dbPut('history', item);
    history = history.filter(h => h.id !== item.id);
    history.unshift(item);
    history = history.slice(0, 50);
}

// === Scanner ===
async function startScanner() {
    if (scanner) try { await scanner.stop(); } catch(e) {}
    scanner = new Html5Qrcode('scannerView');
    try {
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 100 } }, onScanSuccess, () => {});
    } catch (e) { console.error(e); toast('Errore fotocamera', 'error'); }
}

async function stopScanner() { if (scanner) { try { await scanner.stop(); } catch(e) {} scanner = null; } }

async function onScanSuccess(code) {
    vibrate();
    await stopScanner();
    closeModal('modalScanner');
    if (scanMode === 'field') { $('inputBarcode').value = code; await lookupBarcode(code); scanMode = 'main'; return; }
    await addByBarcode(code);
}

async function addByBarcode(code) {
    toast('Cerco prodotto...');
    const info = await fetchProduct(code);
    if (info) await addProduct({ name: info.name, brand: info.brand, category: info.category, barcode: code, image: info.image, shops: [] });
    else { openAddModal(); $('inputBarcode').value = code; $('modalAddTitle').textContent = 'Prodotto non trovato'; toast('Aggiungi manualmente', 'error'); }
}

async function lookupBarcode(code) {
    const info = await fetchProduct(code);
    if (info) { $('inputName').value = info.name; $('inputBrand').value = info.brand || ''; $('inputImage').value = info.image || ''; renderCategoryGrid(info.category); showPreview(info); toast('Dati compilati'); }
}

async function fetchProduct(barcode) {
    try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
        const data = await res.json();
        if (data.status === 1 && data.product) {
            const p = data.product;
            return { name: p.product_name || p.product_name_it || 'Sconosciuto', brand: p.brands || '', image: p.image_front_small_url || p.image_url || null, category: guessCategory(p) };
        }
    } catch (e) { console.error(e); }
    return null;
}

function guessCategory(p) {
    const c = (p.categories || '').toLowerCase();
    if (/lait|milk|latte|fromage|cheese|yogurt/.test(c)) return 'dairy';
    if (/fruit|vegetable|frutta|verdur/.test(c)) return 'fruit';
    if (/meat|carne|fish|pesce/.test(c)) return 'meat';
    if (/bread|pane|bakery/.test(c)) return 'bakery';
    if (/beverage|drink|bevand/.test(c)) return 'drinks';
    if (/frozen|surgel/.test(c)) return 'frozen';
    if (/snack|sweet|chocolate/.test(c)) return 'snacks';
    return 'other';
}

function showPreview(info) {
    const p = $('productPreview');
    p.classList.add('active');
    p.innerHTML = `<div class="product-preview-img">${info.image ? `<img src="${info.image}">` : '📦'}</div><div class="product-preview-info"><h4>${info.name}</h4><p>${info.brand || ''}</p></div>`;
}

// === Detail ===
async function openDetail(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const cat = categories.find(c => c.id === p.category) || { emoji: '📦', name: 'Altro' };
    const c = $('detailContent');
    c.innerHTML = `<div class="detail-header"><div class="detail-img">${p.image ? `<img src="${p.image}">` : cat.emoji}</div><div class="detail-info"><h3>${p.name}</h3><p>${p.brand || cat.name}</p>${p.barcode ? `<small>${p.barcode}</small>` : ''}</div></div><div class="loading"><div class="spinner"></div></div>`;
    openModal('modalDetail');
    if (p.barcode) { const full = await fetchFull(p.barcode); renderDetail(p, cat, full); }
    else { c.innerHTML = `<div class="detail-header"><div class="detail-img">${cat.emoji}</div><div class="detail-info"><h3>${p.name}</h3><p>${p.brand || cat.name}</p></div></div><div class="no-data">ℹ️ Nessuna informazione</div><button class="btn-outline btn-full" onclick="confirmDel('${p.id}')" style="margin-top:20px;color:var(--danger)">🗑️ Elimina</button>`; }
}

async function fetchFull(barcode) {
    try { const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`); const data = await res.json(); return data.status === 1 ? data.product : null; } catch(e) { return null; }
}

function renderDetail(p, cat, api) {
    let html = `<div class="detail-header"><div class="detail-img">${p.image ? `<img src="${p.image}">` : cat.emoji}</div><div class="detail-info"><h3>${p.name}</h3><p>${p.brand || cat.name}</p>${p.barcode ? `<small>${p.barcode}</small>` : ''}</div></div>`;
    if (!api) html += `<div class="no-data">ℹ️ Info non disponibili</div>`;
    else {
        const ns = api.nutriscore_grade || api.nutrition_grades;
        if (ns) { const labels = { a: 'Eccellente', b: 'Buona', c: 'Media', d: 'Scarsa', e: 'Cattiva' }; html += `<div class="detail-section"><h4>📊 Qualità</h4><div class="nutri-row"><div class="nutri-score ${ns}">${ns.toUpperCase()}</div><div class="nutri-text"><strong>Nutri-Score</strong><span>${labels[ns] || ''}</span></div></div></div>`; }
        const n = api.nutriments || {};
        const nutri = [{ l: 'Energia', v: n['energy-kcal_100g'], u: 'kcal' }, { l: 'Grassi', v: n.fat_100g, u: 'g' }, { l: 'Carboidrati', v: n.carbohydrates_100g, u: 'g' }, { l: 'Zuccheri', v: n.sugars_100g, u: 'g' }, { l: 'Proteine', v: n.proteins_100g, u: 'g' }, { l: 'Sale', v: n.salt_100g, u: 'g' }].filter(x => x.v != null);
        if (nutri.length) html += `<div class="detail-section"><h4>🍽️ Per 100g</h4><div class="nutrition-grid">${nutri.map(x => `<div class="nutrition-item"><small>${x.l}</small><strong>${Number(x.v).toFixed(1)}</strong><span>${x.u}</span></div>`).join('')}</div></div>`;
        const allergens = api.allergens_tags || [];
        if (allergens.length) html += `<div class="detail-section"><h4>⚠️ Allergeni</h4><div class="tag-list">${allergens.map(a => `<span class="tag allergen">⚠️ ${a.replace(/^(en|it):/, '').replace(/-/g, ' ')}</span>`).join('')}</div></div>`;
        const { quantity, serving_size } = api;
        if (quantity || serving_size) html += `<div class="detail-section"><h4>📦 Confezione</h4><div class="package-list">${quantity ? `<div class="package-item"><span>Quantità</span><span>${quantity}</span></div>` : ''}${serving_size ? `<div class="package-item"><span>Porzione</span><span>${serving_size}</span></div>` : ''}</div></div>`;
    }
    html += `<button class="btn-outline btn-full" onclick="confirmDel('${p.id}')" style="margin-top:20px;color:var(--danger)">🗑️ Elimina</button>`;
    $('detailContent').innerHTML = html;
}

async function confirmDel(id) { if (await confirm('Elimina', 'Eliminare questo prodotto?', '🗑️', true)) { closeModal('modalDetail'); await deleteProduct(id); } }

// === Add Modal ===
function openAddModal() {
    $('formProduct').reset();
    $('productPreview').classList.remove('active');
    $('productPreview').innerHTML = '';
    $('inputImage').value = '';
    $('modalAddTitle').textContent = 'Aggiungi Prodotto';
    renderCategoryGrid('dairy');
    renderShopGrid([]);
    openModal('modalAdd');
}

// === History ===
function renderHistory() {
    const c = $('historyList');
    if (!history.length) { c.innerHTML = '<div class="no-data">Nessun prodotto</div>'; return; }
    c.innerHTML = history.map(h => {
        const cat = categories.find(c => c.id === h.category) || { emoji: '📦' };
        return `<div class="list-item" data-id="${h.id}"><span class="list-item-icon">${h.image ? `<img src="${h.image}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;">` : cat.emoji}</span><div class="list-item-text"><strong>${h.name}</strong><small>${h.brand || ''}</small></div><span class="arrow">+</span></div>`;
    }).join('');
    c.querySelectorAll('.list-item').forEach(el => {
        el.onclick = async () => { const h = history.find(x => x.id === el.dataset.id); if (h) { await addProduct({ name: h.name, brand: h.brand, category: h.category, barcode: h.barcode, image: h.image, shops: h.shops || [] }); closeModal('modalHistory'); } };
    });
}

// === Shops ===
function renderShopsList() {
    const c = $('shopsList');
    if (!shops.length) { c.innerHTML = '<div class="no-data">Nessun supermercato</div>'; return; }
    c.innerHTML = shops.map(s => `<div class="list-item" data-id="${s.id}"><span class="list-item-icon">${s.emoji}</span><div class="list-item-text"><strong>${s.name}</strong></div><div class="list-item-actions"><button data-action="edit">✏️</button><button data-action="delete">🗑️</button></div></div>`).join('');
    c.querySelectorAll('.list-item').forEach(el => {
        el.querySelector('[data-action="edit"]').onclick = e => { e.stopPropagation(); openEditShop(el.dataset.id); };
        el.querySelector('[data-action="delete"]').onclick = async e => { e.stopPropagation(); if (await confirm('Elimina', `Eliminare "${shops.find(s => s.id === el.dataset.id)?.name}"?`, '🗑️', true)) { await dbDelete('shops', el.dataset.id); shops = shops.filter(s => s.id !== el.dataset.id); renderShopsList(); renderShopFilter(); toast('Eliminato'); } };
    });
}

function openEditShop(id) {
    const s = id ? shops.find(x => x.id === id) : null;
    $('editShopTitle').textContent = s ? 'Modifica' : 'Nuovo Supermercato';
    $('inputShopId').value = id || '';
    $('inputShopName').value = s?.name || '';
    $('inputShopEmoji').value = s?.emoji || '🛒';
    renderEmojiPicker('shopEmojiPicker', s?.emoji || '🛒', SHOP_EMOJIS, 'inputShopEmoji');
    closeModal('modalShops');
    openModal('modalEditShop');
}

// === Categories ===
function renderCategoriesList() {
    const c = $('categoriesList');
    c.innerHTML = categories.map(cat => `<div class="list-item" data-id="${cat.id}"><span class="list-item-icon">${cat.emoji}</span><div class="list-item-text"><strong>${cat.name}</strong></div><div class="list-item-actions"><button data-action="edit">✏️</button><button data-action="delete">🗑️</button></div></div>`).join('');
    c.querySelectorAll('.list-item').forEach(el => {
        el.querySelector('[data-action="edit"]').onclick = e => { e.stopPropagation(); openEditCategory(el.dataset.id); };
        el.querySelector('[data-action="delete"]').onclick = async e => { e.stopPropagation(); if (categories.length <= 1) { toast('Almeno una categoria', 'error'); return; } if (await confirm('Elimina', `Eliminare "${categories.find(c => c.id === el.dataset.id)?.name}"?`, '🗑️', true)) { await dbDelete('categories', el.dataset.id); categories = categories.filter(c => c.id !== el.dataset.id); products.filter(p => p.category === el.dataset.id).forEach(p => { p.category = 'other'; dbPut('products', p); }); renderCategoriesList(); renderList(); toast('Eliminata'); } };
    });
}

function openEditCategory(id) {
    const c = id ? categories.find(x => x.id === id) : null;
    $('editCategoryTitle').textContent = c ? 'Modifica' : 'Nuova Categoria';
    $('inputCategoryId').value = id || '';
    $('inputCategoryName').value = c?.name || '';
    $('inputCategoryEmoji').value = c?.emoji || '📦';
    renderEmojiPicker('categoryEmojiPicker', c?.emoji || '📦', CATEGORY_EMOJIS, 'inputCategoryEmoji');
    closeModal('modalCategories');
    openModal('modalEditCategory');
}

// === Export/Import ===
function exportData() {
    const data = { version: 1, date: new Date().toISOString(), products, history, categories, shops };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `spesasmart-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast('Esportato');
}

async function importData(file) {
    try {
        const data = JSON.parse(await file.text());
        if (!data.products) throw new Error('Invalid');
        await dbClear('products');
        for (const p of data.products) await dbPut('products', p);
        if (data.history) for (const h of data.history) await dbPut('history', h);
        if (data.shops) for (const s of data.shops) await dbPut('shops', s);
        if (data.categories) for (const c of data.categories) await dbPut('categories', c);
        await loadData();
        renderList();
        renderShopFilter();
        closeAllModals();
        toast('Importato');
    } catch (e) { toast('Errore', 'error'); }
}

// === Init ===
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    try {
        await initDB();
        await loadData();
        renderShopFilter();
        renderList();
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.log(e));
    } catch (e) { console.error(e); toast('Errore', 'error'); }
});

// === Events ===
$('overlay').onclick = closeAllModals;
document.querySelectorAll('.modal-close').forEach(btn => { btn.onclick = () => closeModal(btn.dataset.close); });

$('btnScan').onclick = () => { scanMode = 'main'; openModal('modalScanner'); startScanner(); };
$('btnAdd').onclick = openAddModal;
$('btnSettings').onclick = () => openModal('modalSettings');
$('btnHistory').onclick = () => { renderHistory(); openModal('modalHistory'); };

$('btnManualCode').onclick = async () => { await stopScanner(); closeModal('modalScanner'); const code = await prompt('Barcode', 'Inserisci il codice', 'es. 8001234567890'); if (code?.trim()) await addByBarcode(code.trim()); };
$('btnScanBarcode').onclick = () => { closeModal('modalAdd'); scanMode = 'field'; openModal('modalScanner'); startScanner(); };
$('inputBarcode').onchange = async e => { if (e.target.value.trim().length >= 8) await lookupBarcode(e.target.value.trim()); };

$('formProduct').onsubmit = async e => { e.preventDefault(); const name = $('inputName').value.trim(); if (!name) return; await addProduct({ name, brand: $('inputBrand').value.trim(), category: getSelectedCategory(), barcode: $('inputBarcode').value.trim() || null, image: $('inputImage').value || null, shops: getSelectedShops() }); closeModal('modalAdd'); };
$('btnAddShopInline').onclick = () => { closeModal('modalAdd'); openEditShop(null); };

$('btnTheme').onclick = toggleTheme;
$('btnShops').onclick = () => { closeModal('modalSettings'); renderShopsList(); openModal('modalShops'); };
$('btnCategories').onclick = () => { closeModal('modalSettings'); renderCategoriesList(); openModal('modalCategories'); };
$('btnExport').onclick = exportData;
$('inputImport').onchange = e => { if (e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; } };
$('btnClearDone').onclick = async () => { const done = products.filter(p => p.done); if (!done.length) { toast('Nessuno', 'error'); return; } if (await confirm('Rimuovi', `Eliminare ${done.length} prodotti?`, '✨')) { for (const p of done) await dbDelete('products', p.id); products = products.filter(p => !p.done); renderList(); closeModal('modalSettings'); toast('Rimossi'); } };
$('btnClearAll').onclick = async () => { if (!products.length) { toast('Già vuota', 'error'); return; } if (await confirm('Svuota', 'Eliminare tutto?', '🗑️', true)) { await dbClear('products'); products = []; renderList(); closeModal('modalSettings'); toast('Svuotata'); } };

$('btnNewShop').onclick = () => openEditShop(null);
$('formShop').onsubmit = async e => { e.preventDefault(); const name = $('inputShopName').value.trim(); if (!name) return; const id = $('inputShopId').value || name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''); const shop = { id, name, emoji: $('inputShopEmoji').value || '🛒' }; await dbPut('shops', shop); const idx = shops.findIndex(s => s.id === id); if (idx >= 0) shops[idx] = shop; else shops.push(shop); closeModal('modalEditShop'); renderShopsList(); renderShopFilter(); openModal('modalShops'); toast('Salvato'); };

$('btnNewCategory').onclick = () => openEditCategory(null);
$('formCategory').onsubmit = async e => { e.preventDefault(); const name = $('inputCategoryName').value.trim(); if (!name) return; const id = $('inputCategoryId').value || name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''); const cat = { id, name, emoji: $('inputCategoryEmoji').value || '📦' }; await dbPut('categories', cat); const idx = categories.findIndex(c => c.id === id); if (idx >= 0) categories[idx] = cat; else categories.push(cat); closeModal('modalEditCategory'); renderCategoriesList(); renderList(); openModal('modalCategories'); toast('Salvato'); };
