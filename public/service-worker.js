// Service worker voor Wim-maatje (PWA + pushmeldingen).
// Bewust minimaal: geen offline-caching (voorkomt stale UI), alleen wat nodig is
// om installeerbaar te zijn en pushmeldingen te tonen.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Lege fetch-handler zodat de browser de app als installeerbaar ziet.
self.addEventListener('fetch', () => {});

// Pushmelding ontvangen -> tonen.
self.addEventListener('push', (event) => {
  let data = { title: 'Wim-maatje', body: 'Je briefing staat klaar.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: data.url || '/' },
      tag: data.tag || 'wim-maatje-briefing',
      // Sticky: blijft staan tot je 'm aantikt (voor zover de telefoon dit toestaat).
      requireInteraction: Boolean(data.requireInteraction),
      // Herinnering met dezelfde tag laat opnieuw trillen i.p.v. stil vervangen.
      renotify: Boolean(data.renotify)
    })
  );
});

// Tik op de melding -> app openen (of naar voren halen) op de juiste view.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
