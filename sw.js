const CACHE_NAME = 'spesasmart-v4';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting()) // Attiva subito
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => 
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim()) // Prendi controllo subito
    );
});

self.addEventListener('fetch', e => {
    const url = e.request.url;
    
    // Skip non-GET and external requests
    if (e.request.method !== 'GET') return;
    if (url.startsWith('chrome-extension://')) return;
    if (url.includes('fonts.googleapis.com')) return;
    if (url.includes('fonts.gstatic.com')) return;
    
    // Network First: prova online, poi cache
    e.respondWith(
        fetch(e.request)
            .then(response => {
                // Salva in cache se valido
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            })
            .catch(() => {
                // Offline: usa cache
                return caches.match(e.request).then(cached => {
                    if (cached) return cached;
                    if (e.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});
