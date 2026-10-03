<?php
/* api/places.php — اماکنی که ادمین از پنل («اماکن شهری») افزوده، اصلاح یا پنهان کرده است

   فهرست پیش‌فرضِ «نقشه و اماکن شهری» داخل خودِ اپ است (core/places-data.js)؛ این اندپوینت
   فقط «تفاوت» را برمی‌گرداند و اپ آن را روی فهرست پیش‌فرض اعمال می‌کند:
     custom    — مکان‌های افزوده‌شده‌ی منتشرشده (id یکتای «u…»)
     overrides — اصلاح‌ها: { idِ پیش‌فرض: { cat, fa, en, lat, lng, addr, addrEn, tel, note, noteEn, approx } }
     hidden    — idِ مکان‌های پیش‌فرضی که باید از نقشه پنهان شوند
     v         — اثر انگشت محتوا؛ اگر عوض نشده باشد اپ کاری نمی‌کند

   فقط خواندنی و عمومی است (همان داده‌ای که در نقشه‌ی اپ دیده می‌شود)؛ هیچ اطلاعات کاربری ندارد.
   اگر دیتابیس/جدول در دسترس نباشد، پاسخ خالی (success: true) داده می‌شود و اپ با فهرست
   پیش‌فرض ادامه می‌دهد.
*/
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../shared/places_store.php';

eplakApiHeaders();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    eplakJsonError('method_not_allowed', 405);
}

try {
    eplakJson(eplakPlacesPublicPayload($pdo));
} catch (\Throwable $e) {
    error_log('eplak api/places: ' . $e->getMessage());
    eplakJsonError('places_unavailable', 500);
}
