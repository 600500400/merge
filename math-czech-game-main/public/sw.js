const CACHE_NAME = 'procvicka-v3';
const STATIC_CACHE = 'procvicka-static-v3';
const DYNAMIC_CACHE = 'procvicka-dynamic-v3';
const IMAGE_CACHE = 'procvicka-images-v3';

// Cache strategies for different types of resources
const cacheStrategies = {
  static: [
    '/',
    '/manifest.json',
    '/favicon.ico'
  ],
  fonts: [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com'
  ]
};

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('SW: Installing new service worker v3');
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => cache.addAll(cacheStrategies.static)),
      caches.open(IMAGE_CACHE).then(cache => {
        return cache.addAll([
          '/public/images/happy-kid.png',
          '/public/images/stars.png',
          '/public/images/try-again.png'
        ]);
      })
    ]).then(() => {
      console.log('SW: Installation complete v3');
      return self.skipWaiting();
    }).catch(error => {
      console.error('SW: Installation failed:', error);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('SW: Activating new service worker v3');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!['procvicka-static-v3', 'procvicka-dynamic-v3', 'procvicka-images-v3'].includes(cacheName)) {
            console.log('SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('SW: Activation complete v3');
      return self.clients.claim();
    })
  );
});

// Fetch event with advanced caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip extension requests
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return;

  event.respondWith(handleRequest(request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  
  try {
    // Strategy 1: Cache First for static assets
    if (isStaticAsset(url)) {
      return await cacheFirst(request, STATIC_CACHE);
    }
    
    // Strategy 2: Stale While Revalidate for images
    if (isImage(url)) {
      return await staleWhileRevalidate(request, IMAGE_CACHE);
    }
    
    // Strategy 3: Network First for API calls
    if (isApiCall(url)) {
      return await networkFirst(request, DYNAMIC_CACHE);
    }
    
    // Strategy 4: Stale While Revalidate for everything else
    return await staleWhileRevalidate(request, DYNAMIC_CACHE);
    
  } catch (error) {
    console.error('SW: Fetch failed:', error);
    return await getOfflineFallback(request);
  }
}

// Cache First strategy
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

// Network First strategy
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Stale While Revalidate strategy
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => {});
  
  return cachedResponse || await fetchPromise;
}

// Helper functions
function isStaticAsset(url) {
  return url.pathname.endsWith('.js') || 
         url.pathname.endsWith('.css') || 
         url.pathname.endsWith('.woff2') ||
         url.pathname === '/' ||
         url.pathname === '/manifest.json';
}

function isImage(url) {
  return /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname);
}

function isApiCall(url) {
  return url.pathname.startsWith('/api/') || 
         url.hostname.includes('supabase');
}

async function getOfflineFallback(request) {
  const cache = await caches.open(STATIC_CACHE);
  
  if (request.mode === 'navigate') {
    return await cache.match('/') || new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  
  return new Response('Offline', {
    status: 503,
    statusText: 'Service Unavailable'
  });
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('SW: Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-game-data') {
    event.waitUntil(syncGameData());
  }
});

async function syncGameData() {
  console.log('SW: Syncing game data...');
  // This would sync any pending game data when back online
  // Implementation would depend on your data structure
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('SW: Push message received');
  
  const options = {
    body: event.data ? event.data.text() : 'Nová zpráva z Procvičky!',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'procvicka-notification',
    actions: [
      {
        action: 'open',
        title: 'Otevřít aplikaci'
      },
      {
        action: 'close',
        title: 'Zavřít'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Procvička', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('SW: Notification clicked');
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clients => {
        if (clients.length > 0) {
          return clients[0].focus();
        }
        return clients.openWindow('/');
      })
    );
  }
});
