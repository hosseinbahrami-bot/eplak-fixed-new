/* ============================================================================
   modules/city-map.js — «نقشه و اماکن شهری» (screen-map)

   • نقشه‌ی زنده‌ی ورامین (همان موتور EplakMap و همان کاشی‌ها)، با نشانگر رنگیِ هر دسته
   • اماکن مهم شهر به تفکیک دسته: درمانی، مساجد، فرهنگی و تاریخی، ادارات، انتظامی و امدادی،
     آموزشی، پارک و ورزش، حمل‌ونقل، محله‌ها و میدان‌ها (داده: core/places-data.js)
   • جستجو + فیلتر دسته + فاصله‌ی هر مکان تا کاربر (وقتی GPS در دسترس باشد)
   • هر مکان یک دکمه‌ی «مسیریابی با نشان» دارد: موقعیت GPS کاربر می‌شود مبدأ و مکان انتخاب‌شده
     مقصد، و برنامه‌ی نشان (Neshan) با همان مسیر باز می‌شود.
       – اپ اندروید:  پل AndroidApp.openNeshan(url) → برنامه‌ی نشان؛ اگر نصب نبود، نسخه‌ی وب نشان
       – مرورگر اندروید:  لینک intent:// با آدرس جایگزین وب
       – iOS:  neshan://… و در صورت نبودن برنامه، نسخه‌ی وب
       – دسکتاپ:  تب تازه با لینک https://nshn.ir/…
     فرمت لینک‌ها: core/places.js (neshanLinks) — عیناً طبق مستندات رسمی نشان.
   ============================================================================ */
(function () {
  'use strict';

  var Places = window.EplakPlaces;
  if (!Places) return;

  var VEHICLE_KEY = 'eplak_citymap_vehicle';
  var USER_FRESH_MS = 120000;     /* موقعیتی که تازه‌تر از ۲ دقیقه باشد دوباره گرفته نمی‌شود */
  var PER_GROUP = 4;              /* در حالت «همه»، هر دسته چند مکان اول را نشان بدهد */
  var REMOTE_KEY = 'eplak_places_remote_v1';   /* آخرین پاسخِ api/places.php (برای اینترنت ضعیف/قطع) */
  var REMOTE_EVERY_MS = 90000;    /* اصلاح‌های ادمین حداکثر هر ۹۰ ثانیه یک‌بار از سرور پرسیده می‌شود */
  var REMOTE_RETRY_MS = 15000;    /* پس از خطا، ۱۵ ثانیه بعد دوباره */
  var REMOTE_TIMEOUT_MS = 8000;

  /* ── متن‌ها ───────────────────────────────────────────────────────────── */
  var TEXT = {
    fa: {
      all: 'همه',
      search_ph: 'جستجوی اماکن ورامین…',
      clear: 'پاک کردن',
      locate: 'موقعیت من',
      fit: 'نمایش همه‌ی اماکن',
      close: 'بستن',
      route: 'مسیریابی با نشان',
      route_short: 'مسیریابی',
      route_busy: 'در حال دریافت موقعیت شما…',
      call: 'تماس',
      car: 'خودرو',
      moto: 'موتور',
      away: function (d) { return 'فاصله ' + d; },
      count: function (n) { return Places.toFaDigits(n) + ' مکان'; },
      count_in: function (a) { return Places.toFaDigits(a.n) + ' مکان در «' + a.cat + '»'; },
      sorted_near: 'مرتب‌شده از نزدیک‌ترین',
      see_distance: 'نمایش فاصله‌ها از موقعیت من',
      show_all: function (n) { return 'نمایش همه‌ی ' + Places.toFaDigits(n) + ' مورد'; },
      empty: 'مکانی با این مشخصات پیدا نشد',
      approx: 'موقعیت این مکان تقریبی است؛ پیش از رفتن تأیید کنید.',
      approx_short: 'موقعیت تقریبی',
      vehicle: 'وسیله‌ی سفر',
      you: 'موقعیت شما',
      far: function (km) { return 'شما حدود ' + Places.toFaDigits(km) + ' کیلومتر با مرکز ورامین فاصله دارید؛ مسیر از موقعیت فعلی‌تان ساخته می‌شود'; },
      gps_get: 'در حال دریافت موقعیت شما…',
      gps_denied: 'اجازه‌ی موقعیت داده نشد. بدون آن فقط مقصد در نشان باز می‌شود و مسیر را از خود نشان بگیرید',
      gps_off: 'سرویس موقعیت (GPS) گوشی خاموش است؛ روشن کنید',
      gps_timeout: 'موقعیت شما به‌موقع پیدا نشد؛ مقصد در نشان باز می‌شود',
      gps_fail: 'موقعیت شما پیدا نشد؛ مقصد در نشان باز می‌شود',
      neshan_web: 'برنامه‌ی نشان نصب نیست؛ نسخه‌ی وب نشان باز شد',
      neshan_none: 'برنامه‌ای برای باز کردن نشان پیدا نشد',
      neshan_point: 'مقصد در نشان باز شد؛ روی «مسیریابی» بزنید تا از موقعیت فعلی‌تان مسیر بسازد',
      install: 'نصب برنامه‌ی نشان',
      neshan_missing: 'برنامه‌ی نشان روی این گوشی نصب نیست؛ مسیر در نسخه‌ی وب نشان باز می‌شود.',
      neshan_hint: 'مسیر با «نشان» ساخته می‌شود؛ مبدأ، موقعیت فعلی شماست.',
      tap_again: 'موقعیت شما پیدا شد؛ یک‌بار دیگر «مسیریابی با نشان» را بزنید',
      map_fail: 'تصویر نقشه بارگذاری نشد؛ فهرست اماکن و مسیریابی کار می‌کند.',
      map_retry: 'تلاش دوباره',
      aria_map: 'نقشه‌ی اماکن شهری ورامین'
    },
    en: {
      all: 'All',
      search_ph: 'Search places in Varamin…',
      clear: 'Clear',
      locate: 'My location',
      fit: 'Show all places',
      close: 'Close',
      route: 'Route with Neshan',
      route_short: 'Route',
      route_busy: 'Getting your location…',
      call: 'Call',
      car: 'Car',
      moto: 'Motorcycle',
      away: function (d) { return d + ' away'; },
      count: function (n) { return n + (n === 1 ? ' place' : ' places'); },
      count_in: function (a) { return a.n + (a.n === 1 ? ' place in ' : ' places in ') + a.cat; },
      sorted_near: 'Nearest first',
      see_distance: 'Show distances from my location',
      show_all: function (n) { return 'Show all ' + n; },
      empty: 'No matching places',
      approx: 'This location is approximate; please confirm before you go.',
      approx_short: 'approximate',
      vehicle: 'Travel mode',
      you: 'Your location',
      far: function (km) { return 'You are about ' + km + ' km from central Varamin; the route starts from your current position'; },
      gps_get: 'Getting your location…',
      gps_denied: 'Location permission denied. Neshan will open the destination only; start the route from there',
      gps_off: 'Location services (GPS) are off; please turn them on',
      gps_timeout: 'Your location took too long; opening the destination in Neshan',
      gps_fail: 'Could not get your location; opening the destination in Neshan',
      neshan_web: 'Neshan app is not installed; opened the Neshan web version',
      neshan_none: 'No app was found to open Neshan',
      neshan_point: 'Destination opened in Neshan; tap “Directions” to route from your current position',
      install: 'Install Neshan',
      neshan_missing: 'The Neshan app is not installed; the route opens in Neshan web.',
      neshan_hint: 'Routes are built by Neshan, starting from your current location.',
      tap_again: 'Your location is ready; tap “Route with Neshan” once more',
      map_fail: 'Map imagery could not be loaded; the places list and routing still work.',
      map_retry: 'Retry',
      aria_map: 'Varamin city places map'
    }
  };

  function lang() {
    try {
      if (window.i18n && typeof window.i18n.getLanguage === 'function') {
        return window.i18n.getLanguage() === 'en' ? 'en' : 'fa';
      }
    } catch (e) { /* ادامه */ }
    return document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'fa';
  }
  function tr(key, arg) {
    var table = TEXT[lang()] || TEXT.fa;
    var v = table[key];
    if (typeof v === 'function') return v(arg);
    return v == null ? key : v;
  }
  function num(n) { return lang() === 'fa' ? Places.toFaDigits(n) : String(n); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    } catch (e) { /* ادامه */ }
  }

  /* ── آیکون‌های رابط ───────────────────────────────────────────────────── */
  var SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICON = {
    nav: SVG_OPEN + '<path d="M3 11.5 21 3l-8.500 18-2-7.500z" fill="currentColor" fill-opacity=".2"/></svg>',
    locate: SVG_OPEN + '<circle cx="12" cy="12" r="3.500" fill="currentColor" fill-opacity=".3"/><circle cx="12" cy="12" r="7.500"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    fit: SVG_OPEN + '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    search: SVG_OPEN + '<circle cx="11" cy="11" r="7" fill="currentColor" fill-opacity=".14"/><path d="m20 20-3.500-3.500"/></svg>',
    close: SVG_OPEN + '<path d="M6 6l12 12M18 6 6 18"/></svg>',
    phone: SVG_OPEN + '<path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" fill="currentColor" fill-opacity=".18"/></svg>',
    car: SVG_OPEN + '<path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 13h.01M17 13h.01" fill="none"/></svg>',
    moto: SVG_OPEN + '<circle cx="5.500" cy="16" r="3"/><circle cx="18.500" cy="16" r="3"/><path d="M8.500 16H13l3-6h-3.500M16 10l2.500 6M13 10 9.500 6H7"/></svg>'
  };

  /* ── وضعیت و عناصر ────────────────────────────────────────────────────── */
  var st = {
    inited: false,
    cat: 'all',
    q: '',
    selected: null,
    user: null,
    vehicle: 'd',
    map: null,
    mapTries: 0,
    locating: false,
    routing: false,
    neshanHint: '',
    leftAt: 0,
    remoteAt: 0,
    remoteBusy: false,
    remoteV: '',
    remoteLoaded: false,
    permWaiters: [],
    permTimer: null
  };
  var el = {};

  function $(id) { return document.getElementById(id); }

  function isNight() { return !document.documentElement.classList.contains('day'); }

  function screenActive() {
    var s = $('screen-map');
    return !!(s && s.classList.contains('active'));
  }

  /* ── ساخت رابط ────────────────────────────────────────────────────────── */
  function init() {
    if (st.inited) return true;
    el.card = $('cityMapCard');
    el.canvas = $('cityMapCanvas');
    el.sheet = $('cityMapSheet');
    el.search = $('cityMapSearch');
    el.clear = $('cityMapClear');
    el.chips = $('cityMapChips');
    el.meta = $('cityMapMeta');
    el.list = $('mapPlacesWrap');
    el.locate = $('cityMapLocateBtn');
    el.fit = $('cityMapFitBtn');
    if (!el.card || !el.canvas || !el.list || !el.chips) return false;

    try {
      var saved = window.localStorage.getItem(VEHICLE_KEY);
      if (saved === 'm' || saved === 'd') st.vehicle = saved;
    } catch (e) { /* ذخیره‌سازی در دسترس نیست */ }

    if (el.search) {
      el.search.addEventListener('input', function () {
        st.q = el.search.value || '';
        if (el.clear) el.clear.hidden = !st.q;
        refresh({ refit: true });
      });
      /* «جستجو» روی صفحه‌کلید: صفحه‌کلید بسته شود تا نتیجه‌ها دیده شوند */
      el.search.addEventListener('keydown', function (e) {
        if (e && e.key === 'Enter') { try { el.search.blur(); } catch (err) { /* مهم نیست */ } }
      });
    }
    if (el.clear) {
      el.clear.addEventListener('click', function () {
        st.q = '';
        if (el.search) { el.search.value = ''; el.search.focus(); }
        el.clear.hidden = true;
        refresh({ refit: true });
      });
    }
    el.chips.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-cat]') : null;
      if (!btn) return;
      setCategory(btn.getAttribute('data-cat'));
    });
    el.list.addEventListener('click', function (e) {
      var t = e.target;
      var go = t && t.closest ? t.closest('[data-go]') : null;
      if (go) { e.stopPropagation(); route(go.getAttribute('data-go')); return; }
      var more = t && t.closest ? t.closest('[data-more]') : null;
      if (more) {
        setCategory(more.getAttribute('data-more'));
        /* فهرست دسته‌ی بازشده از بالا دیده شود، نه از وسطِ صفحه */
        try { el.chips.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* مهم نیست */ }
        return;
      }
      var near = t && t.closest ? t.closest('[data-locate]') : null;
      if (near) { locate(); return; }
      var row = t && t.closest ? t.closest('[data-id]') : null;
      if (row) select(row.getAttribute('data-id'), { scroll: true });
    });
    if (el.meta) {
      el.meta.addEventListener('click', function (e) {
        var near = e.target && e.target.closest ? e.target.closest('[data-locate]') : null;
        if (near) locate();
      });
    }
    if (el.sheet) {
      el.sheet.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('[data-close]')) { closeSheet(); return; }
        var veh = t.closest('[data-vehicle]');
        if (veh) { setVehicle(veh.getAttribute('data-vehicle')); return; }
        var go = t.closest('[data-go]');
        if (go) { route(go.getAttribute('data-go')); return; }
        var call = t.closest('[data-tel]');
        if (call) { dial(call.getAttribute('data-tel')); return; }
        if (t.closest('[data-install]')) { openInstall(); }
      });
    }
    if (el.locate) el.locate.addEventListener('click', function () { locate(); });
    if (el.fit) el.fit.addEventListener('click', function () { closeSheet(); fitVisible(); });

    /* وقتی کاربر از این صفحه می‌رود، دفعه‌ی بعد از نو شروع می‌شود (بدون جستجو/دسته/کارتِ مانده) */
    window.addEventListener('eplak-screen-shown', function (e) {
      var id = e && e.detail && e.detail.id;
      if (id && id !== 'screen-map') st.leftAt = Date.now();
    });
    try {
      /* تغییر تم روز/شب → کاشی‌های نقشه هم تیره/روشن شوند */
      if (typeof MutationObserver === 'function') {
        new MutationObserver(function () {
          if (st.map) st.map.setTheme(isNight());
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      }
    } catch (e) { /* مهم نیست */ }

    st.inited = true;
    return true;
  }

  /* ── دسته و جستجو ─────────────────────────────────────────────────────── */
  function inCategory(p) { return Places.inCategory(p, st.cat); }

  function matchesQuery(list) { return st.q ? Places.search(list, st.q) : list; }

  function visiblePlaces() {
    return matchesQuery(Places.places().filter(inCategory));
  }

  function setCategory(cat) {
    if (!cat || (cat !== 'all' && !Places.categoryById(cat))) cat = 'all';
    st.cat = cat;
    closeSheet(true);
    refresh({ refit: true });
    try {
      var chip = el.chips.querySelector('[data-cat="' + cat + '"]');
      if (chip && chip.scrollIntoView) chip.scrollIntoView({ block: 'nearest', inline: 'center' });
    } catch (e) { /* مهم نیست */ }
  }

  function refresh(o) {
    renderChips();
    renderMeta();
    renderList();
    syncMarkers(!!(o && o.refit));
  }

  /* متن‌های ثابتِ صفحه (جای‌نما و برچسب دکمه‌ها) به زبان فعلی */
  function applyTexts() {
    if (el.search) el.search.placeholder = tr('search_ph');
    if (el.clear) el.clear.setAttribute('aria-label', tr('clear'));
    if (el.locate) { el.locate.setAttribute('aria-label', tr('locate')); el.locate.title = tr('locate'); }
    if (el.fit) { el.fit.setAttribute('aria-label', tr('fit')); el.fit.title = tr('fit'); }
    if (el.canvas) el.canvas.setAttribute('aria-label', tr('aria_map'));
  }

  /* ── اماکنِ افزوده/اصلاح‌شده توسط ادمین (api/places.php) ────────────────────
     فهرست پیش‌فرض همراه اپ است. هر بار که صفحه باز می‌شود، «تفاوت» از سرور گرفته و روی آن
     اعمال می‌شود؛ آخرین پاسخ هم در localStorage می‌ماند تا با اینترنتِ ضعیف یا قطع هم
     مکان‌های افزوده‌شده دیده شوند. هر خطایی بی‌صدا نادیده گرفته می‌شود (فهرست پیش‌فرض می‌ماند). */
  function remoteUrl() {
    var base = '';
    try { base = typeof window.eplakApiBase === 'function' ? window.eplakApiBase() : ''; } catch (e) { base = ''; }
    return String(base || 'api').replace(/\/+$/, '') + '/places.php';
  }

  function applyCachedRemote() {
    if (st.remoteLoaded) return;
    st.remoteLoaded = true;
    try {
      var raw = window.localStorage.getItem(REMOTE_KEY);
      var cached = raw ? JSON.parse(raw) : null;
      if (cached && cached.data) st.remoteV = Places.applyRemote(cached.data).v || '';
    } catch (e) { /* ذخیره‌ی خراب؛ نادیده */ }
  }

  /* پس از رسیدن اصلاح‌های تازه: فهرست/نقشه به‌روز شود و کارتِ باز (اگر هنوز هست) دوباره ساخته شود */
  function remoteChanged() {
    if (!st.inited) return;
    refresh({ refit: false });
    if (st.selected) {
      var p = Places.placeById(st.selected);
      if (p) { renderSheet(p); markRowSelected(); }
    }
  }

  function fetchRemote(force) {
    if (st.remoteBusy || typeof window.fetch !== 'function') return;
    if (!force && st.remoteAt && Date.now() - st.remoteAt < REMOTE_EVERY_MS) return;
    st.remoteBusy = true;
    st.remoteAt = Date.now();
    var ctrl = null;
    var timer = null;
    try { if (typeof window.AbortController === 'function') ctrl = new window.AbortController(); } catch (e) { ctrl = null; }
    if (ctrl) timer = setTimeout(function () { try { ctrl.abort(); } catch (e) { /* مهم نیست */ } }, REMOTE_TIMEOUT_MS);
    var opts = { cache: 'no-store' };
    if (ctrl) opts.signal = ctrl.signal;
    function done() { st.remoteBusy = false; if (timer) { clearTimeout(timer); timer = null; } }

    window.fetch(remoteUrl() + '?t=' + Date.now(), opts)
      .then(function (res) {
        if (!res || !res.ok) throw new Error('http');
        return res.json();
      })
      .then(function (data) {
        done();
        if (!data || data.success !== true) return;
        var v = typeof data.v === 'string' ? data.v : '';
        if (v && v === st.remoteV) return;                 /* چیزی عوض نشده */
        st.remoteV = Places.applyRemote(data).v || '';
        try { window.localStorage.setItem(REMOTE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) { /* مهم نیست */ }
        remoteChanged();
      })
      .catch(function () {
        done();
        st.remoteAt = Date.now() - (REMOTE_EVERY_MS - REMOTE_RETRY_MS);   /* ۱۵ ثانیه‌ی دیگر دوباره */
      });
  }

  /* ── نمایش کلی صفحه (router.js وقتی screen-map باز می‌شود صدا می‌زند) ─────── */
  /* ورود تازه به صفحه (پس از رفتن به صفحه‌ی دیگر): دسته «همه»، بدون جستجو و بدون کارت مکان */
  function resetView() {
    st.leftAt = 0;
    st.cat = 'all';
    st.q = '';
    st.selected = null;
    st.neshanHint = '';
    if (el.search) el.search.value = '';
    if (el.clear) el.clear.hidden = true;
    closeSheet(true);
  }

  function show() {
    if (!init()) return;
    applyCachedRemote();
    var fresh = !!st.leftAt;
    if (fresh) resetView();
    applyTexts();
    refresh({ refit: fresh });
    if (st.selected) {
      var p = Places.placeById(st.selected);
      if (p) renderSheet(p);
    }
    ensureMap();
    silentLocation();
    fetchRemote(false);
  }

  /* ── نقشه ─────────────────────────────────────────────────────────────── */
  function ensureMap() {
    if (st.map) {
      st.map.refresh();
      return;
    }
    if (!window.EplakMap || typeof window.EplakMap.create !== 'function') return;
    var rect = el.canvas.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) {
      /* صفحه تازه باز شده و هنوز اندازه ندارد؛ کمی بعد دوباره */
      if (st.mapTries++ < 25) setTimeout(function () { if (screenActive()) ensureMap(); }, 120);
      return;
    }
    var center = (Places.data().center) || { lat: 35.33, lng: 51.643, zoom: 13 };
    st.map = window.EplakMap.create(el.canvas, {
      picker: false,
      lat: center.lat,
      lng: center.lng,
      zoom: center.zoom,
      minZoom: 10,
      maxZoom: 19,
      onMarkerClick: function (id) { select(id, { scroll: false }); },
      onMapClick: function () { closeSheet(); },
      fallbackHtml: '<div>🗺️ ' + esc(tr('map_fail')) + '</div>'
        + '<button type="button" class="ep-map-retry">' + esc(tr('map_retry')) + '</button>'
    });
    if (!st.map) return;
    st.map.setTheme(isNight());
    syncMarkers(true);
    if (st.user) st.map.setUserLocation(st.user.lat, st.user.lng, st.user.acc);
    if (st.selected) st.map.setSelected(st.selected);
  }

  function markerOf(p) {
    var c = Places.categoryById(p.cat) || {};
    return {
      id: p.id, lat: p.lat, lng: p.lng,
      color: c.color, ink: c.ink,
      glyph: Places.glyphSvg(p.cat),
      label: Places.placeName(p, lang())
    };
  }

  function syncMarkers(refit) {
    if (!st.map) return;
    var list = visiblePlaces();
    st.map.setMarkers(list.map(markerOf));
    if (st.selected && !list.some(function (p) { return p.id === st.selected; })) closeSheet(true);
    if (refit) fitList(list);
  }

  function fitList(list) {
    if (!st.map) return;
    var b = Places.boundsOf(list || []);
    if (!b) return;
    st.map.fitBounds(b, { padding: 44, maxZoom: (list && list.length === 1) ? 16 : 15 });
  }
  function fitVisible() { fitList(visiblePlaces()); }

  /* ── چیپ‌های دسته ─────────────────────────────────────────────────────── */
  function renderChips() {
    var lg = lang();
    var base = Places.places();
    var scoped = st.q ? Places.search(base, st.q) : base;
    var counts = Places.countByCategory(scoped);
    var html = '<button type="button" role="tab" class="cm-chip' + (st.cat === 'all' ? ' active' : '')
      + '" data-cat="all" aria-selected="' + (st.cat === 'all') + '">'
      + '<span class="cm-chip-t">' + esc(tr('all')) + '</span><span class="cm-n">' + num(counts.all || 0) + '</span></button>';
    Places.categories().forEach(function (c) {
      var n = counts[c.id] || 0;
      var on = st.cat === c.id;
      html += '<button type="button" role="tab" class="cm-chip' + (on ? ' active' : '') + (n ? '' : ' zero')
        + '" data-cat="' + esc(c.id) + '" aria-selected="' + on + '" style="--c:' + esc(c.color) + ';--ink:' + esc(c.ink) + '">'
        + '<span class="cm-chip-i">' + Places.glyphSvg(c.id) + '</span>'
        + '<span class="cm-chip-t">' + esc(Places.catName(c, lg)) + '</span><span class="cm-n">' + num(n) + '</span></button>';
    });
    el.chips.innerHTML = html;
  }

  /* ── نوار اطلاعات بالای فهرست ──────────────────────────────────────────── */
  function renderMeta() {
    if (!el.meta) return;
    var n = visiblePlaces().length;
    var text;
    if (st.cat !== 'all') {
      text = tr('count_in', { n: n, cat: Places.catName(Places.categoryById(st.cat), lang()) });
    } else {
      text = tr('count', n);
    }
    var right = st.user
      ? '<span class="cm-sorted">' + esc(tr('sorted_near')) + '</span>'
      : '<button type="button" class="cm-link" data-locate="1">' + esc(tr('see_distance')) + '</button>';
    el.meta.innerHTML = '<span class="cm-count">' + esc(text) + '</span>' + right;
  }

  /* ── فهرست ────────────────────────────────────────────────────────────── */
  function subtitleOf(p, showCat) {
    var lg = lang();
    var c = Places.categoryById(p.cat);
    var parts = [];
    if (showCat && c) parts.push(Places.catName(c, lg));
    var addr = Places.placeAddr(p, lg);
    var note = Places.placeNote(p, lg);
    if (addr) parts.push(addr);
    else if (note) parts.push(note);
    return parts.join(' · ');
  }

  function rowHtml(item, showCat) {
    var p = item.place;
    var c = Places.categoryById(p.cat) || {};
    var lg = lang();
    var dist = (st.user && isFinite(item.km)) ? Places.formatDistance(item.km, lg) : '';
    var sub = subtitleOf(p, showCat);
    return '<div class="cm-row' + (st.selected === p.id ? ' sel' : '') + '" data-id="' + esc(p.id) + '" role="button" tabindex="0"'
      + ' style="--c:' + esc(c.color) + ';--ink:' + esc(c.ink) + '">'
      + '<span class="cm-ic">' + Places.glyphSvg(p.cat) + '</span>'
      + '<span class="cm-tx"><b>' + esc(Places.placeName(p, lg)) + '</b>'
      + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>'
      + (dist ? '<span class="cm-dist">' + esc(dist) + '</span>' : '')
      + '<button type="button" class="cm-go" data-go="' + esc(p.id) + '" aria-label="' + esc(tr('route')) + '" title="' + esc(tr('route')) + '">'
      + ICON.nav + '</button></div>';
  }

  function renderList() {
    var lg = lang();
    var list = visiblePlaces();
    if (!list.length) {
      el.list.innerHTML = '<div class="cm-empty">' + esc(tr('empty')) + '</div>';
      return;
    }
    var html = '';
    if (st.cat === 'all' && !st.q) {
      /* «همه»: دسته به دسته، هر دسته چند مورد اول + «نمایش همه» */
      Places.groupByCategory(list).forEach(function (g) {
        var c = g.cat;
        var items = Places.sortPlaces(g.items, st.user, lg);
        html += '<div class="cm-group-h" style="--c:' + esc(c.color) + ';--ink:' + esc(c.ink) + '">'
          + '<span class="cm-ic-sm">' + Places.glyphSvg(c.id) + '</span>'
          + '<span>' + esc(Places.catName(c, lg)) + '</span><small>' + num(items.length) + '</small></div>';
        items.slice(0, PER_GROUP).forEach(function (it) { html += rowHtml(it, false); });
        if (items.length > PER_GROUP) {
          html += '<button type="button" class="cm-more" data-more="' + esc(c.id) + '" style="--c:' + esc(c.color) + '">'
            + esc(tr('show_all', items.length)) + '</button>';
        }
      });
    } else if (st.q) {
      /* جستجو: به ترتیب ارتباط، با نام دسته در زیرنویس */
      Places.withDistance(list, st.user).forEach(function (it) { html += rowHtml(it, true); });
    } else {
      Places.sortPlaces(list, st.user, lg).forEach(function (it) { html += rowHtml(it, false); });
    }
    el.list.innerHTML = html;
  }

  function markRowSelected() {
    var rows = el.list.querySelectorAll('.cm-row');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('sel', rows[i].getAttribute('data-id') === st.selected);
    }
  }

  /* نقطه را وسطِ بخشِ «دیده‌شده»ی نقشه می‌گذارد (بالای کارت پایین)، نه پشت آن */
  function focusOn(lat, lng, minZoom) {
    if (!st.map) return;
    var zoom = Math.max(st.map.getPosition().zoom, minZoom || 15);
    st.map.panTo(lat, lng, zoom);
    if (!el.sheet || el.sheet.hidden) return;
    var rect = el.canvas.getBoundingClientRect();
    var sheetH = (el.sheet.offsetHeight || 0) + 10;
    var visibleH = Math.max(90, rect.height - sheetH);
    /* سنجاقِ مکان (نوک آن) در ~۶۲٪ ارتفاعِ بخش دیده‌شده بنشیند؛ سنجاق ۴۱px بالاتر از نوکش است
       و نباید زیر لبه‌ی بالای نقشه برود */
    var targetY = Math.max(52, visibleH * 0.62);
    var shift = rect.height / 2 - targetY;            /* نقطه باید این‌قدر بالاتر از مرکز بیفتد */
    if (Math.abs(shift) > 1) {
      var ll = st.map.pxToLatLng(rect.width / 2, rect.height / 2 + shift);
      st.map.panTo(ll.lat, ll.lng);
    }
  }

  /* ── انتخاب مکان و کارت پایین نقشه ─────────────────────────────────────── */
  function select(id, o) {
    var p = Places.placeById(id);
    if (!p) return;
    st.selected = id;
    st.neshanHint = '';
    renderSheet(p);
    if (st.map) {
      st.map.setSelected(id);
      focusOn(p.lat, p.lng, 15);
    }
    markRowSelected();
    if (o && o.scroll && el.card && el.card.scrollIntoView) {
      try { el.card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* مهم نیست */ }
    }
  }

  function closeSheet(silent) {
    st.selected = null;
    if (el.sheet) { el.sheet.hidden = true; el.sheet.innerHTML = ''; }
    if (el.card) el.card.classList.remove('has-sheet');
    if (st.map) st.map.setSelected(null);
    if (!silent && el.list) markRowSelected();
  }

  function renderSheet(p) {
    if (!el.sheet) return;
    var lg = lang();
    var c = Places.categoryById(p.cat) || {};
    var km = st.user ? Places.distanceKm(st.user, p) : NaN;
    var sub = [esc(Places.catName(c, lg))];
    if (isFinite(km)) sub.push(esc(tr('away', Places.formatDistance(km, lg))));
    if (p.approx) sub.push('<span class="cm-approx" title="' + esc(tr('approx')) + '">' + esc(tr('approx_short')) + '</span>');
    var details = [];
    var addr = Places.placeAddr(p, lg);
    var note = Places.placeNote(p, lg);
    if (note) details.push(note);
    if (addr) details.push(addr);
    var hint = '';
    var nb = bridge();
    var missing = false;
    try { missing = !!(nb && typeof nb.isNeshanInstalled === 'function' && !nb.isNeshanInstalled()); } catch (e) { missing = false; }
    if (missing || st.neshanHint === 'web' || st.neshanHint === 'none') {
      hint = '<div class="cm-sh-hint">' + esc(tr('neshan_missing')) + ' <button type="button" class="cm-link" data-install="1">' + esc(tr('install')) + '</button></div>';
    }
    el.sheet.innerHTML =
      '<div class="cm-sh-head" style="--c:' + esc(c.color) + ';--ink:' + esc(c.ink) + '">'
      + '<span class="cm-sh-badge">' + Places.glyphSvg(p.cat) + '</span>'
      + '<span class="cm-sh-title"><b>' + esc(Places.placeName(p, lg)) + '</b><span>' + sub.join(' · ') + '</span></span>'
      + (p.tel ? '<button type="button" class="cm-sh-x cm-sh-call" data-tel="' + esc(p.tel) + '" aria-label="' + esc(tr('call')) + '" title="' + esc(tr('call')) + '">' + ICON.phone + '</button>' : '')
      + '<button type="button" class="cm-sh-x" data-close="1" aria-label="' + esc(tr('close')) + '">' + ICON.close + '</button>'
      + '</div>'
      + (details.length ? '<div class="cm-sh-note">' + esc(details.join(' · ')) + '</div>' : '')
      + '<div class="cm-actions">'
      + '<button type="button" class="cm-route-btn" data-go="' + esc(p.id) + '">' + ICON.nav + '<span class="cm-route-t">' + esc(tr('route')) + '</span></button>'
      + '<div class="cm-veh" role="group" aria-label="' + esc(tr('vehicle')) + '">'
      + '<button type="button" class="cm-veh-btn' + (st.vehicle === 'd' ? ' on' : '') + '" data-vehicle="d" aria-label="' + esc(tr('car')) + '" title="' + esc(tr('car')) + '">' + ICON.car + '</button>'
      + '<button type="button" class="cm-veh-btn' + (st.vehicle === 'm' ? ' on' : '') + '" data-vehicle="m" aria-label="' + esc(tr('moto')) + '" title="' + esc(tr('moto')) + '">' + ICON.moto + '</button>'
      + '</div>'
      + '</div>'
      + hint;
    el.sheet.hidden = false;
    if (el.card) el.card.classList.add('has-sheet');
  }

  function setVehicle(v) {
    st.vehicle = v === 'm' ? 'm' : 'd';
    try { window.localStorage.setItem(VEHICLE_KEY, st.vehicle); } catch (e) { /* مهم نیست */ }
    var btns = el.sheet ? el.sheet.querySelectorAll('[data-vehicle]') : [];
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-vehicle') === st.vehicle);
    }
  }

  /* ── موقعیت کاربر (GPS) ────────────────────────────────────────────────── */
  function bridge() { return window.AndroidApp || null; }

  /* نتیجه‌ی درخواست اجازه از اندروید: modules/reports.js هم همین تابع را دارد؛
     تا وقتی ما منتظر پاسخ نیستیم، همان رفتار قبلی حفظ می‌شود. */
  var prevPermHandler = null;
  function permHandler(granted) {
    if (st.permWaiters.length) {
      var waiters = st.permWaiters.splice(0, st.permWaiters.length);
      if (st.permTimer) { clearTimeout(st.permTimer); st.permTimer = null; }
      waiters.forEach(function (w) { if (granted) w.resolve(); else w.reject({ code: 1 }); });
      return;
    }
    if (typeof prevPermHandler === 'function') {
      try { prevPermHandler(granted); } catch (e) { /* ادامه */ }
    }
  }
  function hookPermission() {
    if (window.eplakLocationPermissionResult === permHandler) return;
    prevPermHandler = window.eplakLocationPermissionResult;
    window.eplakLocationPermissionResult = permHandler;
  }

  function ensurePermission(o) {
    return new Promise(function (resolve, reject) {
      var b = bridge();
      try {
        if (b && typeof b.hasLocationPermission === 'function' && !b.hasLocationPermission()) {
          if (o && o.silent) { reject({ code: 1, silent: true }); return; }
          if (typeof b.requestLocationPermission === 'function') {
            hookPermission();
            st.permWaiters.push({ resolve: resolve, reject: reject });
            if (!st.permTimer) {
              st.permTimer = setTimeout(function () {
                st.permTimer = null;
                var waiters = st.permWaiters.splice(0, st.permWaiters.length);
                waiters.forEach(function (w) { w.reject({ code: 3 }); });
              }, 40000);
            }
            b.requestLocationPermission();
            return;
          }
        }
        if (b && typeof b.isLocationServiceEnabled === 'function' && !b.isLocationServiceEnabled()) {
          reject({ code: 'off' });
          return;
        }
      } catch (e) { /* ادامه با navigator.geolocation */ }
      resolve();
    });
  }

  function readPosition(o) {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject({ code: 'unsupported' }); return; }
      var retried = false;
      function attempt(high, timeout) {
        navigator.geolocation.getCurrentPosition(function (pos) {
          var c = (pos && pos.coords) || {};
          var lat = Number(c.latitude);
          var lng = Number(c.longitude);
          if (!isFinite(lat) || !isFinite(lng)) { reject({ code: 2 }); return; }
          resolve({ lat: lat, lng: lng, acc: Number(c.accuracy) || 0, ts: Date.now() });
        }, function (err) {
          /* مهلت تمام شد: یک‌بار با موقعیت تقریبی (شبکه) امتحان می‌کنیم */
          if (high && !retried && err && err.code === 3) { retried = true; attempt(false, 8000); return; }
          reject(err || { code: 2 });
        }, { enableHighAccuracy: high, timeout: timeout, maximumAge: high ? 15000 : 120000 });
      }
      attempt((o && o.high) !== false, (o && o.timeoutMs) || 12000);
    });
  }

  function acquireLocation(o) {
    var opts = o || {};
    var maxAge = opts.maxAgeMs != null ? opts.maxAgeMs : USER_FRESH_MS;
    if (!opts.force && st.user && (Date.now() - st.user.ts) <= maxAge) return Promise.resolve(st.user);
    return ensurePermission(opts).then(function () { return readPosition(opts); });
  }

  function applyUser(pos) {
    if (!pos) return;
    st.user = pos;
    if (st.map) st.map.setUserLocation(pos.lat, pos.lng, pos.acc);
    renderMeta();
    renderList();
    if (st.selected) {
      var p = Places.placeById(st.selected);
      if (p) renderSheet(p);
    }
  }

  function gpsErrorText(err) {
    var code = err && err.code;
    if (code === 1) return tr('gps_denied');
    if (code === 'off') return tr('gps_off');
    if (code === 3) return tr('gps_timeout');
    return tr('gps_fail');
  }

  /* وقتی صفحه باز می‌شود و اجازه از قبل داده شده، بی‌صدا موقعیت را بگیر
     (تا فاصله‌ها و نقطه‌ی آبی دیده شوند) — هرگز پنجره‌ی اجازه باز نمی‌کند. */
  function silentLocation() {
    if (st.user && (Date.now() - st.user.ts) < 60000) return;
    var b = bridge();
    var granted = null;
    try {
      if (b && typeof b.hasLocationPermission === 'function') granted = !!b.hasLocationPermission();
    } catch (e) { granted = null; }
    function go() {
      acquireLocation({ silent: true, high: false, timeoutMs: 7000, maxAgeMs: 60000 }).then(applyUser, function () { /* بی‌صدا */ });
    }
    if (granted === true) { go(); return; }
    if (granted === false) return;
    try {
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        navigator.permissions.query({ name: 'geolocation' }).then(function (r) {
          if (r && r.state === 'granted') go();
        }, function () { /* مهم نیست */ });
      }
    } catch (e) { /* مهم نیست */ }
  }

  function setLocateBusy(on) {
    if (el.locate) el.locate.classList.toggle('busy', !!on);
  }

  /* دکمه‌ی «موقعیت من» */
  function locate() {
    if (st.locating) return Promise.resolve(st.user);
    st.locating = true;
    setLocateBusy(true);
    toast(tr('gps_get'));
    return acquireLocation({ force: true, high: true, timeoutMs: 12000 }).then(function (pos) {
      st.locating = false;
      setLocateBusy(false);
      applyUser(pos);
      if (st.map) {
        if (Places.nearCity(pos, 25)) {
          focusOn(pos.lat, pos.lng, 15);
        } else {
          var c = Places.data().center;
          toast(tr('far', Math.round(Places.distanceKm(pos, c))));
        }
      }
      return pos;
    }, function (err) {
      st.locating = false;
      setLocateBusy(false);
      toast(gpsErrorText(err));
      return null;
    });
  }

  /* ── مسیریابی با نشان ──────────────────────────────────────────────────── */
  function detectEnv() {
    var b = bridge();
    if (b && typeof b.openNeshan === 'function') return 'native';
    if (b && typeof b.openUrl === 'function') return 'native-legacy';
    var ua = (navigator.userAgent || '');
    if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/i.test(ua)) return 'android-browser';
    return 'desktop';
  }

  /* هدایت صفحه به یک آدرس (جدا شده تا در آزمون‌ها قابل جایگزینی باشد) */
  var hooks = {
    navigate: function (url) { window.location.href = url; }
  };

  /* خروجی: app | web | none | intent | ios | popup */
  function launch(links, env, popup) {
    var b = bridge();
    try {
      if (env === 'native') {
        var res = String(b.openNeshan(links.web) || 'none');
        return (res === 'app' || res === 'web') ? res : 'none';
      }
      if (env === 'native-legacy') {
        b.openUrl(links.web);
        return 'web';
      }
      if (env === 'ios') {
        hooks.navigate(links.ios);
        setTimeout(function () {
          if (!document.hidden) hooks.navigate(links.web);
        }, 1600);
        return 'ios';
      }
      if (env === 'android-browser') {
        hooks.navigate(links.androidIntent);
        return 'intent';
      }
      if (popup) {
        popup.location.href = links.web;
        return 'popup';
      }
      var w = window.open(links.web, '_blank');
      if (!w) hooks.navigate(links.web);
      return 'popup';
    } catch (e) {
      return 'none';
    }
  }

  function setRouteBusy(on) {
    var nodes = document.querySelectorAll('#screen-map .cm-go, #screen-map .cm-route-btn');
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.toggle('busy', !!on);
    var labels = document.querySelectorAll('#screen-map .cm-route-t');
    for (var j = 0; j < labels.length; j++) labels[j].textContent = on ? tr('route_busy') : tr('route');
  }

  /* لمس «مسیریابی» (روی ردیف یا کارت): مبدأ = GPS کاربر، مقصد = همین مکان */
  function route(placeId) {
    var p = Places.placeById(placeId);
    if (!p || st.routing) return Promise.resolve(null);
    st.routing = true;
    if (st.selected !== placeId) select(placeId, { scroll: false });
    setRouteBusy(true);

    var env = detectEnv();
    var popup = null;
    if (env === 'desktop') {
      /* پنجره همین‌جا (در لحظه‌ی لمس) باز می‌شود تا مرورگر پس از انتظار GPS آن را مسدود نکند */
      try { popup = window.open('', '_blank'); if (popup) popup.opener = null; } catch (e) { popup = null; }
    }
    var fresh = !!(st.user && (Date.now() - st.user.ts) <= USER_FRESH_MS);
    /* مرورگر موبایل (اندروید/iOS) باز کردن برنامه را فقط در «همان لحظه‌ی لمس» می‌پذیرد؛ اگر برای
       گرفتن GPS (و پنجره‌ی اجازه) معطل شویم، لمس کاربر دیگر معتبر نیست. پس در این دو محیط، اگر موقعیت
       تازه نداشتیم، بعد از پیدا شدنش از کاربر می‌خواهیم یک‌بار دیگر بزند (این بار فوری باز می‌شود). */
    var needsGesture = env === 'android-browser' || env === 'ios';
    if (!fresh) toast(tr('gps_get'));

    function done(status, hadOrigin) {
      st.routing = false;
      setRouteBusy(false);
      st.neshanHint = status;
      if (status === 'web') toast(tr('neshan_web'));
      else if (status === 'none') toast(tr('neshan_none'));
      else if (!hadOrigin && status !== 'ios') toast(tr('neshan_point'));
      var cur = st.selected ? Places.placeById(st.selected) : null;
      if (cur && (status === 'web' || status === 'none')) renderSheet(cur);
      return status;
    }

    return acquireLocation({ high: true, timeoutMs: 9000, maxAgeMs: USER_FRESH_MS }).then(function (pos) {
      applyUser(pos);
      return pos;
    }, function (err) {
      toast(gpsErrorText(err));
      return null;
    }).then(function (pos) {
      if (needsGesture && !fresh && pos) {
        st.routing = false;
        setRouteBusy(false);
        toast(tr('tap_again'));
        return 'again';
      }
      var links = Places.neshanLinks(p, pos, st.vehicle);
      var status = launch(links, env, popup);
      return done(status, !!pos);
    }, function () { return done('none', false); });
  }

  function dial(number) {
    var url = 'tel:' + String(number || '').replace(/[^0-9+]/g, '');
    var b = bridge();
    try {
      if (b && typeof b.openUrl === 'function') { b.openUrl(url); return; }
    } catch (e) { /* ادامه */ }
    window.location.href = url;
  }

  function openInstall() {
    var url = Places.NESHAN_INSTALL_URL;
    var b = bridge();
    try {
      if (b && typeof b.openUrl === 'function') { b.openUrl(url); return; }
    } catch (e) { /* ادامه */ }
    window.open(url, '_blank');
  }

  /* ── دکمه‌ی بازگشت گوشی: اول کارت مکان بسته شود ─────────────────────────── */
  function handleBack() {
    if (!screenActive()) return false;
    if (st.selected || (el.sheet && !el.sheet.hidden)) {
      closeSheet();
      return true;
    }
    return false;
  }

  /* ── خروجی‌ها ─────────────────────────────────────────────────────────── */
  window.EplakCityMap = {
    show: show,
    select: select,
    route: route,
    locate: locate,
    setCategory: setCategory,
    handleBack: handleBack,
    closeSheet: closeSheet,
    reloadRemote: function () { fetchRemote(true); },
    state: st,
    /* فقط برای آزمون‌های خودکار */
    _test: { detectEnv: detectEnv, launch: launch, hooks: hooks, acquireLocation: acquireLocation }
  };
  /* core/router.js هنگام ورود به screen-map، و core/i18n.js با هر تغییر زبان این نام را صدا
     می‌زنند. وقتی صفحه باز نیست فقط متن‌ها تازه می‌شوند (نقشه ساخته نمی‌شود و GPS خوانده نمی‌شود). */
  window.renderMapPlaces = function () {
    if (screenActive()) { show(); return; }
    if (st.inited) { applyTexts(); refresh({ refit: false }); }
  };
})();
