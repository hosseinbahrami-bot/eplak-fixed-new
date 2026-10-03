<?php
/* api/notifications.php — اعلان‌های ارسالی پنل ادمین برای اپلیکیشن

   GET  ?phone=09xxxxxxxxx        → فهرست اعلان‌های آن کاربر
   GET  ?phone=...&unread=1       → فقط خوانده‌نشده‌ها
   GET  ?phone=...&since_id=123   → اعلان‌های جدیدتر از شناسه داده‌شده
   POST (form/json) action=read   → علامت‌گذاری به‌عنوان خوانده‌شده
        فیلدها: action=read, phone, device, id  یا  ids=1,2,3  یا  all=1
        پاسخ: {success, read:true, marked:N}
   POST (form/json) action=delete → حذف اعلان از فهرست همین کاربر
        فیلدها: action=delete, phone, device, id  یا  ids=1,2,3  یا  all=1
        پاسخ: {success, deleted:true, hidden:N}

   نکته‌ی «خوانده شدن»: وضعیت خوانده‌شده برای هر کاربر جداگانه در جدول
   notification_reads نگه داشته می‌شود (توضیح کامل در shared/notification_reads.php).
   حساب کاربری که با آن پاسخ می‌دهیم: شماره‌ی موبایل برای کاربر وارد‌شده و
   «guest:<شناسه‌ی دستگاه>» برای کاربر مهمان.
*/
require_once __DIR__ . '/../admin/includes/db.php';
require_once __DIR__ . '/../shared/notification_reads.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* بدنه‌ی JSON (اپ اندروید و fetch) + فرم معمولی، هر دو پشتیبانی می‌شوند */
$json = [];
if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'POST') {
    $raw = file_get_contents('php://input');
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $json = $decoded;
        }
    }
}
/* ترتیب خواندن مقدار: بدنه‌ی JSON → فرم POST → پارامترهای GET
   (به $_REQUEST تکیه نمی‌کنیم؛ چون بسته به تنظیم request_order هاست، ممکن است
   فیلدهای POST داخل آن نباشند.) */
$input = static function (string $key, $default = null) use ($json) {
    if (array_key_exists($key, $json)) {
        return $json[$key];
    }
    if (array_key_exists($key, $_POST)) {
        return $_POST[$key];
    }
    if (array_key_exists($key, $_GET)) {
        return $_GET[$key];
    }
    return $default;
};

$action = trim((string) $input('action', ''));
$phone  = preg_replace('/[^0-9+]/', '', trim((string) $input('phone', ''))) ?? '';
if ($phone === 'all') {
    $phone = '';
}
$device   = preg_replace('/[^A-Za-z0-9_-]/', '', trim((string) $input('device', ''))) ?? '';
$readerKey = eplakNotificationReaderKey($phone, $device);

/* فهرست شناسه‌ها از id / ids / all */
$wantedIds = static function () use ($input): array {
    $ids = [];
    $single = (int) $input('id', 0);
    if ($single > 0) {
        $ids[] = $single;
    }
    $many = $input('ids', '');
    if (is_array($many)) {
        foreach ($many as $one) {
            $ids[] = (int) $one;
        }
    } elseif (is_string($many) && $many !== '') {
        foreach (explode(',', $many) as $one) {
            $ids[] = (int) $one;
        }
    }
    return array_values(array_unique(array_filter($ids, static fn($i) => $i > 0)));
};

try {
    /* ── حذف اعلان از فهرست همین کاربر ──────────────────────────────── */
    if ($action === 'delete' && $readerKey !== '') {
        $ids = $wantedIds();

        /* «حذف همه» = هر اعلانی که همین کاربر می‌بیند */
        if (!$ids || (int) $input('all', 0) === 1) {
            if ($phone !== '') {
                $stmt = $pdo->prepare("SELECT id FROM notifications WHERE user_phone = :phone OR user_phone = 'all' OR user_phone = ''");
                $stmt->execute([':phone' => $phone]);
            } else {
                $stmt = $pdo->query("SELECT id FROM notifications WHERE user_phone = 'all' OR user_phone = ''");
            }
            $ids = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        }

        /* فقط اعلان‌هایی که واقعاً به این کاربر مربوط‌اند حذف می‌شوند
           (کسی نمی‌تواند اعلان اختصاصی کاربر دیگر را حذف کند). */
        if ($ids) {
            $in  = implode(',', array_fill(0, count($ids), '?'));
            $sql = "SELECT id FROM notifications WHERE id IN ($in)";
            $par = $ids;
            if ($phone !== '') {
                $sql .= " AND (user_phone = ? OR user_phone = 'all' OR user_phone = '')";
                $par[] = $phone;
            } else {
                $sql .= " AND (user_phone = 'all' OR user_phone = '')";
            }
            $stmt = $pdo->prepare($sql);
            $stmt->execute($par);
            $ids = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        }

        $hidden = eplakNotificationHide($pdo, $ids, $readerKey);

        echo json_encode([
            'success' => true,
            'deleted' => true,
            'hidden'  => $hidden,
            'ids'     => $ids,
            'reader'  => $readerKey,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /* ── علامت‌گذاری به‌عنوان خوانده‌شده ───────────────────────────────── */
    if ($action === 'read' && $readerKey !== '') {
        $ids = $wantedIds();

        /* همه‌ی اعلان‌های همین کاربر (کلید «همه را خواندم» در اپ) */
        if (!$ids || (int) $input('all', 0) === 1) {
            if ($phone !== '') {
                $stmt = $pdo->prepare('SELECT id FROM notifications WHERE user_phone = :phone');
                $stmt->execute([':phone' => $phone]);
            } else {
                /* کاربر مهمان: اعلان‌های عمومی (و ردیف خالی) */
                $stmt = $pdo->query("SELECT id FROM notifications WHERE user_phone = 'all' OR user_phone = ''");
            }
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $one) {
                $ids[] = (int) $one;
            }
            $ids = array_values(array_unique($ids));
        }

        /* اگر همان کاربر ردیف اختصاصی دارد، ردیف مشترک «all» هم برای او خوانده‌شده
           حساب می‌شود؛ پس رسید خواندن برای آن هم ثبت می‌شود. */
        if ($phone !== '') {
            $stmt = $pdo->prepare("SELECT id FROM notifications WHERE (user_phone = 'all' OR user_phone = '') AND (send_id IS NULL OR send_id NOT IN (SELECT send_id FROM notifications WHERE user_phone = :phone AND send_id IS NOT NULL))");
            $stmt->execute([':phone' => $phone]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $one) {
                $ids[] = (int) $one;
            }
            $ids = array_values(array_unique($ids));
        }

        /* فقط اعلان‌هایی که واقعاً به این کاربر نمایش داده می‌شوند */
        if ($ids) {
            $in   = implode(',', array_fill(0, count($ids), '?'));
            $sql  = "SELECT id FROM notifications WHERE id IN ($in)";
            $par  = $ids;
            if ($phone !== '') {
                $sql .= " AND (user_phone = ? OR user_phone = 'all' OR user_phone = '')";
                $par[] = $phone;
            } else {
                $sql .= " AND (user_phone = 'all' OR user_phone = '')";
            }
            $stmt = $pdo->prepare($sql);
            $stmt->execute($par);
            $ids = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        }

        $marked = eplakNotificationMarkRead($pdo, $ids, $readerKey, $phone);

        echo json_encode([
            'success' => true,
            'read'    => true,
            'marked'  => count($ids),
            'stored'  => $marked,
            'reader'  => $readerKey,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $onlyUnread = (string) $input('unread', '') === '1';
    $sinceId    = (int) $input('since_id', 0);

    $params = [];
    if ($phone !== '') {
        /* اعلان‌های خودِ کاربر + اعلان‌های عمومی‌ای که نسخه‌ی اختصاصی برای او ندارند */
        $inner = 'SELECT id, title, body, read_flag, created_at, send_id FROM notifications WHERE user_phone = :phone
                  UNION
                  SELECT id, title, body, read_flag, created_at, send_id FROM notifications WHERE (user_phone = "all" OR user_phone = "")
                  AND (send_id IS NULL OR send_id NOT IN (SELECT send_id FROM notifications WHERE user_phone = :phone2 AND send_id IS NOT NULL))';
        $params[':phone']  = $phone;
        $params[':phone2'] = $phone;
    } else {
        /* کاربر مهمان: فقط اعلان‌های عمومی */
        $inner = 'SELECT id, title, body, read_flag, created_at, send_id FROM notifications WHERE (user_phone = "all" OR user_phone = "")';
    }

    $sql = "SELECT * FROM ($inner) AS eplak_notif";
    if ($sinceId > 0) {
        $sql .= ' WHERE eplak_notif.id > :since_id';
        $params[':since_id'] = $sinceId;
    }
    $sql .= ' ORDER BY eplak_notif.id DESC LIMIT 300';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    /* وضعیت خوانده‌شدن و حذف‌شدن مخصوص همین کاربر */
    $ids     = array_map(static fn(array $r) => (int) $r['id'], $rows);
    $read    = eplakNotificationReadSet($pdo, $ids, $readerKey);
    $hidden  = eplakNotificationHiddenSet($pdo, $ids, $readerKey);

    $items = [];
    foreach ($rows as $r) {
        $id = (int) $r['id'];
        if (isset($hidden[$id])) {
            /* کاربر این اعلان را حذف کرده است؛ در فهرست او نمایش داده نمی‌شود */
            continue;
        }
        $isRead = ((int) $r['read_flag'] === 1) || isset($read[$id]);
        $items[] = [
            'id'         => $id,
            'title'      => $r['title'],
            'body'       => $r['body'],
            'read_flag'  => $isRead ? 1 : 0,
            'created_at' => $r['created_at'],
        ];
    }

    if ($onlyUnread) {
        $items = array_values(array_filter($items, static fn(array $it) => $it['read_flag'] === 0));
    }

    usort($items, static fn(array $a, array $b) => $b['id'] <=> $a['id']);
    $items = array_slice($items, 0, 100);

    $unread = 0;
    foreach ($items as $it) {
        if ($it['read_flag'] === 0) {
            $unread++;
        }
    }

    echo json_encode([
        'success'       => true,
        'count'         => count($items),
        'unread'        => $unread,
        'notifications' => $items,
        'latest_id'     => !empty($items) ? $items[0]['id'] : 0,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
