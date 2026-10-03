/* places.test.mjs — «نقشه و اماکن شهری» + مسیریابی با «نشان» (Neshan)
   ------------------------------------------------------------------
   این آزمون‌ها واقعاً اجرا می‌شوند (jsdom؛ بدون متن‌کاوی صرف):
     ۱) داده‌ی اماکن ورامین: یکتایی، دسته‌ها، مختصات داخل شهر، نقاط مرجع شناخته‌شده
     ۲) منطق: جستجو (فارسی/عربی/انگلیسی)، فاصله، مرتب‌سازی، لینک‌های نشان
        (قالب عیناً مطابق «سوالات متداول پلتفرم نشان»)
     ۳) موتور نقشه: نشانگرها، خوشه‌ها، انتخاب، «موقعیت من»، زوم دو انگشتی/Ctrl+چرخ
     ۴) صفحه‌ی «نقشه و اماکن شهری»: چیپ‌ها، فهرست، جستجو، کارت مکان، GPS و مسیریابی
        در اپ اندروید (پل AndroidApp.openNeshan)، مرورگر اندروید، iOS و دسکتاپ
     ۵) اندروید، مانیفست، اسکریپت‌ها، مستندات و اسکریپت ساخت بسته
*/
import fs from 'fs'; import path from 'path';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const section = (t) => console.log('\n=== ' + t + ' ===');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

/* ───────────────────────── محیط jsdom با صفحه‌ی واقعی index.html ───────────────────────── */
const INDEX = read('index.html');
const MAP_SCREEN = (/<!-- ============ SCREEN: CITY MAP ============ -->([\s\S]*?)<!-- ============ SCREEN: NOTIFICATIONS ============ -->/.exec(INDEX) || [])[1] || '';

function makeEnv(o = {}) {
  const lang = o.lang || 'fa';
  const vc = new VirtualConsole(); /* خطاهای «not implemented» jsdom را ساکت نگه می‌دارد */
  const dom = new JSDOM('<!DOCTYPE html><html lang="' + lang + '" dir="' + (lang === 'en' ? 'ltr' : 'rtl') + '"><body>'
    + MAP_SCREEN.replace('class="screen" id="screen-map"', 'class="screen active" id="screen-map"') + '</body></html>',
    { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  const env = { w, dom, toasts: [], opens: [], navs: [], popup: { href: null } };

  /* اندازه‌ی صفحه (jsdom چیدمان ندارد) */
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 360, height: 320, left: 0, top: 0, right: 360, bottom: 320, x: 0, y: 0 };
  };
  Object.defineProperty(w.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 150; } });
  w.showToast = (m) => env.toasts.push(String(m));
  w.open = (u, t) => {
    env.opens.push({ u, t });
    const popup = env.popup;
    popup.href = null;
    return { opener: 1, location: { set href(v) { popup.href = v; } } };
  };
  if (lang === 'en') w.i18n = { getLanguage: () => 'en' };
  if (o.userAgent) Object.defineProperty(w.navigator, 'userAgent', { configurable: true, get: () => o.userAgent });

  /* موقعیت: پاسخ ساختگی GPS مرورگر */
  env.geoCalls = [];
  env.setGeo = (behavior) => {
    Object.defineProperty(w.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(okCb, errCb, opts) {
          env.geoCalls.push(opts || {});
          const b = typeof behavior === 'function' ? behavior(env.geoCalls.length) : behavior;
          setTimeout(() => {
            if (b && b.error) errCb(b.error);
            else okCb({ coords: { latitude: b.lat, longitude: b.lng, accuracy: b.acc || 20 } });
          }, 0);
        }
      }
    });
  };
  if (o.geo !== undefined) env.setGeo(o.geo);

  for (const f of ['assets/js/ep-map.js', 'core/places-data.js', 'core/places.js', 'modules/city-map.js']) {
    w.eval(read(f));
  }
  env.hooks = w.EplakCityMap._test.hooks;
  env.hooks.navigate = (u) => env.navs.push(u);
  env.$ = (sel) => w.document.querySelector(sel);
  env.$$ = (sel) => Array.from(w.document.querySelectorAll(sel));
  env.click = (node) => node.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  env.close = () => { try { w.close(); } catch (e) { /* مهم نیست */ } };
  return env;
}

const NESHAN_PKG = 'org.rajman.neshan.traffic.tehran.navigator';
const P = (env, id) => env.w.EplakPlaces.placeById(id);

/* ══════════════════════ ۱) داده‌ی اماکن ══════════════════════ */
section('داده‌ی اماکن مهم ورامین (core/places-data.js)');
const data = (await import('file://' + path.join(ROOT, 'core/places-data.js'))).default;
const places = data.places, cats = data.categories;

ok('نه دسته‌ی اصلی تعریف شده است', cats.length === 9, String(cats.length));
ok('چهار دسته‌ی خواسته‌شده هست: درمانی، مساجد، فرهنگی، ادارات',
  ['health', 'mosque', 'culture', 'office'].every((id) => cats.some((c) => c.id === id)));
ok('هر دسته نام فارسی و انگلیسی، رنگ و رنگ آیکون دارد',
  cats.every((c) => c.fa && c.en && /^#[0-9a-f]{6}$/i.test(c.color) && /^#[0-9a-f]{6}$/i.test(c.ink)));
ok('شناسه‌ی مکان‌ها یکتاست', new Set(places.map((p) => p.id)).size === places.length);
ok('همه‌ی مکان‌ها دسته‌ی معتبر دارند', places.every((p) => cats.some((c) => c.id === p.cat)));
ok('دسته‌ی دوم (also) فقط به دسته‌ی معتبر اشاره می‌کند', places.every((p) => !p.also || cats.some((c) => c.id === p.also)));
ok('نام فارسی و انگلیسی هر مکان پر است و فاصله‌ی اضافه ندارد',
  places.every((p) => p.fa && p.en && p.fa === p.fa.trim() && p.en === p.en.trim() && !/\s{2,}/.test(p.fa + p.en)));
ok('حروف عربی «ي» و «ك» در نام‌های فارسی نیست (جستجو یکدست بماند)',
  places.every((p) => !/[\u064A\u0643]/.test(p.fa + (p.addr || '') + (p.note || ''))));
ok('مختصات همه‌ی مکان‌ها عدد معتبر و داخل محدوده‌ی شهر ورامین است',
  places.every((p) => typeof p.lat === 'number' && typeof p.lng === 'number'
    && p.lat >= data.bounds.south && p.lat <= data.bounds.north && p.lng >= data.bounds.west && p.lng <= data.bounds.east));
ok('دقت مختصات حداکثر ۵ رقم اعشار است', places.every((p) => String(p.lat).split('.')[1].length <= 5 && String(p.lng).split('.')[1].length <= 5));

const count = (id) => places.filter((p) => p.cat === id).length;
ok('درمانی: دست‌کم ۸ مکان و دو بیمارستان', count('health') >= 8 && places.filter((p) => p.cat === 'health' && /بیمارستان/.test(p.fa)).length >= 2, String(count('health')));
ok('مساجد و اماکن مذهبی: دست‌کم ۲۰ مکان', count('mosque') >= 20, String(count('mosque')));
ok('فرهنگی و تاریخی: دست‌کم ۴ مکان (+ مسجد جامع و امامزاده‌ی یحیی با دسته‌ی دوم)', count('culture') + places.filter((p) => p.also === 'culture').length >= 6);
ok('ادارات: دست‌کم ۱۵ مکان و شهرداری، فرمانداری و دادگستری در آن‌هاست',
  count('office') >= 15 && ['شهرداری', 'فرمانداری', 'دادگستری'].every((k) => places.some((p) => p.cat === 'office' && p.fa.includes(k))));
ok('انتظامی و امدادی، آموزشی، پارک و ورزش، حمل‌ونقل و محله‌ها هم پر هستند',
  count('safety') >= 10 && count('edu') >= 4 && count('park') >= 15 && count('transport') >= 3 && count('area') >= 25);

/* نقاط مرجع شناخته‌شده (ویکی‌پدیا) — اگر مختصات اشتباهی وارد شود این‌جا گیر می‌کند */
const hav = (a, b) => {
  const R = 6371008.8, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const byId = (id) => places.find((p) => p.id === id);
ok('مسجد جامع ورامین کمتر از ۲۰۰ متر از مختصات مرجع (۳۵°۱۹′۲۰″ شمالی، ۵۱°۳۸′۲۹″ شرقی) است', hav(byId('jame-mosque'), { lat: 35.32222, lng: 51.64139 }) < 200);
ok('برج علاءالدوله کمتر از ۲۰۰ متر از مختصات مرجع (۳۵°۱۹′۳۰″، ۵۱°۳۸′۴۴″) است', hav(byId('alaeddin-tower'), { lat: 35.325, lng: 51.64556 }) < 200);
ok('امامزاده یحیی کمتر از ۲۰۰ متر از مختصات مرجع (۳۵°۱۸′۵۸″، ۵۱°۳۸′۵۴″) است', hav(byId('imamzadeh-yahya'), { lat: 35.31611, lng: 51.64833 }) < 200);
ok('شهرداری و فرمانداری روبه‌روی هم‌اند (کمتر از ۳۰۰ متر)', hav(byId('municipality'), byId('governorate')) < 300);
ok('مکان‌های هم‌دسته با نام یکسان (که با هم اشتباه شوند) وجود ندارد',
  new Set(places.map((p) => p.cat + '|' + p.fa)).size === places.length);
ok('دو مکان هم‌نام در یک نقطه (تکراری) نداریم',
  places.every((p, i) => places.every((q, j) => j <= i || p.fa !== q.fa || hav(p, q) > 30)));
ok('شماره‌های تماس فقط رقم‌اند (۱۱۰، ۱۲۳، ۱۲۵، ۱۳۷ یا شماره‌ی شهری)', places.filter((p) => p.tel).every((p) => /^\d{3}$|^0\d{10}$/.test(p.tel)));
ok('مکانی که موقعیتش برآورد شده (approx) علامت‌گذاری شده است: فرمانداری', byId('governorate').approx === 1);
ok('شماره‌ی بیمارستان مفتح و نشانی‌اش از منبع تأییدشده است', byId('mofatteh-hospital').tel === '02136223011' && /میدان رازی/.test(byId('mofatteh-hospital').addr));

/* ══════════════════════ ۲) منطق ══════════════════════ */
section('منطق: جستجو، فاصله و مرتب‌سازی (core/places.js)');
const env0 = makeEnv();
const L = env0.w.EplakPlaces;
ok('EplakPlaces روی window ساخته می‌شود', !!L && typeof L.neshanLinks === 'function' && L.places().length === places.length);

ok('normalize: «ي/ك» عربی، نیم‌فاصله و ارقام فارسی یکدست می‌شوند',
  L.normalize('مسجد جامع ورامین') === L.normalize('مسجد جامع وراميـن') && L.normalize('۱۵ خرداد') === '15 خرداد'
  && L.normalize('كهنه‌گل') === L.normalize('کهنهگل'));
const names = (list) => list.map((p) => p.id);
ok('جستجوی «مسجد جامع» مسجد جامع ورامین را اول می‌آورد', names(L.search(null, 'مسجد جامع'))[0] === 'jame-mosque');
ok('جستجوی «بیمارستان» همه‌ی بیمارستان‌ها را پیدا می‌کند', ['mofatteh-hospital', '15khordad-hospital'].every((id) => names(L.search(null, 'بیمارستان')).includes(id)));
ok('«کهنه گل» (با فاصله) و «کهنه‌گل» و «کهنهگل» هر سه همان محله را پیدا می‌کنند',
  ['کهنه گل', 'کهنه‌گل', 'کهنهگل'].every((q) => names(L.search(null, q)).includes('kohnehgol')));
ok('جستجوی «۱۵ خرداد» هم بیمارستان و هم پارک را می‌آورد', ['15khordad-hospital', 'park-15khordad'].every((id) => names(L.search(null, '۱۵ خرداد')).includes(id)));
ok('جستجوی انگلیسی «hospital» و «Alaeddin» کار می‌کند', names(L.search(null, 'hospital')).includes('mofatteh-hospital') && names(L.search(null, 'alaeddin'))[0] === 'alaeddin-tower');
ok('جستجوی نام دسته («درمانی») همه‌ی مکان‌های آن دسته را می‌دهد', L.search(null, 'درمانی').filter((p) => p.cat === 'health').length === count('health'));
ok('جستجوی نشانی («بلوار امام رضا») مکان را پیدا می‌کند', names(L.search(null, 'بلوار امام رضا')).includes('mofatteh-hospital'));
ok('جستجوی خالی همه را برمی‌گرداند و جستجوی بی‌معنی هیچ', L.search(null, '').length === places.length && L.search(null, 'zzzzqqq').length === 0);

ok('inCategory: دسته‌ی دوم (also) هم فیلتر می‌شود', L.inCategory(byId('jame-mosque'), 'culture') && L.inCategory(byId('jame-mosque'), 'mosque') && !L.inCategory(byId('jame-mosque'), 'health'));
const cnt = L.countByCategory();
ok('countByCategory: مجموع کل درست و دسته‌ی دوم هم شمرده می‌شود', cnt.all === places.length && cnt.culture === count('culture') + places.filter((p) => p.also === 'culture').length);
const groups = L.groupByCategory(places);
ok('groupByCategory: هر مکان فقط یک‌بار (زیر دسته‌ی اصلی‌اش) می‌آید', groups.reduce((n, g) => n + g.items.length, 0) === places.length);

const A = { lat: 35.32213, lng: 51.64164 }, B = { lat: 35.32503, lng: 51.64559 };
ok('distanceKm: مسجد جامع تا برج علاءالدوله ≈ ۰٫۵ کیلومتر', approx(L.distanceKm(A, B), hav(A, B) / 1000, 0.001) && approx(L.distanceKm(A, B), 0.5, 0.1));
ok('distanceKm: ورودی نامعتبر → NaN', Number.isNaN(L.distanceKm(null, B)) && Number.isNaN(L.distanceKm({ lat: 'x', lng: 1 }, B)));
ok('formatDistance فارسی: متر و کیلومتر با رقم و ممیز فارسی',
  L.formatDistance(0.2, 'fa') === '۲۰۰ متر' && L.formatDistance(0.85, 'fa') === '۸۵۰ متر' && L.formatDistance(1.234, 'fa') === '۱٫۲ کیلومتر'
  && L.formatDistance(12.6, 'fa') === '۱۳ کیلومتر' && L.formatDistance(0.999, 'fa') === '۱ کیلومتر');
ok('formatDistance انگلیسی', L.formatDistance(0.85, 'en') === '850 m' && L.formatDistance(1.234, 'en') === '1.2 km' && L.formatDistance(NaN, 'en') === '');
const sorted = L.sortPlaces(L.places().filter((p) => p.cat === 'health'), A, 'fa');
ok('sortPlaces با موقعیت کاربر: نزدیک‌ترین اول', sorted.every((it, i) => i === 0 || it.km >= sorted[i - 1].km));
const byName = L.sortPlaces(L.places().filter((p) => p.cat === 'health'), null, 'fa');
ok('sortPlaces بدون موقعیت: بر اساس نام، km نامعتبر', byName.every((it) => Number.isNaN(it.km)) && byName.length === count('health'));
ok('boundsOf و nearCity: مرکز شهر نزدیک، تهران دور', (() => { const b = L.boundsOf(places); return b.south <= b.north && b.west <= b.east; })()
  && L.nearCity({ lat: 35.33, lng: 51.64 }, 25) && !L.nearCity({ lat: 35.70, lng: 51.40 }, 25));

section('لینک‌های نشان (قالب مطابق مستندات رسمی platform.neshan.org/faq)');
const dest = { lat: 35.322128, lng: 51.641637 }, org = { lat: 35.3335, lng: 51.6402 };
const lk = L.neshanLinks(dest, org, 'd');
ok('مسیریابی (اندروید/وب): https://nshn.ir/?origin=lat,lng&destination=lat,lng&vehicle=d',
  lk.web === 'https://nshn.ir/?origin=35.333500,51.640200&destination=35.322128,51.641637&vehicle=d', lk.web);
ok('مسیریابی (iOS): neshan://?origin=…&destination=…&vehicle=d',
  lk.ios === 'neshan://?origin=35.333500,51.640200&destination=35.322128,51.641637&vehicle=d', lk.ios);
ok('حالت مسیر (route) و وسیله‌ی پیش‌فرض خودرو', lk.mode === 'route' && lk.vehicle === 'd');
{
  const u = new URL(lk.web);
  const [oLat, oLng] = u.searchParams.get('origin').split(',').map(Number);
  const [dLat, dLng] = u.searchParams.get('destination').split(',').map(Number);
  ok('پارامترهای origin و destination قابل خواندن و برابر مختصات‌اند',
    u.host === 'nshn.ir' && approx(oLat, org.lat, 1e-6) && approx(oLng, org.lng, 1e-6) && approx(dLat, dest.lat, 1e-6) && approx(dLng, dest.lng, 1e-6));
}
ok('موتور (m) در اندروید/وب و iOS', L.neshanLinks(dest, org, 'm').web.endsWith('&vehicle=m') && L.neshanLinks(dest, org, 'm').ios.endsWith('&vehicle=m'));
ok('در اندروید/وب فقط d و m مجاز است (مستندات)؛ w ← d، ولی iOS همان w را نگه می‌دارد',
  L.neshanLinks(dest, org, 'w').web.endsWith('&vehicle=d') && L.neshanLinks(dest, org, 'w').ios.endsWith('&vehicle=w') && L.neshanLinks(dest, org, 'zz').web.endsWith('&vehicle=d'));
const lp = L.neshanLinks(dest, null, 'd');
ok('بدون GPS: نمایش مقصد — https://nshn.ir/?lat=…&lng=… و neshan://?ll=…',
  lp.mode === 'point' && lp.web === 'https://nshn.ir/?lat=35.322128&lng=51.641637' && lp.ios === 'neshan://?ll=35.322128,51.641637', lp.web);
ok('مبدأ ناقص یا نامعتبر هم به «نمایش مقصد» برمی‌گردد', L.neshanLinks(dest, { lat: NaN, lng: 1 }, 'd').mode === 'point' && L.neshanLinks(dest, { lat: 1 }, 'd').mode === 'point');
ok('لینک intent مرورگر اندروید: بسته‌ی نشان و آدرس جایگزین وب',
  lk.androidIntent.startsWith('intent://nshn.ir/?origin=') && lk.androidIntent.includes('package=' + NESHAN_PKG)
  && lk.androidIntent.includes('S.browser_fallback_url=' + encodeURIComponent(lk.web)) && lk.androidIntent.endsWith(';end'));
ok('مقصد نامعتبر → null', L.neshanLinks(null, org) === null && L.neshanLinks({ lat: 'a', lng: 2 }, org) === null);
ok('لینک نصب نشان از کافه‌بازار و نام بسته درست است', L.NESHAN_PACKAGE === NESHAN_PKG && L.NESHAN_INSTALL_URL === 'https://cafebazaar.ir/app/' + NESHAN_PKG);
env0.close();

/* ══════════════════════ ۳) موتور نقشه ══════════════════════ */
section('موتور نقشه: نشانگر، خوشه، انتخاب، موقعیت من و زوم (assets/js/ep-map.js)');
{
  const env = makeEnv();
  const w = env.w, doc = w.document;
  const box = doc.createElement('div'); doc.body.appendChild(box);
  const clicked = [], mapClicks = [];
  const map = w.EplakMap.create(box, {
    picker: false, lat: 35.33, lng: 51.64, zoom: 12, minZoom: 10, maxZoom: 19,
    onMarkerClick: (id) => clicked.push(id), onMapClick: (lat, lng) => mapClicks.push([lat, lng])
  });
  ok('نقشه‌ی نمایشی: نه نشانگر وسط و نه «هدف» دیده می‌شود',
    box.querySelector('.ep-map-pin').style.display === 'none' && box.querySelector('.ep-map-crosshair').style.display === 'none' && box.classList.contains('ep-map-viewer'));
  const items = [
    { id: 'a', lat: 35.3300, lng: 51.6400, color: '#ef4444', glyph: '<svg></svg>', label: 'A' },
    { id: 'b', lat: 35.3301, lng: 51.6401, color: '#ef4444', glyph: '<svg></svg>', label: 'B' },
    { id: 'c', lat: 35.3600, lng: 51.6100, color: '#10b981', glyph: '<svg></svg>', label: 'C' }
  ];
  map.setMarkers(items);
  const visibleMarkers = () => Array.from(box.querySelectorAll('.ep-mk')).filter((n) => n.style.display !== 'none');
  const clusters = () => Array.from(box.querySelectorAll('.ep-cl'));
  ok('در زوم ۱۲، دو نشانگر نزدیک یک «خوشه‌ی ۲تایی» می‌شوند و نشانگر دور جدا می‌ماند',
    clusters().length === 1 && clusters()[0].textContent === '2' && visibleMarkers().length === 1 && visibleMarkers()[0].dataset.id === 'c');
  ok('خوشه‌ی هم‌رنگ، رنگ دسته را می‌گیرد', clusters()[0].style.getPropertyValue('--c') === '#ef4444');
  map.setZoom(17);
  ok('از زوم ۱۷ به بعد همه‌ی نشانگرها جدا دیده می‌شوند', clusters().length === 0 && box.querySelectorAll('.ep-mk').length === 3);
  map.setZoom(12);
  const before = map.getPosition().zoom;
  env.click(clusters()[0]);
  ok('لمس خوشه، همان‌جا زوم می‌کند', map.getPosition().zoom > before);
  map.setZoom(13);
  map.setMarkers(items);
  map.panTo(35.3600, 51.6100, 15);
  const nodeC = Array.from(box.querySelectorAll('.ep-mk')).find((n) => n.dataset.id === 'c');
  env.click(nodeC);
  ok('لمس نشانگر، onMarkerClick را با شناسه صدا می‌زند', clicked.length === 1 && clicked[0] === 'c');
  map.setSelected('c');
  ok('setSelected نشانگر را برجسته می‌کند و getSelected برمی‌گرداند', nodeC.classList.contains('sel') && map.getSelected() === 'c');
  map.setSelected(null);
  ok('لغو انتخاب، برجستگی را برمی‌دارد', !nodeC.classList.contains('sel') && map.getSelected() === null);

  map.setUserLocation(35.3300, 51.6400, 60);
  ok('«موقعیت من»: نقطه‌ی آبی با دایره‌ی دقت ساخته می‌شود', !!box.querySelector('.ep-me .ep-me-dot') && !!box.querySelector('.ep-me .ep-me-acc'));
  map.clearUserLocation();
  ok('پاک کردن موقعیت من، نقطه را پنهان می‌کند', box.querySelector('.ep-me').style.display === 'none');

  map.fitBounds({ south: 35.31, north: 35.39, west: 51.60, east: 51.68 }, { padding: 30, maxZoom: 16 });
  const gb = map.getBounds();
  ok('fitBounds: کل محدوده در نما جا می‌شود', gb.south <= 35.31 && gb.north >= 35.39 && gb.west <= 51.60 && gb.east >= 51.68, JSON.stringify(gb));
  ok('fitBounds: زوم ۱۲ برای کل شهر (نه خیلی دور، نه بریده)', map.getPosition().zoom === 12 || map.getPosition().zoom === 11, String(map.getPosition().zoom));
  map.fitBounds({ south: 35.3, north: 35.3, west: 51.6, east: 51.6 }, { maxZoom: 16 });
  ok('fitBounds یک نقطه، تا بیشینه‌ی زوم درخواستی نزدیک می‌شود', map.getPosition().zoom === 16);

  /* zoomAt: نقطه‌ی زیر انگشت ثابت می‌ماند */
  map.panTo(35.33, 51.64, 14);
  const f0 = map.pxToLatLng(250, 90);
  map.zoomAt(15, 250, 90);
  const f1 = map.pxToLatLng(250, 90);
  ok('zoomAt: نقطه‌ی زیر انگشت پس از زوم همان‌جا می‌ماند', map.getPosition().zoom === 15 && approx(f0.lat, f1.lat, 1e-6) && approx(f0.lng, f1.lng, 1e-6));
  ok('حد زوم (minZoom/maxZoom) رعایت می‌شود', (() => { map.zoomAt(30, 10, 10); const hi = map.getPosition().zoom; map.zoomAt(1, 10, 10); return hi === 19 && map.getPosition().zoom === 10; })());

  /* زوم دو انگشتی و Ctrl+چرخ */
  map.panTo(35.33, 51.64, 14);
  const touch = (type, pts) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.touches = pts.map(([x, y]) => ({ clientX: x, clientY: y })); box.dispatchEvent(e); };
  touch('touchstart', [[100, 100], [160, 100]]);
  touch('touchmove', [[70, 100], [190, 100]]);
  ok('زوم دو انگشتی (فاصله‌ی انگشتان ۲ برابر) یک پله بزرگ‌نمایی می‌کند', map.getPosition().zoom === 15, String(map.getPosition().zoom));
  touch('touchend', []);
  const wheel = (o) => { const e = new w.WheelEvent('wheel', Object.assign({ deltaY: -100, clientX: 180, clientY: 160, bubbles: true, cancelable: true }, o)); box.dispatchEvent(e); return e; };
  const z0 = map.getPosition().zoom;
  const plain = wheel({});
  ok('چرخ موس بدون Ctrl، اسکرول صفحه را نمی‌دزدد (زوم نمی‌شود و preventDefault ندارد)', map.getPosition().zoom === z0 && plain.defaultPrevented === false);
  wheel({ ctrlKey: true });
  ok('Ctrl+چرخ موس (و حرکت بزرگ‌نمایی لمس‌پد) نقشه را زوم می‌کند', map.getPosition().zoom === z0 + 1);

  /* حالت «انتخاب موقعیت» گزارش، دست‌نخورده می‌ماند */
  const pickerBox = doc.createElement('div'); doc.body.appendChild(pickerBox);
  const picker = w.EplakMap.create(pickerBox, { lat: 35.33, lng: 51.64, zoom: 16, hasFix: true });
  ok('نقشه‌ی «انتخاب موقعیت» همچنان نشانگر وسط دارد و نقشه‌ی نمایشی نیست',
    pickerBox.querySelector('.ep-map-pin').style.display === '' && !pickerBox.classList.contains('ep-map-viewer') && typeof picker.setMarkers === 'function');
  env.close();
}

/* ══════════════════════ ۴) صفحه‌ی نقشه و اماکن شهری ══════════════════════ */
section('صفحه‌ی «نقشه و اماکن شهری»: چیپ‌ها، فهرست، جستجو، کارت مکان');
{
  ok('صفحه، ظرف نقشه، جستجو، چیپ‌ها، فهرست و کارت مکان را دارد',
    ['cityMapCanvas', 'cityMapSearch', 'cityMapChips', 'mapPlacesWrap', 'cityMapSheet', 'cityMapLocateBtn', 'cityMapFitBtn'].every((id) => MAP_SCREEN.includes('id="' + id + '"')));
  ok('نقشه‌ی تزئینی قدیمی (تصویر ثابت با سه سنجاق) برداشته شده', !/height:170px/.test(MAP_SCREEN) && !/map_nearby_title/.test(MAP_SCREEN));

  const env = makeEnv();
  const w = env.w;
  w.renderMapPlaces();
  const S = w.EplakCityMap.state;
  ok('نقشه‌ی واقعی ساخته می‌شود و نشانگر همه‌ی اماکن روی آن است', !!S.map && env.$$('#cityMapCanvas .ep-mk, #cityMapCanvas .ep-cl').length > 0);
  const chips = env.$$('#cityMapChips .cm-chip');
  ok('ده چیپ: «همه» + نُه دسته، با شمار به رقم فارسی', chips.length === 10 && /۱۳۴/.test(chips[0].textContent) && /۲۸/.test(env.$('[data-cat="mosque"]').textContent), chips.map((c) => c.textContent).join('|'));
  const headers = env.$$('#mapPlacesWrap .cm-group-h');
  ok('«همه»: فهرست دسته‌به‌دسته با سرتیتر هر دسته است', headers.length === 9);
  ok('در «همه» هر دسته حداکثر ۴ مورد دارد و دکمه‌ی «نمایش همه» برای دسته‌های بزرگ‌تر', env.$$('#mapPlacesWrap .cm-row').length === groups.reduce((n, g) => n + Math.min(4, g.items.length), 0)
    && env.$$('#mapPlacesWrap .cm-more').length === groups.filter((g) => g.items.length > 4).length);
  ok('هر ردیف دکمه‌ی «مسیریابی با نشان» دارد', env.$$('#mapPlacesWrap .cm-row').every((r) => r.querySelector('.cm-go[data-go]')));
  ok('بدون GPS، فاصله نشان داده نمی‌شود و پیوند «نمایش فاصله‌ها» هست', env.$$('.cm-dist').length === 0 && !!env.$('#cityMapMeta [data-locate]'));

  env.click(env.$('[data-cat="health"]'));
  ok('چیپ «درمانی»: فقط ۹ مکان درمانی، تخت و بدون سرتیتر', env.$$('#mapPlacesWrap .cm-row').length === 9 && env.$$('#mapPlacesWrap .cm-group-h').length === 0 && /۹/.test(env.$('#cityMapMeta .cm-count').textContent));
  ok('نشانگرهای نقشه هم فقط درمانی‌ها هستند', (() => { const n = env.$$('#cityMapCanvas .ep-mk').length + env.$$('#cityMapCanvas .ep-cl').reduce((s, c) => s + Number(c.textContent), 0); return n === 9; })());
  ok('چیپ فعال تغییر می‌کند (aria-selected)', env.$('[data-cat="health"]').getAttribute('aria-selected') === 'true' && env.$('[data-cat="all"]').getAttribute('aria-selected') === 'false');

  env.click(env.$('[data-cat="culture"]'));
  ok('چیپ «فرهنگی و تاریخی» مسجد جامع (دسته‌ی دوم) را هم دارد', env.$$('#mapPlacesWrap .cm-row').some((r) => r.dataset.id === 'jame-mosque') && env.$$('#mapPlacesWrap .cm-row').length === 10);

  env.click(env.$('[data-cat="all"]'));
  env.click(env.$$('#mapPlacesWrap .cm-more')[0]);
  ok('«نمایش همه‌ی N مورد» همان دسته را باز می‌کند', S.cat === 'health' || S.cat === 'mosque');

  const input = env.$('#cityMapSearch');
  const type = (text) => { input.value = text; input.dispatchEvent(new w.Event('input', { bubbles: true })); };
  env.click(env.$('[data-cat="all"]'));
  type('مفتح');
  ok('جستجوی «مفتح»: فقط بیمارستان مفتح؛ شمار چیپ‌ها هم تازه می‌شود', env.$$('#mapPlacesWrap .cm-row').length === 1 && env.$('#mapPlacesWrap .cm-row').dataset.id === 'mofatteh-hospital'
    && /۱/.test(env.$('[data-cat="health"] .cm-n').textContent) && env.$('[data-cat="mosque"]').classList.contains('zero'));
  ok('دکمه‌ی پاک‌کردن جستجو ظاهر می‌شود', env.$('#cityMapClear').hidden === false);
  env.click(env.$('#cityMapClear'));
  ok('پاک کردن جستجو همه را برمی‌گرداند', input.value === '' && env.$$('#mapPlacesWrap .cm-row').length > 20 && env.$('#cityMapClear').hidden === true);
  type('چنین مکانی نیست');
  ok('جستجوی بی‌نتیجه پیام «مکانی پیدا نشد» می‌دهد', !!env.$('#mapPlacesWrap .cm-empty'));
  type('');

  /* کارت مکان */
  env.click(env.$('#mapPlacesWrap .cm-row[data-id="mofatteh-hospital"], #mapPlacesWrap .cm-row'));
  const firstId = S.selected;
  ok('لمس ردیف: مکان انتخاب و کارت پایین نقشه باز می‌شود', !!firstId && env.$('#cityMapSheet').hidden === false && env.$('#cityMapSheet .cm-route-btn').dataset.go === firstId);
  ok('نشانگر انتخاب‌شده روی نقشه برجسته است', S.map.getSelected() === firstId);
  env.click(env.$('#cityMapSheet [data-close]'));
  ok('بستن کارت با ✕', env.$('#cityMapSheet').hidden === true && S.selected === null);
  w.EplakCityMap.select('mofatteh-hospital', { scroll: false });
  const sheet = env.$('#cityMapSheet');
  ok('کارت مکان: نام، دسته، نشانی، دکمه‌ی تماس (۰۲۱۳۶۲۲۳۰۱۱) و مسیریابی با نشان',
    /بیمارستان شهید دکتر مفتح/.test(sheet.textContent) && /میدان رازی/.test(sheet.textContent) && /مسیریابی با نشان/.test(sheet.textContent)
    && sheet.querySelector('[data-tel="02136223011"]'));
  ok('کارت مکان: انتخاب خودرو/موتور (پیش‌فرض خودرو) و ذخیره‌ی انتخاب', sheet.querySelector('[data-vehicle="d"]').classList.contains('on')
    && (env.click(sheet.querySelector('[data-vehicle="m"]')), S.vehicle === 'm' && w.localStorage.getItem('eplak_citymap_vehicle') === 'm' && sheet.querySelector('[data-vehicle="m"]').classList.contains('on')));
  env.click(sheet.querySelector('[data-vehicle="d"]'));
  ok('مکان با موقعیت تقریبی، برچسب «موقعیت تقریبی» دارد', (w.EplakCityMap.select('governorate', { scroll: false }), /موقعیت تقریبی/.test(env.$('#cityMapSheet').textContent)));
  ok('دکمه‌ی بازگشت گوشی: اول کارت بسته می‌شود، بعد صفحه', w.EplakCityMap.handleBack() === true && env.$('#cityMapSheet').hidden === true && w.EplakCityMap.handleBack() === false);

  /* ورود تازه به صفحه: وضعیت قبلی (جستجو، دسته، کارت) پاک می‌شود */
  env.click(env.$('[data-cat="office"]'));
  type('شهرداری');
  w.EplakCityMap.select('municipality', { scroll: false });
  w.renderMapPlaces();    /* تغییر زبان/تازه‌سازی در همان صفحه: وضعیت می‌ماند */
  ok('تازه‌سازی در همان صفحه (مثلاً تغییر زبان) جستجو و دسته و کارت را نگه می‌دارد', S.cat === 'office' && input.value === 'شهرداری' && S.selected === 'municipality');
  w.dispatchEvent(new w.CustomEvent('eplak-screen-shown', { detail: { id: 'screen-home' } }));
  w.renderMapPlaces();    /* بازگشت به صفحه‌ی نقشه */
  ok('پس از رفتن به صفحه‌ی دیگر و برگشتن، از نو شروع می‌شود (همه، بدون جستجو، بدون کارت)',
    S.cat === 'all' && S.q === '' && input.value === '' && S.selected === null && env.$('#cityMapSheet').hidden === true && env.$('#cityMapClear').hidden === true
    && env.$$('#mapPlacesWrap .cm-group-h').length === 9);
  env.close();
}

section('موقعیت من و فاصله‌ها');
{
  const env = makeEnv({ geo: { lat: 35.3335, lng: 51.6402, acc: 25 } });
  const w = env.w;
  w.renderMapPlaces();
  const S = w.EplakCityMap.state;
  const pos = await w.EplakCityMap.locate();
  ok('دکمه‌ی «موقعیت من» موقعیت GPS را می‌گیرد', pos && approx(pos.lat, 35.3335, 1e-9) && S.user && approx(S.user.lng, 51.6402, 1e-9));
  ok('GPS با دقت بالا درخواست می‌شود', env.geoCalls[0] && env.geoCalls[0].enableHighAccuracy === true);
  ok('نقطه‌ی آبی روی نقشه می‌آید', !!env.$('#cityMapCanvas .ep-me .ep-me-dot'));
  ok('فاصله‌ی هر مکان نمایش داده می‌شود و فهرست «از نزدیک‌ترین» مرتب است', env.$$('.cm-dist').length > 0 && /مرتب‌شده از نزدیک‌ترین/.test(env.$('#cityMapMeta').textContent));
  const rows = env.$$('#mapPlacesWrap .cm-group-h + .cm-row');
  ok('نزدیک‌ترین مرکز درمانی (شبکه‌ی بهداشت) اول فهرست درمانی است', rows[0] && rows[0].dataset.id === 'health-network', rows[0] && rows[0].dataset.id);
  env.close();
}
{
  const env = makeEnv({ geo: { lat: 35.70, lng: 51.40 } });
  const w = env.w; w.renderMapPlaces();
  await w.EplakCityMap.locate();
  ok('کاربر خارج از ورامین: پیام فاصله از مرکز شهر می‌آید و نقشه به تهران نمی‌رود', env.toasts.some((m) => /کیلومتر با مرکز ورامین فاصله دارید/.test(m)) && w.EplakCityMap.state.map.getPosition().lat < 35.4);
  env.close();
}
{
  const env = makeEnv({ geo: { error: { code: 1 } } });
  const w = env.w; w.renderMapPlaces();
  const r = await w.EplakCityMap.locate();
  ok('اجازه‌ی موقعیت رد شد: پیام روشن و بدون نقطه‌ی آبی', r === null && env.toasts.some((m) => /اجازه‌ی موقعیت داده نشد/.test(m)) && !env.$('#cityMapCanvas .ep-me'));
  env.close();
}
{
  /* مهلت GPS با دقت بالا تمام شد → یک‌بار با موقعیت تقریبی (شبکه) */
  const env = makeEnv({ geo: (n) => (n === 1 ? { error: { code: 3 } } : { lat: 35.33, lng: 51.64, acc: 800 }) });
  const w = env.w; w.renderMapPlaces();
  const pos = await w.EplakCityMap.locate();
  ok('پس از تایم‌اوت GPS دقیق، با موقعیت تقریبی دوباره تلاش می‌شود', !!pos && env.geoCalls.length === 2 && env.geoCalls[0].enableHighAccuracy === true && env.geoCalls[1].enableHighAccuracy === false);
  env.close();
}

/* ══════════════════════ مسیریابی با نشان (چهار محیط) ══════════════════════ */
section('مسیریابی با نشان — مبدأ: موقعیت کاربر، مقصد: مکان انتخاب‌شده');
const expectedRoute = (id, origin, vehicle = 'd') => {
  const p = byId(id);
  return 'https://nshn.ir/?origin=' + origin.lat.toFixed(6) + ',' + origin.lng.toFixed(6)
    + '&destination=' + p.lat.toFixed(6) + ',' + p.lng.toFixed(6) + '&vehicle=' + vehicle;
};
{
  /* ── دسکتاپ/مرورگر ── */
  const here = { lat: 35.3335, lng: 51.6402 };
  const env = makeEnv({ geo: { lat: here.lat, lng: here.lng, acc: 20 } });
  const w = env.w; w.renderMapPlaces();
  const row = env.$('#mapPlacesWrap .cm-row[data-id="mofatteh-hospital"]') || env.$('#mapPlacesWrap .cm-row');
  const id = row.dataset.id;
  const status = await w.EplakCityMap.route(id);
  ok('مرورگر دسکتاپ: تب تازه در لحظه‌ی لمس باز و پس از GPS روی لینک نشان می‌رود (ضد مسدودسازی پنجره)', status === 'popup' && env.opens.length === 1 && env.opens[0].u === '' && env.popup.href === expectedRoute(id, here), String(env.popup.href));
  ok('GPS قبل از باز کردن نشان گرفته شد (origin = موقعیت کاربر)', /\?origin=35\.333500,51\.640200&destination=/.test(env.popup.href));
  ok('پس از پایان، دکمه‌ها از حالت «در حال دریافت موقعیت» برمی‌گردند', env.$$('.cm-go.busy, .cm-route-btn.busy').length === 0 && w.EplakCityMap.state.routing === false);
  /* ردیف دوم: موقعیت تازه است، GPS دوباره خوانده نمی‌شود */
  const calls = env.geoCalls.length;
  const goBtn = env.$$('#mapPlacesWrap .cm-go')[3];
  const id2 = goBtn.dataset.go;
  env.click(goBtn);
  await sleep(30);
  ok('لمس دکمه‌ی مسیریابی روی ردیف، بدون خواندن دوباره‌ی GPS (موقعیت تازه) نشان را باز می‌کند', env.geoCalls.length === calls && env.popup.href === expectedRoute(id2, here), id2 + ' ' + String(env.popup.href));
  /* انتخاب موتور */
  w.EplakCityMap.select('governorate', { scroll: false });
  env.click(env.$('#cityMapSheet [data-vehicle="m"]'));
  await w.EplakCityMap.route('governorate');
  ok('وسیله‌ی «موتور» در لینک نشان (vehicle=m) می‌آید', env.popup.href === expectedRoute('governorate', here, 'm'), String(env.popup.href));
  env.close();
}
{
  /* ── GPS ناموفق → فقط نمایش مقصد ── */
  const env = makeEnv({ geo: { error: { code: 2 } } });
  const w = env.w; w.renderMapPlaces();
  const status = await w.EplakCityMap.route('jame-mosque');
  const p = byId('jame-mosque');
  ok('بدون GPS: «نمایش مقصد» در نشان باز می‌شود (https://nshn.ir/?lat=…&lng=…) و به کاربر می‌گوید «مسیریابی» را بزند',
    status === 'popup' && env.popup.href === 'https://nshn.ir/?lat=' + p.lat.toFixed(6) + '&lng=' + p.lng.toFixed(6) && env.toasts.some((m) => /روی «مسیریابی» بزنید/.test(m)), String(env.popup.href));
  env.close();
}
{
  /* ── اپ اندروید: پل AndroidApp.openNeshan ── */
  const here = { lat: 35.3335, lng: 51.6402 };
  const env = makeEnv({ geo: { lat: here.lat, lng: here.lng, acc: 15 } });
  const w = env.w;
  const bridgeCalls = [];
  w.AndroidApp = {
    hasLocationPermission: () => true, isLocationServiceEnabled: () => true,
    openNeshan: (u) => { bridgeCalls.push(u); return 'app'; },
    isNeshanInstalled: () => true,
    openUrl: (u) => bridgeCalls.push('OPENURL ' + u)
  };
  w.renderMapPlaces();
  const status = await w.EplakCityMap.route('mofatteh-hospital');
  ok('اپ اندروید: لینک مستند نشان به AndroidApp.openNeshan داده می‌شود (نه باز شدن در خودِ وب‌ویو)', status === 'app' && bridgeCalls.length === 1 && bridgeCalls[0] === expectedRoute('mofatteh-hospital', here), bridgeCalls.join(','));
  ok('نشان باز شد: نه پیام خطا، نه نیاز به پنجره‌ی مرورگر', env.opens.length === 0 && env.navs.length === 0 && !env.toasts.some((m) => /نصب نیست|پیدا نشد/.test(m)));
  ok('وقتی نشان نصب است، پیشنهاد «نصب نشان» دیده نمی‌شود', !/نصب برنامه‌ی نشان/.test(env.$('#cityMapSheet').textContent));
  ok('گوشی بدون GPS خاموش و با اجازه: بدون پرسش از کاربر، GPS خوانده شد', env.geoCalls.length >= 1);

  /* نشان نصب نیست → وب */
  w.AndroidApp.openNeshan = (u) => { bridgeCalls.push(u); return 'web'; };
  w.AndroidApp.isNeshanInstalled = () => false;
  w.EplakCityMap.select('jame-mosque', { scroll: false });
  ok('نشان نصب نیست: همان کارت پیش‌اپیش پیشنهاد نصب می‌دهد', /نصب برنامه‌ی نشان/.test(env.$('#cityMapSheet').textContent) && /نسخه‌ی وب نشان/.test(env.$('#cityMapSheet').textContent));
  const st2 = await w.EplakCityMap.route('jame-mosque');
  ok('نشان نصب نیست: نسخه‌ی وب باز می‌شود و پیام روشن می‌آید', st2 === 'web' && env.toasts.some((m) => /برنامه‌ی نشان نصب نیست؛ نسخه‌ی وب نشان باز شد/.test(m)));
  const installLink = env.$('#cityMapSheet [data-install]');
  ok('پیوند «نصب برنامه‌ی نشان» هست', !!installLink);
  env.click(installLink);
  ok('پیوند نصب، صفحه‌ی نشان در کافه‌بازار را باز می‌کند', bridgeCalls[bridgeCalls.length - 1] === 'OPENURL ' + 'https://cafebazaar.ir/app/' + NESHAN_PKG, bridgeCalls[bridgeCalls.length - 1]);

  /* هیچ برنامه‌ای نبود */
  w.AndroidApp.openNeshan = () => 'none';
  const st3 = await w.EplakCityMap.route('jame-mosque');
  ok('وقتی هیچ برنامه/مرورگری نیست، پیام «برنامه‌ای پیدا نشد»', st3 === 'none' && env.toasts.some((m) => /برنامه‌ای برای باز کردن نشان پیدا نشد/.test(m)));
  /* خروجی نامعتبر پل → none */
  w.AndroidApp.openNeshan = () => 'weird';
  ok('خروجی ناشناخته‌ی پل → none', (await w.EplakCityMap.route('jame-mosque')) === 'none');
  env.close();
}
{
  /* ── اپ اندروید: اجازه‌ی موقعیت را از کاربر می‌خواهد ── */
  const here = { lat: 35.3335, lng: 51.6402 };
  const env = makeEnv({ geo: { lat: here.lat, lng: here.lng, acc: 15 } });
  const w = env.w;
  const calls = { perm: 0, open: [] };
  let granted = false;
  w.AndroidApp = {
    hasLocationPermission: () => granted,
    requestLocationPermission: () => { calls.perm++; setTimeout(() => { granted = true; w.eplakLocationPermissionResult(true); }, 10); },
    isLocationServiceEnabled: () => true,
    openNeshan: (u) => { calls.open.push(u); return 'app'; }
  };
  const reportsHandler = [];
  w.eplakLocationPermissionResult = (g) => reportsHandler.push(g);   /* همان تابعی که modules/reports.js تعریف می‌کند */
  w.renderMapPlaces();
  const status = await w.EplakCityMap.route('mofatteh-hospital');
  ok('اجازه‌ی موقعیت ندارد: یک‌بار از کاربر پرسیده می‌شود و پس از «اجازه»، مسیر با مبدأ GPS ساخته می‌شود',
    status === 'app' && calls.perm === 1 && calls.open[0] === expectedRoute('mofatteh-hospital', here), calls.open.join(','));
  ok('پاسخ اجازه به گزارش‌گیری (reports.js) نشت نمی‌کند (پیام اشتباهِ «محل را با کشیدن نقشه…» نمی‌آید)', reportsHandler.length === 0);
  w.eplakLocationPermissionResult(false);
  ok('پس از پایان، پاسخ‌های بعدی اجازه به تابع قبلی (reports.js) می‌رسد', reportsHandler.length === 1 && reportsHandler[0] === false);
  env.close();
}
{
  /* ── اپ اندروید: اجازه رد شد → فقط مقصد ── */
  const env = makeEnv({ geo: { lat: 35.33, lng: 51.64 } });
  const w = env.w;
  const opened = [];
  w.AndroidApp = {
    hasLocationPermission: () => false,
    requestLocationPermission: () => setTimeout(() => w.eplakLocationPermissionResult(false), 5),
    openNeshan: (u) => { opened.push(u); return 'app'; }
  };
  w.renderMapPlaces();
  await w.EplakCityMap.route('jame-mosque');
  const p = byId('jame-mosque');
  ok('اجازه رد شد: پیام روشن و نشان با «نمایش مقصد» باز می‌شود', opened.length === 1 && opened[0] === 'https://nshn.ir/?lat=' + p.lat.toFixed(6) + '&lng=' + p.lng.toFixed(6) && env.toasts.some((m) => /اجازه‌ی موقعیت داده نشد/.test(m)), opened.join(','));
  env.close();
}
{
  /* ── GPS گوشی خاموش ── */
  const env = makeEnv({ geo: { lat: 35.33, lng: 51.64 } });
  const w = env.w;
  const opened = [];
  w.AndroidApp = { hasLocationPermission: () => true, isLocationServiceEnabled: () => false, openNeshan: (u) => { opened.push(u); return 'app'; } };
  w.renderMapPlaces();
  await w.EplakCityMap.route('jame-mosque');
  ok('GPS گوشی خاموش: پیام «روشن کنید» و باز شدن مقصد در نشان', opened.length === 1 && /\?lat=/.test(opened[0]) && env.toasts.some((m) => /سرویس موقعیت \(GPS\) گوشی خاموش است/.test(m)));
  env.close();
}
{
  /* ── APK قدیمی (فقط openUrl) ── */
  const env = makeEnv({ geo: { lat: 35.33, lng: 51.64 } });
  const w = env.w;
  const opened = [];
  w.AndroidApp = { hasLocationPermission: () => true, openUrl: (u) => opened.push(u) };
  w.renderMapPlaces();
  const st = await w.EplakCityMap.route('jame-mosque');
  ok('APK قدیمی (بدون openNeshan): از openUrl استفاده می‌شود', st === 'web' && opened.length === 1 && opened[0].startsWith('https://nshn.ir/?origin='));
  env.close();
}
{
  /* ── مرورگر اندروید و iOS ── */
  const here = { lat: 35.3335, lng: 51.6402 };
  const envA = makeEnv({ geo: { lat: here.lat, lng: here.lng }, userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
  envA.w.renderMapPlaces();
  const firstA = await envA.w.EplakCityMap.route('mofatteh-hospital');
  ok('مرورگر اندروید: وقتی برای GPS معطل شدیم، باز کردن برنامه (که لمسِ تازه می‌خواهد) انجام نمی‌شود و از کاربر خواسته می‌شود دوباره بزند',
    firstA === 'again' && envA.navs.length === 0 && envA.toasts.some((m) => /یک‌بار دیگر «مسیریابی با نشان» را بزنید/.test(m)));
  const stA = await envA.w.EplakCityMap.route('mofatteh-hospital');
  const linkA = envA.w.EplakPlaces.neshanLinks(byId('mofatteh-hospital'), here, 'd');
  ok('مرورگر اندروید: لینک intent:// (با آدرس جایگزین وب) باز می‌شود', stA === 'intent' && envA.navs.length === 1 && envA.navs[0] === linkA.androidIntent && envA.opens.length === 0, envA.navs.join(','));
  envA.close();

  const envI = makeEnv({ geo: { lat: here.lat, lng: here.lng }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
  envI.w.renderMapPlaces();
  ok('iOS: بار اول (موقعیت نداریم) فقط موقعیت گرفته می‌شود', (await envI.w.EplakCityMap.route('mofatteh-hospital')) === 'again' && envI.navs.length === 0);
  const stI = await envI.w.EplakCityMap.route('mofatteh-hospital');
  const linkI = envI.w.EplakPlaces.neshanLinks(byId('mofatteh-hospital'), here, 'd');
  ok('iOS: ابتدا neshan://?origin=…&destination=… باز می‌شود', stI === 'ios' && envI.navs[0] === linkI.ios && envI.navs[0].startsWith('neshan://?origin='), envI.navs.join(','));
  await sleep(1700);
  ok('iOS: اگر برنامه باز نشد (صفحه همچنان دیده می‌شود) بعد از ۱٫۶ ثانیه نسخه‌ی وب نشان باز می‌شود', envI.navs.length === 2 && envI.navs[1] === linkI.web, envI.navs.join(','));
  envI.close();
}
{
  /* دو لمس پشت سر هم، دو بار نشان باز نمی‌کند */
  const env = makeEnv({ geo: (n) => ({ lat: 35.33, lng: 51.64 }) });
  const w = env.w;
  const opened = [];
  w.AndroidApp = { hasLocationPermission: () => true, openNeshan: (u) => { opened.push(u); return 'app'; } };
  w.renderMapPlaces();
  const p1 = w.EplakCityMap.route('jame-mosque');
  const p2 = w.EplakCityMap.route('jame-mosque');
  await Promise.all([p1, p2]);
  ok('لمس دوباره در حین دریافت موقعیت، نشان را دوباره باز نمی‌کند', opened.length === 1);
  env.close();
}

/* ══════════════════════ انگلیسی (LTR) ══════════════════════ */
section('نسخه‌ی انگلیسی');
{
  const env = makeEnv({ lang: 'en', geo: { lat: 35.3335, lng: 51.6402 } });
  const w = env.w; w.renderMapPlaces();
  await w.EplakCityMap.locate();
  ok('چیپ‌ها و عنوان گروه‌ها انگلیسی است', /Mosques & Shrines/.test(env.$('[data-cat="mosque"]').textContent) && /Health/.test(env.$('#mapPlacesWrap .cm-group-h').textContent) && /^All/.test(env.$('[data-cat="all"]').textContent));
  ok('نام اماکن و فاصله انگلیسی است (Dr. Mofatteh Hospital، «… m»/«… km»)', /Dr\. Mofatteh Hospital/.test(env.$('#mapPlacesWrap').textContent) && /\d+(\.\d)? (m|km)\b/.test(env.$('.cm-dist').textContent));
  w.EplakCityMap.select('mofatteh-hospital', { scroll: false });
  ok('کارت مکان انگلیسی: «Route with Neshan» و نشانی انگلیسی', /Route with Neshan/.test(env.$('#cityMapSheet').textContent) && /Razi Sq\./.test(env.$('#cityMapSheet').textContent));
  w.EplakCityMap.closeSheet();
  const input = env.$('#cityMapSearch');
  ok('جای‌نمای جستجو انگلیسی است', /Search places in Varamin/.test(input.placeholder));
  input.value = 'tower'; input.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('جستجوی انگلیسی «tower» برج علاءالدوله را پیدا می‌کند', env.$$('#mapPlacesWrap .cm-row').length >= 1 && env.$('#mapPlacesWrap .cm-row').dataset.id === 'alaeddin-tower');
  env.close();
}
{
  /* تازه‌سازی متن‌ها وقتی صفحه باز نیست (i18n با هر تغییر زبان renderMapPlaces را صدا می‌زند) */
  const env = makeEnv({ geo: { lat: 35.33, lng: 51.64 } });
  const w = env.w; w.renderMapPlaces();
  w.document.getElementById('screen-map').classList.remove('active');
  w.i18n = { getLanguage: () => 'en' };
  const geoBefore = env.geoCalls.length;
  w.renderMapPlaces();
  ok('تغییر زبان وقتی صفحه‌ی نقشه باز نیست: متن‌ها انگلیسی می‌شوند، ولی GPS خوانده نمی‌شود', /Mosques & Shrines/.test(env.$('[data-cat="mosque"]').textContent) && env.geoCalls.length === geoBefore);
  env.close();
}
{
  /* تم روز/شب */
  const env = makeEnv();
  const w = env.w; w.renderMapPlaces();
  ok('در حالت شب، کاشی‌ها تیره می‌شوند', env.$('#cityMapCanvas').classList.contains('ep-map-dark'));
  w.document.documentElement.classList.add('day');
  await sleep(30);
  ok('با روز شدن تم، کاشی‌ها روشن می‌شوند (MutationObserver)', !env.$('#cityMapCanvas').classList.contains('ep-map-dark'));
  env.close();
}

/* ══════════════════════ اماکن افزوده/اصلاح‌شده توسط ادمین ══════════════════════ */
section('اماکن ادمین — منطق: applyRemote روی فهرست پیش‌فرض (core/places.js)');
const U1 = { id: 'u1a2b3c4d', cat: 'mosque', fa: 'مسجد جامع شهرک نمونه', en: 'Sample Town Mosque', lat: 35.3311, lng: 51.6415, addr: 'خیابان نمونه', addrEn: '', tel: '02136251234', note: '', noteEn: '', approx: 0 };
const okRes = (data) => ({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(data))) });
const mkPayload = (extra) => Object.assign({ success: true, ready: true, v: 'v1', custom: [], overrides: {}, hidden: [] }, extra || {});
{
  const env = makeEnv(); const L = env.w.EplakPlaces; const N = L.basePlaces().length;
  ok('بدون اصلاح، places() همان فهرست پیش‌فرض است', L.places().length === N && N === 134);
  const z = [L.applyRemote(null), L.applyRemote({ success: false }), L.applyRemote('x'), L.applyRemote([])];
  ok('ورودی نامعتبر (null، success:false، رشته، آرایه) فهرست را دست نمی‌زند', z.every((i) => i.custom + i.edited + i.hidden === 0) && L.places().length === N);

  const info = L.applyRemote(mkPayload({ custom: [U1], v: 'abc123' }));
  ok('مکان تازه اضافه می‌شود: شمار +۱، src=custom، دسته‌ی مساجد ۲۹', info.custom === 1 && info.v === 'abc123' && L.places().length === N + 1 && L.placeById(U1.id).src === 'custom' && L.countByCategory().mosque === 29 && L.countByCategory().all === N + 1);
  ok('جستجو و فیلتر دسته مکان تازه را می‌یابد', L.search(null, 'شهرک نمونه')[0].id === U1.id && L.places().filter((p) => L.inCategory(p, 'mosque')).some((p) => p.id === U1.id));
  ok('نشانی/توضیحِ انگلیسیِ خالی در مکان ادمین، به متن فارسی برمی‌گردد؛ مکان‌های پیش‌فرض دست‌نخورده‌اند',
    L.placeAddr(L.placeById(U1.id), 'en') === 'خیابان نمونه' && L.placeAddr(L.placeById('mofatteh-hospital'), 'en') === 'Razi Sq., Imam Reza Blvd.' && L.placeAddr(L.placeById('tajik-clinic'), 'en') === '');
  ok('اپ با هر applyRemote «جایگزین» می‌کند، نه انباشته (خالی → دوباره پیش‌فرض)', L.applyRemote(mkPayload()).custom === 0 && L.places().length === N && L.placeById(U1.id) === null);

  L.applyRemote(mkPayload({ hidden: ['sq-madar', 'constructor', '__proto__', 'toString', 'nope', 7, null] }));
  ok('پنهان‌سازی: فقط idهای واقعیِ پیش‌فرض (نه constructor/__proto__ و نه ناشناخته)', L.places().length === N - 1 && L.placeById('sq-madar') === null && L.remoteInfo().hidden === 1);

  L.applyRemote(mkPayload({ overrides: {
    governorate: { cat: 'office', fa: 'فرمانداری (اصلاح)', en: '', lat: 35.3301, lng: 51.6402, addr: '', addrEn: '', tel: '02136253496', note: '', noteEn: '', approx: 0 },
    'jame-mosque': { cat: 'mosque', fa: 'مسجد جامع (اصلاح)', en: 'Jame', lat: 35.3221, lng: 51.6416, addr: '', addrEn: '', tel: '', note: '', noteEn: '', approx: 0 },
    'imamzadeh-yahya': { cat: 'office', fa: 'تغییر دسته', en: '', lat: 35.3161, lng: 51.6483, addr: '', addrEn: '', tel: '', note: '', noteEn: '', approx: 0 },
    nope: { cat: 'office', fa: 'ناشناخته', lat: 35.33, lng: 51.64 }
  } }));
  const gv = L.placeById('governorate');
  ok('اصلاح: مقدارهای تازه جای مقدارهای پیش‌فرض می‌نشیند (نام، تلفن، approx)', gv.src === 'edited' && gv.fa === 'فرمانداری (اصلاح)' && gv.tel === '02136253496' && !gv.approx && L.remoteInfo().edited === 3);
  ok('اصلاحِ idِ ناشناخته نادیده گرفته می‌شود و شمار ثابت می‌ماند', L.placeById('nope') === null && L.places().length === N);
  ok('دسته‌ی دوم (also) فقط وقتی می‌ماند که دسته عوض نشده باشد', L.placeById('jame-mosque').also === 'culture' && !L.placeById('imamzadeh-yahya').also);
  ok('نامِ انگلیسیِ خالی در اصلاح، به نام فارسی برمی‌گردد (در UI)', L.placeName(gv, 'en') === 'فرمانداری (اصلاح)');

  const bads = [
    ['مختصات رشته‌ای', Object.assign({}, U1, { id: 'u0000b001', lat: '35.33' })],
    ['مختصات بیرون از ورامین', Object.assign({}, U1, { id: 'u0000b002', lat: 36.5 })],
    ['دسته‌ی ناشناخته', Object.assign({}, U1, { id: 'u0000b003', cat: 'zzz' })],
    ['نام خالی', Object.assign({}, U1, { id: 'u0000b004', fa: '   ' })],
    ['شناسه‌ی نامعتبر', Object.assign({}, U1, { id: 'bad id!' })],
    ['شناسه‌ی __proto__', Object.assign({}, U1, { id: '__proto__' })],
    ['شناسه‌ی با حروف بزرگ', Object.assign({}, U1, { id: 'U1A2B3C4D' })],
    ['شناسه‌ی بدون پیشوند u', Object.assign({}, U1, { id: 'x1a2b3c4d' })],
    ['شناسه‌ی کوتاه‌تر از ۸ هگز', Object.assign({}, U1, { id: 'u1a2b3c' })],
    ['شناسه‌ی بیش از ۴۰ نویسه', Object.assign({}, U1, { id: 'u' + '1'.repeat(41) })],
    ['شناسه‌ی هم‌نام با مکان پیش‌فرض', Object.assign({}, U1, { id: 'sq-madar' })],
    ['بدون شناسه', Object.assign({}, U1, { id: undefined })],
    ['NaN', Object.assign({}, U1, { id: 'u0000b005', lat: NaN })]
  ];
  bads.forEach(([name, item]) => {
    L.applyRemote(mkPayload({ custom: [item] }));
    ok('ردیف خراب نادیده گرفته می‌شود: ' + name, L.remoteInfo().custom === 0 && L.places().length === N);
  });
  const mixed = L.applyRemote(mkPayload({ custom: [bads[0][1], U1, Object.assign({}, U1, { fa: 'تکراری' }), null, 5, 'x', Object.assign({}, U1, { id: 'u0000002b', fa: 'دومی' })] }));
  ok('در یک پاسخ، ردیف‌های خراب کنار ردیف‌های سالم مشکلی نمی‌سازند؛ شناسه‌ی تکراری فقط یک‌بار می‌آید', mixed.custom === 2 && L.placeById(U1.id).fa === U1.fa && L.placeById('u0000002b').fa === 'دومی');
  const dirty = L.applyRemote(mkPayload({ custom: [Object.assign({}, U1, { id: 'u0000d001', fa: 'نام\nدو\tخطی ' + 'ا'.repeat(200), tel: 'abc', note: '<b>x</b>' })] }));
  const d = L.placeById('u0000d001');
  ok('متن پاک‌سازی می‌شود: کنترل‌ها → فاصله، طول ≤ ۱۲۰، تلفن نامعتبر خالی (مکان همچنان معتبر)', dirty.custom === 1 && !/[\n\t]/.test(d.fa) && d.fa.length === 120 && d.tel === '' && d.note === '<b>x</b>');
  L.applyRemote(mkPayload({ overrides: [] , custom: 'x', hidden: 'sq-madar' }));
  ok('overrides آرایه، custom رشته و hidden رشته → نادیده گرفته می‌شود', L.places().length === N && L.remoteInfo().custom + L.remoteInfo().hidden + L.remoteInfo().edited === 0);
  L.applyRemote(mkPayload({ custom: [U1] })); L.resetRemote();
  ok('resetRemote: برگشت به فهرست پیش‌فرض', L.places().length === N && L.remoteInfo().v === '' && L.placeById(U1.id) === null);
  env.close();
}

section('اماکن ادمین — صفحه: دریافت از سرور، کش، تازه‌سازی، شکست‌ها');
{
  const CK = 'eplak_places_remote_v1';
  const env = makeEnv({ geo: { lat: 35.3335, lng: 51.6402 } }); const w = env.w; const S = w.EplakCityMap.state;
  const calls = [];
  let reply = () => okRes(mkPayload({ custom: [U1], v: 'v1' }));
  w.fetch = (url, opts) => { calls.push({ url: String(url), opts }); try { return Promise.resolve(reply(url)); } catch (e) { return Promise.reject(e); } };
  w.renderMapPlaces();
  const mosqueCount = () => env.$$('#cityMapCanvas .ep-mk').filter((n) => n.style.display !== 'none').length + env.$$('#cityMapCanvas .ep-cl').reduce((n, c) => n + Number(c.textContent), 0);
  ok('با باز شدن صفحه، یک‌بار از api/places.php پرسیده می‌شود (بدون کش مرورگر)', calls.length === 1 && /^api\/places\.php\?t=\d+$/.test(calls[0].url) && calls[0].opts.cache === 'no-store' && !!calls[0].opts.signal, JSON.stringify(calls[0]?.url));
  await sleep(30);
  ok('پس از رسیدن پاسخ: چیپ «همه» ۱۳۵ و «مساجد» ۲۹ می‌شود', /۱۳۵/.test(env.$('[data-cat="all"]').textContent) && /۲۹/.test(env.$('[data-cat="mosque"]').textContent), env.$$('#cityMapChips .cm-chip').map((c) => c.textContent).join('|'));
  env.click(env.$('[data-cat="mosque"]'));
  const row = env.$('#mapPlacesWrap .cm-row[data-id="u1a2b3c4d"]');
  ok('مکان تازه در فهرست دسته‌ی «مساجد» است، با نام و نشانی خودش', !!row && /مسجد جامع شهرک نمونه/.test(row.textContent) && /خیابان نمونه/.test(row.textContent));
  ok('نشانگرهای نقشه هم ۲۹ مورد است (مکان تازه روی نقشه آمد)', mosqueCount() === 29, String(mosqueCount()));
  ok('آخرین پاسخ برای اینترنت ضعیف در localStorage می‌ماند', (() => { try { return JSON.parse(w.localStorage.getItem(CK)).data.custom[0].id === 'u1a2b3c4d'; } catch (e) { return false; } })());

  w.EplakCityMap.select('u1a2b3c4d', { scroll: false });
  ok('کارت مکانِ ادمین: نام، نشانی، تلفن (دکمه‌ی تماس) و مسیریابی با نشان',
    /مسجد جامع شهرک نمونه/.test(env.$('#cityMapSheet').textContent) && !!env.$('#cityMapSheet [data-tel="02136251234"]') && env.$('#cityMapSheet .cm-route-btn').dataset.go === 'u1a2b3c4d');
  const opened = [];
  w.AndroidApp = { hasLocationPermission: () => true, openNeshan: (u) => { opened.push(u); return 'app'; } };
  await w.EplakCityMap.route('u1a2b3c4d');
  ok('مسیریابی مکانِ ادمین: مقصد همان مختصاتی است که ادمین گذاشته و مبدأ GPS کاربر', opened.length === 1 && opened[0] === 'https://nshn.ir/?origin=35.333500,51.640200&destination=35.331100,51.641500&vehicle=d', opened[0]);

  w.EplakCityMap.reloadRemote();
  await sleep(20);
  ok('دومین درخواست (reloadRemote) نیز انجام می‌شود', calls.length === 2);
  w.renderMapPlaces(); w.renderMapPlaces();
  ok('باز شدن‌های پشت‌سرهم صفحه (و تغییر زبان) درخواست تازه نمی‌سازد (حداکثر هر ۹۰ ثانیه)', calls.length === 2);

  /* پاسخ بدون تغییر (همان v): فهرست دوباره رسم نمی‌شود */
  const probe = w.document.createElement('i'); probe.id = 'probe'; env.$('#mapPlacesWrap').appendChild(probe);
  w.EplakCityMap.reloadRemote();
  await sleep(20);
  ok('همان اثر انگشت v → فهرست دوباره رسم نمی‌شود (بی‌دلیل چشمک نمی‌زند)', calls.length === 3 && !!env.$('#probe'));

  /* تغییر نام مکانِ بازشده: کارت دوباره ساخته می‌شود */
  reply = () => okRes(mkPayload({ custom: [Object.assign({}, U1, { fa: 'مسجد با نام تازه' })], v: 'v2' }));
  w.EplakCityMap.reloadRemote();
  await sleep(20);
  ok('اصلاح نام از پنل: فهرست و کارتِ بازشده هر دو تازه می‌شوند', !env.$('#probe') && /مسجد با نام تازه/.test(env.$('#cityMapSheet').textContent) && /مسجد با نام تازه/.test(env.$('#mapPlacesWrap').textContent) && S.selected === 'u1a2b3c4d');

  /* پنهان‌شدن مکانِ بازشده و مکانِ پیش‌فرض */
  reply = () => okRes(mkPayload({ custom: [], hidden: ['sq-madar'], v: 'v3' }));
  w.EplakCityMap.reloadRemote();
  await sleep(20);
  ok('مکانی که ادمین پنهان کرده، دیگر در فهرست نیست و کارتش بسته می‌شود', S.selected === null && env.$('#cityMapSheet').hidden === true && !env.$('#mapPlacesWrap .cm-row[data-id="u1a2b3c4d"]'));
  env.click(env.$('[data-cat="all"]'));
  ok('چیپ «همه» ۱۳۳ می‌شود (۱ پنهان‌شده از پیش‌فرض)', /۱۳۳/.test(env.$('[data-cat="all"]').textContent) && w.EplakPlaces.placeById('sq-madar') === null);

  /* شکست‌های شبکه: فهرستِ قبلی می‌ماند و برنامه خراب نمی‌شود */
  const before = env.$('#mapPlacesWrap').innerHTML;
  const failures = [
    ['خطای شبکه', () => { throw new Error('offline'); }],
    ['HTTP 500', () => ({ ok: false, status: 500, json: () => Promise.resolve({}) })],
    ['JSON خراب', () => ({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('bad json')) })],
    ['success:false', () => okRes({ success: false })],
    ['بدنه‌ی خالی', () => okRes(null)]
  ];
  for (const [name, fn] of failures) {
    reply = fn;
    w.EplakCityMap.reloadRemote();
    await sleep(15);
    ok('شکست (' + name + '): فهرست قبلی می‌ماند و درخواست قفل نمی‌شود', env.$('#mapPlacesWrap').innerHTML === before && S.remoteBusy === false && w.EplakPlaces.placeById('sq-madar') === null);
  }
  env.close();
}
{
  /* کش: بدون اینترنت هم مکان‌های ادمین (آخرین پاسخ) دیده می‌شود */
  const env = makeEnv(); const w = env.w;
  w.localStorage.setItem('eplak_places_remote_v1', JSON.stringify({ t: Date.now(), data: mkPayload({ custom: [U1], v: 'cached' }) }));
  w.fetch = () => Promise.reject(new Error('offline'));
  w.renderMapPlaces();
  ok('قطع اینترنت: مکان ادمین از کشِ آخرین پاسخ، همان لحظه‌ی باز شدن دیده می‌شود (پیش از هر شبکه)', /۱۳۵/.test(env.$('[data-cat="all"]').textContent) && w.EplakPlaces.placeById('u1a2b3c4d') !== null);
  await sleep(20);
  ok('و شکست شبکه آن را پاک نمی‌کند', w.EplakPlaces.placeById('u1a2b3c4d') !== null && w.EplakCityMap.state.remoteBusy === false);
  env.close();
}
{
  const env = makeEnv(); const w = env.w;
  w.localStorage.setItem('eplak_places_remote_v1', '{not json');
  w.fetch = () => Promise.reject(new Error('offline'));
  w.renderMapPlaces();
  ok('کشِ خراب (JSON نامعتبر) نادیده گرفته می‌شود و فهرست پیش‌فرض می‌ماند', /۱۳۴/.test(env.$('[data-cat="all"]').textContent));
  env.close();
}
{
  /* بدون fetch (وب‌ویوی خیلی قدیمی): فقط فهرست پیش‌فرض، بدون خطا */
  const env = makeEnv(); const w = env.w;
  w.fetch = undefined;
  let threw = false; try { w.renderMapPlaces(); } catch (e) { threw = true; }
  ok('بدون fetch در مرورگر، صفحه بدون خطا با فهرست پیش‌فرض باز می‌شود', !threw && /۱۳۴/.test(env.$('[data-cat="all"]').textContent));
  env.close();
}
{
  /* پنجره‌ی تلاش دوباره پس از خطا: ۱۵ ثانیه (نه ۹۰) و قطع درخواستِ معلق پس از ۸ ثانیه */
  const env = makeEnv(); const w = env.w;
  let now = 1000000; w.Date.now = () => now;
  let n = 0; let mode = 'fail';
  w.fetch = (url, opts) => { n++; if (mode === 'fail') return Promise.reject(new Error('offline')); return new Promise((res, rej) => opts.signal.addEventListener('abort', () => rej(new Error('aborted')))); };
  w.renderMapPlaces(); await sleep(15);
  ok('درخواست اول (ناموفق) انجام شد', n === 1 && w.EplakCityMap.state.remoteBusy === false);
  now += 10000; w.renderMapPlaces(); await sleep(5);
  ok('۱۰ ثانیه پس از خطا هنوز تلاش دوباره نمی‌کند', n === 1);
  now += 6000; w.renderMapPlaces(); await sleep(15);
  ok('۱۶ ثانیه پس از خطا دوباره تلاش می‌کند (نه ۹۰ ثانیه)', n === 2);
  mode = 'hang';
  const nativeSetTimeout = w.setTimeout.bind(w);
  w.setTimeout = (fn, ms) => nativeSetTimeout(fn, ms >= 8000 ? 5 : ms);   /* ۸ ثانیه‌ی واقعی را کوتاه می‌کنیم */
  now += 100000; w.EplakCityMap.reloadRemote(); await sleep(60);
  ok('درخواست معلق پس از مهلت قطع (abort) و قفل آزاد می‌شود', n === 3 && w.EplakCityMap.state.remoteBusy === false);
  env.close();
}
{
  /* امنیت: نام/نشانی خطرناکِ ادمین فقط «متن» است */
  const env = makeEnv(); const w = env.w;
  const evil = Object.assign({}, U1, { id: 'u0e0e0e01', fa: '<img src=x onerror="window.__pwn=1">مسجد', addr: '"><svg onload=window.__pwn=2>', note: '</div><script>window.__pwn=3</script>', tel: '02136251234' });
  w.fetch = () => Promise.resolve(okRes(mkPayload({ custom: [evil], v: 'evil' })));
  w.renderMapPlaces(); await sleep(25);
  env.click(env.$('[data-cat="mosque"]'));
  w.EplakCityMap.select('u0e0e0e01', { scroll: false });
  ok('HTML خطرناک در نام/نشانی/توضیح، در فهرست و کارت فقط متن می‌شود (تگ ساخته نمی‌شود، کد اجرا نمی‌شود)',
    !env.$('#mapPlacesWrap img') && !env.$('#cityMapSheet img') && !env.$('#cityMapSheet svg[onload]') && !env.$('#mapPlacesWrap script') && !env.$('#cityMapSheet script') && w.__pwn === undefined
    && /<img src=x/.test(env.$('#cityMapSheet').textContent), String(w.__pwn));
  env.close();
}

/* ══════════════════════ ۵) اندروید، مانیفست، اسکریپت‌ها و مستندات ══════════════════════ */
section('اندروید، صفحه‌ی اصلی، مستندات و ساخت بسته');
{
  const kt = read('android-app/app/src/main/java/com/example/eplakfixed/MainActivity.kt');
  const manifest = read('android-app/app/src/main/AndroidManifest.xml');
  ok('MainActivity: پل openNeshan(url) با JavascriptInterface', /@JavascriptInterface\s+fun openNeshan\(url: String\): String/.test(kt));
  ok('MainActivity: نشان با setPackage(NESHAN_PACKAGE) باز می‌شود و بسته‌ی درست است', /setPackage\(NESHAN_PACKAGE\)/.test(kt) && kt.includes('const val NESHAN_PACKAGE = "' + NESHAN_PKG + '"'));
  ok('MainActivity: فقط لینک‌های nshn.ir (http/https) پذیرفته می‌شود', /host == "nshn\.ir" \|\| host\.endsWith\("\.nshn\.ir"\)/.test(kt) && /scheme != "https" && scheme != "http"/.test(kt));
  ok('MainActivity: اگر نشان نبود، لینک در مرورگر باز می‌شود و خروجی app/web/none است', /return "app"/.test(kt) && /return "web"/.test(kt) && /return "none"/.test(kt));
  ok('MainActivity: isNeshanInstalled برای لایه‌ی وب', /fun isNeshanInstalled\(\): Boolean/.test(kt));
  ok('AndroidManifest: <queries> بسته‌ی نشان را (برای اندروید ۱۱+) اعلام می‌کند', /<queries>[\s\S]*<package android:name="org\.rajman\.neshan\.traffic\.tehran\.navigator" \/>[\s\S]*<\/queries>/.test(manifest));

  ok('index.html: اسکریپت‌های داده، منطق و صفحه با نسخه‌ی کش بار می‌شوند',
    /core\/places-data\.js\?v=\d+/.test(INDEX) && /core\/places\.js\?v=\d+/.test(INDEX) && /modules\/city-map\.js\?v=\d+/.test(INDEX));
  const tag = (f) => INDEX.indexOf('<script src="' + f);
  ok('ترتیب بارگذاری: داده ← منطق، و city-map پس از ep-map و reports (تا پاسخ اجازه‌ی موقعیت درست زنجیر شود)',
    tag('core/places-data.js') > 0 && tag('core/places-data.js') < tag('core/places.js') && tag('assets/js/ep-map.js') < tag('modules/city-map.js')
    && tag('modules/reports.js') < tag('modules/city-map.js') && tag('core/places.js') < tag('modules/city-map.js'));
  ok('ep-map.js با نسخه‌ی ۴ و استایل با نسخه‌ی ۹۱ بار می‌شود (کش تازه می‌شود)', /ep-map\.js\?v=4/.test(INDEX) && /style\.css\?v=91/.test(INDEX));
  const css = read('assets/css/style.css');
  ok('استایل‌های صفحه (.cm-card/.cm-chip/.cm-row/.cm-sheet) و حالت روز', ['.cm-card', '.cm-chip', '.cm-row', '.cm-sheet', 'html.day .cm-sheet'].every((k) => css.includes(k)));
  const router = read('core/router.js');
  ok('router.js: دکمه‌ی بازگشت اول کارت مکان را می‌بندد', /EplakCityMap\.handleBack/.test(router));
  ok('داده‌ی ساختگیِ قدیمی (mapPlaces با فاصله‌های دروغین) و تابع قدیمی renderMapPlaces حذف شده است',
    !/const mapPlaces\b/.test(read('core/state.js')) && !/function renderMapPlaces/.test(read('modules/dashboard.js')) && !/showToast\('مسیر به/.test(read('modules/dashboard.js')));
  ok('فایل قدیمی «سنجاق‌های تزئینی» دیگر در صفحه نیست', !MAP_SCREEN.includes('stroke="var(--teal)" stroke-width="1.6"'));
  ok('اسکریپت‌های جدید بدون ES2020 (؟. و ؟؟) نوشته شده‌اند تا وب‌ویوی قدیمی گوشی‌ها هم اجرا کند',
    ['core/places.js', 'core/places-data.js', 'modules/city-map.js', 'assets/js/ep-map.js'].every((f) => !/\?\.[A-Za-z_$(\[]/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')) && !/\?\?[^?]/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))));

  ok('مستندات فارسی و انگلیسی «نقشه و اماکن شهری» هست', exists('docs/CITY_MAP_FA.md') && exists('docs/CITY_MAP_EN.md'));
  if (exists('docs/CITY_MAP_FA.md')) {
    const fa = read('docs/CITY_MAP_FA.md');
    ok('مستند فارسی: افزودن مکان، قالب لینک نشان، منبع داده و محدودیت‌ها', /places-data\.js/.test(fa) && /nshn\.ir\/\?origin=/.test(fa) && /OpenStreetMap/.test(fa) && /approx/.test(fa) && /openNeshan/.test(fa));
    ok('مستند فارسی: مدیریت اماکن از پنل (admin/places.php، api/places.php، جدول city_places، ویکی‌داده)', /admin\/places\.php/.test(fa) && /api\/places\.php/.test(fa) && /city_places/.test(fa) && /ویکی‌داده/.test(fa) && /۱۳۴ مکان/.test(fa));
  }
  if (exists('docs/CITY_MAP_EN.md')) {
    const en = read('docs/CITY_MAP_EN.md');
    ok('مستند انگلیسی: add a place، Neshan link format، data source، limits', /places-data\.js/.test(en) && /nshn\.ir\/\?origin=/.test(en) && /OpenStreetMap/.test(en) && /openNeshan/.test(en));
    ok('مستند انگلیسی: admin panel management (admin/places.php, api/places.php, city_places, Wikidata)', /admin\/places\.php/.test(en) && /api\/places\.php/.test(en) && /city_places/.test(en) && /Wikidata/.test(en) && /134 places/.test(en));
  }
  const build = read('tools/build-update-package.sh');
  ok('اسکریپت ساخت بسته، فایل‌های تازه را الزامی می‌کند', ['core/places-data.js', 'core/places.js', 'modules/city-map.js', 'api/places.php', 'admin/places.php', 'shared/places_store.php'].every((f) => build.includes(f)));
  const wf = read('.github/workflows/android-apk.yml');
  ok('گردش‌کار APK: شاخص «همگام‌سازی اماکنِ پنل با اپ» محاسبه می‌شود و در خلاصه، env و یادداشت انتشار می‌آید',
    (wf.match(/PLACES_SYNC_CODE/g) || []).length >= 6 && /eplak_places_remote_v1/.test(wf) && /applyRemote/.test(wf));
  const reg = read('tools/dev/run-regression.sh');
  ok('run-regression.sh آزمون places را اجرا می‌کند و jsdom را نصب می‌کند', /for t in [^;]*\bplaces\b/.test(reg) && /jsdom/.test(reg));
  ok('run-regression.sh آزمون placesadmin (پنل اماکن) را هم اجرا می‌کند', /for t in [^;]*\bplacesadmin\b/.test(reg));
}

console.log('\n====================================================');
console.log('PLACES: ' + pass + ' passed, ' + fail + ' failed');
console.log('====================================================');
process.exit(fail ? 1 : 0);
