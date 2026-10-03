/* tiles.test.mjs — «نقشه‌ی موقعیت دیده نمی‌شد» (کاشی‌ها از سرور خودِ ای‌پلاک)
   ------------------------------------------------------------------
   چه چیزی واقعاً اجرا می‌شود (نه فقط متن‌کاوی):
     ۱) سرور (PHP-wasm): shared/tiles.php و api/tiles.php — اعتبارسنجی z/x/y و
        محدوده، کش دیسکی (miss/hit/stale/۳۰۴)، رد پاسخ غیرتصویری، سقف دریافت در
        دقیقه، پاک‌سازی کش، قالب {key}/{s}، و «دریافت واقعی HTTP» از یک سرور
        ساختگی با هر دو درایور (cURL و stream) + بررسی User-Agent و Referer.
     ۲) کلاینت (vm): موتور نقشه — ترتیب منبع‌ها (سرور خودمان ← OSM مستقیم)،
        جابه‌جایی خودکار به منبع بعدی، پیام «نقشه در دسترس نیست» + دکمه‌ی تلاش
        دوباره، و نگهبان زمانی (وقتی شبکه بی‌صدا بسته است).
*/
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import http from 'http';

const APP = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const read = (rel) => fs.readFileSync(path.join(APP, rel), 'utf8');
const TMP_ROOT = '/tmp/eplak-tiles-test-root';
fs.rmSync(TMP_ROOT, { recursive: true, force: true });
fs.mkdirSync(TMP_ROOT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const pickJson = (t) => { const m = String(t).match(/\{[\s\S]*\}/g); if (!m) return null; for (let i = m.length - 1; i >= 0; i--) { try { return JSON.parse(m[i]); } catch (e) {} } return null; };

/* یک PNG واقعی ۱×۱ و یک JPEG/WebP حداقلی (فقط بایت‌های ابتدایی برای تشخیص) */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);

/* هر اجرا یک «درخواست» تازه است؛ ثابت‌ها باید دوباره تعریف شوند */
const PRELUDE = `<?php
define('EPLAK_ROOT', '${TMP_ROOT}');
define('EPLAK_TILE_ROOT', '${TMP_ROOT}');
require_once '${APP}/shared/media.php';
require_once '${APP}/shared/tiles.php';
$PNG = base64_decode('${PNG_B64}');
function jout($v) { echo json_encode($v, JSON_UNESCAPED_UNICODE); }
`;
const run = async (code) => String((await php.run({ code: PRELUDE + code })).text).trim();

/* ══════════ ۱) سرور: shared/tiles.php ══════════ */
console.log('\n=== اعتبارسنجی کاشی (z/x/y و محدوده‌ی ایران) ===');
const val = pickJson(await run(`
$cfg = eplakTileConfig();
$v = function ($z, $x, $y, $c = null) use ($cfg) { $r = eplakTileValidate($z, $x, $y, $c ?? $cfg); return $r[0] ? 'ok' : $r[1] . ':' . $r[2]; };
jout([
  'varamin17'  => $v(17, 84339, 51772),
  'letters'    => $v('abc', 1, 2),
  'negative'   => $v(10, -1, 2),
  'float'      => $v(10, '1.5', 2),
  'zoomLow'    => $v(2, 0, 0),
  'zoomHigh'   => $v(20, 1, 1),
  'tileRange'  => $v(5, 40, 3),
  'london12'   => $v(12, 2047, 1362),
  'world5'     => $v(5, 16, 11),
  'noBbox'     => $v(12, 2047, 1362, array_merge($cfg, ['tile_bbox' => null])),
  'tehran10'   => $v(10, 662, 402),
  'arrays'     => $v([1], 1, 1),
]);`));
ok('کاشی ورامین (زوم ۱۷) پذیرفته می‌شود', val?.varamin17 === 'ok', JSON.stringify(val));
ok('ورودی غیرعددی/منفی/اعشاری رد می‌شود (۴۰۰ — بدون راه SSRF)',
  val?.letters === '400:bad-params' && val?.negative === '400:bad-params' && val?.float === '400:bad-params' && val?.arrays === '400:bad-params', JSON.stringify(val));
ok('زوم بیرون از ۳ تا ۱۹ رد می‌شود', val?.zoomLow === '400:bad-zoom' && val?.zoomHigh === '400:bad-zoom', JSON.stringify(val));
ok('شماره‌ی کاشی بزرگ‌تر از 2^z رد می‌شود', val?.tileRange === '400:bad-tile', JSON.stringify(val));
ok('کاشی بیرون از ایران در زوم بالا ۴۰۴ می‌شود (سرور پروکسی باز نمی‌شود)', val?.london12 === '404:out-of-area', JSON.stringify(val));
ok('نمای کلی جهان در زوم کم آزاد است', val?.world5 === 'ok', JSON.stringify(val));
ok('با خاموش کردن محدوده (tile_bbox = null) همه‌جا آزاد است', val?.noBbox === 'ok', JSON.stringify(val));
ok('تهران داخل محدوده است', val?.tehran10 === 'ok', JSON.stringify(val));

console.log('\n=== کش دیسکی: miss → hit → ۳۰۴ ===');
const serve1 = pickJson(await run(`
$calls = [];
$fetch = function ($url) use (&$calls, $PNG) { $calls[] = $url; return [200, $PNG]; };
$a = eplakTileHandle(['z' => '17', 'x' => '84339', 'y' => '51772'], [], $fetch);
$b = eplakTileHandle(['z' => '17', 'x' => '84339', 'y' => '51772'], [], $fetch);
$c = eplakTileHandle(['z' => '17', 'x' => '84339', 'y' => '51772'], ['HTTP_IF_NONE_MATCH' => $b['headers']['ETag']], $fetch);
jout([
  'a' => [$a['status'], $a['headers']['X-Eplak-Tile'], $a['headers']['Content-Type'], $a['headers']['Cache-Control'], md5($a['body']) === md5($PNG)],
  'b' => [$b['status'], $b['headers']['X-Eplak-Tile'], md5($b['body']) === md5($PNG), $b['headers']['Content-Length'] ?? ''],
  'c' => [$c['status'], $c['body']],
  'fetches' => count($calls),
  'url' => $calls[0] ?? '',
  'file' => is_file('${TMP_ROOT}/uploads/tiles/17/84339/51772.bin'),
  'guard' => is_file('${TMP_ROOT}/uploads/.htaccess'),
  'etag' => $b['headers']['ETag'],
]);`));
ok('بار اول (miss): ۲۰۰ + تصویر PNG + کش یک‌روزه', serve1?.a?.[0] === 200 && serve1?.a?.[1] === 'miss' && serve1?.a?.[2] === 'image/png'
  && /max-age=86400/.test(serve1?.a?.[3] || '') && serve1?.a?.[4] === true, JSON.stringify(serve1?.a));
ok('بار دوم (hit): از دیسک می‌دهد و دوباره از بیرون نمی‌گیرد', serve1?.b?.[0] === 200 && serve1?.b?.[1] === 'hit' && serve1?.b?.[2] === true && serve1?.fetches === 1, JSON.stringify(serve1));
ok('آدرس بالادستی درست ساخته می‌شود (z/x/y)', serve1?.url === 'https://tile.openstreetmap.org/17/84339/51772.png', String(serve1?.url));
ok('فایل کاشی روی دیسک ذخیره شد و نگهبان uploads ساخته شد', serve1?.file === true && serve1?.guard === true);
ok('If-None-Match با ETag برابر → ۳۰۴ بدون بدنه', serve1?.c?.[0] === 304 && serve1?.c?.[1] === '', JSON.stringify(serve1?.c));
ok('Content-Length برای پاسخ ۲۰۰ ارسال می‌شود', Number(serve1?.b?.[3]) === Buffer.from(PNG_B64, 'base64').length, String(serve1?.b?.[3]));

console.log('\n=== شکست بالادستی، کهنه (stale)، و پاسخ نامعتبر ===');
const fails = pickJson(await run(`
$cfg = ['tile_upstreams' => ['https://one.test/{z}/{x}/{y}.png', 'https://two.test/{z}/{x}/{y}.png']];
$GLOBALS['EPLAK_TILE_OVERRIDES'] = $cfg;
$out = [];
/* ۱) هیچ بالادستی جواب نمی‌دهد و کش هم نیست → ۵۰۲ و چیزی کش نمی‌شود */
$r = eplakTileHandle(['z' => '16', 'x' => '42170', 'y' => '25886'], [], function ($u) { return [503, 'down']; });
$out['allDown'] = [$r['status'], $r['headers']['Cache-Control'], is_file('${TMP_ROOT}/uploads/tiles/16/42170/25886.bin')];
/* ۲) منبع اول HTML می‌دهد (مثلاً صفحه‌ی بلاک) → رد؛ منبع دوم سالم → قبول */
$seen = [];
$r = eplakTileHandle(['z' => '16', 'x' => '42171', 'y' => '25886'], [], function ($u) use (&$seen, $PNG) {
  $seen[] = $u;
  return strpos($u, 'one.test') !== false ? [200, '<html>Access blocked: Referer is required</html>'] : [200, $PNG];
});
$out['htmlThenGood'] = [$r['status'], $r['headers']['X-Eplak-Tile'], count($seen)];
/* ۳) پاسخ ۲۰۰ ولی غیرتصویری از همه → ۵۰۲ */
$r = eplakTileHandle(['z' => '16', 'x' => '42172', 'y' => '25886'], [], function ($u) { return [200, str_repeat('x', 500)]; });
$out['notImage'] = $r['status'];
/* ۴) تصویر بیش‌ازحد بزرگ رد می‌شود */
$GLOBALS['EPLAK_TILE_OVERRIDES'] = array_merge($cfg, ['tile_max_bytes' => 100]);
$r = eplakTileHandle(['z' => '16', 'x' => '42173', 'y' => '25886'], [], function ($u) use ($PNG) { return [200, $PNG . str_repeat("\\0", 500)]; });
$out['oversize'] = $r['status'];
/* ۵) کش کهنه + بالادستی خراب → همان نسخه‌ی کهنه (stale) */
$GLOBALS['EPLAK_TILE_OVERRIDES'] = array_merge($cfg, ['tile_ttl' => 3600]);
$dir = '${TMP_ROOT}/uploads/tiles/16/42174'; @mkdir($dir, 0775, true);
file_put_contents($dir . '/25886.bin', $PNG); touch($dir . '/25886.bin', time() - 2 * 86400);
$r = eplakTileHandle(['z' => '16', 'x' => '42174', 'y' => '25886'], [], function ($u) { return [0, '']; });
$out['stale'] = [$r['status'], $r['headers']['X-Eplak-Tile']];
/* ۶) کش کهنه + بالادستی سالم → تازه می‌شود (miss) */
touch($dir . '/25886.bin', time() - 2 * 86400);
$r = eplakTileHandle(['z' => '16', 'x' => '42174', 'y' => '25886'], [], function ($u) use ($PNG) { return [200, $PNG]; });
$out['refresh'] = [$r['status'], $r['headers']['X-Eplak-Tile'], (time() - filemtime($dir . '/25886.bin')) < 100];
jout($out);`));
ok('وقتی هیچ بالادستی جواب ندهد: ۵۰۲، بدون کش و بدون ذخیره‌ی خطا',
  fails?.allDown?.[0] === 502 && fails?.allDown?.[1] === 'no-store' && fails?.allDown?.[2] === false, JSON.stringify(fails?.allDown));
ok('صفحه‌ی HTML بلاک (به‌جای تصویر) رد می‌شود و منبع بعدی امتحان می‌شود',
  fails?.htmlThenGood?.[0] === 200 && fails?.htmlThenGood?.[1] === 'miss' && fails?.htmlThenGood?.[2] === 2, JSON.stringify(fails?.htmlThenGood));
ok('پاسخ ۲۰۰ غیرتصویری هرگز ذخیره/ارسال نمی‌شود', fails?.notImage === 502, String(fails?.notImage));
ok('تصویر بزرگ‌تر از سقف (tile_max_bytes) رد می‌شود', fails?.oversize === 502, String(fails?.oversize));
ok('کش کهنه + بالادستی قطع → نسخه‌ی کهنه داده می‌شود (نقشه خالی نمی‌ماند)',
  fails?.stale?.[0] === 200 && fails?.stale?.[1] === 'stale', JSON.stringify(fails?.stale));
ok('کش کهنه + بالادستی سالم → کاشی تازه می‌شود', fails?.refresh?.[0] === 200 && fails?.refresh?.[1] === 'miss' && fails?.refresh?.[2] === true, JSON.stringify(fails?.refresh));

console.log('\n=== سقف دریافت از بیرون، پاک‌سازی کش، قالب آدرس ===');
const misc = pickJson(await run(`
$out = [];
/* سقف: فقط ۲ دریافت تازه در دقیقه؛ کاشی‌های کش‌شده شمرده نمی‌شوند */
$GLOBALS['EPLAK_TILE_OVERRIDES'] = ['tile_fetch_per_minute' => 2];
@unlink('${TMP_ROOT}/uploads/tiles/.rate');
$f = function ($u) use ($PNG) { return [200, $PNG]; };
$codes = [];
foreach ([[15,21000,13000],[15,21001,13000],[15,21002,13000],[15,21003,13000]] as $t) {
  $r = eplakTileHandle(['z' => (string)$t[0], 'x' => (string)$t[1], 'y' => (string)$t[2]], [], $f);
  $codes[] = $r['status'] . ':' . ($r['headers']['X-Eplak-Tile'] ?? '');
}
$again = eplakTileHandle(['z' => '15', 'x' => '21000', 'y' => '13000'], [], $f);
$out['rate'] = $codes; $out['rateHit'] = [$again['status'], $again['headers']['X-Eplak-Tile']];
$GLOBALS['EPLAK_TILE_OVERRIDES'] = [];

/* پاک‌سازی: بودجه‌ی کوچک → قدیمی‌ترین‌ها اول حذف می‌شوند، .rate و .htaccess دست نمی‌خورند */
$d = '${TMP_ROOT}/cleanup-test'; @mkdir($d . '/a', 0775, true);
for ($i = 0; $i < 10; $i++) { file_put_contents($d . '/a/' . $i . '.bin', str_repeat('x', 1000)); touch($d . '/a/' . $i . '.bin', time() - (10 - $i) * 1000); }
file_put_contents($d . '/.rate', '1 1'); file_put_contents($d . '/.htaccess', 'x');
$removed = eplakTileCleanup($d, 5000);
$left = array_values(array_filter(scandir($d . '/a'), function ($n) { return $n[0] !== '.'; })); sort($left);
$out['cleanup'] = [$removed, $left, is_file($d . '/.rate'), is_file($d . '/.htaccess')];
$out['cleanupNoop'] = eplakTileCleanup($d, 10 * 1024 * 1024);

/* قالب آدرس: {key} و {s} */
$cfg = eplakTileConfig(); $cfg['tile_api_key'] = 'abc 123&x';
$out['tpl'] = eplakTileUpstreamUrl('https://{s}.maps.test/{z}/{x}/{y}.png?apiKey={key}', 7, 10, 20, $cfg);
/* تشخیص نوع تصویر */
$out['sniff'] = [eplakTileSniff($PNG), eplakTileSniff("\\xFF\\xD8\\xFF\\xE0" . str_repeat('x', 20)), eplakTileSniff('RIFF' . 'abcd' . 'WEBP' . 'VP8 '), eplakTileSniff('GIF89a' . str_repeat('x', 20)), eplakTileSniff('<html>'), eplakTileSniff('')];
jout($out);`));
ok('بیش از سقف دقیقه‌ای، دریافت تازه ۴۲۹ می‌شود', JSON.stringify(misc?.rate) === JSON.stringify(['200:miss', '200:miss', '429:rate-limited', '429:rate-limited']), JSON.stringify(misc?.rate));
ok('کاشی کش‌شده با وجود سقف هم داده می‌شود (hit)', misc?.rateHit?.[0] === 200 && misc?.rateHit?.[1] === 'hit', JSON.stringify(misc?.rateHit));
ok('پاک‌سازی کش، قدیمی‌ترین فایل‌ها را اول حذف می‌کند و به .rate/.htaccess دست نمی‌زند',
  misc?.cleanup?.[0] === 7 && JSON.stringify(misc?.cleanup?.[1]) === JSON.stringify(['7.bin', '8.bin', '9.bin']) && misc?.cleanup?.[2] === true && misc?.cleanup?.[3] === true,
  JSON.stringify(misc?.cleanup));
ok('اگر کش زیر بودجه باشد چیزی پاک نمی‌شود', misc?.cleanupNoop === 0, String(misc?.cleanupNoop));
ok('قالب آدرس: {key} کدگذاری می‌شود و {s} زیردامنه می‌دهد',
  /^https:\/\/[abc]\.maps\.test\/7\/10\/20\.png\?apiKey=abc%20123%26x$/.test(misc?.tpl || ''), String(misc?.tpl));
ok('تشخیص نوع از بایت‌ها: PNG/JPEG/WebP قبول، GIF/HTML/خالی رد',
  JSON.stringify(misc?.sniff) === JSON.stringify(['image/png', 'image/jpeg', 'image/webp', null, null, null]), JSON.stringify(misc?.sniff));

console.log('\n=== دریافت واقعی HTTP از «OSM ساختگی» (cURL و stream) ===');
const seenReq = [];
const png = Buffer.from(PNG_B64, 'base64');
const mock = http.createServer((req, res) => {
  seenReq.push({ url: req.url, ua: req.headers['user-agent'], ref: req.headers['referer'] });
  if (req.url.startsWith('/bad/')) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('blocked'); return; }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length }); res.end(png);
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const mockPort = mock.address().port;
for (const driver of ['curl', 'stream']) {
  const before = seenReq.length;
  const real = pickJson(await run(`
$GLOBALS['EPLAK_TILE_OVERRIDES'] = [
  'tile_upstreams' => ['http://127.0.0.1:${mockPort}/bad/{z}/{x}/{y}.png', 'http://127.0.0.1:${mockPort}/good/{z}/{x}/{y}.png'],
  'tile_http_driver' => '${driver}', 'tile_user_agent' => 'EplakTest/9 (+https://eplak.ir)', 'tile_referer' => 'https://eplak.ir/',
];
$r = eplakTileHandle(['z' => '14', 'x' => '${driver === 'curl' ? 10542 : 10543}', 'y' => '6471']);
jout(['s' => $r['status'], 'n' => $r['headers']['X-Eplak-Tile'] ?? '', 'same' => md5($r['body']) === md5($PNG)]);`));
  const mine = seenReq.slice(before);
  ok(`درایور ${driver}: منبع اول ۴۰۳ می‌دهد → منبع دوم → تصویر درست رسید`,
    real?.s === 200 && real?.n === 'miss' && real?.same === true && mine.length === 2, JSON.stringify({ real, hits: mine.length }));
  ok(`درایور ${driver}: User-Agent و Referer شناسه‌دار به بالادستی می‌رود (شرط سیاست OSM)`,
    mine.length > 0 && mine.every((r) => r.ua === 'EplakTest/9 (+https://eplak.ir)' && r.ref === 'https://eplak.ir/'), JSON.stringify(mine[0]));
}
mock.close();

console.log('\n=== اندپوینت api/tiles.php ===');
await run(`
@mkdir('${TMP_ROOT}/uploads/tiles/12/2635', 0775, true);
file_put_contents('${TMP_ROOT}/uploads/tiles/12/2635/1617.bin', $PNG);`);
const ep = pickJson(await run(`
$_GET = ['z' => '12', 'x' => '2635', 'y' => '1617'];
$_SERVER['REQUEST_METHOD'] = 'GET';
ob_start();
require '${APP}/api/tiles.php';
$out = ob_get_clean();
$code = http_response_code();
$_GET = ['z' => 'abc', 'x' => '1', 'y' => '1'];
ob_start();
require '${APP}/api/tiles.php';
$bad = ob_get_clean();
jout(['code' => $code, 'same' => md5($out) === md5($PNG), 'len' => strlen($out), 'bad' => $bad]);`));
ok('اندپوینت، کاشی کش‌شده را با همان بایت‌ها می‌دهد', ep?.code === 200 && ep?.same === true, JSON.stringify(ep));
ok('اندپوینت برای پارامتر نامعتبر متن خطا می‌دهد (نه JSON/صفحه‌ی PHP)', ep?.bad === 'bad-params', JSON.stringify(ep?.bad));
const epSrc = read('api/tiles.php');
const epCode = epSrc.replace(/\/\*[\s\S]*?\*\//g, '');
ok('اندپوینت کاشی به دیتابیس وابسته نیست (قطعی DB نقشه را نمی‌اندازد)',
  !/_common\.php|bootstrap\.php|eplakGetPdo|admin\/includes\/db\.php/.test(epCode) && /shared\/tiles\.php/.test(epCode));
const htaccess = read('.htaccess');
ok('.htaccess جلوی «no-store» را برای کاشی‌ها می‌گیرد (کش یک‌روزه در اپ)',
  /<FilesMatch "\^tiles\\\.php\$">[\s\S]{0,200}Cache-Control "public, max-age=86400"/.test(htaccess));
const tilesSrc = read('shared/tiles.php');
ok('پروکسی User-Agent و Referer شناسه‌دار می‌فرستد و Referer/UA مرورگر را جعل نمی‌کند',
  /EplakVaramin\/2\.0/.test(tilesSrc) && /CURLOPT_REFERER/.test(tilesSrc) && !/Mozilla\/5\.0/.test(tilesSrc));
ok('نمایه‌ی تنظیم: منبع بالادستی و کلید از shared/config.php خوانده می‌شود (مثلاً «تایل رستر نشان»)',
  /tile_upstreams/.test(tilesSrc) && /tile_api_key/.test(tilesSrc) && /strpos\(\$key, 'tile_'\) === 0/.test(tilesSrc)
  && /tile_upstreams/.test(read('shared/config.example.php')));

/* ══════════ ۲) کلاینت: موتور نقشه ══════════ */
console.log('\n=== موتور نقشه: منبع‌های کاشی و جابه‌جایی خودکار ===');

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = []; this.dataset = {}; this.style = {}; this.attrs = {};
    this._class = new Set(); this._className = ''; this.listeners = {};
    this.parentNode = null; this._html = ''; this.textContent = '';
    this.classList = {
      add: (c) => this._class.add(c), remove: (c) => this._class.delete(c), contains: (c) => this._class.has(c),
      toggle: (c, on) => { if (on === undefined) { this._class.has(c) ? this._class.delete(c) : this._class.add(c); } else if (on) { this._class.add(c); } else { this._class.delete(c); } },
    };
  }
  set className(v) { this._className = String(v); String(v).split(/\s+/).forEach((c) => c && this._class.add(c)); }
  get className() { return this._className; }
  set innerHTML(v) {
    this._html = String(v); this.children = [];
    const re = /<(\w+)([^>]*?)\/?>/g; let m;
    while ((m = re.exec(this._html)) !== null) {
      const child = new FakeNode(m[1]);
      if (m[2]) { const cm = /class="([^"]+)"/.exec(m[2]); if (cm) cm[1].split(/\s+/).forEach((c) => c && child._class.add(c)); }
      this.appendChild(child);
    }
  }
  get innerHTML() { return this._html; }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  removeChild(node) { this.children = this.children.filter((c) => c !== node); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  dispatch(type, ev) { (this.listeners[type] || []).slice().forEach((fn) => fn(ev || {})); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  querySelector(sel) { return this._findAll(sel)[0] || null; }
  querySelectorAll(sel) { return this._findAll(sel); }
  _matches(node, sel) {
    if (sel === '[data-tile]') return !!(node.dataset && node.dataset.tile);
    const m = /^\[data-tile="(.+)"\]$/.exec(sel);
    if (m) return node.dataset && node.dataset.tile === m[1];
    if (sel.startsWith('.')) return node._class.has(sel.slice(1));
    return node.tagName === sel.toUpperCase();
  }
  _findAll(sel) { const out = []; const walk = (n) => n.children.forEach((c) => { if (this._matches(c, sel)) out.push(c); walk(c); }); walk(this); return out; }
  getBoundingClientRect() { return { width: this._rectW || 256, height: this._rectH || 256, left: 0, top: 0 }; }
}

/* ساعت ساختگی: نگهبان زمانی بدون انتظار واقعی آزموده می‌شود */
function makeSandbox({ apiBase } = {}) {
  const head = new FakeNode('head');
  const timers = new Map(); let nextId = 1;
  const sandbox = {
    console, Math, Date, JSON, Number, isFinite, parseInt, parseFloat,
    document: { head, documentElement: head, getElementById: () => null, createElement: (t) => new FakeNode(t), addEventListener() {}, removeEventListener() {} },
    window: null,
    addEventListener() {}, removeEventListener() {},
    fetch: async () => ({ ok: false, json: async () => null }),
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    _timers: timers,
    _runTimers() { const list = Array.from(timers.entries()); timers.clear(); list.forEach(([, t]) => t.fn()); return list.length; },
  };
  sandbox.window = sandbox;
  if (apiBase) sandbox.eplakApiBase = () => apiBase;
  vm.createContext(sandbox);
  vm.runInContext(read('assets/js/ep-map.js'), sandbox, { filename: 'ep-map.js' });
  return sandbox;
}
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const tiles = (box) => box.querySelectorAll('[data-tile]');

const sbPlain = makeSandbox();
ok('بدون آدرس API: فقط OpenStreetMap مستقیم (مثل پنل بدون پروکسی)',
  JSON.stringify(sbPlain.EplakMap.resolveTileSources({})) === JSON.stringify([OSM]));
const sbApp = makeSandbox({ apiBase: 'https://eplak.ir/eplak-fixed/api/' });
ok('در اپ: اول سرور خودِ ای‌پلاک (api/tiles.php)، بعد OpenStreetMap مستقیم',
  JSON.stringify(sbApp.EplakMap.resolveTileSources({})) === JSON.stringify(['https://eplak.ir/eplak-fixed/api/tiles.php?z={z}&x={x}&y={y}', OSM]),
  JSON.stringify(sbApp.EplakMap.resolveTileSources({})));
ok('در پنل ادمین: tileProxy نسبی پذیرفته می‌شود',
  JSON.stringify(sbPlain.EplakMap.resolveTileSources({ tileProxy: '../api/tiles.php' })) === JSON.stringify(['../api/tiles.php?z={z}&x={x}&y={y}', OSM]));
ok('options.tileSources بر همه‌چیز می‌چربد؛ window.EPLAK_MAP_TILE_SOURCES هم کار می‌کند',
  JSON.stringify(sbApp.EplakMap.resolveTileSources({ tileSources: ['A/{z}/{x}/{y}'] })) === JSON.stringify(['A/{z}/{x}/{y}'])
  && (() => { const s = makeSandbox({ apiBase: 'x' }); s.EPLAK_MAP_TILE_SOURCES = ['B/{z}/{x}/{y}']; return JSON.stringify(s.EplakMap.resolveTileSources({})) === JSON.stringify(['B/{z}/{x}/{y}']); })());

/* ── جابه‌جایی به منبع بعدی ── */
{
  const sb = makeSandbox({ apiBase: 'https://eplak.ir/eplak-fixed/api' });
  const box = new FakeNode('div');
  const map = sb.EplakMap.create(box, { lat: 35.3242, lng: 51.6455, zoom: 17, hasFix: true });
  const first = tiles(box)[0];
  ok('کاشی‌ها اول از سرور خودمان درخواست می‌شوند', /^https:\/\/eplak\.ir\/eplak-fixed\/api\/tiles\.php\?z=17&x=\d+&y=\d+$/.test(first.src), String(first.src));
  ok('کاشی‌ها eager هستند (lazy در وب‌ویو دیر می‌آمد)', tiles(box).every((n) => n.loading === 'eager'));
  first.dispatch('error');
  ok('اگر سرور خودمان جواب نداد، همان کاشی از OSM مستقیم گرفته می‌شود (بدون پنهان شدن)',
    /^https:\/\/tile\.openstreetmap\.org\/17\/\d+\/\d+\.png$/.test(first.src) && first.style.visibility !== 'hidden', String(first.src));
  first.dispatch('load');
  const st = map.tileStatus();
  ok('منبع موفق به‌عنوان منبع فعال به خاطر سپرده می‌شود', st.verified === 1 && st.active === 1 && st.errors === 0, JSON.stringify({ v: st.verified, a: st.active }));
  map.setPosition(35.40, 51.70);
  ok('کاشی‌های بعدی مستقیم از منبع تأییدشده شروع می‌شوند', tiles(box).every((n) => /^https:\/\/tile\.openstreetmap\.org\//.test(n.src)), String(tiles(box)[0].src));
}

/* ── همه‌ی منبع‌ها شکست بخورند → پیام + «تلاش دوباره» ── */
{
  const sb = makeSandbox({ apiBase: 'https://eplak.ir/eplak-fixed/api' });
  const box = new FakeNode('div');
  const map = sb.EplakMap.create(box, { lat: 35.3242, lng: 51.6455, zoom: 17, hasFix: true });
  const fallback = box.querySelector('.ep-map-fallback');
  ok('پیام «نقشه در دسترس نیست» دکمه‌ی «تلاش دوباره» دارد', !!box.querySelector('.ep-map-retry'));
  ok('پیش از شکست، پیام دیده نمی‌شود', !fallback.classList.contains('show'));
  /* هر کاشی را پشت‌سرهم از هر دو منبع شکست بده */
  tiles(box).forEach((n) => { n.dispatch('error'); n.dispatch('error'); });
  ok('وقتی هر دو منبع شکست بخورند، پیام و مختصات دیده می‌شود', fallback.classList.contains('show') && /\d+\.\d{6}, \d+\.\d{6}/.test(box.querySelector('.ep-map-coords').textContent || ''),
    box.querySelector('.ep-map-coords').textContent);
  ok('کاشی شکست‌خورده پنهان می‌شود', tiles(box).every((n) => n.style.visibility === 'hidden'));
  box.querySelector('.ep-map-retry').dispatch('click');
  const st = map.tileStatus();
  ok('«تلاش دوباره»: پیام بسته می‌شود و دوباره از منبع اول شروع می‌کند',
    !fallback.classList.contains('show') && st.active === 0 && st.verified === -1 && st.errors === 0
    && tiles(box).length > 0 && tiles(box).every((n) => /\/api\/tiles\.php\?/.test(n.src)), JSON.stringify(st));
  tiles(box)[0].dispatch('load');
  ok('پس از تلاش دوباره، با اولین کاشی موفق منبع اول تأیید می‌شود', map.tileStatus().verified === 0);
}

/* ── نگهبان زمانی (شبکه نه خطا می‌دهد نه تصویر) ── */
{
  const sb = makeSandbox({ apiBase: 'https://eplak.ir/eplak-fixed/api' });
  const box = new FakeNode('div');
  const map = sb.EplakMap.create(box, { lat: 35.3242, lng: 51.6455, zoom: 16, hasFix: true });
  ok('نگهبان زمانی هنگام ساخت نقشه فعال می‌شود', sb._timers.size === 1);
  const delay = Array.from(sb._timers.values())[0].ms;
  ok('مهلت نگهبان معقول است (۸ تا ۲۰ ثانیه؛ شبکه‌ی کند موبایل را زود رد نمی‌کند)', delay >= 8000 && delay <= 20000, String(delay));
  sb._runTimers();
  ok('اگر در مهلت هیچ کاشی نیامد، همه‌ی کاشی‌ها از منبع بعدی گرفته می‌شوند',
    map.tileStatus().active === 1 && tiles(box).every((n) => /tile\.openstreetmap\.org/.test(n.src)), JSON.stringify(map.tileStatus()));
  sb._runTimers();
  ok('اگر منبع آخر هم ساکت ماند، پیام «نقشه در دسترس نیست» نشان داده می‌شود',
    box.querySelector('.ep-map-fallback').classList.contains('show'));
}
{
  const sb = makeSandbox({ apiBase: 'https://eplak.ir/eplak-fixed/api' });
  const box = new FakeNode('div');
  const map = sb.EplakMap.create(box, { lat: 35.3242, lng: 51.6455, zoom: 16, hasFix: true });
  tiles(box)[0].dispatch('load');
  ok('اگر حتی یک کاشی بیاید، نگهبان خاموش می‌شود و منبع عوض نمی‌شود',
    sb._timers.size === 0 && map.tileStatus().active === 0 && map.tileStatus().loaded === true);
  map.destroy();
}

const mapSrc = read('assets/js/ep-map.js');
ok('نقشه هنوز آدرس OpenStreetMap مستقیم را (به‌عنوان منبع دوم) دارد',
  /tile\.openstreetmap\.org/.test(mapSrc) && /© OpenStreetMap/.test(mapSrc));
ok('پنل ادمین کاشی‌ها را از همان پروکسی می‌گیرد', /tileProxy: '\.\.\/api\/tiles\.php'/.test(read('admin/report_detail.php')) && /ep-map\.js\?v=4/.test(read('admin/report_detail.php')));
ok('دکمه‌ی «مشاهده در نقشه» در اپ، برنامه‌های نقشه‌ی گوشی (نشان، بلد، …) را از طریق geo: باز می‌کند',
  /AndroidApp\.openUrl\('geo:'/.test(read('modules/reports.js')));

console.log('\n' + '='.repeat(52));
console.log(`TILES: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
