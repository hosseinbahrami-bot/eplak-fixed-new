<?php
/* shared/notification_reads.php — «چه کسی اعلان را خوانده است؟»

   چرا این فایل لازم شد؟
   در جدول notifications یک ستون read_flag وجود دارد که به کل «ردیف» تعلق دارد.
   اعلان‌های گروهی (user_phone = 'all') برای همه‌ی کاربران یک ردیف مشترک هستند؛
   پس با آن ستون نه می‌شد فهمید کدام کاربر اعلان را خوانده، و نه پنل ادمین
   می‌توانست وضعیت درست را نشان دهد (خوانده‌شده/خوانده‌نشده).

   راه‌حل: جدول notification_reads برای هر (اعلان، خواننده) یک سطر نگه می‌دارد.
   کلید خواننده:
     • کاربر وارد‌شده  → شماره‌ی موبایل (مثل 09123456789)
     • کاربر مهمان     → guest:<شناسه‌ی دستگاه>  (شناسه در مرورگر ساخته می‌شود)

   این فایل هم از API (api/notifications.php) و هم از پنل ادمین
   (admin/notification_view.php) استفاده می‌شود تا منطق خوانده‌شدن یک‌جا باشد.
   ============================================================================ */

/** کلید یکتای «خواننده» از شماره‌ی موبایل و شناسه‌ی دستگاه */
function eplakNotificationReaderKey(string $phone, string $device = ''): string
{
    $phone  = preg_replace('/[^0-9+]/', '', trim($phone)) ?? '';
    $device = preg_replace('/[^A-Za-z0-9_-]/', '', trim($device)) ?? '';

    if ($phone !== '' && $phone !== 'all') {
        return mb_substr($phone, 0, 60, 'UTF-8');
    }
    if ($device !== '') {
        return 'guest:' . mb_substr($device, 0, 48, 'UTF-8');
    }
    return '';
}

/** آیا جداول و ستون‌های لازم آماده‌اند؟ (روی دیتابیس‌های قدیمی ممکن است نباشند) */
function eplakNotificationReadsReady(PDO $pdo): bool
{
    static $ready = null;
    if ($ready !== null) {
        return $ready;
    }
    try {
        eplakTableColumns($pdo, 'notification_reads');
        $ready = eplakTableColumns($pdo, 'notification_reads') !== null;
    } catch (\Throwable $e) {
        $ready = false;
    }
    return $ready;
}

/**
 * علامت‌گذاری اعلان‌ها به‌عنوان خوانده‌شده برای یک خواننده.
 *
 * @param array<int,int> $ids        شناسه‌های جدول notifications
 * @param string         $readerKey  خروجی eplakNotificationReaderKey
 * @param string         $phone      شماره‌ی کاربر (اگر وارد‌شده باشد) — فقط ردیف‌های
 *                                   خودِ همین کاربر read_flag می‌خورند و ردیف مشترک
 *                                   «all» دست‌نخورده می‌ماند تا برای دیگران خوانده‌نشده بماند.
 * @return int  تعداد اعلان‌هایی که خوانده‌شده ثبت شدند
 */
function eplakNotificationMarkRead(PDO $pdo, array $ids, string $readerKey, string $phone = ''): int
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0)));
    if (!$ids || $readerKey === '') {
        return 0;
    }

    $done = 0;

    /* ۱) ثبت رسید خواندن (منبع حقیقت برای پنل ادمین) */
    if (eplakNotificationReadsReady($pdo)) {
        $sqlite = eplakIsSqlite($pdo);
        $sql = $sqlite
            ? 'INSERT OR IGNORE INTO notification_reads (notification_id, user_phone) VALUES (:id, :reader)'
            : 'INSERT IGNORE INTO notification_reads (notification_id, user_phone) VALUES (:id, :reader)';
        try {
            $stmt = $pdo->prepare($sql);
            foreach ($ids as $id) {
                $stmt->execute([':id' => $id, ':reader' => $readerKey]);
                $done++;
            }
        } catch (\Throwable $e) {
            error_log('[eplak-notify] ثبت رسید خواندن ناموفق: ' . $e->getMessage());
        }
    }

    /* ۲) سازگاری با نسخه‌های قدیمی: ردیفِ خودِ کاربر هم read_flag می‌گیرد.
          ردیف مشترک «all» عمداً تغییر نمی‌کند. */
    $phoneKey = preg_replace('/[^0-9+]/', '', trim($phone)) ?? '';
    if ($phoneKey !== '' && $phoneKey !== 'all') {
        try {
            $in  = implode(',', array_fill(0, count($ids), '?'));
            $par = $ids;
            $par[] = $phoneKey;
            $stmt = $pdo->prepare("UPDATE notifications SET read_flag = 1 WHERE id IN ($in) AND user_phone = ?");
            $stmt->execute($par);
        } catch (\Throwable $e) {
            error_log('[eplak-notify] به‌روزرسانی read_flag ناموفق: ' . $e->getMessage());
        }
    }

    return $done;
}

/**
 * حذف اعلان‌ها «برای همین کاربر».
 *
 * اعلان‌ها در یک جدول مشترک‌اند؛ پس حذف واقعی ردیف باعث می‌شود اعلان برای دیگر
 * کاربران هم ناپدید شود. به‌جای پاک کردن ردیف، اینجا با یک رسید «حذف» ثبت
 * می‌کنیم و فهرست کاربر آن را نشان نمی‌دهد.
 *
 * @param array<int,int> $ids
 * @return int تعداد اعلان‌هایی که برای این کاربر حذف ثبت شد
 */
function eplakNotificationHide(PDO $pdo, array $ids, string $readerKey): int
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0)));
    if (!$ids || $readerKey === '') {
        return 0;
    }
    $done = 0;
    try {
        $sqlite = eplakIsSqlite($pdo);
        $sql = $sqlite
            ? 'INSERT OR IGNORE INTO notification_deletes (notification_id, user_phone) VALUES (:id, :reader)'
            : 'INSERT IGNORE INTO notification_deletes (notification_id, user_phone) VALUES (:id, :reader)';
        $stmt = $pdo->prepare($sql);
        foreach ($ids as $id) {
            $stmt->execute([':id' => $id, ':reader' => $readerKey]);
            $done++;
        }
    } catch (\Throwable $e) {
        error_log('[eplak-notify] ثبت حذف اعلان ناموفق: ' . $e->getMessage());
    }
    /* اعلانی که حذف می‌شود، عملاً خوانده‌شده هم هست (وگرنه شمارنده‌ی اپ اشتباه می‌شود) */
    try {
        eplakNotificationMarkRead($pdo, $ids, $readerKey);
    } catch (\Throwable $e) {
        /* بی‌اهمیت */
    }
    return $done;
}

/** اعلان‌های حذف‌شده‌ی یک خواننده: [notification_id => true] */
function eplakNotificationHiddenSet(PDO $pdo, array $ids, string $readerKey): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0)));
    if (!$ids || $readerKey === '') {
        return [];
    }
    try {
        $in   = implode(',', array_fill(0, count($ids), '?'));
        $par  = $ids;
        $par[] = $readerKey;
        $stmt = $pdo->prepare("SELECT notification_id FROM notification_deletes WHERE notification_id IN ($in) AND user_phone = ?");
        $stmt->execute($par);
        $set = [];
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $nid) {
            $set[(int) $nid] = true;
        }
        return $set;
    } catch (\Throwable $e) {
        return [];
    }
}

/** همه‌ی شناسه‌های حذف‌شده‌ی یک خواننده (بدون محدودیت فهرست) */
function eplakNotificationHiddenIds(PDO $pdo, string $readerKey): array
{
    if ($readerKey === '') {
        return [];
    }
    try {
        $stmt = $pdo->prepare('SELECT notification_id FROM notification_deletes WHERE user_phone = :reader');
        $stmt->execute([':reader' => $readerKey]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    } catch (\Throwable $e) {
        return [];
    }
}

/** اعلان‌های خوانده‌شده‌ی یک خواننده: [notification_id => true] */
function eplakNotificationReadSet(PDO $pdo, array $ids, string $readerKey): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0)));
    if (!$ids || $readerKey === '' || !eplakNotificationReadsReady($pdo)) {
        return [];
    }
    try {
        $in   = implode(',', array_fill(0, count($ids), '?'));
        $par  = $ids;
        $par[] = $readerKey;
        $stmt = $pdo->prepare("SELECT notification_id FROM notification_reads WHERE notification_id IN ($in) AND user_phone = ?");
        $stmt->execute($par);
        $set = [];
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $nid) {
            $set[(int) $nid] = true;
        }
        return $set;
    } catch (\Throwable $e) {
        return [];
    }
}

/** تعداد خواننده‌های هر اعلان: [notification_id => تعداد] */
function eplakNotificationReadCounts(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0)));
    if (!$ids || !eplakNotificationReadsReady($pdo)) {
        return [];
    }
    try {
        $in   = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT notification_id, COUNT(*) AS readers FROM notification_reads WHERE notification_id IN ($in) GROUP BY notification_id");
        $stmt->execute($ids);
        $counts = [];
        foreach ($stmt->fetchAll() as $row) {
            $counts[(int) $row['notification_id']] = (int) $row['readers'];
        }
        return $counts;
    } catch (\Throwable $e) {
        return [];
    }
}

/** فهرست خواننده‌های یک اعلان: [ ['reader' => ..., 'read_at' => ...], ... ] */
function eplakNotificationReaders(PDO $pdo, int $notificationId): array
{
    if ($notificationId <= 0 || !eplakNotificationReadsReady($pdo)) {
        return [];
    }
    try {
        $stmt = $pdo->prepare('SELECT user_phone AS reader, read_at FROM notification_reads WHERE notification_id = :id ORDER BY id ASC');
        $stmt->execute([':id' => $notificationId]);
        return $stmt->fetchAll();
    } catch (\Throwable $e) {
        return [];
    }
}
