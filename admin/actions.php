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

if ($type === 'department_delete') {
    deleteDepartment($pdo, $id);
    eplakRedirect('departments.php');
    exit;
}

eplakRedirect('index.php');
