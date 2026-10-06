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
  /style\.css\?v=93/.test(index) && /modules\/auth\.js\?v=14/.test(index));
ok('کد صحیح و اشتباه بازخورد سبز و قرمز متمایز دارند',
  client.includes("setOtpVisualState('valid')") && client.includes("setOtpVisualState('invalid')") &&
  css.includes('#screen-otp .otp-inputs-row.otp-valid input.otp-box') &&
  css.includes('#screen-otp .otp-inputs-row.otp-invalid input.otp-box') &&
  css.includes('@keyframes otpInvalidShake'));
ok('راهنما تنظیم Payamak و کد آزمایشی localhost را توضیح می‌دهد',
  configGuide.includes('PAYAMAK_USERNAME') && configGuide.includes('payamak_template_id') &&
  configGuide.includes('bodyId') &&
  configGuide.includes('otp_test_code') && configGuide.includes('فقط درخواست‌هایی'));

console.log(`\nنتیجهٔ OTP: ${pass} موفق، ${fail} ناموفق`);
if (fail) process.exitCode = 1;
