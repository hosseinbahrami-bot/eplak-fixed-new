/* ============================================================================
   core/places.js — منطقِ «نقشه و اماکن شهری»
   (جستجو، فاصله، دسته‌بندی، آیکون دسته‌ها و لینک‌های «نشان» برای مسیریابی)

   این فایل هیچ DOM و هیچ شبکه‌ای را لمس نمی‌کند؛ پس هم در اپ، هم در مرورگر و هم در
   آزمون‌های خودکار (Node) یک‌جور اجرا می‌شود. نمایش و نقشه در modules/city-map.js است
   و خودِ فهرست اماکن در core/places-data.js (window.EPLAK_PLACES_DATA).

   ── لینک‌های نشان (Neshan) ───────────────────────────────────────────────────
   فرمت‌ها عیناً از «سوالات متداول پلتفرم نشان» (platform.neshan.org/faq) است:
     • مسیریابی بین دو نقطه (اندروید و وب)
         https://nshn.ir/?origin=lat,lng&destination=lat,lng&vehicle=d      (d خودرو، m موتور)
     • مسیریابی (iOS)
         neshan://?origin=lat,lng&destination=lat,lng&vehicle=d             (d b p m w)
     • نمایش یک نقطه (اندروید و وب):  https://nshn.ir/?lat=lat&lng=lng
     • نمایش یک نقطه (iOS):            neshan://?ll=lat,lng
   اگر برنامه‌ی نشان نصب باشد همین لینک‌ها آن را باز می‌کنند؛ وگرنه نسخه‌ی وب نشان.
   «مبدأ» همان موقعیت GPS کاربر است؛ اگر GPS در دسترس نبود، فقط «نمایش مقصد» باز
   می‌شود و کاربر در خود نشان روی «مسیریابی» می‌زند (مبدأ را نشان از موقعیت فعلی می‌گیرد).
   ============================================================================ */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.EplakPlaces = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';

  var NESHAN_PACKAGE = 'org.rajman.neshan.traffic.tehran.navigator';
  var NESHAN_ORIGIN = 'https://nshn.ir';          /* بدون اسلش پایانی */
  var NESHAN_SCHEME = 'neshan://';
  var NESHAN_INSTALL_URL = 'https://cafebazaar.ir/app/' + NESHAN_PACKAGE;

  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

  /* ── داده ─────────────────────────────────────────────────────────────── */
  function loadData() {
    if (root.EPLAK_PLACES_DATA) return root.EPLAK_PLACES_DATA;
    try {
      if (typeof require === 'function') return require('./places-data.js');
    } catch (e) { /* در مرورگر نیست */ }
    return { version: '0', center: { lat: 35.33, lng: 51.643, zoom: 13 }, bounds: null, categories: [], places: [] };
  }
  var DATA = loadData();
  var MERGED = null;          /* null = بدون اصلاحِ ادمین؛ همان فهرست پیش‌فرض */
  var REMOTE_INFO = { custom: 0, edited: 0, hidden: 0, v: '' };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function categories() { return DATA.categories || []; }
  /* فهرست پیش‌فرضِ همراه اپ؛ و پس از applyRemote، همان فهرست + اصلاح‌های ادمین */
  function basePlaces() { return DATA.places || []; }
  function places() { return MERGED || basePlaces(); }

  function categoryById(id) {
    var list = categories();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function placeById(id) {
    var list = places();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ── متن‌ها (فارسی/انگلیسی) ────────────────────────────────────────────── */
  function isEn(lang) { return lang === 'en'; }
  function placeName(p, lang) { return p ? (isEn(lang) ? (p.en || p.fa) : (p.fa || p.en)) : ''; }
  /* مکان‌های افزوده/اصلاح‌شده‌ی ادمین (p.src) اگر متن انگلیسی نداشته باشند، متن فارسی را نشان می‌دهند */
  function placeAddr(p, lang) { return p ? (isEn(lang) ? (p.addrEn || (p.src ? (p.addr || '') : '')) : (p.addr || '')) : ''; }
  function placeNote(p, lang) { return p ? (isEn(lang) ? (p.noteEn || (p.src ? (p.note || '') : '')) : (p.note || '')) : ''; }
  function catName(c, lang) { return c ? (isEn(lang) ? (c.en || c.fa) : (c.fa || c.en)) : ''; }

  function toFaDigits(value) {
    return String(value).replace(/[0-9]/g, function (d) { return FA_DIGITS.charAt(+d); });
  }

  /* ── دسته‌ها ──────────────────────────────────────────────────────────── */
  /* یک مکان در دسته‌ی اصلی‌اش و (اگر also دارد) دسته‌ی دوم هم دیده می‌شود. */
  function inCategory(p, catId) {
    if (!p) return false;
    if (!catId || catId === 'all') return true;
    return p.cat === catId || p.also === catId;
  }

  function countByCategory(list) {
    var out = { all: 0 };
    (list || places()).forEach(function (p) {
      out.all++;
      out[p.cat] = (out[p.cat] || 0) + 1;
      if (p.also && p.also !== p.cat) out[p.also] = (out[p.also] || 0) + 1;
    });
    return out;
  }

  /* گروه‌بندی برای حالت «همه»: هر مکان فقط یک‌بار و زیر دسته‌ی اصلی‌اش می‌آید */
  function groupByCategory(list) {
    var groups = [];
    categories().forEach(function (c) {
      var items = (list || []).filter(function (p) { return p.cat === c.id; });
      if (items.length) groups.push({ cat: c, items: items });
    });
    return groups;
  }

  /* ── جستجو ────────────────────────────────────────────────────────────── */
  /* یکسان‌سازی متن: ی/ک عربی، اعراب، نیم‌فاصله، ارقام فارسی/عربی، علائم */
  function normalize(value) {
    var s = String(value == null ? '' : value);
    s = s.replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
         .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
         .replace(/[\u064A\u0649\u06CC]/g, '\u06CC')
         .replace(/\u0643/g, '\u06A9')
         .replace(/[\u06C0\u0629]/g, '\u0647')
         .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
         .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
         .toLowerCase()
         .replace(/[()\[\]{}«»"'،,.:;!؟?\-–—_\/\\|]+/g, ' ')
         .replace(/\s+/g, ' ')
         .trim();
    return s;
  }
  function compact(value) { return normalize(value).replace(/ /g, ''); }

  function haystack(p) {
    var c = categoryById(p.cat);
    var c2 = p.also ? categoryById(p.also) : null;
    return [p.fa, p.en, p.addr, p.addrEn, p.note, p.noteEn,
      c && c.fa, c && c.en, c2 && c2.fa, c2 && c2.en].join(' ');
  }

  /* امتیاز تطبیق؛ 0 یعنی نامرتبط. نام‌ها بیشتر از نشانی/توضیح وزن دارند. */
  function score(p, query) {
    var q = normalize(query);
    if (!q) return 1;
    var names = normalize((p.fa || '') + ' ' + (p.en || ''));
    var all = normalize(haystack(p));
    var tokens = q.split(' ');
    var sc = 0;
    var allIn = tokens.every(function (t) { return all.indexOf(t) > -1; });
    var compactHit = compact(haystack(p)).indexOf(compact(query)) > -1;
    if (!allIn && !compactHit) return 0;
    tokens.forEach(function (t) {
      if (names.indexOf(t) > -1) sc += 3;
      else if (all.indexOf(t) > -1) sc += 1;
    });
    if (compact(p.fa) === compact(query) || compact(p.en) === compact(query)) sc += 6;
    else if (compact(p.fa).indexOf(compact(query)) === 0 || compact(p.en).indexOf(compact(query)) === 0) sc += 3;
    return Math.max(sc, 1);
  }

  function search(list, query) {
    var q = normalize(query);
    var src = list || places();
    if (!q) return src.slice();
    var scored = [];
    src.forEach(function (p, i) {
      var s = score(p, query);
      if (s > 0) scored.push({ p: p, s: s, i: i });
    });
    scored.sort(function (a, b) { return (b.s - a.s) || (a.i - b.i); });
    return scored.map(function (x) { return x.p; });
  }

  /* ── فاصله ────────────────────────────────────────────────────────────── */
  function distanceKm(a, b) {
    if (!a || !b || !isNum(a.lat) || !isNum(a.lng) || !isNum(b.lat) || !isNum(b.lng)) return NaN;
    var R = 6371.0088, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLng = (b.lng - a.lng) * rad;
    var h = Math.pow(Math.sin(dLat / 2), 2)
      + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* «۸۵۰ متر» / «۱٫۲ کیلومتر» / «۴۵ کیلومتر»  —  "850 m" / "1.2 km" */
  function formatDistance(km, lang) {
    if (!isNum(km) || km < 0) return '';
    var en = isEn(lang);
    var meters = km * 1000;
    var value, unit;
    if (meters < 995) {
      value = String(Math.max(10, Math.round(meters / 10) * 10));
      unit = en ? 'm' : 'متر';
    } else {
      var k = km < 10 ? (Math.round(km * 10) / 10) : Math.round(km);
      value = String(k);
      unit = en ? 'km' : 'کیلومتر';
    }
    if (!en) value = toFaDigits(value).replace('.', '٫');
    return value + ' ' + unit;
  }

  /* افزودن فاصله به هر مکان (بدون دست‌زدن به داده‌ی اصلی) */
  function withDistance(list, origin) {
    return (list || []).map(function (p) {
      return { place: p, km: origin ? distanceKm(origin, p) : NaN };
    });
  }

  /* مرتب‌سازی: با موقعیت کاربر → نزدیک‌ترین؛ بدون آن → بر اساس نام */
  function sortPlaces(list, origin, lang) {
    var items = withDistance(list, origin);
    var collator = null;
    try { collator = new Intl.Collator(isEn(lang) ? 'en' : 'fa'); } catch (e) { collator = null; }
    items.sort(function (a, b) {
      if (origin && isNum(a.km) && isNum(b.km) && a.km !== b.km) return a.km - b.km;
      var an = placeName(a.place, lang), bn = placeName(b.place, lang);
      return collator ? collator.compare(an, bn) : (an < bn ? -1 : an > bn ? 1 : 0);
    });
    return items;
  }

  function boundsOf(list) {
    var b = null;
    (list || []).forEach(function (p) {
      if (!isNum(p.lat) || !isNum(p.lng)) return;
      if (!b) b = { south: p.lat, north: p.lat, west: p.lng, east: p.lng };
      b.south = Math.min(b.south, p.lat); b.north = Math.max(b.north, p.lat);
      b.west = Math.min(b.west, p.lng); b.east = Math.max(b.east, p.lng);
    });
    return b;
  }

  /* آیا نقطه نزدیک ورامین است؟ (برای پیام «شما از ورامین دور هستید») */
  function nearCity(pos, maxKm) {
    var c = DATA.center || { lat: 35.33, lng: 51.643 };
    var d = distanceKm(pos, c);
    return isNum(d) && d <= (maxKm || 30);
  }

  /* ── اماکنِ افزوده/اصلاح‌شده توسط ادمین (api/places.php) ─────────────────── */
  /* سرور فقط «تفاوت» را می‌فرستد: custom (مکان‌های تازه)، overrides (اصلاح مکانِ پیش‌فرض) و
     hidden (پنهان‌شده‌ها). هر مقدار پیش از استفاده پاک‌سازی می‌شود؛ ورودیِ نامعتبر نادیده گرفته
     می‌شود و هرگز فهرست پیش‌فرض را خراب نمی‌کند. */
  var ID_RE = /^u[0-9a-f]{8,16}$/;       /* همان قالبی که سرور می‌سازد (u + هگز)؛ هرچیز دیگر رد می‌شود */
  function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  function cleanText(v, max) {
    if (typeof v !== 'string') return '';
    var s = v.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').replace(/^ | $/g, '');
    return s.length > max ? s.slice(0, max) : s;
  }

  /* مختصات باید نزدیک شهر باشد (همان حاشیه‌ی سمت سرور) */
  function inRange(lat, lng) {
    var b = DATA.bounds || { south: 35.305, west: 51.595, north: 35.398, east: 51.685 };
    var pad = 0.07;
    return lat >= b.south - pad && lat <= b.north + pad && lng >= b.west - pad && lng <= b.east + pad;
  }

  /* base: مکانِ پیش‌فرضِ اصلاح‌شونده (یا null برای مکان تازه) */
  function cleanRemotePlace(raw, id, base) {
    if (!raw || typeof raw !== 'object') return null;
    var cat = typeof raw.cat === 'string' ? raw.cat : '';
    if (!categoryById(cat)) return null;
    var fa = cleanText(raw.fa, 120);
    var lat = typeof raw.lat === 'number' ? raw.lat : NaN;
    var lng = typeof raw.lng === 'number' ? raw.lng : NaN;
    if (!fa || !isNum(lat) || !isNum(lng) || !inRange(lat, lng)) return null;
    var tel = typeof raw.tel === 'string' ? raw.tel.replace(/[\s\-().]/g, '') : '';
    if (tel && !/^\+?\d{3,15}$/.test(tel)) tel = '';
    var p = {
      id: id, cat: cat, fa: fa, en: cleanText(raw.en, 120), lat: lat, lng: lng,
      addr: cleanText(raw.addr, 160), addrEn: cleanText(raw.addrEn, 160), tel: tel,
      note: cleanText(raw.note, 240), noteEn: cleanText(raw.noteEn, 240),
      approx: raw.approx ? 1 : 0,
      src: base ? 'edited' : 'custom'
    };
    if (base && base.also && base.cat === cat) p.also = base.also;   /* دسته‌ی دوم فقط وقتی دسته عوض نشده */
    return p;
  }

  /* payload پاسخ api/places.php؛ خروجی: شمارش اثرها. ورودی نامعتبر → فهرست پیش‌فرض */
  function applyRemote(payload) {
    var info = { custom: 0, edited: 0, hidden: 0, v: '' };
    if (!payload || typeof payload !== 'object' || payload.success === false) {
      MERGED = null;
      REMOTE_INFO = info;
      return info;
    }
    var base = basePlaces();
    var known = {};
    base.forEach(function (p) { known[p.id] = true; });

    var hidden = {};
    (Array.isArray(payload.hidden) ? payload.hidden : []).forEach(function (id) {
      if (typeof id === 'string' && hasOwn(known, id)) hidden[id] = true;
    });
    var overrides = (payload.overrides && typeof payload.overrides === 'object' && !Array.isArray(payload.overrides))
      ? payload.overrides : {};

    var out = [];
    base.forEach(function (p) {
      if (hasOwn(hidden, p.id)) { info.hidden++; return; }
      var o = hasOwn(overrides, p.id) ? cleanRemotePlace(overrides[p.id], p.id, p) : null;
      if (o) { info.edited++; out.push(o); } else { out.push(p); }
    });

    var seen = {};
    (Array.isArray(payload.custom) ? payload.custom : []).forEach(function (raw) {
      var id = raw && typeof raw === 'object' && typeof raw.id === 'string' ? raw.id : '';
      if (!ID_RE.test(id) || hasOwn(known, id) || hasOwn(seen, id)) return;
      var c = cleanRemotePlace(raw, id, null);
      if (!c) return;
      seen[id] = true;
      out.push(c);
      info.custom++;
    });

    info.v = typeof payload.v === 'string' ? payload.v.slice(0, 40) : '';
    MERGED = (info.custom || info.edited || info.hidden) ? out : null;
    REMOTE_INFO = info;
    return info;
  }

  function resetRemote() {
    MERGED = null;
    REMOTE_INFO = { custom: 0, edited: 0, hidden: 0, v: '' };
  }

  /* ── لینک‌های «نشان» ──────────────────────────────────────────────────── */
  function fmt(v) { return Number(v).toFixed(6); }

  /* dest: {lat,lng}   origin: {lat,lng} یا null   vehicle: d | m (و در iOS: b p w) */
  function neshanLinks(dest, origin, vehicle) {
    if (!dest || !isNum(dest.lat) || !isNum(dest.lng)) return null;
    var v = String(vehicle || 'd');
    var webVehicle = v === 'm' ? 'm' : 'd';   /* مستندات نشان برای اندروید/وب فقط d و m */
    var iosVehicle = /^[dbpmw]$/.test(v) ? v : 'd';
    var d = fmt(dest.lat) + ',' + fmt(dest.lng);
    var hasOrigin = !!origin && isNum(origin.lat) && isNum(origin.lng);
    var o = hasOrigin ? (fmt(origin.lat) + ',' + fmt(origin.lng)) : '';

    var point = NESHAN_ORIGIN + '/?lat=' + fmt(dest.lat) + '&lng=' + fmt(dest.lng);
    var web, ios;
    if (hasOrigin) {
      web = NESHAN_ORIGIN + '/?origin=' + o + '&destination=' + d + '&vehicle=' + webVehicle;
      ios = NESHAN_SCHEME + '?origin=' + o + '&destination=' + d + '&vehicle=' + iosVehicle;
    } else {
      web = point;
      ios = NESHAN_SCHEME + '?ll=' + d;
    }
    /* مرورگر کروم در اندروید: اگر نشان نصب باشد باز می‌شود، وگرنه همان نسخه‌ی وب */
    var androidIntent = 'intent://nshn.ir' + web.slice(NESHAN_ORIGIN.length)
      + '#Intent;scheme=https;package=' + NESHAN_PACKAGE
      + ';S.browser_fallback_url=' + encodeURIComponent(web) + ';end';

    return {
      mode: hasOrigin ? 'route' : 'point',
      vehicle: webVehicle,
      web: web,
      point: point,
      ios: ios,
      androidIntent: androidIntent,
      installUrl: NESHAN_INSTALL_URL
    };
  }

  /* ── آیکون دسته‌ها (SVG یکدست؛ رنگ از currentColor) ─────────────────────── */
  var GLYPHS = {
    health: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="currentColor" fill-opacity=".18"/><path d="M12 7.5v9M7.5 12h9"/>',
    mosque: '<path d="M3 21h18M5 21v-6.5C5 10.9 8 8 12 8s7 2.900 7 6.500V21" fill="currentColor" fill-opacity=".18"/><path d="M12 8V4.200M9.500 21v-3.200a2.500 2.500 0 0 1 5 0V21"/><circle cx="12" cy="3.300" r=".9" fill="currentColor"/>',
    culture: '<path d="M3 9.500 12 4l9 5.500H3z" fill="currentColor" fill-opacity=".18"/><path d="M5.500 12v6M10 12v6M14 12v6M18.500 12v6M3.500 21h17"/>',
    office: '<path d="M5 21V4.500a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V21" fill="currentColor" fill-opacity=".18"/><path d="M15 9.500h3.500a.5.5 0 0 1 .5.5v11M3 21h18M8.500 8h3M8.500 12h3M8.500 16h3"/>',
    safety: '<path d="M12 3 4.500 6v5.600c0 4.500 3.100 7.700 7.500 9.400 4.400-1.700 7.500-4.900 7.500-9.400V6z" fill="currentColor" fill-opacity=".18"/><path d="M12 8.200v4.200M12 15.600h.01"/>',
    edu: '<path d="M2.500 9 12 4.500 21.500 9 12 13.500z" fill="currentColor" fill-opacity=".18"/><path d="M6.500 11.200v4.300c0 1.400 2.500 2.800 5.500 2.800s5.500-1.400 5.500-2.800v-4.300M21.500 9v5.500"/>',
    park: '<path d="M12 3.500a5.500 5.500 0 0 1 4.300 8.900A4.400 4.400 0 0 1 12 16a4.400 4.400 0 0 1-4.300-3.600A5.500 5.500 0 0 1 12 3.500z" fill="currentColor" fill-opacity=".18"/><path d="M12 16v5M9 21h6"/>',
    transport: '<rect x="4.500" y="3.500" width="15" height="14" rx="3" fill="currentColor" fill-opacity=".18"/><path d="M4.500 11h15M8 17.500V20M16 17.500V20M8.500 14.200h.01M15.500 14.200h.01"/>',
    area: '<path d="M4 20v-9.500l4-3 4 3V20M12 20v-6.500l4-3 4 3V20M2.500 20.500h19" fill="none"/><path d="M4 20v-9.500l4-3 4 3V20z" fill="currentColor" fill-opacity=".18"/>'
  };

  function glyphSvg(catId) {
    var body = GLYPHS[catId] || GLYPHS.area;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  return {
    VERSION: DATA.version || '0',
    NESHAN_PACKAGE: NESHAN_PACKAGE,
    NESHAN_INSTALL_URL: NESHAN_INSTALL_URL,
    data: function () { return DATA; },
    categories: categories,
    places: places,
    basePlaces: basePlaces,
    applyRemote: applyRemote,
    resetRemote: resetRemote,
    remoteInfo: function () { return REMOTE_INFO; },
    categoryById: categoryById,
    placeById: placeById,
    placeName: placeName,
    placeAddr: placeAddr,
    placeNote: placeNote,
    catName: catName,
    inCategory: inCategory,
    countByCategory: countByCategory,
    groupByCategory: groupByCategory,
    normalize: normalize,
    search: search,
    distanceKm: distanceKm,
    formatDistance: formatDistance,
    withDistance: withDistance,
    sortPlaces: sortPlaces,
    boundsOf: boundsOf,
    nearCity: nearCity,
    toFaDigits: toFaDigits,
    neshanLinks: neshanLinks,
    glyphSvg: glyphSvg
  };
});
