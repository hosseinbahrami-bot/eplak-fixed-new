<?php
/* ============================================================================
   api/version.php — «نسخه‌ی اپ و آپدیت اجباری»
   ----------------------------------------------------------------------------
   اپ هنگام باز شدن این آدرس را صدا می‌زند تا بفهمد:
     - حداقل نسخه‌ی مجاز چیست (min_version_code): نسخه‌های پایین‌تر از آن
       وارد اپ نمی‌شوند و پرده‌ی «باید اپ را به‌روزرسانی کنید» می‌بینند.
     - آخرین نسخه‌ی منتشرشده چیست (latest_*): برای پیشنهادِ آپدیتِ اختیاری.
     - لینکِ دانلودِ نسخه‌ی تازه و پیامِ سفارشیِ مدیر.

   تنظیمات از جدول app_settings خوانده می‌شوند و در پنل مدیریت
   (admin/settings.php ← بخش «نسخه‌ی اپ و آپدیت اجباری») تغییر می‌کنند؛
   پس برای اجبار کاربران به آپدیت، نیازی به انتشارِ کدِ تازه نیست.

   قاعده‌های ایمنی (همان درس‌های api/support.php و api/ads.php):
     ۱) پاسخ هرگز ۵۰۰ یا HTML نیست؛ اگر دیتابیس/جدول مشکل داشت، ۲۰۰ با
        پیش‌فرض‌های بی‌خطر (min=0 یعنی «هیچ‌کس مسدود نیست») برمی‌گردد تا
        کاربرِ نسخه‌ی تازه به‌خاطرِ خرابیِ سرور از اپ بیرون نیفتد.
     ۲) هیچ داده‌ی شخصی یا حساسی در پاسخ نیست.
   ============================================================================ */

/* اگر اتصال دیتابیس برقرار نشد، db.php صفحه‌ی HTML خطا می‌دهد؛ برای API همان
   خطا را JSON می‌خواهیم تا اپ fail-open کند (نه پرده‌ی خطا). */
$_SERVER['HTTP_X_REQUESTED_WITH'] = 'XMLHttpRequest';
require_once __DIR__ . '/_common.php';

eplakApiHeaders();

/* پیش‌فرضِ بی‌خطر: هیچ‌کس مسدود نیست و لینکِ دانلود همان APKِ رسمیِ گیت‌هاب است */
$defaults = [
    'success'            => true,
    'min_version_code'   => 0,
    'latest_version_code' => 0,
    'latest_version_name' => '',
    'update_url'         => 'https://github.com/hosseinbahrami-bot/eplak-fixed-new/releases/download/v2.0-eplak-update/eplak-app.apk',
    'message'            => '',
];

try {
    $pdo = eplakGetPdo();

    $minCode = (int) eplakAppSetting($pdo, 'min_app_version_code', '0');
    $latestCode = (int) eplakAppSetting($pdo, 'latest_app_version_code', '0');
    $latestName = trim((string) eplakAppSetting($pdo, 'latest_app_version_name', ''));
    $updateUrl = trim((string) eplakAppSetting($pdo, 'app_update_url', ''));
    $message = trim((string) eplakAppSetting($pdo, 'app_update_message', ''));

    /* کدِ نسخه هرگز منفی نیست؛ نامِ نسخه و لینک هم فقط اگر معتبر بودند مؤثرند */
    $payload = $defaults;
    $payload['min_version_code'] = max(0, $minCode);
    $payload['latest_version_code'] = max(0, $latestCode);
    $payload['latest_version_name'] = $latestName;
    if ($updateUrl !== '' && preg_match('#^https?://#i', $updateUrl) === 1) {
        $payload['update_url'] = $updateUrl;
    }
    $payload['message'] = $message;

    eplakJson($payload, 200);
} catch (Throwable $e) {
    /* fail-open: خرابیِ سرور نباید کاربرِ نسخه‌ی تازه را از اپ بیرون بیندازد */
    eplakJson($defaults, 200);
}
