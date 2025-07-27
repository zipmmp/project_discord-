const CACHE_NAME = 'discord-sender-cache-v1';
const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 دقيقة

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(['/']))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data.type === 'INIT_SESSION') {
    console.log('ServiceWorker received session:', event.data.sessionId);
  }
  
  if (event.data.type === 'MONITOR_MODE') {
    console.log('ServiceWorker monitoring session:', event.data.sessionId);
    setInterval(() => {
      fetch(event.data.monitorUrl, {
        method: 'HEAD',
        cache: 'no-cache',
        headers: {
          'X-ServiceWorker-Ping': 'true'
        }
      }).catch(err => console.error('ServiceWorker fetch error:', err));
    }, 2 * 60 * 1000); // كل دقيقتين
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.headers.get('X-KeepAlive') === 'true') {
    const sessionId = event.request.headers.get('X-Session-ID');
    console.log('Session keep-alive received:', sessionId);
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
