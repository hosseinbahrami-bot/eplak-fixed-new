<?php
/* ============================================================================
   admin/notif_diag.php — صفحه‌ی عیب‌یابی اعلان‌ها (فقط خواندن، هیچ تغییری نمی‌دهد)

   چرا این صفحه ساخته شد؟ چون «اعلان نمی‌رسد» و «صفحه‌ی گیرندگان، خطای ۵۰۰
   می‌دهد» روی هاست واقعی رخ می‌دهد و از بیرون نمی‌توان دیتابیس هاست را دید.
   این صفحه همان چیزهایی را که برای تشخیص لازم است نشان می‌دهد:
     • نسخه‌ی فایل‌های روی هاست (فهمیدن این‌که به‌روزرسانی واقعاً آپلود شده)
     • ستون‌های واقعی جدول‌های اعلان و موارد جاافتاده
     • قیدهای خارجی قدیمی روی notifications
     • خطای واقعیِ کوئری‌هایی که در صفحه‌ی گیرندگان استفاده می‌شوند
     • شمار ردیف‌ها و آخرین ارسال‌های ثبت‌شده در push_log

   امنیت: مثل بقیه‌ی صفحه‌های پنل، نیاز به ورود مدیر دارد و هیچ داده‌ای را
   تغییر نمی‌دهد و هیچ رمز/کلیدی را چاپ نمی‌کند.
   ============================================================================ */
require_once __DIR__ . '/auth.php';

$rows = [];
$add  = static function (string $label, $value) use (&$rows): void {
    $rows[] = [$label, is_scalar($value) ? (string) $value : json_encode($value, JSON_UNESCAPED_UNICODE)];
};

/* ---------- ۱) فایل‌های روی هاست: آیا به‌روزرسانی آپلود شده است؟ ---------- */
$markers = [
    'modules/live.js'          => ['notifSyncStatus', 'خط وضعیت همگام‌سازی اعلان در اپ (نسخه‌ی تازه)'],
    'api/_common.php'          => ['eplakPhoneVariants', 'پاک‌سازی/همه‌ی قالب‌های شماره (نسخه‌ی تازه)'],
    'api/notifications.php'    => ['eplakPhoneVariants', 'فهرست اعلان با همه‌ی قالب‌های شماره (نسخه‌ی تازه)'],
    'shared/notify_events.php' => ['eplakNotificationInsert', 'درج تحمل‌پذیر اعلان (نسخه‌ی تازه)'],
    'shared/bootstrap.php'     => ['eplakMysqlDropNotificationsForeignKeys', 'حذف قید خارجی قدیمی (نسخه‌ی تازه)'],
    'admin/notification_view.php' => ['recipientsReady', 'صفحه‌ی گیرندگان امن‌شده (نسخه‌ی تازه)'],
    'admin/notif_diag.php'     => ['notif_diag', 'همین صفحه‌ی عیب‌یابی'],
];
foreach ($markers as $file => $info) {
    $src = @file_get_contents(__DIR__ . '/../' . $file);
    $add('فایل ' . $file, ($src === false ? '❌ پیدا نشد' : (strpos($src, $info[0]) !== false ? '✅ ' : '❌ ')) . $info[1]);
}

/* ---------- ۲) محیط ---------- */
$add('نسخه‌ی PHP', PHP_VERSION);
$add('زمان سرور', date('Y-m-d H:i:s'));
try {
    $driver = function_exists('eplakIsSqlite') && eplakIsSqlite($pdo) ? 'sqlite' : 'mysql';
} catch (Throwable $e) {
    $driver = '?';
}
$add('درایور دیتابیس', $driver);
$add('نسخه‌ی اسکیمای کد', defined('EPLAK_SCHEMA_VERSION') ? EPLAK_SCHEMA_VERSION : '?');
try {
    $add('نسخه‌ی اسکیمای ثبت‌شده در دیتابیس', (string) eplakAppSetting($pdo, 'schema_version', '(خالی)'));
} catch (Throwable $e) {
    $add('نسخه‌ی اسکیمای ثبت‌شده در دیتابیس', 'خطا: ' . $e->getMessage());
}
try {
    if (function_exists('eplakSchemaSyncReport')) {
        $rep = eplakSchemaSyncReport();
        $add('نتیجه‌ی آخرین همگام‌سازی', !empty($rep['ran'])
            ? ('اجرا شد — اضافه‌شده: ' . (implode('، ', (array) ($rep['added'] ?? [])) ?: '—')
               . ' | ناموفق: ' . (implode('، ', (array) ($rep['failed'] ?? [])) ?: '—'))
            : 'در این درخواست اجرا نشد (نسخه‌ی اسکیما یکی بود)');
    }
} catch (Throwable $e) {
}

/* ---------- ۳) ستون‌های جدول‌های مهم ---------- */
$tables = ['notifications', 'notification_sends', 'notification_reads', 'notification_deletes', 'device_tokens', 'push_log', 'users'];
foreach ($tables as $table) {
    try {
        $cols = function_exists('eplakTableColumns') ? eplakTableColumns($pdo, $table) : null;
        if ($cols === null) {
            $add('جدول ' . $table, '❌ وجود ندارد');
            continue;
        }
        $names = [];
        foreach ($cols as $col) {
            $names[] = (string) ($col['name'] ?? $col['Field'] ?? '?');
        }
        $add('جدول ' . $table, count($names) . ' ستون: ' . implode(', ', $names));
        try {
            $add('   تعداد ردیف ' . $table, (string) (int) $pdo->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn());
        } catch (Throwable $e) {
        }
    } catch (Throwable $e) {
        $add('جدول ' . $table, 'خطا: ' . $e->getMessage());
    }
}

/* ---------- ۴) قیدهای خارجی روی notifications (علت برگشت تراکنش ارسال) ---------- */
if ($driver === 'mysql') {
    try {
        $dbname = (string) $pdo->query('SELECT DATABASE()')->fetchColumn();
        $stmt = $pdo->prepare(
            'SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :tbl AND REFERENCED_TABLE_NAME IS NOT NULL'
        );
        $stmt->execute([':db' => $dbname, ':tbl' => 'notifications']);
        $fks = $stmt->fetchAll();
        $add('قیدهای خارجی notifications', $fks
            ? ('⚠️ ' . implode('، ', array_map(static fn($f) => $f['CONSTRAINT_NAME'] . ' روی ' . $f['COLUMN_NAME'] . ' → ' . $f['REFERENCED_TABLE_NAME'], $fks))
               . ' — این قیدها باید حذف شوند (تنظیمات → ترمیم ساختار دیتابیس)')
            : '✅ هیچ قید خارجی وجود ندارد');
    } catch (Throwable $e) {
        $add('قیدهای خارجی notifications', 'قابل بررسی نبود: ' . $e->getMessage());
    }
}

/* ---------- ۵) همان کوئری‌هایی که صفحه‌ی گیرندگان استفاده می‌کند ---------- */
$lastSendId = 0;
try {
    $lastSendId = (int) $pdo->query('SELECT MAX(id) FROM notification_sends')->fetchColumn();
} catch (Throwable $e) {
    $add('جدول notification_sends', 'خطا: ' . $e->getMessage());
}
$add('آخرین شناسه‌ی ارسال (notification_sends.id)', (string) $lastSendId);

$probeId = isset($_GET['id']) ? (int) $_GET['id'] : $lastSendId;

try {
    $stmt = $pdo->prepare('SELECT * FROM notifications WHERE send_id = :id ORDER BY id ASC LIMIT 50');
    $stmt->execute([':id' => $probeId]);
    $probe = $stmt->fetchAll();
    $add('کوئری صفحه‌ی گیرندگان (send_id = ' . $probeId . ')', '✅ موفق — ' . count($probe) . ' ردیف');
} catch (Throwable $e) {
    $add('کوئری صفحه‌ی گیرندگان (send_id = ' . $probeId . ')',
        '❌ خطا: ' . $e->getMessage() . '   ← این خطا باعث خطای ۵۰۰ در صفحه‌ی گیرندگان می‌شود');
}

foreach ([
    'SELECT COUNT(*) FROM notifications WHERE user_phone = \'all\' OR user_phone = \'\'' => 'شمار ردیف‌های مشترک (همه کاربران)',
    'SELECT COUNT(*) FROM notifications' => 'شمار کل اعلان‌ها',
] as $sql => $label) {
    try {
        $add($label, (string) (int) $pdo->query($sql)->fetchColumn());
    } catch (Throwable $e) {
        $add($label, 'خطا: ' . $e->getMessage());
    }
}

/* ---------- ۶) آخرین اعلان‌ها و آخرین ارسال‌ها ---------- */
try {
    $last = $pdo->query('SELECT id, user_phone, title, created_at FROM notifications ORDER BY id DESC LIMIT 8')->fetchAll();
    $lines = [];
    foreach ($last as $n) {
        $lines[] = '#' . $n['id'] . ' | ' . $n['user_phone'] . ' | ' . $n['title'] . ' | ' . $n['created_at'];
    }
    $add('آخرین ۸ اعلان', $lines ? implode("\n", $lines) : '(خالی)');
} catch (Throwable $e) {
    $add('آخرین اعلان‌ها', 'خطا: ' . $e->getMessage());
}

try {
    $rows2 = $pdo->query('SELECT id, title, target_type, recipients_count, created_at FROM notification_sends ORDER BY id DESC LIMIT 8')->fetchAll();
    $lines = [];
    foreach ($rows2 as $s2) {
        $lines[] = '#' . $s2['id'] . ' | ' . $s2['target_type'] . ' | گیرندگان: ' . $s2['recipients_count'] . ' | ' . $s2['title'] . ' | ' . $s2['created_at'];
    }
    $add('آخرین ۸ ارسال پنل', $lines ? implode("\n", $lines) : '(خالی)');
} catch (Throwable $e) {
    $add('آخرین ارسال‌های پنل', 'خطا: ' . $e->getMessage());
}

try {
    $rows3 = $pdo->query('SELECT kind, code, devices, sent, failed, outcome, error FROM push_log ORDER BY id DESC LIMIT 8')->fetchAll();
    $lines = [];
    foreach ($rows3 as $p) {
        $lines[] = 'kind=' . $p['kind'] . ' code=' . $p['code'] . ' devices=' . $p['devices']
                 . ' sent=' . $p['sent'] . ' failed=' . $p['failed'] . ' outcome=' . $p['outcome']
                 . ($p['error'] ? ' error=' . $p['error'] : '');
    }
    $add('آخرین ۸ تلاش ارسال به گوشی (push_log)', $lines ? implode("\n", $lines) : '(خالی)');
} catch (Throwable $e) {
    $add('push_log', 'خطا: ' . $e->getMessage());
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>عیب‌یابی اعلان‌ها</title>
  <link rel="stylesheet" href="assets/style.css?v=9">
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
  <style>
    body { background:#f8fafc; }
    .diag-wrap { max-width: 1100px; margin: 0 auto; padding: 24px; }
    .diag-card { background:#fff; border-radius:14px; box-shadow:0 6px 24px rgba(15,23,42,.07); padding:20px; margin-bottom:18px; }
    table { width:100%; border-collapse:collapse; }
    td { padding:9px 10px; border-bottom:1px solid #eef2f7; font-size:13.5px; vertical-align:top; }
    td:first-child { width:38%; font-weight:600; color:#334155; }
    td:last-child { direction:ltr; text-align:left; white-space:pre-wrap; word-break:break-word; font-family: Menlo, Consolas, monospace; font-size:12.5px; }
    h1 { font-size:20px; margin:0 0 6px; }
    .hint { color:#64748b; font-size:13px; margin:0 0 18px; }
    .btn { display:inline-block; background:#0ea5e9; color:#fff; border:0; border-radius:10px; padding:9px 16px; font-size:13.5px; font-weight:700; cursor:pointer; text-decoration:none; }
  </style>
</head>
<body>
<div class="diag-wrap">
  <div class="diag-card">
    <h1><i class="fas fa-bell-concierge" style="color:#0ea5e9;"></i> عیب‌یابی اعلان‌ها</h1>
    <p class="hint">
      این صفحه فقط می‌خواند و چیزی را تغییر نمی‌دهد. برای دیدن خروجی، متن جدول زیر را کپی کنید و بفرستید.
      برای بررسی یک ارسال خاص، به آدرس <code>notif_diag.php?id=19</code> بروید (به‌جای ۱۹، شماره‌ی همان ارسال).
    </p>
    <nav style="display:flex; flex-wrap:wrap; gap:6px 14px; margin:0 0 14px; font-size:13px;">
      <a href="index.php">داشبورد</a>
      <a href="reports.php">گزارش‌ها</a>
      <a href="tickets.php">تیکت‌ها</a>
      <a href="users.php">کاربران</a>
      <a href="news.php">اخبار و دانستنی‌ها</a>
      <a href="places.php">اماکن شهری</a>
      <a href="notifications.php">ارسال اعلان</a>
      <a href="export.php">خروجی اکسل</a>
      <a href="settings.php">تنظیمات</a>
      <a href="version.php">بررسی نسخه</a>
      <a href="logout.php">خروج</a>
    </nav>
    <a class="btn" href="notifications.php"><i class="fas fa-arrow-right"></i> بازگشت به «ارسال اعلان»</a>
    <a class="btn" href="settings.php#schema" style="background:#f59e0b; margin-right:8px;"><i class="fas fa-screwdriver-wrench"></i> ترمیم ساختار دیتابیس</a>
  </div>

  <div class="diag-card">
    <table>
      <?php foreach ($rows as $row): ?>
        <tr>
          <td><?= htmlspecialchars($row[0], ENT_QUOTES, 'UTF-8') ?></td>
          <td><?= htmlspecialchars($row[1], ENT_QUOTES, 'UTF-8') ?></td>
        </tr>
      <?php endforeach; ?>
    </table>
  </div>
</div>
</body>
</html>
