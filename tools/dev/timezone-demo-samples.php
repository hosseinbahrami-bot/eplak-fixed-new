<?php
/* ─────────────────────────────────────────────────────────────────────────────
   tools/dev/timezone-demo-samples.php — مولدِ داده‌ی «دموی ساعتِ تهران»

   چه می‌کند: همان توابعِ واقعیِ سرور (shared/fa_datetime.php که از
   shared/bootstrap.php لود می‌شود) را روی چند مقدارِ نمونه اجرا می‌کند و
   نتیجه را JSON می‌دهد. این خروجی داخل tools/dev/timezone-demo.html
   (کلیدهای new و legacy_utc) گذاشته می‌شود تا آن صفحه بدون PHP هم قابلِ دیدن
   باشد و در عین حال «خروجیِ واقعیِ سرور» باشد، نه بازنویسیِ دستی.

   اجرا (از ریشه‌ی مخزن):
       php tools/dev/timezone-demo-samples.php                      # پیش‌فرض: تهران
       EPLAK_DB_TIMEZONE=UTC php tools/dev/timezone-demo-samples.php # داده‌ی قدیمیِ UTC

   اگر PHP روی دستگاهتان درایور sqlite ندارد یا نمی‌خواهید به دیتابیس وصل شود:
       DB_DRIVER=sqlite DB_SQLITE_PATH=/tmp/eplak-tzdemo.sqlite EPLAK_SCHEMA_READONLY=1 \
         php tools/dev/timezone-demo-samples.php
   (فایلِ sqlite را پیش از اجرا با touch بسازید.)
   ───────────────────────────────────────────────────────────────────────────── */

declare(strict_types=1);

/* ریشه‌ی مخزن: به‌صورت عادی دو سطح بالاتر از tools/dev است؛ اگر اسکریپت داخلِ
   محیطِ دیگری اجرا شود (مثلاً PHP-WASM که __DIR__ واقعی ندارد) از متغیر محیطی
   EPLAK_REPO_ROOT یا EPLAK_ROOT پیدا می‌شود. */
$root = '';
foreach ([getenv('EPLAK_REPO_ROOT'), getenv('EPLAK_ROOT'), dirname(__DIR__, 2)] as $candidate) {
    if (is_string($candidate) && $candidate !== '' && is_file($candidate . '/shared/bootstrap.php')) {
        $root = $candidate;
        break;
    }
}
if ($root === '') {
    /* STDERR در بعضی SAPIها (مثل PHP-WASM) تعریف نشده، پس خروجیِ عادی */
    echo "خطا: shared/bootstrap.php پیدا نشد؛ EPLAK_REPO_ROOT را به ریشه‌ی مخزن تنظیم کنید.\n";
    exit(1);
}

require_once $root . '/shared/bootstrap.php';

$values = [
    '2026-10-11 13:24:05',           /* مقدارِ معمولِ دیتابیس (بدون منطقه‌ی زمانی) */
    '2026-10-11T22:00:00Z',          /* لحظه‌ی مطلق ⇒ باید به تهران برده شود */
    '2026-10-11',                    /* فقط تاریخ */
    '2026-10-11T13:24:05+03:30',     /* لحظه‌ی مطلق با اختلافِ تهران */
    '',                              /* خالی */
    '0000-00-00 00:00:00',           /* مقدارِ خرابِ MySQL */
    '1791458645',                    /* timestamp عددی */
];

$out = [
    'php_timezone'   => date_default_timezone_get(),
    'db_timezone'    => eplakDbTimezone()->getName(),
    'session_offset' => eplakTimezoneOffsetString(eplakDbTimezone()),
    'db_now'         => eplakDbNow(),
    'fa_now'         => eplakFaNow(),
    'samples'        => [],
];

foreach ($values as $value) {
    $out['samples'][$value] = [
        'date'     => eplakFaDate($value, '—'),
        'datetime' => eplakFaDateTimeOf($value, '—'),
    ];
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), PHP_EOL;
