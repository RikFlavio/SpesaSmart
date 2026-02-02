const DB='SpesaSmartDB',VER=1;
const CATS=[{id:'dairy',name:'Latte',emoji:'🥛'},{id:'fruit',name:'Frutta',emoji:'🍎'},{id:'meat',name:'Carne',emoji:'🥩'},{id:'bakery',name:'Pane',emoji:'🥖'},{id:'drinks',name:'Bevande',emoji:'🥤'},{id:'frozen',name:'Surgelati',emoji:'🧊'},{id:'snacks',name:'Snack',emoji:'🍪'},{id:'household',name:'Casa',emoji:'🧴'},{id:'other',name:'Altro',emoji:'📦'}];
const EMOJIS=['🛒','🏪','🏬','🛍️','💰','⭐','🔵','🟢','🔴','🟡','🟠','🟣','🌿','💎'];
let db,products=[],cats=[],shops=[],filter=null,theme='dark',scanner=null,pending=null;

// DB
const initDB=()=>new Promise((res,rej)=>{const r=indexedDB.open(DB,VER);r.onerror=()=>rej();r.onsuccess=()=>{db=r.result;res()};r.onupgradeneeded=e=>{const d=e.target.result;['products','cats','shops'].forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'})});}});
const dbAll=s=>new Promise(r=>{const req=db.transaction(s).objectStore(s).getAll();req.onsuccess=()=>r(req.result||[]);req.onerror=()=>r([])});
const dbPut=(s,i)=>new Promise(r=>{const tx=db.transaction(s,'readwrite');tx.objectStore(s).put(i);tx.oncomplete=r});
const dbDel=(s,id)=>new Promise(r=>{const tx=db.transaction(s,'readwrite');tx.objectStore(s).delete(id);tx.oncomplete=r});
const dbClear=s=>new Promise(r=>{const tx=db.transaction(s,'readwrite');tx.objectStore(s).clear();tx.oncomplete=r});

const load=async()=>{products=await dbAll('products');shops=await dbAll('shops');cats=[...CATS]};

// Theme
const initTheme=()=>{theme=localStorage.getItem('t')||(matchMedia('(prefers-color-scheme:light)').matches?'light':'dark');applyTheme()};
const applyTheme=()=>{document.documentElement.dataset.theme=theme;const m=$('metaTheme');if(m)m.content=theme==='light'?'#f2f2f7':'#22c55e';$('themeIcon').textContent=theme==='light'?'☀️':'🌙';$('themeName').textContent=theme==='light'?'Tema Chiaro':'Tema Scuro'};
const toggleTheme=()=>{theme=theme==='dark'?'light':'dark';localStorage.setItem('t',theme);applyTheme()};

// UI
const $=id=>document.getElementById(id);
const show=id=>$(id)?.classList.add('active');
const hide=id=>$(id)?.classList.remove('active');
const open=id=>{show('overlay');show(id)};
const close=id=>{hide('overlay');hide(id);if(id==='modalScanner')stopScan()};
const closeAll=()=>{hide('overlay');document.querySelectorAll('.modal.active').forEach(m=>m.classList.remove('active'));stopScan()};
const toast=m=>{const t=$('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2000)};
const vib=()=>navigator.vibrate?.(10);

// Dialog
const dialog=(msg,input=false)=>new Promise(res=>{$('dialogMsg').textContent=msg;const inp=$('dialogInput');inp.className=input?'show':'';inp.value='';show('dialog');const done=v=>{hide('dialog');res(v)};$('dialogYes').onclick=()=>done(input?inp.value:true);$('dialogNo').onclick=()=>done(null)});

// Render
const renderFilters=()=>{const c=$('filters');if(!shops.length){c.innerHTML='';return}c.innerHTML=`<button class="chip ${!filter?'active':''}" data-f="">Tutti</button>`+shops.map(s=>`<button class="chip ${filter===s.id?'active':''}" data-f="${s.id}">${s.emoji} ${s.name}</button>`).join('');c.querySelectorAll('.chip').forEach(b=>{b.onclick=()=>{filter=b.dataset.f||null;renderFilters();renderList();vib()}})};

const renderList=()=>{const c=$('main');let list=filter?products.filter(p=>p.shops?.includes(filter)):products;
if(!list.length){c.innerHTML=`<div class="empty"><span>🛒</span>Lista vuota</div>`;return}
const g={};list.forEach(p=>{const cat=p.cat||'other';if(!g[cat])g[cat]=[];g[cat].push(p)});
const ord=cats.map(x=>x.id);
c.innerHTML=Object.keys(g).sort((a,b)=>ord.indexOf(a)-ord.indexOf(b)).map(cid=>{const cat=cats.find(x=>x.id===cid)||{emoji:'📦',name:'Altro'};return`<div class="cat-group"><div class="cat-head">${cat.emoji} ${cat.name}</div>${g[cid].map(p=>`<div class="item ${p.done?'done':''}" data-id="${p.id}"><div class="item-check">${p.done?'✓':'○'}</div><div class="item-name">${p.name}</div><div class="item-qty"><button class="qty-btn m">−</button><span class="qty-val">${p.qty}</span><button class="qty-btn p">+</button></div></div>`).join('')}</div>`}).join('');
c.querySelectorAll('.item').forEach(el=>{const id=el.dataset.id;el.querySelector('.item-check').onclick=()=>{toggle(id);vib()};el.querySelector('.item-name').onclick=()=>openDetail(id);el.querySelector('.m').onclick=()=>{updateQty(id,-1);vib()};el.querySelector('.p').onclick=()=>{updateQty(id,1);vib()}})};

const renderCatGrid=(cid,sel='other')=>{const c=$(cid);if(!c)return;const list=cats.length?cats:CATS;c.innerHTML=list.map(x=>`<div class="cat-item ${x.id===sel?'sel':''}" data-id="${x.id}">${x.emoji}<span>${x.name}</span></div>`).join('');c.querySelectorAll('.cat-item').forEach(el=>{el.onclick=()=>{c.querySelectorAll('.cat-item').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');vib()}})};

const renderShopGrid=(cid,sel=[])=>{const c=$(cid);if(!shops.length){c.innerHTML='<span class="no-data">Nessun supermercato</span>';return}c.innerHTML=shops.map(s=>`<div class="shop-item ${sel.includes(s.id)?'sel':''}" data-id="${s.id}">${s.emoji} ${s.name}</div>`).join('');c.querySelectorAll('.shop-item').forEach(el=>{el.onclick=()=>{el.classList.toggle('sel');vib()}})};

const getSelCat=cid=>$(cid).querySelector('.cat-item.sel')?.dataset.id||'other';
const getSelShops=cid=>Array.from($(cid).querySelectorAll('.shop-item.sel')).map(e=>e.dataset.id);

const renderEmojiGrid=sel=>{const c=$('emojiGrid');c.innerHTML=EMOJIS.map(e=>`<button type="button" class="emoji-btn ${e===sel?'sel':''}" data-e="${e}">${e}</button>`).join('');c.querySelectorAll('.emoji-btn').forEach(b=>{b.onclick=()=>{c.querySelectorAll('.emoji-btn').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');$('inputShopEmoji').value=b.dataset.e;vib()}})};

// Actions
const toggle=async id=>{const p=products.find(x=>x.id===id);if(p){p.done=!p.done;await dbPut('products',p);renderList()}};
const updateQty=async(id,d)=>{const p=products.find(x=>x.id===id);if(p){if(p.qty+d<1){if(await dialog('Eliminare?')){await dbDel('products',id);products=products.filter(x=>x.id!==id);renderList();toast('Rimosso')}}else{p.qty+=d;await dbPut('products',p);renderList()}}};
const addProduct=async d=>{const ex=products.find(p=>p.name.toLowerCase()===d.name.toLowerCase()||(d.barcode&&p.barcode===d.barcode));if(ex){ex.qty++;if(d.shops?.length)ex.shops=[...new Set([...(ex.shops||[]),...d.shops])];await dbPut('products',ex);toast(ex.name+' +1')}else{const p={id:Date.now()+'',name:d.name,cat:d.cat||'other',barcode:d.barcode||null,image:d.image||null,shops:d.shops||[],qty:1,done:false};products.push(p);await dbPut('products',p);toast(p.name+' aggiunto')}renderList();renderFilters()};

// Scanner
const startScan=async()=>{if(scanner)try{await scanner.stop()}catch(e){}scanner=new Html5Qrcode('scannerView');try{await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:100}},onScan,()=>{})}catch(e){toast('Errore camera')}};
const stopScan=async()=>{if(scanner){try{await scanner.stop()}catch(e){}scanner=null}};
const onScan=async code=>{vib();await stopScan();close('modalScanner');toast('Cerco...');const info=await fetchProduct(code);if(info){pending={name:info.name,brand:info.brand,cat:info.cat,barcode:code,image:info.image};$('found').innerHTML=`<div class="found-name">${info.name}</div><div class="found-brand">${info.brand||''}</div>`;renderCatGrid('catGrid',info.cat);renderShopGrid('shopGrid',[]);open('modalConfirm')}else{openAddModal()}};
const fetchProduct=async bc=>{try{const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${bc}.json`);const d=await r.json();if(d.status===1&&d.product){const p=d.product;return{name:p.product_name||p.product_name_it||'Sconosciuto',brand:p.brands||'',image:p.image_front_small_url||p.image_url||null,cat:guessCat(p)}}}catch(e){}return null};
const guessCat=p=>{const c=(p.categories||'').toLowerCase();if(/lait|milk|latte|cheese|yogurt/.test(c))return'dairy';if(/fruit|vegetable|frutta|verdur/.test(c))return'fruit';if(/meat|carne|fish|pesce/.test(c))return'meat';if(/bread|pane|bakery/.test(c))return'bakery';if(/beverage|drink|bevand/.test(c))return'drinks';if(/frozen|surgel/.test(c))return'frozen';if(/snack|sweet|chocolate/.test(c))return'snacks';return'other'};

// Detail
const openDetail=async id=>{const p=products.find(x=>x.id===id);if(!p)return;const cat=cats.find(x=>x.id===p.cat)||{emoji:'📦'};$('detailBody').innerHTML=`<div class="detail-head"><div class="detail-img">${p.image?`<img src="${p.image}">`:(cat.emoji)}</div><div class="detail-info"><h3>${p.name}</h3><p>${p.barcode||''}</p></div></div><div class="no-data">Caricamento...</div>`;open('modalDetail');if(p.barcode){const api=await fetchFull(p.barcode);renderDetail(p,cat,api)}else{$('detailBody').innerHTML=`<div class="detail-head"><div class="detail-img">${cat.emoji}</div><div class="detail-info"><h3>${p.name}</h3></div></div><button class="btn-outline" onclick="delProd('${p.id}')">🗑️ Elimina</button>`}};
const fetchFull=async bc=>{try{const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${bc}.json`);const d=await r.json();return d.status===1?d.product:null}catch(e){return null}};
const renderDetail=(p,cat,api)=>{let h=`<div class="detail-head"><div class="detail-img">${p.image?`<img src="${p.image}">`:(cat.emoji)}</div><div class="detail-info"><h3>${p.name}</h3><p>${p.barcode||''}</p></div></div>`;if(api){const ns=api.nutriscore_grade||api.nutrition_grades;if(ns)h+=`<div class="detail-section"><h4>Qualità</h4><div class="nutri-row"><div class="nutri-badge ${ns}">${ns.toUpperCase()}</div><span>Nutri-Score</span></div></div>`;const n=api.nutriments||{};const vals=[{l:'Energia',v:n['energy-kcal_100g'],u:'kcal'},{l:'Grassi',v:n.fat_100g,u:'g'},{l:'Carboidrati',v:n.carbohydrates_100g,u:'g'},{l:'Proteine',v:n.proteins_100g,u:'g'}].filter(x=>x.v!=null);if(vals.length)h+=`<div class="detail-section"><h4>Per 100g</h4><div class="info-grid">${vals.map(x=>`<div class="info-item"><small>${x.l}</small><strong>${Number(x.v).toFixed(0)} ${x.u}</strong></div>`).join('')}</div></div>`;const al=api.allergens_tags||[];if(al.length)h+=`<div class="detail-section"><h4>Allergeni</h4><div class="tags">${al.map(a=>`<span class="tag">${a.replace(/^(en|it):/,'').replace(/-/g,' ')}</span>`).join('')}</div></div>`;const{quantity,serving_size}=api;if(quantity||serving_size)h+=`<div class="detail-section"><h4>Confezione</h4>${quantity?`<div class="pkg-row"><span>Quantità</span><span>${quantity}</span></div>`:''}${serving_size?`<div class="pkg-row"><span>Porzione</span><span>${serving_size}</span></div>`:''}</div>`}h+=`<button class="btn-outline" onclick="delProd('${p.id}')">🗑️ Elimina</button>`;$('detailBody').innerHTML=h};
window.delProd=async id=>{if(await dialog('Eliminare?')){close('modalDetail');await dbDel('products',id);products=products.filter(x=>x.id!==id);renderList();toast('Rimosso')}};

// Add modal
const openAddModal=()=>{$('formAdd').reset();renderCatGrid('catGridAdd','other');renderShopGrid('shopGridAdd',[]);open('modalAdd');toast('Non trovato, aggiungi manualmente')};

// Shops
const renderShopsList=()=>{const c=$('shopsList');if(!shops.length){c.innerHTML='<div class="no-data">Nessun supermercato</div>';return}c.innerHTML=shops.map(s=>`<div class="shop-row" data-id="${s.id}"><span>${s.emoji} ${s.name}</span><button data-a="edit">✏️</button><button data-a="del">🗑️</button></div>`).join('');c.querySelectorAll('.shop-row').forEach(el=>{el.querySelector('[data-a="edit"]').onclick=e=>{e.stopPropagation();openEditShop(el.dataset.id)};el.querySelector('[data-a="del"]').onclick=async e=>{e.stopPropagation();if(await dialog('Eliminare?')){await dbDel('shops',el.dataset.id);shops=shops.filter(s=>s.id!==el.dataset.id);renderShopsList();renderFilters();toast('Eliminato')}}})};
const openEditShop=id=>{const s=id?shops.find(x=>x.id===id):null;$('editShopTitle').textContent=s?'Modifica':'Nuovo';$('inputShopId').value=id||'';$('inputShopName').value=s?.name||'';$('inputShopEmoji').value=s?.emoji||'🛒';renderEmojiGrid(s?.emoji||'🛒');close('modalShops');close('modalConfirm');close('modalAdd');open('modalEditShop')};

// Export/Import
const exportData=()=>{const d={v:1,date:new Date().toISOString(),products,cats,shops};const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`spesasmart-${new Date().toISOString().split('T')[0]}.json`;a.click();toast('Esportato')};
const importData=async f=>{try{const d=JSON.parse(await f.text());if(!d.products)throw 0;await dbClear('products');for(const p of d.products)await dbPut('products',p);if(d.cats){await dbClear('cats');for(const c of d.cats)await dbPut('cats',c)}if(d.shops){await dbClear('shops');for(const s of d.shops)await dbPut('shops',s)}await load();renderFilters();renderList();closeAll();toast('Importato')}catch(e){toast('Errore')}};

// Init
document.addEventListener('DOMContentLoaded',async()=>{initTheme();try{await initDB();await load();renderFilters();renderList();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{})}catch(e){console.error(e)}});

// Events
$('overlay').onclick=closeAll;
document.querySelectorAll('.close').forEach(b=>{b.onclick=()=>close(b.dataset.close)});
$('btnScan').onclick=()=>{open('modalScanner');startScan()};
$('btnSettings').onclick=()=>open('modalSettings');
$('btnManual').onclick=async()=>{await stopScan();close('modalScanner');const code=await dialog('Inserisci codice',true);if(code?.trim()){toast('Cerco...');const info=await fetchProduct(code.trim());if(info){pending={name:info.name,brand:info.brand,cat:info.cat,barcode:code.trim(),image:info.image};$('found').innerHTML=`<div class="found-name">${info.name}</div><div class="found-brand">${info.brand||''}</div>`;renderCatGrid('catGrid',info.cat);renderShopGrid('shopGrid',[]);open('modalConfirm')}else{openAddModal()}}};
$('btnConfirmAdd').onclick=async()=>{if(!pending)return;await addProduct({...pending,cat:getSelCat('catGrid'),shops:getSelShops('shopGrid')});pending=null;close('modalConfirm')};
$('btnNewShopConfirm').onclick=()=>openEditShop(null);
$('formAdd').onsubmit=async e=>{e.preventDefault();const name=$('inputName').value.trim();if(!name)return;await addProduct({name,cat:getSelCat('catGridAdd'),shops:getSelShops('shopGridAdd')});close('modalAdd')};
$('btnNewShopAdd').onclick=()=>openEditShop(null);
$('btnTheme').onclick=toggleTheme;
$('btnShops').onclick=()=>{close('modalSettings');renderShopsList();open('modalShops')};
$('btnAddManual').onclick=()=>{close('modalSettings');$('formAdd').reset();renderCatGrid('catGridAdd','other');renderShopGrid('shopGridAdd',[]);open('modalAdd')};
$('btnExport').onclick=exportData;
$('inputImport').onchange=e=>{if(e.target.files[0]){importData(e.target.files[0]);e.target.value=''}};
$('btnClearDone').onclick=async()=>{const done=products.filter(p=>p.done);if(!done.length){toast('Nessuno');return}if(await dialog(`Eliminare ${done.length} prodotti?`)){for(const p of done)await dbDel('products',p.id);products=products.filter(p=>!p.done);renderList();close('modalSettings');toast('Rimossi')}};
$('btnClearAll').onclick=async()=>{if(!products.length){toast('Già vuota');return}if(await dialog('Eliminare tutto?')){await dbClear('products');products=[];renderList();close('modalSettings');toast('Svuotata')}};
$('btnNewShop').onclick=()=>openEditShop(null);
$('formShop').onsubmit=async e=>{e.preventDefault();const name=$('inputShopName').value.trim();if(!name)return;const id=$('inputShopId').value||name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');const shop={id,name,emoji:$('inputShopEmoji').value||'🛒'};await dbPut('shops',shop);const idx=shops.findIndex(s=>s.id===id);if(idx>=0)shops[idx]=shop;else shops.push(shop);close('modalEditShop');renderFilters();if(pending){renderShopGrid('shopGrid',[id]);open('modalConfirm')}else{renderShopsList();open('modalShops')}toast('Salvato')};
