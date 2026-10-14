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
require_once __DIR__ . '/../shared/app_heartbeat.php';

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
/* شماره با همان قاعده‌ی همه‌ی پروژه یکدست می‌شود (۰۹۱۲… / +۹۸۹۱۲… / ۹۱۲… /
   رقم فارسی → 09xxxxxxxxx). پیش‌تر فقط نویسه‌های غیررقمی حذف می‌شدند، پس
   اعلانی که با «+98…» ذخیره شده بود در فهرست اپ پیدا نمی‌شد. */
$phone  = function_exists('eplakPhoneKey')
    ? eplakPhoneKey((string) $input('phone', ''))
    : (preg_replace('/[^0-9+]/', '', trim((string) $input('phone', ''))) ?? '');
if ($phone === 'all') {
    $phone = '';
}
$device   = preg_replace('/[^A-Za-z0-9_-]/', '', trim((string) $input('device', ''))) ?? '';
$readerKey = eplakNotificationReaderKey($phone, $device);

/* ── همه‌ی قالب‌های همین شماره ────────────────────────────────────────────
   نسخه‌های قدیمی اپ/پنل شماره را بدون پاک‌سازی ذخیره می‌کردند: «+98912…»،
   «0098…»، «98912…»، رقم فارسی یا بدون صفرِ ابتدایی. حالا ردیف‌های همان کاربر
   با همه‌ی این قالب‌ها پیدا می‌شوند؛ وگرنه اعلان «✅ ثبت درخواست» روی سرور بود
   ولی در فهرست اعلان‌های خودِ کاربر دیده نمی‌شد. */
$phoneVariants = ($phone !== '' && function_exists('eplakPhoneVariants'))
    ? eplakPhoneVariants($phone)
    : ($phone !== '' ? [$phone] : []);
$phonePlaceholders = static function (int $count): string {
    return implode(', ', array_fill(0, max(1, $count), '?'));
};
/* ساخت مجموعه‌ی «:p0, :p1, …» + مقادیرش برای یک کوئری نام‌دار */
$phoneNamedSet = static function (string $prefix, array &$params) use ($phoneVariants): string {
    $names = [];
    foreach ($phoneVariants as $i => $variant) {
        $key = ':' . $prefix . $i;
        $names[] = $key;
        $params[$key] = $variant;
    }
    return implode(', ', $names);
};

/* ── ساختار واقعی جدول اعلان‌ها (یک‌بار برای همه‌ی شاخه‌ها) ────────────────
   دیتابیس قدیمیِ هاست (backend/eplak-db.sql) ستون send_id ندارد. پیش از این،
   کوئری‌های همین فایل «همیشه» send_id را می‌خواستند و با خطای
     SQLSTATE[42S22]: Column not found: 1054 Unknown column 'send_id'
   پاسخ ۵۰۰ برمی‌گشت؛ در نتیجه اپ «هیچ» اعلانی نمی‌دید — نه اعلان «ثبت
   درخواست» و نه اعلان‌های پنل. حالا اول ستون ترمیم می‌شود و اگر ترمیم ممکن
   نبود (کاربر دیتابیس اجازه‌ی ALTER ندارد) کوئری بدون همان ستون ساخته می‌شود. */
$schema  = function_exists('eplakNotificationsSchema')
    ? eplakNotificationsSchema($pdo)
    : ['send_id' => true, 'read_flag' => true, 'emoji' => true, 'fk' => false, 'failed' => []];
$hasSend = !empty($schema['send_id']);
$hasRead = !array_key_exists('read_flag', $schema) || !empty($schema['read_flag']);

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
                $stmt = $pdo->prepare("SELECT id FROM notifications WHERE user_phone IN (" . $phonePlaceholders(count($phoneVariants)) . ") OR user_phone = 'all' OR user_phone = ''");
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
                $sql .= " AND (user_phone IN (" . $phonePlaceholders(count($phoneVariants)) . ") OR user_phone = 'all' OR user_phone = '')";
                foreach ($phoneVariants as $variant) {
                    $par[] = $variant;
                }
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
                $stmt = $pdo->prepare('SELECT id FROM notifications WHERE user_phone IN (' . $phonePlaceholders(count($phoneVariants)) . ')');
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
           حساب می‌شود؛ پس رسید خواندن برای آن هم ثبت می‌شود.
           (بدون ستون send_id این تفکیک ممکن نیست؛ همان ردیف‌های عمومی علامت
           می‌خورند — وضعیت خوانده‌شدن «برای هر کاربر جدا» در جدول
           notification_reads نگه داشته می‌شود و به این ستون وابسته نیست.) */
        if ($phone !== '') {
            $publicIds = [];
            if ($hasSend) {
                $pubParams = [];
                $pubSet    = $phoneNamedSet('rp', $pubParams);
                $stmt = $pdo->prepare("SELECT id FROM notifications WHERE (user_phone = 'all' OR user_phone = '') AND (send_id IS NULL OR send_id NOT IN (SELECT send_id FROM notifications WHERE user_phone IN ($pubSet) AND send_id IS NOT NULL))");
                $stmt->execute($pubParams);
                $publicIds = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
            } else {
                /* حالت سازگار: همه‌ی ردیف‌های عمومی (رسید خواندن برای همین
                   کاربر ثبت می‌شود و به بقیه ربطی ندارد) */
                $stmt = $pdo->query("SELECT id FROM notifications WHERE user_phone = 'all' OR user_phone = ''");
                $publicIds = $stmt ? ($stmt->fetchAll(PDO::FETCH_COLUMN) ?: []) : [];
            }
            foreach ($publicIds as $one) {
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
                $sql .= " AND (user_phone IN (" . $phonePlaceholders(count($phoneVariants)) . ") OR user_phone = 'all' OR user_phone = '')";
                foreach ($phoneVariants as $variant) {
                    $par[] = $variant;
                }
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

    $cols   = 'id, title, body' . ($hasRead ? ', read_flag' : '') . ', created_at' . ($hasSend ? ', send_id' : '');
    $params = [];
    if ($phone !== '') {
        /* اعلان‌های خودِ کاربر (با همه‌ی قالب‌های شماره) + اعلان‌های عمومی‌ای که
           نسخه‌ی اختصاصی برای او ندارند */
        $inSet  = $phoneNamedSet('pp', $params);
        $inSet2 = $phoneNamedSet('pv', $params);
        $inner = "SELECT $cols FROM notifications WHERE user_phone IN ($inSet)";
        if ($hasSend) {
            $inner .= " UNION SELECT $cols FROM notifications WHERE (user_phone = 'all' OR user_phone = '')"
                   . " AND (send_id IS NULL OR send_id NOT IN (SELECT send_id FROM notifications WHERE user_phone IN ($inSet2) AND send_id IS NOT NULL))";
        } else {
            /* بدون send_id نمی‌شود فهمید کدام اعلان عمومی «نسخه‌ی عمومیِ همان
               اعلان اختصاصی» است؛ پس ردیف عمومیِ هم‌عنوان و هم‌متنِ اعلان
               اختصاصیِ همین کاربر نادیده گرفته می‌شود تا اعلان دوبار دیده نشود. */
            $inSet3 = $phoneNamedSet('pb', $params);
            $inner .= " UNION SELECT $cols FROM notifications AS b WHERE (b.user_phone = 'all' OR b.user_phone = '')"
                   . " AND NOT EXISTS (SELECT 1 FROM notifications AS p WHERE p.user_phone IN ($inSet3) AND p.title = b.title AND p.body = b.body)";
        }
    } else {
        /* کاربر مهمان: فقط اعلان‌های عمومی */
        $inner = "SELECT $cols FROM notifications WHERE (user_phone = 'all' OR user_phone = '')";
    }

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
        /* آخرین سنگر: ساده‌ترین کوئری ممکن، بدون هیچ ستون اختیاری.
           حتی اگر ساختار دیتابیس خراب‌تر از این حرف‌ها باشد، کاربر «فهرست
           اعلان‌هایش» را می‌بیند و اپ صفحه‌ی خالی نشان نمی‌دهد. */
        error_log('[eplak-api:notifications] کوئری اصلی ناموفق؛ تلاش با کوئری ساده: ' . $queryError->getMessage());
        try {
            $schema  = function_exists('eplakNotificationsSchema') ? eplakNotificationsSchema($pdo, true) : $schema;
            $hasSend = !empty($schema['send_id']);
            $hasRead = !array_key_exists('read_flag', $schema) || !empty($schema['read_flag']);
        } catch (Throwable $e) {
            $hasSend = false;
            $hasRead = false;
        }
        $cols   = 'id, title, body' . ($hasRead ? ', read_flag' : '') . ', created_at' . ($hasSend ? ', send_id' : '');
        $simpleParams = [];
        if ($phone !== '') {
            $simple = "SELECT $cols FROM notifications WHERE user_phone IN (" . $phoneNamedSet('sp', $simpleParams) . ") OR user_phone = 'all' OR user_phone = ''";
        } else {
            $simple = "SELECT $cols FROM notifications WHERE user_phone = 'all' OR user_phone = ''";
        }
        if ($sinceId > 0) {
            $simple .= ' AND id > :since_id';
            $simpleParams[':since_id'] = $sinceId;
        }
        $simple .= ' ORDER BY id DESC LIMIT 300';
        $stmt = $pdo->prepare($simple);
        $stmt->execute($simpleParams);
        $rows = $stmt->fetchAll();
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
        $isRead = ((int) ($r['read_flag'] ?? 0) === 1) || isset($read[$id]);
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

    /* «سازگار شده» یعنی دیتابیس قدیمی است و کد بدون ستون/ایموجیِ نبوده کار
       کرده. اپ این را در پیام وضعیت اعلان نشان می‌دهد تا مدیر بداند باید
       ساختار دیتابیس را ترمیم کند (پنل → تنظیمات → ترمیم ساختار دیتابیس). */
    $degraded = [];
    if (!$hasSend) {
        $degraded[] = 'send_id';
    }
    if (!$hasRead) {
        $degraded[] = 'read_flag';
    }
    if (!empty($schema['fk'])) {
        $degraded[] = 'foreign_key';
    }
    if (array_key_exists('emoji', $schema) && empty($schema['emoji'])) {
        $degraded[] = 'utf8mb3';
    }

    /* «ضربان اپ»: اپ با app=android|ios|web می‌گوید کیست؛ پنل → تنظیمات →
       «ضربان اپ‌ها» نشان می‌دهد هر اپ کِی آخرین بار فهرست را گرفت و چند اعلان
       برایش برگشت (عیب‌یابی «اعلان در APK نمی‌آید» بدون دسترسی به گوشی). */
    $str = static fn($v): string => is_scalar($v) ? (string) $v : '';
    eplakHeartbeatRecord($pdo, [
        'platform' => $str($input('app', '')),
        'phone'    => $phone,
        'device'   => $device,
        'count'    => count($items),
        'unread'   => $unread,
        'rows'     => count($rows),
        'hidden'   => count($hidden),
        'degraded' => $degraded,
        'v'        => $str($input('v', '')),
        'prev'     => $str($input('prev', '')),
    ]);

    echo json_encode([
        'success'       => true,
        'count'         => count($items),
        'unread'        => $unread,
        'notifications' => $items,
        'latest_id'     => !empty($items) ? $items[0]['id'] : 0,
        'degraded'      => $degraded,
        'hint'          => $degraded
            ? 'ساختار جدول اعلان‌ها در دیتابیس قدیمی است؛ اعلان‌ها نمایش داده می‌شوند ولی برای ترمیم کامل، در پنل → تنظیمات → «ترمیم ساختار دیتابیس» را بزنید.'
            : '',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    /* هرگز «۵۰۰ خالی» برنمی‌گردانیم: اپ با پاسخ ناموفق، صفحه‌ی اعلان‌ها را
       خالی نشان می‌داد و کاربر هیچ سرنخی از علت نداشت. حالا علت و راهنما
       همراه پاسخ می‌رود و اپ همان را در پیام وضعیت اعلان نمایش می‌دهد. */
    error_log('[eplak-api:notifications] ' . $e->getMessage());
    echo json_encode([
        'success'       => false,
        'count'         => 0,
        'unread'        => 0,
        'notifications' => [],
        'error'         => $e->getMessage(),
        'hint'          => 'خواندن فهرست اعلان‌ها از دیتابیس ممکن نشد. در پنل → تنظیمات → «ترمیم ساختار دیتابیس» را بزنید و دوباره امتحان کنید.',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
