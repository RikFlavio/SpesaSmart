const CACHE_NAME = 'spesasmart-v1';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Install
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => 
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch
self.addEventListener('fetch', e => {
    // Skip non-GET and API requests
    if (e.request.method !== 'GET') return;
    if (e.request.url.includes('openfoodfacts.org')) return;
    
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            
            return fetch(e.request).then(response => {
                // Don't cache non-ok responses
                if (!response || response.status !== 200) return response;
                
                // Clone and cache
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                
                return response;
            }).catch(() => {
                // Offline fallback for navigation
                if (e.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
