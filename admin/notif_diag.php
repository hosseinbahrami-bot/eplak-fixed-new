<?php
/* ============================================================================
   admin/notif_diag.php — عیب‌یابی اعلان‌ها (فقط خواندن؛ هیچ چیزی را تغییر نمی‌دهد)

   چرا این صفحه؟ چون «در اپ اعلان دیده نمی‌شود» یا از سرور است، یا از قالب شماره،
   یا از به‌روز نشدن فایل‌ها روی هاست — و از بیرون نمی‌شود دیتابیس هاست را دید.
   این صفحه همان چیزهایی را نشان می‌دهد که برای تشخیص لازم است:
     ۱) کدام فایل‌ها روی هاست «نسخه‌ی تازه» هستند (آیا بسته‌ی به‌روزرسانی آپلود شده؟)
     ۲) ستون‌های واقعی جدول‌های اعلان و قیدهای خارجیِ باقی‌مانده
     ۳) «ضربان اپ‌ها»: هر اپ با چه شماره‌ای فهرست اعلان‌ها را گرفته و چند ردیف گرفته
     ۴) با «?phone=09…» بررسی یک شماره‌ی مشخص: چند اعلان برای همان کاربر هست
     ۵) آخرین اعلان‌ها، آخرین ارسال‌های پنل و آخرین تلاش‌های ارسال به گوشی

   امنیت: مثل بقیه‌ی صفحه‌های پنل، نیاز به ورود مدیر دارد، هیچ داده‌ای را تغییر
   نمی‌دهد و هیچ رمز/کلیدی چاپ نمی‌کند. اجرای این صفحه هیچ خطی در دیتابیس نمی‌نویسد.
   ============================================================================ */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/../shared/app_heartbeat.php';

/* فقط خواندن: هر کوئری‌ای که این‌جا اجرا می‌شود SELECT است. */
$rows = [];
$add  = static function (string $label, $value) use (&$rows): void {
    $rows[] = [$label, is_scalar($value) || $value === null
        ? (string) $value
        : (string) json_encode($value, JSON_UNESCAPED_UNICODE)];
};

/* ---------- ۱) فایل‌های روی هاست: آیا به‌روزرسانی واقعاً آپلود شده است؟ ----------
   چرا مهم است؟ فایل‌های وبِ داخل APK با سرور کار می‌کنند؛ اگر کدِ سرور به‌روز
   نباشد، اپ فهرست را می‌گیرد ولی سرور ردیف‌های کاربر را پیدا نمی‌کند. */
$markers = [
    'shared/bootstrap.php'   => ['function eplakPhoneVariants', 'همه‌ی قالب‌های شماره‌ی موبایل (نسخه‌ی تازه)'],
    'api/_common.php'        => ["strpos(\$raw, '00')", 'پذیرش پیش‌شماره‌ی ۰۰… (نسخه‌ی تازه)'],
    'api/notifications.php'  => ['eplakPhoneVariants', 'فهرست با همه‌ی قالب‌های شماره (نسخه‌ی تازه)'],
    'shared/notify_events.php' => ['eplakNotifyExistsForCode', 'درج تحمل‌پذیر + پرهیز از اعلان تکراری (نسخه‌ی تازه)'],
    'api/reports.php'        => ['eplakNotifyExistsForCode', 'اعلان «ثبت درخواست» در مسیر تکراری (نسخه‌ی تازه)'],
    'modules/live.js'        => ['function fetchWithTimeout', 'مهلت درخواست + دلیل قایل‌مشاهده برای فهرست خالی'],
    'modules/live.js#2'      => ['eplakNotificationStatus', 'وضعیت خوانا برای صفحه‌ی اعلان‌ها و عیب‌یابی'],
    'modules/dashboard.js'   => ['function notifEmptyReason', 'نمایش دلیلِ خالی بودن فهرست داخل خود اپ'],
    'core/router.js'         => ['refreshNotificationsNow', 'تازه‌سازی فهرست هنگام باز شدن صفحه'],
    'shared/app_heartbeat.php' => ['function eplakHeartbeatRecord', '«ضربان اپ‌ها» (آخرین دریافت فهرست)'],
    'admin/notif_diag.php'   => ['notif_diag', 'همین صفحه‌ی عیب‌یابی'],
];
foreach ($markers as $file => $info) {
    $path = __DIR__ . '/../' . str_replace('#2', '', $file);
    $src  = @file_get_contents($path);
    $add('فایل ' . str_replace('#2', '', $file),
        ($src === false ? '❌ پیدا نشد' : (strpos($src, $info[0]) !== false ? '✅ ' : '❌ ')) . $info[1]);
}

/* ---------- ۲) محیط ---------- */
$add('نسخه‌ی PHP', PHP_VERSION);
$add('زمان سرور', date('Y-m-d H:i:s'));
$driver = '?';
try {
    $driver = (function_exists('eplakIsSqlite') && eplakIsSqlite($pdo)) ? 'sqlite' : 'mysql';
} catch (Throwable $e) {
}
$add('درایور دیتابیس', $driver);
try {
    $add('ترمیم خودکار ساختار (آخرین اجرا)', function_exists('eplakSchemaSyncReport')
        ? json_encode(eplakSchemaSyncReport(), JSON_UNESCAPED_UNICODE)
        : '—');
} catch (Throwable $e) {
}

/* ---------- ۳) ستون‌های جدول‌های مهم ---------- */
foreach (['notifications', 'notification_sends', 'notification_reads', 'device_tokens', 'push_log', 'users', 'app_settings'] as $table) {
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
        $count = '?';
        try {
            $count = (string) (int) $pdo->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn();
        } catch (Throwable $e) {
        }
        $add('جدول ' . $table, $count . ' ردیف · ' . count($names) . ' ستون: ' . implode(', ', $names));
    } catch (Throwable $e) {
        $add('جدول ' . $table, 'خطا: ' . $e->getMessage());
    }
}

/* ---------- ۴) قیدهای خارجی روی notifications (علتِ بی‌صدا رد شدن درج اعلان) ---------- */
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
            ? ('⚠️ ' . implode('، ', array_map(static function ($f) {
                return $f['CONSTRAINT_NAME'] . ' روی ' . $f['COLUMN_NAME'] . ' → ' . $f['REFERENCED_TABLE_NAME'];
            }, $fks)) . ' — باید حذف شوند (تنظیمات ← ترمیم ساختار دیتابیس)')
            : '✅ هیچ قید خارجی وجود ندارد');
    } catch (Throwable $e) {
        $add('قیدهای خارجی notifications', 'قابل بررسی نبود: ' . $e->getMessage());
    }
}

/* ---------- ۵) «ضربان اپ‌ها»: اپ واقعاً چه درخواستی فرستاده و چه گرفته؟ ----------
   این مهم‌ترین بخش برای تشخیص «در APK هیچ اعلانی دیده نمی‌شود» است:
     • ردیفی برای اپ اندروید نیست ⇒ اپ به سرور نمی‌رسد (نسخه‌ی قدیمی/آفلاین/فایروال).
     • ردیف هست ولی count=0 ⇒ سرور برای آن شماره ردیفی پیدا نکرده (قالب شماره یا نبود اعلان).
     • ردیف هست و count>0 ⇒ سرور ردیف‌ها را فرستاده؛ مشکل در نمایش سمت اپ است. */
$heartbeats = function_exists('eplakHeartbeatList') ? eplakHeartbeatList($pdo, 25) : [];
$add('ضربان اپ‌ها', $heartbeats ? ('⚠️ ' . count($heartbeats) . ' ردیف — در جدول پایین صفحه با جزئیات آمده است') : 'هیچ اپی (با نسخه‌ی تازه) فهرست اعلان‌ها را نگرفته است');

/* ---------- ۶) بررسی یک شماره‌ی مشخص: ?phone=0912… ---------- */
$probePhone = trim((string) ($_GET['phone'] ?? ''));
if ($probePhone !== '' && function_exists('eplakPhoneVariants')) {
    $variants = eplakPhoneVariants($probePhone);
    $add('شماره‌ی بررسی‌شده', $probePhone . ' → ' . (function_exists('eplakPhoneKey') ? eplakPhoneKey($probePhone) : '?'));
    $add('همه‌ی قالب‌هایی که جست‌وجو می‌شوند', implode(' ، ', $variants));
    $names = [];
    $params = [];
    foreach ($variants as $i => $variant) {
        $names[] = ':p' . $i;
        $params[':p' . $i] = $variant;
    }
    try {
        $sql = 'SELECT COUNT(*) FROM notifications WHERE user_phone IN (' . implode(', ', $names) . ')';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $add('اعلان‌های همین کاربر (با همه‌ی قالب‌ها)', (string) (int) $stmt->fetchColumn());
    } catch (Throwable $e) {
        $add('اعلان‌های همین کاربر', 'خطا: ' . $e->getMessage());
    }
    foreach ($variants as $i => $variant) {
        try {
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_phone = :p');
            $stmt->execute([':p' => $variant]);
            $add('   ردیف با قالب ' . $variant, (string) (int) $stmt->fetchColumn());
        } catch (Throwable $e) {
        }
    }
    try {
        $stmt = $pdo->prepare('SELECT id, user_phone, title, created_at FROM notifications WHERE user_phone IN ('
            . implode(', ', $names) . ') ORDER BY id DESC LIMIT 8');
        $stmt->execute($params);
        $lines = [];
        foreach ($stmt->fetchAll() as $n) {
            $lines[] = '#' . $n['id'] . ' | ' . $n['user_phone'] . ' | ' . $n['title'] . ' | ' . $n['created_at'];
        }
        $add('آخرین اعلان‌های همین کاربر', $lines ? implode("\n", $lines) : '(هیچ ردیفی نیست)');
    } catch (Throwable $e) {
        $add('آخرین اعلان‌های همین کاربر', 'خطا: ' . $e->getMessage());
    }
    /* گوشی ثبت‌شده‌ی همین شماره (برای اعلان در حالت بسته بودن اپ) */
    try {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM device_tokens WHERE user_phone IN (' . implode(', ', $names) . ')');
        $stmt->execute($params);
        $add('گوشی‌های ثبت‌شده‌ی این شماره', (string) (int) $stmt->fetchColumn());
    } catch (Throwable $e) {
        $add('گوشی‌های ثبت‌شده‌ی این شماره', 'قابل بررسی نبود: ' . $e->getMessage());
    }
}

/* ---------- ۷) آخرین اعلان‌ها / ارسال‌ها / تلاش‌های پوش ---------- */
try {
    $lines = [];
    foreach ($pdo->query('SELECT id, user_phone, title, created_at FROM notifications ORDER BY id DESC LIMIT 8')->fetchAll() as $n) {
        $lines[] = '#' . $n['id'] . ' | ' . $n['user_phone'] . ' | ' . $n['title'] . ' | ' . $n['created_at'];
    }
    $add('آخرین ۸ اعلان', $lines ? implode("\n", $lines) : '(خالی)');
} catch (Throwable $e) {
    $add('آخرین اعلان‌ها', 'خطا: ' . $e->getMessage());
}
try {
    $lines = [];
    foreach ($pdo->query('SELECT id, title, target_type, recipients_count, created_at FROM notification_sends ORDER BY id DESC LIMIT 8')->fetchAll() as $s) {
        $lines[] = '#' . $s['id'] . ' | ' . $s['target_type'] . ' | گیرندگان: ' . $s['recipients_count'] . ' | ' . $s['title'] . ' | ' . $s['created_at'];
    }
    $add('آخرین ۸ ارسال پنل', $lines ? implode("\n", $lines) : '(خالی)');
} catch (Throwable $e) {
    $add('آخرین ارسال‌های پنل', 'خطا: ' . $e->getMessage());
}
try {
    $lines = [];
    foreach ($pdo->query('SELECT kind, code, devices, sent, failed, outcome, error FROM push_log ORDER BY id DESC LIMIT 8')->fetchAll() as $p) {
        $lines[] = 'kind=' . $p['kind'] . ' code=' . $p['code'] . ' devices=' . $p['devices']
                 . ' sent=' . $p['sent'] . ' failed=' . $p['failed'] . ' outcome=' . $p['outcome']
                 . ($p['error'] ? ' error=' . $p['error'] : '');
    }
    $add('آخرین ۸ تلاش ارسال به گوشی (push_log)', $lines ? implode("\n", $lines) : '(خالی)');
} catch (Throwable $e) {
    $add('push_log', 'خطا: ' . $e->getMessage());
}

$h = static fn($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>عیب‌یابی اعلان‌ها — ای‌پلاک</title>
  <style>
    body { font-family: Vazirmatn, Tahoma, sans-serif; background:#f6f8fb; color:#0f172a; margin:0; }
    .wrap { max-width:1080px; margin:0 auto; padding:20px; }
    .card { background:#fff; border-radius:14px; box-shadow:0 6px 24px rgba(15,23,42,.07); padding:18px; margin-bottom:16px; }
    h1 { font-size:19px; margin:0 0 6px; }
    .hint { color:#64748b; font-size:13px; margin:0 0 14px; line-height:1.9; }
    nav { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:13px; margin:0 0 12px; }
    table { width:100%; border-collapse:collapse; }
    td { padding:8px 10px; border-bottom:1px solid #eef2f7; font-size:13px; vertical-align:top; }
    td:first-child { width:34%; font-weight:600; color:#334155; }
    td:last-child { white-space:pre-wrap; word-break:break-word; font-family:Menlo,Consolas,monospace; font-size:12.5px; }
    .btn { display:inline-block; background:#0ea5e9; color:#fff; border:0; border-radius:10px; padding:8px 14px; font-size:13px; font-weight:700; cursor:pointer; text-decoration:none; }
    form { display:flex; gap:8px; align-items:center; margin:0 0 10px; }
    input[type=text] { flex:0 0 220px; padding:8px 10px; border:1px solid #cbd5e1; border-radius:10px; font-family:inherit; direction:ltr; }
    .ok { color:#0f766e; } .bad { color:#b91c1c; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>🔔 عیب‌یابی اعلان‌ها</h1>
    <p class="hint">
      این صفحه فقط می‌خواند و هیچ چیزی را تغییر نمی‌دهد. متن جدول‌ها را کپی کنید و بفرستید.
      برای بررسی اعلان‌های یک شماره‌ی مشخص، در آدرس این صفحه <code dir="ltr">?phone=09121112233</code> را اضافه کنید.
    </p>
    <nav>
      <a href="index.php">داشبورد</a>
      <a href="reports.php">گزارش‌ها</a>
      <a href="tickets.php">تیکت‌ها</a>
      <a href="users.php">کاربران</a>
      <a href="notifications.php">ارسال اعلان</a>
      <a href="places.php">اماکن شهری</a>
      <a href="settings.php">تنظیمات</a>
      <a href="logout.php">خروج</a>
    </nav>
    <form method="get" action="notif_diag.php">
      <input type="text" name="phone" placeholder="09121112233" value="<?= $h($probePhone) ?>">
      <button class="btn" type="submit">بررسی این شماره</button>
    </form>
    <a class="btn" href="notifications.php">بازگشت به «ارسال اعلان»</a>
    <a class="btn" style="background:#f59e0b; margin-right:8px;" href="settings.php">تنظیمات (ترمیم ساختار دیتابیس)</a>
  </div>

  <div class="card">
    <h1>وضعیت سرور</h1>
    <table>
      <?php foreach ($rows as $row): ?>
        <tr>
          <td><?= $h($row[0]) ?></td>
          <td><?= $h($row[1]) ?></td>
        </tr>
      <?php endforeach; ?>
    </table>
  </div>

  <?php if ($heartbeats): ?>
  <div class="card">
    <h1>ضربان اپ‌ها — آخرین دریافت فهرست اعلان‌ها</h1>
    <p class="hint">
      «کاربر» = شماره‌ای که خود اپ فرستاده · «اعلان‌ها» = تعداد ردیفی که سرور برگردانده ·
      «پاسخ قبلی» = نتیجه‌ی درخواست قبلی از نگاه اپ (<code dir="ltr">ok:N</code> سالم،
      <code dir="ltr">http:S</code> خطای سرور، <code dir="ltr">net:…</code> نرسیدن به سرور).
      اگر ردیفی برای اپ اندروید نیست، اپ به سرور نمی‌رسد؛ اگر هست ولی «اعلان‌ها» صفر است،
      برای آن شماره ردیفی در دیتابیس پیدا نشده است.
    </p>
    <table>
      <thead><tr><th>اپ</th><th>کاربر</th><th>آخرین درخواست</th><th>اعلان‌ها</th><th>نسخه</th><th>پاسخ قبلی</th></tr></thead>
      <tbody>
      <?php foreach ($heartbeats as $hb): ?>
        <tr>
          <td><?= $h(eplakHeartbeatPlatformLabel($hb['platform'])) ?></td>
          <td dir="ltr" style="text-align:right;"><?= $h($hb['phone'] !== '' ? $hb['phone'] : ('مهمان (' . mb_substr($hb['device'], 0, 10, 'UTF-8') . '…)')) ?></td>
          <td><?= $h($hb['age_text']) ?></td>
          <td><strong><?= (int) $hb['count'] ?></strong> (نخوانده: <?= (int) $hb['unread'] ?>)</td>
          <td dir="ltr" style="text-align:right;"><?= $h($hb['v']) ?></td>
          <td dir="ltr" style="text-align:right;"><?= $h($hb['prev']) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php endif; ?>
</div>
</body>
</html>
