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
const payamakLib = read('shared/payamak.php');

ok('درخواست «ملی پیامک» فقط از API سمت سرور و از یک تابعِ مشترک انجام می‌شود',
  payamakLib.includes("'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber'")
    && !client.includes('payamak-panel.com') && api.includes('eplakPayamakSendCode(')
    && !api.includes('curl_init('));
ok('مشخصات ملی پیامک از متغیر محیطی یا تنظیمات خصوصی سرور خوانده می‌شود',
  api.includes('PAYAMAK_USERNAME') && api.includes('PAYAMAK_TEMPLATE_ID') &&
  api.includes("['payamak_username']") && api.includes("['payamak_template_id']") &&
  payamakLib.includes('PAYAMAK_API_KEY') && payamakLib.includes('PAYAMAK_PASSWORD') &&
  payamakLib.includes("['payamak_api_key']") && payamakLib.includes("['payamak_password']") &&
  !index.includes('PAYAMAK_PASSWORD') && !index.includes('payamak_api_key'));
ok('درخواست شامل شناسه متن، شماره مقصد و کد چهاررقمی به‌عنوان متن جایگزین است',
  /'username'\s*=>\s*\$username/.test(payamakLib) && /'password'\s*=>\s*\$secret/.test(payamakLib) &&
  /'to'\s*=>\s*\$to/.test(payamakLib) && /'bodyId'\s*=>\s*\$bodyId/.test(payamakLib) &&
  /'text'\s*=>\s*\(string\)\s*\$code/.test(payamakLib) &&
  api.includes('$providerCode = (string)random_int(1000, 9999);'));
ok('موفقیت ملی پیامک با RetStatus=1 تشخیص داده و TLS اعتبارسنجی می‌شود',
  payamakLib.includes("$ok = ($status === '1');") &&
  payamakLib.includes('CURLOPT_SSL_VERIFYPEER => true') && payamakLib.includes('CURLOPT_SSL_VERIFYHOST => 2'));
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
ok('راهنما تنظیم ملی پیامک و کد آزمایشی localhost را توضیح می‌دهد',
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
const newHostGuide = read('docs/NEW_HOST_FA.md');

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
ok('الگوی config کلیدهای پنل «ملی پیامک» را دارد و شناسه‌ی متنِ پیش‌فرض 573639 است',
  example.includes("'payamak_username'") && example.includes("'payamak_api_key'")
    && example.includes("'payamak_password'")
    && example.includes("'payamak_template_id' => '573639'") && !/amoot/i.test(example));
ok('setup.php اتصال را پیش از نوشتن آزمایش می‌کند و فقط در اجرای اول/با مدیر می‌نویسد',
  setup.includes('eplak_setup_try_pdo($values, $err)')
    && setup.includes('eplak_setup_config_exists() && !eplak_setup_admin()')
    && setup.includes('hash_equals(eplak_setup_token(), $token)')
    && setup.includes('@chmod(EPLAK_SETUP_CONFIG, 0600)'));
ok('setup.php کلیدهای پنل «ملی پیامک» را هم می‌گیرد (ریشه‌ی «کد تایید نمی‌آید»)',
  setup.includes('payamak_username') && setup.includes('payamak_template_id')
    && setup.includes('eplakPayamakDefaultTemplate()') && !/amoot/i.test(setup));
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

/* ── تنها ارائه‌دهنده‌ی پیامک: ملی پیامک (شناسه‌ی متن 573639) ─────────────────
   درخواست کارفرما: «از آموت رو کلا حذف کن، از ملی پیامک بخون — شناسه کد متن
   573639 ملی پیامک». (شناسه اول 552115 داده شد و بعد به 573639 اصلاح
   شد؛ مقدارِ مؤثر همیشه یک‌جا از shared/payamak.php می‌آید.)
   پس آموت نه در کد، نه در الگوی تنظیمات، نه در راه‌انداز،
   نه در تشخیص و نه در راهنماها نباید بماند؛ وگرنه روی هاست دو مسیرِ پیامک
   ساخته می‌شود و عیب‌یابیِ «کد تایید نمی‌آید» سخت می‌شود. */
console.log('— ۴) تنها ملی پیامک، با شناسه‌ی متنِ پیش‌فرض 573639');
ok('آموت‌اس‌ام‌اس از کد، الگوی تنظیمات، راه‌انداز و راهنماها کاملاً حذف شده',
  [api, statusApi, setup, example, payamakLib, newHostGuide, configGuide]
    .every((text) => !/amoot/i.test(text)));
ok('نشانی و شکلِ درخواستِ ملی پیامک یک‌جا در shared/payamak.php دست‌نخورده مانده‌اند',
  payamakLib.includes('https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber')
    && /'bodyId'\s*=>\s*\$bodyId/.test(payamakLib)
    && /'bodyId'\s*=>\s*\$payamakTemplateId/.test(api)
    && api.includes('PAYAMAK_USERNAME') && api.includes("['payamak_template_id']"));
ok('شناسه‌ی متنِ پیش‌فرض یک‌جا (shared/payamak.php) تعریف شده و هر سه مصرف‌کننده از آن می‌خوانند',
  payamakLib.includes("define('EPLAK_PAYAMAK_TEMPLATE_DEFAULT', '573639')")
    && api.includes('eplakPayamakDefaultTemplate()') && statusApi.includes('eplakPayamakDefaultTemplate()')
    && setup.includes('eplakPayamakDefaultTemplate()')
    && example.includes("'payamak_template_id' => '573639'"));
ok('اگر شناسه‌ی متن خالی باشد، همان پیش‌فرض مؤثر است (api و status و setup یکی می‌گویند)',
  api.includes("if ($payamakTemplateId === '') {")
    && api.includes('$payamakTemplateId = eplakPayamakDefaultTemplate();')
    && statusApi.includes("$payamakTplRaw !== '' ? $payamakTplRaw : eplakPayamakDefaultTemplate()")
    && setup.includes('eplakPayamakTemplateId($cfg)'));
ok('status.php دیگر ارائه‌دهنده‌ی دوم ندارد: provider یا payamak است یا null',
  statusApi.includes("'provider' => $payamakReady ? 'payamak' : null")
    && statusApi.includes('$otpReady = $dbOk && $payamakReady && function_exists(\'curl_init\')'));
ok('setup.php اگر نام کاربری/رمز ملی پیامک نیمه‌کاره باشد، چیزی نمی‌نویسد',
  setup.includes("($values['payamak_username'] === '') !== ($values['payamak_password'] === '')")
    && setup.includes('ملی پیامک — نام کاربری'));
ok('بسته‌ی آپلود هاست shared/payamak.php را دارد و ارجاع به آموت را رد می‌کند',
  read('tools/build-update-package.sh').includes('shared/payamak.php')
    && read('tools/build-update-package.sh').includes("grep -qi 'amoot'"));
ok('شناسه‌ی قدیمیِ 552115 هیچ‌جای کد/راهنماها نمانده (فقط 573639 مؤثر است)',
  [api, statusApi, setup, example, payamakLib, newHostGuide, configGuide]
    .every((text) => !text.includes('552115')));
ok('راهنماها فقط ملی پیامک و شناسه‌ی 573639 را می‌گویند',
  newHostGuide.includes('573639') && configGuide.includes('573639')
    && newHostGuide.includes('ملی پیامک') && configGuide.includes('ملی پیامک'));

/* ── ۵) کلید API، ترجمه‌ی فارسیِ کدها، پیامکِ آزمایشی، پوشه‌های نوشتنی، CORS ──
   درخواست‌های کارفرما (بهبودهای سمتِ کدِ پیامک):
     • «کلید API» جایِ درستِ رمزِ وب‌سرویس است (payamak_api_key) — رمزِ عبورِ پنل
       با RetStatus=-110 رد می‌شود و «کد تایید» نمی‌آید.
     • پاسخِ ملی پیامک باید فارسی ترجمه شود و در error_log دلیلِ کامل بیاید.
     • پنل یک «ارسال پیامک آزمایشی» داشته باشد (فقط مدیرِ کل، با CSRF).
     • setup.php برچسبِ درست بدهد، وضعیتِ پوشه‌ها را صادقانه بگوید و دکمه‌ی
       «ساخت پوشه‌های نوشتنی» داشته باشد.
     • بسته‌ی آپلود، پوشه‌های نوشتنی را ببرد (نه داده‌ی کاربران را).
     • خطای دیتابیس روی مسیرِ JSON هدر CORS بگیرد تا اپ دلیلِ واقعی را ببیند. */
console.log('— ۵) کلید API، ترجمه‌ی فارسی، پیامکِ آزمایشی، پوشه‌های نوشتنی و CORS');
const settingsPage = read('admin/settings.php');
const buildScript = read('tools/build-update-package.sh');
const gitignore = read('.gitignore');
const mediaLib = read('shared/media.php');

ok('کلیدِ وب‌سرویس «ApiKey» است نه رمزِ عبورِ پنل (با سازگاریِ تنظیمِ قدیمی)',
  payamakLib.includes("getenv('PAYAMAK_API_KEY')") && payamakLib.includes("$config['payamak_api_key'] ?? ''")
    && payamakLib.includes("getenv('PAYAMAK_PASSWORD')") && payamakLib.includes('function eplakPayamakSecretSource')
    && payamakLib.includes('function eplakPayamakSecret(')
    && api.includes('eplakPayamakSecret($fileConfig)') && statusApi.includes('eplakPayamakSecret($fileCfg)')
    && setup.includes("'payamak_api_key'     => trim((string) ($_POST['payamak_api_key'] ?? ''))")
    && example.includes("'payamak_api_key'     => ''"));

ok('هر کدِ پاسخِ ملی پیامک ترجمه‌ی فارسی و «چه‌کار باید کرد» دارد',
  payamakLib.includes('function eplakPayamakStatusText') && payamakLib.includes('function eplakPayamakExplain')
    && ['-110', '-109', '-108', '-4', '-5', '-1', '0', '2', '35', '19', '-8', '-6', '1']
      .every((c) => new RegExp("'" + c.replace(/-/g, '\\-') + "'\\s*=>").test(payamakLib))
    && payamakLib.includes('StrRetStatus') && payamakLib.includes("($data['Value'] ?? '')"));

const logBlock = payamakLib.slice(payamakLib.indexOf('$logParts = '), payamakLib.indexOf("'ok'     => $ok"));
ok('گزارشِ error_log پرجزئیات است (HTTP/RetStatus/ترجمه/مقصدِ پوشیده) ولی کلید و رمز در آن نیست',
  logBlock.includes("'[eplak-sms]'") && logBlock.includes('ret=') && logBlock.includes('http=')
    && !logBlock.includes('$secret') && !logBlock.includes('$username') && !logBlock.includes('$request')
    && payamakLib.includes("$result['log'] .= ' to=' . $masked . ' bodyId=' . $bodyId . ' secret=' . $source;")
    && payamakLib.includes("substr($to, 0, 4)")
    && api.includes("error_log('[eplak-otp] ' . $sms['log']"));

ok('«ارسال پیامک آزمایشی» فقط با ورودِ مدیرِ کل + CSRF و از همان مسیرِ «کد تایید» است',
  settingsPage.includes("$action === 'test_sms'")
    && settingsPage.includes('eplakPayamakSendCode($smsCfg, $phone, $smsTestCode)')
    && settingsPage.includes("eplakRequirePermission('settings')") && settingsPage.includes('eplakRequireCsrf();')
    && settingsPage.includes('data-testid="sms-test-send"') && settingsPage.includes('sms_test_last_at')
    && settingsPage.includes('eplakPayamakReady($smsCfg)') && settingsPage.includes('sms-test-result'));

ok('setup.php برچسبِ درست دارد: «کلید API» به‌جای «رمز عبورِ پنل»',
  setup.includes('ملی پیامک — کلید API (به‌جای رمز عبورِ پنل)') && setup.includes('name="payamak_api_key"')
    && !setup.includes('name="payamak_password"') && setup.includes('-110')
    && setup.includes('توسعه‌دهندگان ← تنظیمات وب‌سرویس')
    && setup.includes("($values['payamak_username'] === '') !== ($values['payamak_password'] === '')"));

ok('setup.php وضعیتِ پوشه‌ها را صادقانه می‌گوید و دکمه‌ی «ساخت پوشه‌های نوشتنی» دارد',
  setup.includes('function eplak_setup_dir_status()') && setup.includes('function eplak_setup_make_dirs()')
    && setup.includes("$action === 'make_dirs'") && setup.includes('وجود ندارد')
    && setup.includes('نوشتنی نیست') && setup.includes('value="make_dirs"')
    && setup.includes('eplakMediaGuardContent()') && setup.includes('eplakMediaGuardMarker()'));

ok('نگهبانِ uploads/.htaccess یک‌جا تعریف شده (media.php و setup.php یک متن می‌نویسند)',
  mediaLib.includes('function eplakMediaGuardContent') && mediaLib.includes('function eplakMediaGuardMarker')
    && mediaLib.includes('@file_put_contents($htaccess, eplakMediaGuardContent())')
    && mediaLib.includes('Require all denied') && mediaLib.includes('Deny from all'));

ok('خطای دیتابیس روی مسیرِ JSON هدر CORS می‌گیرد (وگرنه اپ دلیلِ واقعی را نمی‌بیند)',
  /if \(\$wantsJson\) \{[\s\S]*?Access-Control-Allow-Origin: \*/.test(dbFile)
    && /REQUEST_METHOD[\s\S]*?OPTIONS[\s\S]*?http_response_code\(204\)/.test(dbFile)
    && dbFile.includes("header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');")
    && dbFile.includes("header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');"));

ok('بسته‌ی آپلود پوشه‌های نوشتنی و نگهبانِ آپلود را می‌برد، ولی داده‌ی کاربران را نه',
  ['uploads/.htaccess', 'uploads/reports/.gitkeep', 'uploads/news/.gitkeep',
   'uploads/ads/.gitkeep', 'uploads/tmp/.gitkeep', 'data/.gitkeep']
    .every((f) => buildScript.includes(f))
    && buildScript.includes('tools/package-stubs')
    && buildScript.includes('shared/config.php data/eplak.sqlite')
    && buildScript.includes("^uploads/(reports|news|ads|tmp)/[0-9]{4}/")
    && gitignore.includes('uploads/') && gitignore.includes('data/')
    && gitignore.includes('shared/config.php'));


console.log(`\nنتیجهٔ OTP: ${pass} موفق، ${fail} ناموفق`);
if (fail) process.exitCode = 1;
