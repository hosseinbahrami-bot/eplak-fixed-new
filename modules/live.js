/* ============================================================
   modules/live.js — محتوای زنده (اخبار، دانستنی‌ها، اعلان‌ها و پوش بلادرنگ)
   ارتباط مستقیم و دوطرفه بین اپ شهروندی و پنل مدیریت MariaDB
   ============================================================ */
(function () {
  'use strict';

  var isInitialNotifs = true;
  var seenNotifIds = new Set();
  var isSyncing = false;

  /* نسخه‌ی همین اسکریپت (با v= در index.html هم‌خوان است) — همراه هر درخواستِ
     فهرست اعلان‌ها به سرور می‌رود تا در پنل معلوم باشد هر گوشی چه نسخه‌ای دارد. */
  var LIVE_VERSION = '21';

  /* نتیجه‌ی آخرین درخواست فهرست اعلان‌ها از نگاه اپ:
       first | ok:N | http:S | json | net:<پیام کوتاه>
     با درخواست بعدی (prev=) برای سرور فرستاده می‌شود؛ پس حتی وقتی اپ نمی‌تواند
     پاسخ را بخواند، پنل → تنظیمات → «ضربان اپ‌ها» دلیلش را نشان می‌دهد. */
  var lastPollOutcome = 'first';

  function apiBase() {
    return (typeof window.EPLAK_API_BASE_URL === 'string' && window.EPLAK_API_BASE_URL)
      ? window.EPLAK_API_BASE_URL.replace(/\/$/, '')
      : 'api';
  }

  /* ───────────────────────────────────────────────────────────
     تصویرِ مطلبِ خبری/دانستنی
     در اپ (صفحه از file:// باز می‌شود) آدرس نسبی به فایل‌های «داخل گوشی» اشاره
     می‌کند؛ پس تصویرِ آپلودشده در پنل (uploads/news/…) باید به دامنه‌ی سرور وصل
     شود. سرور نشانی مطلق را در image_abs هم می‌فرستد و core/storage.js تابع
     eplakResolveMediaUrl را دارد؛ اینجا هر دو مسیر پوشش داده می‌شود.
     تصاویر assets/… داخل بسته‌ی اپ هم هستند و نسبی می‌مانند (آفلاین کار کنند).
  ─────────────────────────────────────────────────────────── */
  function resolveNewsImage(item) {
    const raw = String((item && (item.image_abs || item.image_url)) || '').trim();
    if (!raw) return '';
    if (/^(https?:)?\/\//i.test(raw) || raw.indexOf('data:') === 0) return raw;
    if (typeof window.eplakResolveMediaUrl === 'function') {
      try {
        const resolved = window.eplakResolveMediaUrl(raw);
        if (resolved) return String(resolved);
      } catch (e) { /* همان نسبی برمی‌گردد */ }
    }
    return raw;
  }
  window.eplakResolveNewsImage = resolveNewsImage;

  /* کارت «چیزی برای نمایش نیست» — تا صفحه خالی نماند و کاربر بداند چرا */
  function emptyContentCard(title, sub) {
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en' : false;
    const t = isEn
      ? (title === 'خبر یا اطلاعیه‌ای ثبت نشده است' ? 'No news yet' : 'No knowledge item yet')
      : title;
    const s = isEn
      ? 'Items added in the admin panel appear here instantly.'
      : (sub || 'هر مطلبی که در پنل مدیریت اضافه شود، بلافاصله اینجا نمایش داده می‌شود.');
    return ''
      + '<div class="glass-card" style="padding:22px 16px; text-align:center;">'
      +   '<div style="font-size:30px; line-height:1;">📭</div>'
      +   '<h4 style="font-size:13px; font-weight:800; margin-top:10px;">' + escapeText(t) + '</h4>'
      +   '<p style="font-size:11px; color:var(--text-muted); margin-top:6px; line-height:1.8;">' + escapeText(s) + '</p>'
      + '</div>';
  }
  window.eplakEmptyContentCard = emptyContentCard;

  /* نوار وضعیت «اخبار از سرور خوانده شد یا نه» (برای تشخیص خالی بودن فهرست) */
  function setNewsNotice(text) {
    const el = document.getElementById('newsSyncNotice');
    if (!el) return;
    if (!text) { el.style.display = 'none'; el.textContent = ''; return; }
    el.textContent = text;
    el.style.display = 'block';
  }

  /* تاریخِ خبر/دانستنی/اعلان «شمسی» است — از core/state.js.
     (toLocaleDateString('fa-IR') روی iOS و بعضی WebViewها میلادی می‌داد، پس
     مسیرِ جایگزین هم از ماژول شمسیِ modules/reports.js می‌آید نه از Intl.) */
  function faDate(value) {
    try {
      if (typeof window.eplakFaDate === 'function') return window.eplakFaDate(value || new Date(), '');
      if (typeof window.eplakFaDateLocal === 'function') return window.eplakFaDateLocal(value || new Date(), '');
      return '';
    } catch (e) {
      return '';
    }
  }

  function faTime(value) {
    try {
      if (typeof window.eplakFaTime === 'function') return window.eplakFaTime(value || new Date(), '');
      if (typeof window.eplakFaTimeLocal === 'function') return window.eplakFaTimeLocal(value || new Date());
      return '';
    } catch (e) {
      return '';
    }
  }

  function escapeText(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ───────────────────────────────────────────────────────────
     اعلان پس‌زمینه (Web Push) — نوتیفیکیشن گوشی در حالت قفل

     زنجیره‌ی کار:
       ۱) ثبت Service Worker (sw.js)
       ۲) گرفتن مجوز اعلان از کاربر
       ۳) ساخت PushSubscription با کلید عمومی VAPID سرور
       ۴) ارسال اشتراک + شماره‌ی کاربر به api/push.php
     پس از این مراحل، اعلان‌های پنل مدیریت حتی وقتی برنامه بسته است
     به‌صورت نوتیفیکیشن سیستمی روی گوشی می‌رسند.
  ─────────────────────────────────────────────────────────── */

  var pushConfigCache = null;
  var pushSyncInFlight = false;

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = atob(base64);
    var output = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) { output[i] = rawData.charCodeAt(i); }
    return output;
  }

  function currentPhoneSafe() {
    try {
      if (typeof getCurrentPhone === 'function') {
        return getCurrentPhone() || '';
      }
      if (typeof userProfile !== 'undefined' && userProfile) {
        return userProfile.rawPhone || userProfile.phone || '';
      }
    } catch (e) {}
    return '';
  }

  /* شناسه‌ی پایدار دستگاه — برای کاربران مهمان که شماره ندارند، تا وضعیت
     «خوانده شدن» هر دستگاه جداگانه نگه داشته شود. */
  function deviceId() {
    var key = 'eplak_device_id';
    try {
      var id = window.localStorage.getItem(key);
      if (!id) {
        id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        window.localStorage.setItem(key, id);
      }
      return id;
    } catch (e) {
      return '';
    }
  }

  /* پل اپ اندروید: در WebView (اپ نصب‌شده روی گوشی) نه Service Worker کار می‌کند
     و نه Push API؛ پس نوتیفیکیشن سیستمی از طریق خود اندروید نمایش داده می‌شود.
     (اعلان در حالت «بسته بودن کامل اپ» به FCM نیاز دارد — فایل APK.) */
  function nativeBridge() {
    try {
      if (window.AndroidApp && typeof window.AndroidApp.showNotification === 'function') {
        return window.AndroidApp;
      }
    } catch (e) {}
    return null;
  }

  /* سکوی همین اپ برای «ضربان اپ‌ها» در پنل: android (پل AndroidApp)، ios (پوسته‌ی
     WKWebView که window.EPLAK_IOS_APP را تزریق می‌کند)، وگرنه web (سایت/PWA). */
  function appPlatform() {
    try {
      if (nativeBridge()) return 'android';
      if (window.EPLAK_IOS_APP === true) return 'ios';
    } catch (e) {}
    return 'web';
  }
  window.eplakAppPlatform = appPlatform;

  /* پروژه‌ی فایربیسی که خودِ APK با آن ساخته شده (از google-services.json داخل
     اپ). اپ‌های قدیمی این متد را ندارند → {} */
  function nativeFcmProject() {
    var bridge = nativeBridge();
    if (!bridge || typeof bridge.getFcmProject !== 'function') return {};
    try {
      var parsed = JSON.parse(String(bridge.getFcmProject() || '{}'));
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  /* آیا اعلان سیستمی روی این دستگاه ممکن است؟ */
  function pushCapability() {
    if (nativeBridge()) {
      var fcmReady = false;
      try {
        if (typeof nativeBridge().isFcmReady === 'function') {
          fcmReady = !!nativeBridge().isFcmReady();
        }
      } catch (e) {}
      return { can: true, kind: 'android_native', fcm: fcmReady };
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return { can: false, kind: 'unsupported' };
    }
    return { can: true, kind: 'webpush', permission: Notification.permission };
  }
  window.eplakPushCapability = pushCapability;

  async function fetchPushConfig() {
    if (pushConfigCache) return pushConfigCache;
    try {
      const res = await fetch(apiBase() + '/push.php?action=config', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || data.success !== true) return null;
      pushConfigCache = data;
      return data;
    } catch (e) {
      return null;
    }
  }

  function ensureServiceWorker() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration().then(function (existing) {
      if (existing) return existing;
      return navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('[push] sw register failed', err && err.message);
        return null;
      });
    }).catch(function () { return null; });
  }

  /* ساخت/به‌روزرسانی اشتراک و ثبت آن روی سرور */
  async function subscribeToPush(options) {
    var opts = options || {};
    if (nativeBridge()) {
      /* داخل اپ اندروید: به‌جای Web Push، نوتیفیکیشن سیستمی از پل اندروید
         گرفته می‌شود؛ پس اشتراک مرورگری لازم نیست. */
      var grantedNative = true;
      try {
        if (typeof window.AndroidApp.notificationsEnabled === 'function') {
          grantedNative = !!window.AndroidApp.notificationsEnabled();
        }
        if (!grantedNative && typeof window.AndroidApp.requestNotificationPermission === 'function' && opts.askPermission) {
          window.AndroidApp.requestNotificationPermission();
        }
      } catch (e) {}
      return { ok: grantedNative, reason: grantedNative ? 'android_native' : 'permission_denied', native: true };
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { ok: false, reason: 'push_not_supported' };
    }
    if (pushSyncInFlight) return { ok: false, reason: 'busy' };

    var permission = ('Notification' in window) ? Notification.permission : 'denied';
    if (permission === 'denied') {
      return { ok: false, reason: 'permission_denied' };
    }
    if (permission === 'default' && !opts.askPermission) {
      return { ok: false, reason: 'permission_default' };
    }
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch (e) {
        return { ok: false, reason: 'permission_error' };
      }
      if (permission !== 'granted') {
        return { ok: false, reason: 'permission_denied' };
      }
    }

    pushSyncInFlight = true;
    try {
      const config = await fetchPushConfig();
      if (!config || !config.vapid_public_key) {
        return { ok: false, reason: 'server_not_ready', details: config && config.reason };
      }

      const registration = await ensureServiceWorker();
      if (!registration) return { ok: false, reason: 'sw_unavailable' };

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.vapid_public_key)
        });
      }

      const payload = {
        phone: currentPhoneSafe(),
        subscription: subscription.toJSON ? subscription.toJSON() : subscription
      };

      const res = await fetch(apiBase() + '/push.php?action=subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(function () { return null; });
      if (!data || data.success !== true) {
        return { ok: false, reason: 'save_failed', details: data && data.error };
      }
      console.log('[push] subscription saved for', payload.phone || 'guest');
      return { ok: true, devices: data.devices };
    } catch (err) {
      console.warn('[push] subscribe failed', err && err.message);
      return { ok: false, reason: 'exception', details: err && err.message };
    } finally {
      pushSyncInFlight = false;
    }
  }
  window.subscribeToPush = subscribeToPush;

  /* فراخوانی خودکار پس از ورود کاربر یا در هر بار باز شدن برنامه */
  async function syncPushSubscription() {
    if (nativeBridge()) {
      /* در اپ اندروید، هر بار باز شدن، وضعیت را با سیستم‌عامل چک می‌کنیم
         (اگر کاربر بعداً اجازه دهد، همان‌جا فعال می‌شود) */
      try {
        if (window.AndroidApp && typeof window.AndroidApp.ensureNotificationChannel === 'function') {
          window.AndroidApp.ensureNotificationChannel();
        }
      } catch (e) {}
      return { ok: true, reason: 'android_native', native: true };
    }
    if (!('Notification' in window)) return { ok: false, reason: 'push_not_supported' };
    if (Notification.permission === 'granted') {
      return await subscribeToPush({});
    }
    return { ok: false, reason: 'permission_' + Notification.permission };
  }
  window.syncPushSubscription = syncPushSubscription;

  function requestPushPermission() {
    /* در اپ اندروید: اجازه‌ی اعلان از خود اندروید گرفته می‌شود */
    if (nativeBridge()) {
      return subscribeToPush({ askPermission: true }).then(function (result) {
        if (typeof window.eplakOnPushResult === 'function') window.eplakOnPushResult(result);
        return result;
      });
    }
    if (!('Notification' in window)) {
      var unsupported = { ok: false, reason: 'push_not_supported' };
      if (typeof window.eplakOnPushResult === 'function') window.eplakOnPushResult(unsupported);
      return Promise.resolve(unsupported);
    }
    if (Notification.permission === 'default') {
      return subscribeToPush({ askPermission: true }).then(function (result) {
        if (result && result.ok) {
          console.log('[push] اعلان‌های پس‌زمینه فعال شد');
        }
        if (typeof window.eplakOnPushResult === 'function') window.eplakOnPushResult(result);
        return result;
      });
    }
    if (Notification.permission === 'granted') {
      /* کاربر قبلاً اجازه داده است؛ فقط اشتراک را با شماره‌ی فعلی تازه می‌کنیم
         (مثلاً پس از ورود با شماره‌ی جدید روی همان گوشی) */
      return syncPushSubscription().then(function (result) {
        if (typeof window.eplakOnPushResult === 'function') window.eplakOnPushResult(result);
        return result;
      });
    }
    var denied = { ok: false, reason: 'permission_denied' };
    if (typeof window.eplakOnPushResult === 'function') window.eplakOnPushResult(denied);
    return Promise.resolve(denied);
  }
  window.requestPushPermission = requestPushPermission;

  function triggerDeviceNotification(title, body, id) {
    // 0. اپ اندروید (WebView): نوتیفیکیشن سیستمی از خودِ اندروید
    var bridge = nativeBridge();
    if (bridge) {
      /* اپ اندروید: نوتیفیکیشن سیستمی توسط خود اندروید نمایش داده می‌شود
         (صدای پیش‌فرض گوشی هم از همان‌جا پخش می‌شود). اما اعلان «داخل خود اپ»
         (بنر بالای صفحه) هم باید نمایش داده شود؛ پس return نمی‌کنیم. */
      var shownNative = false;
      try {
        bridge.showNotification(String(title || 'اعلان ای‌پلاک'), String(body || ''), String(id == null ? '' : id));
        shownNative = true;
      } catch (e) {
        console.warn('[push] android notification failed:', e);
      }
      if (shownNative) {
        showLiveAnnouncementBanner(title, body);
        return;
      }
      /* اگر پل اندروید کار نکرد، مسیر مرورگر ادامه پیدا می‌کند */
    }

    // 1. نوتیفیکیشن سیستمی (از طریق Service Worker تا در پس‌زمینه هم پایدار باشد)
    if ('Notification' in window && Notification.permission === 'granted') {
      var iconPath = 'assets/img/logo.png';
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then(function (reg) {
            reg.showNotification(title, {
              body: body,
              icon: iconPath,
              badge: iconPath,
              dir: 'rtl',
              tag: 'eplak-' + id,
              renotify: true,
              vibrate: [200, 100, 200],
              data: { url: 'index.html', id: id }
            });
          }).catch(function () {
            try { new Notification(title, { body: body, icon: iconPath, tag: 'eplak-' + id }); } catch (e2) {}
          });
        } else {
          new Notification(title, { body: body, icon: iconPath, tag: 'eplak-' + id });
        }
      } catch (e) {
        console.warn('[push] device notification error:', e);
      }
    }

    // 2. Play Sound Chime
    try {
      if (window.soundManager && typeof window.soundManager.playNotification === 'function') {
        window.soundManager.playNotification();
      }
    } catch (e) {}

    // 3. Show Dynamic In-App Banner
    showLiveAnnouncementBanner(title, body);
  }

  function showLiveAnnouncementBanner(title, body) {
    var banner = document.getElementById('eplakLiveNotifBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'eplakLiveNotifBanner';
      banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-120%);width:92%;max-width:440px;background:rgba(15,23,42,0.96);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);color:#fff;border-radius:20px;padding:14px 18px;border:1.5px solid rgba(0,201,167,0.45);box-shadow:0 18px 45px rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:flex-start;gap:14px;direction:rtl;font-family:Vazirmatn,sans-serif;transition:all 0.45s cubic-bezier(0.34,1.56,0.64,1);cursor:pointer;';
      document.body.appendChild(banner);
    }

    banner.innerHTML = '<div style="width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,rgba(0,201,167,0.25),rgba(15,118,110,0.4));color:#00c9a7;display:grid;place-items:center;font-size:22px;flex-shrink:0;box-shadow:0 0 15px rgba(0,201,167,0.3);">' +
      (window.EplakIcons ? window.EplakIcons.get('megaphone', { size: 22 }) : '📢') +
      '</div>' +
      '<div style="flex:1;min-width:0;">' +
      '  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
      '    <strong style="font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeText(title) + '</strong>' +
      '    <span style="font-size:10.5px;color:#00c9a7;background:rgba(0,201,167,0.15);padding:2px 7px;border-radius:10px;flex-shrink:0;">اعلان فوری</span>' +
      '  </div>' +
      '  <p style="font-size:12.5px;color:rgba(255,255,255,0.85);margin:4px 0 0;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + escapeText(body) + '</p>' +
      '</div>';

    banner.onclick = function () {
      banner.style.transform = 'translateX(-50%) translateY(-120%)';
      banner.style.opacity = '0';
      if (typeof showScreen === 'function') {
        showScreen('screen-notifications');
      }
    };

    requestAnimationFrame(function () {
      banner.style.transform = 'translateX(-50%) translateY(0)';
      banner.style.opacity = '1';
    });

    if (banner._dismissTimer) clearTimeout(banner._dismissTimer);
    banner._dismissTimer = setTimeout(function () {
      banner.style.transform = 'translateX(-50%) translateY(-120%)';
      banner.style.opacity = '0';
    }, 7000);
  }

  /* ───────────────────────────────────────────────────────────
     اخبار و دانستنی‌ها
  ─────────────────────────────────────────────────────────── */
  function applyNews(items) {
    if (typeof newsData === 'undefined' || !Array.isArray(items)) return;

    const news = items.filter(function (i) { return i.type === 'news'; });
    const tips = items.filter(function (i) { return i.type === 'tip'; });

    /* تب «اخبار و اطلاعات» — فهرست «همیشه» با پاسخ سرور به‌روز می‌شود.
       پیش‌تر فقط وقتی سرور مطلب داشت به‌روز می‌شد؛ یعنی اگر مدیر همه را حذف
       کرده بود (یا جدول news خالی بود) نمونه‌های پیش‌فرضِ داخل کد به‌جای
       واقعیت دیده می‌شدند و کاربر فکر می‌کرد پنل کار نمی‌کند. */
    newsData.length = 0;
    news.forEach(function (n) {
      newsData.push({
        id: 'srv-' + n.id,
        title: n.title,
        date: faDate(n.updated_at),
        icon: n.icon || '📰',
        badge: n.badge || '',
        image: resolveNewsImage(n),
        summary: n.summary || '',
        body: n.body
      });
    });
    if (typeof renderNewsList === 'function') renderNewsList();

    /* تب «دانستنی‌های ورامین» */
    renderTips(tips);

    /* نوار «آخرین اخبار» در پیشخوان */
    renderDashStrip(newsData.slice(0, 2));
  }

  /* کارت‌های «دانستنی‌های ورامین» — همان ظاهر کارت‌های قدیمی سایت، ولی
     محتوایشان از پنل مدیریت (جدول news با type=tip) می‌آید. */
  function renderTips(tips) {
    let wrap = document.getElementById('knowledgeListWrap');
    if (!wrap) return;

    window.__EPLAK_TIPS__ = tips;

    if (!tips.length) {
      /* اگر سرور در دسترس نبود، محتوای پیش‌فرض (همان دو بنای تاریخی) نمایش داده
         می‌شود تا صفحه خالی نماند. اگر سرور پاسخ داده و ادمین همه را حذف کرده،
         به‌جای صفحه‌ی خالی، کارتِ راهنما نمایش داده می‌شود. */
      wrap.innerHTML = window.__EPLAK_NEWS_SYNC_OK__
        ? emptyContentCard('دانستنی‌ای ثبت نشده است')
        : builtinHeritageCards();
      return;
    }

    wrap.innerHTML = tips.map(function (t) {
      /* کارت تصویری (سبک کارت‌های میراث فرهنگی) */
      const tipImage = resolveNewsImage(t);
      if (tipImage) {
        return ''
          + '<div class="heritage-card" onclick="openTipDetail(\'srv-' + t.id + '\')">'
          +   '<div class="heritage-photo-layer">'
          +     '<img src="' + escapeText(tipImage) + '" alt="' + escapeText(t.title) + '" class="heritage-photo" loading="lazy">'
          +   '</div>'
          +   '<div class="heritage-shade"></div>'
          +   (t.badge ? '<span class="heritage-pin">' + escapeText(t.badge) + '</span>' : '')
          +   '<div class="heritage-info">'
          +     '<h4>' + escapeText(t.title) + '</h4>'
          +     '<p>' + escapeText(t.summary || '') + '</p>'
          +     '<span class="heritage-readmore">مطالعه بیشتر ←</span>'
          +   '</div>'
          + '</div>';
      }

      /* کارت ساده (بدون تصویر) */
      return ''
        + '<div class="glass-card" style="padding:14px; display:flex; gap:12px; align-items:flex-start; cursor:pointer;"'
        + ' onclick="openTipDetail(\'srv-' + t.id + '\')">'
        + '<div class="promo-img" style="width:60px; height:60px; flex-shrink:0;">'
        +   '<div class="promo-img-bg">' + (window.EplakIcons ? window.EplakIcons.get(t.icon || '🏛️') : escapeText(t.icon || '🏛️')) + '</div></div>'
        + '<div style="flex:1; text-align:right;">'
        +   '<h4 style="font-size:13px; font-weight:700; line-height:1.5;">' + escapeText(t.title) + '</h4>'
        +   (t.badge ? '<span style="font-size:10px; color:var(--teal);">' + escapeText(t.badge) + '</span>' : '')
        +   '<p style="font-size:11px; color:var(--text-muted); margin-top:4px; line-height:1.6;">' + escapeText(t.summary || '') + '</p>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  /* نسخه‌ی پیش‌فرض کارت‌های میراثی (فقط برای حالت بدون اینترنت) */
  function builtinHeritageCards() {
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : false;
    const heritage = (isEn && window.heritageData_EN) ? window.heritageData_EN : (window.__EPLAK_HERITAGE__ || null);
    const list = heritage ? ['mosque', 'tower'] : [];
    if (!list.length) return '';

    return list.map(function (key) {
      const h = heritage[key];
      if (!h) return '';
      return ''
        + '<div class="heritage-card" onclick="openHeritageDetail(\'' + key + '\')">'
        +   '<div class="heritage-photo-layer">'
        +     '<img src="' + escapeText(h.img) + '" alt="' + escapeText(h.title) + '" class="heritage-photo' + (h.photoClass || '') + '">'
        +   '</div>'
        +   '<div class="heritage-shade"></div>'
        +   (h.pin ? '<span class="heritage-pin">' + escapeText(h.pin) + '</span>' : '')
        +   '<div class="heritage-info">'
        +     '<h4>' + escapeText(h.title) + '</h4>'
        +     '<p>' + escapeText(String(h.body || '').split('\n')[0].slice(0, 150)) + '</p>'
        +     '<span class="heritage-readmore">مطالعه بیشتر ←</span>'
        +   '</div>'
        + '</div>';
    }).join('');
  }

  function renderDashStrip(items) {
    const wrap = document.getElementById('dashNewsWrap');
    if (!wrap) return;
    if (!items.length) {
      /* پیش‌تر فهرست قدیمی سر جایش می‌ماند؛ حالا صادقانه «خالی» می‌شود */
      wrap.innerHTML = emptyContentCard('خبر یا اطلاعیه‌ای ثبت نشده است');
      return;
    }
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const source = (isEn && window.newsData_EN) ? window.newsData_EN : items;
    wrap.innerHTML = source.slice(0, 2).map(function (n) {
      return ''
        + '<div class="mini-news-card" onclick="openNewsDetail(\'' + n.id + '\')">'
        +   '<div class="mini-news-text" style="text-align:' + (isEn ? 'left' : 'right') + ';">'
        +     '<h4>' + escapeText(n.title) + '</h4>'
        +     '<p>' + escapeText(n.date) + '</p>'
        +   '</div>'
        +   '<div class="mini-news-icon">' + (window.EplakIcons ? window.EplakIcons.get(n.icon) : escapeText(n.icon)) + '</div>'
        + '</div>';
    }).join('');
  }
  window.renderDashStrip = renderDashStrip;

  window.openTipDetail = function (id) {
    const list = window.__EPLAK_TIPS__ || [];
    const t = list.find(function (x) { return 'srv-' + x.id === id; });
    if (!t) return;

    /* دانستنی‌های تصویری (مثل بناهای تاریخی) در همان صفحه‌ی جزئیات میراث نمایش
       داده می‌شوند تا تصویر بزرگ و نشان بالای آن حفظ شود. */
    const tipImage = resolveNewsImage(t);
    if (tipImage && document.getElementById('heritageDetailImg')) {
      const bigImg = document.getElementById('heritageDetailImg');
      bigImg.src = tipImage;
      bigImg.alt = t.title;
      bigImg.className = 'heritage-photo';
      const pin = document.getElementById('heritageDetailPin');
      if (pin) pin.textContent = t.badge || '';
      const hTitle = document.getElementById('heritageDetailTitle');
      if (hTitle) hTitle.textContent = t.title;
      const hBody = document.getElementById('heritageDetailBody');
      if (hBody) hBody.textContent = t.body;
      const tags = document.getElementById('heritageDetailTags');
      if (tags) tags.innerHTML = '';
      if (typeof showScreen === 'function') showScreen('screen-heritage-detail');
      return;
    }

    const img = document.getElementById('newsDetailImg');
    const title = document.getElementById('newsDetailTitle');
    const date = document.getElementById('newsDetailDate');
    const body = document.getElementById('newsDetailBody');
    if (img) img.innerHTML = window.EplakIcons ? window.EplakIcons.get(t.icon || '🏛️') : (t.icon || '🏛️');
    if (title) title.textContent = t.title;
    if (date) date.textContent = faDate(t.updated_at);
    if (body) body.textContent = t.body;
    if (typeof showScreen === 'function') showScreen('screen-news-detail');
  };

  /* ───────────────────────────────────────────────────────────
     اعلان‌ها و همگام‌سازی بلادرنگ
  ─────────────────────────────────────────────────────────── */
  function applyNotifications(items) {
    if (typeof notifications === 'undefined' || !Array.isArray(items)) return;

    var newItemsFound = [];

    items.forEach(function (n) {
      const sid = 'srv-' + n.id;
      const numericId = parseInt(n.id, 10);

      const exists = notifications.some(function (x) {
        return String(x.id) === sid || String(x.id) === String(numericId);
      });

      if (exists) {
        const local = notifications.find(function (x) {
          return String(x.id) === sid || String(x.id) === String(numericId);
        });
        if (local && n.read_flag === 1) local.read = true;
      } else {
        var notifObj = {
          id: sid,
          title: n.title,
          body: n.body,
          read: n.read_flag === 1,
          time: faTime(n.created_at),
          date: faDate(n.created_at),
          icon: '🔔'
        };
        notifications.unshift(notifObj);

        if (!isInitialNotifs && !seenNotifIds.has(numericId)) {
          newItemsFound.push(n);
        }
      }

      seenNotifIds.add(numericId);
    });

    if (typeof saveNotifications === 'function') {
      try { saveNotifications(); } catch (e) {}
    }
    if (typeof renderNotifications === 'function') {
      try { renderNotifications(); } catch (e) {}
    }

    /* اگر قبلاً (به‌خاطر قطعی اینترنت) گزارش «خوانده شد» ارسال نشده بود، حالا
       که سرور پاسخ داده دوباره تلاش می‌کنیم */
    if (typeof window.flushPendingReadReports === 'function') {
      try { window.flushPendingReadReports(); } catch (e) {}
    }
    /* «حذف‌های» عقب‌افتاده (وقتی اینترنت نبود) حالا به سرور می‌رسند */
    if (typeof window.flushPendingDeleteNotifs === 'function') {
      try { window.flushPendingDeleteNotifs(); } catch (e) {}
    }

    // Trigger alerts for newly arrived announcements
    if (!isInitialNotifs && newItemsFound.length > 0) {
      var latest = newItemsFound[0];
      triggerDeviceNotification(latest.title, latest.body, latest.id);
    }

    isInitialNotifs = false;
  }

  /* ───────────────────────────────────────────────────────────
     همگام‌سازی
  ─────────────────────────────────────────────────────────── */
  async function syncNews() {
    try {
      const res = await fetch(apiBase() + '/news.php?limit=50', { cache: 'no-store' });
      if (!res.ok) {
        window.__EPLAK_NEWS_SYNC_OK__ = false;
        setNewsNotice('⚠️ اخبار از سرور خوانده نشد (کد ' + res.status + ')؛ فهرست پیش‌فرض نمایش داده می‌شود.');
        return false;
      }
      const data = await res.json();
      if (!data || data.success !== true) {
        /* پاسخ ۲۰۰ ولی ناموفق: یعنی ساختار دیتابیس مشکل دارد (api/news.php
           دیگر هرگز ۵۰۰ نمی‌دهد). پیامِ راهنمای سرور نشان داده می‌شود. */
        window.__EPLAK_NEWS_SYNC_OK__ = false;
        setNewsNotice('⚠️ ' + String((data && data.hint) || 'اخبار از سرور خوانده نشد؛ فهرست پیش‌فرض نمایش داده می‌شود.'));
        return false;
      }
      /* پرچم موفقیت: برای تشخیص «سرور پاسخ داده ولی فهرست خالی است» از
         «سرور در دسترس نیست» — در حالت دوم محتوای پیش‌فرض نمایش داده می‌شود */
      window.__EPLAK_NEWS_SYNC_OK__ = true;
      setNewsNotice('');
      applyNews(data.items || []);
      return true;
    } catch (e) {
      window.__EPLAK_NEWS_SYNC_OK__ = false;
      setNewsNotice('⚠️ ارتباط با سرور برقرار نشد؛ فهرست پیش‌فرض نمایش داده می‌شود.');
      return false;
    }
  }

  async function syncNotifications() {
    try {
      var phone = '';
      if (typeof getCurrentPhone === 'function') {
        phone = getCurrentPhone();
      }
      if (!phone && typeof userProfile !== 'undefined') {
        phone = userProfile.rawPhone || userProfile.phone || '';
      }

      // If user hasn't logged in, query broadcast notifications ('all')
      var queryPhone = phone || 'all';
      /* شناسه‌ی همین دستگاه هم فرستاده می‌شود: «خوانده/حذف‌شده» بودن اعلان‌ها
         روی سرور با کلید (شماره + دستگاه) ثبت می‌شود. بدون device، کاربر
         مهمان هر بار اعلان‌های خوانده‌شده را دوباره خوانده‌نشده می‌دید و
         «خوانده شد»ها بین چند گوشی یک نفر هم قاطی می‌شد. */
      /* app/v/prev فقط برای «ضربان اپ‌ها» در پنل است (سرور با آن‌ها چیزی را فیلتر
         نمی‌کند): کدام اپ، با کدام نسخه، و درخواست قبلی‌اش چه شد. */
      var query = 'phone=' + encodeURIComponent(queryPhone)
                + '&device=' + encodeURIComponent(deviceId())
                + '&app=' + encodeURIComponent(appPlatform())
                + '&v=' + encodeURIComponent(LIVE_VERSION)
                + '&prev=' + encodeURIComponent(lastPollOutcome)
                + '&t=' + Date.now();
      const res = await fetch(apiBase() + '/notifications.php?' + query, { cache: 'no-store' });
      const data = await res.json().catch(function () { return null; });

      if (!res.ok || !data || data.success !== true) {
        lastPollOutcome = !res.ok ? ('http:' + res.status) : (!data ? 'json' : 'fail');
        /* پیش‌تر این‌جا فقط «false» برگردانده می‌شد و هیچ سرنخی نمی‌ماند که چرا
           فهرست اعلان‌ها خالی مانده (مثلاً ستون send_id در دیتابیس قدیمیِ هاست
           وجود نداشت و سرور ۵۰۰ می‌داد). علت/راهنمای سرور نگه داشته می‌شود
           (کنسول + eplakPushState) و فهرست محلیِ قبلی هم پاک نمی‌شود. */
        setServerNotificationNotice(
          (data && (data.hint || data.error))
            || (!res.ok ? 'سرور اعلان‌ها پاسخ خطا داد (کد ' + res.status + '). کمی بعد دوباره تلاش می‌شود.' : '')
            || 'خواندن اعلان‌ها از سرور ممکن نشد.'
        );
        return false;
      }

      /* degraded = دیتابیس سرور قدیمی است و اعلان‌ها در «حالت سازگار» می‌آیند */
      setServerNotificationNotice(
        (Array.isArray(data.degraded) && data.degraded.length && data.hint) ? data.hint : ''
      );
      var list = Array.isArray(data.notifications) ? data.notifications : [];
      lastPollOutcome = 'ok:' + list.length;
      applyNotifications(list);
      return true;
    } catch (e) {
      lastPollOutcome = 'net:' + String((e && (e.name || e.message)) || 'error').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 24);
      return false;
    }
  }

  window.syncNotifications = syncNotifications;

  async function syncReportsLive() {
    try {
      var phone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';
      if (phone && typeof loadReportsFromBackend === 'function') {
        await loadReportsFromBackend(phone, { silent: true });
      }
    } catch (e) {}
  }

  window.syncLiveContent = async function () {
    if (isSyncing) return;
    isSyncing = true;
    try {
      await syncNotifications();
      await syncReportsLive();
    } finally {
      isSyncing = false;
    }
  };

  /* ───────────────────────────────────────────────────────────
     «خوانده شد» را به سرور اطلاع می‌دهیم

     بدون این کار، وضعیت فقط داخل خود گوشی ذخیره می‌شد و پنل ادمین همیشه
     «خوانده نشده» نشان می‌داد. آرگومان‌ها:
       ids : یک شناسه یا آرایه‌ای از شناسه‌ها (با یا بدون پیشوند srv-)
       all : اگر true باشد، همه‌ی اعلان‌های همین کاربر علامت می‌خورند
  ─────────────────────────────────────────────────────────── */
  function notificationIdsForServer(ids) {
    var out = [];
    (Array.isArray(ids) ? ids : [ids]).forEach(function (value) {
      if (value === null || value === undefined) return;
      var v = String(value).replace(/^srv-/, '').trim();
      if (/^[0-9]+$/.test(v)) out.push(parseInt(v, 10));
    });
    return out;
  }

  /* ───────────────────────────────────────────────────────────
     ثبت دستگاه اندروید روی سرور (برای اعلان در حالت بسته بودن اپ)

     توکن فایربیس را خود اندروید می‌سازد؛ ما آن را با شماره‌ی کاربر به
     api/push.php می‌فرستیم تا پنل مدیریت بتواند اعلان را حتی وقتی اپ بسته است
     به گوشی برساند. اگر پروژه‌ی فایربیس راه‌اندازی نشده باشد، این تابع
     بی‌صدا هیچ کاری نمی‌کند.

     چرا این‌قدر محتاط؟ اگر ثبت گوشی یک‌بار شکست بخورد (اینترنت قطع، توکن هنوز
     از گوگل نرسیده، خطای موقت سرور) و دوباره تلاش نشود، هیچ اعلان پنلی
     (در حال رسیدگی / انجام شد / پاسخ) به آن گوشی نمی‌رسد؛ بدون هیچ پیام خطایی.
     پس:
       • توکن از اندروید «غیرهمگام» می‌رسد → تلاش‌های پله‌ای ۲/۴/۸/۱۶/۳۰ ثانیه،
       • خطای شبکه/سرور → همان تلاش‌های پله‌ای،
       • ثبت موفق هم هر ۶ ساعت تازه می‌شود (جلوگیری از «گوشی ثبت‌شده ولی منقضی»)،
       • وضعیت (توکن؟ ثبت؟ خطا؟) برای نمایش در صفحه‌ی اعلان‌ها نگه داشته می‌شود.
  ─────────────────────────────────────────────────────────── */
  var FCM_REGISTER_TTL = 6 * 60 * 60 * 1000;
  var FCM_RETRY_DELAYS = [2000, 4000, 8000, 16000, 30000];
  var FCM_RETRY_MAX = 14;
  /* serverReady/serverReason = وضعیتِ «کلید سرویس فایربیس» سمت سرور (از پاسخِ
     register_fcm و push.php?action=config). بدون این، اپ حتی وقتی سرور کلید نداشت
     «✅ ثبت شده است» می‌گفت و کاربر دلیل نرسیدن اعلان را نمی‌فهمید. */
  var fcmState = { token: false, registered: false, attached: false, phone: '', reason: '',
                   attempts: 0, at: 0, serverReady: null, serverReason: '',
                   /* پروژه‌ی فایربیس اپ (از خود APK) و پروژه‌ی کلید سرویس روی سرور؛
                      projectMatch=false یعنی گوگل ارسال را با SenderId mismatch رد می‌کند */
                   appProject: '', keyProject: '', projectMatch: null };
  /* پیام سرور درباره‌ی وضعیت جدول اعلان‌ها (دیتابیس قدیمی/خطای خواندن).
     کادر نمایشِ آن در صفحه‌ی اعلان‌ها به درخواست مالک حذف شد؛ پیام فقط برای
     عیب‌یابی نگه داشته می‌شود (کنسول و خروجی eplakPushState). */
  var serverNoticeLine = '';
  var fcmRetryTimer = null;
  var fcmRetryCount = 0;
  var fcmInFlight = null;
  var FCM_FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' };

  /* fetch با مهلت: اگر اینترنت گوشی «گیر» کند، درخواست ثبت گوشی نباید تا ابد
     معلق بماند و ثبت‌های بعدی را هم پشت خودش نگه دارد. */
  function fcmFetch(url, options, timeoutMs) {
    var opts = options || {};
    var timer = null;
    try {
      if (typeof AbortController === 'function') {
        var controller = new AbortController();
        opts.signal = controller.signal;
        timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, timeoutMs || 20000);
      }
    } catch (e) {}
    return fetch(url, opts).then(function (res) {
      if (timer) clearTimeout(timer);
      return res;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  /* ارسال یک درخواست به api/push.php: اول «فرم ساده»؛ اگر فایروال/پروکسی هاست آن را
     با صفحه‌ی HTML رد کرد (۴۰۳/۴۰۶…)، همان فیلدها یک‌بار به‌صورت JSON با نوع
     «text/plain» (بدون پیش‌پرواز CORS) فرستاده می‌شود. سرور هر دو قالب را می‌خواند. */
  async function postFcm(fields, timeoutMs) {
    var form = new URLSearchParams();
    Object.keys(fields).forEach(function (key) { form.append(key, fields[key]); });
    var res = await fcmFetch(apiBase() + '/push.php', {
      method: 'POST',
      headers: FCM_FORM_HEADERS,
      body: form.toString()
    }, timeoutMs);
    var data = await res.json().catch(function () { return null; });
    if (data === null && !res.ok) {
      res = await fcmFetch(apiBase() + '/push.php', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(fields)
      }, timeoutMs);
      data = await res.json().catch(function () { return null; });
    }
    return { res: res, data: data };
  }

  function fcmFail(reason, details) {
    fcmState.registered = false;
    fcmState.reason = reason;
    fcmState.attempts += 1;
    fcmState.at = Date.now();
    return { ok: false, reason: reason, details: details };
  }

  function scheduleFcmRetry() {
    if (fcmRetryTimer || fcmRetryCount >= FCM_RETRY_MAX) return;
    var delay = FCM_RETRY_DELAYS[Math.min(fcmRetryCount, FCM_RETRY_DELAYS.length - 1)];
    fcmRetryCount += 1;
    fcmRetryTimer = setTimeout(function () {
      fcmRetryTimer = null;
      registerAppDevice(false);
    }, delay);
  }

  /* توکن فایربیس از اندروید؛ null = خود پل خطا داد، '' = هنوز نرسیده */
  function readFcmToken(bridge) {
    var token = '';
    try {
      token = String(bridge.getFcmToken() || '');
      if (token === '' && typeof bridge.refreshFcmToken === 'function') {
        try { bridge.refreshFcmToken(); } catch (e) {}
        token = String(bridge.getFcmToken() || '');
      }
    } catch (e) {
      return null;
    }
    return token;
  }

  async function doRegisterAppDevice(bridge, force) {
    var token = readFcmToken(bridge);
    if (token === null) return fcmFail('bridge_error');
    fcmState.token = token !== '';
    if (token === '') {
      /* اندروید توکن را غیرهمگام از گوگل می‌گیرد؛ چند ثانیه بعد دوباره می‌پرسیم
         (و وقتی توکن رسید، خود اندروید هم eplakOnFcmToken را صدا می‌زند) */
      scheduleFcmRetry();
      return fcmFail('no_fcm_token');
    }

    var phone = currentPhoneSafe();
    var signature = token + '|' + phone;
    var lastSent = '';
    var lastAt = 0;
    try {
      lastSent = window.localStorage.getItem('eplak_fcm_registered') || '';
      lastAt = parseInt(window.localStorage.getItem('eplak_fcm_registered_at') || '0', 10) || 0;
    } catch (e) {}

    /* ثبت تکراری لازم نیست؛ ولی نه برای همیشه: بعد از ۶ ساعت دوباره ثبت می‌شود */
    if (!force && lastSent === signature && (Date.now() - lastAt) < FCM_REGISTER_TTL) {
      fcmState.registered = true;
      fcmState.attached = phone !== '';
      fcmState.phone = phone;
      fcmState.reason = '';
      /* «قبلاً ثبت شده» یعنی توکن روی سرور هست، نه اینکه سرور بتواند بفرستد.
         سبک‌بار: فقط از کشِ پاسخِ config می‌خوانیم و درخواستِ تازه نمی‌زنیم. */
      refreshServerFcmState(true);
      return { ok: true, reason: 'already_registered' };
    }

    try {
      var fields = { action: 'register_fcm', phone: phone, token: token, platform: 'android' };
      /* اپ می‌گوید با کدام پروژه‌ی فایربیس ساخته شده تا سرور «کلید از پروژه‌ی
         دیگر» را همان لحظه تشخیص دهد (به‌جای ۴۰۳ SenderId mismatch هنگام ارسال). */
      var project = nativeFcmProject();
      if (project.project_id) fields.project_id = String(project.project_id);
      if (project.sender_id) fields.sender_id = String(project.sender_id);
      if (project.project_id) fcmState.appProject = String(project.project_id);

      var sent = await postFcm(fields, 20000);
      var data = sent.data;
      if (data && data.success === true) {
        try {
          window.localStorage.setItem('eplak_fcm_registered', signature);
          window.localStorage.setItem('eplak_fcm_registered_at', String(Date.now()));
        } catch (e) {}
        fcmRetryCount = 0;
        fcmState.registered = true;
        fcmState.attached = data.attached === true || phone !== '';
        fcmState.phone = phone;
        fcmState.reason = '';
        fcmState.at = Date.now();
        if (typeof data.fcm_ready === 'boolean') fcmState.serverReady = data.fcm_ready;
        fcmState.serverReason = String(data.fcm_reason || '');
        if (data.key_project) fcmState.keyProject = String(data.key_project);
        if (typeof data.project_match === 'boolean') fcmState.projectMatch = data.project_match;
        if (data.project_match === false) {
          console.warn('[fcm] کلید سرویس فایربیس سرور از پروژه‌ی دیگری است: ' + fcmState.serverReason);
        }
        console.log('[fcm] دستگاه اپ ثبت شد');
        return { ok: true, devices: data.devices, fcm_ready: data.fcm_ready, attached: data.attached, project_match: data.project_match };
      }
      scheduleFcmRetry();
      return fcmFail('server', data && data.error);
    } catch (e) {
      scheduleFcmRetry();
      return fcmFail('network', e && e.message);
    }
  }

  var fcmRerun = false;
  var fcmRerunForce = false;

  function registerAppDevice(force) {
    var bridge = nativeBridge();
    if (!bridge || typeof bridge.getFcmToken !== 'function') {
      return Promise.resolve({ ok: false, reason: 'not_android_app' });
    }
    /* هم‌زمان فقط یک ثبت. اگر در همین فاصله چیزی عوض شده باشد (مثلاً کاربر وارد شد
       و شماره دارد، در حالی که ثبتِ در حال انجام با شماره‌ی خالی رفته)، پس از پایان
       آن یک بار دیگر ثبت می‌کنیم؛ درخواست گم نمی‌شود. */
    if (fcmInFlight) {
      fcmRerun = true;
      fcmRerunForce = fcmRerunForce || !!force;
      return fcmInFlight;
    }
    var finish = function (result) {
      fcmInFlight = null;
      if (fcmRerun) {
        var again = fcmRerunForce;
        fcmRerun = false;
        fcmRerunForce = false;
        return registerAppDevice(again);
      }
      return result;
    };
    fcmInFlight = doRegisterAppDevice(bridge, !!force).then(finish, function () {
      fcmInFlight = null;
      return fcmFail('exception');
    });
    return fcmInFlight;
  }
  window.registerAppDevice = registerAppDevice;

  /* اندروید می‌گوید توکن فایربیس رسید/عوض شد (EplakMessagingService.onNewToken) */
  window.eplakOnFcmToken = function () {
    fcmRetryCount = 0;
    return registerAppDevice(false);
  };

  /* خروج صریح از حساب: گوشی از شماره‌ی کاربر جدا می‌شود تا اعلان‌های شخصی او
     به کاربر بعدیِ همین گوشی نرسد. (بستن/خروج از خود اپ، گوشی را جدا نمی‌کند؛
     وگرنه اعلان وقتی اپ بسته است هرگز نمی‌رسید.) */
  window.eplakDetachDevice = function () {
    var bridge = nativeBridge();
    if (!bridge || typeof bridge.getFcmToken !== 'function') {
      return Promise.resolve({ ok: false, reason: 'not_android_app' });
    }
    var token = '';
    try { token = String(bridge.getFcmToken() || ''); } catch (e) {}
    try {
      window.localStorage.removeItem('eplak_fcm_registered');
      window.localStorage.removeItem('eplak_fcm_registered_at');
    } catch (e) {}
    fcmState.registered = false;
    fcmState.attached = false;
    fcmState.phone = '';
    if (!token) return Promise.resolve({ ok: false, reason: 'no_fcm_token' });

    var body = new URLSearchParams();
    body.append('action', 'register_fcm');
    body.append('phone', '');
    body.append('token', token);
    body.append('platform', 'android');
    body.append('detach', '1');
    return fetch(apiBase() + '/push.php', {
      method: 'POST',
      headers: FCM_FORM_HEADERS,
      body: body.toString(),
      keepalive: true
    }).then(function (res) { return res.json(); })
      .then(function (data) { return { ok: !!(data && data.success) }; })
      .catch(function () { return { ok: false, reason: 'network' }; });
  };

  /* کادر وضعیتِ بالای صفحه‌ی اعلان‌ها (با دکمه‌های ارسال اعلان آزمایشی و باز کردن
     تنظیمات اعلان گوشی) به درخواست مالک حذف شد؛ توابع آن دکمه‌ها هم همراهش رفتند.
     ثبت گوشی در سرور، تلاش مجدد و وضعیت عیب‌یابی (eplakPushState) دست‌نخورده‌اند. */

  /* وضعیت فعلی ثبت گوشی برای عیب‌یابی (در کنسول/ریموت دیباگ: eplakPushState()) */
  window.eplakPushState = function () {
    var diag = null;
    try {
      if (window.AndroidApp && typeof window.AndroidApp.getPushDiagnostics === 'function') {
        diag = JSON.parse(String(window.AndroidApp.getPushDiagnostics() || 'null'));
      }
    } catch (e) {}
    return {
      token: fcmState.token, registered: fcmState.registered, attached: fcmState.attached,
      phone: fcmState.phone, reason: fcmState.reason, attempts: fcmState.attempts,
      /* وضعیتِ سمتِ سرور: آیا «کلید سرویس فایربیس» هست و اعلانِ حالتِ بسته می‌رسد؟ */
      serverReady: fcmState.serverReady, serverReason: fcmState.serverReason,
      /* پروژه‌ی فایربیس اپ در برابر پروژه‌ی کلید سرویس سرور (false = SenderId mismatch) */
      appProject: fcmState.appProject, keyProject: fcmState.keyProject, projectMatch: fcmState.projectMatch,
      /* آخرین پیام سرور درباره‌ی جدول اعلان‌ها (دیتابیس قدیمی/خطای خواندن) */
      serverNotice: serverNoticeLine,
      /* نتیجه‌ی آخرین دریافت فهرست اعلان‌ها (ok:N / http:S / json / net:…) و سکوی اپ */
      lastPoll: lastPollOutcome, platform: appPlatform(), version: LIVE_VERSION,
      at: fcmState.at, native: diag
    };
  };

  /* ───────────────────────────────────────────────────────────
     حذف اعلان (فقط از فهرست همین کاربر)

     اعلان‌های پنل ادمین برای همه‌ی کاربران یک ردیف مشترک دارند؛ پس حذف واقعی
     ردیف، اعلان را برای بقیه هم پاک می‌کند. سرور به‌جای پاک کردن، «حذف‌شده برای
     این کاربر» ثبت می‌کند و از این‌پس آن اعلان را برای او نمی‌فرستد.
  ─────────────────────────────────────────────────────────── */
  var pendingDeleteNotifs = [];

  async function deleteNotifications(ids, all) {
    var list = notificationIdsForServer(ids);
    if (!all && !list.length) {
      return { ok: false, reason: 'nothing_to_delete' };
    }

    var payload = {
      action: 'delete',
      phone: currentPhoneSafe(),
      device: deviceId()
    };
    if (all) {
      payload.all = 1;
    } else {
      payload.ids = list.join(',');
    }

    try {
      var body = new URLSearchParams();
      Object.keys(payload).forEach(function (key) { body.append(key, payload[key]); });

      var res = await fetch(apiBase() + '/notifications.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body.toString()
      });
      var data = await res.json().catch(function () { return null; });
      if (data && data.success === true) {
        return { ok: true, data: data };
      }
      return { ok: false, reason: 'server', details: data && data.error };
    } catch (e) {
      return { ok: false, reason: 'network', details: e && e.message };
    }
  }
  window.deleteNotifications = deleteNotifications;

  /* حذف محلی + اطلاع به سرور (اگر اینترنت نبود، در صف می‌ماند) */
  function deleteNotifLocal(ids, all) {
    if (typeof notifications === 'undefined' || !Array.isArray(notifications)) return;
    var wanted = (ids || []).map(function (id) { return String(id); });
    var keep = [];
    notifications.forEach(function (n) {
      var idStr = String(n.id);
      var isServer = idStr.indexOf('srv-') === 0;
      var remove = all
        ? true
        : (wanted.indexOf(idStr) !== -1 || wanted.indexOf(idStr.replace(/^srv-/, '')) !== -1);
      if (remove) {
        /* اعلان‌های سروری باید سمت سرور هم «حذف برای این کاربر» ثبت شوند */
        if (isServer) {
          var numeric = parseInt(idStr.replace(/^srv-/, ''), 10);
          if (numeric > 0) pendingDeleteNotifs.push(numeric);
        }
        return;
      }
      keep.push(n);
    });
    notifications.length = 0;
    Array.prototype.push.apply(notifications, keep);
    if (typeof saveNotifications === 'function') {
      try { saveNotifications(); } catch (e) {}
    }
    if (typeof renderNotifications === 'function') {
      try { renderNotifications(); } catch (e) {}
    }
  }

  /* حذف همه‌ی اعلان‌ها (سرور: حذف برای همین کاربر) */
  function deleteAllNotifications() {
    if (typeof notifications === 'undefined' || !notifications.length) {
      return { ok: true, reason: 'already_empty' };
    }
    deleteNotifLocal(null, true);
    pendingDeleteNotifs.length = 0; /* همه با all حذف می‌شوند */
    return deleteNotifications(null, true).then(function (result) {
      if (result && result.ok === false && result.reason === 'network') {
        pendingDeleteNotifs.push('all');
      }
      return result;
    });
  }
  window.deleteAllNotifications = deleteAllNotifications;

  /* حذف یک اعلان از زبان رابط کاربری (دکمه‌ی سطل‌زباله‌ی هر اعلان) */
  function deleteNotif(id) {
    var isEn = false;
    try {
      isEn = (window.i18n && typeof window.i18n.getLanguage === 'function' && window.i18n.getLanguage() === 'en');
    } catch (e) {}

    var numeric = notificationIdsForServer([id]);
    deleteNotifLocal([id], false);

    if (!numeric.length) {
      if (typeof showToast === 'function') showToast(isEn ? 'Notification deleted' : 'اعلان حذف شد');
      return;
    }
    deleteNotifications(numeric, false).then(function (result) {
      if (result && result.ok === false && result.reason === 'network') {
        pendingDeleteNotifs.push(numeric[0]);
      }
      if (typeof showToast === 'function') showToast(isEn ? 'Notification deleted' : 'اعلان حذف شد');
    });
  }
  window.deleteNotif = deleteNotif;

  async function flushPendingDeleteNotifs() {
    if (!pendingDeleteNotifs.length) return;
    var queue = pendingDeleteNotifs.splice(0, pendingDeleteNotifs.length);
    var all = queue.indexOf('all') !== -1;
    var ids = queue.filter(function (v) { return v !== 'all'; });
    if (all) {
      await deleteNotifications(null, true);
    } else if (ids.length) {
      await deleteNotifications(ids, false);
    }
  }
  window.flushPendingDeleteNotifs = flushPendingDeleteNotifs;

  /* فقط برای آزمون‌های خودکار: صف حذف‌های عقب‌افتاده (بدون امکان تغییر از بیرون) */
  window.eplakPendingDeletes = function () { return pendingDeleteNotifs.slice(); };

  /* بلافاصله پس از هر ثبت درخواست، اعلان‌ها تازه می‌شوند تا پیام
     «درخواست شما ثبت شد» همان لحظه در فهرست و روی گوشی دیده شود. */
  async function refreshNotificationsNow() {
    try {
      await flushPendingDeleteNotifs();
    } catch (e) {}
    return syncNotifications();
  }
  window.refreshNotificationsNow = refreshNotificationsNow;

  async function markNotificationsRead(ids, all) {
    var payload = {
      action: 'read',
      phone: currentPhoneSafe(),
      device: deviceId()
    };
    var list = notificationIdsForServer(ids);
    if (all) {
      payload.all = 1;
    } else if (list.length) {
      payload.ids = list.join(',');
    } else {
      return { ok: false, reason: 'nothing_to_mark' };
    }

    try {
      /* بدنه به‌صورت فرم (application/x-www-form-urlencoded) فرستاده می‌شود؛
         PHP این نوع را خودش در $_POST پارس می‌کند و روی همه‌ی هاست‌ها کار می‌کند. */
      var body = new URLSearchParams();
      Object.keys(payload).forEach(function (key) { body.append(key, payload[key]); });

      var res = await fetch(apiBase() + '/notifications.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body.toString()
      });
      var data = await res.json().catch(function () { return null; });
      return { ok: !!(data && data.success), data: data };
    } catch (e) {
      return { ok: false, reason: 'network', details: e && e.message };
    }
  }
  window.markNotificationsRead = markNotificationsRead;

  /* پرس‌وجوی «آماده بودنِ فایربیس روی سرور» — مستقل از ثبت توکن، تا حتی اگر
     ثبت ناموفق بود هم دلیلِ واقعی (نبودِ کلید سرویس) در eplakPushState دیده شود. */
  function refreshServerFcmState(cachedOnly) {
    if (!nativeBridge()) return Promise.resolve(null);
    /* در حالتِ سبک‌بار (ثبتِ تکراری) هیچ درخواستِ تازه‌ای زده نمی‌شود */
    if (cachedOnly === true && !pushConfigCache) return Promise.resolve(null);
    return fetchPushConfig().then(function (cfg) {
      if (!cfg) return null;
      if (typeof cfg.fcm_ready === 'boolean') fcmState.serverReady = cfg.fcm_ready;
      fcmState.serverReason = String(cfg.fcm_reason || '');
      if (cfg.fcm_key_project) fcmState.keyProject = String(cfg.fcm_key_project);
      if (typeof cfg.fcm_project_match === 'boolean' && fcmState.projectMatch === null) {
        fcmState.projectMatch = cfg.fcm_project_match;
      }
      return cfg;
    }).catch(function () { return null; });
  }

  /* ───────────────────────────────────────────────────────────
     کادر «وضعیت اعلان روی همین دستگاه» در بالای صفحه‌ی اعلان‌ها (متن وضعیت،
     خط ثبت گوشی، دکمه‌های اعلان آزمایشی و تنظیمات اعلان گوشی، هشدار کلید
     فایربیس و پیام سرور) به درخواست مالک «کلاً» حذف شد.
     صفحه‌ی اعلان‌ها حالا فقط فهرست اعلان‌هاست. چیزی که باقی مانده:
       • اجازه‌ی اعلان همچنان با اولین لمس کاربر خودکار پرسیده می‌شود (promptPerm)
       • ثبت گوشی در سرور، تلاش مجدد و جداکردن هنگام خروج، بدون تغییر
       • وضعیت عیب‌یابی فقط برنامه‌نویسی است: window.eplakPushState()
       • پیام سرور درباره‌ی جدول اعلان‌ها فقط در کنسول و eplakPushState().serverNotice
  ─────────────────────────────────────────────────────────── */

  /* پیام وضعیتِ سمت سرور را نگه می‌دارد (خالی = پاک می‌شود)؛ نمایشی در صفحه ندارد */
  function setServerNotificationNotice(message) {
    var next = String(message || '').trim();
    if (next === serverNoticeLine) return;
    serverNoticeLine = next;
    if (next) console.warn('[notifications] سرور: ' + next);
  }
  window.setServerNotificationNotice = setServerNotificationNotice;

  /* نتیجه‌ی درخواست اجازه‌ی اعلان — هم از لایه‌ی وب و هم از خود اندروید
     (MainActivity ← notificationPermissionLauncher) صدا زده می‌شود. اگر کاربر اجازه
     داد، اشتراک/ثبت همان لحظه انجام می‌شود؛ چیزی برای نمایش در صفحه نیست. */
  window.eplakNativePermissionResult = function (granted) {
    if (granted) {
      subscribeToPush({});
    }
  };
  window.eplakOnPushResult = function (result) {
    return result;
  };

  /* پیام‌های Service Worker (اعلان پس‌زمینه) */
  function listenToServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', function (event) {
      const data = event.data || {};
      if (data.action === 'open_notifications') {
        if (typeof showScreen === 'function') showScreen('screen-notifications');
        return;
      }
      if (data.action === 'push_received') {
        /* اعلان از سمت سرور آمد: فهرست داخل برنامه هم بلافاصله تازه شود */
        syncNotifications();
        if (typeof renderNotifications === 'function') {
          try { renderNotifications(); } catch (e) {}
        }
        if (window.soundManager && typeof window.soundManager.playNotification === 'function') {
          try { window.soundManager.playNotification(); } catch (e) {}
        }
      }
    });
  }

  /* راه‌اندازی و بررسی مداوم بلادرنگ (هر ۳.۵ ثانیه) */
  function start() {
    // Initial fetch of news and notifications
    syncNews();
    syncNotifications();

    // Fast real-time polling for instant broadcast notifications and report updates
    setInterval(window.syncLiveContent, 3500);

    // Refresh news every 30 seconds
    setInterval(syncNews, 30000);

    /* در اپ اندروید: ثبت دستگاه برای اعلان فایربیس.
       عمداً «مستقل از Service Worker»: داخل WebView اندروید (صفحه‌ی file://)
       Service Worker یا اصلاً ساخته نمی‌شود یا دیر آماده می‌شود، و وقتی ثبت گوشی
       پشت آن می‌ماند هیچ گوشی‌ای ثبت نمی‌شد و هیچ اعلان پنلی نمی‌رسید. */
    registerAppDevice(false);
    /* در اپ اندروید، آماده بودنِ «کلید سرویس فایربیس» روی سرور هم پرسیده می‌شود تا
       دلیلِ نرسیدن اعلان (نبودِ کلید) روی خودِ گوشی دیده شود. */
    refreshServerFcmState();
    /* هر ۱۰ دقیقه: اگر ثبت قبلی بیش از ۶ ساعت پیش بوده یا ناموفق مانده، تازه می‌شود */
    setInterval(function () { registerAppDevice(false); }, 10 * 60 * 1000);

    // Service worker + اعلان پس‌زمینه
    ensureServiceWorker().then(function () {
      listenToServiceWorker();
      /* اگر کاربر قبلاً اجازه داده، اشتراک بی‌صدا تازه می‌شود تا اعلان در حالت
         قفل هم برسد؛ درخواست مجوز فقط با اولین تعامل کاربر انجام می‌شود. */
      syncPushSubscription();
    });

    // Request notification permission gracefully on first user interaction
    var permissionTriggered = false;
    function promptPerm() {
      if (permissionTriggered) return;
      permissionTriggered = true;
      requestPushPermission();
      document.removeEventListener('click', promptPerm);
      document.removeEventListener('touchstart', promptPerm);
    }
    document.addEventListener('click', promptPerm);
    document.addEventListener('touchstart', promptPerm);

    /* با بازگشت برنامه به پیش‌زمینه، اشتراک و اعلان‌ها همگام می‌شوند
       (مثلاً بعد از تغییر کاربر یا نصب اپ روی صفحه‌ی اصلی) */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        syncPushSubscription();
        syncNotifications();
        /* اگر کاربر در این فاصله وارد شده یا توکن تازه ساخته شده، دوباره ثبت می‌کنیم
           (شمارنده‌ی تلاش‌های ناموفق صفر می‌شود تا تلاش‌ها از نو شروع شوند) */
        fcmRetryCount = 0;
        registerAppDevice(false);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
