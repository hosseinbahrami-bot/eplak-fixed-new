<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/../shared/notification_reads.php';

$id = (int)($_GET['id'] ?? 0);
$send = $id > 0 ? getNotificationSendById($pdo, $id) : null;

if (!$send) {
    eplakRedirect('notifications.php');
}

$recipients = getNotificationRecipients($pdo, $id);

/* وضعیت «خوانده شدن» برای هر گیرنده:
   • ردیف اختصاصی هر شماره → اگر رسید خواندنی با همان شماره ثبت شده باشد یا
     ستون قدیمی read_flag روشن باشد، خوانده‌شده است.
   • ردیف مشترک «all» (برای کاربران ثبت‌نام‌نشده) → تعداد خواننده‌های آن اعلان
     از جدول notification_reads شمرده می‌شود (کلید «guest:<دستگاه>»). */
$readCount = 0;
$readCounts = eplakNotificationReadCounts($pdo, array_map(static fn($r) => (int) $r['id'], $recipients));
$recipientRows = [];
foreach ($recipients as $r) {
    $nid      = (int) $r['id'];
    $phone    = trim((string) $r['user_phone']);
    $isShared = ($phone === 'all' || $phone === '');
    $readers  = (int) ($readCounts[$nid] ?? 0);
    $isRead   = ((int) $r['read_flag'] === 1) || $readers > 0;

    if ($isRead) {
        $readCount++;
    }
    $recipientRows[] = [
        'phone'    => $isShared ? 'همه کاربران (ثبت‌نام‌نشده)' : $phone,
        'shared'   => $isShared,
        'readers'  => $readers,
        'is_read'  => $isRead,
        'created_at' => (string) $r['created_at'],
    ];
}
$recipientTotal = count($recipientRows);
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>جزئیات اعلان شماره <?= (int)$send['id'] ?></title>
  <link rel="stylesheet" href="assets/style.css?v=9">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
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
        <a class="active" href="notifications.php"><i class="fas fa-bell"></i> <span>ارسال اعلان</span></a>
        <a href="export.php"><i class="fas fa-file-excel"></i> <span>خروجی اکسل</span></a>
        <a href="settings.php"><i class="fas fa-cog"></i> <span>تنظیمات</span></a>
        <a href="version.php"><i class="fas fa-clipboard-check"></i> <span>بررسی نسخه</span></a>
        <a href="logout.php"><i class="fas fa-sign-out-alt"></i> <span>خروج</span></a>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1>
            <i class="fas fa-envelope-open-text" style="color: var(--primary-500); margin-left: 12px;"></i>
            جزئیات اعلان
          </h1>
          <p>گزارش تحویل و وضعیت خوانده شدن</p>
        </div>
        <div class="topbar-right">
          <a href="notifications.php" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
        </div>
      </header>

      <section class="meta-card" style="margin: 0 24px 20px;">
        <h3 style="margin-bottom:10px;"><?= htmlspecialchars($send['title']) ?></h3>
        <p style="line-height:1.9; color:var(--dark-600);"><?= nl2br(htmlspecialchars($send['body'])) ?></p>
        <div class="stats-mini" style="margin-top:16px;">
          <div class="stat-item">گیرندگان <strong><?= $recipientTotal ?></strong></div>
          <div class="stat-item">خوانده شده <strong><?= $readCount ?></strong></div>
          <div class="stat-item">خوانده نشده <strong><?= $recipientTotal - $readCount ?></strong></div>
          <div class="stat-item">نوع ارسال
            <strong><?= $send['target_type'] === 'all' ? 'همه کاربران' : 'کاربران انتخابی' ?></strong>
          </div>
          <div class="stat-item">زمان <strong><?= htmlspecialchars($send['created_at']) ?></strong></div>
        </div>
      </section>

      <section class="panel" style="margin: 0 24px 24px;">
        <h2><i class="fas fa-users"></i> فهرست گیرندگان</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>شماره تماس</th>
              <th>وضعیت</th>
              <th>زمان دریافت</th>
            </tr>
          </thead>
          <tbody>
            <?php if (!$recipientRows): ?>
              <tr><td colspan="4" style="text-align:center; padding:24px; color:var(--dark-400);">گیرنده‌ای ثبت نشده است.</td></tr>
            <?php else: ?>
              <?php foreach ($recipientRows as $i => $r): ?>
                <tr>
                  <td><?= $i + 1 ?></td>
                  <td dir="ltr" style="text-align:right;">
                    <?php if ($r['shared']): ?>
                      <span style="color:var(--dark-500); font-size:12px;"><?= htmlspecialchars($r['phone']) ?></span>
                    <?php else: ?>
                      <?= htmlspecialchars($r['phone']) ?>
                    <?php endif; ?>
                  </td>
                  <td>
                    <?php if ($r['is_read']): ?>
                      <span class="status-done" style="padding:3px 10px; border-radius:999px; font-size:12px;">خوانده شده</span>
                      <?php if ($r['shared'] && $r['readers'] > 0): ?>
                        <span style="font-size:11px; color:var(--dark-500);">(<?= (int) $r['readers'] ?> کاربر)</span>
                      <?php endif; ?>
                    <?php else: ?>
                      <span class="status-pending" style="padding:3px 10px; border-radius:999px; font-size:12px;">خوانده نشده</span>
                    <?php endif; ?>
                  </td>
                  <td style="font-size:12px; color:var(--dark-500);"><?= htmlspecialchars($r['created_at']) ?></td>
                </tr>
              <?php endforeach; ?>
            <?php endif; ?>
          </tbody>
        </table>
      </section>
    </main>
  </div>
</body>
</html>
