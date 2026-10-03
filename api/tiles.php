<?php
/* api/tiles.php — کاشی‌های نقشه از سرور خودِ ای‌پلاک (پروکسی + کش)

   نمونه:  api/tiles.php?z=17&x=84230&y=52301
   توضیح کامل: shared/tiles.php

   عمداً به دیتابیس وصل نمی‌شود (نه _common.php، نه bootstrap): اگر دیتابیس
   موقتاً از دسترس خارج شد، نقشه همچنان کار می‌کند و هر کاشی هم یک اتصال
   دیتابیس را هدر نمی‌دهد. */
if (!defined('EPLAK_ROOT')) {
    define('EPLAK_ROOT', dirname(__DIR__));      /* همان تعریفِ shared/bootstrap.php */
}
require_once __DIR__ . '/../shared/media.php';   /* فقط برای ساخت امن پوشه‌ی uploads */
require_once __DIR__ . '/../shared/tiles.php';

$result = eplakTileHandle($_GET, $_SERVER);

http_response_code($result['status']);
foreach ($result['headers'] as $name => $value) {
    header($name . ': ' . $value);
}
echo $result['body'];
