<?php
/* api/ping.php — «آیا اینترنت وصل است؟»

   سبک‌ترین اندپوینت ممکن: نه دیتابیس را لمس می‌کند، نه فایل می‌نویسد.
   اپ اندروید و سایت با صدا زدن این آدرس می‌فهمند اتصال برقرار است یا نه
   (صفحه‌ی «بدون اینترنت اتصال ممکن نیست» از همین نتیجه استفاده می‌کند).

   اگر دیتابیس خراب باشد هم این آدرس جواب می‌دهد؛ چون هدفش فقط «زنده بودن
   اینترنت» است، نه «سالم بودن سایت».

   «نسخه‌ی اپ و آپدیت اجباری» هم از همین‌جا می‌آید: اپ هنگام باز شدن همین
   پینگ را می‌زند و فیلدهای نسخه را از پاسخ می‌خواند (modules/version-guard.js).
   تنظیمات در shared/app_version.json است (پنل مدیریت می‌نویسدش) تا این آدرس
   همچنان بدونِ دیتابیس بماند؛ اگر فایل نباشد/خراب باشد، پیش‌فرضِ بی‌خطر
   (min=0 یعنی «هیچ‌کس مسدود نیست») برمی‌گردد.
*/
require_once __DIR__ . '/../shared/fa_datetime.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* ── «نسخه‌ی اپ و آپدیت اجباری» از فایلِ تنظیمات (بدونِ دیتابیس) ──────────
   shared/app_version.json را پنل مدیریت می‌نویسد (admin/settings.php).
   این فایل در گیت و در بسته‌ی آپدیت نیست (مثلِ shared/config.php) تا آپدیتِ
   هاست تنظیمِ مدیر را بازنویسی نکند؛ روی هاستِ تازه هم نیست و پیش‌فرض مؤثر است. */
$appVersion = [
    'min_version_code'    => 0,
    'latest_version_code' => 0,
    'latest_version_name' => '',
    'update_url'          => 'https://github.com/hosseinbahrami-bot/eplak-fixed-new/releases/download/v2.0-eplak-update/eplak-app.apk',
    'message'             => '',
];
try {
    $versionFile = __DIR__ . '/../shared/app_version.json';
    if (is_file($versionFile)) {
        $decoded = json_decode((string) file_get_contents($versionFile), true);
        if (is_array($decoded)) {
            /* کدِ نسخه هرگز منفی نیست؛ لینک فقط اگر http(s) باشد مؤثر است */
            $appVersion['min_version_code']    = max(0, (int) ($decoded['min_version_code'] ?? 0));
            $appVersion['latest_version_code'] = max(0, (int) ($decoded['latest_version_code'] ?? 0));
            $appVersion['latest_version_name'] = trim((string) ($decoded['latest_version_name'] ?? ''));
            $url = trim((string) ($decoded['update_url'] ?? ''));
            if ($url !== '' && preg_match('#^https?://#i', $url) === 1) {
                $appVersion['update_url'] = $url;
            }
            $appVersion['message'] = trim((string) ($decoded['message'] ?? ''));
        }
    }
} catch (Throwable $e) {
    /* خرابیِ فایلِ تنظیمات نباید پینگ را خراب کند؛ پیش‌فرضِ بی‌خطر می‌ماند */
}

echo json_encode([
    'success'     => true,
    'online'      => true,
    /* با اختلافِ منطقه نسبت به UTC (مثلاً ‎+03:30) تا برای اپ بی‌ابهام باشد */
    'server_time' => function_exists('eplakDisplayTimezone')
        ? (new DateTimeImmutable('now', eplakDisplayTimezone()))->format('c')
        : gmdate('c'),
    'fa_time'     => function_exists('eplakFaDateTime') ? eplakFaDateTime() : '',
    /* «نسخه‌ی اپ و آپدیت اجباری» (modules/version-guard.js) */
    'app_version' => $appVersion,
], JSON_UNESCAPED_UNICODE);
