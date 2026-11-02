/* ════════════════════════════════════════════════════════════════════════════
   modules/ads.js — تبلیغاتِ داخل اپ: سه جای بنر، چند تصویرِ چرخشی، لینک، آمار
   ----------------------------------------------------------------------------
   چه کار می‌کند؟
     تبلیغ‌ها را از سرور می‌خواند (api/ads.php) و همان سه «جای بنر»ی را که
     از قبل در index.html هست پُر می‌کند:

         home_top  → .haji-banner           (خانه، بنر بزرگِ بالای خدمات)
         home_mid  → .home-ad-banner        (خانه، بنر میانیِ بالای میراث ورامین)
         dash_slim → .dash-ad-slim          (داشبورد، بنر باریکِ زیر آب‌وهوا)

     اگر یک جای بنر «چند» تصویر داشته باشد، تصویرها به همان ترتیبی که در پنل
     ادمین هست نمایش داده می‌شوند و خودکار می‌چرخند (با کشیدنِ انگشت هم می‌شود
     عوضشان کرد). با زدنِ بنر:
         • اگر لینک داشته باشد → در «مرورگر گوشی» باز می‌شود (بیرون از اپ)
         • اگر لینک نداشته باشد → همان رفتارِ قبلی (پیامِ کوتاه)
       و در هر دو حالت، کلیک برای «آمار کلیکِ» پنل شمرده می‌شود.

   چرا این‌طور نوشته شد؟
     ۱) «بنر ثابتِ داخل بسته» همیشه به‌عنوان نسخه‌ی پشتیبان می‌ماند: اگر سرور
        در دسترس نبود، جدول خالی بود یا اپ آفلاین باز شد، همان تصویرهای قبلی
        دیده می‌شوند (نه جای خالی، نه بنرِ شکسته).
     ۲) کلاس‌ها و بجِ «تبلیغات» دست‌نخورده می‌مانند ⇒ اندازه، گوشه‌ها و افکتِ
        نورِ بنرها دقیقاً مثل قبل است؛ فقط تصویرها عوض می‌شوند.
     ۳) تصویرهای uploads/ads/… با نشانیِ مطلق سرور خوانده می‌شوند (چون اپ
        صفحه را از file:// باز می‌کند) — همان کاری که core/storage.js برای
        عکسِ گزارش‌ها می‌کند (eplakResolveMediaUrl).
     ۴) هیچ خطایی نباید اپ را بشکند: همه‌چیز داخل try/catch است و این ماژول
        اگر المان‌ها را پیدا نکند، ساکت بیرون می‌رود.
   ════════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* سه جای بنر، به همان ترتیبی که در پنل ادمین و در api/ads.php هست */
  var SLOTS = [
    { placement: 'home_top',  selector: '#adSlotHomeTop',  imgClass: 'haji-banner-img',   legacy: 'toast' },
    { placement: 'home_mid',  selector: '#adSlotHomeMid',  imgClass: 'home-ad-img',       legacy: 'handler' },
    { placement: 'dash_slim', selector: '#adSlotDashSlim', imgClass: 'dash-ad-slim-img',  legacy: 'handler' }
  ];

  /* هر چند وقت یک‌بار تصویر عوض شود (پنل/آزمون می‌تواند عوضش کند) */
  var ROTATE_MS = Number(window.EPLAK_ADS_ROTATE_MS || 5000);
  if (!(ROTATE_MS > 200)) { ROTATE_MS = 5000; }   /* مقدارِ پرت ⇒ همان پیش‌فرض */

  /* حداقل فاصله‌ی دو خواندن از سرور — تا با هر بار عوض شدنِ صفحه، درخواست ندهیم */
  var REFRESH_MS = Number(window.EPLAK_ADS_REFRESH_MS || 300000);
  if (!(REFRESH_MS > 9999)) { REFRESH_MS = 300000; }

  var state = {
    loaded: false,
    loading: false,
    lastFetch: 0,
    fingerprint: '',
    placements: null,
    slots: []
  };

  /* ── کمکی‌ها ──────────────────────────────────────────────────────────── */

  function apiBase() {
    try {
      if (typeof window.eplakApiBase === 'function') {
        var base = String(window.eplakApiBase() || 'api');
        return base.replace(/\/+$/, '');
      }
    } catch (e) { /* ادامه */ }
    return window.location.protocol === 'file:' ? 'https://eplak.ir/eplak-fixed/api' : 'api';
  }

  function mediaUrl(path) {
    try {
      if (typeof window.eplakResolveMediaUrl === 'function') {
        return String(window.eplakResolveMediaUrl(path) || path || '');
      }
    } catch (e) { /* ادامه */ }
    return String(path || '');
  }

  function isExternalSafe(url) {
    return /^https?:\/\//i.test(String(url || '').trim());
  }

  function toast(text) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(text); }
    } catch (e) { /* بی‌ضرر */ }
  }

  /** باز کردنِ لینک بیرون از اپ: اندروید ← پلِ AndroidApp، iOS ← پلِ iOSApp، وب ← پنجره‌ی تازه */
  function openExternal(url) {
    var target = String(url || '').trim();
    if (!isExternalSafe(target)) { return false; }
    try {
      if (window.AndroidApp && typeof window.AndroidApp.openUrl === 'function') {
        window.AndroidApp.openUrl(target);
        return true;
      }
    } catch (e) { /* ادامه */ }
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iOSApp &&
          typeof window.webkit.messageHandlers.iOSApp.postMessage === 'function') {
        window.webkit.messageHandlers.iOSApp.postMessage({ action: 'openUrl', url: target });
        return true;
      }
    } catch (e) { /* ادامه */ }
    try {
      var popup = window.open(target, '_blank', 'noopener');
      if (popup) { return true; }
    } catch (e) { /* ادامه */ }
    try {
      window.location.href = target;
      return true;
    } catch (e) { /* ادامه */ }
    return false;
  }

  /**
   * ثبتِ کلیک در آمارِ پنل — «آتش و فراموش»: هیچ‌وقت منتظرش نمی‌مانیم و
   * هیچ خطایی را به کاربر نشان نمی‌دهیم (کلیک برای کاربر انجام شده است).
   */
  function registerClick(adId) {
    var id = Number(adId || 0);
    if (!(id > 0)) { return; }
    var url = apiBase() + '/ads.php';
    var body = 'action=click&id=' + encodeURIComponent(String(id));
    try {
      if (typeof navigator.sendBeacon === 'function') {
        var blob = new Blob([body], { type: 'application/x-www-form-urlencoded;charset=UTF-8' });
        if (navigator.sendBeacon(url, blob)) { return; }
      }
    } catch (e) { /* ادامه */ }
    try {
      if (typeof window.fetch === 'function') {
        window.fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: body,
          keepalive: true,
          cache: 'no-store'
        }).catch(function () { /* بی‌ضرر */ });
      }
    } catch (e) { /* بی‌ضرر */ }
  }

  /* ── ساختِ ریلِ تصویرها ───────────────────────────────────────────────── */

  function buildSlide(ad, imgClass) {
    var slide = document.createElement('div');
    slide.className = 'ead-slide';
    slide.setAttribute('data-ad-id', String(Number(ad.id || 0)));
    slide.setAttribute('data-testid', 'ad-slide');

    var img = document.createElement('img');
    img.className = imgClass;
    img.src = mediaUrl(ad.image);
    img.alt = String(ad.alt || ad.title || '');
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.setAttribute('draggable', 'false');
    if (ad.width) { img.setAttribute('width', String(ad.width)); }
    if (ad.height) { img.setAttribute('height', String(ad.height)); }

    /* اگر نسخه‌ی webp هم هست، مرورگرهای پشتیبان همان را نشان می‌دهند */
    if (ad.webp) {
      var picture = document.createElement('picture');
      var source = document.createElement('source');
      source.setAttribute('srcset', mediaUrl(ad.webp));
      source.setAttribute('type', 'image/webp');
      picture.appendChild(source);
      picture.appendChild(img);
      slide.appendChild(picture);
    } else {
      slide.appendChild(img);
    }
    return slide;
  }

  function buildTrack(slot, ads) {
    var track = document.createElement('div');
    track.className = 'ead-track';
    track.setAttribute('data-testid', 'ad-track');
    for (var i = 0; i < ads.length; i++) {
      track.appendChild(buildSlide(ads[i], slot.imgClass));
    }
    return track;
  }

  function buildDots(count) {
    if (count < 2) { return null; }
    var wrap = document.createElement('div');
    wrap.className = 'ead-dots';
    wrap.setAttribute('data-testid', 'ad-dots');
    for (var i = 0; i < count; i++) {
      var dot = document.createElement('span');
      dot.className = 'ead-dot' + (i === 0 ? ' active' : '');
      wrap.appendChild(dot);
    }
    return wrap;
  }

  /* ── هر جای بنر: چرخش، کشیدنِ انگشت، کلیک ─────────────────────────────── */

  function setSlidePosition(slot, animate) {
    var track = slot.track;
    if (!track) { return; }
    if (animate) {
      track.classList.remove('ead-dragging');
    } else {
      track.classList.add('ead-dragging');
    }
    track.style.transform = 'translate3d(' + (-100 * slot.index) + '%, 0, 0)';
    var dots = slot.dotsWrap ? slot.dotsWrap.querySelectorAll('.ead-dot') : [];
    for (var i = 0; i < dots.length; i++) {
      if (i === slot.index) { dots[i].classList.add('active'); } else { dots[i].classList.remove('active'); }
    }
    var ad = slot.ads[slot.index];
    slot.root.setAttribute('data-ad-id', String(ad && ad.id ? ad.id : 0));
    slot.root.setAttribute('aria-label', String((ad && (ad.alt || ad.title)) || slot.ariaFallback || ''));
  }

  function goTo(slot, index, animate) {
    if (!slot.ads.length) { return; }
    var next = index % slot.ads.length;
    if (next < 0) { next += slot.ads.length; }
    slot.index = next;
    setSlidePosition(slot, animate !== false);
  }

  function startRotation(slot) {
    stopRotation(slot);
    if (slot.ads.length < 2 || ROTATE_MS <= 0) { return; }
    slot.timer = setInterval(function () {
      if (document.hidden || slot.dragging || slot.paused) { return; }
      goTo(slot, slot.index + 1, true);
    }, ROTATE_MS);
  }

  function stopRotation(slot) {
    if (slot.timer) {
      clearInterval(slot.timer);
      slot.timer = null;
    }
  }

  function attachDrag(slot) {
    var startX = 0;
    var startY = 0;
    var deltaX = 0;
    var active = false;
    var lockedHorizontal = null;

    function onDown(clientX, clientY) {
      if (slot.ads.length < 2) { return; }
      active = true;
      slot.dragging = true;
      lockedHorizontal = null;
      startX = clientX;
      startY = clientY;
      deltaX = 0;
    }

    function onMove(clientX, clientY) {
      if (!active) { return; }
      deltaX = clientX - startX;
      /* تشخیصِ اسکرولِ عمودیِ صفحه از سوایپِ افقیِ بنر */
      if (lockedHorizontal === null) {
        if (Math.abs(deltaX) < 6 && Math.abs(clientY - startY) < 6) { return; }
        lockedHorizontal = Math.abs(deltaX) > Math.abs(clientY - startY);
      }
      if (!lockedHorizontal) { return; }
      var width = slot.root.clientWidth || 1;
      var percent = (-100 * slot.index) + (deltaX / width) * 100;
      if (slot.track) {
        slot.track.classList.add('ead-dragging');
        slot.track.style.transform = 'translate3d(' + percent + '%, 0, 0)';
      }
    }

    function onUp() {
      if (!active) { return; }
      active = false;
      slot.dragging = false;
      var width = slot.root.clientWidth || 1;
      var moved = lockedHorizontal === true && Math.abs(deltaX) > Math.max(28, width * 0.16);
      if (moved) {
        /* در RTL کشیدن به راست = تصویرِ قبلی */
        goTo(slot, slot.index + (deltaX > 0 ? -1 : 1), true);
      } else {
        setSlidePosition(slot, true);
      }
      lockedHorizontal = null;
      deltaX = 0;
    }

    slot.root.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) { return; }
      onDown(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    slot.root.addEventListener('touchmove', function (e) {
      if (!e.touches || !e.touches.length) { return; }
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    slot.root.addEventListener('touchend', onUp, { passive: true });
    slot.root.addEventListener('touchcancel', onUp, { passive: true });

    slot.root.addEventListener('mousedown', function (e) { onDown(e.clientX, e.clientY); });
    window.addEventListener('mousemove', function (e) { onMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', onUp);

    /* با رفتنِ ماوس روی بنر، چرخشِ خودکار می‌ایستد (مثل کاروسلِ میراث ورامین) */
    slot.root.addEventListener('mouseenter', function () { slot.paused = true; });
    slot.root.addEventListener('mouseleave', function () { slot.paused = false; });
  }

  function attachClick(slot) {
    slot.root.addEventListener('click', function () {
      var ad = slot.ads[slot.index];
      if (!ad) {
        legacyClick(slot);
        return;
      }
      registerClick(ad.id);
      if (isExternalSafe(ad.link)) {
        openExternal(ad.link);
        return;
      }
      legacyClick(slot);
    });
  }

  /** رفتارِ قبلیِ بنرهای ثابت (وقتی تبلیغ لینک ندارد) */
  function legacyClick(slot) {
    if (slot.legacy === 'handler' && typeof window.handleHomeAdClick === 'function') {
      try { window.handleHomeAdClick(); } catch (e) { /* بی‌ضرر */ }
      return;
    }
    toast(window.EPLAK_ADS_FALLBACK_TOAST || 'بازار حاجی اعلا — به‌زودی در ای‌پلاک');
  }

  /* ── پر کردنِ یک جای بنر ──────────────────────────────────────────────── */

  function renderSlot(slot, ads) {
    if (!slot.root) { return; }
    var list = [];
    for (var i = 0; i < (ads || []).length; i++) {
      var ad = ads[i];
      if (ad && ad.image) { list.push(ad); }
    }

    /* «هیچ تبلیغی نیست» ⇒ بنرِ ثابتِ داخل بسته همان‌طور می‌ماند */
    if (!list.length) {
      if (!slot.rendered) { return; }
      teardownSlot(slot);
      return;
    }

    /* اگر همان فهرستِ قبلی است، دوباره نساز (چرخش از اول شروع نشود) */
    if (slot.rendered && sameAds(slot.ads, list)) { return; }

    teardownSlot(slot);

    slot.ads = list;
    slot.index = 0;
    slot.track = buildTrack(slot, list);
    slot.dotsWrap = buildDots(list.length);

    /* تصویرِ ثابت پنهان می‌شود ولی در DOM می‌ماند (نسخه‌ی پشتیبان) */
    if (slot.fallback) { slot.fallback.classList.add('ead-fallback-hidden'); }

    slot.root.appendChild(slot.track);
    if (slot.dotsWrap) { slot.root.appendChild(slot.dotsWrap); }
    slot.rendered = true;

    setSlidePosition(slot, false);
    /* گوش‌کننده‌ها «یک‌بار» برای هر جای بنر وصل می‌شوند: برخی‌شان روی window
       هستند و با ساختِ دوباره‌ی ریل (تازه‌سازیِ هر چند دقیقه) پاک نمی‌شوند؛
       اگر چندبار وصل شوند، یک کشیدنِ انگشت چند اسلاید جابه‌جا می‌کرد. */
    if (!slot.wired) {
      attachDrag(slot);
      attachClick(slot);
      slot.wired = true;
    }
    startRotation(slot);
  }

  function teardownSlot(slot) {
    stopRotation(slot);
    if (slot.track && slot.track.parentNode) { slot.track.parentNode.removeChild(slot.track); }
    if (slot.dotsWrap && slot.dotsWrap.parentNode) { slot.dotsWrap.parentNode.removeChild(slot.dotsWrap); }
    if (slot.fallback) { slot.fallback.classList.remove('ead-fallback-hidden'); }
    slot.track = null;
    slot.dotsWrap = null;
    slot.ads = [];
    slot.index = 0;
    slot.rendered = false;
    /* slot.wired عمداً پاک نمی‌شود: خودِ بنر و گوش‌کننده‌هایش سرِ جایشان‌اند */
    if (slot.root) { slot.root.removeAttribute('data-ad-id'); }
  }

  function sameAds(a, b) {
    if (!a || a.length !== b.length) { return false; }
    for (var i = 0; i < a.length; i++) {
      if (Number(a[i].id || 0) !== Number(b[i].id || 0)) { return false; }
      if (String(a[i].image || '') !== String(b[i].image || '')) { return false; }
      if (String(a[i].webp || '') !== String(b[i].webp || '')) { return false; }
      if (String(a[i].link || '') !== String(b[i].link || '')) { return false; }
      if (String(a[i].title || '') !== String(b[i].title || '')) { return false; }
      if (String(a[i].alt || '') !== String(b[i].alt || '')) { return false; }
    }
    return true;
  }

  function collectSlots() {
    var found = [];
    for (var i = 0; i < SLOTS.length; i++) {
      var def = SLOTS[i];
      var root = document.querySelector(def.selector) ||
                 document.querySelector('[data-ad-placement="' + def.placement + '"]');
      if (!root) { continue; }
      var fallback = root.querySelector('picture') || root.querySelector('img');
      found.push({
        placement: def.placement,
        imgClass: def.imgClass,
        legacy: def.legacy,
        root: root,
        fallback: fallback,
        ariaFallback: root.getAttribute('aria-label') || '',
        ads: [],
        index: 0,
        track: null,
        dotsWrap: null,
        timer: null,
        dragging: false,
        paused: false,
        rendered: false,
        wired: false
      });
    }
    return found;
  }

  /* ── خواندن از سرور ───────────────────────────────────────────────────── */

  function applyPayload(payload) {
    if (!payload || typeof payload !== 'object') { return false; }
    var placements = payload.placements || payload.ads;
    if (!placements || typeof placements !== 'object') { return false; }
    state.placements = placements;
    state.fingerprint = String(payload.v || '');
    state.loaded = true;
    for (var i = 0; i < state.slots.length; i++) {
      renderSlot(state.slots[i], placements[state.slots[i].placement]);
    }
    return true;
  }

  function loadAds(force) {
    if (state.loading) { return Promise.resolve(state.loaded); }
    if (!force && state.lastFetch && (Date.now() - state.lastFetch) < REFRESH_MS) {
      return Promise.resolve(state.loaded);
    }
    if (typeof window.fetch !== 'function') { return Promise.resolve(false); }

    state.loading = true;
    state.lastFetch = Date.now();

    var controller = null;
    try {
      if (typeof AbortController === 'function') { controller = new AbortController(); }
    } catch (e) { controller = null; }
    var timeout = setTimeout(function () {
      try { if (controller) { controller.abort(); } } catch (e) { /* بی‌ضرر */ }
    }, 9000);

    return window.fetch(apiBase() + '/ads.php', {
      method: 'GET',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      clearTimeout(timeout);
      if (!res || !res.ok) { throw new Error('bad status'); }
      return res.json();
    }).then(function (payload) {
      state.loading = false;
      return applyPayload(payload);
    }).catch(function () {
      /* سرور در دسترس نیست/خطا داد ⇒ بنرهای ثابتِ داخل بسته می‌مانند */
      clearTimeout(timeout);
      state.loading = false;
      return state.loaded;
    });
  }

  function start() {
    state.slots = collectSlots();
    if (!state.slots.length) { return; }
    loadAds(true);
    /* هر چند دقیقه یک‌بار تازه می‌شود تا تغییرهای پنل بدون بستنِ اپ دیده شوند */
    setInterval(function () { loadAds(false); }, 60000);
    /* وقتی کاربر به اپ برمی‌گردد هم یک‌بار بررسی می‌شود */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { loadAds(false); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  /**
   * آیا این جای بنر «الان» از سرور پُر شده و چرخشی است؟
   * index.html از همین برای این می‌پرسد که کلیک روی بنر را خودش مدیریت کند
   * (رفتارِ ثابتِ قبلی) یا به این ماژول بسپارد — تا هیچ‌وقت دوبار پیام نشان
   * داده نشود و وقتی تبلیغی نیست، بنرِ ثابت دقیقاً مثل قبل کار کند.
   */
  function isActive(placement) {
    for (var i = 0; i < state.slots.length; i++) {
      if (state.slots[i].placement === placement) {
        return !!(state.slots[i].rendered && state.slots[i].ads.length);
      }
    }
    return false;
  }

  /* برای آزمون و عیب‌یابی */
  window.EplakAds = {
    slots: function () { return state.slots; },
    state: state,
    load: loadAds,
    render: applyPayload,
    isActive: isActive,
    openExternal: openExternal,
    registerClick: registerClick,
    placementOf: function (slotId) {
      for (var i = 0; i < SLOTS.length; i++) {
        if (SLOTS[i].placement === slotId) { return SLOTS[i]; }
      }
      return null;
    }
  };
})();
