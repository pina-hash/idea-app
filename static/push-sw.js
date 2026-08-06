/*
 * IDEA portal push service worker. Deliberately MINIMAL: it handles push
 * events and notification clicks, and nothing else. There is no fetch
 * handler, no precache, no runtime cache -- the site had no service worker
 * before this file, and this one must never grow offline/caching behavior as
 * a side effect (a stale-cache bug on a school portal is worse than no SW).
 *
 * Payload contract (JSON, produced by src/lib/server/push.ts):
 *   { title, body, url, tag }
 */

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { body: event.data ? event.data.text() : '' };
	}
	const title = data.title || 'IDEA Tournaments';
	event.waitUntil(
		self.registration.showNotification(title, {
			body: data.body || '',
			tag: data.tag || undefined,
			icon: '/IDEA/android-chrome-512x512.png',
			badge: '/IDEA/favicon-32x32.png',
			data: { url: data.url || '/' }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || '/';
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
			for (const win of wins) {
				if (win.url.includes(url) && 'focus' in win) return win.focus();
			}
			return self.clients.openWindow(url);
		})
	);
});
