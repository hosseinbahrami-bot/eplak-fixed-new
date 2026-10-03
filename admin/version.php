<?php
/* ============================================================================
   بررسی نسخه و سلامت نصب — پنل ادمین
   ----------------------------------------------------------------------------
   این صفحه فقط «می‌خواند» و هیچ چیزی را تغییر نمی‌دهد. با باز کردن آن می‌فهمید
   که بسته‌ی به‌روزرسانی درست روی هاست باز شده است یا نه:
     • نسخه‌ی کد و نسخه‌ی ساختار دیتابیس
     • بودن فایل‌های تازه‌ی نسخه (مثل موتور فایربیس)
     • وضعیت اعلان‌ها (فایربیس و اعلان مرورگر)
     • تعداد دستگاه‌های ثبت‌شده و آخرین اعلان‌ها
   ============================================================================ */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$schemaStored  = (string) eplakAppSetting($pdo, 'schema_version', '');
$schemaCurrent = defined('EPLAK_SCHEMA_VERSION') ? EPLAK_SCHEMA_VERSION : '?';
$schemaOk      = $schemaStored === $schemaCurrent;

/* فایل‌هایی که فقط در نسخه‌ی جدید وجود دارند */
$fileChecks = [
    'shared/fcm.php'                  => 'موتور اعلان فایربیس (سرور)',
    'shared/notification_reads.php'   => 'ثبت «خوانده شدن» اعلان برای هر کاربر',
    'admin/notification_view.php'     => 'صفحه‌ی گیرندگان و وضعیت خواندن',
    'admin/version.php'               => 'همین صفحه‌ی بررسی نسخه',
    'modules/live.js'                 => 'کد اعلان‌های خود اپ',
    'core/upload-progress.js'         => 'نوار پیشرفت آپلود عکس و فیلم',
    'api/tiles.php'                   => 'پراکسی نقشه‌ی گزارش',
    'core/places-data.js'             => 'فهرست اماکن «نقشه و اماکن شهری»',
    'modules/city-map.js'             => 'صفحه‌ی «نقشه و اماکن شهری» در اپ',
    'admin/places.php'                => 'مدیریت اماکن شهری از پنل',
    'api/places.php'                  => 'اماکن شهری برای اپ (اصلاح‌های ادمین)',
    'shared/places_store.php'         => 'منطق و جدول اماکن شهری',
];
$files = [];
foreach ($fileChecks as $rel => $label) {
    $files[] = ['file' => $rel, 'label' => $label, 'ok' => is_file(__DIR__ . '/../' . $rel)];
}

/* نشانه‌های نسخه‌ی جدید داخل کد سایت */
$liveJs = @file_get_contents(__DIR__ . '/../modules/live.js');
$markers = [
    'registerAppDevice'              => 'ثبت خودکار گوشی در سرور',
    'register_fcm'                   => 'ارسال توکن فایربیس به سرور',
    'pushCapability'                 => 'تشخیص نوع اعلان دستگاه',
    'renderDeviceNotice'             => 'پیام وضعیت اعلان به کاربر',
];
$codeMarkers = [];
foreach ($markers as $needle => $label) {
    $codeMarkers[] = ['label' => $label, 'ok' => is_string($liveJs) && strpos($liveJs, $needle) !== false];
}

/* نشانه‌های سمت سرور: بدون این‌ها گوشی‌ها ثبت نمی‌شوند و اعلان‌ها به گوشی نمی‌رسد */
$pushApi    = @file_get_contents(__DIR__ . '/../api/push.php');
$commonApi  = @file_get_contents(__DIR__ . '/../api/_common.php');
$serverMarkers = [
    ['label' => 'ثبت گوشی از اپ اندروید (پذیرش فرم ساده در api/push.php)',
     'ok'    => is_string($pushApi) && strpos($pushApi, 'eplakRequestInput') !== false
                && is_string($commonApi) && strpos($commonApi, 'function eplakRequestInput') !== false],
    ['label' => 'دفتر ارسال اعلان گوشی (push_log)',
     'ok'    => (function () use ($pdo): bool { try { $pdo->query('SELECT 1 FROM push_log LIMIT 1'); return true; } catch (Throwable $e) { return false; } })()],
];
/* جدول اماکن شهری در اولین استفاده ساخته می‌شود؛ باز شدن همین صفحه هم آن را می‌سازد و نتیجه را نشان می‌دهد */
if (is_file(__DIR__ . '/../shared/places_store.php')) {
    require_once __DIR__ . '/../shared/places_store.php';
}
$serverMarkers[] = ['label' => 'جدول اماکن شهری (city_places) ساخته شده و قابل استفاده است',
    'ok' => function_exists('eplakPlacesEnsureTable') && eplakPlacesEnsureTable($pdo)];

/* وضعیت اعلان‌ها */
require_once __DIR__ . '/../shared/fcm.php';
require_once __DIR__ . '/../shared/webpush.php';

$fcm    = eplakFcmConfig($pdo);
$vapid  = eplakVapidKeys($pdo, false);
$counts = ['tokens' => 0, 'push' => 0];
try { $counts['tokens'] = eplakFcmCount($pdo); } catch (Throwable $e) {}
try { $counts['push'] = (int) $pdo->query('SELECT COUNT(*) FROM push_subscriptions')->fetchColumn(); } catch (Throwable $e) {}

$recentDevices = [];
try {
    $recentDevices = $pdo->query('SELECT user_phone, platform, is_active, last_error, last_seen_at FROM device_tokens ORDER BY id DESC LIMIT 5')->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {}
$pushLogRows = eplakPushLogRecent($pdo, [], 6);
$pushOutcomeLabels = [
    'sent' => ['ارسال شد', 'ok'], 'partial' => ['بخشی رسید', 'warn'], 'failed' => ['گوگل نپذیرفت', 'bad'],
    'no_device' => ['گوشی ثبت نیست', 'warn'], 'fcm_off' => ['کلید فایربیس نیست', 'warn'],
    'google_error' => ['عدم دسترسی به گوگل', 'bad'], 'sent_web' => ['ارسال شد (مرورگر)', 'ok'],
];

$lastSends = [];
try {
    $lastSends = $pdo->query('SELECT id, title, target_type, created_at, fcm_sent, fcm_failed FROM notification_sends ORDER BY id DESC LIMIT 5')->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {}

$driver = 'MySQL / MariaDB';
try { if (eplakIsSqlite($pdo)) { $driver = 'SQLite (حالت توسعه)'; } } catch (Throwable $e) {}

/* رنگ و برچسب وضعیت */
function vBadge(bool $ok, string $good = 'درست', string $bad = 'ناقص'): string {
    return $ok
        ? '<span class="pill pill-ok"><i class="fas fa-check"></i> ' . $good . '</span>'
        : '<span class="pill pill-bad"><i class="fas fa-times"></i> ' . $bad . '</span>';
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>بررسی نسخه و سلامت</title>
  <link rel="stylesheet" href="assets/style.css?v=9">
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
  <style>
    .v-grid { display: grid; gap: 18px; }
    .v-card { border: 1px solid var(--dark-200); border-radius: 14px; padding: 16px 18px; background: #fff; }
    .v-card h3 { margin: 0 0 12px; font-size: 16px; display: flex; align-items: center; gap: 8px; }
    .v-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
             padding: 9px 0; border-bottom: 1px dashed var(--dark-200); font-size: 14px; }
    .v-row:last-child { border-bottom: 0; }
    .v-key { color: var(--dark-600); }
    .v-val { font-weight: 600; }
    .pill { display:inline-flex; align-items:center; gap:6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .pill-ok { background: #ecfdf5; color: #047857; }
    .pill-bad { background: #fef2f2; color: #b91c1c; }
    .pill-warn { background: #fffbeb; color: #b45309; }
    .mono { direction: ltr; font-family: monospace; font-size: 12px; }
    .v-big { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .v-stat { border: 1px solid var(--dark-200); border-radius: 12px; padding: 12px; text-align: center; background: var(--dark-50); }
    .v-stat b { display: block; font-size: 22px; margin-bottom: 4px; }
    .v-note { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 12px 14px; font-size: 13px; line-height: 2; }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <img class="logo-light" src="assets/img/logo.png" alt="ای‌پلاک">
        <img class="logo-dark" src="assets/img/logo-light.png" alt="ای‌پلاک">
      </div>
      <nav>
        <a href="index.php"><i class="fas fa-chart-pie"></i> <span>داشبورد</span></a>
        <a href="reports.php"><i class="fas fa-flag"></i> <span>گزارش‌ها</span></a>
        <a href="tickets.php"><i class="fas fa-ticket-alt"></i> <span>تیکت‌ها</span></a>
        <a href="users.php"><i class="fas fa-users"></i> <span>کاربران</span></a>
        <a href="departments.php"><i class="fas fa-sitemap"></i> <span>واحدها</span></a>
        <a href="news.php"><i class="fas fa-newspaper"></i> <span>اخبار و دانستنی‌ها</span></a>
        <a href="places.php"><i class="fas fa-map-location-dot"></i> <span>اماکن شهری</span></a>
        <a href="notifications.php"><i class="fas fa-bell"></i> <span>ارسال اعلان</span></a>
        <a href="export.php"><i class="fas fa-file-excel"></i> <span>خروجی اکسل</span></a>
        <a href="settings.php"><i class="fas fa-cog"></i> <span>تنظیمات</span></a>
        <a class="active" href="version.php"><i class="fas fa-clipboard-check"></i> <span>بررسی نسخه</span></a>
        <a href="logout.php"><i class="fas fa-sign-out-alt"></i> <span>خروج</span></a>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1><i class="fas fa-clipboard-check" style="color: var(--primary-500); margin-left: 12px;"></i> بررسی نسخه و سلامت نصب</h1>
          <p>آیا آخرین تغییرات روی سایت اعمال شده است؟</p>
        </div>
      </header>

      <div class="v-grid">
        <div class="v-card">
          <h3><i class="fas fa-code-branch"></i> نسخه‌ی نصب‌شده</h3>
          <div class="v-row">
            <span class="v-key">نسخه‌ی کد روی هاست</span>
            <span class="v-val mono"><?= htmlspecialchars($schemaCurrent) ?></span>
          </div>
          <div class="v-row">
            <span class="v-key">نسخه‌ی ثبت‌شده در دیتابیس</span>
            <span class="v-val mono"><?= htmlspecialchars($schemaStored !== '' ? $schemaStored : '—') ?></span>
          </div>
          <div class="v-row">
            <span class="v-key">هم‌خوانی کد و دیتابیس</span>
            <span class="v-val"><?= vBadge($schemaOk, 'به‌روز است', 'نیاز به بازسازی دارد') ?></span>
          </div>
          <div class="v-row">
            <span class="v-key">نوع دیتابیس</span>
            <span class="v-val"><?= htmlspecialchars($driver) ?></span>
          </div>
          <div class="v-row">
            <span class="v-key">نسخه‌ی PHP</span>
            <span class="v-val mono"><?= htmlspecialchars(PHP_VERSION) ?></span>
          </div>
        </div>

        <div class="v-card">
          <h3><i class="fas fa-file-code"></i> فایل‌های نسخه‌ی جدید</h3>
          <?php foreach ($files as $f): ?>
          <div class="v-row">
            <span class="v-key"><?= htmlspecialchars($f['label']) ?> <span class="mono">(<?= htmlspecialchars($f['file']) ?>)</span></span>
            <span class="v-val"><?= vBadge($f['ok'], 'هست', 'نیست') ?></span>
          </div>
          <?php endforeach; ?>
        </div>

        <div class="v-card">
          <h3><i class="fas fa-code"></i> نشانه‌های نسخه‌ی جدید در کد سایت</h3>
          <?php foreach (array_merge($codeMarkers, $serverMarkers) as $m): ?>
          <div class="v-row">
            <span class="v-key"><?= htmlspecialchars($m['label']) ?></span>
            <span class="v-val"><?= vBadge($m['ok'], 'موجود', 'موجود نیست') ?></span>
          </div>
          <?php endforeach; ?>
        </div>

        <div class="v-card">
          <h3><i class="fas fa-bell"></i> وضعیت اعلان‌ها</h3>
          <div class="v-big" style="margin-bottom: 12px;">
            <div class="v-stat"><b><?= number_format($counts['tokens']) ?></b> گوشی ثبت‌شده برای اپ</div>
            <div class="v-stat"><b><?= number_format($counts['push']) ?></b> مرورگر ثبت‌شده</div>
          </div>
          <div class="v-row">
            <span class="v-key">فایربیس (اعلان وقتی اپ بسته است)</span>
            <span class="v-val">
              <?php if ($fcm['ready']): ?>
                <?= vBadge(true, 'آماده') ?>
              <?php else: ?>
                <span class="pill pill-warn"><i class="fas fa-exclamation-triangle"></i> تنظیم نشده</span>
              <?php endif; ?>
            </span>
          </div>
          <?php if (!$fcm['ready'] && !empty($fcm['error'])): ?>
          <div class="v-note">
            برای فعال‌سازی: پروژه‌ی رایگان Firebase بسازید → `google-services.json` را در
            <span class="mono">android-app/app/</span> بگذارید و پوش کنید → کلید سرویس را در
            <a href="settings.php">تنظیمات → اعلان فایربیس</a> بچسبانید.
          </div>
          <?php endif; ?>
          <div class="v-row">
            <span class="v-key">کلید پروژه‌ی فایربیس</span>
            <span class="v-val mono"><?= htmlspecialchars($fcm['project_id'] !== '' ? $fcm['project_id'] : '—') ?></span>
          </div>
          <div class="v-row">
            <span class="v-key">اعلان مرورگر (Web Push)</span>
            <span class="v-val"><?= vBadge((bool) $vapid['ready'], 'آماده', 'تنظیم نشده') ?></span>
          </div>
          <?php if ($counts['tokens'] === 0): ?>
          <div class="v-note" data-testid="no-devices">
            ⚠️ هیچ گوشی‌ای ثبت نشده است؛ تا وقتی صفر است، اعلان تغییر وضعیت فقط داخل اپ دیده می‌شود و روی گوشی
            نمی‌نشیند. کاربر باید اپ (آخرین نسخه) را باز کند و با شماره‌اش وارد شود تا گوشی‌اش ثبت شود.
          </div>
          <?php endif; ?>
          <div style="margin-top: 10px;">
            <a href="settings.php#fcm-section" class="btn btn-outline"><i class="fas fa-stethoscope"></i> بررسی اتصال سرور به گوگل و ارسال آزمایشی</a>
          </div>
          <?php if (!empty($recentDevices)): ?>
          <div style="margin-top: 14px;">
            <div class="v-key" style="margin-bottom: 8px;">آخرین گوشی‌های ثبت‌شده</div>
            <table style="width:100%; font-size:13px; border-collapse: collapse;">
              <thead><tr style="text-align:right; color: var(--dark-500);"><th style="padding:6px 4px;">کاربر</th><th>وضعیت</th><th>آخرین ثبت</th></tr></thead>
              <tbody>
                <?php foreach ($recentDevices as $d): ?>
                <tr style="border-top: 1px dashed var(--dark-200);">
                  <td style="padding:6px 4px;" class="mono"><?= htmlspecialchars((string) $d['user_phone'] !== '' ? (string) $d['user_phone'] : 'مهمان') ?></td>
                  <td><?= (int) $d['is_active'] === 1 ? vBadge(true, 'فعال') : vBadge(false, '', 'غیرفعال') ?></td>
                  <td class="mono"><?= htmlspecialchars((string) ($d['last_seen_at'] ?? '')) ?></td>
                </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
          <?php endif; ?>
          <?php if (!empty($pushLogRows)): ?>
          <div style="margin-top: 14px;">
            <div class="v-key" style="margin-bottom: 8px;">آخرین ارسال‌ها به گوشی کاربران</div>
            <table style="width:100%; font-size:13px; border-collapse: collapse;">
              <thead><tr style="text-align:right; color: var(--dark-500);"><th style="padding:6px 4px;">کاربر</th><th>گزارش</th><th>نتیجه</th></tr></thead>
              <tbody>
                <?php foreach ($pushLogRows as $r): ?>
                <?php $lab = $pushOutcomeLabels[(string) $r['outcome']] ?? [(string) $r['outcome'], 'warn']; ?>
                <tr style="border-top: 1px dashed var(--dark-200);">
                  <td style="padding:6px 4px;" class="mono"><?= htmlspecialchars((string) $r['user_phone']) ?></td>
                  <td class="mono"><?= htmlspecialchars((string) ($r['code'] ?? '') !== '' ? (string) $r['code'] : (string) $r['kind']) ?></td>
                  <td><span class="pill pill-<?= htmlspecialchars($lab[1]) ?>"><?= htmlspecialchars($lab[0]) ?></span></td>
                </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
          <?php endif; ?>
          <?php if (!empty($lastSends)): ?>
          <div style="margin-top: 14px;">
            <div class="v-key" style="margin-bottom: 8px;">آخرین اعلان‌های ارسالی</div>
            <table style="width:100%; font-size:13px; border-collapse: collapse;">
              <thead>
                <tr style="text-align:right; color: var(--dark-500);">
                  <th style="padding:6px 4px;">عنوان</th>
                  <th style="padding:6px 4px;">تاریخ</th>
                  <th style="padding:6px 4px;">اپ (فایربیس)</th>
                </tr>
              </thead>
              <tbody>
                <?php foreach ($lastSends as $s): ?>
                <tr style="border-top: 1px dashed var(--dark-200);">
                  <td style="padding:6px 4px;">
                    <a href="notification_view.php?id=<?= (int) $s['id'] ?>"><?= htmlspecialchars((string) $s['title']) ?></a>
                  </td>
                  <td style="padding:6px 4px;" class="mono"><?= htmlspecialchars((string) $s['created_at']) ?></td>
                  <td style="padding:6px 4px;">
                    <?php $sent = (int) ($s['fcm_sent'] ?? 0); $failed = (int) ($s['fcm_failed'] ?? 0); ?>
                    <?php if ($sent + $failed === 0): ?>
                      <span class="pill pill-warn">بدون دستگاه</span>
                    <?php else: ?>
                      <?= vBadge($failed === 0, "ارسال به $sent دستگاه", "$failed ناموفق از " . ($sent + $failed)) ?>
                    <?php endif; ?>
                  </td>
                </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
          <?php endif; ?>
        </div>

        <div class="v-card">
          <h3><i class="fas fa-circle-info"></i> چطور این صفحه را بخوانم؟</h3>
          <div class="v-note">
            اگر همه‌ی نشانه‌ها «درست/هست» بودند، یعنی آخرین تغییرات روی سایت اعمال شده است.
            اگر «فایل‌های نسخه‌ی جدید» چیزی «نیست» نشان داد، یعنی فایل
            <span class="mono">eplak-fixed-update.zip</span> روی هاست باز نشده است؛
            راهنمای نصب: <span class="mono">docs/DEPLOY_UPDATE_FA.md</span>.
          </div>
        </div>
      </div>
    </main>
  </div>
</body>
</html>
