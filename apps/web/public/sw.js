// ClueQuest service worker. It exists so the site can be installed; it never caches anything,
// so a visitor always gets the live site (quiz answers and scores must never be stale).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
