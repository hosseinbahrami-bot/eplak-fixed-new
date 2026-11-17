/* ============================================================
   modules/version-guard.js — «آپدیت اجباری»: نسخه‌های قدیمی وارد اپ نمی‌شوند

   خواسته‌ی کارفرما: «نسخه‌های قبلی نیایند داخل اپ؛ روی گوشی‌شان پیام بیاید که
   باید اپ را آپدیت کنند.»

   چطور کار می‌کند؟
   ۱) اپ هنگام باز شدن api/ping.php را صدا می‌زند (همان پینگی که online-guard
      هم می‌زند؛ این آدرس روی همه‌ی هاست‌ها هست و CORS دارد)؛ سرور فیلدهای
      «حداقل نسخه‌ی مجاز» (min_version_code) و «آخرین نسخه» را از فایلِ
      shared/app_version.json برمی‌گرداند (تنظیم در پنل مدیریت ← تنظیمات ←
      «نسخه‌ی اپ و آپدیت اجباری»).
   ۲) کدِ نسخه‌ی این اپ (APP_VERSION_CODE در core/state.js) با حداقل مقایسه
      می‌شود؛ اگر کمتر بود، پرده‌ی تمام‌صفحه‌ی «نسخه‌ی اپ قدیمی است» کشیده
      می‌شود: کاربر نه می‌تواند وارد اپ شود و نه چیزی را ببیند؛ فقط دکمه‌ی
      «دانلود نسخه‌ی جدید» (باز کردن لینکِ APK در مرورگرِ گوشی) و «بررسی
      مجدد» (رفرشِ صفحه — برای PWA که کشِ کهنه دارد) آزاد است.
   ۳) اگر نسخه از حداقل بالاتر ولی از آخرین نسخه کمتر بود، فقط یک بنرِ
      قابل‌بستن «نسخه‌ی جدید موجود است» دیده می‌شود (کسی بیرون نمی‌افتد).

   قاعده‌ی ایمنی: اگر سرور جواب نداد (آفلاین، خطا، تایم‌اوت) هیچ پرده‌ای
   کشیده نمی‌شود (fail-open)؛ پرده‌ی «بدون اینترنت»ِ online-guard جداگانه
   کار می‌کند. پس خرابیِ سرور هرگز کاربرِ نسخه‌ی تازه را از اپ بیرون نمی‌اندازد.
   ============================================================ */
(function () {
  'use strict';

  var CHECK_TIMEOUT_MS = 7000;  /* حداکثر انتظار برای پاسخِ سرور */
  var RECHECK_MS       = 60000; /* حداقل فاصله‌ی دو بررسیِ متوالی (بازگشت به اپ) */
  var lastCheckAt      = 0;
  var checking         = false;
  var blocked          = false; /* پرده‌ی آپدیتِ اجباری فعال است؟ */
  var bannerDismissed  = false; /* کاربر بنرِ «نسخه‌ی جدید» را بست؟ */

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

  function appVersionCode() {
    var code = 0;
    try { code = parseInt(window.APP_VERSION_CODE, 10) || 0; } catch (e) {}
    return code;
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
        gateTitle: 'This app version is outdated',
        gateDesc: 'To keep using the app, please update it to the latest version.',
        download: 'Download the new version',
        retry: 'Check again',
        bannerTitle: 'A new version is available',
        bannerUpdate: 'Update',
        bannerClose: 'Later'
      };
    }
    return {
      gateTitle: 'نسخه‌ی اپ شما قدیمی است',
      gateDesc: 'برای ادامه‌ی استفاده از برنامه، لطفاً آن را به نسخه‌ی تازه به‌روزرسانی کنید.',
      download: 'دانلود نسخه‌ی جدید',
      retry: 'بررسی مجدد',
      bannerTitle: 'نسخه‌ی جدیدی از اپ منتشر شده است',
      bannerUpdate: 'به‌روزرسانی',
      bannerClose: 'بعداً'
    };
  }

  /* باز کردن لینک در مرورگرِ گوشی (همان الگوی modules/contact.js) */
  function openUrl(url) {
    if (!url) return;
    try {
      if (window.AndroidApp && typeof window.AndroidApp.openUrl === 'function') {
        window.AndroidApp.openUrl(url);
        return;
      }
    } catch (e) {}
    try {
      var w = window.open(url, '_blank');
      if (w) return;
    } catch (e) {}
    try { window.location.href = url; } catch (e) {}
  }

  /* جلوگیری از هر کار کاربر تا وقتی آپدیت نکند (دکمه‌های خودِ پرده آزادند) */
  function blockEvent(e) {
    if (document.documentElement.classList.contains('eplak-update-blocked')) {
      var el = document.getElementById('eplakUpdateGate');
      if (el && el.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function showGate(data) {
    if (blocked) return;
    blocked = true;
    var t = texts();
    var gate = document.getElementById('eplakUpdateGate');
    if (!gate) return;

    var titleEl = document.getElementById('eplakUpdateTitle');
    var descEl = document.getElementById('eplakUpdateDesc');
    var dlBtn = document.getElementById('eplakUpdateDownload');
    var retryBtn = document.getElementById('eplakUpdateRetry');
    if (titleEl) titleEl.textContent = t.gateTitle;
    /* پیامِ سفارشیِ مدیر (اگر بود) جای متنِ پیش‌فرض می‌نشیند */
    if (descEl) descEl.textContent = (data && data.message) ? data.message : t.gateDesc;
    if (dlBtn) dlBtn.textContent = t.download;
    if (retryBtn) retryBtn.textContent = t.retry;

    document.documentElement.classList.add('eplak-update-blocked');
    document.addEventListener('click', blockEvent, true);
    document.addEventListener('touchstart', blockEvent, { capture: true, passive: false });
    document.addEventListener('keydown', blockEvent, true);
    try { document.body.style.overflow = 'hidden'; } catch (e) {}

    if (dlBtn && !dlBtn.dataset.bound) {
      dlBtn.dataset.bound = '1';
      dlBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openUrl(data && data.update_url ? data.update_url : '');
      });
    }
    if (retryBtn && !retryBtn.dataset.bound) {
      retryBtn.dataset.bound = '1';
      retryBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        /* برای PWA که کشِ کهنه دارد، رفرش کدِ تازه را می‌آورد؛ برای APK بی‌اثر
           است ولی دکمه‌ی دانلود راهِ اصلی است. */
        try { window.location.reload(); } catch (err) {}
      });
    }
  }

  function showBanner(data) {
    if (blocked || bannerDismissed) return;
    var banner = document.getElementById('eplakUpdateBanner');
    if (!banner) return;
    var t = texts();
    var titleEl = document.getElementById('eplakUpdateBannerTitle');
    var updBtn = document.getElementById('eplakUpdateBannerBtn');
    var closeBtn = document.getElementById('eplakUpdateBannerClose');
    if (titleEl) titleEl.textContent = t.bannerTitle;
    if (updBtn) updBtn.textContent = t.bannerUpdate;
    if (closeBtn) closeBtn.textContent = t.bannerClose;
    banner.style.display = 'flex';

    if (updBtn && !updBtn.dataset.bound) {
      updBtn.dataset.bound = '1';
      updBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openUrl(data && data.update_url ? data.update_url : '');
      });
    }
    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = '1';
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        bannerDismissed = true;
        banner.style.display = 'none';
      });
    }
  }

  function hideBanner() {
    var banner = document.getElementById('eplakUpdateBanner');
    if (banner) banner.style.display = 'none';
  }

  function checkVersion() {
    if (checking || blocked) return Promise.resolve(false);
    var myCode = appVersionCode();
    /* اگر کدِ نسخه معلوم نیست، چیزی را مسدود نکن (fail-open) */
    if (!myCode) return Promise.resolve(false);

    checking = true;
    lastCheckAt = Date.now();

    var controller = null;
    var timer = null;
    try {
      if (typeof AbortController === 'function') {
        controller = new AbortController();
        timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, CHECK_TIMEOUT_MS);
      }
    } catch (e) {}

    var url = apiBase() + '/ping.php?_=' + Date.now();

    return fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
      headers: { 'Accept': 'application/json' }
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        /* نسخه‌ها داخلِ app_versionِ پاسخِ پینگ‌اند (هاستِ قدیمی این فیلد را
           ندارد ⇒ app_version نیست ⇒ fail-open) */
        return (res.ok && data && data.success === true && data.app_version) ? data.app_version : null;
      });
    }).catch(function () {
      return null; /* آفلاین/خطا ⇒ fail-open */
    }).then(function (data) {
      checking = false;
      if (timer) clearTimeout(timer);
      if (!data) return false;

      var minCode = parseInt(data.min_version_code, 10) || 0;
      var latestCode = parseInt(data.latest_version_code, 10) || 0;

      if (myCode < minCode) {
        showGate(data);          /* آپدیتِ اجباری: ورود ممنوع */
      } else if (latestCode > 0 && myCode < latestCode) {
        showBanner(data);        /* پیشنهادِ آپدیتِ اختیاری */
      } else {
        hideBanner();
      }
      return true;
    });
  }

  /* ابزارهای عمومی برای بقیه‌ی ماژول‌ها/تست‌ها */
  window.eplakCheckAppVersion = function () { return checkVersion(); };
  window.eplakIsUpdateBlocked = function () { return blocked; };

  function bind() {
    checkVersion();
    /* وقتی کاربر به اپ برمی‌گردد (مثلاً بعد از این‌که مدیر حداقل نسخه را بالا
       برد)، یک‌بارِ دیگر بررسی می‌کنیم — ولی نه پشتِ سرِ هم. */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !blocked && Date.now() - lastCheckAt > RECHECK_MS) {
        checkVersion();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
