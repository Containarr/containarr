self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    // Always display a notification, even if a provider sends an empty payload.
  }
  event.waitUntil(self.registration.showNotification('Containarr', {
    body: payload.message || 'A new event is available.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.eventId,
    data: { url: '/#/events' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL('/#/events', self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(url);
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
