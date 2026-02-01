// SpesaSmart App

const DB_NAME = 'SpesaSmartDB';
const DB_VERSION = 1;

const DEFAULT_CATEGORIES = [
    { id: 'dairy', name: 'Latticini', emoji: '🥛' },
    { id: 'fruit', name: 'Frutta', emoji: '🍎' },
    { id: 'meat', name: 'Carne', emoji: '🥩' },
    { id: 'bakery', name: 'Pane', emoji: '🥖' },
    { id: 'drinks', name: 'Bevande', emoji: '🥤' },
    { id: 'frozen', name: 'Surgelati', emoji: '🧊' },
    { id: 'snacks', name: 'Snack', emoji: '🍪' },
    { id: 'household', name: 'Casa', emoji: '🧴' },
    { id: 'other', name: 'Altro', emoji: '📦' }
];

const SHOP_EMOJIS = ['🛒','🏪','🏬','🛍️','💰','⭐','🔵','🟢','🔴','🟡','🟠','🟣','🌿','💎','🏢','🛣️'];

let db, products = [], history = [], categories = [], shops = [];
let activeFilter = null, currentTheme = 'dark', scanner = null;
let pendingProduct = null; // Prodotto in attesa di conferma supermercato

// === DB ===
const initDB = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onerror = () => rej(r.error);
    r.onsuccess = () => { db = r.result; res(); };
    r.onupgradeneeded = e => {
        const d = e.target.result;
        ['products','history','categories','shops'].forEach(s => {
            if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, {keyPath:'id'});
        });
    };
});

const dbGet = s => new Promise(r => {
    const req = db.transaction(s,'readonly').objectStore(s).getAll();
    req.onsuccess = () => r(req.result || []);
    req.onerror = () => r([]);
});

const dbPut = (s, i) => new Promise((res, rej) => {
    const tx = db.transaction(s,'readwrite');
    tx.objectStore(s).put(i);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
});

const dbDel = (s, id) => new Promise((res, rej) => {
    const tx = db.transaction(s,'readwrite');
    tx.objectStore(s).delete(id);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
});

const dbClear = s => new Promise((res, rej) => {
    const tx = db.transaction(s,'readwrite');
    tx.objectStore(s).clear();
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
});

const loadData = async () => {
    products = await dbGet('products');
    history = (await dbGet('history')).sort((a,b) => b.lastUsed - a.lastUsed);
    const sc = await dbGet('categories');
    categories = sc.length ? sc : [...DEFAULT_CATEGORIES];
    if (!sc.length) for (const c of categories) await dbPut('categories', c);
    shops = await dbGet('shops');
};

// === Theme ===
const initTheme = () => {
    currentTheme = localStorage.getItem('theme') || (window.matchMedia?.('(prefers-color-scheme:light)').matches ? 'light' : 'dark');
    applyTheme();
};

const applyTheme = () => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    const m = document.getElementById('metaTheme');
    if (m) m.content = currentTheme === 'light' ? '#f2f2f7' : '#22c55e';
    const t = document.getElementById('themeToggle');
    const i = document.getElementById('themeIcon');
    const n = document.getElementById('themeName');
    if (currentTheme === 'light') {
        t?.classList.add('active');
        if (i) i.textContent = '☀️';
        if (n) n.textContent = 'Tema Chiaro';
    } else {
        t?.classList.remove('active');
        if (i) i.textContent = '🌙';
        if (n) n.textContent = 'Tema Scuro';
    }
};

const toggleTheme = () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', currentTheme);
    applyTheme();
};

// === UI ===
const $ = id => document.getElementById(id);
const show = id => $(id)?.classList.add('active');
const hide = id => $(id)?.classList.remove('active');
const openModal = id => { show('overlay'); show(id); };
const closeModal = id => { hide('overlay'); hide(id); if (id === 'modalScanner') stopScanner(); };
const closeAll = () => { hide('overlay'); document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active')); stopScanner(); };
const toast = (m, t='success') => { const e = $('toast'); e.textContent = m; e.className = 'toast show'; setTimeout(() => e.classList.remove('show'), 2500); };
const vibrate = () => navigator.vibrate?.(10);

// === Dialog ===
const showDialog = opts => new Promise(res => {
    $('dialogIcon').textContent = opts.icon || '❓';
    $('dialogTitle').textContent = opts.title || 'Conferma';
    $('dialogMessage').textContent = opts.message || '';
    const iw = $('dialogInputWrap'), inp = $('dialogInput');
    if (opts.input) { iw.classList.add('active'); inp.value = opts.value || ''; inp.placeholder = opts.placeholder || ''; }
    else iw.classList.remove('active');
    const btn = $('dialogConfirm');
    btn.textContent = opts.ok || 'OK';
    btn.style.background = opts.danger ? 'var(--danger)' : '';
    show('dialog');
    const done = r => { hide('dialog'); res(r); };
    $('dialogConfirm').onclick = () => done(opts.input ? inp.value : true);
    $('dialogCancel').onclick = () => done(null);
});

const confirm = (title, msg, icon='❓', danger=false) => showDialog({title, message:msg, icon, danger});
const prompt = (title, msg, placeholder='', value='') => showDialog({title, message:msg, icon:'✏️', input:true, placeholder, value});

// === Render ===
const renderShopFilter = () => {
    const c = $('shopFilter');
    if (!shops.length) { c.innerHTML = ''; return; }
    c.innerHTML = `<button class="filter-chip ${!activeFilter?'active':''}" data-f="">🛒 Tutti</button>` +
        shops.map(s => `<button class="filter-chip ${activeFilter===s.id?'active':''}" data-f="${s.id}">${s.emoji} ${s.name}</button>`).join('');
    c.querySelectorAll('.filter-chip').forEach(b => {
        b.onclick = () => { activeFilter = b.dataset.f || null; renderShopFilter(); renderList(); vibrate(); };
    });
};

const renderList = () => {
    const c = $('mainList');
    let list = activeFilter ? products.filter(p => p.shops?.includes(activeFilter)) : products;
    
    if (!list.length) {
        c.innerHTML = `<div class="empty"><div class="empty-icon">${activeFilter?'🏪':'🛒'}</div><h3>Lista vuota</h3><p>${activeFilter?'Nessun prodotto qui':'Scansiona o aggiungi un prodotto'}</p></div>`;
        return;
    }
    
    const groups = {};
    list.forEach(p => { const cat = p.category || 'other'; if (!groups[cat]) groups[cat] = []; groups[cat].push(p); });
    const order = categories.map(c => c.id);
    
    c.innerHTML = Object.keys(groups).sort((a,b) => order.indexOf(a) - order.indexOf(b)).map(catId => {
        const cat = categories.find(c => c.id === catId) || {emoji:'📦', name:'Altro'};
        return `<div class="category-group"><div class="category-header"><span>${cat.emoji}</span>${cat.name}</div>${groups[catId].map(p => renderProduct(p)).join('')}</div>`;
    }).join('');
    
    // Attach events
    c.querySelectorAll('.product').forEach(el => {
        const id = el.dataset.id;
        el.querySelector('.product-check').onclick = () => { toggleProduct(id); vibrate(); };
        el.querySelector('.product-main').onclick = () => openDetail(id);
        el.querySelector('.qty-minus').onclick = () => { updateQty(id, -1); vibrate(); };
        el.querySelector('.qty-plus').onclick = () => { updateQty(id, 1); vibrate(); };
    });
};

const renderProduct = p => {
    const cat = categories.find(c => c.id === p.category) || {emoji:'📦'};
    const shopBadges = (p.shops||[]).map(sid => shops.find(s=>s.id===sid)?.emoji||'').join(' ');
    return `<div class="product ${p.done?'checked':''}" data-id="${p.id}">
        <div class="product-check">${p.done?'✓':'○'}</div>
        <div class="product-main">
            <div class="product-name">${cat.emoji} ${p.name}</div>
            <div class="product-meta">${p.brand||''} ${shopBadges}</div>
        </div>
        <div class="product-qty">
            <button class="qty-btn qty-minus">−</button>
            <span class="qty-value">${p.qty}</span>
            <button class="qty-btn qty-plus">+</button>
        </div>
    </div>`;
};

const renderCategoryGrid = (sel='other') => {
    const c = $('categoryGrid');
    c.innerHTML = categories.map(cat => `<div class="category-item ${cat.id===sel?'selected':''}" data-id="${cat.id}"><span>${cat.emoji}</span><span>${cat.name}</span></div>`).join('');
    c.querySelectorAll('.category-item').forEach(el => {
        el.onclick = () => { c.querySelectorAll('.category-item').forEach(x => x.classList.remove('selected')); el.classList.add('selected'); vibrate(); };
    });
};

const renderShopGrid = (sel=[]) => {
    const c = $('shopGrid');
    if (!shops.length) { c.innerHTML = '<p class="hint">Nessun supermercato</p>'; return; }
    c.innerHTML = shops.map(s => `<div class="shop-item ${sel.includes(s.id)?'selected':''}" data-id="${s.id}"><span>${s.emoji}</span><span>${s.name}</span></div>`).join('');
    c.querySelectorAll('.shop-item').forEach(el => {
        el.onclick = () => { el.classList.toggle('selected'); vibrate(); };
    });
};

const renderShopSelectList = (sel=null) => {
    const c = $('shopSelectList');
    if (!shops.length) { c.innerHTML = '<p class="hint">Crea il tuo primo supermercato</p>'; return; }
    c.innerHTML = shops.map(s => `<div class="shop-select-item ${sel===s.id?'selected':''}" data-id="${s.id}"><span>${s.emoji}</span><span>${s.name}</span></div>`).join('');
    c.querySelectorAll('.shop-select-item').forEach(el => {
        el.onclick = () => { c.querySelectorAll('.shop-select-item').forEach(x => x.classList.remove('selected')); el.classList.add('selected'); vibrate(); };
    });
};

const getSelectedCategory = () => $('categoryGrid').querySelector('.selected')?.dataset.id || 'other';
const getSelectedShops = () => Array.from($('shopGrid').querySelectorAll('.shop-item.selected')).map(e => e.dataset.id);
const getSelectedShop = () => $('shopSelectList').querySelector('.shop-select-item.selected')?.dataset.id || null;

const renderEmojiPicker = (cid, sel, emojis, iid) => {
    const c = $(cid);
    c.innerHTML = emojis.map(e => `<button type="button" class="emoji-btn ${e===sel?'selected':''}" data-e="${e}">${e}</button>`).join('');
    c.querySelectorAll('.emoji-btn').forEach(b => {
        b.onclick = () => { c.querySelectorAll('.emoji-btn').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); $(iid).value = b.dataset.e; vibrate(); };
    });
};

// === Product Actions ===
const toggleProduct = async id => {
    const p = products.find(x => x.id === id);
    if (p) { p.done = !p.done; await dbPut('products', p); renderList(); }
};

const updateQty = async (id, d) => {
    const p = products.find(x => x.id === id);
    if (p) {
        if (p.qty + d < 1) {
            if (await confirm('Elimina', 'Rimuovere questo prodotto?', '🗑️', true)) {
                await dbDel('products', id);
                products = products.filter(x => x.id !== id);
                renderList();
                toast('Rimosso');
            }
        } else {
            p.qty += d;
            await dbPut('products', p);
            renderList();
        }
    }
};

const addProduct = async data => {
    const existing = products.find(p => p.name.toLowerCase() === data.name.toLowerCase() || (data.barcode && p.barcode === data.barcode));
    if (existing) {
        existing.qty += 1;
        if (data.shops?.length) existing.shops = [...new Set([...(existing.shops||[]), ...data.shops])];
        await dbPut('products', existing);
        toast(`${existing.name} +1`);
    } else {
        const p = { id: Date.now().toString(), name: data.name, brand: data.brand||'', category: data.category||'other', barcode: data.barcode||null, image: data.image||null, shops: data.shops||[], qty: 1, done: false };
        products.push(p);
        await dbPut('products', p);
        toast(`${p.name} aggiunto`);
        await addHistory(p);
    }
    renderList();
    renderShopFilter();
};

const addHistory = async p => {
    const item = { id: p.barcode || p.name.toLowerCase().replace(/\s+/g,'_'), name: p.name, brand: p.brand, category: p.category, barcode: p.barcode, image: p.image, shops: p.shops, lastUsed: Date.now() };
    await dbPut('history', item);
    history = history.filter(h => h.id !== item.id);
    history.unshift(item);
};

// === Scanner ===
const startScanner = async () => {
    if (scanner) try { await scanner.stop(); } catch(e) {}
    scanner = new Html5Qrcode('scannerView');
    try {
        await scanner.start({facingMode:'environment'}, {fps:10, qrbox:{width:250,height:100}}, onScan, ()=>{});
    } catch(e) { toast('Errore camera', 'error'); }
};

const stopScanner = async () => { if (scanner) { try { await scanner.stop(); } catch(e) {} scanner = null; } };

const onScan = async code => {
    vibrate();
    await stopScanner();
    closeModal('modalScanner');
    toast('Cerco...');
    
    const info = await fetchProduct(code);
    if (info) {
        pendingProduct = { name: info.name, brand: info.brand, category: info.category, barcode: code, image: info.image };
        $('productFound').innerHTML = `<div class="product-found-icon">${categories.find(c=>c.id===info.category)?.emoji||'📦'}</div><div class="product-found-info"><h4>${info.name}</h4><p>${info.brand||''}</p></div>`;
        renderShopSelectList(null);
        openModal('modalSelectShop');
    } else {
        openAddModal();
        toast('Prodotto non trovato, aggiungi manualmente');
    }
};

const fetchProduct = async barcode => {
    try {
        const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
        const d = await r.json();
        if (d.status === 1 && d.product) {
            const p = d.product;
            return { name: p.product_name || p.product_name_it || 'Sconosciuto', brand: p.brands||'', image: p.image_front_small_url||p.image_url||null, category: guessCategory(p) };
        }
    } catch(e) {}
    return null;
};

const guessCategory = p => {
    const c = (p.categories||'').toLowerCase();
    if (/lait|milk|latte|fromage|cheese|yogurt/.test(c)) return 'dairy';
    if (/fruit|vegetable|frutta|verdur/.test(c)) return 'fruit';
    if (/meat|carne|fish|pesce/.test(c)) return 'meat';
    if (/bread|pane|bakery/.test(c)) return 'bakery';
    if (/beverage|drink|bevand/.test(c)) return 'drinks';
    if (/frozen|surgel/.test(c)) return 'frozen';
    if (/snack|sweet|chocolate/.test(c)) return 'snacks';
    return 'other';
};

// === Detail ===
const openDetail = async id => {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const cat = categories.find(c => c.id === p.category) || {emoji:'📦', name:'Altro'};
    const c = $('detailContent');
    
    c.innerHTML = `<div class="detail-header"><div class="detail-img">${p.image?`<img src="${p.image}">`:(cat.emoji)}</div><div class="detail-info"><h3>${p.name}</h3><p>${p.brand||cat.name}</p></div></div><div class="loading"><div class="spinner"></div></div>`;
    openModal('modalDetail');
    
    if (p.barcode) {
        const api = await fetchFull(p.barcode);
        renderDetail(p, cat, api);
    } else {
        c.innerHTML = `<div class="detail-header"><div class="detail-img">${cat.emoji}</div><div class="detail-info"><h3>${p.name}</h3><p>${p.brand||''}</p></div></div><div class="no-data">Nessuna info aggiuntiva</div><button class="btn-outline" onclick="delProduct('${p.id}')" style="margin-top:20px;color:var(--danger)">🗑️ Elimina</button>`;
    }
};

const fetchFull = async barcode => {
    try { const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`); const d = await r.json(); return d.status===1 ? d.product : null; } catch(e) { return null; }
};

const renderDetail = (p, cat, api) => {
    let html = `<div class="detail-header"><div class="detail-img">${p.image?`<img src="${p.image}">`:(cat.emoji)}</div><div class="detail-info"><h3>${p.name}</h3><p>${p.brand||cat.name}</p>${p.barcode?`<small style="color:var(--text-3)">${p.barcode}</small>`:''}</div></div>`;
    
    if (!api) html += `<div class="no-data">Info non disponibili</div>`;
    else {
        const ns = api.nutriscore_grade || api.nutrition_grades;
        if (ns) html += `<div class="detail-section"><h4>📊 Qualità</h4><div class="nutri-row"><div class="nutri-score ${ns}">${ns.toUpperCase()}</div><div><strong>Nutri-Score</strong></div></div></div>`;
        
        const n = api.nutriments || {};
        const vals = [{l:'Energia',v:n['energy-kcal_100g'],u:'kcal'},{l:'Grassi',v:n.fat_100g,u:'g'},{l:'Carboidrati',v:n.carbohydrates_100g,u:'g'},{l:'Zuccheri',v:n.sugars_100g,u:'g'},{l:'Proteine',v:n.proteins_100g,u:'g'},{l:'Sale',v:n.salt_100g,u:'g'}].filter(x=>x.v!=null);
        if (vals.length) html += `<div class="detail-section"><h4>🍽️ Per 100g</h4><div class="nutrition-grid">${vals.map(x=>`<div class="nutrition-item"><small>${x.l}</small><strong>${Number(x.v).toFixed(1)}</strong> ${x.u}</div>`).join('')}</div></div>`;
        
        const allergens = api.allergens_tags || [];
        if (allergens.length) html += `<div class="detail-section"><h4>⚠️ Allergeni</h4><div class="tag-list">${allergens.map(a=>`<span class="tag">${a.replace(/^(en|it):/,'').replace(/-/g,' ')}</span>`).join('')}</div></div>`;
        
        const {quantity, serving_size} = api;
        if (quantity || serving_size) html += `<div class="detail-section"><h4>📦 Confezione</h4><div class="package-list">${quantity?`<div class="package-item"><span>Quantità</span><span>${quantity}</span></div>`:''}${serving_size?`<div class="package-item"><span>Porzione</span><span>${serving_size}</span></div>`:''}</div></div>`;
    }
    
    html += `<button class="btn-outline" onclick="delProduct('${p.id}')" style="margin-top:20px;color:var(--danger)">🗑️ Elimina</button>`;
    $('detailContent').innerHTML = html;
};

window.delProduct = async id => {
    if (await confirm('Elimina', 'Rimuovere questo prodotto?', '🗑️', true)) {
        closeModal('modalDetail');
        await dbDel('products', id);
        products = products.filter(x => x.id !== id);
        renderList();
        toast('Rimosso');
    }
};

// === Add Modal ===
const openAddModal = () => {
    $('formProduct').reset();
    renderCategoryGrid('other');
    renderShopGrid([]);
    openModal('modalAdd');
};

// === History ===
const renderHistory = () => {
    const c = $('historyList');
    if (!history.length) { c.innerHTML = '<div class="no-data">Nessun prodotto</div>'; return; }
    c.innerHTML = history.slice(0,30).map(h => {
        const cat = categories.find(c => c.id === h.category) || {emoji:'📦'};
        return `<div class="list-item" data-id="${h.id}"><span class="list-item-icon">${cat.emoji}</span><span class="list-item-text">${h.name}</span><span class="arrow">+</span></div>`;
    }).join('');
    c.querySelectorAll('.list-item').forEach(el => {
        el.onclick = async () => {
            const h = history.find(x => x.id === el.dataset.id);
            if (h) { await addProduct({...h}); closeModal('modalHistory'); }
        };
    });
};

// === Shops ===
const renderShopsList = () => {
    const c = $('shopsList');
    if (!shops.length) { c.innerHTML = '<div class="no-data">Nessun supermercato</div>'; return; }
    c.innerHTML = shops.map(s => `<div class="list-item" data-id="${s.id}"><span class="list-item-icon">${s.emoji}</span><span class="list-item-text">${s.name}</span><div class="list-item-actions"><button data-a="edit">✏️</button><button data-a="del">🗑️</button></div></div>`).join('');
    c.querySelectorAll('.list-item').forEach(el => {
        el.querySelector('[data-a="edit"]').onclick = e => { e.stopPropagation(); openEditShop(el.dataset.id); };
        el.querySelector('[data-a="del"]').onclick = async e => {
            e.stopPropagation();
            if (await confirm('Elimina', `Eliminare "${shops.find(s=>s.id===el.dataset.id)?.name}"?`, '🗑️', true)) {
                await dbDel('shops', el.dataset.id);
                shops = shops.filter(s => s.id !== el.dataset.id);
                renderShopsList();
                renderShopFilter();
                toast('Eliminato');
            }
        };
    });
};

const openEditShop = id => {
    const s = id ? shops.find(x => x.id === id) : null;
    $('editShopTitle').textContent = s ? 'Modifica' : 'Nuovo Supermercato';
    $('inputShopId').value = id || '';
    $('inputShopName').value = s?.name || '';
    $('inputShopEmoji').value = s?.emoji || '🛒';
    renderEmojiPicker('shopEmojiPicker', s?.emoji || '🛒', SHOP_EMOJIS, 'inputShopEmoji');
    closeModal('modalShops');
    closeModal('modalSelectShop');
    openModal('modalEditShop');
};

// === Init ===
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    try {
        await initDB();
        await loadData();
        renderShopFilter();
        renderList();
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
    } catch(e) { console.error(e); }
});

// === Events ===
$('overlay').onclick = closeAll;
document.querySelectorAll('.modal-close').forEach(b => { b.onclick = () => closeModal(b.dataset.close); });

$('btnScan').onclick = () => { openModal('modalScanner'); startScanner(); };
$('btnAdd').onclick = openAddModal;
$('btnSettings').onclick = () => openModal('modalSettings');

$('btnManualCode').onclick = async () => {
    await stopScanner();
    closeModal('modalScanner');
    const code = await prompt('Barcode', 'Inserisci il codice', 'es. 8001234567890');
    if (code?.trim()) {
        toast('Cerco...');
        const info = await fetchProduct(code.trim());
        if (info) {
            pendingProduct = { name: info.name, brand: info.brand, category: info.category, barcode: code.trim(), image: info.image };
            $('productFound').innerHTML = `<div class="product-found-icon">${categories.find(c=>c.id===info.category)?.emoji||'📦'}</div><div class="product-found-info"><h4>${info.name}</h4><p>${info.brand||''}</p></div>`;
            renderShopSelectList(null);
            openModal('modalSelectShop');
        } else {
            openAddModal();
            toast('Non trovato, aggiungi manualmente');
        }
    }
};

$('btnNewShopInSelect').onclick = () => openEditShop(null);

$('btnConfirmAdd').onclick = async () => {
    if (!pendingProduct) return;
    const shopId = getSelectedShop();
    await addProduct({ ...pendingProduct, shops: shopId ? [shopId] : [] });
    pendingProduct = null;
    closeModal('modalSelectShop');
};

$('formProduct').onsubmit = async e => {
    e.preventDefault();
    const name = $('inputName').value.trim();
    if (!name) return;
    await addProduct({ name, brand: $('inputBrand').value.trim(), category: getSelectedCategory(), shops: getSelectedShops() });
    closeModal('modalAdd');
};

$('btnAddShopInForm').onclick = () => { closeModal('modalAdd'); openEditShop(null); };

$('btnTheme').onclick = toggleTheme;
$('btnShops').onclick = () => { closeModal('modalSettings'); renderShopsList(); openModal('modalShops'); };
$('btnHistory').onclick = () => { closeModal('modalSettings'); renderHistory(); openModal('modalHistory'); };
$('btnClearDone').onclick = async () => {
    const done = products.filter(p => p.done);
    if (!done.length) { toast('Nessuno'); return; }
    if (await confirm('Rimuovi', `Eliminare ${done.length} prodotti?`, '✨')) {
        for (const p of done) await dbDel('products', p.id);
        products = products.filter(p => !p.done);
        renderList();
        closeModal('modalSettings');
        toast('Rimossi');
    }
};
$('btnClearAll').onclick = async () => {
    if (!products.length) { toast('Già vuota'); return; }
    if (await confirm('Svuota', 'Eliminare tutto?', '🗑️', true)) {
        await dbClear('products');
        products = [];
        renderList();
        closeModal('modalSettings');
        toast('Svuotata');
    }
};

$('btnNewShop').onclick = () => openEditShop(null);
$('formShop').onsubmit = async e => {
    e.preventDefault();
    const name = $('inputShopName').value.trim();
    if (!name) return;
    const id = $('inputShopId').value || name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const shop = { id, name, emoji: $('inputShopEmoji').value || '🛒' };
    await dbPut('shops', shop);
    const idx = shops.findIndex(s => s.id === id);
    if (idx >= 0) shops[idx] = shop; else shops.push(shop);
    closeModal('modalEditShop');
    renderShopFilter();
    
    // Se stavamo selezionando il supermercato per un prodotto scansionato
    if (pendingProduct) {
        renderShopSelectList(id);
        openModal('modalSelectShop');
    } else {
        renderShopsList();
        openModal('modalShops');
    }
    toast('Salvato');
};
