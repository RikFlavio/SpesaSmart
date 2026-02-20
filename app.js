const DB='SpesaSmartDB',VER=3;
const CATS=[
    {id:'dairy',name:'Latticini',emoji:'🥛'},
    {id:'fruit',name:'Frutta e Verdura',emoji:'🍎'},
    {id:'meat',name:'Carne e Pesce',emoji:'🥩'},
    {id:'bakery',name:'Pane e Dolci',emoji:'🥖'},
    {id:'drinks',name:'Bevande',emoji:'🥤'},
    {id:'frozen',name:'Surgelati',emoji:'🧊'},
    {id:'snacks',name:'Snack',emoji:'🍪'},
    {id:'household',name:'Casa e Igiene',emoji:'🧴'},
    {id:'pasta',name:'Pasta e Riso',emoji:'🍝'},
    {id:'condiments',name:'Condimenti',emoji:'🫒'},
    {id:'breakfast',name:'Colazione',emoji:'☕'},
    {id:'baby',name:'Infanzia',emoji:'👶'},
    {id:'pets',name:'Animali',emoji:'🐱'},
    {id:'other',name:'Altro',emoji:'📦'}
];

const SHOPS=[
    {id:'esselunga',name:'Esselunga',emoji:'🔴'},
    {id:'unes',name:'Unes',emoji:'🟠'},
    {id:'pam',name:'Pam',emoji:'🟡'},
    {id:'conad',name:'Conad',emoji:'🟢'},
    {id:'lidl',name:'Lidl',emoji:'🔵'},
    {id:'coop',name:'Coop',emoji:'🟣'}
];

const SHOP_EMOJIS=['🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','💜','💙','💚','💛','🧡','❤️','🩷'];
const CAT_EMOJIS=['🥛','🍎','🥩','🥖','🥤','🧊','🍪','🧴','📦','🍕','🍝','🥗','🧀','🥚','🍺','🍷','☕','🧹','💊','🐱','🐶','👶','🌶️','🍯','🥜','🍫','🎂','🍿','🥫','🧈','🫒','🥣','🌿','🧅','🥕','🍗'];

let db,products=[],shops=[],cats=[],theme='dark',scanner=null;

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
    
    // Carica supermercati: se vuoto, salva i predefiniti
    let dbShops=await dbAll('shops');
    if(!dbShops.length){
        for(const s of SHOPS)await dbPut('shops',s);
        dbShops=SHOPS;
    }
    // Unisci predefiniti + custom (custom sovrascrive)
    const shopMap=new Map(SHOPS.map(s=>[s.id,s]));
    dbShops.forEach(s=>shopMap.set(s.id,s));
    shops=Array.from(shopMap.values());
    
    // Carica categorie: se vuoto, salva i predefiniti
    let dbCats=await dbAll('cats');
    if(!dbCats.length){
        for(const c of CATS)await dbPut('cats',c);
        dbCats=CATS;
    }
    // Unisci predefiniti + custom
    const catMap=new Map(CATS.map(c=>[c.id,c]));
    dbCats.forEach(c=>catMap.set(c.id,c));
    cats=Array.from(catMap.values());
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
    
    // Filtra e ordina: A-Z, poi completati in fondo
    let list=products
        .filter(p=>{
            if(search&&!p.name.toLowerCase().includes(search))return false;
            if(activeFilter.cat&&p.cat!==activeFilter.cat)return false;
            if(activeFilter.shop&&(!p.shops||!p.shops.includes(activeFilter.shop)))return false;
            return true;
        })
        .sort((a,b)=>{
            // Prima i non completati, poi i completati
            if(a.done!==b.done)return a.done?1:-1;
            // Poi ordine alfabetico
            return a.name.localeCompare(b.name,'it');
        });
    
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
            <div class="item-check"><span class="check-icon">${p.done?'✓':'○'}</span></div>
            <div class="item-name">${p.name}</div>
        </div>
    `).join('');
    c.querySelectorAll('.item').forEach(el=>{
        const id=el.dataset.id;
        el.querySelector('.item-check').onclick=()=>toggleDoneAnimated(id,el);
        el.querySelector('.item-name').onclick=()=>openDetail(id);
    });
};

// Toggle con animazione
const toggleDoneAnimated=async(id,el)=>{
    vib();
    const p=products.find(x=>x.id===id);
    if(!p)return;
    
    p.done=!p.done;
    
    // Animazione
    if(p.done){
        el.classList.add('completing');
        el.querySelector('.check-icon').textContent='✓';
    }else{
        el.classList.remove('done','completing');
        el.querySelector('.check-icon').textContent='○';
    }
    
    await dbPut('products',p);
    
    // Dopo l'animazione, riordina la lista
    setTimeout(()=>{
        renderList();
    },p.done?400:100);
};

// Filtri dropdown
let activeFilter={cat:null,shop:null};

const renderFilterDropdowns=()=>{
    // Aggiorna bottoni
    const catBtn=$('btnFilterCat');
    const shopBtn=$('btnFilterShop');
    
    if(activeFilter.cat){
        const cat=cats.find(c=>c.id===activeFilter.cat);
        $('filterCatIcon').textContent=cat?.emoji||'📋';
        $('filterCatLabel').textContent=cat?.name||'Categorie';
        catBtn.classList.add('active');
    }else{
        $('filterCatIcon').textContent='📋';
        $('filterCatLabel').textContent='Categorie';
        catBtn.classList.remove('active');
    }
    
    if(activeFilter.shop){
        const shop=shops.find(s=>s.id===activeFilter.shop);
        $('filterShopIcon').textContent=shop?.emoji||'🏪';
        $('filterShopLabel').textContent=shop?.name||'Supermercati';
        shopBtn.classList.add('active');
    }else{
        $('filterShopIcon').textContent='🏪';
        $('filterShopLabel').textContent='Supermercati';
        shopBtn.classList.remove('active');
    }
};

const openDropdown=(type)=>{
    const dropCat=$('dropdownCat');
    const dropShop=$('dropdownShop');
    const btnCat=$('btnFilterCat');
    const btnShop=$('btnFilterShop');
    
    // Chiudi tutti
    dropCat.classList.remove('open');
    dropShop.classList.remove('open');
    btnCat.classList.remove('open');
    btnShop.classList.remove('open');
    
    if(type==='cat'){
        // Popola categorie ordinate A-Z
        const sortedCats=[...cats].sort((a,b)=>a.name.localeCompare(b.name,'it'));
        let html=`<div class="dropdown-item ${!activeFilter.cat?'selected':''}" data-id="">
            <span class="item-icon">📋</span><span class="item-label">Tutte le categorie</span>
            ${!activeFilter.cat?'<span class="item-check">✓</span>':''}
        </div>`;
        sortedCats.forEach(c=>{
            const sel=activeFilter.cat===c.id;
            html+=`<div class="dropdown-item ${sel?'selected':''}" data-id="${c.id}">
                <span class="item-icon">${c.emoji}</span><span class="item-label">${c.name}</span>
                ${sel?'<span class="item-check">✓</span>':''}
            </div>`;
        });
        dropCat.innerHTML=html;
        dropCat.classList.add('open');
        btnCat.classList.add('open');
        
        dropCat.querySelectorAll('.dropdown-item').forEach(item=>{
            item.onclick=()=>{
                activeFilter.cat=item.dataset.id||null;
                closeDropdowns();
                renderFilterDropdowns();
                renderList();
                vib();
            };
        });
    }else if(type==='shop'){
        // Popola supermercati ordinati A-Z
        const sortedShops=[...shops].sort((a,b)=>a.name.localeCompare(b.name,'it'));
        let html=`<div class="dropdown-item ${!activeFilter.shop?'selected':''}" data-id="">
            <span class="item-icon">🏪</span><span class="item-label">Tutti i supermercati</span>
            ${!activeFilter.shop?'<span class="item-check">✓</span>':''}
        </div>`;
        if(sortedShops.length){
            sortedShops.forEach(s=>{
                const sel=activeFilter.shop===s.id;
                html+=`<div class="dropdown-item ${sel?'selected':''}" data-id="${s.id}">
                    <span class="item-icon">${s.emoji}</span><span class="item-label">${s.name}</span>
                    ${sel?'<span class="item-check">✓</span>':''}
                </div>`;
            });
        }else{
            html+=`<div class="dropdown-item" style="color:var(--text3)">
                <span class="item-icon">ℹ️</span><span class="item-label">Nessun supermercato</span>
            </div>`;
        }
        dropShop.innerHTML=html;
        dropShop.classList.add('open');
        btnShop.classList.add('open');
        
        dropShop.querySelectorAll('.dropdown-item[data-id]').forEach(item=>{
            item.onclick=()=>{
                activeFilter.shop=item.dataset.id||null;
                closeDropdowns();
                renderFilterDropdowns();
                renderList();
                vib();
            };
        });
    }
};

const closeDropdowns=()=>{
    $('dropdownCat').classList.remove('open');
    $('dropdownShop').classList.remove('open');
    $('btnFilterCat').classList.remove('open');
    $('btnFilterShop').classList.remove('open');
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
        <h4>💰 Prezzi</h4>
        <div id="pricesList">`;
    
    // Prezzi esistenti ordinati dal più basso al più alto
    const prices=p.prices||{};
    const priceEntries=Object.entries(prices)
        .map(([sid,price])=>({shop:shops.find(s=>s.id===sid),price}))
        .filter(e=>e.shop&&e.price>0)
        .sort((a,b)=>a.price-b.price);
    
    if(priceEntries.length){
        priceEntries.forEach((e,i)=>{
            const isBest=i===0&&priceEntries.length>1;
            h+=`<div class="price-row ${isBest?'best':''}">
                <span class="price-shop">${e.shop.emoji} ${e.shop.name}</span>
                <span class="price-value">€ ${e.price.toFixed(2)}</span>
                <button class="price-del" onclick="delPrice('${p.id}','${e.shop.id}')">✕</button>
            </div>`;
        });
    }else{
        h+=`<div class="no-data">Nessun prezzo inserito</div>`;
    }
    
    h+=`</div>
        <button class="btn-link" onclick="addPricePrompt('${p.id}')">+ Aggiungi prezzo</button>
    </div>`;
    
    h+=`<button class="btn-outline" onclick="delProduct('${p.id}')" style="color:var(--danger);margin-top:16px">🗑️ Elimina Prodotto</button>`;
    
    $('detailBody').innerHTML=h;
    
    // Render categoria selezionabile
    renderDetailCatGrid(p.id,p.cat);
    
    open('modalDetail');
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

// Gestione scansione per prodotto esistente

// Salva prezzo
// Price management
window.addPricePrompt=async id=>{
    const p=products.find(x=>x.id===id);
    if(!p)return;
    if(!shops.length){toast('Crea prima un supermercato');return}
    
    const prices=p.prices||{};
    const availableShops=shops.filter(s=>!prices[s.id]).sort((a,b)=>a.name.localeCompare(b.name,'it'));
    
    if(!availableShops.length){
        toast('Prezzo già inserito per tutti');
        return;
    }
    
    let h='<div class="detail-section"><h4>Seleziona Supermercato</h4>';
    availableShops.forEach(s=>{
        h+=`<div class="select-row" data-id="${s.id}"><span>${s.emoji} ${s.name}</span></div>`;
    });
    h+='<button class="btn-link" onclick="addShopFromDetail(\''+id+'\')">+ Nuovo supermercato</button></div>';
    $('detailBody').innerHTML=h;
    
    $('detailBody').querySelectorAll('.select-row').forEach(el=>{
        el.onclick=async()=>{
            const shopId=el.dataset.id;
            const price=await dialog('Prezzo (€)',true);
            if(price){
                const val=parseFloat(price.replace(',','.'));
                if(!isNaN(val)&&val>0){
                    if(!p.prices)p.prices={};
                    p.prices[shopId]=val;
                    await dbPut('products',p);
                    toast('Prezzo salvato');
                }
            }
            openDetail(id);
        };
    });
};

window.delPrice=async(id,sid)=>{
    const p=products.find(x=>x.id===id);
    if(p?.prices){
        delete p.prices[sid];
        await dbPut('products',p);
        openDetail(id);
    }
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
            await dbPut('products',p);
            renderList();
            toast('Barcode aggiunto');
            openDetail(id);
        }
        return;
    }
    
    // Nuovo prodotto - apri form con barcode
    openProductForm({barcode:code});
    toast('Barcode: '+code);
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
    $('inpShopEmoji').value=s?.emoji||'⚫';
    renderEmojiGrid('emojiGrid',s?.emoji||'⚫',SHOP_EMOJIS,'inpShopEmoji');
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
        renderFilterDropdowns();
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
        renderFilterDropdowns();
        renderList();
        if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
    }catch(e){console.error(e)}
});

// Events
$('overlay').onclick=closeAll;
document.querySelectorAll('.close').forEach(b=>{b.onclick=()=>close(b.dataset.close)});

$('inpSearch').oninput=()=>{closeDropdowns();renderList()};
$('btnFilterCat').onclick=()=>{
    if($('dropdownCat').classList.contains('open'))closeDropdowns();
    else openDropdown('cat');
};
$('btnFilterShop').onclick=()=>{
    if($('dropdownShop').classList.contains('open'))closeDropdowns();
    else openDropdown('shop');
};
// Chiudi dropdown cliccando fuori
document.addEventListener('click',e=>{
    if(!e.target.closest('.filters-bar'))closeDropdowns();
});

$('btnScan').onclick=()=>{open('modalScanner');startScan()};
$('btnAdd').onclick=()=>openProductForm();
$('btnSettings').onclick=()=>open('modalSettings');

$('btnManualCode').onclick=async()=>{
    await stopScan();close('modalScanner');
    const code=await dialog('Inserisci codice barcode',true);
    if(code?.trim()){
        openProductForm({barcode:code.trim()});
        toast('Barcode: '+code.trim());
    }
};

$('formProduct').onsubmit=e=>{e.preventDefault();saveProduct()};
$('btnNewShopForm').onclick=()=>{window.pendingFromForm=true;openEditShop(null)};
$('btnNewCatForm').onclick=()=>{window.pendingFromForm=true;openEditCat(null)};

$('btnTheme').onclick=toggleTheme;
$('btnExport').onclick=exportData;
$('inpImport').onchange=e=>{if(e.target.files[0]){importData(e.target.files[0]);e.target.value=''}};
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
    const id=$('inpShopId').value||'custom_'+name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const shop={id,name,emoji:$('inpShopEmoji').value||'⚫'};
    await dbPut('shops',shop);
    const idx=shops.findIndex(s=>s.id===id);
    if(idx>=0)shops[idx]=shop;else shops.push(shop);
    close('modalEditShop');
    renderFilterDropdowns();
    
    // Se veniva dal form prodotto, torna al form
    if(window.pendingFromForm){
        window.pendingFromForm=false;
        renderShopGrid([id]);
        open('modalProduct');
    }
    // Se veniva dal dettaglio prodotto, riapri dettaglio
    else if(window.pendingDetailProdId){
        const prodId=window.pendingDetailProdId;
        window.pendingDetailProdId=null;
        openDetail(prodId);
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
    renderFilterDropdowns();
    
    // Se veniva dal form prodotto, torna al form
    if(window.pendingFromForm){
        window.pendingFromForm=false;
        renderCatGrid(id);
        open('modalProduct');
    }
    // Se veniva dal dettaglio prodotto, riapri e seleziona nuova categoria
    else if(window.pendingDetailProdId){
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
