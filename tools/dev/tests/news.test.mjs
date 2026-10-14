/* news.test.mjs — «اخبار و دانستنی‌ها» در پنل، API و اپ
   ============================================================================
   گزارش کارفرما:
     • در اپ، «خانه» بخش میراث ورامین را نشان می‌دهد ولی «اخبار و اطلاعیه‌ها» خالی است
     • در پنل ادمین هم چیزی نشان داده نمی‌شود
     • خواسته: از پنل بشود خبر و دانستنی را با «عکس و متن» افزود و ویرایش کرد

   ریشه‌ها (همه در این آزمون شبیه‌سازی می‌شوند):
     ۱) در دامپ اصلی دیتابیس (backend/DBasli/eplak_db.sql) جدول news «نیست»
        → api/news.php خطای ۵۰۰ ⇒ اپ هیچ خبری نمی‌بیند
        → admin/news.php با SELECT COUNT(*) از جدولِ نبوده صفحه‌ی سفید می‌دهد
     ۲) در دامپ قدیمی (backend/eplak-db.sql) جدول news هست ولی ستون badge ندارد
        → SELECT صریحِ badge در api/news.php ⇒ «Unknown column» ⇒ ۵۰۰ ⇒ اپ خالی
        → createNews()/updateNews() هم «همیشه» badge را می‌خواستند ⇒ افزودن و
          ویرایش مطلب در پنل هرگز موفق نمی‌شد ⇒ فهرست پنل برای همیشه خالی
     ۳) نویسه‌گان جدول utf8 سه‌بایتی است ⇒ ایموجیِ آیکون‌ها (🌳🏛️) ذخیره نمی‌شود
        ⇒ حتی درج محتوای پیش‌فرض شکست می‌خورد ⇒ جدول خالی می‌ماند
     ۴) تصویرِ آپلودشده در پنل (uploads/news/…) در اپ با آدرس نسبی خوانده می‌شد؛
        اپ صفحه را از file:// باز می‌کند ⇒ تصویر به فایلِ داخل گوشی اشاره می‌کرد
        ⇒ عکس مطلب در اپ دیده نمی‌شد

   چه چیزی سنجیده می‌شود:
     • ساخت/ترمیم خودکار جدول و ستون‌ها، و درج محتوای پیش‌فرض وقتی جدول خالی است
     • api/news.php «هرگز» ۵۰۰ نمی‌دهد؛ با ستون‌های موجود کار می‌کند و degraded/hint می‌دهد
     • افزودن/ویرایش/حذف/تغییر وضعیت از پنل روی دیتابیس قدیمی هم کار می‌کند
     • صفحه‌های پنل (news.php، news_add.php، news_edit.php) بدون خطای PHP رندر می‌شوند
     • اپ واقعی (jsdom) فهرست خبرها، کارت‌های دانستنی «با عکس»، و حالت خالی را نشان می‌دهد
     • در اپِ file:// آدرس تصویرِ آپلودشده به دامنه‌ی سرور وصل می‌شود
   ============================================================================ */
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import fs from 'fs';
import path from 'path';

const APP = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const DB = '/tmp/eplak-regression-news.sqlite';

let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? '  — ' + extra : '')); }
};
const section = (t) => console.log('\n=== ' + t + ' ===');
const pickJson = (text) => {
  const m = String(text).match(/\{[\s\S]*\}/g);
  if (!m) return null;
  for (let i = m.length - 1; i >= 0; i--) { try { return JSON.parse(m[i]); } catch (e) { /* بعدی */ } }
  return null;
};
const phpVal = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  if (Array.isArray(v)) return '[' + v.map(phpVal).join(', ') + ']';
  return '[' + Object.keys(v).map((k) => phpVal(k) + ' => ' + phpVal(v[k])).join(', ') + ']';
};

if (fs.existsSync(DB)) fs.unlinkSync(DB);
const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);

/* schemaReadonly = کاربر دیتابیس اجازه‌ی ALTER ندارد (هاست قفل‌شده) */
let schemaReadonly = false;
const run = async (code) => String((await php.run({
  code: "<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=" + DB + "');"
    + " putenv('EPLAK_SCHEMA_READONLY=" + (schemaReadonly ? '1' : '0') + "');"
    + " ini_set('session.save_path', '/tmp'); " + code,
})).text).trim();

const rawApi = (script, opts) => run(
  '$_SERVER = ' + phpVal(Object.assign({
    REQUEST_METHOD: (opts && opts.method) || 'GET',
    SCRIPT_NAME: '/' + script, PHP_SELF: '/' + script, HTTP_HOST: 'eplak.test', HTTPS: 'on',
  }, (opts && opts.server) || {})) + ';'
  + '$_GET = ' + phpVal((opts && opts.get) || {}) + ';'
  + '$_POST = ' + phpVal((opts && opts.post) || {}) + ';'
  + '$_SESSION = [];'
  + "require '" + APP + '/' + script + "';"
);
const api = async (script, opts) => pickJson(await rawApi(script, opts));

/* پاک کردن نشانه‌های کش‌شده تا سناریوی بعدی «از صفر» بررسی شود */
const resetNewsMarkers = () => run(
  "require '" + APP + "/admin/includes/db.php';"
  + "$pdo->exec(\"DELETE FROM app_settings WHERE setting_key IN "
  + "('news_schema_ok','news_seeded','news_schema_retry_at','news_schema_retry_ro','schema_version')\");"
  + "echo 'reset';");

/* ───────────────────────── ۱) دیتابیس تازه ───────────────────────── */
section('۱) دیتابیس تازه: جدول news ساخته و محتوای پیش‌فرض درج می‌شود');
const fresh = pickJson(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "$cols = $pdo->query('PRAGMA table_info(news)')->fetchAll(PDO::FETCH_COLUMN, 1);\n"
  + "echo json_encode([\n"
  + "  'cols' => $cols,\n"
  + "  'all' => (int) $pdo->query('SELECT COUNT(*) FROM news')->fetchColumn(),\n"
  + "  'news' => (int) $pdo->query(\"SELECT COUNT(*) FROM news WHERE type='news'\")->fetchColumn(),\n"
  + "  'tip' => (int) $pdo->query(\"SELECT COUNT(*) FROM news WHERE type='tip'\")->fetchColumn(),\n"
  + "  'img' => (int) $pdo->query(\"SELECT COUNT(*) FROM news WHERE image_url IS NOT NULL AND image_url <> ''\")->fetchColumn(),\n"
  + "]);"));
ok('جدول news ساخته شد', !!fresh && Array.isArray(fresh.cols) && fresh.cols.length > 0, JSON.stringify(fresh).slice(0, 200));
ok('ستون‌های لازم هست (badge، image_url، summary، sort_order، published)',
  ['badge', 'image_url', 'summary', 'sort_order', 'published'].every((c) => (fresh.cols || []).includes(c)),
  JSON.stringify(fresh && fresh.cols));
ok('محتوای پیش‌فرض یک‌بار درج شد (۴ خبر + ۲ دانستنی)', fresh && fresh.all === 6 && fresh.news === 4 && fresh.tip === 2, JSON.stringify(fresh));
ok('دانستنی‌های پیش‌فرض «با عکس» هستند (مسجد جامع و برج علاءالدوله)', (fresh && fresh.img || 0) >= 2, JSON.stringify(fresh));

/* ───────────────────────── ۲) api/news.php ───────────────────────── */
section('۲) api/news.php — همان چیزی که اپ می‌خواند');
const allRaw = await rawApi('api/news.php', { get: { limit: '50' } });
const all = pickJson(allRaw);
ok('پاسخ سالم JSON است و خطای SQL/۵۰۰ ندارد',
  !!all && !/Unknown column|no such column|SQLSTATE|Fatal error|Warning:/.test(allRaw), allRaw.slice(0, 200));
ok('success=true و ۶ مطلب برمی‌گردد', all && all.success === true && all.count === 6, JSON.stringify(all && { success: all.success, count: all.count }));
ok('خبرها و دانستنی‌ها جدا برمی‌گردند (news/tips)',
  all && (all.news || []).length === 4 && (all.tips || []).length === 2, JSON.stringify({ n: (all && all.news || []).length, t: (all && all.tips || []).length }));
ok('هر مطلب عنوان، متن، آیکون و تاریخ دارد',
  all && (all.items || []).every((i) => i.title && i.body && i.icon && ('updated_at' in i)), JSON.stringify((all && all.items || [])[0]));
ok('نشانی تصویر دانستنی‌ها (assets/…) نسبی می‌ماند تا آفلاین هم کار کند',
  all && (all.tips || []).some((t) => t.image_url === 'assets/img/varamin-mosque.jpg' && t.image_abs === 'assets/img/varamin-mosque.jpg'),
  JSON.stringify((all && all.tips || []).map((t) => t.image_url)));
ok('نشان/زیرعنوان (badge) دانستنی‌ها برمی‌گردد',
  all && (all.tips || []).some((t) => /۷۲۲/.test(String(t.badge || ''))), JSON.stringify((all && all.tips || []).map((t) => t.badge)));

const onlyTips = await api('api/news.php', { get: { type: 'tip' } });
ok('فیلتر type=tip فقط دانستنی‌ها را می‌دهد', onlyTips && onlyTips.success === true && (onlyTips.items || []).length === 2
  && (onlyTips.items || []).every((i) => i.type === 'tip'), JSON.stringify(onlyTips && onlyTips.count));
const onlyNews = await api('api/news.php', { get: { type: 'news' } });
ok('فیلتر type=news فقط خبرها را می‌دهد', onlyNews && (onlyNews.items || []).length === 4
  && (onlyNews.items || []).every((i) => i.type === 'news'), JSON.stringify(onlyNews && onlyNews.count));
const limited = await api('api/news.php', { get: { limit: '2' } });
ok('limit رعایت می‌شود', limited && (limited.items || []).length === 2, JSON.stringify(limited && limited.count));

/* ───────────────────────── ۳) CRUD از پنل ───────────────────────── */
section('۳) افزودن/ویرایش/حذف از پنل (با عکس و ایموجی)');
const created = pickJson(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "require '" + APP + "/admin/includes/functions.php';\n"
  + "$rep = null;\n"
  + "$id = createNews($pdo, ['type' => 'news', 'title' => '🌳 آسفالت معبر اصلی', 'summary' => 'خلاصه‌ی آزمون',\n"
  + "  'body' => 'متن کامل آزمون\\n\\nپاراگراف دوم', 'icon' => '🚧', 'badge' => 'عمران',\n"
  + "  'image_url' => 'uploads/news/2026/10/sample.jpg', 'published' => 1, 'sort_order' => 9], $rep);\n"
  + "echo json_encode(['id' => $id, 'report' => $rep]);"));
ok('createNews شناسه برمی‌گرداند', created && Number(created.id) > 0, JSON.stringify(created).slice(0, 220));
ok('ذخیره بدون «degraded» انجام شد (دیتابیس سالم)', created && (created.report.degraded || []).length === 0, JSON.stringify(created && created.report));

const row = pickJson(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "require '" + APP + "/admin/includes/functions.php';\n"
  + "$r = getNewsById($pdo, " + Number(created.id) + ");\n"
  + "echo json_encode(['title' => $r['title'], 'image' => $r['image_url'], 'badge' => $r['badge'], 'body' => $r['body']]);"));
ok('عکس و نشان و ایموجیِ عنوان ذخیره شد',
  row && row.image === 'uploads/news/2026/10/sample.jpg' && row.badge === 'عمران' && /🌳/.test(row.title), JSON.stringify(row).slice(0, 220));

const afterCreate = await api('api/news.php', { get: { type: 'news' } });
const apiItem = (afterCreate.items || []).find((i) => i.id === Number(created.id));
ok('مطلب تازه بلافاصله در پاسخ API (و پس در اپ) هست', !!apiItem, JSON.stringify((afterCreate.items || []).map((i) => i.title)));
ok('برای تصویر آپلودشده، نشانی مطلق هم فرستاده می‌شود (image_abs)',
  apiItem && /^https:\/\/eplak\.test\/uploads\/news\//.test(String(apiItem.image_abs || '')), JSON.stringify(apiItem && apiItem.image_abs));

const updated = pickJson(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "require '" + APP + "/admin/includes/functions.php';\n"
  + "$rep = null;\n"
  + "$done = updateNews($pdo, " + Number(created.id) + ", ['type' => 'tip', 'title' => 'دانستنیِ ویرایش‌شده',\n"
  + "  'summary' => 'خلاصه‌ی تازه', 'body' => 'متن تازه', 'icon' => '🏛️', 'badge' => 'نشان تازه',\n"
  + "  'image_url' => '', 'published' => 0, 'sort_order' => 3], $rep);\n"
  + "$r = getNewsById($pdo, " + Number(created.id) + ");\n"
  + "echo json_encode(['ok' => $done, 'report' => $rep, 'row' => ['type' => $r['type'], 'title' => $r['title'], 'published' => (int) $r['published'], 'badge' => $r['badge']]]);"));
ok('updateNews موفق است و مقادیر عوض شد',
  updated && updated.ok === true && updated.row.title === 'دانستنیِ ویرایش‌شده' && updated.row.type === 'tip' && updated.row.badge === 'نشان تازه',
  JSON.stringify(updated).slice(0, 240));
ok('مطلبِ «پیش‌نویس» (published=0) در پاسخ اپ نمی‌آید',
  !(await api('api/news.php', { get: { type: 'tip' } }).items || []).some((i) => i.id === Number(created.id)),
  'published=0 باید فیلتر شود');

const toggled = pickJson(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "require '" + APP + "/admin/includes/functions.php';\n"
  + "$ok1 = toggleNewsPublished($pdo, " + Number(created.id) + ");\n"
  + "$r = getNewsById($pdo, " + Number(created.id) + ");\n"
  + "echo json_encode(['toggled' => $ok1, 'published' => (int) $r['published']]);"));
ok('تغییر وضعیت انتشار کار می‌کند (۰ ← ۱)', toggled && toggled.toggled === true && toggled.published === 1, JSON.stringify(toggled));

/* ───────────────────────── ۴) صفحه‌های پنل ───────────────────────── */
section('۴) صفحه‌های پنل ادمین بدون خطای PHP رندر می‌شوند');
let rawPage = '';
const adminPage = async (script, opts) => {
  rawPage = await run(
  "$_SESSION = [];\n"
  + "$_SERVER['REQUEST_METHOD'] = '" + ((opts && opts.method) || 'GET') + "';\n"
  + "$_SERVER['SCRIPT_NAME'] = '/" + script + "';\n"
  + "$_SERVER['PHP_SELF'] = '/admin/login.php';   /* تا requireAdmin() وسط آزمون اجرا نشود */\n"
  + "$_SERVER['HTTP_HOST'] = 'eplak.test'; $_SERVER['HTTPS'] = 'on';\n"
  + "require '" + APP + "/admin/auth.php';\n"
  + "$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';\n"
  + "$_GET = " + phpVal((opts && opts.get) || {}) + ";\n"
  + "$_POST = " + phpVal((opts && opts.post) || {}) + ";\n"
  + "$_FILES = " + phpVal((opts && opts.files) || {}) + ";\n"
  + "register_shutdown_function(function () {\n"
  + "    $html = (string) ob_get_clean();\n"
  + "    $loc = '';\n"
  + "    foreach (headers_list() as $h) { if (stripos($h, 'Location:') === 0) { $loc = trim(substr($h, 9)); } }\n"
  /* فراداده به‌صورت JSON کوچک و HTML «پس از نشانگر» برمی‌گردد: گذاشتن HTML داخل
     json_encode روی صفحه‌های بزرگ رشته‌ی نامعتبر می‌ساخت و نوشتنش در فایل هم تا
     پایان فرایند php-wasm روی دیسک میزبان دیده نمی‌شد. */
  + "    echo \"\\n@@META@@\\n\" . json_encode([\n"
  + "        'location' => $loc,\n"
  + "        'fatal' => preg_match('/(Fatal error|Parse error|Warning:|Deprecated:|Uncaught)/', $html) === 1,\n"
  + "        'len' => strlen($html),\n"
  + "        'news_rows' => isset($GLOBALS['pdo']) && $GLOBALS['pdo'] instanceof PDO\n"
  + "            ? (int) $GLOBALS['pdo']->query('SELECT COUNT(*) FROM news')->fetchColumn() : -1,\n"
  + "    ]) . \"\\n@@HTML@@\\n\" . $html;\n"
  + "});\n"
  + "ob_start();\n"
  + "require '" + APP + "/" + script + "';\n"
);
  const m = String(rawPage).match(/@@META@@\n([\s\S]*?)\n@@HTML@@\n([\s\S]*)$/);
  const meta = m ? pickJson(m[1]) : pickJson(rawPage);
  if (!meta) {
    console.log('   [خروجی خام ' + script + '] ' + String(rawPage).slice(0, 300).replace(/\n/g, ' '));
    return null;
  }
  meta.html = m ? m[2] : '';
  return meta;
};

const listPage = await adminPage('admin/news.php', {});
ok('صفحه‌ی فهرست «اخبار و دانستنی‌ها» خطای PHP ندارد', !!listPage && listPage.fatal === false, JSON.stringify(listPage && { fatal: listPage.fatal, len: listPage.len }));
ok('فهرست، عنوان مطلب‌ها را نشان می‌دهد', listPage && /مسجد جامع ورامین/.test(listPage.html) && /برج علاءالدوله/.test(listPage.html), String(listPage && listPage.html).slice(0, 120));
ok('تصویر مطلب در فهرست پنل نمایش داده می‌شود', listPage && /adminMediaUrl|varamin-mosque\.jpg/.test(listPage.html), '');
ok('شمارش‌ها و وضعیت سلامت جدول در صفحه هست', listPage && /منتشرشده/.test(listPage.html) && /ایموجی/.test(listPage.html), '');

const rowsBeforeBadCsrf = Number((pickJson(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "echo json_encode(['n' => (int) $pdo->query('SELECT COUNT(*) FROM news')->fetchColumn()]);")) || {}).n || -1);
const addPage = await adminPage('admin/news_add.php', {
  method: 'POST',
  post: { _token: 'TOKEN', type: 'news', title: 'خبر از صفحه‌ی پنل', summary: 'خلاصه', body: 'متن کامل خبر',
          icon: '📰', badge: 'شهری', image_url: 'uploads/news/2026/10/from-page.jpg', published: '1', sort_order: '5' },
});
ok('درخواست بدون توکن امنیتی درست رد می‌شود (CSRF) و مطلبی نمی‌سازد',
  !!addPage && addPage.fatal === false && /درخواست نامعتبر/.test(addPage.html)
    && addPage.news_rows === rowsBeforeBadCsrf,
  JSON.stringify(addPage && { fatal: addPage.fatal, rows: addPage.news_rows, before: rowsBeforeBadCsrf }));
/* توکن CSRF واقعی لازم است؛ یک‌بار با توکن درست تکرار می‌کنیم */
const addPage2 = pickJson(await run(
  "$_SESSION = [];\n"
  + "$_SERVER['REQUEST_METHOD'] = 'POST';\n"
  + "$_SERVER['SCRIPT_NAME'] = '/admin/news_add.php';\n"
  + "$_SERVER['PHP_SELF'] = '/admin/login.php';\n"
  + "require '" + APP + "/admin/auth.php';\n"
  + "$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';\n"
  + "$_POST = ['_token' => eplakCsrfToken(), 'type' => 'news', 'title' => 'خبر از صفحه‌ی پنل',\n"
  + "  'summary' => 'خلاصه', 'body' => 'متن کامل خبر', 'icon' => '📰', 'badge' => 'شهری',\n"
  + "  'image_url' => 'uploads/news/2026/10/from-page.jpg', 'published' => '1', 'sort_order' => '5'];\n"
  + "register_shutdown_function(function () {\n"
  + "    $html = (string) ob_get_clean(); $loc = '';\n"
  + "    foreach (headers_list() as $h) { if (stripos($h, 'Location:') === 0) { $loc = trim(substr($h, 9)); } }\n"
  + "    $pdo = $GLOBALS['pdo'];\n"
  + "    echo json_encode(['location' => $loc,\n"
  + "      'fatal' => preg_match('/(Fatal error|Parse error|Warning:|Uncaught)/', $html) === 1,\n"
  + "      'rows' => (int) $pdo->query(\"SELECT COUNT(*) FROM news WHERE title='خبر از صفحه‌ی پنل'\")->fetchColumn()]);\n"
  + "});\n"
  + "ob_start(); require '" + APP + "/admin/news_add.php';\n"));
ok('«افزودن مطلب» از خودِ صفحه‌ی پنل ذخیره می‌کند و به فهرست برمی‌گرداند',
  addPage2 && /news\.php\?success=1/.test(String(addPage2.location)) && addPage2.rows === 1, JSON.stringify(addPage2).slice(0, 240));

const editId = pickJson(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "echo json_encode(['id' => (int) $pdo->query(\"SELECT id FROM news WHERE title='خبر از صفحه‌ی پنل'\")->fetchColumn()]);"));
const editPage = await adminPage('admin/news_edit.php', { get: { id: String(editId.id) } });
ok('صفحه‌ی ویرایش، مطلب را در فرم نشان می‌دهد (عکس فعلی هم هست)',
  editPage && editPage.fatal === false && /خبر از صفحه‌ی پنل/.test(editPage.html) && /from-page\.jpg/.test(editPage.html), String(editPage && editPage.html).slice(0, 120));
ok('فرم ویرایش، امکان «حذف تصویر فعلی» و پیش‌نمایش تصویر تازه را دارد',
  editPage && /name="remove_image"/.test(editPage.html) && /imagePreview/.test(editPage.html), '');
const addForm = await adminPage('admin/news_add.php', {});
ok('فرم «افزودن مطلب» با همه‌ی فیلدهای لازم رندر می‌شود (عکس، نشان، انتشار، ترتیب)',
  !!addForm && addForm.fatal === false
    && ['name="image_file"', 'name="image_url"', 'name="badge"', 'name="published"', 'name="sort_order"']
       .every((f) => addForm.html.includes(f))
    && /id="imagePreview"/.test(addForm.html),
  String(addForm && addForm.html).slice(0, 120));

const edited = pickJson(await run(
  "$_SESSION = [];\n"
  + "$_SERVER['REQUEST_METHOD'] = 'POST';\n"
  + "$_SERVER['SCRIPT_NAME'] = '/admin/news_edit.php';\n"
  + "$_SERVER['PHP_SELF'] = '/admin/login.php';\n"
  + "require '" + APP + "/admin/auth.php';\n"
  + "$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';\n"
  + "$_GET = ['id' => '" + Number(editId.id) + "'];\n"
  + "$_POST = ['_token' => eplakCsrfToken(), 'type' => 'news', 'title' => 'خبر ویرایش‌شده از پنل',\n"
  + "  'summary' => 'خلاصه', 'body' => 'متن تازه', 'icon' => '📰', 'badge' => 'شهری',\n"
  + "  'image_url' => '', 'remove_image' => '1', 'published' => '1', 'sort_order' => '5'];\n"
  + "register_shutdown_function(function () {\n"
  + "    $html = (string) ob_get_clean(); $loc = '';\n"
  + "    foreach (headers_list() as $h) { if (stripos($h, 'Location:') === 0) { $loc = trim(substr($h, 9)); } }\n"
  + "    $pdo = $GLOBALS['pdo'];\n"
  + "    $r = $pdo->query(\"SELECT title, image_url FROM news WHERE id=" + Number(editId.id) + "\")->fetch();\n"
  + "    echo json_encode(['location' => $loc, 'title' => $r['title'], 'image' => $r['image_url']]);\n"
  + "});\n"
  + "ob_start(); require '" + APP + "/admin/news_edit.php';\n"));
ok('«ویرایش مطلب» از صفحه‌ی پنل ذخیره می‌شود و تصویر با تیک «حذف تصویر» برداشته می‌شود',
  edited && edited.title === 'خبر ویرایش‌شده از پنل' && !edited.image && /success=1/.test(String(edited.location)), JSON.stringify(edited).slice(0, 240));

/* ───────────────────────── ۵) اپ واقعی (jsdom) ───────────────────────── */
section('۵) اپ واقعی (jsdom): فهرست خبرها، دانستنی‌ها با عکس، و نوار پیشخوان');

class LocalLoader extends ResourceLoader {
  fetch(url, options) {
    const u = String(url);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)\//i.test(u)) {
      let p = u.replace(/^https?:\/\/[^/]+\//, '').split('?')[0].split('#')[0];
      p = p.replace(/^(eplak-fixed-new|eplak-fixed)\//, '');
      const abs = path.join(APP, decodeURIComponent(p));
      return Promise.resolve(fs.existsSync(abs) ? Buffer.from(fs.readFileSync(abs)) : Buffer.from(''));
    }
    /* اپ اندروید/iOS صفحه را از file:///android_asset/… باز می‌کند؛ همان فایل‌های مخزن است */
    if (/^file:\/\/\/android_asset\//i.test(u)) {
      const abs = path.join(APP, decodeURIComponent(u.replace(/^file:\/\/\/android_asset\//i, '').split('?')[0]));
      return Promise.resolve(fs.existsSync(abs) ? Buffer.from(fs.readFileSync(abs)) : Buffer.from(''));
    }
    if (u.startsWith('file://')) return super.fetch(u, options);
    return Promise.resolve(Buffer.from(''));
  }
}
const appLogs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => appLogs.push('jsdomError: ' + (e && e.message)));

const bootApp = async (fetchOpts) => {
  const dom = await JSDOM.fromFile(path.join(APP, 'index.html'), {
    runScripts: 'dangerously',
    resources: new LocalLoader(),
    pretendToBeVisual: true,
    url: 'http://localhost/eplak-fixed/index.html',
    virtualConsole: vc,
    beforeParse(window) {
      window.EPLAK_API_BASE_URL = 'api';
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      window.AndroidApp = {
        showNotification() {}, ensureNotificationChannel() {}, notificationsEnabled() { return true; },
        requestNotificationPermission() {}, getFcmToken() { return ''; }, isFcmReady() { return false; },
        refreshFcmToken() {}, getPushDiagnostics() { return '{"enabled":true,"token":false}'; },
        openNotificationSettings() {}, shouldRequireLogin() { return false; }, markLoginDone() {}, prepareExit() {},
      };
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = (((init || {}).method) || 'GET').toUpperCase();
        const body = (init || {}).body || null;
        const m = url.match(/(?:^|\/)(api\/[a-z0-9_\-]+\.php)(?:\?([^#]*))?/i);
        if (!m) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
        const get = {};
        if (m[2]) new URLSearchParams(m[2]).forEach((v, k) => { get[k] = v; });
        let post = {};
        if (method === 'POST' && typeof body === 'string') new URLSearchParams(body).forEach((v, k) => { post[k] = v; });
        const text = await rawApi(m[1], Object.assign({ method, get, post }, fetchOpts || {}));
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
        return {
          ok: !/^\s*<|Fatal error|Warning:/.test(text) && parsed !== null,
          status: parsed === null ? 500 : 200,
          json: async () => { if (parsed === null) throw new Error('bad json: ' + text.slice(0, 200)); return parsed; },
          text: async () => text,
        };
      };
    },
  });
  await new Promise((r) => setTimeout(r, 2000));
  return dom;
};
/* پنجره‌ی jsdom حتماً بسته می‌شود: تایمرهای زنده‌ی اپ (هر ۳.۵ ثانیه) وگرنه با
   فراخوان‌های PHP خودِ آزمون تداخل می‌کنند و پاسخ‌ها قاطی می‌شود. */
const closeApp = (dom) => { try { dom.window.close(); } catch (e) { /* مهم نیست */ } };

const dom = await bootApp();
const w = dom.window;
const html = (id) => { const el = w.document.getElementById(id); return el ? el.innerHTML : ''; };
const text = (id) => { const el = w.document.getElementById(id); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };

ok('اپ بالا آمد و ماژول‌های اخبار/دانستنی‌ها بارگذاری شدند',
  typeof w.renderNewsList === 'function' && typeof w.eplakResolveNewsImage === 'function'
    && typeof w.renderDashStrip === 'function',
  appLogs.slice(0, 2).join(' | '));
ok('فهرست «اخبار و اطلاعات» با مطالب پنل پر شد',
  /مسجد جامع|آسفالت|پارک جدید/.test(text('newsListWrap')), text('newsListWrap').slice(0, 160));
ok('کارت‌های «دانستنی‌های ورامین» با عکس رندر شدند',
  /heritage-card/.test(html('knowledgeListWrap')) && /<img[^>]+varamin-mosque\.jpg/.test(html('knowledgeListWrap')), html('knowledgeListWrap').slice(0, 200));
ok('نوار «آخرین اخبار» در پیشخوان پر شد', /mini-news-card/.test(html('dashNewsWrap')), html('dashNewsWrap').slice(0, 160));
ok('در حالت سالم، هشدار «خوانده نشد» نشان داده نمی‌شود',
  (w.document.getElementById('newsSyncNotice') || { style: {} }).style.display === 'none', text('newsSyncNotice'));

closeApp(dom);

/* تصویر آپلودشده در پنل باید در اپ با نشانی مطلق سرور خوانده شود */
await run("require '" + APP + "/admin/includes/db.php';\nrequire '" + APP + "/admin/includes/functions.php';\n"
  + "createNews($pdo, ['type' => 'tip', 'title' => 'دانستنی با عکسِ آپلودی', 'summary' => 'خلاصه',\n"
  + "  'body' => 'متن', 'icon' => '🏛️', 'badge' => 'نشان', 'image_url' => 'uploads/news/2026/10/up.jpg',\n"
  + "  'published' => 1, 'sort_order' => 1]);\necho 'ok';");
const dom2 = await bootApp();
const w2 = dom2.window;
const html2 = (id) => { const el = w2.document.getElementById(id); return el ? el.innerHTML : ''; };
ok('عکسِ آپلودشده در پنل، در اپ با نشانی مطلق سرور نمایش داده می‌شود (نه آدرس نسبیِ file://)',
  /<img[^>]+https:\/\/eplak\.test\/uploads\/news\/2026\/10\/up\.jpg/.test(html2('knowledgeListWrap')), html2('knowledgeListWrap').slice(0, 260));
ok('مطلب تازه (با عکس) در فهرست دانستنی‌ها هست', /دانستنی با عکسِ آپلودی/.test(html2('knowledgeListWrap')), '');
ok('resolveNewsImage نشانی مطلقِ سرور (image_abs) را ترجیح می‌دهد',
  w2.eval("eplakResolveNewsImage({ image_url: 'uploads/news/x.jpg', image_abs: 'https://eplak.ir/eplak-fixed/uploads/news/x.jpg' })")
    === 'https://eplak.ir/eplak-fixed/uploads/news/x.jpg', '');
ok('resolveNewsImage فایل‌های assets/… را نسبی نگه می‌دارد (آفلاین کار کنند)',
  w2.eval("eplakResolveNewsImage({ image_url: 'assets/img/logo.png' })") === 'assets/img/logo.png', '');

closeApp(dom2);

/* حالت خالی: اگر مدیر همه را پاک کند، صفحه سفید نمی‌ماند */
await run("require '" + APP + "/admin/includes/db.php';\n$pdo->exec('DELETE FROM news');\necho 'cleared';");
const dom3 = await bootApp();
const w3 = dom3.window;
const text3 = (id) => { const el = w3.document.getElementById(id); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
ok('وقتی سرور پاسخ می‌دهد ولی مطلبی نیست، «کارت راهنما» نشان داده می‌شود (نه صفحه‌ی سفید)',
  /📭/.test(text3('newsListWrap')) && /📭/.test(text3('knowledgeListWrap')), text3('newsListWrap').slice(0, 120));
ok('نوار پیشخوان هم خالیِ صادقانه می‌شود', /📭/.test(text3('dashNewsWrap')), text3('dashNewsWrap').slice(0, 100));

closeApp(dom3);

/* ───────── ۶) اپِ file:// (اندروید/iOS): آدرس تصویر به سرور وصل می‌شود ───────── */
section('۶) اپ file:// (داخل APK/IPA): آدرس رسانه به دامنه‌ی سرور وصل می‌شود');
const domFile = await new JSDOM(
  '<!doctype html><html><body><script src="core/storage.js"></script></body></html>', {
    runScripts: 'dangerously',
    resources: new LocalLoader(),
    url: 'file:///android_asset/index.html',
    virtualConsole: vc,
  });
await new Promise((r) => setTimeout(r, 700));
const wFile = domFile.window;
ok('در اپِ file:// پایه‌ی API همان سرور ای‌پلاک است',
  wFile.EPLAK_API_BASE_URL === 'https://eplak.ir/eplak-fixed/api', String(wFile.EPLAK_API_BASE_URL));
ok('تصویر آپلودشده (uploads/news/…) به دامنه‌ی سرور وصل می‌شود',
  wFile.eplakResolveMediaUrl('uploads/news/2026/10/a.jpg') === 'https://eplak.ir/eplak-fixed/uploads/news/2026/10/a.jpg',
  String(wFile.eplakResolveMediaUrl('uploads/news/2026/10/a.jpg')));
ok('نشانی کامل http دست‌نخورده می‌ماند',
  wFile.eplakResolveMediaUrl('https://cdn.example.com/x.jpg') === 'https://cdn.example.com/x.jpg', '');

try { wFile.close(); } catch (e) { /* مهم نیست */ }

/* ───────── ۷) دیتابیس قدیمی: ستون badge نیست و ALTER هم اجازه ندارد ───────── */
section('۷) دیتابیس قدیمی (بدون ستون badge، بدون اجازه‌ی ALTER)');
await resetNewsMarkers();
console.log(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "$pdo->exec('CREATE TABLE news_legacy (id INTEGER PRIMARY KEY AUTOINCREMENT, type VARCHAR(20) DEFAULT \\'news\\','\n"
  + "  . ' title VARCHAR(255), summary TEXT, body TEXT, icon VARCHAR(50), image_url VARCHAR(500),'\n"
  + "  . ' published TINYINT(1) DEFAULT 1, sort_order INT DEFAULT 0, created_at TIMESTAMP, updated_at TIMESTAMP)');\n"
  + "$pdo->exec('INSERT INTO news_legacy (id, type, title, summary, body, icon, image_url, published, sort_order)'\n"
  + "  . ' SELECT id, type, title, summary, body, icon, image_url, published, sort_order FROM news');\n"
  + "$pdo->exec('DROP TABLE news');\n"
  + "$pdo->exec('ALTER TABLE news_legacy RENAME TO news');\n"
  + "$cols = $pdo->query('PRAGMA table_info(news)')->fetchAll(PDO::FETCH_COLUMN, 1);\n"
  + "echo json_encode(['cols' => $cols, 'rows' => (int) $pdo->query('SELECT COUNT(*) FROM news')->fetchColumn()]);"));
schemaReadonly = true;
const legacy = pickJson(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "$cols = $pdo->query('PRAGMA table_info(news)')->fetchAll(PDO::FETCH_COLUMN, 1);\n"
  + "echo json_encode(['cols' => $cols, 'rows' => (int) $pdo->query('SELECT COUNT(*) FROM news')->fetchColumn()]);"));
ok('ستون badge در دیتابیس آزمون وجود ندارد (مثل دامپ قدیمی هاست)', !(legacy.cols || []).includes('badge'), JSON.stringify(legacy));

const legacyApiRaw = await rawApi('api/news.php', { get: { limit: '50' } });
const legacyApi = pickJson(legacyApiRaw);
ok('api/news.php روی دیتابیس قدیمی ۵۰۰ نمی‌دهد (بدون «Unknown column»)',
  !!legacyApi && !/Unknown column|no such column|SQLSTATE|Fatal error/.test(legacyApiRaw), legacyApiRaw.slice(0, 200));
ok('همان مطالب قبلی را برمی‌گرداند', legacyApi && legacyApi.success === true && legacyApi.count > 0, JSON.stringify(legacyApi && legacyApi.count));
ok('صادقانه می‌گوید چه چیزی سازگار شد (degraded=no_badge) و راهنما دارد',
  legacyApi && (legacyApi.degraded || []).includes('no_badge') && /hint/.test(JSON.stringify(legacyApi)), JSON.stringify(legacyApi && legacyApi.degraded));

const legacyCreate = pickJson(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "require '" + APP + "/admin/includes/functions.php';\n"
  + "$rep = null;\n"
  + "$id = createNews($pdo, ['type' => 'news', 'title' => 'خبر روی دیتابیس قدیمی', 'summary' => 'خلاصه',\n"
  + "  'body' => 'متن', 'icon' => '📰', 'badge' => 'این ستون نیست', 'image_url' => 'uploads/news/2026/10/old.jpg',\n"
  + "  'published' => 1, 'sort_order' => 2], $rep);\n"
  + "$all = getAllNews($pdo, 'news', $listRep);\n"
  + "echo json_encode(['id' => $id, 'rep' => $rep, 'rows' => count($all)]);"));
ok('افزودن مطلب روی دیتابیس قدیمی هم موفق است (بدون «Unknown column badge»)',
  legacyCreate && Number(legacyCreate.id) > 0, JSON.stringify(legacyCreate).slice(0, 240));
ok('گزارش «degraded» می‌گوید نشان ذخیره نشد (no_badge)',
  legacyCreate && (legacyCreate.rep.degraded || []).includes('no_badge'), JSON.stringify(legacyCreate && legacyCreate.rep));
ok('fهرست پنل هم روی دیتابیس قدیمی خوانده می‌شود', legacyCreate && legacyCreate.rows > 0, JSON.stringify(legacyCreate));

const legacyUpdate = pickJson(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "require '" + APP + "/admin/includes/functions.php';\n"
  + "$rep = null;\n"
  + "$done = updateNews($pdo, " + Number(legacyCreate.id) + ", ['type' => 'news', 'title' => 'ویرایش روی دیتابیس قدیمی',\n"
  + "  'body' => 'متن تازه', 'badge' => 'x', 'image_url' => '', 'published' => 1, 'sort_order' => 1], $rep);\n"
  + "$r = getNewsById($pdo, " + Number(legacyCreate.id) + ");\n"
  + "echo json_encode(['ok' => $done, 'title' => $r['title']]);"));
ok('ویرایش مطلب روی دیتابیس قدیمی هم موفق است',
  legacyUpdate && legacyUpdate.ok === true && legacyUpdate.title === 'ویرایش روی دیتابیس قدیمی', JSON.stringify(legacyUpdate).slice(0, 240));

const legacyPage = await adminPage('admin/news.php', {});
ok('صفحه‌ی فهرست روی دیتابیس قدیمی سفید/خطا نمی‌شود', !!legacyPage && legacyPage.fatal === false, JSON.stringify(legacyPage && { fatal: legacyPage.fatal }));
ok('به مدیر هشدار می‌دهد و دکمه‌ی «تعمیر خودکار جدول اخبار» دارد',
  legacyPage && /news_repair/.test(legacyPage.html) && /یکی نیست/.test(legacyPage.html), String(legacyPage && legacyPage.html).slice(0, 120));

const legacyAddPage = await adminPage('admin/news_add.php', { get: {} });
ok('صفحه‌ی «افزودن مطلب» روی دیتابیس قدیمی هم رندر می‌شود', !!legacyAddPage && legacyAddPage.fatal === false, '');

/* ───────── ۸) دیتابیس بدون جدول news (دامپ اصلی) ───────── */
section('۸) دیتابیس بدون جدول news (مثل دامپ اصلی DBasli)');
schemaReadonly = false;
await run("require '" + APP + "/admin/includes/db.php';\n$pdo->exec('DROP TABLE IF EXISTS news');\necho 'dropped';");
await resetNewsMarkers();
const noTableRaw = await rawApi('api/news.php', { get: { limit: '50' } });
const noTable = pickJson(noTableRaw);
ok('api/news.php بدون جدول news هم ۵۰۰ نمی‌دهد', !!noTable && !/no such table|SQLSTATE|Fatal error/.test(noTableRaw), noTableRaw.slice(0, 200));
ok('جدول به‌صورت خودکار ساخته شد و success=true برگشت', noTable && noTable.success === true, JSON.stringify(noTable && { s: noTable.success, d: noTable.degraded }));
ok('محتوای پیش‌فرض دوباره درج شد (فهرست خالی نمی‌ماند)', noTable && noTable.count === 6, JSON.stringify(noTable && noTable.count));
ok('اگر ترمیمی لازم بوده، گزارش آن در پاسخ API هست',
  noTable && (Array.isArray(noTable.repaired) ? noTable.repaired.length > 0 : noTable.success === true),
  JSON.stringify(noTable && { repaired: noTable.repaired, degraded: noTable.degraded }));

const repairedFn = pickJson(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "$pdo->exec('DROP TABLE IF EXISTS news');\n"
  /* نشانه‌ها هم پاک می‌شوند تا مسیر کامل «جدول نیست ← ساخته شد ← محتوا درج شد»
     در «همان فرایند» سنجیده شود (همگام‌سازی bootstrap در فرایند تازه، جدول را
     پیش از فراخوانی تابع تعمیر می‌سازد و آزمون بی‌معنا می‌شود). */
  + "$pdo->exec(\"DELETE FROM app_settings WHERE setting_key LIKE 'news_%'\");\n"
  + "$schema = eplakNewsSchema($pdo, true);\n"
  + "$seedReport = null;\n"
  + "$seeded = eplakSeedDefaultNews($pdo, $seedReport);\n"
  + "$cols = $pdo->query('PRAGMA table_info(news)')->fetchAll(PDO::FETCH_COLUMN, 1);\n"
  + "echo json_encode(['table' => $schema['table'], 'repaired' => $schema['repaired'],\n"
  + "  'failed' => $schema['failed'], 'seeded' => $seeded, 'has_badge' => in_array('badge', $cols, true)]);"));
ok('تابع تعمیر، جدولِ نبوده را می‌سازد و صادقانه گزارش می‌دهد',
  repairedFn && repairedFn.table === true && (repairedFn.repaired || []).length > 0
    && repairedFn.has_badge === true && repairedFn.seeded === 6, JSON.stringify(repairedFn).slice(0, 260));

const noTablePage = await adminPage('admin/news.php', {});
ok('صفحه‌ی پنل هم با جدولِ تازه‌ساخته کار می‌کند (بدون خطا)', !!noTablePage && noTablePage.fatal === false && /مسجد جامع/.test(noTablePage.html), '');

/* ───────── ۹) قراردادها (ایستا) ───────── */
section('۹) قراردادها: هیچ‌کس دیگر «ستون ثابت» نمی‌خواهد و ۵۰۰ نمی‌دهد');
const apiSrc = fs.readFileSync(path.join(APP, 'api/news.php'), 'utf8');
const fnSrc = fs.readFileSync(path.join(APP, 'admin/includes/functions.php'), 'utf8');
const bootSrc = fs.readFileSync(path.join(APP, 'shared/bootstrap.php'), 'utf8');
const indexHtml = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const liveJs = fs.readFileSync(path.join(APP, 'modules/live.js'), 'utf8');
const dashJs = fs.readFileSync(path.join(APP, 'modules/dashboard.js'), 'utf8');
const newsAdmin = fs.readFileSync(path.join(APP, 'admin/news.php'), 'utf8');

ok('api/news.php هرگز ۵۰۰ نمی‌دهد و ساختار جدول را ترمیم می‌کند',
  !/http_response_code\(500\)/.test(apiSrc) && /eplakNewsSchema\(\$pdo\)/.test(apiSrc) && /eplakJson\(\$payload, 200\)/.test(apiSrc));
ok('api/news.php فقط ستون‌های موجود را SELECT می‌کند',
  /eplakNewsHasColumn\(\$pdo, \$column\)/.test(apiSrc) && !/SELECT id, type, title, summary, body, icon, badge/.test(apiSrc));
ok('api/news.php برای تصویرِ آپلودشده نشانی مطلق می‌فرستد (image_abs)',
  /image_abs/.test(apiSrc) && /eplakNewsAbsoluteImage/.test(apiSrc));
ok('createNews/updateNews با ستون‌های موجود کار می‌کنند و گزارش degraded دارند',
  /function createNews\(PDO \$pdo, array \$data, \?array &\$report = null\)/.test(fnSrc)
  && /function updateNews\(PDO \$pdo, int \$id, array \$data, \?array &\$report = null\)/.test(fnSrc)
  && /eplakNewsWritableColumns/.test(fnSrc) && /eplakNewsDegradedNotes/.test(fnSrc));
ok('bootstrap: سلامت جدول news (ساخت جدول، ستون‌ها، utf8mb4) مثل جدول اعلان‌ها',
  /function eplakNewsSchema\(PDO \$pdo, bool \$force = false\): array/.test(bootSrc)
  && /eplakNewsCreateTable/.test(bootSrc) && /eplakMysqlConvertUtf8mb4\(\$pdo, 'news'\)/.test(bootSrc));
ok('درج محتوای پیش‌فرض فقط یک‌بار انجام می‌شود (با حذف مطالب توسط مدیر برنمی‌گردد)',
  /news_seeded/.test(bootSrc));
ok('پنل: دکمه‌ی تعمیر جدول اخبار و اسکریپت دستیِ تعمیر وجود دارد',
  /actions\.php\?type=news_repair/.test(newsAdmin)
  && fs.existsSync(path.join(APP, 'backend/fix-news-db.sql'))
  && /news_repair/.test(fs.readFileSync(path.join(APP, 'admin/actions.php'), 'utf8')));
ok('تنظیمات پنل، جدول اخبار را هم تعمیر می‌کند و وضعیتش را نشان می‌دهد',
  /eplakNewsSchema\(\$pdo, true\)/.test(fs.readFileSync(path.join(APP, 'admin/settings.php'), 'utf8'))
  && /جدول اخبار و دانستنی‌ها/.test(fs.readFileSync(path.join(APP, 'admin/settings.php'), 'utf8')));
ok('اپ: آدرس تصویرِ مطلب حل می‌شود و فهرست خالی «کارت راهنما» دارد',
  /resolveNewsImage/.test(liveJs) && /emptyContentCard/.test(liveJs) && /eplakEmptyContentCard/.test(dashJs));
ok('اپ: فهرست خبرها همیشه با پاسخ سرور به‌روز می‌شود (نمونه‌ی پیش‌فرض جای واقعیت را نمی‌گیرد)',
  /newsData\.length = 0;/.test(liveJs) && !/if \(news\.length\) \{\s*newsData\.length = 0;/.test(liveJs));
ok('صفحه‌ی اخبار نوار وضعیت «خوانده نشد از سرور» دارد و کش‌باسترها بالا رفته‌اند',
  /id="newsSyncNotice"/.test(indexHtml) && /modules\/live\.js\?v=18/.test(indexHtml) && /modules\/dashboard\.js\?v=17/.test(indexHtml));
ok('جزئیات خبر، پاراگراف‌های متن را حفظ می‌کند (white-space:pre-line)',
  /id="newsDetailBody"[^>]*white-space:pre-line/.test(indexHtml));

console.log('\n' + '='.repeat(52));
console.log(`NEWS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail > 0 ? 1 : 0);
