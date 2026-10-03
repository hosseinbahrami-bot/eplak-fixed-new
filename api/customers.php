<?php
/* api/customers.php — اندپوینت قدیمی (جدول customers در اسکیمای فعلی وجود ندارد).
   برای جلوگیری از افشای خطای دیتابیس غیرفعال شده است؛ از api/users.php استفاده کنید. */
require_once __DIR__ . '/_common.php';
eplakApiHeaders();
eplakJsonError('این اندپوینت دیگر پشتیبانی نمی‌شود. از users.php استفاده کنید.', 410);
