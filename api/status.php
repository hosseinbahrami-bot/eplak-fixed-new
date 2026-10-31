<?php
/* ============================================================================
   api/status.php — «سلامتِ سرور» (مخصوص هاست تازه)
   ----------------------------------------------------------------------------
   تفاوت با api/ping.php:
     ping.php   → فقط «سرور/اینترنت زنده است؟» و هرگز دیتابیس را لمس نمی‌کند
                  (پرده‌ی «بدون اینترنت» اپ به آن وابسته است؛ باید همیشه جواب دهد).
     status.php → تشخیصِ «چرا سایت کار نمی‌کند»: وجود shared/config.php، رسیدن به
                  دیتابیس، ساختِ جدول‌ها، پیکربندی پنل پیامک، اکستنشن‌های PHP،
                  پوشه‌های نوشتنی و منطقه‌ی زمانی.

   چرا لازم شد؟ شکایت واقعی: «هاست تازه گرفتم؛ موقع وارد کردن شماره می‌گوید
   ارسال کد تایید انجام نشد». دلیلش معمولاً نبودِ shared/config.php است (این فایل
   عمداً در گیت و در بسته‌ی آپلود نیست) یا تنظیم نبودن پنل پیامک. با یک نگاه به
   این JSON، علت و راه‌حلش معلوم می‌شود.

   امنیت: هیچ رمز، کلید یا داده‌ی شخصی چاپ نمی‌شود — فقط «هست/نیست» و نام
   کاربری/دیتابیس (که در cPanel هم دیده می‌شود). این صفحه هرگز ۵۰۰ نمی‌دهد:
   خطاها داخل همان JSON گزارش می‌شوند.
   ============================================================================ */

require_once __DIR__ . '/../shared/fa_datetime.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$root = dirname(__DIR__);
$configPath = $root . '/shared/config.php';

$fileCfg = [];
if (is_file($configPath)) {
    $loaded = @include $configPath;
    if (is_array($loaded)) {
        $fileCfg = $loaded;
    }
}

/* تنظیمات مؤثر: اول متغیر محیطی، بعد shared/config.php (مثل خودِ bootstrap) */
$driver = strtolower((string) (getenv('DB_DRIVER') ?: ($fileCfg['driver'] ?? 'mysql')));
$dbHost = (string) (getenv('DB_HOST') ?: ($fileCfg['host'] ?? 'localhost'));
$dbUser = (string) (getenv('DB_USER') ?: ($fileCfg['user'] ?? ''));
$dbName = (string) (getenv('DB_NAME') ?: ($fileCfg['name'] ?? ''));
$dbPass = (string) (getenv('DB_PASS') !== false && getenv('DB_PASS') !== ''
    ? getenv('DB_PASS')
    : ($fileCfg['pass'] ?? ''));

$payamakUser = trim((string) (getenv('PAYAMAK_USERNAME') ?: ($fileCfg['payamak_username'] ?? '')));
$payamakPass = trim((string) (getenv('PAYAMAK_PASSWORD') ?: ($fileCfg['payamak_password'] ?? '')));
$payamakTpl  = trim((string) (getenv('PAYAMAK_TEMPLATE_ID') ?: ($fileCfg['payamak_template_id'] ?? '')));
$amootToken  = trim((string) (getenv('AMOOTSMS_TOKEN') ?: ($fileCfg['amootsms_token'] ?? '')));

$payamakReady = $payamakUser !== '' && $payamakPass !== '' && preg_match('/^\d+$/', $payamakTpl) === 1;
$payamakPartial = !$payamakReady && ($payamakUser !== '' || $payamakPass !== '' || $payamakTpl !== '');

/* ── اتصال به دیتابیس (بدون bootstrap تا هیچ‌وقت ۵۰۰ نشود) ─────────────── */
$dbOk = false;
$dbError = '';
$tables = [];
$pdo = null;
try {
    $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
    if ($driver === 'sqlite') {
        $sqlitePath = (string) (getenv('DB_SQLITE_PATH') ?: ($fileCfg['sqlite_path'] ?? ($root . '/data/eplak.sqlite')));
        $pdo = new PDO('sqlite:' . $sqlitePath, null, null, $opts);
    } elseif (is_file($configPath) || getenv('DB_NAME')) {
        $pdo = new PDO('mysql:host=' . $dbHost . ';dbname=' . $dbName . ';charset=utf8mb4', $dbUser, $dbPass, $opts);
    } else {
        $dbError = 'تنظیمات دیتابیس وجود ندارد (shared/config.php یا متغیرهای محیطی).';
    }
    if ($pdo instanceof PDO) {
        $dbOk = true;
        foreach (['users', 'reports', 'notifications', 'news', 'device_tokens', 'otp_challenges', 'admin_users'] as $tableName) {
            try {
                $pdo->query('SELECT 1 FROM ' . $tableName . ' LIMIT 1');
                $tables[$tableName] = true;
            } catch (Throwable $tableError) {
                $tables[$tableName] = false;
            }
        }
    }
} catch (Throwable $e) {
    $dbOk = false;
    $dbError = $e->getMessage();
}

/* ── پوشه‌های نوشتنی ─────────────────────────────────────────────────────── */
$uploadsDir = $root . '/uploads';
$dataDir = $root . '/data';
$sharedDir = $root . '/shared';

/* ── نشانی صفحه‌ی راه‌انداز ──────────────────────────────────────────────── */
$scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
$apiDir = rtrim(dirname($scriptName), '/');
$siteDir = (basename($apiDir) === 'api') ? rtrim(dirname($apiDir), '/') : $apiDir;
$isHttps = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
$setupUrl = ($isHttps ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost')
    . ($siteDir === '' || $siteDir === '/' ? '' : $siteDir) . '/setup.php';

/* ── فهرست مشکل‌ها با راه‌حل (به همان زبانی که کاربر می‌فهمد) ───────────── */
$problems = [];
if (!is_file($configPath) && !getenv('DB_NAME')) {
    $problems[] = 'فایل shared/config.php وجود ندارد ⇒ سایت راه‌اندازی نشده. صفحه‌ی setup.php را باز کنید و اطلاعات دیتابیس و پنل پیامک را وارد کنید.';
}
if (!$dbOk) {
    $problems[] = 'اتصال به دیتابیس برقرار نیست ⇒ نام دیتابیس/کاربر/رمز در cPanel و در shared/config.php را بررسی کنید.';
}
if ($driver === 'mysql' && !extension_loaded('pdo_mysql')) {
    $problems[] = 'اکستنشن pdo_mysql در PHP فعال نیست ⇒ از cPanel (Select PHP Version) فعالش کنید.';
}
if (!function_exists('curl_init')) {
    $problems[] = 'اکستنشن cURL فعال نیست ⇒ ارسال پیامک ممکن نیست.';
}
if (!$payamakReady && $amootToken === '') {
    $problems[] = 'پنل پیامک تنظیم نشده ⇒ «کد تایید» ارسال نمی‌شود. کلیدهای Payamak (نام کاربری/رمز/شناسه‌ی متن) یا توکن AmootSMS را در shared/config.php یا setup.php وارد کنید.';
} elseif ($payamakPartial) {
    $problems[] = 'تنظیمات Payamak ناقص است ⇒ نام کاربری، رمز و «شناسه‌ی متن تأییدشده» (bodyId، فقط رقم) هر سه لازم‌اند.';
}
foreach ($tables as $tableName => $exists) {
    if (!$exists) {
        $problems[] = 'جدول «' . $tableName . '» ساخته نشده ⇒ یک‌بار سایت را باز کنید تا خودکار ساخته شود (یا در setup.php دکمه‌ی «ساخت/ترمیم جدول‌ها»).';
        break;
    }
}
if (is_dir($uploadsDir) && !is_writable($uploadsDir)) {
    $problems[] = 'پوشه‌ی uploads نوشتنی نیست ⇒ آپلود عکس/فیلم گزارش‌ها کار نمی‌کند (اجازه‌ی 755/775).';
}
if (!is_writable($sharedDir) && !is_file($configPath)) {
    $problems[] = 'پوشه‌ی shared نوشتنی نیست ⇒ setup.php نمی‌تواند config.php را بسازد (دستی با FTP بسازیدش).';
}

$otpReady = $dbOk && ($payamakReady || $amootToken !== '') && function_exists('curl_init')
    && ($tables['otp_challenges'] ?? false) && ($tables['users'] ?? false);

echo json_encode([
    'success'      => true,
    'ready'        => $problems === [] && $dbOk,
    'otp_ready'    => $otpReady,   /* «ارسال کد تایید» کار می‌کند؟ */
    'problems'     => $problems,
    'generated_at' => function_exists('eplakFaDateTime') ? eplakFaDateTime() : '',
    'server_time'  => (new DateTimeImmutable('now', new DateTimeZone('Asia/Tehran')))->format('c'),
    'php_version'  => PHP_VERSION,
    'php_ok'       => version_compare(PHP_VERSION, '7.4.0', '>='),
    'extensions'   => [
        'pdo_mysql'  => extension_loaded('pdo_mysql'),
        'pdo_sqlite' => extension_loaded('pdo_sqlite'),
        'curl'       => function_exists('curl_init'),
        'mbstring'   => extension_loaded('mbstring'),
        'gd'         => extension_loaded('gd'),
    ],
    'config_exists' => is_file($configPath),
    'db' => [
        'driver' => $driver,
        'host'   => $dbHost,
        'name'   => $dbName !== '' ? $dbName : null,
        'user'   => $dbUser !== '' ? $dbUser : null,
        'ok'     => $dbOk,
        'error'  => $dbOk ? null : $dbError,
        'tables' => $tables,
    ],
    'sms' => [
        'ready'    => $payamakReady || $amootToken !== '',
        'provider' => $payamakReady ? 'payamak' : ($amootToken !== '' ? 'amootsms' : null),
        'username' => $payamakUser !== '' ? $payamakUser : null,
        'template_id' => $payamakTpl !== '' ? $payamakTpl : null,
    ],
    'writable' => [
        'shared'  => is_writable($sharedDir),
        'uploads' => is_dir($uploadsDir) ? is_writable($uploadsDir) : false,
        'data'    => is_dir($dataDir) ? is_writable($dataDir) : false,
    ],
    'timezone' => [
        'db'      => (string) ($fileCfg['db_timezone'] ?? 'Asia/Tehran'),
        'display' => (string) ($fileCfg['display_timezone'] ?? 'Asia/Tehran'),
        'php'     => date_default_timezone_get(),
    ],
    'setup_url' => $setupUrl,
    'docs'      => 'docs/NEW_HOST_FA.md',
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
