/* ============================================================
   modules/online-guard.js — اپ فقط در حالت آنلاین کار می‌کند

   خواسته‌ی کارفرما: «اپ باید کاملاً آنلاین باشد؛ اگر اینترنت نبود، هیچ‌جا
   لود نشود و پیام «بدون اینترنت اتصال ممکن نیست» دیده شود.»

   چرا این فایل لازم است؟
   در اپ اندروید، فایل‌های سایت داخل خود گوشی هستند (assets)؛ پس صفحه حتی
   بدون اینترنت باز می‌شود. این ماژول همان لحظه با یک درخواست بسیار سبک به
   سرور (api/ping.php) بررسی می‌کند که اینترنت واقعاً وصل است یا نه و اگر
   نبود، یک پرده‌ی تمام‌صفحه روی همه‌ی صفحه‌ها می‌کشد تا کاربر نتواند با
   داده‌های قدیمی کار کند. به‌محض برگشتن اینترنت، پرده خودش کنار می‌رود.

   نکته: «نوار آفلاین» هم بررسی می‌شود؛ ولی به آن تکیه نمی‌کنیم، چون در بعضی
   گوشی‌ها وقتی وای‌فای وصل است ولی اینترنت ندارد، مرورگر «آنلاین» می‌گوید.
   ============================================================ */
(function () {
  'use strict';

  var PING_TIMEOUT_MS = 7000;   /* حداکثر انتظار برای پاسخ سرور */
  var WATCH_MS        = 12000;  /* فاصله‌ی بررسی‌های دوره‌ای وقتی اتصال برقرار است */
  var RETRY_MS        = 3000;   /* فاصله‌ی تلاش‌های تکراری وقتی اتصال قطع است */
  var lastState       = null;   /* null = هنوز بررسی نشده */
  var watchTimer      = null;
  var retryTimer      = null;
  var checking        = false;

  function apiBase() {
    try {
      if (typeof window.eplakApiBase === 'function') {
        return window.eplakApiBase();
      }
      if (typeof window.EPLAK_API_BASE_URL === 'string' && window.EPLAK_API_BASE_URL) {
        return window.EPLAK_API_BASE_URL.replace(/\/+$/, '');
      }
    } catch (e) {}
    return 'api';
  }

  function isEn() {
    try {
      if (window.i18n && typeof window.i18n.getLanguage === 'function') {
        return window.i18n.getLanguage() === 'en';
      }
    } catch (e) {}
    return false;
  }

  function texts() {
    if (isEn()) {
      return {
        title: 'No internet connection',
        desc: 'This app only works online. Check your phone internet and try again.',
        retry: 'Try again',
        checking: 'Checking connection…'
      };
    }
    return {
      title: 'بدون اینترنت اتصال ممکن نیست',
      desc: 'این برنامه فقط در حالت آنلاین کار می‌کند. اتصال اینترنت گوشی را بررسی کنید و دوباره تلاش کنید.',
      retry: 'تلاش مجدد',
      checking: 'در حال بررسی اتصال…'
    };
  }

  function fillTexts() {
    var el = document.getElementById('eplakOfflineGate');
    if (!el) return;
    var t = texts();
    var set = function (id, value) {
      var node = document.getElementById(id);
      if (node) node.textContent = value;
    };
    set('eplakOfflineTitle', t.title);
    set('eplakOfflineDesc', t.desc);
    var btn = document.getElementById('eplakOfflineRetry');
    if (btn) btn.textContent = t.retry;
    set('eplakOfflineState', t.checking);
  }

  /* جلوگیری از هر کار کاربر تا وقتی اینترنت برگردد */
  function blockEvent(e) {
    if (document.documentElement.classList.contains('eplak-offline')) {
      var el = document.getElementById('eplakOfflineGate');
      if (el && el.contains(e.target)) return; /* دکمه‌ی تلاش مجدد آزاد است */
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function showOffline() {
    if (lastState === false) return;
    lastState = false;
    document.documentElement.classList.add('eplak-offline');
    fillTexts();
    document.addEventListener('click', blockEvent, true);
    document.addEventListener('touchstart', blockEvent, { capture: true, passive: false });
    document.addEventListener('keydown', blockEvent, true);
    try { document.body.style.overflow = 'hidden'; } catch (e) {}
    scheduleRetry();
  }

  function hideOffline(resume) {
    var was = lastState === false;
    lastState = true;
    document.documentElement.classList.remove('eplak-offline');
    document.removeEventListener('click', blockEvent, true);
    document.removeEventListener('touchstart', blockEvent, true);
    document.removeEventListener('keydown', blockEvent, true);
    try { document.body.style.overflow = ''; } catch (e) {}
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    /* اتصال برگشت: محتوای تازه گرفته می‌شود */
    if (was && resume) {
      try {
        if (typeof window.syncLiveContent === 'function') window.syncLiveContent();
        if (typeof window.syncNotifications === 'function') window.syncNotifications();
      } catch (e) {}
    }
  }

  function scheduleRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(function () {
      verify(false).then(function (ok) {
        if (!ok) scheduleRetry();
      });
    }, RETRY_MS);
  }

  /* یک درخواست واقعی به سرور: نتیجه‌ی قطعی «اینترنت هست یا نه» */
  function verify(showSpinner) {
    if (checking) return Promise.resolve(lastState === true);
    checking = true;
    if (showSpinner) {
      var state = document.getElementById('eplakOfflineState');
      if (state) state.textContent = texts().checking;
    }

    var controller = null;
    var timer = null;
    try {
      if (typeof AbortController === 'function') {
        controller = new AbortController();
        timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, PING_TIMEOUT_MS);
      }
    } catch (e) {}

    var url = apiBase() + '/ping.php?_=' + Date.now();

    return fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
      headers: { 'Accept': 'application/json' }
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return !!(res.ok && data && data.success === true);
      });
    }).catch(function () {
      return false;
    }).then(function (ok) {
      checking = false;
      if (timer) clearTimeout(timer);
      if (ok) hideOffline(true);
      else showOffline();
      try {
        window.dispatchEvent(new CustomEvent('eplak-connection', { detail: { online: ok } }));
      } catch (e) {}
      return ok;
    });
  }

  function watch() {
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = setInterval(function () {
      if (lastState === false) return; /* تلاش‌های آفلاین جداگانه زمان‌بندی شده‌اند */
      verify(false);
    }, WATCH_MS);
  }

  /* ابزارهای عمومی برای بقیه‌ی ماژول‌ها */
  window.eplakIsOnline = function () { return lastState !== false; };
  window.eplakCheckConnection = function () { return verify(true); };
  window.eplakRetryOnline = function () {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    return verify(true).then(function (ok) {
      if (!ok) scheduleRetry();
      return ok;
    });
  };

  function bind() {
    var btn = document.getElementById('eplakOfflineRetry');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        window.eplakRetryOnline();
      });
    }

    window.addEventListener('offline', function () { showOffline(); });
    window.addEventListener('online', function () { verify(false); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && lastState === false) verify(false);
    });

    /* وضعیت اولیه: اگر نوار آفلاین قطع است، فوراً پرده کشیده می‌شود؛
       در غیر این صورت با یک درخواست واقعی مطمئن می‌شویم. */
    var navOffline = false;
    try { navOffline = navigator.onLine === false; } catch (e) {}
    if (navOffline) showOffline();
    verify(false);
    watch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
