/* ads.test.mjs — «مدیریت تبلیغاتِ اپ»: سه جای بنر، چند تصویرِ چرخشی، لینک، آمار
   ============================================================================
   خواسته‌ی کارفرما:
     • «تمام بخش تبلیغات رو بتونیم تغییر بدم و حذف کنم یا اضافه کنم»
     • «اگر دو یا سه تا تصویر هم گذاشتم تصاویر به ترتیب نمایش داده بشه و عوض بشن»
     • «جای گذاشتن لینک هم داشته باشه» — لینک در مرورگر گوشی باز شود
     • «آمار کلیک در پنل» — و فقط مدیر کل به این بخش دسترسی داشته باشد
     • تبلیغات «طبق تبلیغاتی که داخل اپ هست» باشد ⇒ همان سه جای بنرِ موجود

   چه چیزی واقعاً اجرا می‌شود (نه متن‌کاوی):
     ۱) PHP واقعی (php-wasm) با دیتابیسِ SQLite تازه: ساخت جدول ads/ads_clicks،
        درجِ سه بنرِ پیش‌فرض (همان تصویرهای فعلیِ اپ).
     ۲) تابع‌های shared/ads.php: اعتبارسنجی، نشانی مطلق تصویر، لینکِ مجاز،
        CRUD، ترتیب (move)، حذف (با پاک کردنِ فایلِ آپلودشده و نه assets/)،
        ثبتِ کلیک و ضدِ تورم، آمارِ کلیک.
     ۳) api/ads.php با درخواستِ HTTP واقعی: JSON، سه جای بنر، فیلتر، کلیک،
        «هرگز ۵۰۰ نشدن» وقتی جدول نیست، و بیرون نرفتنِ لینکِ نامعتبر.
     ۴) admin/ads.php با نشستِ واقعی: ورود، CSRF، ساخت/ویرایش/ترتیب/وضعیت/حذف،
        فرارِ XSS، و ۴۰۳ برای مدیرِ حوزه/معاونت.
     ۵) اپ واقعی (jsdom): index.html + modules/ads.js — چرخشِ تصویرها به ترتیب،
        نقطه‌های ناوبری، کشیدنِ انگشت، باز کردنِ لینک با پلِ اندروید، ثبتِ کلیک،
        و «بنر ثابتِ داخل بسته» وقتی تبلیغی نیست/سرور در دسترس نیست.
     ۶) قراردادِ کد و مستندات.

   اجرا:  bash tools/dev/run-regression.sh ads
*/
import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import fs from 'fs';
import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const SHIM = '/tmp/eplak-regression-ads-shim';
const DB = '/tmp/eplak-regression-ads.sqlite';
const PREPEND = '/tmp/eplak-regression-ads.prepend.php';
if (fs.existsSync(DB)) fs.unlinkSync(DB);

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
const handler = new PHPRequestHandler({ php, documentRoot: SHIM, absoluteUrl: 'http://127.0.0.1:8098' });

/* ── ابزارهای HTTP ── */
const enc = new TextEncoder();
const newJar = () => ({});
const absorb = (jar, res) => {
  const sc = res.headers['set-cookie'];
  for (const c of (Array.isArray(sc) ? sc : sc ? [sc] : [])) {
    const [pair] = String(c).split(';'); const i = pair.indexOf('=');
    jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
};
const phpNoise = [];
async function req(method, url, jar, form) {
  const headers = {};
  let body;
  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = enc.encode(new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])).toString());
  }
  if (jar && Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await handler.request({ url, method, headers, body });
  if (jar) absorb(jar, res);
  const text = String(res.text);
  const noise = text.match(/(?:<b>)?(?:Warning|Notice|Deprecated|Fatal error|Parse error|Uncaught)(?:<\/b>)?:?\s[^\n]{0,160}/);
  if (noise) phpNoise.push(`${method} ${url} → ${noise[0]}`);
  let json = null; try { json = JSON.parse(text); } catch (e) { /* HTML */ }
  return { status: res.httpStatusCode, headers: res.headers, text, json };
}
const client = (jar) => ({ get: (u) => req('GET', u, jar), post: (u, f) => req('POST', u, jar, f) });
const csrfOf = (html) => (String(html).match(/name="_token" value="([a-f0-9]+)"/) || [])[1] || '';
const loc = (r) => String((Array.isArray(r.headers.location) ? r.headers.location[0] : r.headers.location) || '');
async function submit(cl, page, fields) {
  const form = await cl.get(page);
  return cl.post(page, Object.assign({ _token: csrfOf(form.text) }, fields));
}
const phpRun = async (code, server = {}) => {
  /* نکته: از ROOT بار می‌کنیم (نه SHIM)؛ وگرنه وقتی rawApi فایلِ api/ads.php را
     از ROOT صدا می‌زند، db.php از دو مسیرِ مختلف require_once می‌شود و
     «Cannot redeclare» می‌گیرد. SHIM فقط documentRootِ درخواست‌های HTTP است. */
  const srv = Object.assign({
    REQUEST_METHOD: 'GET',
    SCRIPT_NAME: '/eplak-fixed/api/ads.php',
    PHP_SELF: '/eplak-fixed/api/ads.php',
    HTTP_HOST: 'eplak.test',
    HTTPS: 'on',
    REMOTE_ADDR: '203.0.113.9',
  }, server);
  return String((await php.run({
    code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path','/tmp'); `
      + `$_SERVER = array_merge($_SERVER, ${phpVal(srv)}); `
      + `require_once '${ROOT}/admin/includes/db.php'; require_once '${ROOT}/shared/ads.php'; `
      + `require_once '${ROOT}/admin/includes/functions.php'; ${code}`,
  })).text);
};
const grab = (text) => { const m = String(text).split('<<<')[1]; if (m === undefined) throw new Error('خروجی PHP: ' + String(text).slice(0, 500)); return JSON.parse(m.split('>>>')[0]); };
const one = async (code, server) => grab(await phpRun(`echo '<<<' . json_encode([${code}]) . '>>>';`, server))[0];
const has = (html, needle) => String(html).includes(needle);
const phpVal = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  if (Array.isArray(v)) return '[' + v.map(phpVal).join(', ') + ']';
  return '[' + Object.keys(v).map((k) => phpVal(k) + ' => ' + phpVal(v[k])).join(', ') + ']';
};
const pickJson = (text) => {
  const m = String(text).match(/\{[\s\S]*\}/g);
  if (!m) return null;
  for (let i = m.length - 1; i >= 0; i--) { try { return JSON.parse(m[i]); } catch (e) { /* بعدی */ } }
  return null;
};
/* اجرای مستقیم یک فایلِ API (مثل news.test.mjs) — برای اپِ jsdom */
const rawApi = (script, opts = {}) => phpRun(
  `$_GET = ${phpVal(opts.get || {})}; $_POST = ${phpVal(opts.post || {})}; `
  + `$_SERVER['REQUEST_METHOD'] = ${phpVal(opts.method || 'GET')}; `
  + `require '${ROOT}/${script}';`,
  opts.server || {});

/* ══════════════════════════════════════════════════════════════════
   ۱) قراردادِ ساختار و کد
   ══════════════════════════════════════════════════════════════════ */
section('۱) ساختار: جدول‌ها، نسخه‌ی اسکیما، و سیم‌کشی اپ');
const bootstrap = read('shared/bootstrap.php');
const adsLib = read('shared/ads.php');
const adsApi = read('api/ads.php');
const adsAdmin = read('admin/ads.php');
const adsModule = read('modules/ads.js');
const adsCss = read('assets/css/ads.css');
const indexHtml = read('index.html');
const acl = read('admin/includes/acl.php');

ok('جدول ads در هر دو درایور تعریف شده است',
  (bootstrap.match(/CREATE TABLE IF NOT EXISTS ads \(/g) || []).length === 2);
ok('جدول لاگِ کلیک (ads_clicks) در هر دو درایور تعریف شده است',
  (bootstrap.match(/CREATE TABLE IF NOT EXISTS ads_clicks \(/g) || []).length === 2);
ok('ایندکسِ جای بنر برای خواندنِ سریعِ اپ ساخته می‌شود (هر دو درایور)',
  (bootstrap.match(/idx_ads_placement ON ads\(placement, is_active, sort_order\)/g) || []).length === 2);
ok('ستون‌های لازمِ ads تعریف شده‌اند (placement/title/image_path/image_webp/link_url/sort_order/is_active/click_count)',
  ['placement VARCHAR(30)', 'image_path VARCHAR(500)', 'image_webp VARCHAR(500)', 'link_url VARCHAR(700)',
    'sort_order', 'is_active', 'click_count'].every((needle) => bootstrap.includes(needle)));
ok('bootstrap فایلِ تبلیغات را بار می‌کند و بنرهای پیش‌فرض را در هر دو درایور درج می‌کند',
  bootstrap.includes("require_once __DIR__ . '/ads.php';")
  && (bootstrap.match(/eplakSeedDefaultAds\(\$pdo\);/g) || []).length === 2);
ok('نسخه‌ی اسکیما بالا رفته است (تا دیتابیس قدیمیِ هاست همگام شود)',
  /EPLAK_SCHEMA_VERSION', '2026-11-02\.2'/.test(bootstrap)
  && read('tools/dev/tests/app.test.mjs').includes('2026-11-02\\.2')
  && read('tools/dev/tests/geo.test.mjs').includes('2026-11-02\\.2'));
ok('سه جای بنر دقیقاً همان سه بنرِ موجودِ اپ است',
  adsLib.includes("define('EPLAK_ADS_PLACEMENTS', 'home_top,home_mid,dash_slim')")
  && (indexHtml.match(/data-ad-placement="(home_top|home_mid|dash_slim)"/g) || []).length === 3);
ok('اپ: شناسه‌ی سه جای بنر + فایلِ ماژول و پوسته‌ی تبلیغات با کش‌باستر بار می‌شوند',
  indexHtml.includes('id="adSlotHomeTop"') && indexHtml.includes('id="adSlotHomeMid"') && indexHtml.includes('id="adSlotDashSlim"')
  && /modules\/ads\.js\?v=\d+/.test(indexHtml) && /assets\/css\/ads\.css\?v=\d+/.test(indexHtml));
ok('بنرهای ثابتِ قبلی به‌عنوان نسخه‌ی پشتیبان سرِ جایشان هستند (حذف نشده‌اند)',
  indexHtml.includes('assets/img/ad-haji.webp') && indexHtml.includes('assets/img/ad-ibatri-top.webp') && indexHtml.includes('assets/img/ad-slim.webp'));
ok('کلیکِ inline بنر فقط وقتی تبلیغِ سرور «نیست» رفتار قبلی را اجرا می‌کند (پیام دوباره نمی‌شود)',
  (indexHtml.match(/EplakAds &amp;&amp; window\.EplakAds\.isActive\('(home_top|home_mid|dash_slim)'\)/g) || []).length === 3);
ok('منوی پنل، «تبلیغات» را فقط با مجوزِ ads نشان می‌دهد (مدیر کل)',
  /'key' => 'ads',\s+'href' => 'ads\.php'.*'perm' => 'ads'/.test(acl.replace(/\s+/g, ' '))
  && acl.includes("'ads'            => 'مدیریت تبلیغات'"));
ok('پوسته‌ی بنرِ چرخشی جدا از پوسته‌ی اصلی است (کشِ کلِ اپ باطل نشود)',
  adsCss.includes('.ead-track') && adsCss.includes('.ead-dots') && adsCss.includes('prefers-reduced-motion')
  && !read('assets/css/style.css').includes('.ead-track'));

/* ══════════════════════════════════════════════════════════════════
   ۲) دیتابیس تازه + بنرهای پیش‌فرض
   ══════════════════════════════════════════════════════════════════ */
section('۲) دیتابیس تازه: جدول‌ها ساخته و بنرهای فعلیِ اپ درج می‌شوند');
const fresh = grab(await phpRun(`
$adsCols = $pdo->query('PRAGMA table_info(ads)')->fetchAll(PDO::FETCH_COLUMN, 1);
$clickCols = $pdo->query('PRAGMA table_info(ads_clicks)')->fetchAll(PDO::FETCH_COLUMN, 1);
$rows = $pdo->query('SELECT placement, title, image_path, image_webp, link_url, sort_order, is_active, click_count FROM ads ORDER BY placement')->fetchAll(PDO::FETCH_ASSOC);
$idx = $pdo->query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('ads','ads_clicks')")->fetchAll(PDO::FETCH_COLUMN);
echo '<<<' . json_encode([
  'adsCols' => $adsCols, 'clickCols' => $clickCols, 'rows' => $rows, 'idx' => $idx,
  'seeded' => (string) eplakAppSetting($pdo, 'ads_seeded', ''),
  'version' => (string) eplakAppSetting($pdo, 'schema_version', ''),
]) . '>>>';`));

ok('جدول ads با همه‌ی ستون‌ها ساخته شد',
  ['id', 'placement', 'title', 'alt_text', 'image_path', 'image_webp', 'link_url', 'sort_order', 'is_active', 'click_count', 'created_at', 'updated_at']
    .every((c) => fresh.adsCols.includes(c)), JSON.stringify(fresh.adsCols));
ok('جدول ads_clicks ساخته شد (ad_id, ip_hash, user_agent, created_at)',
  ['id', 'ad_id', 'ip_hash', 'user_agent', 'created_at'].every((c) => fresh.clickCols.includes(c)), JSON.stringify(fresh.clickCols));
ok('ایندکس‌های ads و ads_clicks ساخته شدند',
  fresh.idx.includes('idx_ads_placement') && fresh.idx.includes('idx_ads_clicks_ad'), JSON.stringify(fresh.idx));
ok('سه بنرِ پیش‌فرض = همان سه بنرِ فعلیِ اپ (یکی برای هر جای بنر)',
  fresh.rows.length === 3
  && fresh.rows.some((r) => r.placement === 'home_top' && /ad-haji/.test(r.image_path))
  && fresh.rows.some((r) => r.placement === 'home_mid' && /ad-ibatri-top/.test(r.image_path))
  && fresh.rows.some((r) => r.placement === 'dash_slim' && /ad-slim/.test(r.image_path)), JSON.stringify(fresh.rows));
ok('بنرهای پیش‌فرض فعال‌اند، لینک ندارند و نسخه‌ی webp هم دارند',
  fresh.rows.every((r) => Number(r.is_active) === 1 && r.link_url === '' && /\.webp$/.test(r.image_webp)));
ok('نشانه‌ی «یک‌بار درج شدن» ثبت شد تا با پاک کردنِ مدیر، بنرها برنگردند',
  fresh.seeded === '1' && fresh.version === '2026-11-02.2', `${fresh.seeded}/${fresh.version}`);
const reseed = grab(await phpRun(`eplakSeedDefaultAds($pdo); echo '<<<' . json_encode([(int) $pdo->query('SELECT COUNT(*) FROM ads')->fetchColumn()]) . '>>>';`))[0];
ok('درجِ دوباره‌ی بنرهای پیش‌فرض، تکراری نمی‌سازد', reseed === 3, String(reseed));

/* ══════════════════════════════════════════════════════════════════
   ۳) قاعده‌های shared/ads.php
   ══════════════════════════════════════════════════════════════════ */
section('۳) قاعده‌ها: لینکِ مجاز، نشانیِ تصویر، اعتبارسنجی فرم');
const rules = grab(await phpRun(`
echo '<<<' . json_encode([
  'link_ok'      => [eplakAdLinkAllowed(''), eplakAdLinkAllowed('https://eplak.ir'), eplakAdLinkAllowed('http://a.b/c?x=1&y=2')],
  'link_bad'     => [eplakAdLinkAllowed('javascript:alert(1)'), eplakAdLinkAllowed('data:text/html,<script>'), eplakAdLinkAllowed('ftp://x'),
                     eplakAdLinkAllowed('//evil.test'), eplakAdLinkAllowed('https://a.test/ b'), eplakAdLinkAllowed(str_repeat('a', 701))],
  'img_assets'   => eplakAdsAbsoluteImage('assets/img/ad-haji.jpg'),
  'img_upload'   => eplakAdsAbsoluteImage('uploads/ads/2026/11/x.jpg'),
  'img_remote'   => eplakAdsAbsoluteImage('https://cdn.test/a.jpg'),
  'img_empty'    => eplakAdsAbsoluteImage(''),
  'placement'    => [eplakAdsNormalizePlacement('home_top'), eplakAdsNormalizePlacement(' HOME_MID '), eplakAdsNormalizePlacement('sidebar'), eplakAdsNormalizePlacement('')],
  'labels'       => [eplakAdsPlacementLabel('home_top'), eplakAdsPlacementLabel('home_mid'), eplakAdsPlacementLabel('dash_slim')],
  'hash'         => [strlen(eplakAdsHashIp('1.2.3.4')), eplakAdsHashIp('1.2.3.4') === eplakAdsHashIp('1.2.3.4'), eplakAdsHashIp('1.2.3.4') !== eplakAdsHashIp('5.6.7.8'), eplakAdsHashIp('1.2.3.4') !== '1.2.3.4'],
]) . '>>>';`));
ok('لینکِ خالی و http/https پذیرفته می‌شوند', rules.link_ok.every((v) => v === true), JSON.stringify(rules.link_ok));
ok('لینکِ نامردم‌نشین (javascript:/data:/ftp:// بدون scheme/فاصله/خیلی بلند) رد می‌شود',
  rules.link_bad.every((v) => v === false), JSON.stringify(rules.link_bad));
ok('تصویرِ assets/… نسبی می‌ماند تا آفلاین هم کار کند', rules.img_assets === 'assets/img/ad-haji.jpg', rules.img_assets);
ok('تصویرِ آپلودشده با نشانیِ مطلقِ سرور به اپ می‌رسد',
  rules.img_upload === 'https://eplak.test/eplak-fixed/uploads/ads/2026/11/x.jpg', rules.img_upload);
ok('نشانیِ بیرونیِ تصویر دست‌نخورده می‌ماند و رشته‌ی خالی، خالی برمی‌گردد',
  rules.img_remote === 'https://cdn.test/a.jpg' && rules.img_empty === '');
ok('جای بنرِ نامعتبر رد می‌شود (فقط همان سه جای بنر)',
  rules.placement[0] === 'home_top' && rules.placement[1] === 'home_mid' && rules.placement[2] === '' && rules.placement[3] === '',
  JSON.stringify(rules.placement));
ok('هر سه جای بنر برچسبِ فارسیِ روشن دارند',
  /خانه/.test(rules.labels[0]) && /خانه/.test(rules.labels[1]) && /داشبورد/.test(rules.labels[2]), JSON.stringify(rules.labels));
ok('IP برای آمار «هش» می‌شود (پایدار، یکتا، و نه خام)',
  rules.hash[0] === 32 && rules.hash[1] === true && rules.hash[2] === true && rules.hash[3] === true, JSON.stringify(rules.hash));

const validation = grab(await phpRun(`
$base = ['placement' => 'home_top', 'title' => 'تبلیغ آزمون', 'image_path' => 'uploads/ads/2026/11/a.jpg', 'link_url' => 'https://a.test', 'sort_order' => 3, 'is_active' => 1];
$cases = [
  'ok'         => eplakAdsValidateInput($base),
  'no_place'   => eplakAdsValidateInput(array_merge($base, ['placement' => 'sidebar'])),
  'no_title'   => eplakAdsValidateInput(array_merge($base, ['title' => '   '])),
  'long_title' => eplakAdsValidateInput(array_merge($base, ['title' => str_repeat('ا', 256)])),
  'no_image'   => eplakAdsValidateInput(array_merge($base, ['image_path' => ''])),
  'traversal'  => eplakAdsValidateInput(array_merge($base, ['image_path' => '../../etc/passwd'])),
  'bad_link'   => eplakAdsValidateInput(array_merge($base, ['link_url' => 'javascript:alert(1)'])),
  'no_link'    => eplakAdsValidateInput(array_merge($base, ['link_url' => ''])),
  'inactive'   => eplakAdsValidateInput(array_merge($base, ['is_active' => 0])),
  'big_order'  => eplakAdsValidateInput(array_merge($base, ['sort_order' => 999999])),
];
echo '<<<' . json_encode($cases) . '>>>';`));
ok('ورودیِ درست پذیرفته و پاک‌سازی می‌شود', validation.ok.ok === true && validation.ok.data.placement === 'home_top'
  && validation.ok.data.is_active === 1 && validation.ok.data.sort_order === 3);
ok('جای بنرِ نامعتبر، عنوانِ خالی/بلند، تصویرِ خالی و مسیرِ بالارونده رد می‌شوند (با پیامِ فارسی)',
  ['no_place', 'no_title', 'long_title', 'no_image', 'traversal'].every((k) => validation[k].ok === false && validation[k].error !== ''),
  JSON.stringify(Object.keys(validation).filter((k) => validation[k].ok !== false)));
ok('لینکِ javascript: رد می‌شود ولی «بدون لینک» مجاز است',
  validation.bad_link.ok === false && validation.no_link.ok === true && validation.no_link.data.link_url === '');
ok('غیرفعال و ترتیبِ بزرگ، sane می‌شوند (نه خطا)',
  validation.inactive.data.is_active === 0 && validation.big_order.data.sort_order === 9999);

/* ══════════════════════════════════════════════════════════════════
   ۴) CRUD و ترتیب
   ══════════════════════════════════════════════════════════════════ */
section('۴) افزودن/ویرایش/غیرفعال/ترتیب/حذف');
const crud = grab(await phpRun(`
$out = [];
$c1 = eplakAdsCreate($pdo, eplakAdsValidateInput(['placement' => 'home_mid', 'title' => 'بنر دوم', 'image_path' => 'uploads/ads/2026/11/b.jpg', 'link_url' => 'https://b.test', 'sort_order' => 2, 'is_active' => 1])['data']);
$c2 = eplakAdsCreate($pdo, eplakAdsValidateInput(['placement' => 'home_mid', 'title' => 'بنر سوم', 'image_path' => 'uploads/ads/2026/11/c.jpg', 'link_url' => '', 'sort_order' => 3, 'is_active' => 1])['data']);
$out['created'] = [(int) $c1['id'], (int) $c2['id'], $c1['error'], $c2['error']];

/* ترتیبِ home_mid پیش از جابه‌جایی */
$order = function () use ($pdo) {
    $st = $pdo->query("SELECT title FROM ads WHERE placement='home_mid' ORDER BY sort_order, id");
    return $st->fetchAll(PDO::FETCH_COLUMN);
};
$out['before'] = $order();
$out['move_up_err'] = eplakAdsMove($pdo, (int) $pdo->query("SELECT id FROM ads WHERE placement='home_mid' ORDER BY sort_order, id LIMIT 1")->fetchColumn(), -1);
$out['moved'] = eplakAdsMove($pdo, $c2['id'] === null ? 0 : (int) $c2['id'], -1);
$out['after_up'] = $order();
$out['moved_down'] = eplakAdsMove($pdo, (int) $c2['id'], 1);
$out['after_down'] = $order();
$out['renumbered'] = $pdo->query("SELECT sort_order FROM ads WHERE placement='home_mid' ORDER BY sort_order")->fetchAll(PDO::FETCH_COLUMN);

/* ویرایش */
$u = eplakAdsUpdate($pdo, (int) $c1['id'], eplakAdsValidateInput(['placement' => 'home_mid', 'title' => 'بنر دومِ ویرایش‌شده', 'image_path' => 'uploads/ads/2026/11/b2.jpg', 'link_url' => 'https://b2.test', 'sort_order' => 2, 'is_active' => 1])['data']);
$row = eplakAdsGetById($pdo, (int) $c1['id']);
$out['updated'] = [$u['ok'], $u['error'], $row['title'], $row['image_path'], $row['link_url']];
$out['update_missing'] = eplakAdsUpdate($pdo, 999999, ['title' => 'x']);

/* غیرفعال کردن */
$out['deactivate'] = eplakAdsSetActive($pdo, (int) $c1['id'], false);
$out['is_active'] = (int) eplakAdsGetById($pdo, (int) $c1['id'])['is_active'];
$out['activate'] = eplakAdsSetActive($pdo, (int) $c1['id'], true);
$out['toggle_missing'] = eplakAdsSetActive($pdo, 999999, true);

/* حذف: فایلِ آپلودشده پاک می‌شود، فایلِ assets/… نه */
@mkdir('${ROOT}/uploads/ads', 0777, true);
file_put_contents('${ROOT}/uploads/ads/delete-me.jpg', 'x');
$dup = eplakAdsCreate($pdo, ['placement' => 'dash_slim', 'title' => 'حذف‌شدنی', 'image_path' => 'uploads/ads/delete-me.jpg', 'sort_order' => 9, 'is_active' => 1]);
$pdo->prepare('INSERT INTO ads_clicks (ad_id, ip_hash, created_at) VALUES (?, ?, ?)')->execute([(int) $dup['id'], eplakAdsHashIp('9.9.9.9'), eplakDbNowString($pdo)]);
$out['delete'] = eplakAdsDelete($pdo, (int) $dup['id']);
$out['deleted_row'] = eplakAdsGetById($pdo, (int) $dup['id']) === null;
$out['uploaded_file_gone'] = !file_exists('${ROOT}/uploads/ads/delete-me.jpg');
$out['click_rows_gone'] = (int) $pdo->query('SELECT COUNT(*) FROM ads_clicks WHERE ad_id = ' . (int) $dup['id'])->fetchColumn() === 0;
/* تبلیغی با تصویرِ assets/… می‌سازیم و همان را حذف می‌کنیم (به بنرِ پیش‌فرضِ
   home_top دست نمی‌زنیم تا بخش‌های بعدی داده‌ی شناخته‌شده داشته باشند) */
$assetAd = eplakAdsCreate($pdo, ['placement' => 'home_top', 'title' => 'با تصویرِ assets', 'alt_text' => '', 'image_path' => 'assets/img/ad-haji.jpg', 'image_webp' => '', 'link_url' => '', 'sort_order' => 9, 'is_active' => 1, 'click_count' => 0]);
$out['seeded_top_intact'] = (int) $pdo->query("SELECT COUNT(*) FROM ads WHERE placement='home_top' AND image_path LIKE 'assets/img/ad-haji%'")->fetchColumn() >= 1;
$out['delete_assets_ad'] = eplakAdsDelete($pdo, (int) $assetAd['id']);
$out['asset_file_intact'] = file_exists('${ROOT}/assets/img/ad-haji.jpg');
$out['delete_missing'] = eplakAdsDelete($pdo, 999999);
echo '<<<' . json_encode($out) . '>>>';`));

ok('دو تبلیغ تازه ساخته شدند', crud.created[0] > 0 && crud.created[1] > 0 && crud.created[2] === '' && crud.created[3] === '', JSON.stringify(crud.created));
ok('ترتیبِ نمایش همان sort_order است', crud.before.join('|') === 'آی‌باتری - ibatri|بنر دوم|بنر سوم', crud.before.join('|'));
ok('جابه‌جایی به بالا در ابتدای فهرست، خطای فارسی می‌دهد (نه شکستِ ساکت)',
  crud.move_up_err !== '' && /اولِ/.test(crud.move_up_err), crud.move_up_err);
ok('«یک پله بالا» جای دو تصویر را عوض می‌کند', crud.moved === '' && crud.after_up.join('|') === 'آی‌باتری - ibatri|بنر سوم|بنر دوم', crud.after_up.join('|'));
ok('«یک پله پایین» برش می‌گرداند', crud.moved_down === '' && crud.after_down.join('|') === 'آی‌باتری - ibatri|بنر دوم|بنر سوم', crud.after_down.join('|'));
ok('شماره‌های ترتیب پیوسته و از ۱ بازنویسی می‌شوند (ترتیبِ شکسته خودترمیم است)',
  crud.renumbered.map(Number).join(',') === '1,2,3', JSON.stringify(crud.renumbered));
ok('ویرایش، عنوان/تصویر/لینک را عوض می‌کند', crud.updated[0] === true && crud.updated[2] === 'بنر دومِ ویرایش‌شده'
  && crud.updated[3] === 'uploads/ads/2026/11/b2.jpg' && crud.updated[4] === 'https://b2.test', JSON.stringify(crud.updated));
ok('ویرایش/تغییر وضعیت/حذفِ تبلیغِ نبوده، پیامِ فارسی می‌دهد',
  crud.update_missing.ok === false && crud.toggle_missing !== '' && crud.delete_missing !== '');
ok('غیرفعال و فعال‌کردن کار می‌کند', crud.deactivate === '' && crud.is_active === 0 && crud.activate === '');
ok('حذف، فایلِ «آپلودشده» را پاک می‌کند و لاگِ کلیکهایش را هم',
  crud.delete === '' && crud.deleted_row === true && crud.uploaded_file_gone === true && crud.click_rows_gone === true);
ok('حذفِ تبلیغی با تصویرِ assets/… به فایلِ داخل بسته‌ی اپ دست نمی‌زند',
  crud.delete_assets_ad === '' && crud.asset_file_intact === true && crud.seeded_top_intact === true,
  JSON.stringify([crud.delete_assets_ad, crud.asset_file_intact, crud.seeded_top_intact]));

/* ══════════════════════════════════════════════════════════════════
   ۵) آمارِ کلیک و ضدِ تورم
   ══════════════════════════════════════════════════════════════════ */
section('۵) آمار کلیک: شمرده می‌شود، باد نمی‌کند، IP خام ذخیره نمی‌شود');
const targetId = await one(`(int) $pdo->query("SELECT id FROM ads WHERE placement='home_top' LIMIT 1")->fetchColumn()`);
const clicks = grab(await phpRun(`
$id = ${targetId};
$out = [];
$out['first']  = eplakAdsRegisterClick($pdo, $id, '1.2.3.4', 'Mozilla/5.0 (Test)');
$out['second'] = eplakAdsRegisterClick($pdo, $id, '1.2.3.4', 'Mozilla/5.0 (Test)');
$out['other']  = eplakAdsRegisterClick($pdo, $id, '5.6.7.8', 'Mozilla/5.0 (Other)');
$out['missing'] = eplakAdsRegisterClick($pdo, 999999, '1.2.3.4');
$out['zero']    = eplakAdsRegisterClick($pdo, 0, '1.2.3.4');
$inactiveId = (int) $pdo->query("SELECT id FROM ads WHERE is_active = 0 LIMIT 1")->fetchColumn();
$out['inactive_id'] = $inactiveId;
$out['inactive'] = $inactiveId > 0 ? eplakAdsRegisterClick($pdo, $inactiveId, '1.2.3.4') : null;
$out['counter'] = (int) $pdo->query('SELECT click_count FROM ads WHERE id = ' . $id)->fetchColumn();
$out['stats']   = eplakAdsClickStats($pdo, [$id]);
$out['raw_ip_stored'] = (int) $pdo->query("SELECT COUNT(*) FROM ads_clicks WHERE ip_hash IN ('1.2.3.4','5.6.7.8')")->fetchColumn();
$out['ua_stored'] = (string) $pdo->query('SELECT user_agent FROM ads_clicks LIMIT 1')->fetchColumn();
echo '<<<' . json_encode($out) . '>>>';`));

ok('اولین کلیک شمرده می‌شود', clicks.first.counted === true && clicks.first.total === 1, JSON.stringify(clicks.first));
ok('کلیکِ دوباره‌ی همان IP در فاصله‌ی کوتاه شمرده نمی‌شود (ضدِ تورمِ آمار)',
  clicks.second.counted === false && clicks.second.reason === 'throttled', JSON.stringify(clicks.second));
ok('کلیک از IP دیگر شمرده می‌شود', clicks.other.counted === true && clicks.other.total === 2, JSON.stringify(clicks.other));
ok('تبلیغِ نبوده و شناسه‌ی صفر شمرده نمی‌شوند', clicks.missing.counted === false && clicks.missing.reason === 'not_found'
  && clicks.zero.counted === false && clicks.zero.reason === 'not_found');
ok('کلیک روی تبلیغِ غیرفعال شمرده نمی‌شود',
  clicks.inactive === null || (clicks.inactive.counted === false && clicks.inactive.reason === 'inactive'), JSON.stringify(clicks.inactive));
ok('شمارنده‌ی جدول با آمارِ لاگ یکی است', clicks.counter === 2, String(clicks.counter));
ok('آمارِ پنل: تعداد، IPِ یکتا و آخرین کلیک',
  clicks.stats[targetId] && clicks.stats[targetId].count === 2 && clicks.stats[targetId].ips === 2 && /^\d{4}-\d{2}-\d{2}/.test(clicks.stats[targetId].last),
  JSON.stringify(clicks.stats));
ok('IP خام هیچ‌جا ذخیره نمی‌شود (فقط هش) و user-agent برای عیب‌یابی هست',
  clicks.raw_ip_stored === 0 && /Mozilla/.test(clicks.ua_stored), `${clicks.raw_ip_stored} · ${clicks.ua_stored}`);

/* ══════════════════════════════════════════════════════════════════
   ۶) api/ads.php — آنچه اپ می‌خواند
   ══════════════════════════════════════════════════════════════════ */
section('۶) api/ads.php — JSON، سه جای بنر، فیلتر، کلیک، هرگز ۵۰۰');
const apiRaw = await rawApi('api/ads.php');
const apiJson = pickJson(apiRaw);
ok('پاسخ سالم JSON است (بدون HTML/خطای SQL/۵۰۰)',
  !!apiJson && !/^\s*</.test(apiRaw) && !/Fatal error|Warning:|SQLSTATE|no such column/.test(apiRaw), apiRaw.slice(0, 200));
ok('success=true و هر سه جای بنر در پاسخ هست (حتی اگر خالی باشند)',
  apiJson.success === true && apiJson.placements
  && ['home_top', 'home_mid', 'dash_slim'].every((p) => Array.isArray(apiJson.placements[p])), JSON.stringify(Object.keys(apiJson.placements || {})));
ok('تصویرهای assets/… نسبی می‌مانند تا آفلاین هم دیده شوند',
  (apiJson.placements.home_top || []).some((a) => a.image === 'assets/img/ad-haji.jpg' && a.webp === 'assets/img/ad-haji.webp'),
  JSON.stringify(apiJson.placements.home_top));
ok('تصویرِ آپلودشده با نشانیِ مطلقِ سرور برمی‌گردد (اپ از file:// باز می‌شود)',
  (apiJson.placements.home_mid || []).some((a) => /^https:\/\/eplak\.test\/eplak-fixed\/uploads\/ads\//.test(a.image)),
  JSON.stringify((apiJson.placements.home_mid || []).map((a) => a.image)));
ok('لینک‌ها و ترتیب همان‌طور که در پنل هست برمی‌گردد',
  (apiJson.placements.home_mid || []).map((a) => a.link).join('|') === '|https://b2.test|'
  && (apiJson.placements.home_mid || []).map((a) => a.title).join('|') === 'آی‌باتری - ibatri|بنر دومِ ویرایش‌شده|بنر سوم',
  JSON.stringify((apiJson.placements.home_mid || []).map((a) => [a.title, a.link])));
ok('اثر انگشت (v) و ساعتِ سرور برای کشِ اپ برمی‌گردد',
  typeof apiJson.v === 'string' && apiJson.v.length === 12 && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(apiJson.server_time)),
  `${apiJson.v} · ${apiJson.server_time}`);
ok('هر تبلیغ شناسه، عنوان، alt و تصویر دارد (alt از عنوان می‌آید اگر خالی باشد)',
  Object.values(apiJson.placements).flat().every((a) => Number(a.id) > 0 && a.title !== '' && a.alt !== '' && a.image !== ''));

const filteredRaw = await rawApi('api/ads.php', { get: { placement: 'dash_slim' } });
const filtered = pickJson(filteredRaw);
ok('فیلترِ placement فقط همان جای بنر را پر می‌کند',
  filtered.placements.dash_slim.length >= 1 && filtered.placements.home_top.length === 0 && filtered.placements.home_mid.length === 0
  && filtered.count === filtered.placements.dash_slim.length);
ok('جای بنرِ نامعتبر نادیده گرفته می‌شود (همه برمی‌گردند، نه خطا)',
  pickJson(await rawApi('api/ads.php', { get: { placement: 'sidebar' } })).placements.home_top.length >= 1);

const clickApi = pickJson(await rawApi('api/ads.php', { method: 'POST', post: { action: 'click', id: String(targetId) }, server: { REMOTE_ADDR: '198.51.100.7' } }));
ok('action=click از راه API کلیک را می‌شمارد', clickApi.success === true && clickApi.counted === true && clickApi.total === 3, JSON.stringify(clickApi));
const clickAgain = pickJson(await rawApi('api/ads.php', { method: 'POST', post: { action: 'click', id: String(targetId) }, server: { REMOTE_ADDR: '198.51.100.7' } }));
ok('کلیکِ پیاپیِ همان IP از راه API شمرده نمی‌شود ولی خطا هم نمی‌دهد',
  clickAgain.success === true && clickAgain.counted === false && clickAgain.reason === 'throttled', JSON.stringify(clickAgain));
const clickBad = pickJson(await rawApi('api/ads.php', { method: 'POST', post: { action: 'click', id: 'abc' } }));
ok('شناسه‌ی نامعتبر ⇒ bad_id (بدون ۵۰۰، بدون شمارش)', clickBad.success === false && clickBad.reason === 'bad_id', JSON.stringify(clickBad));
const clickMissing = pickJson(await rawApi('api/ads.php', { method: 'POST', post: { action: 'click', id: '999999' } }));
ok('تبلیغِ نبوده ⇒ counted=false و reason=not_found', clickMissing.success === true && clickMissing.counted === false && clickMissing.reason === 'not_found');

/* لینکِ نامعتبری که «مستقیم» در دیتابیس نشسته باشد هم نباید به اپ برود */
await phpRun(`$pdo->prepare('UPDATE ads SET link_url = ? WHERE id = ?')->execute(['javascript:alert(1)', ${targetId}]); echo 'ok';`);
const safeLink = pickJson(await rawApi('api/ads.php'));
ok('لینکِ نامعتبر (javascript:) هرگز به اپ فرستاده نمی‌شود',
  (safeLink.placements.home_top || []).every((a) => a.link === ''), JSON.stringify((safeLink.placements.home_top || []).map((a) => a.link)));
await phpRun(`$pdo->prepare('UPDATE ads SET link_url = ? WHERE id = ?')->execute(['https://eplak.ir/haji', ${targetId}]); echo 'ok';`);

/* جدول نباشد ⇒ ۲۰۰ با success=false و جای بنرهای خالی (اپ بنرِ ثابتِ خودش را نشان می‌دهد) */
/* نکته: bootstrap در هر درخواست جدولِ نبوده را می‌سازد؛ پس «جدول نیست» فقط در
   همان اجرا معنا دارد (در هاستِ واقعی وقتی رخ می‌دهد که کاربرِ دیتابیس اجازه‌ی
   CREATE نداشته باشد) ⇒ DROP و فراخوانیِ API در «یک» اجرا انجام می‌شود. */
const brokenRaw = await phpRun(`
$pdo->exec('DROP TABLE ads');
$pdo->exec('DROP TABLE ads_clicks');
$_GET = []; $_POST = []; $_SERVER['REQUEST_METHOD'] = 'GET';
require '${ROOT}/api/ads.php';`);
const broken = pickJson(brokenRaw);
ok('وقتی جدول تبلیغات نیست: ۲۰۰ + success=false + جای بنرهای خالی (نه ۵۰۰، نه HTML)',
  !!broken && broken.success === false && /^\s*</.test(brokenRaw) === false && !/Fatal error|Warning:/.test(brokenRaw)
  && ['home_top', 'home_mid', 'dash_slim'].every((p) => Array.isArray(broken.placements[p]) && broken.placements[p].length === 0)
  && (broken.degraded || []).includes('no_table') && /جدول تبلیغات/.test(String(broken.hint)), brokenRaw.slice(0, 220));
const brokenClick = pickJson(await phpRun(`
$pdo->exec('DROP TABLE IF EXISTS ads');
$_POST = ['action' => 'click', 'id' => '1']; $_GET = []; $_SERVER['REQUEST_METHOD'] = 'POST';
require '${ROOT}/api/ads.php';`));
ok('کلیک هم وقتی جدول نیست خطا نمی‌دهد', brokenClick && brokenClick.success === true && brokenClick.counted === false, JSON.stringify(brokenClick));

/* بازسازی: همان کاری که دکمه‌ی «ترمیم» پنل می‌کند (نشانه‌ی «یک‌بار درج شدن»
   فقط وقتی جدول «خالی» است برداشته می‌شود) */
const repaired = grab(await phpRun(`
eplakRunSchemaSync($pdo);
$count = (int) $pdo->query('SELECT COUNT(*) FROM ads')->fetchColumn();
if ($count === 0) { eplakSetAppSetting($pdo, 'ads_seeded', '0'); }
$rep = null;
$seeded = eplakSeedDefaultAds($pdo, $rep);
$rep2 = null;
$again = eplakSeedDefaultAds($pdo, $rep2);
echo '<<<' . json_encode([
  'seeded' => $seeded,
  'again'  => $again,
  'count'  => (int) $pdo->query('SELECT COUNT(*) FROM ads')->fetchColumn(),
]) . '>>>';`));
ok('«ترمیم ساختار» جدول را برمی‌گرداند و سه بنرِ پیش‌فرض دوباره درج می‌شوند (و بارِ دوم تکراری نمی‌سازد)',
  repaired.seeded === 3 && repaired.again === 0 && repaired.count === 3, JSON.stringify(repaired));
const noReseed = grab(await phpRun(`
$pdo->exec('DELETE FROM ads');   /* مدیر همه را پاک کرده است */
$rep = null;
$seeded = eplakSeedDefaultAds($pdo, $rep);
echo '<<<' . json_encode(['seeded' => $seeded, 'skipped' => $rep['skipped'] ?? '', 'count' => (int) $pdo->query('SELECT COUNT(*) FROM ads')->fetchColumn()]) . '>>>';`));
ok('اگر مدیر همه‌ی تبلیغ‌ها را عمداً پاک کرده باشد، بنرهای پیش‌فرض «خودبه‌خود» برنمی‌گردند',
  noReseed.seeded === 0 && noReseed.skipped === 'already_seeded' && noReseed.count === 0, JSON.stringify(noReseed));
await phpRun(`eplakSetAppSetting($pdo, 'ads_seeded', '0'); eplakSeedDefaultAds($pdo); echo 'ok';`);

/* ══════════════════════════════════════════════════════════════════
   ۷) admin/ads.php — پنل (HTTP واقعی + نشست)
   ══════════════════════════════════════════════════════════════════ */
section('۷) پنل ادمین: ورود، CSRF، افزودن، ترتیب، وضعیت، حذف، ۴۰۳');
const anon = await req('GET', '/admin/ads.php', newJar());
ok('بدون ورود ⇒ هدایت به صفحه‌ی ورود (نه محتوای پنل)',
  anon.status === 302 && /login\.php/.test(loc(anon)) && !has(anon.text, 'ad-create-panel'), `${anon.status} ${loc(anon)}`);

const SUP = newJar(); const sup = client(SUP);
await req('GET', '/admin/login.php', SUP);
let r = await req('POST', '/admin/login.php', SUP, { username: 'admin', password: 'admin123' });
ok('ورودِ مدیر کل', r.status === 302 && /index\.php/.test(loc(r)), `${r.status} ${loc(r)}`);

let page = await sup.get('/admin/ads.php');
ok('صفحه‌ی تبلیغات ۲۰۰ و بدون خطای PHP', page.status === 200 && !/Fatal error|Warning:/.test(page.text), String(page.status));
ok('بخش‌های صفحه هست: آمار، قاعده‌ها، فرمِ افزودن، فهرستِ سه جای بنر',
  ['ads-stats', 'ads-rules', 'ad-create-panel', 'ads-list-panel', 'ad-placement-group'].every((id) => has(page.text, `data-testid="${id}"`)));
ok('هر سه جای بنر با برچسبِ فارسی و نامِ فنی گروه‌بندی شده‌اند',
  (page.text.match(/data-testid="ad-placement-group"/g) || []).length === 3
  && ['home_top', 'home_mid', 'dash_slim'].every((p) => has(page.text, `data-placement="${p}"`)));
ok('بنرهای پیش‌فرض در فهرست دیده می‌شوند (با پیش‌نمایشِ تصویر)',
  (page.text.match(/data-testid="ad-row"/g) || []).length >= 3 && has(page.text, 'data-testid="ad-image"')
  && has(page.text, '../assets/img/ad-haji.jpg'), String((page.text.match(/data-testid="ad-row"/g) || []).length));
ok('تبلیغِ بی‌لینک، روشن گفته می‌شود (نه لینکِ خالیِ مبهم)', has(page.text, 'data-testid="ad-no-link"'));
ok('آمارِ کلیک در پنل هست (تعداد + IPِ یکتا)',
  has(page.text, 'data-testid="ad-clicks"') && has(page.text, 'کلیک') && /data-testid="ads-clicks"/.test(page.text));
ok('دکمه‌های ترتیب/وضعیت/ویرایش/حذف برای هر ردیف هست',
  ['move-up-ad', 'move-down-ad', 'toggle-ad', 'edit-ad', 'delete-ad'].every((id) => has(page.text, `data-testid="${id}"`)));
ok('منوی کنار، «تبلیغات» را فعال نشان می‌دهد و نشانِ مدیر کل هست',
  /data-testid="acl-scope-badge"/.test(page.text) && /مدیر کل/.test(page.text));

const noToken = await sup.post('/admin/ads.php', { ad_action: 'create', placement: 'home_top', title: 'بی‌توکن', image_path: 'assets/img/x.jpg' });
ok('POST بدون توکن CSRF ⇒ ۴۰۳', noToken.status === 403, String(noToken.status));

r = await submit(sup, '/admin/ads.php', {
  ad_action: 'create', placement: 'dash_slim', title: 'بنر آزمونِ پنل', alt_text: 'alt آزمون',
  image_path: 'assets/img/ad-slim.jpg', image_webp: 'assets/img/ad-slim.webp',
  link_url: 'https://eplak.ir/test-ad', sort_order: '7', is_active: '1',
});
ok('افزودن تبلیغ از فرمِ واقعی ⇒ ۳۰۲ و پیامِ موفق', r.status === 302 && /created=1/.test(loc(r)), `${r.status} ${loc(r)}`);
const newId = Number((loc(r).match(/u=(\d+)/) || [, '0'])[1]);
ok('تبلیغِ تازه در دیتابیس نشست (همه‌ی فیلدها)', newId > 0 && (await one(`json_encode(eplakAdsGetById($pdo, ${newId}))`)) !== 'null');
page = await sup.get('/admin/ads.php');
ok('تبلیغِ تازه در فهرستِ همان جای بنر دیده می‌شود (با لینک و تصویر)',
  has(page.text, 'بنر آزمونِ پنل') && has(page.text, 'https://eplak.ir/test-ad') && has(page.text, `data-ad-id="${newId}"`));
/* پیامِ موفقیت روی «نشانیِ هدایت‌شده» است (الگوی PRG: با تازه‌کردنِ صفحه کار
   تکرار نمی‌شود و پیام هم نمی‌ماند) */
const flashed = await sup.get('/admin/ads.php?' + (loc(r).split('?')[1] || 'created=1'));
ok('پیامِ موفقیت روی نشانیِ هدایت هست و در GETِ ساده تکرار نمی‌شود',
  /data-testid="ads-message"/.test(flashed.text) && /اضافه شد/.test(flashed.text)
  && !/data-testid="ads-message"/.test(page.text),
  String(/اضافه شد/.test(flashed.text)) + ' · ' + String(/data-testid="ads-message"/.test(page.text)));

const badTitle = await submit(sup, '/admin/ads.php', { ad_action: 'create', placement: 'home_top', title: '', image_path: 'assets/img/x.jpg' });
ok('عنوانِ خالی ⇒ خطای فارسی و تبلیغ ساخته نمی‌شود', /err=/.test(loc(badTitle)) && /الزامی/.test(decodeURIComponent(loc(badTitle))), loc(badTitle));
const badImage = await submit(sup, '/admin/ads.php', { ad_action: 'create', placement: 'home_top', title: 'بی‌تصویر', image_path: '' });
ok('بی‌تصویر ⇒ خطای فارسی', /err=/.test(loc(badImage)) && /تصویر/.test(decodeURIComponent(loc(badImage))), loc(badImage));
const badLink = await submit(sup, '/admin/ads.php', { ad_action: 'create', placement: 'home_top', title: 'لینک بد', image_path: 'assets/img/x.jpg', link_url: 'javascript:alert(1)' });
ok('لینکِ javascript: ⇒ رد می‌شود (با پیامِ http/https)', /err=/.test(loc(badLink)) && /http/.test(decodeURIComponent(loc(badLink))), loc(badLink));
const badPlace = await submit(sup, '/admin/ads.php', { ad_action: 'create', placement: 'sidebar', title: 'جای بد', image_path: 'assets/img/x.jpg' });
ok('جای بنرِ نامعتبر ⇒ رد می‌شود', /err=/.test(loc(badPlace)), loc(badPlace));

const xss = await submit(sup, '/admin/ads.php', {
  ad_action: 'create', placement: 'home_mid', title: '<script>alert(1)</script> عنوان خطرناک',
  alt_text: '" onmouseover="alert(3)', image_path: 'assets/img/x.jpg', link_url: 'https://a.test/x',
});
ok('افزودن با عنوانِ XSS پذیرفته می‌شود (و در خروجی «فرار» می‌شود)', /created=1/.test(loc(xss)), loc(xss));
page = await sup.get('/admin/ads.php');
ok('عنوانِ خطرناک در صفحه اجرا نمی‌شود (تگِ script خام نیست، فرار شده)',
  !/<script>alert\(1\)<\/script>/.test(page.text) && has(page.text, '&lt;script&gt;'));
ok('تزریق به «ویژگیِ» تگ از راه alt هم خنثی می‌شود',
  !/onmouseover="alert\(3\)"/.test(page.text) && has(page.text, '&quot; onmouseover=&quot;'));
const spacedLink = await submit(sup, '/admin/ads.php', {
  ad_action: 'create', placement: 'home_mid', title: 'لینک با فاصله',
  image_path: 'assets/img/x.jpg', link_url: 'https://a.test/?q=" onclick="alert(2)',
});
ok('لینکِ دارای نویسه‌ی کنترلی/فاصله رد می‌شود (راهِ دیگرِ تزریق)', /err=/.test(loc(spacedLink)), loc(spacedLink));
const xssId = Number(((await one(`(int) $pdo->query("SELECT id FROM ads WHERE title LIKE '%خطرناک%' LIMIT 1")->fetchColumn()`)) || 0));

/* ویرایش */
r = await submit(sup, `/admin/ads.php?edit=${newId}`, {
  ad_action: 'update', ad_id: String(newId), placement: 'dash_slim', title: 'بنر ویرایش‌شده از پنل',
  image_path: 'assets/img/ad-slim.jpg', link_url: 'https://eplak.ir/edited', sort_order: '2', is_active: '1',
});
ok('ویرایش از فرمِ واقعی ذخیره می‌شود', r.status === 302 && /saved=1/.test(loc(r)), `${r.status} ${loc(r)}`);
const edited = grab(await phpRun(`$row = eplakAdsGetById($pdo, ${newId}); echo '<<<' . json_encode([$row['title'], $row['link_url'], $row['placement']]) . '>>>';`));
ok('مقدارهای ویرایش‌شده در دیتابیس نشسته‌اند', edited[0] === 'بنر ویرایش‌شده از پنل' && edited[1] === 'https://eplak.ir/edited' && edited[2] === 'dash_slim', JSON.stringify(edited));
const editPage = await sup.get(`/admin/ads.php?edit=${newId}`);
ok('فرمِ ویرایش با مقدارهای فعلی و پیش‌نمایشِ تصویر باز می‌شود',
  has(editPage.text, 'data-testid="ad-edit-panel"') && has(editPage.text, 'value="بنر ویرایش‌شده از پنل"') && has(editPage.text, 'data-testid="edit-preview"'));

/* ترتیب و وضعیت */
const orderBefore = grab(await phpRun(`echo '<<<' . json_encode($pdo->query("SELECT id FROM ads WHERE placement='dash_slim' ORDER BY sort_order, id")->fetchAll(PDO::FETCH_COLUMN)) . '>>>';`));
r = await submit(sup, '/admin/ads.php', { ad_action: 'move_up', ad_id: String(newId) });
ok('«یک پله بالا» از پنل ⇒ ۳۰۲ و پیام', r.status === 302 && (/moved=1/.test(loc(r)) || /err=/.test(loc(r))), loc(r));
const orderAfter = grab(await phpRun(`echo '<<<' . json_encode($pdo->query("SELECT id FROM ads WHERE placement='dash_slim' ORDER BY sort_order, id")->fetchAll(PDO::FETCH_COLUMN)) . '>>>';`));
ok('ترتیبِ dash_slim واقعاً عوض شد', JSON.stringify(orderBefore) !== JSON.stringify(orderAfter), `${orderBefore} → ${orderAfter}`);

r = await submit(sup, '/admin/ads.php', { ad_action: 'toggle', ad_id: String(newId) });
ok('غیرفعال‌کردن از پنل', r.status === 302 && /toggled=1&amp;active=0|toggled=1&active=0/.test(loc(r)), loc(r));
ok('تبلیغِ غیرفعال در API نمی‌آید (ولی در پنل چرا)',
  (pickJson(await rawApi('api/ads.php')).placements.dash_slim || []).every((a) => Number(a.id) !== newId)
  && has((await sup.get('/admin/ads.php')).text, 'data-testid="ad-status-inactive"'));
r = await submit(sup, '/admin/ads.php', { ad_action: 'toggle', ad_id: String(newId) });
ok('فعال‌کردنِ دوباره', /active=1/.test(loc(r)) && (await one(`(int) eplakAdsGetById($pdo, ${newId})['is_active']`)) === 1, loc(r));

/* حذف */
r = await submit(sup, '/admin/ads.php', { ad_action: 'delete', ad_id: String(xssId) });
ok('حذف از پنل ⇒ ۳۰۲ و ردیف ناپدید', r.status === 302 && /deleted=1/.test(loc(r))
  && !has((await sup.get('/admin/ads.php')).text, 'خطرناک'), loc(r));
const unknown = await submit(sup, '/admin/ads.php', { ad_action: 'nope', ad_id: String(newId) });
ok('عملیاتِ ناشناخته ⇒ پیامِ خطا (نه اجرای تصادفی)', /err=/.test(loc(unknown)) && /ناشناخته/.test(decodeURIComponent(loc(unknown))), loc(unknown));

/* مدیرِ حوزه/معاونت نباید به تبلیغات برسد */
await phpRun(`
$c = eplakCreateAdminUser($pdo, 'ads-dept-admin', 'AdsTest1403', 'مدیرِ خدمات', 'admin');
if ((int) $c['id'] > 0) { eplakSetAdminDepartments($pdo, (int) $c['id'], [(int) $pdo->query("SELECT id FROM departments WHERE name LIKE '%خدمات شهری%' AND parent_id IS NULL LIMIT 1")->fetchColumn()]); }
echo 'ok';`);
const DEPT = newJar(); const dept = client(DEPT);
await req('GET', '/admin/login.php', DEPT);
r = await req('POST', '/admin/login.php', DEPT, { username: 'ads-dept-admin', password: 'AdsTest1403' });
ok('ورودِ مدیرِ حوزه (برای بررسیِ دسترسیِ تبلیغات)', r.status === 302, `${r.status} ${loc(r)}`);
const forbidden = await dept.get('/admin/ads.php');
ok('مدیرِ حوزه به صفحه‌ی تبلیغات نمی‌رسد (۴۰۳ «دسترسی ندارید»)',
  forbidden.status === 403 && /دسترسی ندارید/.test(forbidden.text) && !has(forbidden.text, 'ad-create-panel'), String(forbidden.status));
const forbiddenPost = await dept.post('/admin/ads.php', { ad_action: 'delete', ad_id: String(newId) });
ok('درخواستِ مستقیمِ POST به ads.php از مدیرِ حوزه ⇒ ۴۰۳ و تبلیغ سرِ جایش است',
  forbiddenPost.status === 403 && !has(forbiddenPost.text, 'ad-create-panel')
  && (await one(`(int) $pdo->query('SELECT COUNT(*) FROM ads WHERE id = ${newId}')->fetchColumn()`)) === 1,
  String(forbiddenPost.status));
const deptNav = (await dept.get('/admin/index.php')).text;
ok('«تبلیغات» در منوی مدیرِ حوزه نیست', !/href="ads\.php"/.test(deptNav));

/* «ترمیم و درج بنرهای پیش‌فرض» — وقتی جدول خالی است (آخرِ بخشِ پنل، چون
   ردیف‌های آزمون‌های بالا را پاک می‌کند).
   نکته‌ی محیط آزمون: php-wasm «یک نشست در حافظه» دارد و ورودِ مدیرِ حوزه در
   آزمونِ بالا، هویتِ نشست را عوض کرده است ⇒ همین‌جا دوباره به‌عنوان مدیر کل
   وارد می‌شویم (در هاستِ واقعی هر کوکی نشستِ خودش را دارد). */
r = await req('POST', '/admin/login.php', SUP, { username: 'admin', password: 'admin123' });
ok('ورودِ دوباره‌ی مدیر کل برای آزمونِ «ترمیم»', r.status === 302, `${r.status} ${loc(r)}`);
page = await sup.get('/admin/ads.php');
ok('وقتی تبلیغی هست، پنلِ «ترمیم» نشان داده نمی‌شود',
  !has(page.text, 'data-testid="ads-repair-panel"'));
await phpRun(`$pdo->exec('DELETE FROM ads'); echo 'emptied';`);
page = await sup.get('/admin/ads.php');
ok('وقتی جدول خالی است: پنل پیشنهادِ درجِ بنرهای پیش‌فرض می‌دهد و «خالی بودنِ» هر سه جای بنر را روشن می‌گوید',
  has(page.text, 'data-testid="ads-repair-panel"') && has(page.text, 'data-testid="ads-repair"')
  && /تبلیغی در دیتابیس نیست/.test(page.text)
  && (page.text.match(/data-testid="ads-empty-placement"/g) || []).length === 3,
  String((page.text.match(/data-testid="ads-empty-placement"/g) || []).length));
r = await submit(sup, '/admin/ads.php', { ad_action: 'repair' });
ok('دکمه‌ی «ساخت جدول و درج بنرهای پیش‌فرض» ⇒ ۳۰۲ و گزارشِ ۳ بنر',
  r.status === 302 && /repaired=1/.test(loc(r)) && /seeded=3/.test(loc(r)), loc(r));
page = await sup.get('/admin/ads.php');
ok('بعد از ترمیم، سه بنرِ پیش‌فرض در فهرست‌اند و پنلِ ترمیم رفته است',
  (page.text.match(/data-testid="ad-row"/g) || []).length === 3 && !has(page.text, 'data-testid="ads-repair-panel"'),
  String((page.text.match(/data-testid="ad-row"/g) || []).length));

/* ══════════════════════════════════════════════════════════════════
   ۸) اپ واقعی (jsdom)
   ══════════════════════════════════════════════════════════════════ */
section('۸) اپ: چرخشِ تصویرها به ترتیب، لینک در مرورگر گوشی، ثبتِ کلیک، حالت آفلاین');

class LocalLoader extends ResourceLoader {
  fetch(url, options) {
    const u = String(url);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)\//i.test(u)) {
      let p = u.replace(/^https?:\/\/[^/]+\//, '').split('?')[0].split('#')[0];
      p = p.replace(/^(eplak-fixed-new|eplak-fixed)\//, '');
      const abs = path.join(ROOT, decodeURIComponent(p));
      return Promise.resolve(fs.existsSync(abs) ? Buffer.from(fs.readFileSync(abs)) : Buffer.from(''));
    }
    if (/^file:\/\/\/android_asset\//i.test(u)) {
      const abs = path.join(ROOT, decodeURIComponent(u.replace(/^file:\/\/\/android_asset\//i, '').split('?')[0]));
      return Promise.resolve(fs.existsSync(abs) ? Buffer.from(fs.readFileSync(abs)) : Buffer.from(''));
    }
    if (u.startsWith('file://')) return super.fetch(u, options);
    return Promise.resolve(Buffer.from(''));
  }
}

const appLogs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => appLogs.push('jsdomError: ' + (e && e.message)));

const bootApp = async (opts = {}) => {
  const calls = { opened: [], beacons: [], toasts: [], legacy: 0 };
  const dom = await JSDOM.fromFile(path.join(ROOT, 'index.html'), {
    runScripts: 'dangerously',
    resources: new LocalLoader(),
    pretendToBeVisual: true,
    url: 'http://localhost/eplak-fixed/index.html',
    virtualConsole: vc,
    beforeParse(window) {
      window.EPLAK_API_BASE_URL = 'api';
      window.EPLAK_ADS_ROTATE_MS = opts.rotateMs || 250;
      window.EPLAK_ADS_REFRESH_MS = 600000;
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      window.AndroidApp = Object.assign({
        showNotification() {}, ensureNotificationChannel() {}, notificationsEnabled() { return true; },
        requestNotificationPermission() {}, getFcmToken() { return ''; }, isFcmReady() { return false; },
        refreshFcmToken() {}, getPushDiagnostics() { return '{"enabled":true,"token":false}'; },
        openNotificationSettings() {}, shouldRequireLogin() { return false; }, markLoginDone() {}, prepareExit() {},
      }, { openUrl(url) { calls.opened.push(String(url)); } });
      navigator.sendBeacon = undefined;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = (((init || {}).method) || 'GET').toUpperCase();
        const body = (init || {}).body || null;
        if (/\/ads\.php/.test(url) && method === 'POST') {
          calls.beacons.push(String(body || ''));
          return { ok: true, status: 200, json: async () => ({ success: true, counted: true }), text: async () => '{"success":true}' };
        }
        const m = url.match(/(?:^|\/)(api\/[a-z0-9_\-]+\.php)(?:\?([^#]*))?/i);
        if (!m) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
        if (opts.apiDown) return { ok: false, status: 500, json: async () => { throw new Error('no json'); }, text: async () => '' };
        const get = {};
        if (m[2]) new URLSearchParams(m[2]).forEach((v, k) => { get[k] = v; });
        let post = {};
        if (method === 'POST' && typeof body === 'string') new URLSearchParams(body).forEach((v, k) => { post[k] = v; });
        const text = await rawApi(m[1], { method, get, post });
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
        return {
          ok: parsed !== null && !/^\s*</.test(text),
          status: parsed === null ? 500 : 200,
          json: async () => { if (parsed === null) throw new Error('bad json: ' + text.slice(0, 160)); return parsed; },
          text: async () => text,
        };
      };
    },
  });
  await new Promise((r) => setTimeout(r, opts.wait || 1400));
  return { dom, calls };
};
const closeApp = (dom) => { try { dom.window.close(); } catch (e) { /* مهم نیست */ } };

/* داده‌ی «قطعی» برای آزمونِ اپ: جدول خالی می‌شود و چهار تبلیغِ شناخته‌شده
   ساخته می‌شود (دو تا در home_top تا چرخش و ترتیب دیده شود، و بقیه یکی‌یکی). */
const appData = grab(await phpRun(`
$pdo->exec('DELETE FROM ads_clicks');
$pdo->exec('DELETE FROM ads');
$mk = function ($placement, $title, $image, $webp, $link, $order) use ($pdo) {
    $r = eplakAdsCreate($pdo, ['placement' => $placement, 'title' => $title, 'alt_text' => $title,
        'image_path' => $image, 'image_webp' => $webp, 'link_url' => $link, 'sort_order' => $order, 'is_active' => 1]);
    return (int) $r['id'];
};
$top1  = $mk('home_top', 'بنر اول خانه', 'assets/img/ad-haji.jpg', 'assets/img/ad-haji.webp', '', 1);
$top2  = $mk('home_top', 'بنر دوم خانه', 'assets/img/ad-slim.jpg', 'assets/img/ad-slim.webp', 'https://eplak.ir/rotate-me', 2);
$mid1  = $mk('home_mid', 'بنر میانی', 'assets/img/ad-ibatri-top.jpg', 'assets/img/ad-ibatri-top.webp', '', 1);
$slim1 = $mk('dash_slim', 'بنر باریک', 'assets/img/ad-slim.jpg', 'assets/img/ad-slim.webp', '', 1);
$pub = eplakAdsPublic($pdo, 2);
echo '<<<' . json_encode([
  'top1' => $top1, 'top2' => $top2, 'mid1' => $mid1, 'slim1' => $slim1,
  'order' => array_map(function ($a) { return (int) $a['id']; }, $pub['placements']['home_top']),
  'mid'   => count($pub['placements']['home_mid']),
  'slim'  => count($pub['placements']['dash_slim']),
]) . '>>>';`));
ok('داده‌ی قطعیِ اپ: دو تصویرِ فعال در home_top «به همان ترتیب»، و یکی در هر جای بنرِ دیگر',
  appData.top1 > 0 && appData.slim1 > 0 && appData.order.join(',') === [appData.top1, appData.top2].join(',')
  && appData.mid === 1 && appData.slim === 1, JSON.stringify(appData));

const { dom, calls } = await bootApp({ rotateMs: 250 });
const w = dom.window;
const d = w.document;
/* رفتارِ قبلیِ بنرها (پیامِ کوتاه / handleHomeAdClick) را «بعد از بالا آمدنِ اپ»
   می‌پوشانیم تا بشماریم چندبار صدا زده شد — modules/home.js هنگام بارگذاری
   handleHomeAdClick را مقداردهی می‌کند، پس پوشاندنِ پیش از بارگذاری فایده ندارد. */
{
  const origHandler = w.handleHomeAdClick;
  w.handleHomeAdClick = function () { calls.legacy++; try { if (typeof origHandler === 'function') origHandler.apply(this, arguments); } catch (e) { /* بی‌ضرر */ } };
  const origToast = w.showToast;
  w.showToast = function (msg) { calls.toasts.push(String(msg)); try { if (typeof origToast === 'function') origToast.apply(this, arguments); } catch (e) { /* بی‌ضرر */ } };
}
const slotOf = (id) => d.getElementById(id);
const slidesOf = (id) => Array.from(slotOf(id).querySelectorAll('.ead-slide'));
const imgsOf = (id) => Array.from(slotOf(id).querySelectorAll('.ead-slide img')).map((i) => i.getAttribute('src'));
const orderOf = (id) => Array.from(slotOf(id).querySelectorAll('.ead-slide')).map((s) => s.getAttribute('data-ad-id'));

ok('ماژولِ تبلیغات بارگذاری شد و سه جای بنر را پیدا کرد',
  typeof w.EplakAds === 'object' && w.EplakAds.slots().length === 3, appLogs.slice(0, 2).join(' | '));
ok('تبلیغ‌ها از api/ads.php خوانده شدند', w.EplakAds.state.loaded === true && w.EplakAds.state.fingerprint.length === 12,
  JSON.stringify({ loaded: w.EplakAds.state.loaded, v: w.EplakAds.state.fingerprint }));
ok('home_top دو اسلاید به «همان ترتیبِ پنل» دارد',
  slidesOf('adSlotHomeTop').length === 2 && orderOf('adSlotHomeTop').map(Number).join(',') === [appData.top1, appData.top2].join(','),
  orderOf('adSlotHomeTop').join(','));
ok('کلاسِ تصویرِ اصلیِ هر بنر حفظ شده (اندازه و برش مثل قبل)',
  !!slotOf('adSlotHomeTop').querySelector('img.haji-banner-img')
  && !!slotOf('adSlotHomeMid').querySelector('img.home-ad-img')
  && !!slotOf('adSlotDashSlim').querySelector('img.dash-ad-slim-img'));
ok('تصویرِ ثابتِ داخل بسته پنهان شد ولی در DOM ماند (نسخه‌ی پشتیبان)',
  slotOf('adSlotHomeTop').querySelector('picture').classList.contains('ead-fallback-hidden')
  && slotOf('adSlotHomeTop').querySelectorAll('picture').length >= 1);
ok('بجِ «تبلیغات» دست‌نخورده باقی ماند',
  has(slotOf('adSlotHomeTop').innerHTML, 'home-ad-badge') && has(slotOf('adSlotHomeTop').innerHTML, 'data-i18n="ad_sponsored"'));
ok('نقطه‌های ناوبری فقط وقتی بیش از یک تصویر هست ساخته می‌شوند',
  !!slotOf('adSlotHomeTop').querySelector('.ead-dots')
  && slotOf('adSlotHomeTop').querySelectorAll('.ead-dot').length === 2
  && !slotOf('adSlotDashSlim').querySelector('.ead-dots'));
ok('نسخه‌ی webp هم برای مرورگرهای پشتیبان گذاشته شد',
  has(slotOf('adSlotHomeTop').innerHTML, 'type="image/webp"') && has(slotOf('adSlotHomeTop').innerHTML, 'ad-haji.webp'));
ok('alt تصویر از پنل می‌آید (دسترس‌پذیری)',
  String(slotOf('adSlotHomeTop').querySelector('img').getAttribute('alt')).length > 3);

/* چرخشِ خودکار */
const firstIndex = w.EplakAds.slots()[0].index;
await new Promise((r) => setTimeout(r, 700));
const nextIndex = w.EplakAds.slots()[0].index;
ok('تصویرها خودکار می‌چرخند (بدون دخالت کاربر)', nextIndex !== firstIndex, `${firstIndex} → ${nextIndex}`);
ok('ریل با transform جابه‌جا می‌شود (انیمیشنِ GPU، نه جابه‌جایی DOM)',
  /translate3d\(-?\d+(\.\d+)?%/.test(String(slotOf('adSlotHomeTop').querySelector('.ead-track').style.transform)),
  String(slotOf('adSlotHomeTop').querySelector('.ead-track').style.transform));
ok('نقطه‌ی فعال با تصویرِ جاری همگام است',
  Array.from(slotOf('adSlotHomeTop').querySelectorAll('.ead-dot')).findIndex((el) => el.classList.contains('active')) === nextIndex);
ok('شناسه‌ی تبلیغِ جاری روی بنر نوشته می‌شود (برای عیب‌یابی/آمار)',
  Number(slotOf('adSlotHomeTop').getAttribute('data-ad-id')) > 0);

/* کلیک: لینک‌دار ⇒ مرورگر گوشی + ثبتِ آمار */
w.EplakAds.slots()[0].index = 1;
slotOf('adSlotHomeTop').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 60));
ok('بنرِ لینک‌دار با پلِ اندروید در «مرورگر گوشی» باز می‌شود',
  calls.opened.includes('https://eplak.ir/rotate-me'), JSON.stringify(calls.opened));
ok('همان کلیک برای آمارِ پنل ثبت می‌شود (POST action=click)',
  calls.beacons.some((b) => /action=click/.test(b) && new RegExp('id=' + appData.top2).test(b)), JSON.stringify(calls.beacons));
ok('پیامِ قدیمیِ «به‌زودی در ای‌پلاک» برای بنرِ لینک‌دار نشان داده نمی‌شود', calls.toasts.length === 0, JSON.stringify(calls.toasts));

/* کلیک: بی‌لینک ⇒ رفتارِ قبلی + ثبتِ آمار */
const slimSlot = w.EplakAds.slots().find((s) => s.placement === 'dash_slim');
slimSlot.index = 0;
const slimAdId = Number(slimSlot.ads[0].id);
slotOf('adSlotDashSlim').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 60));
ok('بنرِ بی‌لینک همان رفتارِ قبلی را دارد (handleHomeAdClick) و چیزی بیرون از اپ باز نمی‌شود',
  calls.legacy >= 1 && calls.opened.length === 1, `${calls.legacy} · ${JSON.stringify(calls.opened)}`);
ok('کلیکِ بنرِ بی‌لینک هم در آمار شمرده می‌شود',
  calls.beacons.some((b) => new RegExp('id=' + slimAdId).test(b)), JSON.stringify(calls.beacons));

/* کشیدنِ انگشت (touch) — ویژگی‌های Event در jsdom فقط‌خواندنی‌اند، پس با
   defineProperty ساخته می‌شوند.
   چرخشِ خودکار در این دو آزمون «متوقف» می‌شود (slot.paused)؛ وگرنه با دو
   اسلاید، تیکِ تایمر بین خواندنِ شاخص و کشیدن می‌افتاد و جابه‌جاییِ drag با
   جابه‌جاییِ تایمر همدیگر را خنثی می‌کردند (۰→۱→۰) و آزمون شانسی می‌شد. */
const homeSlotEl = slotOf('adSlotHomeTop');
w.EplakAds.slots()[0].paused = true;
const touch = (type, x, y = 10) => {
  const ev = new w.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'touches', { value: [{ clientX: x, clientY: y }], configurable: true });
  Object.defineProperty(ev, 'changedTouches', { value: [{ clientX: x, clientY: y }], configurable: true });
  homeSlotEl.dispatchEvent(ev);
};
const beforeTouch = w.EplakAds.slots()[0].index;
touch('touchstart', 300); touch('touchmove', 250); touch('touchmove', 120); touch('touchend', 120);
await new Promise((r) => setTimeout(r, 40));
ok('با کشیدنِ انگشت، تصویر عوض می‌شود (RTL: کشیدن به راست = تصویرِ قبلی)',
  w.EplakAds.slots()[0].index !== beforeTouch, `${beforeTouch} → ${w.EplakAds.slots()[0].index}`);
ok('ریل همیشه با transform جابه‌جا می‌شود (نه جابه‌جایی DOM)',
  /translate3d\(/.test(String(homeSlotEl.querySelector('.ead-track').style.transform)));

/* همان مسیر با ماوس (دسکتاپ/PWA): mousedown روی بنر، move/up روی پنجره */
const beforeMouse = w.EplakAds.slots()[0].index;
const mouse = (type, x, target) => {
  const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 10 });
  (target || homeSlotEl).dispatchEvent(ev);
};
mouse('mousedown', 300);
mouse('mousemove', 250, w); mouse('mousemove', 120, w);
mouse('mouseup', 120, w);
await new Promise((r) => setTimeout(r, 40));
ok('با کشیدنِ ماوس هم تصویر عوض می‌شود (PWA/دسکتاپ)',
  w.EplakAds.slots()[0].index !== beforeMouse, `${beforeMouse} → ${w.EplakAds.slots()[0].index}`);
w.EplakAds.slots()[0].paused = false;
closeApp(dom);

/* ── حالتِ «تبلیغی نیست» و «سرور در دسترس نیست» ── */
await phpRun(`$pdo->exec("UPDATE ads SET is_active = 0 WHERE placement = 'home_top'"); echo 'off';`);
const off = await bootApp({ rotateMs: 250 });
const wo = off.dom.window, dox = wo.document;
ok('وقتی برای یک جای بنر تبلیغِ فعالی نیست، بنرِ ثابتِ داخل بسته دیده می‌شود',
  wo.EplakAds.isActive('home_top') === false
  && !dox.getElementById('adSlotHomeTop').querySelector('.ead-track')
  && !dox.getElementById('adSlotHomeTop').querySelector('picture').classList.contains('ead-fallback-hidden'));
ok('جای بنرهای دیگر سرِ جایشان کار می‌کنند (خالی بودنِ یکی، بقیه را خاموش نمی‌کند)',
  wo.EplakAds.isActive('dash_slim') === true && !!dox.getElementById('adSlotDashSlim').querySelector('.ead-track'));
ok('کلیک روی بنرِ ثابت، همان رفتارِ قبلی را دارد (پیام/هندلر)',
  (dox.getElementById('adSlotHomeTop').getAttribute('onclick') || '').includes("isActive('home_top')"));
closeApp(off.dom);
await phpRun(`$pdo->exec("UPDATE ads SET is_active = 1 WHERE placement = 'home_top'"); echo 'on';`);

const down = await bootApp({ apiDown: true, rotateMs: 250 });
const wd = down.dom.window;
ok('اگر API در دسترس نباشد، اپ نمی‌شکند و بنرهای ثابت می‌مانند',
  wd.EplakAds.state.loaded === false && wd.EplakAds.isActive('home_top') === false
  && !!wd.document.getElementById('adSlotHomeTop').querySelector('picture')
  && appLogs.filter((l) => /ads/i.test(l)).length === 0, appLogs.slice(0, 3).join(' | '));
closeApp(down.dom);

/* ══════════════════════════════════════════════════════════════════
   ۹) قراردادِ کد، بسته‌بندی و مستندات
   ══════════════════════════════════════════════════════════════════ */
section('۹) قراردادِ کد، بسته‌ی هاست، ورک‌فلوها و مستندات');
const phpFiles = { 'shared/ads.php': adsLib, 'api/ads.php': adsApi, 'admin/ads.php': adsAdmin };
const php8 = [];
for (const [file, src] of Object.entries(phpFiles)) {
  if (/\bstr_contains\(|\bstr_starts_with\(|\bmatch\s*\(/.test(src)) php8.push(file + ': str_contains/match');
  if (/\?\->/.test(src)) php8.push(file + ': nullsafe');
  if (/function\s+\w+\([^)]*\b(public|private|protected)\s+\$/.test(src)) php8.push(file + ': promotion');
  if (/:\s*(int|string|array|bool)\|(int|string|array|bool)\s*[\{,)]/.test(src)) php8.push(file + ': union type');
}
ok('کدِ PHP با ۷.۴ هاست می‌سازد (بدون str_contains/match/nullsafe/union/promotion)', php8.length === 0, php8.join(' | '));
ok('admin/ads.php پشت مجوزِ ads و CSRF است',
  adsAdmin.includes("eplakRequirePermission('ads')") && adsAdmin.includes('eplakRequireCsrf()') && adsAdmin.includes('eplakCsrfField()'));
ok('admin/ads.php منوی واحد و نشانِ دامنه را دارد (نه منوی کپی‌شده)',
  adsAdmin.includes("eplakAdminSidebar('ads')") && adsAdmin.includes('eplakAdminScopeBadge($pdo)'));
ok('همه‌ی خروجی‌های پنل با htmlspecialchars فرار می‌شوند (عنوان/لینک/مسیر)',
  (adsAdmin.match(/htmlspecialchars\(/g) || []).length >= 18, String((adsAdmin.match(/htmlspecialchars\(/g) || []).length));
ok('api/ads.php سرصفحه‌های CORS/JSON می‌گذارد و هرگز HTML نمی‌دهد',
  adsApi.includes('eplakApiHeaders()') && adsApi.includes("eplakJson($payload, 200)") && !/echo\s+['"]</.test(adsApi));
ok('آپلودِ تصویر از همان زیرساختِ رسانه‌ی موجود می‌رود (uploads/ads)',
  adsAdmin.includes("eplakMediaStoreSimpleFile($_FILES['image_file'], 'ads')") || adsAdmin.includes("eplakMediaStoreSimpleFile($_FILES[$field], 'ads')"));
ok('ماژولِ اپ هیچ‌وقت خطا را به کاربر نشان نمی‌دهد (همه‌چیز try/catch)',
  (adsModule.match(/catch \(e\)/g) || []).length >= 8 && !/alert\(/.test(adsModule));
ok('ماژولِ اپ برای باز کردنِ لینک، پلِ اندروید و iOS را به‌ترتیب امتحان می‌کند',
  adsModule.includes('window.AndroidApp') && adsModule.includes('openUrl') && adsModule.includes('iOSApp')
  && adsModule.includes("window.open(target, '_blank', 'noopener')"));
ok('ماژولِ اپ فقط لینکِ http/https را باز می‌کند',
  /isExternalSafe[\s\S]{0,120}\^https\?:/.test(adsModule) && adsModule.includes('if (!isExternalSafe(target)) { return false; }'));
ok('ماژولِ اپ از Intl استفاده نمی‌کند و تاریخ/عدد نمی‌سازد (سازگار با قاعده‌ی شمسی)',
  !/Intl\./.test(adsModule));
ok('ثبتِ کلیک «آتش و فراموش» است (sendBeacon و بعد fetch با keepalive)',
  adsModule.includes('navigator.sendBeacon') && adsModule.includes('keepalive: true'));
const pkg = read('tools/build-update-package.sh');
ok('بسته‌ی هاست، فایل‌های تازه را لازم می‌داند (وگرنه بسته رد می‌شود)',
  ['shared/ads.php', 'api/ads.php', 'admin/ads.php', 'modules/ads.js', 'assets/css/ads.css']
    .every((f) => pkg.includes(f)));
ok('صفحه‌ی «بررسی نسخه» فایل‌های تبلیغات و مدیران را فهرست می‌کند',
  ['shared/ads.php', 'api/ads.php', 'admin/ads.php', 'modules/ads.js', 'assets/css/ads.css', 'admin/includes/acl.php', 'admin/admins.php']
    .every((f) => read('admin/version.php').includes(`'${f}'`)));
ok('نسخه‌ی اپ بالا رفت (APK/IPA تازه قابل تشخیص باشد)',
  /versionCode 5\b/.test(read('android-app/app/build.gradle')) && read('android-app/app/build.gradle').includes("versionName '2.3'")
  && (read('ios-app/Eplak.xcodeproj/project.pbxproj').match(/MARKETING_VERSION = 2\.3\.0;/g) || []).length === 2);
ok('گریدلِ اندروید پوشه‌های وب را کامل داخل APK می‌گذارد (ماژولِ تازه خودکار می‌رود)',
  read('android-app/app/build.gradle').includes('syncWebAssets') && /modules/.test(read('android-app/app/build.gradle')));
ok('مستنداتِ فارسیِ تبلیغات هست و به هر سه جای بنر و آمارِ کلیک اشاره می‌کند',
  fs.existsSync(path.join(ROOT, 'docs/ADS_FA.md'))
  && ['home_top', 'home_mid', 'dash_slim', 'آمار کلیک', 'admin/ads.php', 'api/ads.php', 'modules/ads.js']
    .every((needle) => read('docs/ADS_FA.md').includes(needle)));
ok('README بخشِ تبلیغات و دستورِ آزمونش را دارد',
  read('README.md').includes('docs/ADS_FA.md') && read('README.md').includes('run-regression.sh ads'));
ok('run-regression.sh مجموعه‌ی ads را می‌شناسد', read('tools/dev/run-regression.sh').includes('ads'));

/* ══════════════════════════════════════════════════════════════════
   ۱۰) نبودِ هشدار/خطای PHP
   ══════════════════════════════════════════════════════════════════ */
section('۱۰) پاکیزگیِ خروجی');
ok('هیچ پاسخ/اجرای PHP هشدار، Notice یا خطای مهلک نداشت',
  phpNoise.length === 0, phpNoise.slice(0, 3).join(' | '));

console.log(`\nADS: ${pass} passed, ${fail} failed`);
if (fail > 0) { console.log('❌ برخی آزمون‌های تبلیغات رد شدند'); } else { console.log('✅ همه‌ی آزمون‌ها موفق بودند'); }
process.exit(0);
