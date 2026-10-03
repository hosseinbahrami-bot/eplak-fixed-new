/* ============================================================================
   assets/js/ep-map.js — نقشه‌ی سبک ای‌پلاک (بدون کلید API)

   چرا این فایل؟
   در «ثبت درخواست» باید موقعیت دقیق کاربر (از GPS گوشی) روی نقشه دیده شود و
   همین نقشه در پنل ادمین هم مختصات شهروند را نشان بدهد. Google Maps به کلید
   نیاز دارد و در بعضی شرایط باز نمی‌شود؛ پس این نقشه از کاشی‌های رایگان و
   آزاد OpenStreetMap ساخته شده و فقط با <img> کار می‌کند (بدون کتابخانه‌ی
   بیرونی، بدون کلید، سبک و سریع).

   نحوه‌ی استفاده:
     const map = EplakMap.create(document.getElementById('reportMapPicker'), {
        lat: 35.3242, lng: 51.6455, zoom: 16, draggable: true,
        onChange: (pos) => { ... }        // پس از جابه‌جایی/زوم/تنظیم نقطه
     });
     map.setPosition(35.3242, 51.6455);
     const pos = map.getPosition();        // { lat, lng, zoom }
     const addr = await EplakMap.reverseGeocode(lat, lng);   // آدرس فارسی (اختیاری)

   نکته‌ی مهم: این نقشه وقتی کاشی‌ها دانلود نشوند هم به کار خود ادامه می‌دهد
   (مختصات ثبت می‌شود) — یعنی قطعی نقشه باعث از کار افتادن ثبت درخواست نمی‌شود.

   ── کاشی‌ها از کجا می‌آیند؟ (چرا «نقشه دیده نمی‌شد») ──────────────────────
   اسنپ و نشان هم نقشه‌ی خود را بر پایه‌ی داده‌های OpenStreetMap و از «سرور
   خودشان» می‌دهند. اپ ما قبلاً کاشی‌ها را مستقیم از tile.openstreetmap.org
   می‌گرفت؛ ولی صفحه‌ی اپ از file:/// باز می‌شود، هیچ Referer نمی‌فرستد و OSM
   چنین درخواستی را مسدود می‌کند (و در ایران هم دسترسی مستقیم گاهی کند/قطع است).
   حالا ترتیب این است:
     ۱) سرور خودِ ای‌پلاک: api/tiles.php (کاشی را از OSM می‌گیرد، کش می‌کند و
        می‌دهد — همان سروری که آپلود عکس هم از آن کار می‌کند)
     ۲) OpenStreetMap مستقیم (برای مرورگر/پنل ادمین که Referer می‌فرستد)
   هر منبعی که جواب نداد، خودکار منبع بعدی امتحان می‌شود؛ اگر همه شکست خوردند،
   مختصات نمایش داده می‌شود و دکمه‌ی «تلاش دوباره» هست.
   منبع‌ها قابل تغییرند: options.tileSources یا window.EPLAK_MAP_TILE_SOURCES
   (آرایه‌ای از قالب‌های {z}/{x}/{y}).

   ── حالت «نقشه‌ی نمایشی» (نقشه و اماکن شهری) ─────────────────────────────────
   علاوه بر «انتخاب موقعیت» (نشانگر ثابت وسط نقشه)، همین موتور می‌تواند اماکن را
   به‌صورت نشانگر نشان بدهد:
     const map = EplakMap.create(el, { picker: false, lat, lng, zoom,
        onMarkerClick: (id, item) => {}, onMapClick: (lat, lng) => {} });
     map.setMarkers([{ id, lat, lng, color, ink, glyph, label }]);   // نشانگرهای دسته‌دار
     map.setSelected(id);                 // برجسته کردن یک نشانگر
     map.setUserLocation(lat, lng, acc);  // نقطه‌ی آبی «موقعیت من» + دایره‌ی دقت
     map.fitBounds({south,west,north,east}, { padding: 36, maxZoom: 16 });
     map.panTo(lat, lng, zoom);
   نشانگرهای نزدیک به هم خودکار «خوشه» می‌شوند (شماره‌دار)؛ لمس خوشه، همان‌جا زوم می‌کند.
   زوم با دو انگشت، Ctrl+چرخ موس و دابل‌کلیک در همه‌ی نقشه‌ها فعال است (options.gestures=false خاموش می‌کند).
   ============================================================================ */
(function (global) {
  'use strict';

  var TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_SIZE = 256;
  var MIN_ZOOM = 3;
  var MAX_ZOOM = 19;
  var STYLE_ID = 'epMapStyles';
  var MAX_TILE_ERRORS = 4;   /* بعد از این تعداد خطا، پیام «نقشه در دسترس نیست» */
  var SOURCE_WATCHDOG_MS = 12000;  /* اگر در این مدت هیچ کاشی نیامد (نه خطا، نه تصویر)، منبع بعدی */
  var CLUSTER_RADIUS = 28;     /* px: نشانگرهای نزدیک‌تر از این، یک «خوشه» می‌شوند */
  var CLUSTER_MAX_ZOOM = 17;   /* از این بزرگ‌نمایی به بعد هر نشانگر جدا دیده می‌شود */
  var TAP_SLOP = 7;            /* px: جابه‌جایی کمتر از این «لمس» است، نه «کشیدن» */

  /* ── منبع‌های کاشی به ترتیب اولویت ─────────────────────────────────── */
  function fillTemplate(template, z, x, y) {
    return String(template)
      .split('{z}').join(String(z))
      .split('{x}').join(String(x))
      .split('{y}').join(String(y));
  }

  function resolveTileSources(options) {
    var opts = options || {};
    if (Array.isArray(opts.tileSources) && opts.tileSources.length) return opts.tileSources.slice();
    if (Array.isArray(global.EPLAK_MAP_TILE_SOURCES) && global.EPLAK_MAP_TILE_SOURCES.length) {
      return global.EPLAK_MAP_TILE_SOURCES.slice();
    }
    var list = [];
    var proxy = opts.tileProxy ? String(opts.tileProxy) : '';
    if (!proxy) {
      /* در اپ/وب، همان آدرس پایه‌ی API (core/storage.js) + tiles.php */
      try {
        if (typeof global.eplakApiBase === 'function') {
          var base = String(global.eplakApiBase() || '').replace(/\/+$/, '');
          if (base) proxy = base + '/tiles.php';
        }
      } catch (e) { /* مستقیم OSM */ }
    }
    if (proxy) list.push(proxy + (proxy.indexOf('?') > -1 ? '&' : '?') + 'z={z}&x={x}&y={y}');
    list.push(TILE_URL);
    return list;
  }

  /* ── استایل‌ها یک‌بار به صفحه اضافه می‌شوند (هم اپ، هم پنل ادمین) ── */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.ep-map{position:relative;overflow:hidden;border-radius:14px;background:#dfe6ee;',
      '  touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;}',
      '.ep-map.ep-map-dragging{cursor:grabbing;}',
      '.ep-map-tiles{position:absolute;inset:0;}',
      '.ep-map-tiles img{position:absolute;width:256px;height:256px;border:0;pointer-events:none;',
      '  -webkit-user-drag:none;user-select:none;}',
      '.ep-map-dark .ep-map-tiles img{filter:brightness(0.72) saturate(0.85) hue-rotate(180deg) invert(0.92);}',
      '.ep-map-fallback{position:absolute;inset:0;z-index:5;display:none;align-items:center;justify-content:center;',
      '  flex-direction:column;gap:6px;text-align:center;padding:12px;background:linear-gradient(135deg,#16233c,#0d1527);',
      '  color:#cbd5e1;font-size:11.5px;line-height:1.9;}',
      '.ep-map-fallback.show{display:flex;}',
      '.ep-map-retry{margin-top:4px;border:0;border-radius:10px;padding:7px 14px;background:#00C9A7;color:#04201b;',
      '  font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;}',
      '.ep-map-fallback .ep-map-coords{direction:ltr;font-weight:700;color:#00C9A7;font-size:12.5px;}',
      '.ep-map-pin{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);pointer-events:none;',
      '  filter:drop-shadow(0 6px 10px rgba(239,68,68,0.45));z-index:3;}',
      '.ep-map-pin svg{display:block;}',
      '.ep-map-crosshair{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;',
      '  border-radius:50%;border:2px solid rgba(0,201,167,0.9);box-shadow:0 0 0 6px rgba(0,201,167,0.18);z-index:2;}',
      '.ep-map-attrib{position:absolute;left:6px;bottom:6px;z-index:4;background:rgba(13,21,39,0.62);',
      '  color:#e2e8f0;font-size:9.5px;padding:2px 7px;border-radius:8px;text-decoration:none;}',
      '.ep-map-zoom{position:absolute;right:8px;top:8px;z-index:4;display:flex;flex-direction:column;gap:6px;}',
      '.ep-map-zoom button{width:32px;height:32px;border-radius:10px;border:1px solid rgba(255,255,255,0.28);',
      '  background:rgba(13,21,39,0.72);color:#fff;font-size:17px;font-weight:800;line-height:1;cursor:pointer;}',
      '.ep-map-zoom button:active{transform:scale(0.94);}',
      '.ep-map-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
      '  z-index:2;background:rgba(223,230,238,0.65);font-size:12px;color:#334155;}',
      /* ── نقشه‌ی نمایشی: نشانگر اماکن، خوشه، نقطه‌ی «موقعیت من» ── */
      '.ep-map-viewer .ep-map-fallback{inset:auto 8px 8px 8px;border-radius:12px;padding:8px 10px;',
      '  flex-direction:row;flex-wrap:wrap;gap:6px 10px;font-size:11px;line-height:1.7;background:rgba(13,21,39,0.92);}',
      '.ep-map-viewer .ep-map-fallback .ep-map-retry{margin:0;padding:5px 12px;}',
      '.ep-map-viewer .ep-map-loading{background:transparent;color:#475569;align-items:flex-start;justify-content:center;',
      '  padding-top:10px;pointer-events:none;}',
      '.ep-map-markers{position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden;}',
      '.ep-mk{position:absolute;left:0;top:0;width:34px;height:34px;margin:-41px 0 0 -17px;padding:0;border:0;',
      '  background:none;pointer-events:auto;cursor:pointer;z-index:2;transform-origin:17px 41px;',
      '  -webkit-tap-highlight-color:transparent;font-family:inherit;}',
      '.ep-mk-pin{position:absolute;inset:0;border-radius:50% 50% 50% 0;transform:rotate(-45deg);',
      '  background:var(--c,#ef4444);border:2.5px solid #fff;box-shadow:0 3px 9px rgba(0,0,0,0.38);}',
      '.ep-mk-gl{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--ink,#fff);}',
      '.ep-mk-gl svg{width:17px;height:17px;display:block;}',
      '.ep-mk.sel{z-index:6;}',
      '.ep-mk.sel .ep-mk-pin{box-shadow:0 0 0 3px rgba(255,255,255,0.55),0 5px 14px rgba(0,0,0,0.5);}',
      '.ep-mk.sel::after{content:"";position:absolute;left:50%;top:41px;width:16px;height:16px;margin:-8px 0 0 -8px;',
      '  border-radius:50%;border:2px solid var(--c,#ef4444);opacity:0;animation:epMkRing 1.7s ease-out infinite;}',
      '@keyframes epMkRing{0%{transform:scale(0.5);opacity:0.9;}100%{transform:scale(2.6);opacity:0;}}',
      '.ep-cl{position:absolute;left:0;top:0;min-width:38px;height:38px;margin:-19px 0 0 -19px;padding:0 6px;',
      '  box-sizing:border-box;border-radius:19px;background:var(--c,#0f766e);color:#fff;border:3px solid rgba(255,255,255,0.96);',
      '  box-shadow:0 3px 10px rgba(0,0,0,0.4);font:800 13px/32px Vazirmatn,Tahoma,sans-serif;text-align:center;',
      '  pointer-events:auto;cursor:pointer;z-index:3;-webkit-tap-highlight-color:transparent;}',
      '.ep-cl:active{transform-origin:center;}',
      '.ep-me{position:absolute;left:0;top:0;width:0;height:0;z-index:1;pointer-events:none;}',
      '.ep-me-acc{position:absolute;left:0;top:0;border-radius:50%;background:rgba(37,99,235,0.13);',
      '  border:1px solid rgba(37,99,235,0.35);transform:translate(-50%,-50%);}',
      '.ep-me-dot{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;background:#2563eb;',
      '  border:3px solid #fff;box-sizing:border-box;box-shadow:0 2px 7px rgba(0,0,0,0.45);}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  /* ── تبدیل‌های ریاضی نقشه (Web Mercator) ───────────────────────────── */
  function lngToWorldX(lng, zoom) {
    return (lng + 180) / 360 * TILE_SIZE * Math.pow(2, zoom);
  }
  function latToWorldY(lat, zoom) {
    var clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
    var rad = clamped * Math.PI / 180;
    var y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
    return y * TILE_SIZE * Math.pow(2, zoom);
  }
  function worldXToLng(x, zoom) {
    return x / (TILE_SIZE * Math.pow(2, zoom)) * 360 - 180;
  }
  function worldYToLat(y, zoom) {
    var n = Math.PI - 2 * Math.PI * y / (TILE_SIZE * Math.pow(2, zoom));
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  /* ── ساخت یک نقشه در ظرف داده‌شده ─────────────────────────────────── */
  function create(container, options) {
    if (!container) return null;
    injectStyles();
    var opts = options || {};

    /* حالت «نمایشی»: بدون نشانگر/هدف وسط نقشه (برای نقشه‌ی اماکن) */
    var viewerMode = opts.picker === false;
    var gestures = opts.gestures !== false;   /* زوم با دو انگشت، چرخ موس و دابل‌کلیک */
    var minZoom = isFiniteNumber(opts.minZoom) ? Math.max(MIN_ZOOM, Math.round(opts.minZoom)) : MIN_ZOOM;
    var maxZoom = isFiniteNumber(opts.maxZoom) ? Math.min(MAX_ZOOM, Math.round(opts.maxZoom)) : MAX_ZOOM;

    var state = {
      lat: isFiniteNumber(opts.lat) ? opts.lat : 35.3242,   /* پیش‌فرض: ورامین */
      lng: isFiniteNumber(opts.lng) ? opts.lng : 51.6455,
      zoom: Math.max(minZoom, Math.min(maxZoom, isFiniteNumber(opts.zoom) ? opts.zoom : 15)),
      draggable: opts.draggable !== false,
      /* hasFix=false یعنی lat/lng فقط «مرکز اولیه‌ی نقشه» است و کاربر هنوز
         نقطه‌ای انتخاب نکرده (نشانگر پنهان می‌ماند). */
      hasFix: opts.hasFix === false ? false : (isFiniteNumber(opts.lat) && isFiniteNumber(opts.lng))
    };
    var tileCache = new Map();
    var tileErrors = 0;
    var tilesLayer, fallback, loading;
    var sources = resolveTileSources(opts);
    var activeSource = 0;        /* کاشی‌های تازه از این منبع شروع می‌شوند */
    var verifiedSource = -1;     /* بهترین منبعی که واقعاً تصویر داده است */
    var sourceFailures = sources.map(function () { return 0; });
    var anyTileLoaded = false;
    var watchdog = null;
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};

    container.classList.add('ep-map');
    container.innerHTML = '';

    if (viewerMode) container.classList.add('ep-map-viewer');

    tilesLayer = document.createElement('div');
    tilesLayer.className = 'ep-map-tiles';
    container.appendChild(tilesLayer);

    /* لایه‌ی نشانگرها (نقشه‌ی نمایشی): بالای کاشی‌ها، زیر دکمه‌های زوم */
    var markersLayer = document.createElement('div');
    markersLayer.className = 'ep-map-markers';
    container.appendChild(markersLayer);

    var crosshair = document.createElement('div');
    crosshair.className = 'ep-map-crosshair';
    container.appendChild(crosshair);

    var pin = document.createElement('div');
    pin.className = 'ep-map-pin';
    pin.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#ef4444" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="#ef4444" fill-opacity="0.35"/>'
      + '<circle cx="12" cy="10" r="3" fill="#ef4444"/></svg>';
    container.appendChild(pin);

    /* تا وقتی نقطه‌ای انتخاب نشده، به‌جای نشانگر یک «هدف» در مرکز دیده می‌شود
       (یعنی: نقشه را بکشید تا محل را انتخاب کنید). */
    pin.style.display = (state.hasFix && !viewerMode) ? '' : 'none';
    crosshair.style.display = (state.hasFix || viewerMode) ? 'none' : '';

    fallback = document.createElement('div');
    fallback.className = 'ep-map-fallback';
    fallback.innerHTML = typeof opts.fallbackHtml === 'string' ? opts.fallbackHtml
      : ('<div>🗺️ نقشه در دسترس نیست (اینترنت یا دسترسی به سرور نقشه)</div>'
      + '<div class="ep-map-coords">—</div>'
      + '<div>مختصات همین‌جا ثبت می‌شود و در پنل ادمین نمایش داده می‌شود.</div>'
      + '<button type="button" class="ep-map-retry">تلاش دوباره برای نقشه</button>');
    container.appendChild(fallback);
    var retryBtn = fallback.querySelector('.ep-map-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        retryTiles();
      });
    }

    loading = document.createElement('div');
    loading.className = 'ep-map-loading';
    loading.textContent = 'در حال بارگذاری نقشه…';
    container.appendChild(loading);

    var zoomBox = document.createElement('div');
    zoomBox.className = 'ep-map-zoom';
    zoomBox.innerHTML = '<button type="button" aria-label="بزرگ‌نمایی">+</button>'
      + '<button type="button" aria-label="کوچک‌نمایی">−</button>';
    container.appendChild(zoomBox);

    var attrib = document.createElement('a');
    attrib.className = 'ep-map-attrib';
    attrib.href = 'https://www.openstreetmap.org/copyright';
    attrib.target = '_blank';
    attrib.rel = 'noopener';
    attrib.textContent = '© OpenStreetMap';
    container.appendChild(attrib);

    zoomBox.children[0].addEventListener('click', function (e) {
      e.stopPropagation();
      setZoom(state.zoom + 1);
    });
    zoomBox.children[1].addEventListener('click', function (e) {
      e.stopPropagation();
      setZoom(state.zoom - 1);
    });

    function size() {
      var rect = container.getBoundingClientRect();
      return { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) };
    }

    function updateFallbackCoords() {
      var el = fallback.querySelector('.ep-map-coords');
      if (el) el.textContent = state.lat.toFixed(6) + ', ' + state.lng.toFixed(6);
    }

    /* ── درخواست یک کاشی از منبع شماره‌ی idx ──────────────────────────── */
    function requestTile(img, z, x, y, idx) {
      img.dataset.srcIdx = String(idx);
      img.src = fillTemplate(sources[idx], z, x, y);
    }

    function showFallback() {
      loading.style.display = 'none';
      fallback.classList.add('show');
      updateFallbackCoords();
    }

    /* موفقیت یا شکست هر کاشی؛ اگر یک منبع جواب نداد، همان کاشی (و کاشی‌های
       بعدی) از منبع بعدی گرفته می‌شود. فقط وقتی همه‌ی منبع‌ها شکست بخورند،
       کاشی پنهان و شمارنده‌ی خطا بالا می‌رود. */
    function attachTileHandlers(img, z, x, y) {
      img.addEventListener('load', function () {
        var idx = parseInt(img.dataset.srcIdx, 10) || 0;
        anyTileLoaded = true;
        tileErrors = 0;
        if (verifiedSource === -1 || idx < verifiedSource) verifiedSource = idx;
        activeSource = verifiedSource;
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
        loading.style.display = 'none';
        fallback.classList.remove('show');
      });
      img.addEventListener('error', function () {
        var idx = parseInt(img.dataset.srcIdx, 10) || 0;
        if (idx + 1 < sources.length) {
          sourceFailures[idx]++;
          if (verifiedSource !== idx && sourceFailures[idx] >= 2 && activeSource === idx) {
            activeSource = idx + 1;
          }
          requestTile(img, z, x, y, idx + 1);
          return;
        }
        img.style.visibility = 'hidden';
        tileErrors++;
        if (tileErrors >= MAX_TILE_ERRORS) showFallback();
      });
    }

    /* نگهبان: اگر شبکه بی‌صدا بسته باشد (نه خطا، نه تصویر)، به منبع بعدی برو */
    function armWatchdog() {
      if (watchdog || anyTileLoaded || typeof setTimeout !== 'function') return;
      watchdog = setTimeout(function () {
        watchdog = null;
        if (anyTileLoaded) return;
        if (activeSource + 1 < sources.length) {
          activeSource++;
          Array.prototype.slice.call(tilesLayer.children).forEach(function (node) {
            var parts = String(node.dataset.tile || '').split('/');
            if (parts.length === 3) {
              requestTile(node, parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2], 10), activeSource);
            }
          });
          armWatchdog();
        } else {
          showFallback();
        }
      }, SOURCE_WATCHDOG_MS);
    }

    /* دکمه‌ی «تلاش دوباره»: از اولین منبع، با کاشی‌های تازه */
    function retryTiles() {
      tileErrors = 0;
      activeSource = 0;
      verifiedSource = -1;
      anyTileLoaded = false;
      sourceFailures = sources.map(function () { return 0; });
      fallback.classList.remove('show');
      loading.style.display = '';
      tilesLayer.innerHTML = '';
      renderTiles();
    }

    /* رسم کاشی‌های لازم برای ظرف فعلی */
    function renderTiles() {
      var box = size();
      var centerX = lngToWorldX(state.lng, state.zoom);
      var centerY = latToWorldY(state.lat, state.zoom);
      var left = centerX - box.w / 2;
      var top = centerY - box.h / 2;
      var maxTile = Math.pow(2, state.zoom) - 1;

      var firstX = Math.floor(left / TILE_SIZE);
      var lastX = Math.floor((left + box.w) / TILE_SIZE);
      var firstY = Math.floor(top / TILE_SIZE);
      var lastY = Math.floor((top + box.h) / TILE_SIZE);

      var wanted = {};
      for (var tx = firstX; tx <= lastX; tx++) {
        for (var ty = firstY; ty <= lastY; ty++) {
          if (ty < 0 || ty > maxTile) continue;
          var wrappedX = ((tx % (maxTile + 1)) + maxTile + 1) % (maxTile + 1);
          var key = state.zoom + '/' + wrappedX + '/' + ty;
          wanted[key] = true;
          if (tilesLayer.querySelector('[data-tile="' + key + '"]')) continue;

          var img = document.createElement('img');
          img.dataset.tile = key;
          img.alt = '';
          img.loading = 'eager';      /* کاشی‌ها همین‌الان لازم‌اند؛ lazy در وب‌ویو دیر می‌آید */
          img.decoding = 'async';
          img.style.left = (tx * TILE_SIZE - left) + 'px';
          img.style.top = (ty * TILE_SIZE - top) + 'px';
          attachTileHandlers(img, state.zoom, wrappedX, ty);
          requestTile(img, state.zoom, wrappedX, ty, activeSource);
          tilesLayer.appendChild(img);
        }
      }

      /* کاشی‌های خارج از محدوده حذف می‌شوند تا حجم حافظه کم بماند */
      Array.prototype.slice.call(tilesLayer.children).forEach(function (node) {
        if (!wanted[node.dataset.tile]) node.remove();
      });

      /* جابه‌جایی کاشی‌های موجود (بعد از پن/زوم) */
      Array.prototype.slice.call(tilesLayer.children).forEach(function (node) {
        var parts = String(node.dataset.tile || '').split('/');
        if (parts.length !== 3) return;
        var tx = parseInt(parts[1], 10);
        var ty = parseInt(parts[2], 10);
        if (isNaN(tx) || isNaN(ty)) return;
        node.style.left = (tx * TILE_SIZE - left) + 'px';
        node.style.top = (ty * TILE_SIZE - top) + 'px';
      });

      updateFallbackCoords();
      renderMarkers();
    }

    function notify() {
      onChange({ lat: state.lat, lng: state.lng, zoom: state.zoom, hasFix: state.hasFix });
    }

    function render(notifyChange) {
      renderTiles();
      if (notifyChange !== false) notify();
    }

    function setPosition(lat, lng, silent) {
      if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return;
      state.lat = Math.max(-85, Math.min(85, lat));
      state.lng = ((lng + 180) % 360 + 360) % 360 - 180;
      state.hasFix = true;
      if (!viewerMode) {
        pin.style.display = '';
        crosshair.style.display = 'none';
      }
      render(silent !== true);
    }

    function setZoom(zoom) {
      var next = Math.max(minZoom, Math.min(maxZoom, Math.round(zoom)));
      if (next === state.zoom) return;
      state.zoom = next;
      render(true);
    }

    /* زوم حول یک نقطه‌ی مشخص از ظرف (px)؛ همان نقطه‌ی جغرافیایی زیر انگشت می‌ماند */
    function zoomAt(zoom, px, py) {
      var next = Math.max(minZoom, Math.min(maxZoom, Math.round(zoom)));
      if (next === state.zoom) return;
      var box = size();
      var fx = isFiniteNumber(px) ? px : box.w / 2;
      var fy = isFiniteNumber(py) ? py : box.h / 2;
      var wx = lngToWorldX(state.lng, state.zoom) - box.w / 2 + fx;
      var wy = latToWorldY(state.lat, state.zoom) - box.h / 2 + fy;
      var focusLng = worldXToLng(wx, state.zoom);
      var focusLat = worldYToLat(wy, state.zoom);
      state.zoom = next;
      state.lng = worldXToLng(lngToWorldX(focusLng, next) - fx + box.w / 2, next);
      state.lat = Math.max(-85, Math.min(85, worldYToLat(latToWorldY(focusLat, next) - fy + box.h / 2, next)));
      render(true);
    }

    /* مختصات ↔ پیکسل ظرف (برای نشانگرها و لمس روی نقشه) */
    function latLngToPx(lat, lng) {
      var box = size();
      return {
        x: lngToWorldX(lng, state.zoom) - (lngToWorldX(state.lng, state.zoom) - box.w / 2),
        y: latToWorldY(lat, state.zoom) - (latToWorldY(state.lat, state.zoom) - box.h / 2)
      };
    }
    function pxToLatLng(px, py) {
      var box = size();
      var wx = lngToWorldX(state.lng, state.zoom) - box.w / 2 + px;
      var wy = latToWorldY(state.lat, state.zoom) - box.h / 2 + py;
      return { lat: worldYToLat(wy, state.zoom), lng: worldXToLng(wx, state.zoom) };
    }

    function getBounds() {
      var box = size();
      var nw = pxToLatLng(0, 0);
      var se = pxToLatLng(box.w, box.h);
      return { north: nw.lat, west: nw.lng, south: se.lat, east: se.lng };
    }

    /* نمایش یک محدوده (مثلاً همه‌ی اماکن فیلترشده) با بیشترین زوم ممکن */
    function fitBounds(b, o) {
      if (!b || !isFiniteNumber(b.south) || !isFiniteNumber(b.north) || !isFiniteNumber(b.west) || !isFiniteNumber(b.east)) return;
      var po = o || {};
      var pad = isFiniteNumber(po.padding) ? po.padding : 32;
      var hiZ = Math.min(maxZoom, isFiniteNumber(po.maxZoom) ? po.maxZoom : 16);
      var box = size();
      var availW = Math.max(40, box.w - pad * 2);
      var availH = Math.max(40, box.h - pad * 2);
      var z = hiZ;
      for (; z > minZoom; z--) {
        var w = lngToWorldX(b.east, z) - lngToWorldX(b.west, z);
        var h = latToWorldY(b.south, z) - latToWorldY(b.north, z);
        if (w <= availW && h <= availH) break;
      }
      state.zoom = Math.max(minZoom, z);
      var midX = (lngToWorldX(b.west, state.zoom) + lngToWorldX(b.east, state.zoom)) / 2;
      var midY = (latToWorldY(b.north, state.zoom) + latToWorldY(b.south, state.zoom)) / 2;
      state.lng = worldXToLng(midX, state.zoom);
      state.lat = Math.max(-85, Math.min(85, worldYToLat(midY, state.zoom)));
      render(true);
    }

    /* انتقال نقشه به یک نقطه (با زوم اختیاری) */
    function panTo(lat, lng, zoom) {
      if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return;
      state.lat = Math.max(-85, Math.min(85, lat));
      state.lng = ((lng + 180) % 360 + 360) % 360 - 180;
      if (isFiniteNumber(zoom)) state.zoom = Math.max(minZoom, Math.min(maxZoom, Math.round(zoom)));
      render(true);
    }

    /* ── نشانگرها، خوشه‌ها و «موقعیت من» (نقشه‌ی نمایشی) ──────────────────── */
    var markerItems = [];
    var markerNodes = {};
    var clusterNodes = [];
    var selectedId = null;
    var userFix = null;
    var userNode = null;
    var userAcc = null;
    var suppressClickUntil = 0;
    var onMarkerClick = typeof opts.onMarkerClick === 'function' ? opts.onMarkerClick : null;
    var onMapClick = typeof opts.onMapClick === 'function' ? opts.onMapClick : null;
    var onClusterClick = typeof opts.onClusterClick === 'function' ? opts.onClusterClick : null;

    function itemById(id) {
      for (var i = 0; i < markerItems.length; i++) if (markerItems[i].id === id) return markerItems[i];
      return null;
    }

    function ensureMarkerNode(it) {
      var node = markerNodes[it.id];
      if (node) return node;
      node = document.createElement('button');
      node.type = 'button';
      node.className = 'ep-mk' + (it.id === selectedId ? ' sel' : '');
      node.dataset.id = it.id;
      node.setAttribute('aria-label', it.label || '');
      node.style.setProperty('--c', it.color || '#ef4444');
      node.style.setProperty('--ink', it.ink || '#ffffff');
      node.innerHTML = '<span class="ep-mk-pin"></span><span class="ep-mk-gl">' + (it.glyph || '') + '</span>';
      markersLayer.appendChild(node);
      markerNodes[it.id] = node;
      return node;
    }

    function placeNode(node, x, y, selected) {
      node.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)' + (selected ? ' scale(1.2)' : '');
    }

    function clusterColor(members) {
      var color = members[0].it.color || '';
      for (var i = 1; i < members.length; i++) {
        if ((members[i].it.color || '') !== color) return '';
      }
      return color;
    }

    function metersPerPixel(lat, zoom) {
      return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
    }

    function renderMarkers() {
      if (!markerItems.length && !userFix && !clusterNodes.length) return;
      var box = size();
      var left = lngToWorldX(state.lng, state.zoom) - box.w / 2;
      var top = latToWorldY(state.lat, state.zoom) - box.h / 2;
      var pad = 48;
      var visible = [];

      markerItems.forEach(function (it) {
        var x = lngToWorldX(it.lng, state.zoom) - left;
        var y = latToWorldY(it.lat, state.zoom) - top;
        var existing = markerNodes[it.id];
        if (x < -pad || y < -pad || x > box.w + pad || y > box.h + pad) {
          if (existing) existing.style.display = 'none';
          return;
        }
        visible.push({ it: it, x: x, y: y });
      });

      var clustering = opts.cluster !== false && state.zoom < CLUSTER_MAX_ZOOM && visible.length > 1;
      var groups = [];
      var singles = [];
      visible.forEach(function (v) {
        if (!clustering || v.it.id === selectedId) { singles.push(v); return; }
        for (var k = 0; k < groups.length; k++) {
          var g = groups[k];
          var dx = g.x - v.x;
          var dy = g.y - v.y;
          if (dx * dx + dy * dy <= CLUSTER_RADIUS * CLUSTER_RADIUS) {
            g.members.push(v);
            g.x += (v.x - g.x) / g.members.length;
            g.y += (v.y - g.y) / g.members.length;
            return;
          }
        }
        groups.push({ x: v.x, y: v.y, members: [v] });
      });

      var clusters = [];
      groups.forEach(function (g) {
        if (g.members.length === 1) singles.push(g.members[0]);
        else clusters.push(g);
      });

      singles.forEach(function (v) {
        var node = ensureMarkerNode(v.it);
        node.style.display = '';
        placeNode(node, v.x, v.y, v.it.id === selectedId);
      });
      clusters.forEach(function (g) {
        g.members.forEach(function (v) {
          var node = markerNodes[v.it.id];
          if (node) node.style.display = 'none';
        });
      });

      clusterNodes.forEach(function (n) { n.remove(); });
      clusterNodes = clusters.map(function (g) {
        var node = document.createElement('button');
        node.type = 'button';
        node.className = 'ep-cl';
        var color = clusterColor(g.members);
        if (color) node.style.setProperty('--c', color);
        node.dataset.ids = g.members.map(function (v) { return v.it.id; }).join(',');
        node.textContent = String(g.members.length);
        node.setAttribute('aria-label', String(g.members.length));
        node.style.transform = 'translate(' + g.x.toFixed(1) + 'px,' + g.y.toFixed(1) + 'px)';
        markersLayer.appendChild(node);
        return node;
      });

      renderUser(left, top);
    }

    function renderUser(left, top) {
      if (!userFix) {
        if (userNode) userNode.style.display = 'none';
        return;
      }
      if (!userNode) {
        userNode = document.createElement('div');
        userNode.className = 'ep-me';
        userAcc = document.createElement('span');
        userAcc.className = 'ep-me-acc';
        var dot = document.createElement('span');
        dot.className = 'ep-me-dot';
        userNode.appendChild(userAcc);
        userNode.appendChild(dot);
        markersLayer.appendChild(userNode);
      }
      var x = lngToWorldX(userFix.lng, state.zoom) - left;
      var y = latToWorldY(userFix.lat, state.zoom) - top;
      userNode.style.display = '';
      userNode.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      var radius = isFiniteNumber(userFix.acc) && userFix.acc > 0
        ? Math.min(220, userFix.acc / metersPerPixel(userFix.lat, state.zoom)) : 0;
      if (radius >= 14) {
        userAcc.style.display = '';
        userAcc.style.width = (radius * 2).toFixed(0) + 'px';
        userAcc.style.height = (radius * 2).toFixed(0) + 'px';
      } else {
        userAcc.style.display = 'none';
      }
    }

    function setMarkers(items) {
      markerItems = (items || []).filter(function (it) {
        return it && it.id != null && isFiniteNumber(it.lat) && isFiniteNumber(it.lng);
      });
      var keep = {};
      markerItems.forEach(function (it) { keep[it.id] = true; });
      Object.keys(markerNodes).forEach(function (id) {
        if (!keep[id]) {
          markerNodes[id].remove();
          delete markerNodes[id];
        }
      });
      if (selectedId != null && !keep[selectedId]) selectedId = null;
      renderMarkers();
    }

    function setSelected(id) {
      selectedId = id == null ? null : id;
      Object.keys(markerNodes).forEach(function (key) {
        markerNodes[key].classList.toggle('sel', selectedId != null && key === String(selectedId));
      });
      renderMarkers();
    }

    function setUserLocation(lat, lng, acc) {
      if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return;
      userFix = { lat: lat, lng: lng, acc: isFiniteNumber(acc) ? acc : 0 };
      renderMarkers();
    }
    function clearUserLocation() {
      userFix = null;
      renderMarkers();
    }

    function getPosition() {
      return { lat: state.lat, lng: state.lng, zoom: state.zoom, hasFix: state.hasFix };
    }

    /* ── پن کردن نقشه با انگشت/موس (نشانگر در مرکز می‌ماند) و زوم با دو انگشت ── */
    var drag = null;
    var dragMoved = false;
    var downPt = null;
    var pinch = null;
    function pointerPos(e) {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }
    function touchDistance(e) {
      var a = e.touches[0];
      var b = e.touches[1];
      return Math.sqrt(Math.pow(a.clientX - b.clientX, 2) + Math.pow(a.clientY - b.clientY, 2));
    }
    function touchMid(e) {
      var rect = container.getBoundingClientRect();
      return {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - (rect.left || 0),
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - (rect.top || 0)
      };
    }
    function onDown(e) {
      if (gestures && e.touches && e.touches.length >= 2) {
        /* دو انگشت: کشیدن لغو و زوم شروع می‌شود */
        drag = null;
        pinch = { d0: Math.max(1, touchDistance(e)), z0: state.zoom };
        container.classList.add('ep-map-dragging');
        return;
      }
      if (!state.draggable) return;
      var p = pointerPos(e);
      drag = { x: p.x, y: p.y, worldX: lngToWorldX(state.lng, state.zoom), worldY: latToWorldY(state.lat, state.zoom) };
      downPt = { x: p.x, y: p.y };
      dragMoved = false;
      container.classList.add('ep-map-dragging');
    }
    function onMove(e) {
      if (pinch) {
        if (e.touches && e.touches.length >= 2) {
          if (e.cancelable) e.preventDefault();
          /* هر ~۳۲٪ فاصله‌ی بیشتر/کمتر بین دو انگشت = یک پله زوم */
          var steps = Math.round(1.25 * Math.log(touchDistance(e) / pinch.d0) / Math.LN2);
          var mid = touchMid(e);
          zoomAt(pinch.z0 + steps, mid.x, mid.y);
        }
        return;
      }
      if (!drag) return;
      if (e.cancelable) e.preventDefault();
      var p = pointerPos(e);
      if (!dragMoved && downPt && (Math.abs(p.x - downPt.x) > TAP_SLOP || Math.abs(p.y - downPt.y) > TAP_SLOP)) {
        dragMoved = true;
      }
      var worldX = drag.worldX - (p.x - drag.x);
      var worldY = drag.worldY - (p.y - drag.y);
      state.lng = worldXToLng(worldX, state.zoom);
      state.lat = Math.max(-85, Math.min(85, worldYToLat(worldY, state.zoom)));
      state.hasFix = true;
      if (!viewerMode) {
        pin.style.display = '';
        crosshair.style.display = 'none';
      }
      renderTiles();
    }
    function onUp(e) {
      if (pinch) {
        if (!e || !e.touches || e.touches.length < 2) {
          pinch = null;
          suppressClickUntil = Date.now() + 350;
          container.classList.remove('ep-map-dragging');
          notify();
        }
        return;
      }
      if (!drag) return;
      drag = null;
      if (dragMoved) suppressClickUntil = Date.now() + 350;   /* «کشیدن» را «لمس» حساب نکن */
      dragMoved = false;
      container.classList.remove('ep-map-dragging');
      notify();
    }

    container.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    container.addEventListener('touchstart', onDown, { passive: true });
    container.addEventListener('touchmove', onMove, { passive: false });
    container.addEventListener('touchend', onUp);
    container.addEventListener('touchcancel', onUp);

    window.addEventListener('resize', function () { renderTiles(); });

    /* چرخ موس و دابل‌کلیک (نسخه‌ی مرورگر/دسکتاپ) */
    var lastWheelAt = 0;
    if (gestures) {
      container.addEventListener('wheel', function (e) {
        /* بدون Ctrl/⌘ چرخ موس صفحه را اسکرول می‌کند (نقشه نباید اسکرول صفحه را بدزدد)؛
           با Ctrl/⌘ و در لمس‌پدِ لپ‌تاپ (حرکت دو انگشتیِ بزرگ‌نمایی) نقشه زوم می‌شود. */
        if (!e.ctrlKey && !e.metaKey && opts.wheelZoom !== 'always') return;
        if (e.cancelable) e.preventDefault();
        var now = Date.now();
        if (now - lastWheelAt < 160) return;
        lastWheelAt = now;
        var rect = container.getBoundingClientRect();
        zoomAt(state.zoom + (e.deltaY < 0 ? 1 : -1), e.clientX - (rect.left || 0), e.clientY - (rect.top || 0));
      }, { passive: false });
      container.addEventListener('dblclick', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('.ep-mk, .ep-cl, .ep-map-zoom, .ep-map-fallback')) return;
        var rect = container.getBoundingClientRect();
        zoomAt(state.zoom + 1, e.clientX - (rect.left || 0), e.clientY - (rect.top || 0));
      });
    }

    /* لمس نشانگر/خوشه و لمس جای خالیِ نقشه */
    markersLayer.addEventListener('click', function (e) {
      if (Date.now() < suppressClickUntil) return;
      var t = e.target;
      var el = t && t.closest ? t.closest('.ep-mk, .ep-cl') : null;
      if (!el) return;
      if (e.stopPropagation) e.stopPropagation();
      if (el.classList.contains('ep-cl')) {
        var ids = String(el.dataset.ids || '').split(',');
        var members = ids.map(itemById).filter(Boolean);
        if (onClusterClick) { onClusterClick(ids, members); return; }
        var lats = members.map(function (m) { return m.lat; });
        var lngs = members.map(function (m) { return m.lng; });
        if (members.length) {
          var bounds = { south: Math.min.apply(null, lats), north: Math.max.apply(null, lats),
                         west: Math.min.apply(null, lngs), east: Math.max.apply(null, lngs) };
          var before = state.zoom;
          fitBounds(bounds, { padding: 56, maxZoom: Math.min(maxZoom, CLUSTER_MAX_ZOOM) });
          if (state.zoom <= before) setZoom(before + 1);
        }
        return;
      }
      if (onMarkerClick) onMarkerClick(el.dataset.id, itemById(el.dataset.id));
    });
    container.addEventListener('click', function (e) {
      if (!onMapClick || Date.now() < suppressClickUntil) return;
      var t = e.target;
      if (t && t.closest && t.closest('.ep-mk, .ep-cl, .ep-map-zoom, .ep-map-attrib, .ep-map-fallback')) return;
      var rect = container.getBoundingClientRect();
      var ll = pxToLatLng(e.clientX - (rect.left || 0), e.clientY - (rect.top || 0));
      onMapClick(ll.lat, ll.lng);
    });

    /* رسم اولیه: بدون این کار، نقشه تا اولین جابه‌جایی/زوم خالی می‌ماند. */
    renderTiles();
    armWatchdog();

    return {
      setPosition: setPosition,
      getPosition: getPosition,
      setZoom: setZoom,
      zoomIn: function () { setZoom(state.zoom + 1); },
      zoomOut: function () { setZoom(state.zoom - 1); },
      zoomAt: zoomAt,
      refresh: function () { renderTiles(); },
      /* ── نقشه‌ی نمایشی ── */
      setMarkers: setMarkers,
      setSelected: setSelected,
      getSelected: function () { return selectedId; },
      setUserLocation: setUserLocation,
      clearUserLocation: clearUserLocation,
      fitBounds: fitBounds,
      panTo: panTo,
      getBounds: getBounds,
      latLngToPx: latLngToPx,
      pxToLatLng: pxToLatLng,
      setTheme: function (night) { container.classList.toggle('ep-map-dark', !!night); },
      retry: retryTiles,
      /* برای عیب‌یابی و آزمون: کدام منبع کاشی فعال/تأییدشده است */
      tileStatus: function () {
        return { sources: sources.slice(), active: activeSource, verified: verifiedSource, errors: tileErrors, loaded: anyTileLoaded };
      },
      destroy: function () {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
        tileCache.clear();
      },
      element: container
    };
  }

  /* ── ساخت «آدرس نوشتاری دقیق» از پاسخ آدرس‌یاب ───────────────────────
     پاسخ خام سرویس، یک رشته‌ی طولانی و بی‌ترتیب است (کشور، استان، شهر، …)
     و در کادر «آدرس» بدرد نمی‌خورد. اینجا آدرس کوتاه، مرتب و فارسی ساخته
     می‌شود: «خیابان، پلاک، محله، شهر».
     ترتیب اولویت: خیابان/معبر → محله → شهر → (در صورت نبود) شهرستان/استان. */
  var STREET_KEYS = ['road', 'pedestrian', 'footway', 'cycleway', 'residential', 'path', 'square'];
  var HOOD_KEYS   = ['neighbourhood', 'quarter', 'suburb', 'hamlet', 'borough', 'city_block'];
  var CITY_KEYS   = ['city', 'town', 'village', 'municipality', 'city_district', 'county'];

  function firstOf(source, keys) {
    for (var i = 0; i < keys.length; i++) {
      var value = source && source[keys[i]];
      if (value && String(value).trim() !== '') return String(value).trim();
    }
    return '';
  }

  function formatShortAddress(data, lat, lng) {
    if (!data) return '';
    var addr = data.address || {};
    var parts = [];

    var street = firstOf(addr, STREET_KEYS);
    var house  = addr.house_number ? ('پلاک ' + String(addr.house_number).trim()) : '';
    if (street) parts.push(house ? (street + '، ' + house) : street);

    var hood = firstOf(addr, HOOD_KEYS);
    if (hood && parts.indexOf(hood) === -1) parts.push(hood);

    var city = firstOf(addr, CITY_KEYS);
    if (city && parts.indexOf(city) === -1) parts.push(city);

    /* اگر فقط محله/شهر را داشتیم و نام خیابان نبود، از رشته‌ی کامل سرویس
       (display_name) برای «دقیق‌تر شدن» استفاده می‌کنیم. */
    if (parts.length < 2 && data.display_name) {
      String(data.display_name).split(',').forEach(function (piece) {
        var value = piece.trim();
        if (value && parts.length < 3 && parts.indexOf(value) === -1 && !/^\d+$/.test(value)) {
          parts.push(value);
        }
      });
    }

    if (!parts.length) return '';

    var text = parts.join('، ');
    if (text.length > 120) text = text.slice(0, 120).trim();

    /* اگر آدرس خیلی کوتاه/مبهم بود، مختصات دقیق را هم کنارش می‌گذاریم تا
       کاربر بداند موقعیت ثبت‌شده کجاست. */
    if (text.length < 10 && isFiniteNumber(lat) && isFiniteNumber(lng)) {
      text = text + ' (عرض ' + Number(lat).toFixed(5) + ' • طول ' + Number(lng).toFixed(5) + ')';
    }
    return text;
  }

  /* ── آدرس‌یابی معکوس: از مختصات به آدرس فارسی ─────────────────────────
     اگر اینترنت یا سرویس نقشه پاسخ ندهد، null برمی‌گردد و برنامه
     «عرض/طول جغرافیایی» را نشان می‌دهد. مهلت ۶ ثانیه گذاشته شده تا اگر
     سرویس کند بود، کاربر معطل نماند. */
  function reverseGeocode(lat, lng) {
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return Promise.resolve(null);
    var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1'
      + '&accept-language=fa&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng);

    var options = { headers: { 'Accept': 'application/json' } };
    var timer = null;
    if (typeof AbortController === 'function') {
      var controller = new AbortController();
      options.signal = controller.signal;
      timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, 6000);
    }

    return fetch(url, options)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (timer) clearTimeout(timer);
        if (!data) return null;
        var short = formatShortAddress(data, lat, lng);
        if (short) return short;
        /* آخرین تلاش: رشته‌ی خام سرویس (اگر آدرس ساخت‌یافته نداشت) */
        var fallback = data.display_name ? String(data.display_name).split(',').slice(0, 3).join('، ').trim() : '';
        return fallback || null;
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        return null;
      });
  }

  /* متن مختصات برای نمایش به کاربر */
  function formatPosition(lat, lng, accuracy) {
    var text = 'عرض ' + Number(lat).toFixed(6) + ' • طول ' + Number(lng).toFixed(6);
    if (isFiniteNumber(accuracy) && accuracy > 0) {
      text += ' • دقت حدود ' + Math.round(accuracy) + ' متر';
    }
    return text;
  }

  var api = {
    create: create,
    resolveTileSources: resolveTileSources,
    reverseGeocode: reverseGeocode,
    formatShortAddress: formatShortAddress,
    formatPosition: formatPosition,
    isFiniteNumber: isFiniteNumber
  };

  global.EplakMap = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
