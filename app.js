const DB='SpesaSmartDB',VER=2;
const CATS=[
    {id:'dairy',name:'Latte',emoji:'🥛'},
    {id:'fruit',name:'Frutta',emoji:'🍎'},
    {id:'meat',name:'Carne',emoji:'🥩'},
    {id:'bakery',name:'Pane',emoji:'🥖'},
    {id:'drinks',name:'Bevande',emoji:'🥤'},
    {id:'frozen',name:'Surgelati',emoji:'🧊'},
    {id:'snacks',name:'Snack',emoji:'🍪'},
    {id:'household',name:'Casa',emoji:'🧴'},
    {id:'other',name:'Altro',emoji:'📦'}
];
const EMOJIS=['🛒','🏪','🏬','🛍️','💰','⭐','🔵','🟢','🔴','🟡','🟠','🟣','🌿','💎'];
const CAT_EMOJIS=['🥛','🍎','🥩','🥖','🥤','🧊','🍪','🧴','📦','🍕','🍝','🥗','🧀','🥚','🍺','🍷','☕','🧹','💊','🐱','🐶','👶','🌶️','🍯','🥜','🍫','🎂','🍿','🥫','🧈'];

let db,products=[],shops=[],cats=[...CATS],theme='dark',scanner=null;

// DB
const initDB=()=>new Promise((res,rej)=>{
    const r=indexedDB.open(DB,VER);
    r.onerror=()=>rej();
    r.onsuccess=()=>{db=r.result;res()};
    r.onupgradeneeded=e=>{
        const d=e.target.result;
        if(!d.objectStoreNames.contains('products'))d.createObjectStore('products',{keyPath:'id'});
        if(!d.objectStoreNames.contains('shops'))d.createObjectStore('shops',{keyPath:'id'});
        if(!d.objectStoreNames.contains('cats'))d.createObjectStore('cats',{keyPath:'id'});
    };
});
const dbAll=s=>new Promise(r=>{const req=db.transaction(s).objectStore(s).getAll();req.onsuccess=()=>r(req.result||[]);req.onerror=()=>r([])});
const dbPut=(s,i)=>new Promise(r=>{const tx=db.transaction(s,'readwrite');tx.objectStore(s).put(i);tx.oncomplete=r});
const dbDel=(s,id)=>new Promise(r=>{const tx=db.transaction(s,'readwrite');tx.objectStore(s).delete(id);tx.oncomplete=r});
const dbClear=s=>new Promise(r=>{const tx=db.transaction(s,'readwrite');tx.objectStore(s).clear();tx.oncomplete=r});
const load=async()=>{
    products=await dbAll('products');
    shops=await dbAll('shops');
    const customCats=await dbAll('cats');
    cats=[...CATS,...customCats];
};

// Theme
const initTheme=()=>{theme=localStorage.getItem('t')||(matchMedia('(prefers-color-scheme:light)').matches?'light':'dark');applyTheme()};
const applyTheme=()=>{document.documentElement.dataset.theme=theme;$('themeIcon').textContent=theme==='light'?'☀️':'🌙';$('themeName').textContent=theme==='light'?'Tema Chiaro':'Tema Scuro'};
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
const dialog=(msg,input=false)=>new Promise(res=>{
    $('dialogMsg').textContent=msg;
    const inp=$('dialogInput');inp.className=input?'show':'';inp.value='';
    show('dialog');
    $('dialogYes').onclick=()=>{hide('dialog');res(input?inp.value:true)};
    $('dialogNo').onclick=()=>{hide('dialog');res(null)};
});

// Render List
const renderList=()=>{
    const c=$('main');
    const search=$('inpSearch').value.toLowerCase().trim();
    const catFilter=$('selCat').value;
    
    // Filtra e ordina A-Z
    let list=products
        .filter(p=>{
            if(search&&!p.name.toLowerCase().includes(search))return false;
            if(catFilter&&p.cat!==catFilter)return false;
            return true;
        })
        .sort((a,b)=>a.name.localeCompare(b.name,'it'));
    
    if(!products.length){
        c.innerHTML='<div class="empty"><span>🛒</span>Lista vuota<br>Scansiona o aggiungi un prodotto</div>';
        return;
    }
    
    if(!list.length){
        c.innerHTML='<div class="empty"><span>🔍</span>Nessun risultato</div>';
        return;
    }
    
    c.innerHTML=list.map(p=>`
        <div class="item ${p.done?'done':''}" data-id="${p.id}">
            <div class="item-check">${p.done?'✓':'○'}</div>
            <div class="item-name">${p.name}</div>
            <div class="item-qty">
                <button class="qty-btn qm">−</button>
                <span class="qty-val">${p.qty}</span>
                <button class="qty-btn qp">+</button>
            </div>
        </div>
    `).join('');
    c.querySelectorAll('.item').forEach(el=>{
        const id=el.dataset.id;
        el.querySelector('.item-check').onclick=()=>{toggleDone(id);vib()};
        el.querySelector('.item-name').onclick=()=>openDetail(id);
        el.querySelector('.qm').onclick=()=>{updateQty(id,-1);vib()};
        el.querySelector('.qp').onclick=()=>{updateQty(id,1);vib()};
    });
};

// Popola select categorie
const renderCatSelect=()=>{
    const sel=$('selCat');
    sel.innerHTML='<option value="">Tutte</option>'+cats.map(c=>`<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');
};

// Product Actions
const toggleDone=async id=>{const p=products.find(x=>x.id===id);if(p){p.done=!p.done;await dbPut('products',p);renderList()}};
const updateQty=async(id,d)=>{
    const p=products.find(x=>x.id===id);
    if(!p)return;
    if(p.qty+d<1){
        if(await dialog('Eliminare questo prodotto?')){
            await dbDel('products',id);
            products=products.filter(x=>x.id!==id);
            renderList();toast('Rimosso');
        }
    }else{
        p.qty+=d;
        await dbPut('products',p);
        renderList();
    }
};

// Category Grid
const renderCatGrid=(sel='other')=>{
    const c=$('catGrid');
    c.innerHTML=cats.map(x=>`<div class="cat-item ${x.id===sel?'sel':''}" data-id="${x.id}">${x.emoji}<span>${x.name}</span></div>`).join('');
    c.querySelectorAll('.cat-item').forEach(el=>{
        el.onclick=()=>{c.querySelectorAll('.cat-item').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');vib()};
    });
};

// Shop Grid
const renderShopGrid=(sel=[])=>{
    const c=$('shopGrid');
    if(!shops.length){c.innerHTML='<span class="no-data">Nessun supermercato</span>';return}
    c.innerHTML=shops.map(s=>`<div class="shop-chip ${sel.includes(s.id)?'sel':''}" data-id="${s.id}">${s.emoji} ${s.name}</div>`).join('');
    c.querySelectorAll('.shop-chip').forEach(el=>{el.onclick=()=>{el.classList.toggle('sel');vib()}});
};
const getSelCat=()=>$('catGrid').querySelector('.cat-item.sel')?.dataset.id||'other';
const getSelShops=()=>Array.from($('shopGrid').querySelectorAll('.shop-chip.sel')).map(e=>e.dataset.id);

// Open Product Form (new or edit)
const openProductForm=(data={})=>{
    $('modalProductTitle').textContent=data.id?'Modifica Prodotto':'Nuovo Prodotto';
    $('inpId').value=data.id||'';
    $('inpName').value=data.name||'';
    $('inpBarcode').value=data.barcode||'';
    $('inpImage').value=data.image||'';
    renderCatGrid(data.cat||'other');
    renderShopGrid(data.shops||[]);
    $('btnSaveProduct').textContent=data.id?'Salva':'Aggiungi';
    open('modalProduct');
};

// Save Product
const saveProduct=async()=>{
    const id=$('inpId').value;
    const name=$('inpName').value.trim();
    if(!name)return;
    
    const data={
        id:id||Date.now().toString(),
        name,
        cat:getSelCat(),
        shops:getSelShops(),
        barcode:$('inpBarcode').value||null,
        image:$('inpImage').value||null,
        prices:{},
        qty:1,
        done:false
    };
    
    if(id){
        // Edit existing
        const p=products.find(x=>x.id===id);
        if(p){
            p.name=data.name;
            p.cat=data.cat;
            p.shops=data.shops;
            await dbPut('products',p);
        }
    }else{
        // Check duplicate
        const ex=products.find(p=>p.name.toLowerCase()===name.toLowerCase()||(data.barcode&&p.barcode===data.barcode));
        if(ex){
            ex.qty++;
            if(data.shops.length)ex.shops=[...new Set([...ex.shops,...data.shops])];
            await dbPut('products',ex);
            toast(ex.name+' +1');
        }else{
            products.push(data);
            await dbPut('products',data);
            toast(data.name+' aggiunto');
        }
    }
    close('modalProduct');
    renderList();
};

// Detail
const openDetail=async id=>{
    window.currentDetailProdId=id;
    const p=products.find(x=>x.id===id);
    if(!p)return;
    const cat=CATS.find(c=>c.id===p.cat)||{emoji:'📦',name:'Altro'};
    
    let h=`
    <div class="detail-section">
        <h4>📦 Prodotto</h4>
        <div class="detail-edit-row">
            <input type="text" id="editName" value="${p.name}" class="edit-input" placeholder="Nome prodotto">
            <button onclick="saveName('${p.id}')">💾</button>
        </div>
        <div class="detail-edit-row" style="margin-top:8px">
            <input type="text" id="editBarcode" value="${p.barcode||''}" class="edit-input" placeholder="Barcode (opzionale)">
            <button onclick="saveBarcode('${p.id}')">💾</button>
            <button onclick="scanBarcode('${p.id}')" title="Scansiona">📷</button>
        </div>
    </div>
    
    <div class="detail-section">
        <h4>🏷️ Categoria</h4>
        <div class="cat-grid-small" id="detailCatGrid"></div>
        <button class="btn-link" onclick="addCatFromDetail()">+ Nuova categoria</button>
    </div>
    
    <div class="detail-section">
        <h4>💰 Prezzi per Supermercato</h4>
        <table class="price-table">
            <thead><tr><th>Supermercato</th><th>Prezzo</th><th></th></tr></thead>
            <tbody id="priceTableBody">`;
    
    // Righe prezzi
    const prices=p.prices||{};
    if(shops.length){
        shops.forEach(s=>{
            const price=prices[s.id];
            h+=`<tr>
                <td>${s.emoji} ${s.name}</td>
                <td><input type="text" class="price-input" data-shop="${s.id}" value="${price?price.toFixed(2):''}" placeholder="—"></td>
                <td><button class="price-save" onclick="savePrice('${p.id}','${s.id}')">💾</button></td>
            </tr>`;
        });
    }
    
    h+=`</tbody></table>
        <button class="btn-link" onclick="addShopFromDetail('${p.id}')">+ Aggiungi supermercato</button>
    </div>`;
    
    // Info nutrizionali
    if(p.barcode){
        h+=`<div class="detail-section" id="nutriSection"><h4>📊 Info Nutrizionali</h4><div class="no-data">Caricamento...</div></div>`;
    }
    
    h+=`<button class="btn-outline" onclick="delProduct('${p.id}')" style="color:var(--danger);margin-top:16px">🗑️ Elimina Prodotto</button>`;
    
    $('detailBody').innerHTML=h;
    
    // Render categoria selezionabile
    renderDetailCatGrid(p.id,p.cat);
    
    open('modalDetail');
    
    // Carica info nutrizionali
    if(p.barcode){
        const api=await fetchAPI(p.barcode);
        renderNutri(api);
    }
};

// Salva nome
window.saveName=async id=>{
    const p=products.find(x=>x.id===id);
    if(!p)return;
    const name=$('editName').value.trim();
    if(!name){toast('Nome obbligatorio');return}
    p.name=name;
    await dbPut('products',p);
    renderList();
    toast('Nome salvato');
};

// Salva barcode
window.saveBarcode=async id=>{
    const p=products.find(x=>x.id===id);
    if(!p)return;
    const barcode=$('editBarcode').value.trim();
    p.barcode=barcode||null;
    p.image=null; // Reset immagine, verrà ricaricata
    await dbPut('products',p);
    renderList();
    toast('Barcode salvato');
    // Ricarica dettaglio per mostrare info nutrizionali
    openDetail(id);
};

// Scansiona barcode per prodotto esistente
window.scanBarcode=id=>{
    window.scanForProductId=id;
    close('modalDetail');
    open('modalScanner');
    startScan();
};

// Salva prezzo
window.savePrice=async(id,shopId)=>{
    const p=products.find(x=>x.id===id);
    if(!p)return;
    const input=document.querySelector(`.price-input[data-shop="${shopId}"]`);
    const val=input.value.trim().replace(',','.');
    
    if(!p.prices)p.prices={};
    
    if(!val){
        delete p.prices[shopId];
    }else{
        const num=parseFloat(val);
        if(isNaN(num)||num<0){toast('Prezzo non valido');return}
        p.prices[shopId]=num;
    }
    
    await dbPut('products',p);
    toast('Prezzo salvato');
};

// Categoria nel dettaglio
const renderDetailCatGrid=(prodId,sel)=>{
    const c=$('detailCatGrid');
    c.innerHTML=cats.map(x=>`<div class="cat-item-small ${x.id===sel?'sel':''}" data-id="${x.id}" data-prod="${prodId}">${x.emoji}<span>${x.name}</span></div>`).join('');
    c.querySelectorAll('.cat-item-small').forEach(el=>{
        el.onclick=async()=>{
            const p=products.find(x=>x.id===el.dataset.prod);
            if(p){
                p.cat=el.dataset.id;
                await dbPut('products',p);
                c.querySelectorAll('.cat-item-small').forEach(x=>x.classList.remove('sel'));
                el.classList.add('sel');
                renderList();
                vib();
                toast('Categoria salvata');
            }
        };
    });
};

// Aggiungi categoria dal dettaglio
window.addCatFromDetail=()=>{
    window.pendingDetailProdId=window.currentDetailProdId;
    openEditCat(null);
};

// Aggiungi supermercato dal dettaglio
window.addShopFromDetail=prodId=>{
    window.pendingDetailProdId=prodId;
    openEditShop(null);
};

const fetchAPI=async bc=>{
    try{
        const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${bc}.json`);
        const d=await r.json();
        return d.status===1?d.product:null;
    }catch(e){return null}
};

const renderNutri=api=>{
    const c=$('nutriSection');
    if(!c)return;
    if(!api){c.innerHTML='<h4>📊 Info Nutrizionali</h4><div class="no-data">Non disponibili</div>';return}
    
    let h='<h4>📊 Info Nutrizionali</h4>';
    const ns=api.nutriscore_grade||api.nutrition_grades;
    if(ns)h+=`<div class="nutri-row"><div class="nutri-badge ${ns}">${ns.toUpperCase()}</div><span>Nutri-Score</span></div>`;
    
    const n=api.nutriments||{};
    const vals=[
        {l:'Energia',v:n['energy-kcal_100g'],u:'kcal'},
        {l:'Grassi',v:n.fat_100g,u:'g'},
        {l:'Carboidrati',v:n.carbohydrates_100g,u:'g'},
        {l:'Proteine',v:n.proteins_100g,u:'g'}
    ].filter(x=>x.v!=null);
    
    if(vals.length)h+=`<div class="info-grid" style="margin-top:8px">${vals.map(x=>`<div class="info-item"><small>${x.l}</small><strong>${Number(x.v).toFixed(0)} ${x.u}</strong></div>`).join('')}</div>`;
    
    c.innerHTML=h;
};

window.delProduct=async id=>{
    if(await dialog('Eliminare questo prodotto?')){
        close('modalDetail');
        await dbDel('products',id);
        products=products.filter(x=>x.id!==id);
        renderList();
        toast('Rimosso');
    }
};

// Scanner
const startScan=async()=>{
    if(scanner)try{await scanner.stop()}catch(e){}
    scanner=new Html5Qrcode('scannerView');
    try{await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:100}},onScan,()=>{})}
    catch(e){toast('Errore camera')}
};
const stopScan=async()=>{if(scanner){try{await scanner.stop()}catch(e){}scanner=null}};

const onScan=async code=>{
    vib();await stopScan();close('modalScanner');
    
    // Se stavamo scansionando per un prodotto esistente
    if(window.scanForProductId){
        const id=window.scanForProductId;
        window.scanForProductId=null;
        const p=products.find(x=>x.id===id);
        if(p){
            p.barcode=code;
            toast('Cerco info...');
            const api=await fetchAPI(code);
            if(api){
                p.image=api.image_front_small_url||null;
            }
            await dbPut('products',p);
            renderList();
            toast('Barcode aggiunto');
            openDetail(id);
        }
        return;
    }
    
    // Scansione normale per nuovo prodotto
    toast('Cerco...');
    const api=await fetchAPI(code);
    if(api){
        const name=api.product_name||api.product_name_it||'Sconosciuto';
        const cat=guessCat(api);
        openProductForm({name,barcode:code,image:api.image_front_small_url||null,cat});
        toast('Prodotto trovato!');
    }else{
        openProductForm({barcode:code});
        toast('Non trovato, inserisci nome');
    }
};

const guessCat=p=>{
    const c=(p.categories||'').toLowerCase();
    if(/lait|milk|latte|cheese|yogurt/.test(c))return'dairy';
    if(/fruit|vegetable|frutta|verdur/.test(c))return'fruit';
    if(/meat|carne|fish|pesce/.test(c))return'meat';
    if(/bread|pane|bakery/.test(c))return'bakery';
    if(/beverage|drink|bevand/.test(c))return'drinks';
    if(/frozen|surgel/.test(c))return'frozen';
    if(/snack|sweet|chocolate/.test(c))return'snacks';
    return'other';
};

// Shops
const renderShopsList=()=>{
    const c=$('shopsList');
    if(!shops.length){c.innerHTML='<div class="no-data">Nessun supermercato</div>';return}
    c.innerHTML=shops.map(s=>`<div class="shop-row" data-id="${s.id}"><span>${s.emoji} ${s.name}</span><button data-a="edit">✏️</button><button data-a="del">🗑️</button></div>`).join('');
    c.querySelectorAll('.shop-row').forEach(el=>{
        el.querySelector('[data-a="edit"]').onclick=()=>openEditShop(el.dataset.id);
        el.querySelector('[data-a="del"]').onclick=async()=>{
            if(await dialog('Eliminare?')){
                await dbDel('shops',el.dataset.id);
                shops=shops.filter(s=>s.id!==el.dataset.id);
                renderShopsList();
                toast('Eliminato');
            }
        };
    });
};

const openEditShop=id=>{
    const s=id?shops.find(x=>x.id===id):null;
    $('editShopTitle').textContent=s?'Modifica':'Nuovo Supermercato';
    $('inpShopId').value=id||'';
    $('inpShopName').value=s?.name||'';
    $('inpShopEmoji').value=s?.emoji||'🛒';
    renderEmojiGrid('emojiGrid',s?.emoji||'🛒',EMOJIS,'inpShopEmoji');
    close('modalShops');close('modalProduct');close('modalDetail');
    open('modalEditShop');
};

const openEditCat=id=>{
    const c=id?cats.find(x=>x.id===id):null;
    $('editCatTitle').textContent=c?'Modifica Categoria':'Nuova Categoria';
    $('inpCatId').value=id||'';
    $('inpCatName').value=c?.name||'';
    $('inpCatEmoji').value=c?.emoji||'📦';
    renderEmojiGrid('catEmojiGrid',c?.emoji||'📦',CAT_EMOJIS,'inpCatEmoji');
    close('modalDetail');
    open('modalEditCat');
};

const renderEmojiGrid=(containerId,sel,emojis,inputId)=>{
    const c=$(containerId);
    c.innerHTML=emojis.map(e=>`<button type="button" class="emoji-btn ${e===sel?'sel':''}" data-e="${e}">${e}</button>`).join('');
    c.querySelectorAll('.emoji-btn').forEach(b=>{
        b.onclick=()=>{c.querySelectorAll('.emoji-btn').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');$(inputId).value=b.dataset.e;vib()};
    });
};

// Export/Import
const exportData=()=>{
    const customCats=cats.filter(c=>c.id.startsWith('custom_'));
    const d={
        version:1,
        date:new Date().toISOString(),
        products:products.map(p=>({id:p.id,name:p.name,cat:p.cat,barcode:p.barcode,image:p.image,shops:p.shops||[],prices:p.prices||{},qty:p.qty,done:p.done})),
        shops:shops.map(s=>({id:s.id,name:s.name,emoji:s.emoji})),
        cats:customCats.map(c=>({id:c.id,name:c.name,emoji:c.emoji}))
    };
    const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(b);
    a.download=`spesasmart-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast('Esportato');
};

const importData=async f=>{
    try{
        const d=JSON.parse(await f.text());
        if(!d.products)throw 0;
        await dbClear('products');
        for(const p of d.products)await dbPut('products',p);
        if(d.shops){await dbClear('shops');for(const s of d.shops)await dbPut('shops',s)}
        if(d.cats){await dbClear('cats');for(const c of d.cats)await dbPut('cats',c)}
        await load();
        renderCatSelect();
        renderList();
        closeAll();
        toast('Importato');
    }catch(e){toast('Errore importazione')}
};

// Pull to Refresh
let pullStartY=0,pulling=false;
const initPullToRefresh=()=>{
    const main=$('main');
    const indicator=$('pullIndicator');
    
    main.addEventListener('touchstart',e=>{
        if(main.scrollTop===0){
            pullStartY=e.touches[0].clientY;
            pulling=true;
        }
    },{passive:true});
    
    main.addEventListener('touchmove',e=>{
        if(!pulling)return;
        const y=e.touches[0].clientY;
        const diff=y-pullStartY;
        if(diff>60&&main.scrollTop===0){
            indicator.classList.add('visible');
            indicator.textContent='↓ Rilascia per aggiornare';
        }else{
            indicator.classList.remove('visible');
        }
    },{passive:true});
    
    main.addEventListener('touchend',e=>{
        if(indicator.classList.contains('visible')){
            indicator.textContent='⟳ Aggiornamento...';
            indicator.classList.add('loading');
            // Forza aggiornamento Service Worker e ricarica
            if('serviceWorker'in navigator){
                navigator.serviceWorker.getRegistrations().then(regs=>{
                    Promise.all(regs.map(r=>r.update())).then(()=>{
                        setTimeout(()=>location.reload(),500);
                    });
                });
            }else{
                setTimeout(()=>location.reload(),500);
            }
        }
        pulling=false;
        indicator.classList.remove('visible');
    },{passive:true});
};

// Init
document.addEventListener('DOMContentLoaded',async()=>{
    initTheme();
    initPullToRefresh();
    try{
        await initDB();
        await load();
        renderCatSelect();
        renderList();
        if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
    }catch(e){console.error(e)}
});

// Events
$('overlay').onclick=closeAll;
document.querySelectorAll('.close').forEach(b=>{b.onclick=()=>close(b.dataset.close)});

$('inpSearch').oninput=renderList;
$('selCat').onchange=renderList;

$('btnScan').onclick=()=>{open('modalScanner');startScan()};
$('btnAdd').onclick=()=>openProductForm();
$('btnSettings').onclick=()=>open('modalSettings');

$('btnManualCode').onclick=async()=>{
    await stopScan();close('modalScanner');
    const code=await dialog('Inserisci codice barcode',true);
    if(code?.trim()){
        toast('Cerco...');
        const api=await fetchAPI(code.trim());
        if(api){
            const name=api.product_name||api.product_name_it||'Sconosciuto';
            openProductForm({name,barcode:code.trim(),image:api.image_front_small_url||null,cat:guessCat(api)});
            toast('Trovato!');
        }else{
            openProductForm({barcode:code.trim()});
            toast('Non trovato');
        }
    }
};

$('formProduct').onsubmit=e=>{e.preventDefault();saveProduct()};
$('btnNewShopForm').onclick=()=>openEditShop(null);

$('btnTheme').onclick=toggleTheme;
$('btnShops').onclick=()=>{close('modalSettings');renderShopsList();open('modalShops')};
$('btnExport').onclick=exportData;
$('inpImport').onchange=e=>{if(e.target.files[0]){importData(e.target.files[0]);e.target.value=''}};
$('btnClearDone').onclick=async()=>{
    const done=products.filter(p=>p.done);
    if(!done.length){toast('Nessun completato');return}
    if(await dialog(`Eliminare ${done.length} prodotti completati?`)){
        for(const p of done)await dbDel('products',p.id);
        products=products.filter(p=>!p.done);
        renderList();close('modalSettings');toast('Rimossi');
    }
};
$('btnClearAll').onclick=async()=>{
    if(!products.length){toast('Lista già vuota');return}
    if(await dialog('Eliminare TUTTI i prodotti?')){
        await dbClear('products');products=[];
        renderList();close('modalSettings');toast('Lista svuotata');
    }
};

$('btnNewShop').onclick=()=>openEditShop(null);
$('formShop').onsubmit=async e=>{
    e.preventDefault();
    const name=$('inpShopName').value.trim();
    if(!name)return;
    const id=$('inpShopId').value||name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const shop={id,name,emoji:$('inpShopEmoji').value||'🛒'};
    await dbPut('shops',shop);
    const idx=shops.findIndex(s=>s.id===id);
    if(idx>=0)shops[idx]=shop;else shops.push(shop);
    close('modalEditShop');
    
    // Se veniva dal dettaglio prodotto, riapri dettaglio
    if(window.pendingDetailProdId){
        const prodId=window.pendingDetailProdId;
        window.pendingDetailProdId=null;
        openDetail(prodId);
    }else{
        renderShopsList();
        open('modalShops');
    }
    toast('Salvato');
};

$('formCat').onsubmit=async e=>{
    e.preventDefault();
    const name=$('inpCatName').value.trim();
    if(!name)return;
    const id=$('inpCatId').value||'custom_'+name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const cat={id,name,emoji:$('inpCatEmoji').value||'📦'};
    await dbPut('cats',cat);
    const idx=cats.findIndex(c=>c.id===id);
    if(idx>=0)cats[idx]=cat;else cats.push(cat);
    close('modalEditCat');
    renderCatSelect();
    
    // Se veniva dal dettaglio prodotto, riapri e seleziona nuova categoria
    if(window.pendingDetailProdId){
        const prodId=window.pendingDetailProdId;
        window.pendingDetailProdId=null;
        const p=products.find(x=>x.id===prodId);
        if(p){
            p.cat=id;
            await dbPut('products',p);
            renderList();
        }
        openDetail(prodId);
    }
    toast('Categoria salvata');
};
