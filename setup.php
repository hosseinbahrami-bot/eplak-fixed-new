<?php
/* ============================================================================
   setup.php — راه‌انداز و عیب‌یابِ هاست (مخصوصاً «هاست تازه»)
   ----------------------------------------------------------------------------
   چرا لازم شد؟
     فایل shared/config.php عمداً در گیت و در بسته‌ی آپلود نیست (رمز دیتابیس
     داخلش است). پس وقتی سایت را روی یک هاست تازه فقط «آپلود» می‌کنید، هیچ
     تنظیمی وجود ندارد و اولین چیزی که می‌شکنید «ارسال کد تایید» است:
     اپ پیامِ کلی «ارسال کد تایید انجام نشد» می‌دهد، درحالی‌که دلیلِ واقعی
     «نبودِ shared/config.php» است.

   این صفحه چه کار می‌کند؟
     ۱) وضعیتِ سرور را بدون افشای هیچ رمزی گزارش می‌کند (PHP، pdo_mysql، cURL،
        وجود config، رسیدن به دیتابیس، جدول‌ها، پوشه‌های نوشتنی، ساعت تهران،
        پیکربندی پنل پیامک).
     ۲) در «اجرای اول» (وقتی shared/config.php وجود ندارد) فرمِ ساختِ آن را
        نشان می‌دهد: اطلاعات دیتابیس + پنل پیامک + منطقه‌ی زمانی. پیش از نوشتن،
        اتصال را با همان اطلاعات «آزمایش» می‌کند تا تنظیم خراب ذخیره نشود.
     ۳) ساختار دیتابیس خودکار است: به‌محض برقراری اتصال، bootstrap جدول‌ها و
        کاربر پیش‌فرض ادمین (admin / admin123) را می‌سازد. دکمه‌ی «ساخت/ترمیم
        جدول‌ها» همین کار را یک‌بار دستی انجام می‌دهد و نتیجه را نشان می‌دهد.

   امنیت
     - نوشتنِ تنظیمات فقط وقتی مجاز است که shared/config.php وجود نداشته باشد
       (اجرای اول) یا مدیر وارد پنل شده باشد؛ بعد از آن فرم «فقط‌خواندنی» می‌شود.
     - همه‌ی کنش‌های POST با توکن CSRF نشست بررسی می‌شوند.
     - هیچ رمز/کلیدی در خروجی چاپ نمی‌شود (فقط «هست/نیست» و نام کاربری/دیتابیس).
     - دکمه‌ی «حذف همین صفحه» (فقط برای مدیر واردشده) تا پس از راه‌اندازی،
       setup.php از روی هاست پاک شود.
   ============================================================================ */

if (session_status() !== PHP_SESSION_ACTIVE) {
    @session_start();
}

define('EPLAK_SETUP_ROOT', __DIR__);
define('EPLAK_SETUP_CONFIG', EPLAK_SETUP_ROOT . '/shared/config.php');

function eplak_setup_h($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function eplak_setup_base_url(): string
{
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/setup.php'));
    $dir = rtrim(str_replace('\\', '/', dirname($script)), '/');
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
    $host = (string) ($_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost'));
    return ($https ? 'https://' : 'http://') . $host . ($dir === '' || $dir === '/' ? '' : $dir);
}

function eplak_setup_admin(): bool
{
    return !empty($_SESSION['admin_logged_in']);
}

function eplak_setup_config_exists(): bool
{
    return is_file(EPLAK_SETUP_CONFIG);
}

function eplak_setup_load_config(): array
{
    if (!eplak_setup_config_exists()) {
        return [];
    }
    $loaded = include EPLAK_SETUP_CONFIG;
    return is_array($loaded) ? $loaded : [];
}

/* تنظیمات مؤثر: اول متغیر محیطی، بعد shared/config.php (مثل خودِ bootstrap) */
function eplak_setup_effective(): array
{
    $cfg = eplak_setup_load_config();
    return [
        'driver'   => strtolower((string) (getenv('DB_DRIVER') ?: ($cfg['driver'] ?? 'mysql'))),
        'host'     => (string) (getenv('DB_HOST') ?: ($cfg['host'] ?? 'localhost')),
        'user'     => (string) (getenv('DB_USER') ?: ($cfg['user'] ?? '')),
        'pass_set' => (getenv('DB_PASS') !== false && getenv('DB_PASS') !== '') || (($cfg['pass'] ?? '') !== ''),
        'name'     => (string) (getenv('DB_NAME') ?: ($cfg['name'] ?? '')),
        'db_tz'    => (string) ($cfg['db_timezone'] ?? 'Asia/Tehran'),
        'disp_tz'  => (string) ($cfg['display_timezone'] ?? 'Asia/Tehran'),
        'payamak_user'     => (string) (getenv('PAYAMAK_USERNAME') ?: ($cfg['payamak_username'] ?? '')),
        'payamak_pass_set' => ((getenv('PAYAMAK_PASSWORD') ?: ($cfg['payamak_password'] ?? '')) !== ''),
        'payamak_template' => (string) (getenv('PAYAMAK_TEMPLATE_ID') ?: ($cfg['payamak_template_id'] ?? '')),
        'amootsms_set'     => ((getenv('AMOOTSMS_TOKEN') ?: ($cfg['amootsms_token'] ?? '')) !== ''),
        'otp_test_code'    => (string) ($cfg['otp_test_code'] ?? ''),
    ];
}

function eplak_setup_try_pdo(array $c, ?string &$error = null): ?PDO
{
    $error = null;
    $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
    try {
        if (strtolower((string) ($c['driver'] ?? 'mysql')) === 'sqlite') {
            $path = (string) ($c['sqlite_path'] ?? (EPLAK_SETUP_ROOT . '/data/eplak.sqlite'));
            $dir = dirname($path);
            if (!is_dir($dir)) {
                @mkdir($dir, 0775, true);
            }
            return new PDO('sqlite:' . $path, null, null, $opts);
        }
        $dsn = 'mysql:host=' . $c['host'] . ';dbname=' . $c['name'] . ';charset=utf8mb4';
        return new PDO($dsn, (string) $c['user'], (string) ($c['pass'] ?? ''), $opts);
    } catch (Throwable $e) {
        $error = $e->getMessage();
        return null;
    }
}

function eplak_setup_tables(PDO $pdo, string $driver): array
{
    $names = ['users', 'reports', 'notifications', 'news', 'device_tokens', 'otp_challenges', 'admin_users'];
    $found = [];
    foreach ($names as $t) {
        try {
            $pdo->query('SELECT 1 FROM ' . $t . ' LIMIT 1');
            $found[$t] = true;
        } catch (Throwable $e) {
            $found[$t] = false;
        }
    }
    return $found;
}

function eplak_setup_status(): array
{
    $eff = eplak_setup_effective();
    $driver = $eff['driver'];
    $error = null;
    $pdo = null;
    if (eplak_setup_config_exists() || getenv('DB_NAME')) {
        $pdo = eplak_setup_try_pdo(
            ['driver' => $driver, 'host' => $eff['host'], 'name' => $eff['name'],
             'user' => $eff['user'], 'pass' => $eff['pass_set'] ? '' : '', 'sqlite_path' => null],
            $error
        );
    }
    /* برای تستِ واقعیِ اتصال، رمز از خودِ config خوانده می‌شود (نه از فرم) */
    if ($pdo === null && eplak_setup_config_exists()) {
        $cfg = eplak_setup_load_config();
        $pdo = eplak_setup_try_pdo([
            'driver' => $cfg['driver'] ?? 'mysql',
            'host'   => $cfg['host'] ?? 'localhost',
            'name'   => $cfg['name'] ?? '',
            'user'   => $cfg['user'] ?? '',
            'pass'   => $cfg['pass'] ?? '',
            'sqlite_path' => $cfg['sqlite_path'] ?? null,
        ], $error);
    }

    $tables = $pdo instanceof PDO ? eplak_setup_tables($pdo, $driver) : [];
    $sharedDir = EPLAK_SETUP_ROOT . '/shared';
    $uploadsDir = EPLAK_SETUP_ROOT . '/uploads';
    $dataDir = EPLAK_SETUP_ROOT . '/data';

    return [
        'php_version'   => PHP_VERSION,
        'php_ok'        => version_compare(PHP_VERSION, '7.4.0', '>='),
        'pdo_mysql'     => extension_loaded('pdo_mysql'),
        'pdo_sqlite'    => extension_loaded('pdo_sqlite'),
        'curl'          => function_exists('curl_init'),
        'json'          => function_exists('json_encode'),
        'config_exists' => eplak_setup_config_exists(),
        'config_writable' => is_writable($sharedDir) || (eplak_setup_config_exists() && is_writable(EPLAK_SETUP_CONFIG)),
        'driver'        => $driver,
        'db_host'       => $eff['host'],
        'db_name'       => $eff['name'],
        'db_user'       => $eff['user'],
        'db_ok'         => $pdo instanceof PDO,
        'db_error'      => $error,
        'tables'        => $tables,
        'db_timezone'   => $eff['db_tz'],
        'display_timezone' => $eff['disp_tz'],
        'uploads_writable' => is_dir($uploadsDir) ? is_writable($uploadsDir) : is_writable(EPLAK_SETUP_ROOT),
        'data_writable'    => is_dir($dataDir) ? is_writable($dataDir) : is_writable(EPLAK_SETUP_ROOT),
        'payamak_user'     => $eff['payamak_user'],
        'payamak_ready'    => $eff['payamak_user'] !== '' && $eff['payamak_pass_set'] && preg_match('/^\d+$/', $eff['payamak_template']) === 1,
        'payamak_template' => $eff['payamak_template'],
        'amootsms_ready'   => $eff['amootsms_set'],
        'otp_test_code'    => $eff['otp_test_code'],
        'admin_logged_in'  => eplak_setup_admin(),
    ];
}

function eplak_setup_token(): string
{
    if (empty($_SESSION['eplak_setup_token'])) {
        $_SESSION['eplak_setup_token'] = bin2hex(random_bytes(16));
    }
    return (string) $_SESSION['eplak_setup_token'];
}

function eplak_setup_write_config(array $values): array
{
    $dir = dirname(EPLAK_SETUP_CONFIG);
    if (!is_dir($dir)) {
        return [false, 'پوشه‌ی shared وجود ندارد.'];
    }
    if (eplak_setup_config_exists() && !eplak_setup_admin()) {
        return [false, 'shared/config.php از قبل وجود دارد؛ برای تغییر، مدیر باید وارد پنل شود.'];
    }
    if (!is_writable($dir) && !(eplak_setup_config_exists() && is_writable(EPLAK_SETUP_CONFIG))) {
        return [false, 'پوشه‌ی shared نوشتنی نیست (اجازه‌ی نوشتن: 755 یا 775).'];
    }

    $body = "<?php\n"
        . "/* shared/config.php — ساخته‌شده با setup.php در " . date('Y-m-d H:i:s') . " */\n"
        . "return [\n"
        . "    'driver' => " . var_export((string) $values['driver'], true) . ",\n"
        . "    'host' => " . var_export((string) $values['host'], true) . ",\n"
        . "    'user' => " . var_export((string) $values['user'], true) . ",\n"
        . "    'pass' => " . var_export((string) $values['pass'], true) . ",\n"
        . "    'name' => " . var_export((string) $values['name'], true) . ",\n"
        . "    'schema_alter' => true,\n"
        . "    'fk_bypass' => true,\n"
        . "    'db_timezone' => " . var_export((string) ($values['db_timezone'] ?: 'Asia/Tehran'), true) . ",\n"
        . "    'display_timezone' => " . var_export((string) ($values['display_timezone'] ?: 'Asia/Tehran'), true) . ",\n"
        . "    'otp_test_code' => " . var_export((string) ($values['otp_test_code'] ?? ''), true) . ",\n"
        . "    'payamak_username' => " . var_export((string) ($values['payamak_username'] ?? ''), true) . ",\n"
        . "    'payamak_password' => " . var_export((string) ($values['payamak_password'] ?? ''), true) . ",\n"
        . "    'payamak_template_id' => " . var_export((string) ($values['payamak_template_id'] ?? ''), true) . ",\n"
        . "    'amootsms_token' => " . var_export((string) ($values['amootsms_token'] ?? ''), true) . ",\n"
        . "];\n";

    /* ممیزی: چه کسی/کی تنظیمات را ساخت (برای بررسی امنیتی در error_log هاست) */
    error_log(sprintf(
        '[eplak-setup] shared/config.php written from %s (db=%s user=%s payamak=%s)',
        (string)($_SERVER['REMOTE_ADDR'] ?? '?'),
        (string)$values['name'],
        (string)$values['user'],
        (($values['payamak_username'] ?? '') !== '') ? 'yes' : 'no'
    ));

    $ok = @file_put_contents(EPLAK_SETUP_CONFIG, $body, LOCK_EX);
    if ($ok === false) {
        return [false, 'نوشتنِ shared/config.php ممکن نشد (اجازه‌ی نوشتن پوشه‌ی shared را بررسی کنید).'];
    }
    @chmod(EPLAK_SETUP_CONFIG, 0600);
    $_SESSION['eplak_setup_owner'] = true;
    return [true, 'shared/config.php ساخته شد.'];
}

$flash = ['', ''];
$status = eplak_setup_status();
$canWrite = (!$status['config_exists']) || $status['admin_logged_in'] || !empty($_SESSION['eplak_setup_owner']);

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $token = (string) ($_POST['_token'] ?? '');
    if (!hash_equals(eplak_setup_token(), $token)) {
        $flash = ['error', 'توکن امنیتی صفحه معتبر نیست؛ صفحه را تازه کنید و دوباره بفرستید.'];
    } else {
        $action = (string) ($_POST['action'] ?? '');

        if ($action === 'save_config') {
            if (!$canWrite) {
                $flash = ['error', 'shared/config.php وجود دارد و مدیر وارد نشده؛ فرم قفل است.'];
            } else {
                $values = [
                    'driver' => ((string) ($_POST['driver'] ?? 'mysql')) === 'sqlite' ? 'sqlite' : 'mysql',
                    'host'   => trim((string) ($_POST['db_host'] ?? 'localhost')),
                    'user'   => trim((string) ($_POST['db_user'] ?? '')),
                    'pass'   => (string) ($_POST['db_pass'] ?? ''),
                    'name'   => trim((string) ($_POST['db_name'] ?? '')),
                    'db_timezone'      => trim((string) ($_POST['db_timezone'] ?? 'Asia/Tehran')),
                    'display_timezone' => trim((string) ($_POST['display_timezone'] ?? 'Asia/Tehran')),
                    'otp_test_code'    => trim((string) ($_POST['otp_test_code'] ?? '')),
                    'payamak_username'    => trim((string) ($_POST['payamak_username'] ?? '')),
                    'payamak_password'    => (string) ($_POST['payamak_password'] ?? ''),
                    'payamak_template_id' => trim((string) ($_POST['payamak_template_id'] ?? '')),
                    'amootsms_token'      => trim((string) ($_POST['amootsms_token'] ?? '')),
                ];
                if ($values['driver'] === 'mysql' && ($values['name'] === '' || $values['user'] === '')) {
                    $flash = ['error', 'نام دیتابیس و نام کاربری MySQL الزامی است.'];
                } else {
                    /* پیش از نوشتن، اتصال را با همان اطلاعات آزمایش می‌کنیم */
                    $err = null;
                    $test = eplak_setup_try_pdo($values, $err);
                    if (!$test instanceof PDO) {
                        $flash = ['error', 'اتصال با این اطلاعات برقرار نشد، پس چیزی نوشته نشد: ' . $err];
                    } else {
                        list($okWrite, $msg) = eplak_setup_write_config($values);
                        $flash = $okWrite ? ['ok', $msg . ' جدول‌ها در اولین اجرای سایت خودکار ساخته می‌شوند.'] : ['error', $msg];
                    }
                }
            }
        } elseif ($action === 'build_schema') {
            /* یک‌بار bootstrap را صدا می‌زند تا جدول‌ها/ادمین پیش‌فرض ساخته شوند */
            try {
                require_once EPLAK_SETUP_ROOT . '/shared/bootstrap.php';
                $pdo = eplakGetPdo();
                $tables = eplak_setup_tables($pdo, eplak_setup_effective()['driver']);
                $missing = array_keys(array_filter($tables, function ($v) {
                    return $v === false;
                }));
                $flash = ['ok', 'ساخت/ترمیم جدول‌ها انجام شد.' . ($missing ? ' هنوز ساخته نشده: ' . implode(', ', $missing) : ' همه‌ی جدول‌های اصلی هست.')];
            } catch (Throwable $e) {
                $flash = ['error', 'ساخت جدول‌ها ناموفق: ' . $e->getMessage()];
            }
        } elseif ($action === 'import_sql') {
            $file = (string) ($_POST['sql_file'] ?? '');
            $allowed = ['backend/eplak-db.sql', 'backend/fix-news-db.sql', 'backend/fix-notifications-db.sql'];
            if (!in_array($file, $allowed, true)) {
                $flash = ['error', 'فایل SQL مجاز نیست.'];
            } elseif (!$canWrite) {
                $flash = ['error', 'اجرای فایل SQL فقط برای مدیر واردشده مجاز است.'];
            } elseif (!is_file(EPLAK_SETUP_ROOT . '/' . $file)) {
                $flash = ['error', 'فایل ' . $file . ' روی هاست نیست (بسته‌ی آپلود آن را شامل نمی‌شود؛ با phpMyAdmin وارد کنید).'];
            } else {
                try {
                    require_once EPLAK_SETUP_ROOT . '/shared/bootstrap.php';
                    $pdo = eplakGetPdo();
                    $sql = (string) file_get_contents(EPLAK_SETUP_ROOT . '/' . $file);
                    $pdo->exec($sql);
                    $flash = ['ok', 'فایل ' . $file . ' اجرا شد.'];
                } catch (Throwable $e) {
                    $flash = ['error', 'اجرای ' . $file . ' ناموفق: ' . $e->getMessage()];
                }
            }
        } elseif ($action === 'delete_setup') {
            if (!eplak_setup_admin()) {
                $flash = ['error', 'حذف این صفحه فقط با ورود مدیر انجام می‌شود.'];
            } elseif (@unlink(__FILE__)) {
                header('Location: index.php');
                exit;
            } else {
                $flash = ['error', 'حذف setup.php ممکن نشد؛ دستی از FTP پاکش کنید.'];
            }
        }
        $status = eplak_setup_status();
        $canWrite = (!$status['config_exists']) || $status['admin_logged_in'] || !empty($_SESSION['eplak_setup_owner']);
    }
}

$token = eplak_setup_token();
$base = eplak_setup_base_url();
$sqlFiles = [];
foreach (['backend/eplak-db.sql', 'backend/fix-news-db.sql', 'backend/fix-notifications-db.sql'] as $f) {
    if (is_file(EPLAK_SETUP_ROOT . '/' . $f)) {
        $sqlFiles[] = $f;
    }
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>راه‌اندازی ای‌پلاک روی این هاست</title>
<style>
  :root { color-scheme: light; }
  body { font-family: Vazirmatn, Tahoma, sans-serif; background: #f1f5f9; color: #0f172a; margin: 0; padding: 24px; line-height: 1.9; }
  .wrap { max-width: 860px; margin: 0 auto; }
  .card { background: #fff; border-radius: 16px; box-shadow: 0 10px 40px rgba(15,23,42,.08); padding: 22px 24px; margin-bottom: 18px; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  h2 { font-size: 15px; margin: 0 0 12px; color: #334155; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  td { padding: 7px 8px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
  td.k { color: #64748b; width: 46%; }
  .ok { color: #15803d; font-weight: 700; }
  .bad { color: #b91c1c; font-weight: 700; }
  .warn { color: #b45309; font-weight: 700; }
  .msg { border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; font-size: 14px; }
  .msg.ok { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
  .msg.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
  label { display: block; font-size: 13px; color: #475569; margin: 12px 0 4px; }
  input[type=text], input[type=password], select { width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 13.5px; direction: ltr; text-align: left; font-family: inherit; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; }
  .row > div { flex: 1 1 220px; }
  button { background: #ea580c; color: #fff; border: 0; border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; }
  button.ghost { background: #e2e8f0; color: #0f172a; }
  button.danger { background: #b91c1c; }
  code { background: #f1f5f9; border-radius: 6px; padding: 2px 6px; font-size: 12.5px; direction: ltr; unicode-bidi: embed; }
  .note { font-size: 12.5px; color: #64748b; }
  .steps { padding-right: 20px; font-size: 13.5px; }
</style>
</head>
<body>
<div class="wrap">

  <div class="card">
    <h1>🛠 راه‌اندازی ای‌پلاک روی این هاست</h1>
    <div class="note">
      آدرس سایت: <code><?= eplak_setup_h($base) ?>/</code> ·
      سلامتِ سرور: <code><?= eplak_setup_h($base) ?>/api/status.php</code> ·
      راهنمای کامل: <code>docs/NEW_HOST_FA.md</code>
    </div>
  </div>

  <?php if ($flash[0] !== ''): ?>
    <div class="msg <?= $flash[0] === 'ok' ? 'ok' : 'error' ?>"><?= eplak_setup_h($flash[1]) ?></div>
  <?php endif; ?>

  <div class="card">
    <h2>۱) وضعیتِ سرور</h2>
    <table>
      <tr><td class="k">فایل تنظیمات <code>shared/config.php</code></td>
        <td class="<?= $status['config_exists'] ? 'ok' : 'bad' ?>"><?= $status['config_exists'] ? '✅ هست' : '❌ نیست — همین دلیلِ «ارسال کد تایید انجام نشد» است' ?></td></tr>
      <tr><td class="k">اتصال به دیتابیس</td>
        <td class="<?= $status['db_ok'] ? 'ok' : 'bad' ?>"><?= $status['db_ok'] ? '✅ برقرار است' : '❌ برقرار نیست' ?>
          <?php if (!$status['db_ok'] && $status['db_error']): ?><div class="note"><?= eplak_setup_h($status['db_error']) ?></div><?php endif; ?></td></tr>
      <tr><td class="k">درایور / هاست / دیتابیس / کاربر</td>
        <td><code><?= eplak_setup_h($status['driver']) ?></code> · <code><?= eplak_setup_h($status['db_host']) ?></code> ·
            <code><?= eplak_setup_h($status['db_name'] !== '' ? $status['db_name'] : '—') ?></code> ·
            <code><?= eplak_setup_h($status['db_user'] !== '' ? $status['db_user'] : '—') ?></code></td></tr>
      <tr><td class="k">جدول‌های اصلی</td>
        <td><?php if (!$status['tables']): ?><span class="warn">— (دیتابیس در دسترس نیست)</span><?php else: ?>
          <?php foreach ($status['tables'] as $t => $has): ?>
            <span class="<?= $has ? 'ok' : 'warn' ?>"><?= $has ? '✅' : '⚠️' ?> <code><?= eplak_setup_h($t) ?></code></span> &nbsp;
          <?php endforeach; ?>
        <?php endif; ?></td></tr>
      <tr><td class="k">پنل پیامک (برای کد تایید)</td>
        <td class="<?= ($status['payamak_ready'] || $status['amootsms_ready']) ? 'ok' : 'bad' ?>">
          <?php if ($status['payamak_ready']): ?>✅ Payamak (کاربری: <code><?= eplak_setup_h($status['payamak_user']) ?></code> · شناسه‌ی متن: <code><?= eplak_setup_h($status['payamak_template']) ?></code>)
          <?php elseif ($status['amootsms_ready']): ?>✅ AmootSMS
          <?php else: ?>❌ هیچ پنل پیامکی تنظیم نشده ⇒ کد تایید ارسال نمی‌شود<?php endif; ?></td></tr>
      <tr><td class="k">PHP / اکستنشن‌ها</td>
        <td class="<?= ($status['php_ok'] && $status['pdo_mysql'] && $status['curl']) ? 'ok' : 'bad' ?>">
          <?= eplak_setup_h($status['php_version']) ?> ·
          pdo_mysql <?= $status['pdo_mysql'] ? '✅' : '❌' ?> ·
          cURL <?= $status['curl'] ? '✅' : '❌' ?> ·
          pdo_sqlite <?= $status['pdo_sqlite'] ? '✅' : '❌' ?></td></tr>
      <tr><td class="k">ساعت/منطقه‌ی زمانی</td>
        <td>دیتابیس: <code><?= eplak_setup_h($status['db_timezone']) ?></code> · نمایش: <code><?= eplak_setup_h($status['display_timezone']) ?></code>
          · زمان سرور: <code><?= eplak_setup_h(date('Y-m-d H:i:s')) ?></code></td></tr>
      <tr><td class="k">پوشه‌های نوشتنی</td>
        <td>shared <?= $status['config_writable'] ? '<span class="ok">✅</span>' : '<span class="bad">❌</span>' ?> ·
            uploads <?= $status['uploads_writable'] ? '<span class="ok">✅</span>' : '<span class="bad">❌</span>' ?> ·
            data <?= $status['data_writable'] ? '<span class="ok">✅</span>' : '<span class="warn">❌</span>' ?></td></tr>
      <tr><td class="k">کد آزمایشی محلی (<code>otp_test_code</code>)</td>
        <td><?= $status['otp_test_code'] !== '' ? '<span class="warn">⚠️ پر شده (فقط روی localhost اثر دارد — در تولید خالی بگذارید)</span>' : '<span class="ok">✅ خالی</span>' ?></td></tr>
      <tr><td class="k">ورود مدیر</td>
        <td><?= $status['admin_logged_in'] ? '<span class="ok">✅ وارد شده</span>' : '<span class="note">وارد نشده (برای تغییر تنظیماتِ بعد از راه‌اندازی لازم است)</span>' ?></td></tr>
    </table>
  </div>

  <div class="card">
    <h2>۲) ساختِ <code>shared/config.php</code></h2>
    <?php if (!$canWrite): ?>
      <p class="warn">🔒 این فایل از قبل وجود دارد؛ برای ویرایش، ابتدا وارد پنل مدیریت شوید
        (یا فایل را از FTP پاک کنید تا این فرم دوباره باز شود).</p>
    <?php else: ?>
      <p class="note">اطلاعات از <strong>cPanel ← MySQL® Databases</strong> و <strong>پنل پیامک</strong> کپی شود.
        پیش از ذخیره، اتصال با همین اطلاعات آزمایش می‌شود.</p>
      <form method="post" autocomplete="off">
        <input type="hidden" name="_token" value="<?= eplak_setup_h($token) ?>">
        <input type="hidden" name="action" value="save_config">
        <div class="row">
          <div>
            <label>درایور دیتابیس</label>
            <select name="driver">
              <option value="mysql">MySQL / MariaDB (هاست)</option>
              <option value="sqlite">SQLite (فقط آزمایش)</option>
            </select>
          </div>
          <div><label>هاستِ دیتابیس</label><input type="text" name="db_host" value="localhost"></div>
          <div><label>نام دیتابیس</label><input type="text" name="db_name" placeholder="user_eplak"></div>
        </div>
        <div class="row">
          <div><label>نام کاربری دیتابیس</label><input type="text" name="db_user" placeholder="user_eplak"></div>
          <div><label>رمز دیتابیس</label><input type="password" name="db_pass"></div>
          <div><label>منطقه‌ی زمانی دیتابیس</label><input type="text" name="db_timezone" value="Asia/Tehran"></div>
        </div>
        <label>منطقه‌ی زمانی نمایش</label><input type="text" name="display_timezone" value="Asia/Tehran">

        <h2 style="margin-top:22px">پنل پیامک (برای ارسال کد تایید — حداقل یکی)</h2>
        <div class="row">
          <div><label>Payamak — نام کاربری</label><input type="text" name="payamak_username"></div>
          <div><label>Payamak — رمز</label><input type="password" name="payamak_password"></div>
          <div><label>Payamak — شناسه‌ی متن تأییدشده (bodyId)</label><input type="text" name="payamak_template_id"></div>
        </div>
        <label>یا AmootSMS — توکن</label><input type="text" name="amootsms_token">

        <label>کد آزمایشی محلی (در تولید خالی بگذارید)</label>
        <input type="text" name="otp_test_code" placeholder="مثلاً 1111 — فقط روی localhost">

        <p><button type="submit">آزمایش اتصال و ذخیره‌ی تنظیمات</button></p>
      </form>
    <?php endif; ?>
  </div>

  <div class="card">
    <h2>۳) ساخت/ترمیم جدول‌ها و ورود داده</h2>
    <p class="note">به‌محض برقراری اتصال، کدِ پروژه جدول‌ها و کاربر پیش‌فرض ادمین
      (<code>admin</code> / <code>admin123</code>) را خودش می‌سازد؛ این دکمه همان کار را
      یک‌بار دستی انجام می‌دهد و نتیجه را نشان می‌دهد.</p>
    <form method="post" style="display:inline">
      <input type="hidden" name="_token" value="<?= eplak_setup_h($token) ?>">
      <input type="hidden" name="action" value="build_schema">
      <button type="submit" class="ghost">ساخت/ترمیم جدول‌ها</button>
    </form>
    <?php if ($sqlFiles): ?>
      <form method="post" style="display:inline; margin-right:10px">
        <input type="hidden" name="_token" value="<?= eplak_setup_h($token) ?>">
        <input type="hidden" name="action" value="import_sql">
        <select name="sql_file" style="width:auto; display:inline-block">
          <?php foreach ($sqlFiles as $f): ?><option value="<?= eplak_setup_h($f) ?>"><?= eplak_setup_h($f) ?></option><?php endforeach; ?>
        </select>
        <button type="submit" class="ghost">اجرای فایل SQL</button>
      </form>
    <?php else: ?>
      <p class="note">فایل‌های <code>backend/*.sql</code> روی این هاست نیستند (بسته‌ی آپلود شامل داده‌ی کاربران نمی‌شود)؛
        برای بازگردانی داده‌های قدیمی، همان فایل را در <strong>phpMyAdmin ← Import</strong> اجرا کنید.</p>
    <?php endif; ?>
  </div>

  <div class="card">
    <h2>۴) بعد از راه‌اندازی</h2>
    <ol class="steps">
      <li>صفحه‌ی اصلی را باز کنید و یک شماره موبایل وارد کنید — باید کد پیامک برسد.</li>
      <li>وارد پنل شوید (<code><?= eplak_setup_h($base) ?>/admin</code>) و رمز <code>admin</code> را عوض کنید.</li>
      <li>پنل ← تنظیمات ← «اعلان گوشی برای اپ اندروید (فایربیس)»: کلید سرویس فایربیس را بچسبانید
        (بدون آن، اعلان روی APK وقتی اپ بسته است نمی‌رسد).</li>
      <li>اگر دامنه/مسیر سایت عوض شده، اپ موبایل باید با آدرس تازه ساخته شود
        (<code>core/storage.js</code> ← <code>BACKEND_BASE_URL</code>) — در <code>docs/NEW_HOST_FA.md</code> توضیح داده شده.</li>
      <li>برای امنیت، همین صفحه را پاک کنید:</li>
    </ol>
    <form method="post" onsubmit="return confirm('setup.php از روی هاست پاک شود؟');">
      <input type="hidden" name="_token" value="<?= eplak_setup_h($token) ?>">
      <input type="hidden" name="action" value="delete_setup">
      <button type="submit" class="danger" <?= $status['admin_logged_in'] ? '' : 'disabled' ?>>حذف setup.php (نیازمند ورود مدیر)</button>
    </form>
  </div>

</div>
</body>
</html>
