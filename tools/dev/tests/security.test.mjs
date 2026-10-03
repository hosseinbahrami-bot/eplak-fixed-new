/* security.test.mjs — «ابزار ناامن rescue-db.php حذف شده و برنمی‌گردد»
   ------------------------------------------------------------------
   چرا: rescue-db.php رمز نداشت و درخواست POST آن (حتی وقتی سایت سالم بود)
   فایل shared/config.php را با اطلاعات دلخواهِ فرستنده بازنویسی می‌کرد؛ یعنی هر
   کسی می‌توانست سایت را به دیتابیسِ خودش وصل کند. به درخواست مالک حذف شد.
   شاخه‌های قدیمی‌تر (PR #2 و #4) هنوز آن را دارند؛ این آزمون جلوی بازگشت
   تصادفی‌اش (مثلاً با ادغام آن شاخه‌ها) را می‌گیرد.

   چه چیزی بررسی می‌شود (بخش ۳ «واقعاً اجرا» می‌شود، نه فقط متن‌کاوی):
     ۱) هیچ فایلی با نام rescue-db.php در مخزن نیست و هیچ PHP دیگری هم کد
        آن ابزار را ندارد (تغییر نام)
     ۲) .htaccess دسترسی وب به آن را (Apache 2.4 و 2.2) می‌بندد؛ نسخه‌ی
        قدیمیِ باقی‌مانده روی هاست با Extract کردن بسته‌ی تازه از وب بسته می‌شود
     ۳) اسکریپت ساخت بسته (tools/build-update-package.sh) روی یک کپی تمیز اجرا
        می‌شود: بسته‌ی سالم ساخته می‌شود؛ با وجود rescue-db.php یا بدون قاعده‌ی
        .htaccess، ساخت شکست می‌خورد
     ۴) بسته‌ی آپلودِ ثبت‌شده در مخزن (eplak-fixed-update.zip) آن را ندارد و
        .htaccess داخلش قاعده‌ی بستن را دارد
     ۵) راهنماها و live-check دیگر کسی را به باز کردن/دانلود آن راهنمایی نمی‌کنند
*/
import fs from 'fs'; import path from 'path'; import os from 'os'; import zlib from 'zlib';
import { spawnSync } from 'child_process';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };

const SKIP_DIRS = new Set(['.git', 'node_modules', '.arena']);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/* ── ۱) مخزن ─────────────────────────────────────────────────────────────── */
console.log('— ۱) مخزن');
const files = walk(ROOT);
const named = files.filter((f) => path.basename(f).toLowerCase() === 'rescue-db.php');
ok('هیچ فایلی با نام rescue-db.php در مخزن نیست', named.length === 0, named.map((f) => path.relative(ROOT, f)).join(', '));

const SIGNATURE = /function\s+rescueTest\s*\(|function\s+rescueDiscover\s*\(|config\.rescue-done/;
const clones = files.filter((f) => f.endsWith('.php')).filter((f) => SIGNATURE.test(fs.readFileSync(f, 'utf8')));
ok('هیچ فایل PHP دیگری کد آن ابزار را (با نام دیگر) ندارد', clones.length === 0, clones.map((f) => path.relative(ROOT, f)).join(', '));

/* ── ۲) .htaccess ────────────────────────────────────────────────────────── */
console.log('— ۲) .htaccess');
const htaccess = read('.htaccess');
const block = htaccess.match(/^<FilesMatch\s+"(\^rescue-db\\\.php\$)">([\s\S]*?)^<\/FilesMatch>/m);
ok('بلوک FilesMatch برای rescue-db.php هست (نه داخل کامنت)', !!block);
const body = block ? block[2] : '';
ok('Apache 2.4: «Require all denied» زیر mod_authz_core', /<IfModule mod_authz_core\.c>\s*Require all denied\s*<\/IfModule>/.test(body));
ok('Apache 2.2: «Deny from all» زیر !mod_authz_core', /<IfModule !mod_authz_core\.c>\s*Order allow,deny\s*Deny from all\s*<\/IfModule>/.test(body));
if (block) {
  const re = new RegExp(block[1]);
  ok('الگوی بلوک دقیقاً همین نام را می‌گیرد (نقطه‌ی نقطه، نه هر نویسه)',
    re.test('rescue-db.php') && !re.test('rescue-dbXphp') && !re.test('index.php') && !re.test('admin.php') && !re.test('xrescue-db.php'));
}
/* هر بلوک FilesMatch باز باید بسته شود (یک بلوک ناقص کل .htaccess را خراب می‌کند و سایت ۵۰۰ می‌دهد) */
const opens = (htaccess.match(/^<FilesMatch\b/gm) || []).length, closes = (htaccess.match(/^<\/FilesMatch>/gm) || []).length;
ok('همه‌ی بلوک‌های FilesMatch و IfModule در .htaccess درست بسته شده‌اند',
  opens === closes && (htaccess.match(/^\s*<IfModule\b/gm) || []).length === (htaccess.match(/^\s*<\/IfModule>/gm) || []).length,
  `FilesMatch ${opens}/${closes}`);

/* ── ۳) اسکریپت ساخت بسته (اجرای واقعی روی کپی تمیز) ──────────────────────── */
console.log('— ۳) ساخت بسته');
const haveZip = spawnSync('zip', ['-v'], { stdio: 'ignore' }).status === 0 && spawnSync('unzip', ['-v'], { stdio: 'ignore' }).status === 0;
if (!haveZip) {
  console.log('  ⏭  zip/unzip روی این دستگاه نصب نیست؛ بخش اجرای ساخت بسته رد شد (در CI اجرا می‌شود)');
} else {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'eplak-security-'));
  const copy = path.join(TMP, 'proj');
  fs.cpSync(ROOT, copy, {
    recursive: true,
    filter: (src) => {
      const b = path.basename(src);
      return !SKIP_DIRS.has(b) && !(b.endsWith('.zip') && path.dirname(src) === ROOT);
    },
  });
  const build = () => spawnSync('bash', ['tools/build-update-package.sh'], { cwd: copy, encoding: 'utf8' });

  const r1 = build();
  ok('بسته‌ی سالم ساخته می‌شود و پیام تأیید امنیتی را می‌دهد',
    r1.status === 0 && /ابزار ناامن rescue-db\.php داخل بسته نیست/.test(r1.stdout), (r1.stdout + r1.stderr).slice(-300));

  fs.writeFileSync(path.join(copy, 'rescue-db.php'), '<?php // نسخه‌ی قدیمیِ ناامن که دوباره آمده\n');
  const r2 = build();
  ok('اگر rescue-db.php دوباره به مخزن بیاید، ساخت بسته شکست می‌خورد',
    r2.status !== 0 && /rescue-db\.php نباید داخل بسته باشد/.test(r2.stdout), `status=${r2.status}`);
  fs.rmSync(path.join(copy, 'rescue-db.php'));

  const htPath = path.join(copy, '.htaccess');
  const htOrig = fs.readFileSync(htPath, 'utf8');
  fs.writeFileSync(htPath, htOrig.replace(/^<FilesMatch\s+"\^rescue-db\\\.php\$">[\s\S]*?^<\/FilesMatch>\n?/m, ''));
  const r3 = build();
  ok('اگر قاعده‌ی .htaccess برداشته شود، ساخت بسته شکست می‌خورد',
    r3.status !== 0 && /قاعده‌ی بستن rescue-db\.php در \.htaccess/.test(r3.stdout), `status=${r3.status}`);
  fs.writeFileSync(htPath, htOrig);

  const r4 = build();
  ok('پس از برگرداندن، دوباره سالم ساخته می‌شود', r4.status === 0, (r4.stdout + r4.stderr).slice(-200));
  fs.rmSync(TMP, { recursive: true, force: true });
}

/* ── ۴) بسته‌ی آپلودِ ثبت‌شده در مخزن ────────────────────────────────────── */
console.log('— ۴) eplak-fixed-update.zip');
function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip نیست');
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || off === 0xffffffff) throw new Error('zip64 پشتیبانی نمی‌شود');
  const entries = new Map();
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('فهرست مرکزی zip خراب است');
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    const nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    entries.set(buf.toString('utf8', off + 46, off + 46 + nl), { method, csize, lho });
    off += 46 + nl + el + cl;
  }
  const get = (name) => {
    const e = entries.get(name); if (!e) return null;
    const ln = buf.readUInt16LE(e.lho + 26), le = buf.readUInt16LE(e.lho + 28);
    const raw = buf.subarray(e.lho + 30 + ln + le, e.lho + 30 + ln + le + e.csize);
    return e.method === 0 ? raw : zlib.inflateRawSync(raw);
  };
  return { names: [...entries.keys()], get };
}

const zipPath = path.join(ROOT, 'eplak-fixed-update.zip');
if (!fs.existsSync(zipPath)) {
  console.log('  ⏭  eplak-fixed-update.zip در این شاخه نیست؛ بخش بسته رد شد');
} else {
  let z = null, zerr = '';
  try { z = readZip(zipPath); } catch (e) { zerr = String(e && e.message || e); }
  ok('بسته خوانده می‌شود (فهرست مرکزی سالم)', !!z && z.names.length > 100, zerr);
  if (z) {
    ok('خواننده‌ی zip درست کار می‌کند (index.html و .htaccess داخل بسته‌اند)', z.names.includes('index.html') && z.names.includes('.htaccess'));
    const bad = z.names.filter((n) => /(^|\/)rescue-db\.php$/i.test(n));
    ok('rescue-db.php داخل بسته‌ی آپلود نیست', bad.length === 0, bad.join(', ') + ' — بسته را با tools/build-update-package.sh دوباره بسازید');
    const zh = z.get('.htaccess');
    ok('.htaccess داخل بسته قاعده‌ی بستن rescue-db.php را دارد',
      !!zh && /^<FilesMatch\s+"\^rescue-db\\\.php\$">/m.test(zh.toString('utf8')) && /Require all denied/.test(zh.toString('utf8')));
    ok('.htaccess داخل بسته با .htaccess مخزن یکی است', !!zh && zh.toString('utf8') === htaccess,
      'بسته کهنه است؛ دوباره بسازید');
  }
}

/* ── ۵) راهنماها و live-check ────────────────────────────────────────────── */
console.log('— ۵) راهنماها');
const docFiles = ['README.md', ...fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f)]
  .filter((f) => fs.existsSync(path.join(ROOT, f)));
/* آدرس‌دادن به این فایل فقط برای «کنترل بسته بودنش» (با ذکر ۴۰۳/۴۰۴) مجاز است، نه برای باز کردن */
const URL_TO_TOOL = /(https?:\/\/[^\s`)>]*|<[^>\n]+>\/|\/)rescue-db\.php/;
const CLOSED_CHECK = /403|404|۴۰۳|۴۰۴/;
const docsBad = docFiles.filter((f) => read(f).split('\n').some((l) => URL_TO_TOOL.test(l) && !CLOSED_CHECK.test(l)));
ok('هیچ راهنمایی آدرس rescue-db.php را برای باز کردن نمی‌دهد (فقط کنترل ۴۰۳/۴۰۴)', docsBad.length === 0, docsBad.join(', '));

const lc = read('tools/live-check.sh');
ok('live-check دیگر دانلود/باز کردن rescue-db.php را پیشنهاد نمی‌کند (فقط حضورش را می‌سنجد)',
  !/raw\/[^"\s]*rescue-db\.php/.test(lc) && !/say "[^"]*باز کنید[^"]*rescue-db/.test(lc));
const fa = read('docs/DEPLOY_UPDATE_FA.md'), en = read('docs/DEPLOY_UPDATE_EN.md');
const near = (t) => { const i = t.indexOf('rescue-db.php'); return i >= 0 && /File Manager/.test(t.slice(i, i + 700)); };
ok('راهنمای فارسی و انگلیسی می‌گویند نسخه‌ی قدیمیِ روی هاست را از File Manager پاک کنید', near(fa) && near(en));
ok('راه جایگزین (ساخت دستیِ shared/config.php از روی config.example.php) در هر دو راهنما هست',
  /config\.example\.php/.test(fa) && /config\.example\.php/.test(en) && fs.existsSync(path.join(ROOT, 'shared/config.example.php')));

console.log('\n' + '='.repeat(52));
console.log(`SECURITY: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
