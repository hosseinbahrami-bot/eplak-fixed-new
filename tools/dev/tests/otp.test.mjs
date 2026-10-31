/* otp.test.mjs — ارسال و اعتبارسنجی کد پیامکی ورود */
import fs from 'fs';
import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
let pass = 0, fail = 0;
const ok = (name, condition) => {
  if (condition) {
    pass++;
    console.log('  ✅ ' + name);
  } else {
    fail++;
    console.log('  ❌ ' + name);
  }
};
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const api = read('api/auth.php');
const client = read('modules/auth.js');
const index = read('index.html');
const css = read('assets/css/style.css');
const configGuide = read('INSTALL_GUIDE_FA.md');

ok('درخواست Payamak فقط از API سمت سرور انجام می‌شود',
  api.includes('https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber') && !client.includes('payamak-panel.com'));
ok('مشخصات Payamak از متغیر محیطی یا تنظیمات خصوصی سرور خوانده می‌شود',
  api.includes('PAYAMAK_USERNAME') && api.includes('PAYAMAK_PASSWORD') && api.includes('PAYAMAK_TEMPLATE_ID') &&
  api.includes("['payamak_username']") && api.includes("['payamak_password']") &&
  api.includes("['payamak_template_id']") && !index.includes('PAYAMAK_PASSWORD'));
ok('درخواست شامل شناسه متن، شماره مقصد و کد چهاررقمی به‌عنوان متن جایگزین است',
  api.includes("'username' => $payamakUsername") && api.includes("'password' => $payamakPassword") &&
  api.includes("'to' => $phone") && api.includes("'bodyId' => $payamakTemplateId") &&
  api.includes("'text' => (string)random_int(1000, 9999)"));
ok('موفقیت Payamak با RetStatus=1 تشخیص داده و TLS اعتبارسنجی می‌شود',
  api.includes("($providerPayload['RetStatus'] ?? '') === '1'") &&
  api.includes('CURLOPT_SSL_VERIFYPEER => true') && api.includes('CURLOPT_SSL_VERIFYHOST => 2'));
ok('کد دریافتی از سرویس به صورت هش نگهداری می‌شود',
  api.includes('password_hash($providerCode') && api.includes('password_verify($code'));
ok('کد منقضی می‌شود و ارسال و تلاش تایید محدود هستند',
  api.includes('$iranNow + 300') && api.includes('$iranNow - 600') && api.includes('>= 3') && api.includes('>= 10') && api.includes('>= 5'));
ok('کد ثابت 1111 فقط برای درخواست loopback محلی فعال است و پیامک نمی‌فرستد',
  api.includes("['otp_test_code']") && api.includes("in_array($host, ['localhost', '127.0.0.1', '::1'], true)") &&
  api.includes("in_array($remoteAddress, ['127.0.0.1', '::1'], true)") &&
  api.includes("'test_code' => $testCode") && api.includes('password_hash($testCode'));
ok('ورود کلاینت فقط بعد از تایید سرور انجام می‌شود',
  /await requestServerOtp\('verify'[\s\S]*?if \(typeof loginWithPhone/.test(client));
ok('ارسال و ارسال مجدد تنها پس از پاسخ موفق سرور تایمر را شروع می‌کنند',
  /await requestServerOtp\('send'[\s\S]*?startOtpTimer\(\)/.test(client) &&
  /async function resendOtp[\s\S]*?await requestServerOtp\('send'[\s\S]*?startOtpTimer\(\)/.test(client));
ok('ارسال مجدد پس از ۱۲۰ ثانیه در کلاینت و سرور فعال می‌شود',
  client.includes('let otpSeconds = 120') && client.includes('otpSeconds = 120') &&
  api.includes("'resend_after' => 120") &&
  api.includes('$resendWait = 120 - ($iranNow - $lastRequestAt)'));
ok('نسخه‌های CSS و JS به‌روز شده تا اپ کش‌شده تایمر جدید را دریافت کند',
  /style\.css\?v=93/.test(index) && /modules\/auth\.js\?v=15/.test(index));
ok('کد صحیح و اشتباه بازخورد سبز و قرمز متمایز دارند',
  client.includes("setOtpVisualState('valid')") && client.includes("setOtpVisualState('invalid')") &&
  css.includes('#screen-otp .otp-inputs-row.otp-valid input.otp-box') &&
  css.includes('#screen-otp .otp-inputs-row.otp-invalid input.otp-box') &&
  css.includes('@keyframes otpInvalidShake'));
ok('راهنما تنظیم Payamak و کد آزمایشی localhost را توضیح می‌دهد',
  configGuide.includes('PAYAMAK_USERNAME') && configGuide.includes('payamak_template_id') &&
  configGuide.includes('bodyId') &&
  configGuide.includes('otp_test_code') && configGuide.includes('فقط درخواست‌هایی'));

/* ── هاست تازه: «ارسال کد تایید انجام نشد» باید دلیلِ واقعی داشته باشد ──────
   شکایت کارفرما: هاست عوض شد و اپ فقط «ارسال کد تایید انجام نشد» می‌گفت.
   ریشه: shared/config.php در گیت/بسته نیست ⇒ خطای دیتابیس به‌صورت صفحه‌ی HTML
   برمی‌گشت ⇒ اپ JSON پارس نمی‌کرد ⇒ پیامِ کلی. راه‌حل: API همیشه JSON با دلیلِ
   خوانا + صفحه‌ی راه‌انداز setup.php + راهنمای docs/NEW_HOST_FA.md. */
const dbFile = read('admin/includes/db.php');
const ping = read('api/ping.php');
const statusApi = read('api/status.php');
const example = read('shared/config.example.php');
const setup = read('setup.php');

ok('خطای دیتابیس برای همه‌ی اندپوینت‌های api/ همیشه JSON است (نه صفحه‌ی HTML)',
  /api\/\[\^\/\]\+/.test(dbFile) && dbFile.includes("'success'   => false,") && dbFile.includes('$wantsJson'));
ok('پیامِ خطا دلیلِ «هاست تازه» را می‌گوید و نشانی setup.php را برمی‌گرداند',
  dbFile.includes('shared/config.php وجود ندارد') && dbFile.includes("'setup_url' => $setupUrl")
    && dbFile.includes('docs/NEW_HOST_FA.md'));
ok('اپ به‌جای پیامِ کلی، دلیلِ سرور یا راهنمای راه‌انداز را نشان می‌دهد',
  client.includes('serverSaid') && client.includes('setup.php') && client.includes('docs/NEW_HOST_FA.md'));
ok('api/status.php سلامت سرور را بدون افشای رمز گزارش می‌کند (config/دیتابیس/جدول‌ها/پیامک)',
  statusApi.includes("'config_exists' => is_file($configPath)") && statusApi.includes("'otp_ready'")
    && statusApi.includes("'sms' =>") && statusApi.includes("'problems'")
    && !/'pass'\s*=>/.test(statusApi) && !/echo[^;]*\$dbPass/.test(statusApi));
ok('ping.php بی‌دیتابیس می‌ماند تا پرده‌ی «بدون اینترنت» اپ همیشه کار کند',
  !ping.includes('db.php') && !ping.includes('$pdo') && !ping.includes('status.php'));
ok('status.php هرگز ۵۰۰ نمی‌دهد: اتصال به دیتابیس داخل try/catch و بدون bootstrap است',
  /try \{[\s\S]*new PDO\([\s\S]*\} catch \(Throwable \$e\)/.test(statusApi)
    && !statusApi.includes('bootstrap.php'));
ok('الگوی config کلیدهای پنل پیامک را دارد (Payamak و AmootSMS)',
  example.includes("'payamak_username'") && example.includes("'payamak_password'")
    && example.includes("'payamak_template_id'") && example.includes("'amootsms_token'"));
ok('setup.php اتصال را پیش از نوشتن آزمایش می‌کند و فقط در اجرای اول/با مدیر می‌نویسد',
  setup.includes('eplak_setup_try_pdo($values, $err)')
    && setup.includes('eplak_setup_config_exists() && !eplak_setup_admin()')
    && setup.includes('hash_equals(eplak_setup_token(), $token)')
    && setup.includes('@chmod(EPLAK_SETUP_CONFIG, 0600)'));
ok('setup.php کلیدهای پنل پیامک را هم می‌گیرد (ریشه‌ی «کد تایید نمی‌آید»)',
  setup.includes('payamak_username') && setup.includes('payamak_template_id') && setup.includes('amootsms_token'));
ok('راهنمای هاست تازه هست و از راهنمای نصب به آن ارجاع داده شده',
  read('docs/NEW_HOST_FA.md').includes('ارسال کد تایید انجام نشد')
    && configGuide.includes('docs/NEW_HOST_FA.md') && configGuide.includes('setup.php'));
ok('بسته‌ی آپلود هاست، راه‌انداز + نقطه‌ی تشخیص + راهنمای هاست تازه را دارد',
  read('tools/build-update-package.sh').includes('setup.php') &&
  read('tools/build-update-package.sh').includes('api/status.php') &&
  read('tools/build-update-package.sh').includes('docs/NEW_HOST_FA.md'));
ok('راهنمای هاست تازه به api/status.php ارجاع می‌دهد (نه ping)',
  read('docs/NEW_HOST_FA.md').includes('api/status.php')
    && !read('docs/NEW_HOST_FA.md').includes('ping.php?full=1'));

console.log(`\nنتیجهٔ OTP: ${pass} موفق، ${fail} ناموفق`);
if (fail) process.exitCode = 1;
