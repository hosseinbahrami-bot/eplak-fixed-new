<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$type = $_GET['type'] ?? '';
$id = (int)($_GET['id'] ?? 0);

// همه‌ی عملیات این فایل تغییردهنده‌اند → توکن CSRF الزامی است
eplakRequireCsrf();

if ($type === 'report_delete') {
    deleteReport($pdo, $id);
    eplakRedirect('reports.php');
    exit;
}

if ($type === 'user_delete') {
    deleteUser($pdo, $id);
    eplakRedirect('users.php');
    exit;
}

if ($type === 'ticket_delete') {
    deleteTicket($pdo, $id);
    eplakRedirect('tickets.php');
    exit;
}

if ($type === 'report_reply_delete') {
    deleteReportReply($pdo, $id);
    eplakRedirect('report_detail.php?id=' . $id);
    exit;
}

if ($type === 'ticket_reply_delete') {
    deleteTicketReply($pdo, $id);
    eplakRedirect('ticket_detail.php?id=' . $id);
    exit;
}

if ($type === 'news_delete') {
    deleteNews($pdo, $id);
    eplakRedirect('news.php?deleted=1');
    exit;
}

if ($type === 'news_toggle') {
    toggleNewsPublished($pdo, $id);
    eplakRedirect('news.php?success=1');
    exit;
}

/* ترمیم ساختار جدول اخبار/دانستنی‌ها — همان کاری که برای جدول اعلان‌ها می‌کنیم:
   • اگر جدول news در دیتابیس نیست (دامپ اصلی DBasli آن را ندارد) ساخته می‌شود
   • ستون‌های نبوده (badge، image_url، summary، sort_order، published) اضافه می‌شوند
   • جدول به utf8mb4 تبدیل می‌شود تا ایموجیِ آیکون/عنوان ذخیره شود
   • اگر جدول خالی است، محتوای پیش‌فرض (۴ خبر + ۲ دانستنی) یک‌بار درج می‌شود
   بدون این ترمیم، «افزودن مطلب» روی دیتابیس قدیمی همیشه شکست می‌خورد و
   فهرست اخبار در اپ خالی می‌ماند. */
if ($type === 'news_repair') {
    $schema = eplakNewsSchema($pdo, true);
    /* اجازه‌ی درج دوباره‌ی محتوای پیش‌فرض (فقط وقتی جدول خالی باشد درج می‌شود) */
    eplakSetAppSetting($pdo, 'news_seeded', '');
    $seedReport = null;
    $seeded = eplakSeedDefaultNews($pdo, $seedReport);
    eplakRedirect('news.php?' . http_build_query([
        'repaired' => 1,
        'fixed'    => count($schema['repaired']),
        'broken'   => count($schema['failed']),
        'seeded'   => $seeded,
    ]));
    exit;
}

if ($type === 'department_delete') {
    deleteDepartment($pdo, $id);
    eplakRedirect('departments.php');
    exit;
}

eplakRedirect('index.php');
