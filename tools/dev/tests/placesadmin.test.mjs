/* placesadmin.test.mjs — «اماکن شهری» قابل‌مدیریت از پنل ادمین (و رسیدنش به اپ)
   ------------------------------------------------------------------------------
   فهرست پیش‌فرض اماکن داخل اپ است (core/places-data.js)؛ کارمند شهرداری از پنل
   (admin/places.php) مکان تازه اضافه می‌کند، مکانِ پیش‌فرض را اصلاح یا پنهان می‌کند، و اپ
   «تفاوت» را از api/places.php می‌گیرد.

   چه چیزی واقعاً اجرا می‌شود (نه متن‌کاوی):
     ۱) PHP واقعی (php-wasm) پشت PHPRequestHandler با درخواست‌های HTTP واقعی:
        ورود به پنل، CSRF، فرم افزودن/ویرایش، پنهان/نمایان، حذف، بازگردانی.
     ۲) api/places.php (عمومی، بدون ورود) و همان JSON که اپ می‌خواند.
     ۳) قرارداد دوزبانه: همان JSON سرور به core/places.js (applyRemote) داده می‌شود و
        فهرستِ نهایی اپ بررسی می‌شود.
     ۴) شکست‌ها: ورودی خراب، XSS، ساخته نشدن جدول، و DDL شاخه‌ی MySQL.
   اجرا:  bash tools/dev/run-regression.sh placesadmin
*/
import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const SHIM = '/tmp/eplak-regression-placesadmin-shim';
const DB = '/tmp/eplak-regression-placesadmin.sqlite';
const PREPEND = '/tmp/eplak-regression-placesadmin.prepend.php';
for (const f of [DB]) if (fs.existsSync(f)) fs.unlinkSync(f);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const section = (t) => console.log('\n=== ' + t + ' ===');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── نسخه‌ی آزمایشی کد (به مخزن دست نمی‌زنیم) ── */
fs.rmSync(SHIM, { recursive: true, force: true });
fs.mkdirSync(SHIM, { recursive: true });
for (const entry of ['admin', 'api', 'core', 'modules', 'shared', 'assets']) {
  const src = `${ROOT}/${entry}`;
  if (fs.existsSync(src)) fs.cpSync(src, `${SHIM}/${entry}`, { recursive: true });
}
fs.writeFileSync(PREPEND, `<?php
putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}');
$_ENV['DB_DRIVER'] = 'sqlite'; $_ENV['DB_SQLITE_PATH'] = '${DB}';
ini_set('session.save_path', '/tmp');
`);

const php = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } }));
useHostFilesystem(php);
await setPhpIniEntries(php, { auto_prepend_file: PREPEND, memory_limit: '256M', display_errors: '1', error_reporting: 'E_ALL' });
const handler = new PHPRequestHandler({ php, documentRoot: SHIM, absoluteUrl: 'http://127.0.0.1:8097' });

/* ── ابزارهای HTTP ── */
const enc = new TextEncoder();
const jar = {};
const absorb = (res) => {
  const sc = res.headers['set-cookie'];
  for (const c of (Array.isArray(sc) ? sc : sc ? [sc] : [])) {
    const [pair] = String(c).split(';'); const i = pair.indexOf('=');
    jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
};
const phpNoise = [];   /* هر هشدار/خطای PHP که در پاسخ‌ها دیده شود (display_errors روشن است) */
async function req(method, url, { form, cookies = false } = {}) {
  const headers = {};
  let body;
  if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = enc.encode(new URLSearchParams(form).toString()); }
  if (cookies && Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await handler.request({ url, method, headers, body });
  if (cookies) absorb(res);
  const noise = String(res.text).match(/(?:<b>)?(?:Warning|Notice|Deprecated|Fatal error|Parse error)(?:<\/b>)?:\s[^\n]{0,160}/);
  if (noise) phpNoise.push(`${method} ${url} → ${noise[0]}`);
  let parsed = null; try { parsed = JSON.parse(res.text); } catch (e) { /* HTML */ }
  return { status: res.httpStatusCode, headers: res.headers, text: res.text, json: parsed };
}
const admin = { get: (u) => req('GET', u, { cookies: true }), post: (u, f) => req('POST', u, { form: f, cookies: true }) };
const api = () => req('GET', '/api/places.php');
const csrfOf = (html) => (String(html).match(/name="_token" value="([a-f0-9]+)"/) || [])[1] || '';
const loc = (r) => String(r.headers.location || '');
const rowsOf = (html) => (String(html).match(/data-testid="place-row"/g) || []).length;
const rowHtml = (html, key) => (String(html).match(new RegExp(`<tr[^>]*data-key="${key}"[\\s\\S]*?</tr>`)) || [''])[0];
/* فرم را با توکن تازه می‌فرستد */
async function submit(page, fields) {
  const form = await admin.get(page);
  return admin.post(page.split('?')[0], { _token: csrfOf(form.text), ...fields });
}
const phpRun = async (code) => String((await php.run({
  code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path','/tmp'); `
    + `require_once '${SHIM}/admin/includes/db.php'; require_once '${SHIM}/shared/places_store.php'; ${code}`,
})).text);
const grab = (text) => { const m = String(text).split('<<<')[1]; if (m === undefined) throw new Error('خروجی PHP: ' + String(text).slice(0, 400)); return JSON.parse(m.split('>>>')[0]); };

/* مکان نمونه‌ی معتبر؛ فیلدها در هر آزمون عوض می‌شوند */
const GOOD = { action: 'save', key: '', cat: 'mosque', name_fa: 'مسجد جامع شهرک مدرس', name_en: 'Modarres Jame Mosque',
  addr_fa: 'شهرک مدرس، گلستان ۳', addr_en: '', tel: '02136251234', note_fa: 'نماز جماعت اول وقت', note_en: '',
  lat: '35.331000', lng: '51.641500', published: '1' };
const keyOf = (j, name) => (j?.custom || []).find((c) => c.fa === name)?.id;

const require = createRequire(import.meta.url);
const JS = require(path.join(ROOT, 'core/places.js'));
const data = require(path.join(ROOT, 'core/places-data.js'));

/* ══════════════════════════════════════════════════════════════════
   ۱) فهرست پیش‌فرض در PHP همان فهرست JavaScript است
   ══════════════════════════════════════════════════════════════════ */
section('خواندن فهرست پیش‌فرض (core/places-data.js) در PHP');
const bi = grab(await phpRun(`$b = eplakPlacesBuiltin(); echo '<<<' . json_encode(['places' => array_keys($b['places']), 'cats' => array_keys($b['categories']), 'bounds' => $b['bounds'], 'box' => eplakPlacesBox()]) . '>>>';`));
const jsIds = data.places.map((p) => p.id);
ok('هر مکانِ پیش‌فرض در PHP هم خوانده می‌شود (هیچ خطی جا نمی‌ماند)',
  bi.places.length === jsIds.length && jsIds.every((id) => bi.places.includes(id)), `${bi.places.length} از ${jsIds.length}`);
ok('نُه دسته در PHP و JS یکی است', bi.cats.length === data.categories.length && data.categories.every((c) => bi.cats.includes(c.id)), bi.cats.join(','));
ok('مرز شهر از فایل داده خوانده می‌شود و محدوده‌ی مجاز ۶۰۰۰ متر بزرگ‌تر است',
  Math.abs(bi.bounds.south - data.bounds.south) < 1e-9 && Math.abs(bi.box.south - (data.bounds.south - 0.06)) < 1e-9 && Math.abs(bi.box.east - (data.bounds.east + 0.06)) < 1e-9, JSON.stringify(bi.box));

/* ══════════════════════════════════════════════════════════════════
   ۲) api/places.php — عمومی و در ابتدا خالی
   ══════════════════════════════════════════════════════════════════ */
section('api/places.php: عمومی، فقط خواندنی، در ابتدا خالی');
let r = await api();
ok('بدون ورود، ۲۰۰ و JSON سالم', r.status === 200 && r.json?.success === true, `${r.status} ${r.text.slice(0, 120)}`);
ok('جدول در اولین درخواست ساخته می‌شود (ready: true)', r.json?.ready === true, r.text.slice(0, 160));
ok('هیچ اصلاحی نیست: custom و hidden آرایه‌ی خالی', Array.isArray(r.json?.custom) && r.json.custom.length === 0 && Array.isArray(r.json?.hidden) && r.json.hidden.length === 0);
ok('overrides همیشه «شیء» JSON است، نه آرایه (حتی خالی)', /"overrides":\{\}/.test(r.text), r.text.slice(0, 200));
ok('اثر انگشت v: ۱۲ نویسه‌ی هگز', /^[0-9a-f]{12}$/.test(String(r.json?.v)), String(r.json?.v));
ok('هدرها: CORS باز و بدون کش', String(r.headers['access-control-allow-origin']) === '*' && /no-store/.test(String(r.headers['cache-control'])), JSON.stringify(r.headers['cache-control']));
const v0 = r.json?.v;
r = await req('POST', '/api/places.php', { form: { x: '1' } });
ok('روش POST پذیرفته نمی‌شود (۴۰۵)', r.status === 405, `${r.status}`);
r = await req('OPTIONS', '/api/places.php');
ok('OPTIONS (پیش‌پرواز CORS) ۲۰۴ می‌دهد', r.status === 204, `${r.status}`);

/* ══════════════════════════════════════════════════════════════════
   ۳) پنل: بدون ورود هیچ کاری نمی‌شود
   ══════════════════════════════════════════════════════════════════ */
section('پنل ادمین: ورود و CSRF');
r = await req('GET', '/admin/places.php');
ok('بدون ورود، صفحه به login.php می‌رود', r.status === 302 && /login\.php/.test(loc(r)), `${r.status} ${loc(r)}`);
r = await req('POST', '/admin/places.php', { form: { ...GOOD, _token: 'x' } });
ok('POST بدون ورود هم به login.php می‌رود و چیزی ذخیره نمی‌شود', r.status === 302 && /login\.php/.test(loc(r)) && (await api()).json.custom.length === 0, `${r.status} ${loc(r)}`);
await req('GET', '/admin/login.php', { cookies: true });
r = await req('POST', '/admin/login.php', { form: { username: 'admin', password: 'admin123' }, cookies: true });
ok('ورود به پنل (HTTP واقعی با نشست)', r.status === 302 && /index\.php/.test(loc(r)), `${r.status} ${loc(r)}`);

let list = await admin.get('/admin/places.php');
ok('صفحه‌ی «اماکن شهری» باز می‌شود', list.status === 200 && /اماکن شهری/.test(list.text), `${list.status}`);
ok('همه‌ی اماکن پیش‌فرض در فهرست پنل هستند', rowsOf(list.text) === jsIds.length, `${rowsOf(list.text)} از ${jsIds.length}`);
ok('دکمه‌ی «افزودن مکان جدید» و جستجو هست', /data-testid="place-add"/.test(list.text) && /id="plSearch"/.test(list.text));
ok('پیوند منو در همین صفحه فعال است', /<a class="active" href="places\.php">/.test(list.text));
ok('چیپ نُه دسته با شمار درست (مساجد ۲۸)', (list.text.match(/stat-item/g) || []).length >= 12 && /مساجد و اماکن مذهبی[\s\S]{0,120}<strong>28<\/strong>/.test(list.text));
let f = await admin.get('/admin/places.php?cat=mosque');
ok('فیلتر دسته: فقط مساجد', rowsOf(f.text) === data.places.filter((p) => p.cat === 'mosque').length, `${rowsOf(f.text)}`);
f = await admin.get('/admin/places.php?show=custom');
ok('فیلتر «افزوده‌شده» در ابتدا خالی است و پیام می‌دهد', rowsOf(f.text) === 0 && /موردی با این فیلتر پیدا نشد/.test(f.text));
f = await admin.get('/admin/places.php?cat=zzz&show=zzz');
ok('دسته/فیلتر ناشناخته نادیده گرفته می‌شود (همه نشان داده می‌شود)', rowsOf(f.text) === jsIds.length);

const ver = await admin.get('/admin/version.php');
const verRow = (label) => (ver.text.split('<div class="v-row">').slice(1).find((chunk) => new RegExp(label).test(chunk)) || '');   /* یک ردیفِ v-row */
ok('«بررسی نسخه»: فایل‌های اماکن شهری (پنل، API، منطق، داده، صفحه‌ی اپ) همه «هست»',
  ['admin/places\\.php', 'api/places\\.php', 'shared/places_store\\.php', 'core/places-data\\.js', 'modules/city-map\\.js'].every((f) => /pill-ok/.test(verRow(f))), ver.status + ' ' + verRow('admin/places\\.php').slice(0, 160));
ok('«بررسی نسخه»: جدول city_places ساخته و قابل استفاده است', /pill-ok/.test(verRow('city_places')), verRow('city_places').slice(0, 200));

const form = await admin.get('/admin/places.php?new=1');
ok('فرم افزودن: نقشه‌ی انتخاب موقعیت، نُه دسته و توکن CSRF',
  /id="plMap"/.test(form.text) && /ep-map\.js\?v=4/.test(form.text) && csrfOf(form.text).length === 64
  && (form.text.match(/<option value="[a-z]+"/g) || []).length === 9 && /tileProxy: '\.\.\/api\/tiles\.php'/.test(form.text), form.text.slice(0, 80));

/* ── CSRF ── */
r = await admin.post('/admin/places.php', { ...GOOD, _token: 'deadbeef' });
ok('POST با توکن اشتباه: ۴۰۳ و چیزی ذخیره نمی‌شود', r.status === 403 && (await api()).json.custom.length === 0, `${r.status}`);
r = await admin.post('/admin/places.php', { ...GOOD });
ok('POST بدون توکن: ۴۰۳', r.status === 403, `${r.status}`);

/* ══════════════════════════════════════════════════════════════════
   ۴) اعتبارسنجی ورودی
   ══════════════════════════════════════════════════════════════════ */
section('اعتبارسنجی: ورودی خراب ذخیره نمی‌شود و پیام فارسی می‌دهد');
const bad = async (patch, re, name) => {
  const res = await submit('/admin/places.php?new=1', { ...GOOD, ...patch });
  const errs = (res.text.match(/data-testid="places-errors"[\s\S]*?<\/div>/) || [''])[0];
  const stored = (await api()).json.custom.length;
  ok(name, res.status === 200 && re.test(errs) && stored === 0, `${res.status} ${errs.replace(/\s+/g, ' ').slice(0, 160)} stored=${stored}`);
  return res;
};
let res = await bad({ name_fa: '   ' }, /نام فارسی مکان الزامی/, 'نام خالی (فقط فاصله) رد می‌شود');
ok('بعد از خطا، مقدارهای واردشده در فرم می‌مانند (کاربر دوباره تایپ نمی‌کند)', /value="02136251234"/.test(res.text) && /value="35\.331000"/.test(res.text) && /مسجد جامع شهرک مدرس|value=""/.test(res.text));
await bad({ cat: '' }, /دسته را انتخاب/, 'بدون دسته رد می‌شود');
await bad({ cat: 'nope' }, /دسته را انتخاب/, 'دسته‌ی ناشناخته رد می‌شود');
await bad({ lat: '', lng: '' }, /موقعیت روی نقشه/, 'بدون مختصات رد می‌شود');
await bad({ lat: 'abc', lng: '51.6' }, /موقعیت روی نقشه/, 'مختصات غیرعددی رد می‌شود');
await bad({ lat: '35.33', lng: '999' }, /بیرون از محدوده‌ی شهر ورامین/, 'طول جغرافیایی ۹۹۹ (بیرون از ورامین) رد می‌شود');
await bad({ lat: '35.33', lng: '99999' }, /موقعیت روی نقشه/, 'طول جغرافیایی با قالب نامعتبر رد می‌شود');
await bad({ lat: '35.9', lng: '51.64' }, /بیرون از محدوده‌ی شهر ورامین/, 'نقطه‌ی بیرون از ورامین (تهران) رد می‌شود');
await bad({ lat: '0', lng: '0' }, /بیرون از محدوده‌ی شهر ورامین/, 'نقطه‌ی (۰، ۰) رد می‌شود');
await bad({ tel: '12ab' }, /شماره‌ی تماس/, 'تلفن با حرف رد می‌شود');
await bad({ tel: '12' }, /شماره‌ی تماس/, 'تلفن کوتاه‌تر از ۳ رقم رد می‌شود');
await bad({ name_fa: 'م'.repeat(121) }, /بیش از 120 نویسه/, 'نام بلندتر از ۱۲۰ نویسه رد می‌شود');
await bad({ note_fa: 'ن'.repeat(241) }, /توضیح فارسی/, 'توضیح بلندتر از ۲۴۰ نویسه رد می‌شود');
/* هر چهار ضلعِ محدوده‌ی مجاز جدا آزموده می‌شود (یک ضلعِ خراب نباید پشت سه ضلع دیگر پنهان بماند) */
const edge = grab(await phpRun(`
$t = function ($lat, $lng) { $r = eplakPlacesValidate(['cat' => 'mosque', 'name_fa' => 'x', 'lat' => (string) $lat, 'lng' => (string) $lng]); return count($r['errors']) === 0; };
$b = eplakPlacesBox();
echo '<<<' . json_encode([
  'inside'  => [$t($b['south'] + 0.001, 51.64), $t($b['north'] - 0.001, 51.64), $t(35.33, $b['west'] + 0.001), $t(35.33, $b['east'] - 0.001)],
  'outside' => [$t($b['south'] - 0.001, 51.64), $t($b['north'] + 0.001, 51.64), $t(35.33, $b['west'] - 0.001), $t(35.33, $b['east'] + 0.001)],
]) . '>>>';`));
ok('مختصات درست داخل هر چهار ضلع (جنوب، شمال، غرب، شرق) پذیرفته می‌شود', edge.inside.every(Boolean), JSON.stringify(edge.inside));
ok('مختصات درست بیرون از هر چهار ضلع (جنوب، شمال، غرب، شرق) رد می‌شود', edge.outside.every((v) => v === false), JSON.stringify(edge.outside));
res = await submit('/admin/places.php?new=1', { ...GOOD, cat: '', name_fa: '', lat: '', tel: 'x' });
ok('چند خطا با هم گزارش می‌شود', (res.text.match(/<li>/g) || []).length >= 4, `${(res.text.match(/<li>/g) || []).length}`);

/* ══════════════════════════════════════════════════════════════════
   ۵) افزودن مکان تازه
   ══════════════════════════════════════════════════════════════════ */
section('افزودن مکان تازه: ارقام فارسی، ذخیره، نمایش در API و فهرست');
res = await submit('/admin/places.php?new=1', { ...GOOD, name_fa: 'مسجد جامع شهرک مدرس', lat: '۳۵٫۳۳۱۰۰۰', lng: '۵۱٫۶۴۱۵۰۰', tel: '۰۲۱-۳۶۲۵ ۱۲۳۴', approx: '1' });
ok('ذخیره، ریدایرکت (PRG) با پیام «ذخیره شد»', res.status === 302 && /places\.php\?msg=saved/.test(loc(res)), `${res.status} ${loc(res)}`);
list = await admin.get('/admin/places.php?msg=saved');
ok('پیام موفقیت در فهرست دیده می‌شود', /data-testid="places-flash"[^>]*>[^<]*ذخیره شد/.test(list.text));
let j = (await api()).json;
const K1 = keyOf(j, 'مسجد جامع شهرک مدرس');
ok('API یک مکان افزوده‌شده با شناسه‌ی «u + ۸ هگز» برمی‌گرداند', j.custom.length === 1 && /^u[0-9a-f]{8}$/.test(K1 || ''), JSON.stringify(j.custom));
const c1 = j.custom[0] || {};
ok('ارقام فارسی مختصات و تلفن به لاتین یکدست شد', c1.lat === 35.331 && c1.lng === 51.6415 && c1.tel === '02136251234', JSON.stringify(c1));
ok('همه‌ی فیلدها و برچسب «تقریبی» ذخیره شد', c1.cat === 'mosque' && c1.en === 'Modarres Jame Mosque' && c1.addr === 'شهرک مدرس، گلستان ۳' && c1.note === 'نماز جماعت اول وقت' && c1.approx === 1, JSON.stringify(c1));
ok('اثر انگشت v عوض شد', j.v !== v0 && /^[0-9a-f]{12}$/.test(j.v));
list = await admin.get('/admin/places.php');
const firstKey = (list.text.match(/data-testid="place-row" data-key="([^"]+)"/) || [])[1];
ok('مکان تازه در فهرست پنل «اول» است و نشان «افزوده‌شده» دارد', firstKey === K1 && /افزوده‌شده/.test(rowHtml(list.text, K1)), firstKey);
ok('شمار فهرست یکی بیشتر شد', rowsOf(list.text) === jsIds.length + 1);
f = await admin.get('/admin/places.php?show=custom');
ok('فیلتر «افزوده‌شده» همان یک مورد را نشان می‌دهد', rowsOf(f.text) === 1);

section('ویرایش، پیش‌نویس و حذف مکانِ افزوده‌شده');
let edit = await admin.get(`/admin/places.php?edit=${K1}`);
ok('فرم ویرایش با مقدارهای ذخیره‌شده پر است و دکمه‌ی حذف دارد',
  /value="مسجد جامع شهرک مدرس"/.test(edit.text) && /value="35\.331000"/.test(edit.text) && /data-testid="place-delete"/.test(edit.text) && !/data-testid="place-restore"/.test(edit.text));
ok('تیک «بلافاصله نمایش داده شود» برای منتشرشده روشن است', /name="published"[^>]*checked/.test(edit.text));
res = await submit(`/admin/places.php?edit=${K1}`, { ...GOOD, key: K1, name_fa: 'مسجد جامع شهرک مدرس (ویرایش)', lat: '35.331200', lng: '51.641700' });
j = (await api()).json;
ok('ویرایش در API دیده می‌شود (همان شناسه، نام و مختصات تازه)', j.custom.length === 1 && j.custom[0].id === K1 && j.custom[0].fa === 'مسجد جامع شهرک مدرس (ویرایش)' && j.custom[0].lat === 35.3312, JSON.stringify(j.custom));

res = await submit(`/admin/places.php?edit=${K1}`, { ...GOOD, key: K1, name_fa: 'مسجد جامع شهرک مدرس (ویرایش)', lat: '35.331200', lng: '51.641700', published: '' });
j = (await api()).json;
ok('بدون تیک انتشار = پیش‌نویس؛ از API حذف می‌شود', j.custom.length === 0);
list = await admin.get('/admin/places.php?show=hidden');
ok('در فهرست با نشان «پیش‌نویس» و فیلتر «پنهان/پیش‌نویس» دیده می‌شود', rowsOf(list.text) === 1 && /پیش‌نویس/.test(rowHtml(list.text, K1)) && /pl-hidden-row/.test(rowHtml(list.text, K1)));
res = await submit('/admin/places.php', { action: 'show', key: K1 });
j = (await api()).json;
ok('«نمایش در اپ» پیش‌نویس را دوباره منتشر می‌کند', res.status === 302 && /msg=shown/.test(loc(res)) && j.custom.length === 1);
res = await submit('/admin/places.php', { action: 'hide', key: K1 });
j = (await api()).json;
ok('«پنهان کردن» مکانِ افزوده‌شده آن را از API برمی‌دارد ولی در پنل می‌ماند', /msg=hidden/.test(loc(res)) && j.custom.length === 0 && rowsOf((await admin.get('/admin/places.php')).text) === jsIds.length + 1);
res = await submit('/admin/places.php', { action: 'show', key: K1 });

section('امنیت متن: XSS و نویسه‌های کنترلی');
res = await submit('/admin/places.php?new=1', { ...GOOD, name_fa: '<script>alert(1)</script>مسجد\nخط دوم\t', name_en: '"><img src=x onerror=alert(2)>', note_fa: "' onmouseover='alert(3)" });
j = (await api()).json;
const kx = (j.custom.find((c) => /script/.test(c.fa)) || {}).id;
list = await admin.get('/admin/places.php');
ok('متن خطرناک در پنل escape می‌شود (تگ اجرا نمی‌شود)', !!kx && !/<script>alert\(1\)/.test(list.text) && !/<img src=x/.test(list.text) && /&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(rowHtml(list.text, kx)), rowHtml(list.text, kx).slice(0, 200));
ok('خط جدید و Tab به یک فاصله تبدیل می‌شود', (j.custom.find((c) => c.id === kx) || {}).fa === '<script>alert(1)</script>مسجد خط دوم', JSON.stringify((j.custom.find((c) => c.id === kx) || {}).fa));
const editX = await admin.get(`/admin/places.php?edit=${kx}`);
ok('در فرم ویرایش هم مقدارها escape می‌شوند (ویژگی value نمی‌شکند)', !/<img src=x/.test(editX.text) && /&quot;&gt;&lt;img src=x onerror=alert\(2\)&gt;/.test(editX.text) && !/onmouseover='alert/.test(editX.text));
await submit('/admin/places.php', { action: 'delete', key: kx });

section('حذف مکانِ افزوده‌شده');
res = await submit('/admin/places.php', { action: 'delete', key: K1 });
j = (await api()).json;
ok('حذف: ریدایرکت با پیام، و از API و فهرست می‌رود', /msg=deleted/.test(loc(res)) && j.custom.length === 0 && rowsOf((await admin.get('/admin/places.php')).text) === jsIds.length);

/* ══════════════════════════════════════════════════════════════════
   ۶) اصلاح و پنهان‌کردن مکانِ پیش‌فرض
   ══════════════════════════════════════════════════════════════════ */
section('اصلاح مکانِ پیش‌فرض (فرمانداری): ذخیره، بدون‌تغییر، بازگردانی');
const gov = data.places.find((p) => p.id === 'governorate');
edit = await admin.get('/admin/places.php?edit=governorate');
ok('فرمِ مکانِ پیش‌فرض با مقدارهای خودِ فایل داده پر می‌شود',
  edit.text.includes(`value="${gov.fa}"`) && edit.text.includes(`value="${gov.lat.toFixed(6)}"`) && /name="approx"[^>]*checked/.test(edit.text) && !/data-testid="place-restore"/.test(edit.text) && !/name="published"/.test(edit.text)
  && !/padding-top:14px/.test(edit.text));   /* بدون نوار خالیِ «حذف/بازگردانی» برای مکانِ دست‌نخورده */
const sameFields = { action: 'save', key: 'governorate', cat: gov.cat, name_fa: gov.fa, name_en: gov.en, addr_fa: gov.addr || '', addr_en: gov.addrEn || '', tel: gov.tel || '', note_fa: gov.note || '', note_en: gov.noteEn || '', lat: String(gov.lat), lng: String(gov.lng), approx: gov.approx ? '1' : '' };
res = await submit('/admin/places.php?edit=governorate', sameFields);
j = (await api()).json;
ok('ذخیره‌ی بدون هیچ تغییر: «تغییری نبود» و ردیفی ساخته نمی‌شود', /msg=unchanged/.test(loc(res)) && Object.keys(j.overrides).length === 0);
res = await submit('/admin/places.php?edit=governorate', { ...sameFields, tel: '02136253496', lat: '35.329900', lng: '51.640500', approx: '' });
j = (await api()).json;
const ov = j.overrides.governorate || {};
ok('اصلاح: API «overrides.governorate» را با مقدارهای کامل و تازه برمی‌گرداند',
  /msg=saved/.test(loc(res)) && ov.tel === '02136253496' && ov.lat === 35.3299 && ov.lng === 51.6405 && ov.approx === 0 && ov.fa === gov.fa && ov.cat === 'office', JSON.stringify(ov));
list = await admin.get('/admin/places.php');
ok('در فهرست «اصلاح‌شده» است و ردیف تکراری ساخته نشد', /اصلاح‌شده/.test(rowHtml(list.text, 'governorate')) && rowsOf(list.text) === jsIds.length);
edit = await admin.get('/admin/places.php?edit=governorate');
ok('حالا فرم، «بازگردانی به پیش‌فرض» دارد و مقدار اصلاح‌شده را نشان می‌دهد', /data-testid="place-restore"/.test(edit.text) && /value="02136253496"/.test(edit.text));
res = await submit('/admin/places.php', { action: 'restore', key: 'governorate' });
j = (await api()).json;
ok('بازگردانی: اصلاح پاک می‌شود و API دوباره خالی است', /msg=restored/.test(loc(res)) && Object.keys(j.overrides).length === 0);

section('پنهان و نمایان کردن مکانِ پیش‌فرض');
res = await submit('/admin/places.php', { action: 'hide', key: 'sq-madar' });
j = (await api()).json;
ok('پنهان‌کردن: idِ مکان در hidden می‌آید', /msg=hidden/.test(loc(res)) && j.hidden.length === 1 && j.hidden[0] === 'sq-madar', JSON.stringify(j.hidden));
list = await admin.get('/admin/places.php');
ok('در پنل کم‌رنگ است با نشان «پنهان» و دکمه‌ی «نمایش در اپ»', /pl-hidden-row/.test(rowHtml(list.text, 'sq-madar')) && /پنهان/.test(rowHtml(list.text, 'sq-madar')) && /data-testid="place-show"/.test(rowHtml(list.text, 'sq-madar')));
res = await submit('/admin/places.php', { action: 'show', key: 'sq-madar' });
j = (await api()).json;
const keep = await phpRun(`echo '<<<' . json_encode((int) $pdo->query("SELECT COUNT(*) FROM city_places")->fetchColumn()) . '>>>';`);
ok('نمایان‌کردن: از hidden می‌رود و ردیفِ بیهوده در دیتابیس نمی‌ماند', /msg=shown/.test(loc(res)) && j.hidden.length === 0 && grab(keep) === 0, `${JSON.stringify(j.hidden)} rows=${grab(keep)}`);

await submit('/admin/places.php?edit=governorate', { ...sameFields, tel: '02136253496' });
await submit('/admin/places.php', { action: 'hide', key: 'governorate' });
j = (await api()).json;
ok('مکانِ اصلاح‌شده را هم می‌شود پنهان کرد (فقط hidden؛ در overrides نمی‌آید)', j.hidden.includes('governorate') && !('governorate' in j.overrides));
await submit('/admin/places.php', { action: 'show', key: 'governorate' });
j = (await api()).json;
ok('با نمایان‌کردن، اصلاحِ قبلی (تلفن) سر جایش می‌ماند', !j.hidden.includes('governorate') && j.overrides.governorate?.tel === '02136253496');
await submit('/admin/places.php', { action: 'restore', key: 'governorate' });

section('کلیدهای ناشناخته و کارهای غیرمجاز');
res = await admin.get('/admin/places.php?edit=nope');
ok('ویرایشِ کلید ناشناخته → پیام «پیدا نشد»', res.status === 302 && /msg=notfound/.test(loc(res)), `${res.status} ${loc(res)}`);
res = await submit('/admin/places.php', { ...GOOD, key: 'nope' });
ok('ذخیره با کلید ناشناخته → «پیدا نشد» و چیزی ساخته نمی‌شود', /msg=notfound/.test(loc(res)) && (await api()).json.custom.length === 0, loc(res));
res = await submit('/admin/places.php', { action: 'delete', key: 'sq-madar' });
ok('«حذف» برای مکانِ پیش‌فرض ممکن نیست (فقط پنهان/اصلاح)', /msg=notfound/.test(loc(res)));
const k2 = (await (async () => { await submit('/admin/places.php?new=1', GOOD); return keyOf((await api()).json, GOOD.name_fa); })());
res = await submit('/admin/places.php', { action: 'restore', key: k2 });
ok('«بازگردانی» برای مکانِ افزوده‌شده ممکن نیست', /msg=notfound/.test(loc(res)) && (await api()).json.custom.length === 1);
res = await submit('/admin/places.php', { action: 'whatever', key: k2 });
ok('کنش ناشناخته بی‌اثر است', /msg=notfound/.test(loc(res)) && (await api()).json.custom.length === 1);
res = await submit('/admin/places.php?edit=governorate', { ...sameFields, lat: '36.5', lng: '51.6', tel: '1' });
ok('اصلاح مکانِ پیش‌فرض هم اعتبارسنجی می‌شود (مختصات بیرون از شهر)', res.status === 200 && /بیرون از محدوده/.test(res.text) && Object.keys((await api()).json.overrides).length === 0);
await submit('/admin/places.php', { action: 'delete', key: k2 });

/* ══════════════════════════════════════════════════════════════════
   ۷) قرارداد دوزبانه: JSON سرور → core/places.js (اپ)
   ══════════════════════════════════════════════════════════════════ */
section('قرارداد سرور ↔ اپ: همان JSON واقعی به applyRemote داده می‌شود');
await submit('/admin/places.php?new=1', { ...GOOD, name_fa: 'اداره‌ی نمونه', cat: 'office', name_en: 'Sample Office', lat: '35.3283', lng: '51.6401', tel: '02136253164', approx: '' });
await submit('/admin/places.php?new=1', { ...GOOD, name_fa: 'مکان پیش‌نویس', published: '' });
await submit('/admin/places.php?edit=governorate', { ...sameFields, tel: '02136253496', name_en: 'Varamin Governorate (edited)' });
await submit('/admin/places.php', { action: 'hide', key: 'sq-madar' });
j = (await api()).json;
const base = JS.basePlaces().length;
JS.resetRemote();
const info = JS.applyRemote(j);
const sample = (JS.places().find((p) => p.fa === 'اداره‌ی نمونه') || {});
ok('اپ: یک مکان تازه، یک اصلاح و یک پنهان‌سازی را می‌شناسد', info.custom === 1 && info.edited === 1 && info.hidden === 1 && info.v === j.v, JSON.stringify(info));
ok('اپ: شمار نهایی = پیش‌فرض − ۱ پنهان + ۱ تازه (پیش‌نویس نیامده)', JS.places().length === base, `${JS.places().length} از ${base}`);
ok('اپ: مکان تازه با دسته‌ی اداری، مختصات و شناسه‌ی سرور', sample.cat === 'office' && sample.lat === 35.3283 && sample.src === 'custom' && sample.id === keyOf(j, 'اداره‌ی نمونه'), JSON.stringify(sample));
ok('اپ: فرمانداری اصلاح‌شده است (تلفن و نام انگلیسی تازه، موقعیت همان)', JS.placeById('governorate')?.tel === '02136253496' && JS.placeById('governorate')?.en === 'Varamin Governorate (edited)' && JS.placeById('governorate')?.src === 'edited');
ok('اپ: «میدان مادر» دیگر نیست و پیش‌نویس هم نیامده', JS.placeById('sq-madar') === null && !JS.places().some((p) => p.fa === 'مکان پیش‌نویس'));
ok('اپ: جستجو مکان تازه را پیدا می‌کند و فیلتر دسته‌ی «اداری» آن را دارد',
  JS.search(null, 'اداره نمونه').some((p) => p.id === sample.id) && JS.places().filter((p) => JS.inCategory(p, 'office')).some((p) => p.id === sample.id));
ok('اپ: لینک نشان برای مکان تازه با همان مختصات ساخته می‌شود', JS.neshanLinks(sample, { lat: 35.33, lng: 51.64 }, 'd').web === 'https://nshn.ir/?origin=35.330000,51.640000&destination=35.328300,51.640100&vehicle=d');
JS.resetRemote();
ok('اپ: resetRemote فهرست پیش‌فرض را برمی‌گرداند', JS.places().length === base && JS.placeById('sq-madar') !== null && JS.placeById('governorate').tel === gov.tel);
await submit('/admin/places.php', { action: 'show', key: 'sq-madar' });
await submit('/admin/places.php', { action: 'restore', key: 'governorate' });
for (const c of (await api()).json.custom) await submit('/admin/places.php', { action: 'delete', key: c.id });
ok('پاک‌سازی: پس از حذف همه، API دوباره خالی است', (await api()).json.custom.length === 0 && Object.keys((await api()).json.overrides).length === 0 && (await api()).json.hidden.length === 0);
const vEnd = (await api()).json.v;
ok('اثر انگشتِ حالت خالی همیشه یکی است (اپ بی‌دلیل دوباره رسم نمی‌کند)', vEnd === v0, `${vEnd} ≠ ${v0}`);

/* ══════════════════════════════════════════════════════════════════
   ۸) شکست‌های زیرساخت و شاخه‌ی MySQL
   ══════════════════════════════════════════════════════════════════ */
section('ساخته نشدن جدول (بدون دسترسی CREATE): فقط همین قابلیت متأثر می‌شود');
const fb = grab(await phpRun(`
$bad = new class('sqlite::memory:') extends PDO {
  public function exec($statement): int|false { throw new PDOException('CREATE command denied'); }
};
$p = eplakPlacesPublicPayload($bad);
$s = eplakPlacesSave($bad, '', ['cat' => 'mosque', 'name_fa' => 'x', 'lat' => '35.33', 'lng' => '51.64']);
echo '<<<' . json_encode(['ready' => $p['ready'], 'success' => $p['success'], 'custom' => $p['custom'], 'hidden' => $p['hidden'], 'saveOk' => $s['ok'], 'saveErr' => $s['errors'], 'hide' => eplakPlacesSetHidden($bad, 'sq-madar', true), 'del' => eplakPlacesDelete($bad, 'x')], JSON_UNESCAPED_UNICODE) . '>>>';`));
ok('API در این حالت خطا نمی‌دهد: success=true، ready=false، فهرست‌های خالی (اپ فهرست پیش‌فرض را نشان می‌دهد)',
  fb.success === true && fb.ready === false && fb.custom.length === 0 && fb.hidden.length === 0, JSON.stringify(fb));
ok('ذخیره/پنهان/حذف شکست را «درست» گزارش می‌کنند (نه استثنای خام)', fb.saveOk === false && /جدول اماکن ساخته نشد/.test(fb.saveErr.join(' ')) && fb.hide === false && fb.del === false);

section('شاخه‌ی MySQL (سرور MySQL در آزمون نیست؛ متن DDL بررسی می‌شود)');
const ddl = grab(await phpRun(`
$spy = new class('sqlite::memory:') extends PDO {
  public array $seen = [];
  public function getAttribute($attribute): mixed { return $attribute === PDO::ATTR_DRIVER_NAME ? 'mysql' : parent::getAttribute($attribute); }
  public function exec($statement): int|false { $this->seen[] = $statement; return 0; }
};
eplakPlacesEnsureTable($spy);
echo '<<<' . json_encode($spy->seen) . '>>>';`));
const d = String(ddl[0] || '');
ok('یک دستور CREATE TABLE IF NOT EXISTS city_places اجرا می‌شود', ddl.length === 1 && /^CREATE TABLE IF NOT EXISTS city_places \(/.test(d), d.slice(0, 60));
ok('نحو MySQL: AUTO_INCREMENT، کلید یکتا، utf8mb4؛ بدون AUTOINCREMENT و بدون بازمانده‌ی قالب',
  /id INT AUTO_INCREMENT PRIMARY KEY/.test(d) && /UNIQUE KEY uq_city_places_key \(place_key\)/.test(d) && /DEFAULT CHARSET=utf8mb4\s*$/.test(d) && !/AUTOINCREMENT/.test(d) && !/%UNIQ%/.test(d) && !/place_key VARCHAR\(64\) NOT NULL UNIQUE/.test(d), d);
ok('پرانتزها متوازن‌اند و پیش از «)» نهایی کاما نیست', (d.match(/\(/g) || []).length === (d.match(/\)/g) || []).length && !/,\s*\)/.test(d));
ok('همه‌ی ستون‌های لازم در DDL هستند', ['place_key', 'kind', 'cat', 'name_fa', 'name_en', 'lat', 'lng', 'addr_fa', 'addr_en', 'tel', 'note_fa', 'note_en', 'approx', 'hidden', 'created_at', 'updated_at'].every((c) => new RegExp(`\\n\\s+${c} `).test(d)));
const cols = grab(await phpRun(`echo '<<<' . json_encode(array_column($pdo->query('PRAGMA table_info(city_places)')->fetchAll(PDO::FETCH_ASSOC), 'name')) . '>>>';`));
ok('جدول SQLite هم همین ستون‌ها را دارد', cols.length === 17 && cols.includes('place_key') && cols.includes('hidden'), cols.join(','));

section('هشدار و خطای PHP');
ok('در هیچ‌یک از پاسخ‌های پنل و API هشدار/اخطار/خطای PHP دیده نشد (display_errors روشن، E_ALL)', phpNoise.length === 0, phpNoise.slice(0, 3).join(' | '));

section('پیوند منو و فایل‌ها');
const adminPages = fs.readdirSync(`${ROOT}/admin`).filter((n) => n.endsWith('.php') && /href="notifications\.php"/.test(read(`admin/${n}`)));
const missingNav = adminPages.filter((n) => !/href="places\.php"/.test(read(`admin/${n}`)));
ok(`پیوند «اماکن شهری» در منوی همه‌ی ${adminPages.length} صفحه‌ی پنل هست`, adminPages.length >= 25 && missingNav.length === 0, missingNav.join(', '));
ok('shared/places_store.php از وب بسته است (پوشه‌ی shared در .htaccess)', /RedirectMatch 404 \^\/\.\*\/\(data\|shared\|/.test(read('.htaccess')));
ok('هیچ‌جا از توابع PHP 8 به بعد (str_contains/match/?->) استفاده نشده — هاست‌های PHP 7.4 هم کار می‌کنند',
  ['shared/places_store.php', 'api/places.php', 'admin/places.php'].every((rel) => !/\bstr_contains\(|\bstr_starts_with\(|\bstr_ends_with\(|\bmatch\s*\(|\?->/.test(read(rel).replace(/\/\*[\s\S]*?\*\//g, ''))));

console.log('\n====================================================');
console.log(`PLACESADMIN: ${pass} passed, ${fail} failed`);
console.log('====================================================');
process.exit(fail ? 1 : 0);
