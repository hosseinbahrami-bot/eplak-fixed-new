<?php
/* api/ads.php — تبلیغاتِ داخل اپ (سه جای بنر) + ثبتِ کلیک
   ────────────────────────────────────────────────────────────────────────────
   چرا این فایل هست؟
     تبلیغاتِ اپ پیش از این سه بنرِ «ثابت» در index.html بود: نه از پنل قابل
     تغییر بود، نه چند تصویر داشت، نه لینک. حالا همان سه جای بنر از دیتابیس
     خوانده می‌شود و پنل ادمین (admin/ads.php) مدیریتش می‌کند:

         home_top  → خانه، بنر بزرگِ بالای شبکه‌ی خدمات
         home_mid  → خانه، بنر میانیِ بالای «میراث ورامین»
         dash_slim → داشبورد، بنر باریکِ زیر آب‌وهوا

   درخواست‌ها:
     GET  api/ads.php                     → فهرستِ تبلیغ‌های فعال، دسته‌بندی‌شده
     GET  api/ads.php?placement=home_top  → فقط یک جای بنر
     POST api/ads.php  action=click&id=7  → ثبتِ کلیک (آمارِ پنل)

   خروجیِ فهرست:
     {
       "success": true,
       "count": 4,
       "placements": { "home_top": [ {id,title,alt,image,webp,link,order}, … ], … },
       "v": "a1b2c3d4e5f6",          ← اثر انگشت؛ با هر تغییرِ پنل عوض می‌شود
       "server_time": "2026-11-02 13:24:05",
       "degraded": [], "hint": ""
     }

   قاعده‌ها (همان درس‌هایی که از api/news.php گرفتیم):
     ۱) پاسخ هرگز ۵۰۰ نیست. اگر جدول نباشد/دیتابیس قطع باشد، ۲۰۰ با
        success=false و جای بنرهای خالی برمی‌گردد ⇒ اپ همان بنرهای ثابتِ داخل
        بسته‌ی خودش را نشان می‌دهد (نه صفحه‌ی سفید، نه بنرِ شکسته).
     ۲) تصویرِ آپلودشده (uploads/ads/…) با نشانیِ «مطلق» برمی‌گردد؛ چون اپ
        صفحه را از file:// باز می‌کند و نشانیِ نسبی به فایلِ داخل گوشی اشاره
        می‌کند. assets/… نسبی می‌ماند تا آفلاین هم کار کند.
     ۳) لینک فقط http/https است؛ هر چیز دیگر (javascript:, data:, …) پیش از
        خروج از سرور حذف می‌شود.
     ۴) کلیک فقط برای تبلیغِ «فعال» شمرده می‌شود و از یک IP در کمتر از
        EPLAK_ADS_CLICK_THROTTLE ثانیه دوباره شمرده نمی‌شود (ضدِ تورمِ آمار).
        IP به‌صورت «هش» در ads_clicks می‌نشیند، نه خام.
   ────────────────────────────────────────────────────────────────────────────
*/

/* اگر اتصال دیتابیس برقرار نشد، db.php صفحه‌ی HTML خطا می‌دهد؛ برای API همان
   خطا را JSON می‌خواهیم تا اپ بتواند درست تصمیم بگیرد (بنر ثابتِ خودش). */
$_SERVER['HTTP_X_REQUESTED_WITH'] = 'XMLHttpRequest';
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../shared/ads.php';

eplakApiHeaders();

$input  = eplakRequestInput();
$action = strtolower(trim((string) ($input['action'] ?? '')));

/** جای بنرهای خالی — همان چیزی که اپ در حالتِ «تبلیغی نیست» می‌گیرد */
function eplakAdsEmptyPlacements(): array {
    $out = [];
    foreach (eplakAdsPlacements() as $p) {
        $out[$p] = [];
    }
    return $out;
}

/** پاسخِ «خراب ولی بی‌ضرر»: ۲۰۰ + success=false + جای بنرهای خالی */
function eplakAdsFail(array $degraded, string $hint, string $reason = ''): void {
    $payload = [
        'success'    => false,
        'count'      => 0,
        'placements' => eplakAdsEmptyPlacements(),
        'v'          => 'none',
        'degraded'   => $degraded,
        'hint'       => $hint,
    ];
    if ($reason !== '') {
        $payload['reason'] = $reason;
    }
    eplakJson($payload, 200);
}

try {
    /* ── ۱) ثبتِ کلیک ──────────────────────────────────────────────────── */
    if ($action === 'click') {
        $id = (int) ($input['id'] ?? 0);
        if ($id <= 0) {
            eplakJson(['success' => false, 'counted' => false, 'reason' => 'bad_id'], 200);
        }
        $click = eplakAdsRegisterClick($pdo, $id);
        eplakJson([
            'success' => true,
            'counted' => (bool) $click['counted'],
            'total'   => (int) $click['total'],
            /* دلیلِ نشمردن (throttled/inactive/…) به اپ برمی‌گردد ولی پیامِ
               خطایی نشان داده نمی‌شود: کلیک برای کاربر «باز شده» است. */
            'reason'  => (string) $click['reason'],
        ], 200);
    }

    /* ── ۲) فهرستِ تبلیغ‌های فعال ─────────────────────────────────────── */
    $placement = eplakAdsNormalizePlacement((string) ($input['placement'] ?? ''));
    $public = eplakAdsPublic($pdo, 2);

    if ($placement !== '') {
        $only = [];
        foreach (eplakAdsPlacements() as $p) {
            $only[$p] = ($p === $placement) ? ($public['placements'][$p] ?? []) : [];
        }
        $public['placements'] = $only;
        $public['count'] = count($only[$placement]);
    }

    $payload = [
        'success'     => true,
        'count'       => (int) $public['count'],
        'placements'  => $public['placements'],
        'v'           => eplakAdsFingerprint($pdo),
        'server_time' => function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : date('Y-m-d H:i:s'),
        'degraded'    => $public['degraded'],
    ];
    if ($public['hint'] !== '') {
        $payload['hint'] = $public['hint'];
    }
    /* اگر جدول هنوز ساخته نشده، همان لحظه یک‌بار تلاش می‌شود (مثل اخبار) */
    if (in_array('no_table', $public['degraded'], true)) {
        $payload['success'] = false;
        $payload['hint'] = 'جدول تبلیغات در دیتابیس وجود ندارد. در پنل مدیریت → بررسی نسخه/تنظیمات، «ترمیم ساختار دیتابیس» را بزنید.';
    }
    eplakJson($payload, 200);
} catch (Throwable $e) {
    eplakAdsFail(['error'], 'خواندن تبلیغات ممکن نشد؛ اپ بنرهای پیش‌فرضِ خودش را نشان می‌دهد.', $e->getMessage());
}
