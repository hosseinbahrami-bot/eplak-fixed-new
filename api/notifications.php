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
/* eplakNormalizePhone (پاک‌سازی یکسانِ شماره در همه‌ی اندپوینت‌ها) */
require_once __DIR__ . '/_common.php';

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

/* ── شماره‌ی کاربر، با همان پاک‌سازیِ گزارش/تیکت ────────────────────────
   باگ واقعی: این‌جا فقط نویسه‌های غیررقمی حذف می‌شد. اگر گوشی شماره را
   «+989121112233» یا با رقم فارسی («۰۹۱۲۱۱۱۲۲۳۳») می‌فرستاد، کلید جست‌وجو
   هرگز با شماره‌ای که گزارش/اعلان زیرش ذخیره شده («09121112233») یکی نمی‌شد؛
   نتیجه: اعلان‌های خودِ کاربر (مثل «✅ ثبت درخواست») در فهرست اعلان‌های او
   دیده نمی‌شد، چون سرور او را کاربر مهمان حساب می‌کرد. حالا از همان تابع
   استاندارد eplakNormalizePhone استفاده می‌شود. */
$phoneRaw = trim((string) $input('phone', ''));
if (strtolower($phoneRaw) === 'all') {
    $phoneRaw = '';
}
$phone = $phoneRaw === '' ? '' : eplakNormalizePhone($phoneRaw);
if ($phone === '' && preg_match('/[0-9۰-۹٠-٩]/u', $phoneRaw)) {
    /* شماره‌ای که الگوی موبایل ایران را ندارد (مثلاً داده‌ی قدیمی) — رفتار قبلی */
    $fallback = preg_replace('/[^0-9+]/', '', $phoneRaw) ?? '';
    $phone = ($fallback === 'all') ? '' : $fallback;
}
$device   = preg_replace('/[^A-Za-z0-9_-]/', '', trim((string) $input('device', ''))) ?? '';
$readerKey = eplakNotificationReaderKey($phone, $device);

/* ── همه‌ی قالب‌های همین شماره ────────────────────────────────────────────
   نسخه‌های قدیمی اپ شماره را بدون پاک‌سازی ذخیره می‌کردند: «+98912…»، «0098…»،
   رقم فارسی یا بدون صفر. ردیف‌های قدیمی باید باز هم برای همان کاربر دیده شوند
   (باگ واقعی: اعلان کاربر در فهرست خودش پیدا نمی‌شد). */
$phoneVariants = $phone !== '' ? eplakPhoneVariants($phone) : [];
$placeholders  = static fn(int $count): string => implode(',', array_fill(0, max(1, $count), '?'));
$phoneIn       = $phoneVariants ? $placeholders(count($phoneVariants)) : '';

/* ── ستون‌های موجود در دیتابیس همین هاست ────────────────────────────────
   روی هاست‌های قدیمی ممکن است ستون send_id هنوز اضافه نشده باشد
   (همگام‌سازی اسکیما اگر دسترسی ALTER نباشد کامل نمی‌شود). پیش از این،
   کوئری با «Unknown column 'send_id'» خطا می‌داد و کل فهرست اعلان‌های کاربر
   خالی برمی‌گشت؛ یعنی نه اعلان پنل دیده می‌شد و نه اعلان «درخواست شما ثبت
   شد». حالا همه‌ی کوئری‌ها با ستون‌های واقعیِ همان دیتابیس ساخته می‌شوند. */
$hasSendId = eplakTableHasColumn($pdo, 'notifications', 'send_id');
$hasRead   = eplakTableHasColumn($pdo, 'notifications', 'read_flag');

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
                $stmt = $pdo->prepare("SELECT id FROM notifications WHERE user_phone IN ($phoneIn) OR user_phone = 'all' OR user_phone = ''");
                $stmt->execute($phoneVariants);
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
                $sql .= " AND (user_phone IN ($phoneIn) OR user_phone = 'all' OR user_phone = '')";
                $par = array_merge($par, $phoneVariants);
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
                $stmt = $pdo->prepare("SELECT id FROM notifications WHERE user_phone IN ($phoneIn)");
                $stmt->execute($phoneVariants);
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
            /* اگر ستون send_id روی این دیتابیس نباشد، همین کوئری بدون آن اجرا می‌شود */
            $readSql = ($hasSendId && $phoneIn !== '')
                ? "SELECT id FROM notifications WHERE (user_phone = 'all' OR user_phone = '') AND (send_id IS NULL OR send_id NOT IN (SELECT send_id FROM notifications WHERE user_phone IN ($phoneIn) AND send_id IS NOT NULL))"
                : "SELECT id FROM notifications WHERE (user_phone = 'all' OR user_phone = '')";
            try {
                $stmt = $pdo->prepare($readSql);
                $stmt->execute(($hasSendId && $phoneIn !== '') ? $phoneVariants : []);
                foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $one) {
                    $ids[] = (int) $one;
                }
                $ids = array_values(array_unique($ids));
            } catch (Throwable $e) {
                error_log('[eplak-api:notifications.read-all] ' . $e->getMessage());
            }
        }

        /* فقط اعلان‌هایی که واقعاً به این کاربر نمایش داده می‌شوند */
        if ($ids) {
            $in   = implode(',', array_fill(0, count($ids), '?'));
            $sql  = "SELECT id FROM notifications WHERE id IN ($in)";
            $par  = $ids;
            if ($phone !== '') {
                $sql .= " AND (user_phone IN ($phoneIn) OR user_phone = 'all' OR user_phone = '')";
                $par = array_merge($par, $phoneVariants);
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

    $cols = 'id, title, body, ' . ($hasRead ? 'read_flag' : '0 AS read_flag') . ', created_at' . ($hasSendId ? ', send_id' : '');

    /* رشته‌ها با کوتیشن تک نوشته می‌شوند (سازگار با sql_mode=ANSI_QUOTES) */
    if ($phone !== '') {
        /* اعلان‌های خودِ کاربر + اعلان‌های عمومی‌ای که نسخه‌ی اختصاصی برای او ندارند.
           هر قالب شماره نام پارامتر خودش را دارد؛ چون فهرست قالب‌ها دو بار در
           کوئری تکرار می‌شود، دسته‌ی دوم پسوند _b می‌گیرد. */
        $publicWhere = "(user_phone = 'all' OR user_phone = '')";
        $namesA = [];
        $namesB = [];
        foreach (array_values($phoneVariants) as $vi => $variant) {
            $namesA[] = ':v' . $vi;
            $namesB[] = ':w' . $vi;
            $params[':v' . $vi] = $variant;
            $params[':w' . $vi] = $variant;
        }
        $inA = $namesA ? implode(', ', $namesA) : 'NULL';
        $inB = $namesB ? implode(', ', $namesB) : 'NULL';
        $inner = 'SELECT ' . $cols . " FROM notifications WHERE user_phone IN ($inA)
                  UNION
                  SELECT " . $cols . ' FROM notifications WHERE ' . $publicWhere
                  . ($hasSendId
                        ? " AND (send_id IS NULL OR send_id NOT IN (SELECT send_id FROM notifications WHERE user_phone IN ($inB) AND send_id IS NOT NULL))"
                        : '');
    } else {
        /* کاربر مهمان: فقط اعلان‌های عمومی */
        $inner = 'SELECT ' . $cols . " FROM notifications WHERE (user_phone = 'all' OR user_phone = '')";
    }

    /* read_flag در UNION باید همان ترتیب ستون‌ها را داشته باشد — با $cols ساخته شده است */

    $sql = "SELECT * FROM ($inner) AS eplak_notif";
    if ($sinceId > 0) {
        $sql .= ' WHERE eplak_notif.id > :since_id';
        $params[':since_id'] = $sinceId;
    }
    $sql .= ' ORDER BY eplak_notif.id DESC LIMIT 300';

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
    } catch (Throwable $queryError) {
        /* آخرین سنگر: اگر ساختار دیتابیس با هیچ‌کدام از حالت‌های بالا نخواند
           (مثلاً ستون created_at یا بدنه‌ی جدول تغییر کرده باشد)، دست‌کم
           «همان اعلان‌های کاربر» با کوئری ساده‌ی زیر برمی‌گردد تا فهرست
           اعلان‌ها به‌کل خالی نماند. */
        error_log('[eplak-api:notifications.query] ' . $queryError->getMessage());
        $simpleParams = [];
        foreach (array_values($phoneVariants) as $vi => $variant) {
            $simpleParams[':s' . $vi] = $variant;
        }
        $simple = '';
        if ($phone !== '' && $simpleParams) {
            $simple = 'SELECT id, title, body, created_at FROM notifications WHERE user_phone IN ('
                    . implode(', ', array_keys($simpleParams)) . ") OR user_phone = 'all' OR user_phone = ''";
        } else {
            $simple = "SELECT id, title, body, created_at FROM notifications WHERE user_phone = 'all' OR user_phone = ''";
        }
        $stmt = $pdo->prepare($simple);
        $stmt->execute($simpleParams);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$rowRef) {
            $rowRef['read_flag'] = 0;
        }
        unset($rowRef);
    }

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
