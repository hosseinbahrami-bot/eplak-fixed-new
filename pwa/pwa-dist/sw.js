/* sw.js — Service Worker اپلیکیشن ای‌پلاک
   وظیفه‌ی اصلی: دریافت «اعلان پس‌زمینه» (Web Push) و نمایش نوتیفیکیشن سیستمی
   روی گوشی — حتی وقتی صفحه قفل است یا برنامه بسته/در پس‌زمینه است.

   نکته: برای رسیدن اعلان در حالت بسته بودن برنامه، این فایل باید در اپلیکیشن
   ثبت شود (navigator.serviceWorker.register) و کاربر اجازه‌ی اعلان داده باشد.
   خودِ ثبت در modules/live.js انجام می‌شود.
*/

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
      self.clients.claim(),
    ])
  );
});

/* هیچ کشی انجام نمی‌شود؛ همیشه از شبکه خوانده می‌شود تا محتوای پنل/اپ تازه بماند */
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

/* ───────────────────────── اعلان پس‌زمینه (Push) ───────────────────────── */

self.addEventListener('push', (event) => {
  let data = {
    title: 'اعلان شهرداری ورامین',
    body: 'پیام جدیدی از سوی شهرداری ارسال شد.',
    url: 'index.html',
    icon: 'assets/img/logo.png',
    tag: 'eplak-notification',
    id: 0,
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        data = Object.assign(data, parsed);
      }
    } catch (e) {
      try {
        data.body = event.data.text();
      } catch (e2) {}
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || 'assets/img/logo.png',
    badge: 'assets/img/logo.png',
    dir: 'rtl',
    lang: 'fa',
    vibrate: [200, 100, 200],
    tag: data.tag || ('eplak-' + Date.now()),
    renotify: true,
    requireInteraction: true,   // اعلان تا تعامل کاربر روی صفحه‌ی قفل می‌ماند
    data: {
      url: data.url || 'index.html',
      id: data.id || 0,
    },
  };

  event.waitUntil(
    (async () => {
      /* اگر پنجره‌ی برنامه باز و در حال مشاهده باشد، باز هم نوتیفیکیشن سیستمی
         نشان می‌دهیم (تا کاربر آن را از دست ندهد) و هم پیام را به صفحه می‌فرستیم. */
      try {
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientList) {
          client.postMessage({
            action: 'push_received',
            title: data.title,
            body: data.body,
            id: data.id || 0,
          });
        }
      } catch (e) {}
      await self.registration.showNotification(data.title, options);
    })()
  );
});

/* کلیک روی اعلان: اگر برنامه باز است همان تب فعال شود، وگرنه باز شود */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : 'index.html';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            client.postMessage({ action: 'open_notifications' });
          } catch (e) {}
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});

/* اگر مرورگر اشتراک را باطل/تازه کرد، اشتراک تازه ساخته و به سرور فرستاده می‌شود */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch('api/push.php?action=config', { cache: 'no-store' });
        const config = await response.json();
        if (!config || !config.success || !config.vapid_public_key) {
          return;
        }
        const applicationServerKey = urlBase64ToUint8Array(config.vapid_public_key);
        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey,
        });
        await fetch('api/push.php?action=subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '', subscription: subscription.toJSON ? subscription.toJSON() : subscription }),
        });
      } catch (e) {}
    })()
  );
});

/* اجازه‌ی نمایش اعلان از داخل صفحه (وقتی برنامه باز ولی در پس‌زمینه است) */
self.addEventListener('message', (event) => {
  const payload = event.data || {};
  if (payload.action === 'show_notification' && (payload.title || payload.body)) {
    self.registration.showNotification(payload.title || 'اعلان ای‌پلاک', {
      body: payload.body || '',
      icon: payload.icon || 'assets/img/logo.png',
      badge: 'assets/img/logo.png',
      dir: 'rtl',
      lang: 'fa',
      vibrate: [200, 100, 200],
      tag: payload.tag || ('eplak-' + Date.now()),
      renotify: true,
      data: { url: payload.url || 'index.html', id: payload.id || 0 },
    });
  }
});

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}
