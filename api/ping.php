<?php
/* api/ping.php — «آیا اینترنت وصل است؟»

   سبک‌ترین اندپوینت ممکن: نه دیتابیس را لمس می‌کند، نه فایل می‌نویسد.
   اپ اندروید و سایت با صدا زدن این آدرس می‌فهمند اتصال برقرار است یا نه
   (صفحه‌ی «بدون اینترنت اتصال ممکن نیست» از همین نتیجه استفاده می‌کند).

   اگر دیتابیس خراب باشد هم این آدرس جواب می‌دهد؛ چون هدفش فقط «زنده بودن
   اینترنت» است، نه «سالم بودن سایت».
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

echo json_encode([
    'success'     => true,
    'online'      => true,
    'server_time' => gmdate('c'),
    'fa_time'     => function_exists('eplakFaDateTime') ? eplakFaDateTime() : '',
], JSON_UNESCAPED_UNICODE);
