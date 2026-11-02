<?php
/* admin/api_live.php — دریافت آخرین آمار، آخرین گزارش‌ها و آخرین کاربران برای به‌روزرسانی زنده */
require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/acl.php';   /* دامنه‌ی دسترسی مدیر (حوزه/معاونت) */
eplakStartSession('eplak_admin');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

if (empty($_SESSION['admin_logged_in']) || empty($_SESSION['admin_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    /* این پایانه هم مثل خودِ داشبورد «حوزه‌محدود» است: مدیرِ حوزه/معاونت فقط
       آمار و آخرین گزارشِ همان حوزه را می‌گیرد و بخش کاربران برایش null است
       (چون به صفحه‌ی کاربران دسترسی ندارد). دامنه با SQL اعمال می‌شود تا این
       پایانه که هر چند ثانیه صدا زده می‌شود، کل جدول را نخواند. */
    $eplakScope    = eplakAdminScope($pdo);
    $eplakIsSuper  = !empty($eplakScope['is_super']);
    /* نامِ واحدهای «سپرده‌شده» برای نمایش (نه فهرستِ گسترده‌ی زیرمجموعه‌ها) */
    $eplakScopeNames = [];
    foreach ((array) ($eplakScope['departments'] ?? []) as $eplakDept) {
        $eplakName = trim((string) ($eplakDept['name'] ?? ''));
        if ($eplakName !== '') {
            $eplakScopeNames[] = $eplakName;
        }
    }
    $repScope      = eplakScopeSql($eplakScope, 'reports');
    $repWhere      = $repScope['sql'];          /* برای مدیر کل رشته‌ی خالی است */
    $repParams     = $repScope['params'];

    $q = $pdo->prepare('SELECT COUNT(*) FROM reports WHERE 1=1' . $repWhere);
    $q->execute($repParams);
    $reportsCount = (int) $q->fetchColumn();

    $q = $pdo->prepare('SELECT id, user_phone, title, category, department, status, created_at
                          FROM reports WHERE 1=1' . $repWhere . ' ORDER BY id DESC LIMIT 1');
    $q->execute($repParams);
    $latestReport = $q->fetch();

    if ($eplakIsSuper) {
        $usersCount = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
        $latestUser = $pdo->query('SELECT id, phone, name, address, created_at FROM users ORDER BY id DESC LIMIT 1')->fetch();
    } else {
        /* مدیرِ حوزه به داده‌ی کاربران دسترسی ندارد → null، نه صفر */
        $usersCount = null;
        $latestUser = null;
    }

    $q = $pdo->prepare('SELECT COUNT(*) FROM reports WHERE status = "pending"' . $repWhere);
    $q->execute($repParams);
    $pendingCount = (int) $q->fetchColumn();

    $q = $pdo->prepare('SELECT COUNT(*) FROM reports WHERE status = "done"' . $repWhere);
    $q->execute($repParams);
    $doneCount = (int) $q->fetchColumn();

    echo json_encode([
        'success'       => true,
        'reports_count' => $reportsCount,
        'pending_count' => $pendingCount,
        'done_count'    => $doneCount,
        'latest_report' => $latestReport ?: null,
        'users_count'   => $usersCount,
        'latest_user'   => $latestUser ?: null,
        /* برای نمایش در صفحه‌ی داشبورد: «همه‌ی حوزه‌ها» یا نام حوزه‌های مدیر */
        'scope'         => [
            'is_super'    => $eplakIsSuper,
            'role'        => eplakAdminRoleLabel(),
            'departments' => $eplakIsSuper ? [] : $eplakScopeNames,
        ],
        'timestamp'     => time(),
        'time_str'      => date('H:i:s')
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
