// =============================================
// HGD Chat — Service Worker
// Version: 1.0.0
// =============================================

const CACHE_NAME = 'hgd-chat-v1';
const OFFLINE_URL = '/index.html';

// Ressources à mettre en cache immédiatement
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Fonts Google (mise en cache si déjà chargées)
  'https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
];

// =============================================
// INSTALL — Pré-cache des ressources essentielles
// =============================================
self.addEventListener('install', event => {
  console.log('[HGD SW] Installation…');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('[HGD SW] Erreur pré-cache (certains assets manquants):', err);
      });
    }).then(() => {
      console.log('[HGD SW] Installé avec succès');
      return self.skipWaiting();
    })
  );
});

// =============================================
// ACTIVATE — Nettoyage des anciens caches
// =============================================
self.addEventListener('activate', event => {
  console.log('[HGD SW] Activation…');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[HGD SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[HGD SW] Activé — contrôle de tous les clients');
      return self.clients.claim();
    })
  );
});

// =============================================
// FETCH — Stratégie Cache-First avec fallback réseau
// =============================================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET
  if(request.method !== 'GET') return;

  // Ignorer les requêtes Firebase / API (toujours réseau)
  if(
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.pathname.includes('/v1/messages') ||
    url.pathname.includes('/api/')
  ){
    return; // Laisser passer sans cache
  }

  // Stratégie: Network-first pour la navigation, Cache-first pour assets
  if(request.mode === 'navigate'){
    event.respondWith(
      fetch(request)
        .then(response => {
          if(response.ok){
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
  } else {
    event.respondWith(
      caches.match(request).then(cached => {
        if(cached) return cached;
        return fetch(request).then(response => {
          if(response && response.ok && response.type !== 'opaque'){
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          // Retourner l'index pour les assets HTML
          if(request.destination === 'document') return caches.match(OFFLINE_URL);
        });
      })
    );
  }
});

// =============================================
// PUSH — Notifications push
// =============================================
self.addEventListener('push', event => {
  console.log('[HGD SW] Notification push reçue');

  let data = { title: 'HGD Chat', body: 'Nouveau message', icon: '/icons/icon-192.png' };

  try {
    data = event.data ? event.data.json() : data;
  } catch(e) {
    data.body = event.data ? event.data.text() : 'Nouveau message';
  }

  const options = {
    body: data.body || 'Vous avez un nouveau message',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      chatId: data.chatId
    },
    actions: [
      { action: 'reply', title: 'Répondre' },
      { action: 'dismiss', title: 'Ignorer' }
    ],
    tag: data.chatId || 'hgd-msg',
    renotify: true,
    requireInteraction: false,
    silent: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'HGD Chat', options)
  );
});

// =============================================
// NOTIFICATION CLICK
// =============================================
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if(event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for(const client of clientList){
        if(client.url === targetUrl && 'focus' in client){
          return client.focus();
        }
      }
      if(clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// =============================================
// SYNC — Synchronisation en arrière-plan
// =============================================
self.addEventListener('sync', event => {
  if(event.tag === 'sync-messages'){
    console.log('[HGD SW] Synchronisation des messages en arrière-plan');
    event.waitUntil(syncPendingMessages());
  }
});

async function syncPendingMessages() {
  // Les messages en attente sont gérés par Firebase
  // Cette fonction peut être étendue pour les messages offline
  console.log('[HGD SW] Messages synchronisés');
}

// =============================================
// MESSAGE — Communication avec l'app principale
// =============================================
self.addEventListener('message', event => {
  if(event.data?.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }

  if(event.data?.type === 'CACHE_UPDATE'){
    caches.open(CACHE_NAME).then(cache => {
      cache.addAll(event.data.urls || []);
    });
  }
});

console.log('[HGD Chat SW] Service Worker chargé — Version 1.0.0');
