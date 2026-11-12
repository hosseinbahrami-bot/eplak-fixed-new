<?php
/* api/track.php — گردآورِ رویدادهای «آمارِ سایت و دانلودها»
   ────────────────────────────────────────────────────────────────────────────
   چرا این فایل در سامانه است و نه در بسته‌ی سایتِ روت؟
     لایه‌ی واسطِ سایتِ معرفی (public_html/api/*.php) عمداً «فقط خواندنی» است —
     هیچ نوشتاری روی دیتابیس انجام نمی‌دهد (در README-UPLOAD-FA.txt هم همین
     گفته شده). آمار اما «نوشتن» می‌خواهد؛ پس گردآور داخلِ خودِ سامانه است:

         https://www.eplak.ir/eplak-fixed/api/track.php

     و سایتِ معرفی (index.html) رویدادها را با navigator.sendBeacon به همین
     نشانی می‌فرستد. اپِ موبایل هیچ تغییری نکرده و از این فایل استفاده نمی‌کند.

   درخواست‌ها (هم GET هم POST — sendBeacon و fetch و حتی <img>):
     k = نوعِ رویداد:  view | download | qr
     t = هدف:          '/' یا '#download' برای بازدید، 'apk'/'pwa' برای دانلود/QR
     p = صفحه/بخش      (اختیاری، تا ۱۸۰ نویسه)
     r = نشانیِ منبعِ ورود (referrer) — فقط «دامنه‌اش» ذخیره می‌شود
     v = شناسه‌ی بازدیدکننده (۱۶..۴۰ نویسه‌ی هگز) که سایت در localStorage می‌سازد

   پاسخ همیشه JSON است و هرگز ۵۰۰ نمی‌شود (مگر اینکه خودِ دیتابیس قطع باشد،
   که آن هم JSON است و سایت بی‌صدا ردش می‌کند):
     {"success":true,"counted":true,"reason":""}
     reason: bot | throttled | daily_cap | bad_kind | no_table | no_visitor | failed

   امنیت و ضدِ تورم (shared/analytics.php):
     • IP خام ذخیره نمی‌شود؛ فقط هشِ HMAC
     • ربات‌ها (Googlebot/curl/python/…) شمرده نمی‌شوند
     • بازدیدِ تکراریِ یک نفر از یک صفحه در ۳۰ ثانیه ⇒ یکی
     • کلیکِ تکراری در ۱۰ ثانیه ⇒ یکی
     • سقفِ ۳۰۰ رویداد در روز برای هر IP
     • طولِ همه‌ی ورودی‌ها محدود می‌شود و متن‌ها strip_tags می‌گیرند (بدونِ HTML)
   ────────────────────────────────────────────────────────────────────────────
*/

/* اگر اتصال دیتابیس برقرار نشد، db.php صفحه‌ی HTML خطا می‌دهد؛ برای API همان
   خطا را JSON می‌خواهیم (و سایتِ معرفی هم بی‌صدا ردش می‌کند). */
$_SERVER['HTTP_X_REQUESTED_WITH'] = 'XMLHttpRequest';
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../shared/analytics.php';

eplakApiHeaders();

$input = eplakRequestInput();

/* کلیدهای کوتاه (k/t/p/r/v) و کلیدهای بلند (kind/target/page/referrer/visitor)
   هر دو پذیرفته می‌شوند تا ارسال از سایت ساده بماند و دیباگ با curl هم راحت باشد. */
$pick = static function (array $input, string $short, string $long): string {
    foreach ([$short, $long] as $key) {
        if (isset($input[$key]) && is_string($input[$key]) && trim($input[$key]) !== '') {
            return $input[$key];
        }
    }
    return '';
};

$kind   = $pick($input, 'k', 'kind');
$target = $pick($input, 't', 'target');
$page   = $pick($input, 'p', 'page');
$ref    = $pick($input, 'r', 'referrer');
$vid    = $pick($input, 'v', 'visitor');

if ($kind === '') {
    $kind = 'view';
}
if ($ref === '') {
    $ref = (string) ($_SERVER['HTTP_REFERER'] ?? '');
}
if ($target === '' && $kind === 'view') {
    /* اگر سایت هدف را نفرستاد، خودِ Referer نشانه‌ی خوبی از صفحه‌ی دیده‌شده است */
    $path = (string) (parse_url($ref, PHP_URL_PATH) ?: '');
    $hash = (string) (parse_url($ref, PHP_URL_FRAGMENT) ?: '');
    $target = $hash !== '' ? '#' . $hash : ($path !== '' ? $path : '/');
}

try {
    $result = eplakAnalyticsTrack($pdo, [
        'kind'     => $kind,
        'target'   => $target,
        'page'     => $page !== '' ? $page : $target,
        'referrer' => $ref,
        'visitor'  => $vid,
    ]);
    eplakJson([
        'success' => true,
        'counted' => (bool) $result['counted'],
        'reason'  => (string) $result['reason'],
        'kind'    => $kind,
    ], 200);
} catch (Throwable $e) {
    /* هیچ‌وقت ۵۰۰/HTML نمی‌دهیم: آمار «اختیاری» است و نباید سایت را بشکند */
    error_log('[eplak][track] ' . $e->getMessage());
    eplakJson(['success' => false, 'counted' => false, 'reason' => 'failed'], 200);
}
