/* fcm.test.mjs — آزمون موتور فایربیس (اعلان اپ اندروید)
   JWT امضاشده با کلید سرویس، گرفتن access_token، ارسال FCM HTTP v1،
   رفتار با توکن باطل و حالت «فایربیس تنظیم نشده».
   اجرا:  bash tools/dev/run-regression.sh fcm
*/
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import crypto from 'crypto';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const SHIM = '/tmp/eplak-regression-shim';
const DB = '/tmp/eplak-regression-fcm.sqlite';
if (fs.existsSync(DB)) fs.unlinkSync(DB);

const serviceKeys = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const serviceAccount = {
  type: 'service_account',
  project_id: 'eplak-test-project',
  private_key_id: 'abc123',
  private_key: serviceKeys.privateKey,
  client_email: 'firebase-adminsdk-xyz@eplak-test-project.iam.gserviceaccount.com',
  client_id: '1234567890',
  token_uri: 'https://oauth2.googleapis.com/token',
};

const seen = { token: null, messages: [] };
const fakeGoogle = http.createServer((req, res) => {
  let body = Buffer.alloc(0);
  req.on('data', (c) => { body = Buffer.concat([body, c]); });
  req.on('end', () => {
    const text = body.toString();
    if (req.url.startsWith('/token')) {
      const params = new URLSearchParams(text);
      seen.token = { grant: params.get('grant_type'), assertion: params.get('assertion') };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ access_token: 'ya29.FAKE-ACCESS-TOKEN', expires_in: 3600, token_type: 'Bearer' }));
    }
    if (req.url.includes('/messages:send')) {
      const parsed = JSON.parse(text);
      seen.messages.push({ auth: req.headers.authorization, message: parsed.message, url: req.url });
      if (parsed?.message?.token === 'BAD-TOKEN') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { status: 'UNREGISTERED', message: 'Requested entity was not found.' } }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ name: 'projects/eplak-test-project/messages/1' }));
    }
    res.writeHead(404); res.end('{}');
  });
});
await new Promise((r) => fakeGoogle.listen(8097, '127.0.0.1', r));

/* کپی آزمایشی: فقط آدرس تماس با گوگل به سرور محلی تغییر می‌کند (به مخزن دست نمی‌زند) */
fs.rmSync(SHIM, { recursive: true, force: true });
fs.mkdirSync(SHIM, { recursive: true });
for (const entry of ['admin', 'api', 'core', 'modules', 'shared', 'views', 'assets']) {
  const src = `${ROOT}/${entry}`;
  if (fs.existsSync(src)) fs.cpSync(src, `${SHIM}/${entry}`, { recursive: true });
}
for (const file of ['index.html', 'app.js', 'sw.js', 'manifest.json', 'index.php']) {
  const src = `${ROOT}/${file}`;
  if (fs.existsSync(src)) fs.copyFileSync(src, `${SHIM}/${file}`);
}
let fcm = fs.readFileSync(`${SHIM}/shared/fcm.php`, 'utf8');
fcm = fcm.replace(`    $response = eplakHttpPost(
        'https://oauth2.googleapis.com/token',`,
`    $response = eplakHttpPost(
        getenv('EPLAK_TEST_TOKEN_URL') ?: 'https://oauth2.googleapis.com/token',`);
fcm = fcm.replace("'https://fcm.googleapis.com/v1/projects/' . rawurlencode($projectId)",
                  "(getenv('EPLAK_TEST_FCM_BASE') ?: 'https://fcm.googleapis.com/v1/projects/') . rawurlencode($projectId)");
fs.writeFileSync(`${SHIM}/shared/fcm.php`, fcm);

const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);
const APP = SHIM;

const run = async (code) => {
  const res = await php.run({
    code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); `
      + `putenv('EPLAK_TEST_TOKEN_URL=http://127.0.0.1:8097/token'); putenv('EPLAK_TEST_FCM_BASE=http://127.0.0.1:8097/v1/projects/'); `
      + `require_once '${APP}/shared/fcm.php'; `
      + code,
  });
  return String(res.text).trim();
};

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };

console.log('\n=== تنظیم کلید سرویس و گرفتن توکن دسترسی ===');
const setup = JSON.parse(await run(`
require '${APP}/admin/includes/db.php';
require '${APP}/admin/includes/functions.php';
eplakSetAppSetting($pdo, 'fcm_service_account', ${JSON.stringify(JSON.stringify(serviceAccount))});
$cfg = eplakFcmConfig($pdo);
$auth = eplakFcmAccessToken($pdo, true);
echo json_encode(['ready' => $cfg['ready'], 'project' => $cfg['project_id'], 'token' => $auth['token'], 'error' => $auth['error']]);`));
ok('کلید سرویس معتبر شناخته شد', setup.ready === true && setup.project === 'eplak-test-project', JSON.stringify(setup));
ok('توکن دسترسی از گوگل گرفته شد', setup.token === 'ya29.FAKE-ACCESS-TOKEN', JSON.stringify(setup));
ok('درخواست با grant_type درست ارسال شد', seen.token?.grant === 'urn:ietf:params:oauth:grant-type:jwt-bearer');

let jwtOk = false, claims = null;
try {
  const [h, p, sig] = String(seen.token.assertion).split('.');
  const fromB64 = (x) => Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((x.length + 3) % 4), 'base64');
  claims = JSON.parse(fromB64(p).toString());
  jwtOk = crypto.verify('sha256', Buffer.from(h + '.' + p), { key: crypto.publicKeyFromStringOrKey ? crypto.createPublicKey(serviceKeys.publicKey) : serviceKeys.publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, fromB64(sig));
} catch (e) { console.log('   JWT: ' + e.message); }
ok('امضای RS256 با کلید سرویس تأیید شد', jwtOk);
ok('دامنه‌ی دسترسی پیام‌رسانی فایربیس درخواست شده', claims?.scope === 'https://www.googleapis.com/auth/firebase.messaging');

console.log('\n=== ارسال اعلان پنل به دستگاه‌های اپ ===');
const send = JSON.parse(await run(`
require '${APP}/admin/includes/db.php';
require '${APP}/admin/includes/functions.php';
eplakFcmSaveToken($pdo, '09123456789', 'GOOD-TOKEN-1', 'android');
eplakFcmSaveToken($pdo, '09123456789', 'GOOD-TOKEN-2', 'android');
eplakFcmSaveToken($pdo, '', 'GUEST-TOKEN', 'android');
$pdo->exec("INSERT INTO users (phone, name) VALUES ('09123456789','آزمون')");
sendNotification($pdo, 'قطعی آب', 'فردا از ۸ تا ۱۲', 'all', [], 'admin');
$row = $pdo->query('SELECT fcm_sent, fcm_failed FROM notification_sends ORDER BY id DESC LIMIT 1')->fetch();
echo json_encode(['devices' => eplakFcmCount($pdo), 'sent' => (int) $row['fcm_sent'], 'failed' => (int) $row['fcm_failed']]);`));
ok('سه دستگاه ثبت شد', send.devices === 3, JSON.stringify(send));
ok('اعلان به همه‌ی دستگاه‌ها رسید', send.sent === 3 && send.failed === 0, JSON.stringify(send));

const first = seen.messages[0];
console.log('\n=== ساختار پیام ارسالی ===');
ok('مسیر درست پروژه در درخواست است', String(first?.url || '').includes('/v1/projects/eplak-test-project/messages:send'), String(first?.url));
ok('هدر Authorization با توکن دسترسی ارسال شد', first?.auth === 'Bearer ya29.FAKE-ACCESS-TOKEN');
ok('عنوان و متن درست است', first?.message?.notification?.title === 'قطعی آب' && first?.message?.notification?.body === 'فردا از ۸ تا ۱۲');
ok('اولویت بالا تنظیم شده', first?.message?.android?.priority === 'high');
ok('کانال اعلان اپ تنظیم شده', first?.message?.android?.notification?.channel_id === 'eplak_alerts');

/* ── علت اصلی «نرسیدن اعلان وقتی اپ کاملاً بسته است» ──────────────────────
   اگر پیام click_action داشته باشد و اپ فیلتر intent متناظر را نداشته باشد،
   اندروید اعلان را اصلاً نمایش نمی‌دهد. حالا هم اکشن فرستاده نمی‌شود و هم
   فیلتر intent در مانیفست هست؛ آزمون هر دو سو را می‌سنجد. */
ok('click_action حذف شده (علت نرسیدن اعلان در حالت بسته بودن اپ)',
  first?.message?.android?.notification?.click_action === undefined,
  JSON.stringify(first?.message?.android?.notification));
const manifest = fs.readFileSync(`${ROOT}/android-app/app/src/main/AndroidManifest.xml`, 'utf8');
ok('فیلتر intent برای OPEN_MAIN_ACTIVITY در مانیفست هست', manifest.includes('OPEN_MAIN_ACTIVITY'));
ok('اولویت نمایش اعلان PRIORITY_HIGH است (بیدار شدن اپ خواب‌رفته)',
  first?.message?.android?.notification?.notification_priority === 'PRIORITY_HIGH');
ok('صدای اعلان پیش‌فرض تعیین شده', first?.message?.android?.notification?.sound === 'default');
ok('نوع پیام notification است (خود اندروید حتی با اپ بسته نمایش می‌دهد)',
  !!first?.message?.notification && !!first?.message?.token);
ok('داده‌های همراه شامل شناسه‌ی اعلان است (برای جلوگیری از تکرار)',
  String(first?.message?.data?.id || '').length > 0, JSON.stringify(first?.message?.data));

const bridge = fs.readFileSync(`${ROOT}/android-app/app/src/main/java/com/example/eplakfixed/NotificationBridge.kt`, 'utf8');
ok('پل اعلان اندروید، اعلان تکراری را نمایش نمی‌دهد', bridge.includes('recentlyShown') && bridge.includes('DEDUPE_WINDOW_MS'));
ok('گیرنده‌ی فایربیس (سرویس) در کد اپ هست',
  fs.existsSync(`${ROOT}/android-app/app/src/main/java/com/example/eplakfixed/EplakMessagingService.kt`));
const activitySrc = fs.readFileSync(`${ROOT}/android-app/app/src/main/java/com/example/eplakfixed/MainActivity.kt`, 'utf8');
ok('اپ پس از خروج، ورود را پاک می‌کند (PER-خواسته‌ی کارفرما)',
  activitySrc.includes('shouldRequireLogin') && activitySrc.includes('markLoginDone') && activitySrc.includes('prepareExit'));
ok('داده‌های همراه پیام رشته‌اند (الزام فایربیس)', typeof first?.message?.data?.url === 'string' && typeof first?.message?.data?.id === 'string');

console.log('\n=== توکن باطل (اپ حذف شده) ===');
const dead = JSON.parse(await run(`
require '${APP}/admin/includes/db.php';
eplakFcmSaveToken($pdo, '09120000000', 'BAD-TOKEN', 'android');
$before = eplakFcmCount($pdo);
$res = eplakFcmSend($pdo, eplakFcmTokens($pdo, ['09120000000']), 'تست', 'متن', ['url' => 'index.html']);
echo json_encode(['before' => $before, 'sent' => $res['sent'], 'failed' => $res['failed'], 'after' => eplakFcmCount($pdo), 'error' => $res['errors'][0] ?? '']);`));
ok('ارسال به توکن باطل ناموفق ثبت شد', dead.sent === 0 && dead.failed === 1, JSON.stringify(dead));
ok('پیام خطای گوگل ثبت شد', String(dead.error || '').includes('UNREGISTERED'), String(dead.error));
ok('توکن باطل خودکار غیرفعال شد', dead.after < dead.before, JSON.stringify(dead));

console.log('\n=== ارسال آزمایشی و حالت «تنظیم نشده» ===');
const test = JSON.parse(await run(`
require '${APP}/admin/includes/db.php';
$res = eplakFcmNotifyPhone($pdo, '09123456789', 'اعلان آزمایشی', 'متن آزمایشی', ['url' => 'index.html']);
echo json_encode($res);`));
ok('ارسال آزمایشی به دستگاه‌های آن شماره موفق بود', test.sent === 2, JSON.stringify(test));

const unset = JSON.parse(await run(`
require '${APP}/admin/includes/db.php';
eplakSetAppSetting($pdo, 'fcm_service_account', '');
$cfg = eplakFcmConfig($pdo);
$res = eplakFcmSend($pdo, eplakFcmTokens($pdo, ['09123456789']), 'ت', 'م', []);
echo json_encode(['ready' => $cfg['ready'], 'skipped' => $res['skipped'], 'sent' => $res['sent']]);`));
ok('بدون کلید، موتور غیرفعال گزارش می‌شود', unset.ready === false);
ok('ارسال بی‌خطا رد می‌شود (بدون استثنا)', unset.sent === 0 && String(unset.skipped).length > 5);

fakeGoogle.close();
console.log('\n' + '='.repeat(52));
console.log(`FCM: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
