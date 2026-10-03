<?php
/* admin/api_live.php — دریافت آخرین آمار، آخرین گزارش‌ها و آخرین کاربران برای به‌روزرسانی زنده */
require_once __DIR__ . '/includes/db.php';
eplakStartSession('eplak_admin');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

if (empty($_SESSION['admin_logged_in']) || empty($_SESSION['admin_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $reportsCount = (int)$pdo->query('SELECT COUNT(*) FROM reports')->fetchColumn();
    $latestReport = $pdo->query('SELECT id, user_phone, title, category, department, status, created_at FROM reports ORDER BY id DESC LIMIT 1')->fetch();

    $usersCount = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $latestUser = $pdo->query('SELECT id, phone, name, address, created_at FROM users ORDER BY id DESC LIMIT 1')->fetch();

    $pendingCount = (int)$pdo->query('SELECT COUNT(*) FROM reports WHERE status = "pending"')->fetchColumn();
    $doneCount    = (int)$pdo->query('SELECT COUNT(*) FROM reports WHERE status = "done"')->fetchColumn();

    echo json_encode([
        'success'       => true,
        'reports_count' => $reportsCount,
        'pending_count' => $pendingCount,
        'done_count'    => $doneCount,
        'latest_report' => $latestReport ?: null,
        'users_count'   => $usersCount,
        'latest_user'   => $latestUser ?: null,
        'timestamp'     => time(),
        'time_str'      => date('H:i:s')
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
