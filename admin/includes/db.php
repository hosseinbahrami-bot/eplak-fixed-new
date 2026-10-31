<?php
require_once dirname(__DIR__, 2) . '/shared/bootstrap.php';

try {
    $pdo = eplakGetPdo();
} catch (\Throwable $e) {
    /* روی خطا در اتصال دیتابیس، صفحه‌ی سفید نشود؛ به‌جایش صفحه‌ی خطای
       خوانا با فهرست دلایل رایج نمایش داده می‌شود.
       برای فراخوان‌های JSON (API) همان خطا به‌صورت JSON برمی‌گردد. */
    if (PHP_SAPI !== 'cli' && !headers_sent()) {
        http_response_code(500);
        /* اپ (WebView اندروید و وب) درخواست را با Content-Type: text/plain و بدون
           Accept: application/json می‌فرستد. اگر در این حالت صفحه‌ی HTML خطا بگیرد،
           JSON پارس نمی‌شود و کاربر فقط «ارسال کد تایید انجام نشد» می‌بیند، بی‌آنکه
           بداند دلیلش «نبودِ shared/config.php روی هاست تازه» است. پس همه‌ی
           اندپوینت‌های api/ بدون قیدِ سرآیند، JSON می‌گیرند. */
        $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
        $wantsJson = (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest')
            || (stripos((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json') !== false)
            || (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'json') !== false)
            || (preg_match('#(^|/)api/[^/]+\\.php$#', $scriptName) === 1);
        if ($wantsJson) {
            header('Content-Type: application/json; charset=utf-8');
            /* پیامِ فارسیِ actionable در «error» می‌آید؛ چون اپِ نصب‌شده (با کدِ قدیمی)
               همان data.error را در toast نشان می‌دهد ⇒ بدون نیاز به نصبِ نسخه‌ی تازه،
               دلیلِ واقعی روی گوشی کاربر دیده می‌شود. */
            $rootDir = dirname(__DIR__, 2);
            $hasConfig = is_file($rootDir . '/shared/config.php');
            $apiDir = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
            $siteDir = (basename($apiDir) === 'api') ? rtrim(dirname($apiDir), '/') : $apiDir;
            $isHttps = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
                || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
            $setupUrl = ($isHttps ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost')
                . ($siteDir === '' || $siteDir === '/' ? '' : $siteDir) . '/setup.php';
            echo json_encode([
                'success'   => false,
                'error'     => $hasConfig
                    ? 'اتصال به دیتابیس سایت برقرار نیست؛ اطلاعات دیتابیس در shared/config.php یا سرویس MySQL را بررسی کنید (صفحه‌ی setup.php وضعیت را نشان می‌دهد).'
                    : 'سایت روی این هاست هنوز راه‌اندازی نشده است: فایل shared/config.php وجود ندارد. نشانی «setup.php» در ریشه‌ی سایت را باز کنید و اطلاعات دیتابیس و پنل پیامک را وارد کنید.',
                'code'      => 'database_unavailable',
                'config_exists' => $hasConfig,
                'setup_url' => $setupUrl,
                'detail'    => $e->getMessage(),
                'hint'      => 'راهنمای انتقال به هاست تازه: docs/NEW_HOST_FA.md',
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }
        header('Content-Type: text/html; charset=utf-8');
        $msg = htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8');
        echo '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
           . '<meta name="viewport" content="width=device-width, initial-scale=1">'
           . '<title>خطا در اتصال به دیتابیس — ای‌پلاک</title>'
           . '<style>'
           . 'body{font-family:Vazirmatn,Tahoma,sans-serif;background:#f1f5f9;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}'
           . '.box{background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(15,23,42,.08);max-width:640px;width:100%;padding:32px}'
           . '.icon{font-size:44px;line-height:1}'
           . 'h1{font-size:20px;margin:16px 0 8px;color:#b91c1c}'
           . '.detail{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:12px 14px;font-size:13px;direction:ltr;text-align:left;overflow-wrap:anywhere;margin:14px 0}'
           . 'ul{padding-right:20px;line-height:2;font-size:14px;color:#334155}'
           . 'code{background:#f1f5f9;border-radius:6px;padding:2px 6px;font-size:12.5px;direction:ltr;unicode-bidi:embed}'
           . '.tip{font-size:13px;color:#64748b;margin-top:18px;border-top:1px solid #e2e8f0;padding-top:14px}'
           . '</style></head><body><div class="box">'
           . '<div class="icon">⚠️</div>'
           . '<h1>صفحه ادمین باز نمی‌شود: اتصال به دیتابیس برقرار نشد</h1>'
           . '<div class="detail">' . $msg . '</div>'
           . '<p>دلایل رایج و راه‌حل‌ها:</p><ul>'
           . '<li>سرور MySQL/MariaDB روشن باشد (<code>systemctl status mysql</code> یا بخش MySQL در cPanel/XAMPP).</li>'
           . '<li>دیتابیس هدف وجود داشته باشد؛ نام پیش‌فرض در کد <code>wigitali_eplak-db</code> است که روی نصب تازه‌ها وجود ندارد — خودتان یک دیتابیس خالی بسازید (مثلاً <code>CREATE DATABASE eplak_db;</code>).</li>'
           . '<li>فایل <code>shared/config.php</code> را از روی <code>shared/config.example.php</code> بسازید و هاست/نام کاربری/رمز/نام دیتابیس را درست کنید (یا از متغیرهای محیطی <code>DB_HOST</code>، <code>DB_USER</code>، <code>DB_PASS</code>، <code>DB_NAME</code> استفاده کنید).</li>'
           . '<li>اکستنشن <code>pdo_mysql</code> در PHP فعال باشد (خروجی <code>php -m | grep pdo</code>).</li>'
           . '<li><strong>هاست تازه؟</strong> صفحه‌ی راه‌انداز را باز کنید: <a href="../setup.php"><code>setup.php</code></a> — وضعیت را نشان می‌دهد و <code>shared/config.php</code> را می‌سازد. راهنما: <code>docs/NEW_HOST_FA.md</code></li>'
           . '</ul>'
           . '<p class="tip">نکته: به‌محض برقراری اتصال، جداول و کاربر پیش‌فرض ادمین (<code>admin</code> / <code>admin123</code>) به‌صورت خودکار ساخته می‌شوند؛ نیازی به ایمپورت دستی اسکیمای SQL نیست.</p>'
           . '</div></body></html>';
        exit;
    }
    throw $e;
}
