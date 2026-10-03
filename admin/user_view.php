<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$id = (int)($_GET['id'] ?? 0);
$user = getUserById($pdo, $id);

if (!$user) {
    eplakRedirect('users.php');
    exit;
}

$reports = getReportsByUser($pdo, $user['phone']);

// بررسی وجود تابع و دریافت تیکت‌ها
$tickets = [];
if (function_exists('getTicketsByUser')) {
    $tickets = getTicketsByUser($pdo, $user['phone']);
} else {
    // اگر تابع وجود نداشت، با کوئری مستقیم دریافت می‌کنیم
    $stmt = $pdo->prepare('SELECT * FROM tickets WHERE user_phone = :phone ORDER BY created_at DESC');
    $stmt->execute([':phone' => $user['phone']]);
    $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);
}

// آمار گزارش‌ها
$pending = count(array_filter($reports, fn($r) => normalizeStatusValue($r['status']) === 'pending'));
$inProgress = count(array_filter($reports, fn($r) => normalizeStatusValue($r['status']) === 'in_progress'));
$done = count(array_filter($reports, fn($r) => normalizeStatusValue($r['status']) === 'done'));

// آمار تیکت‌ها
$ticketPending = count(array_filter($tickets, fn($t) => normalizeStatusValue($t['status'] ?? 'pending') === 'pending'));
$ticketInProgress = count(array_filter($tickets, fn($t) => normalizeStatusValue($t['status'] ?? 'pending') === 'in_progress'));
$ticketDone = count(array_filter($tickets, fn($t) => normalizeStatusValue($t['status'] ?? 'pending') === 'done'));
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>پروفایل کاربر</title>
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
        <a class="active" href="users.php"><i class="fas fa-users"></i> <span>کاربران</span></a>
        <a href="departments.php"><i class="fas fa-sitemap"></i> <span>واحدها</span></a>
                <a href="news.php"><i class="fas fa-newspaper"></i> <span>اخبار و دانستنی‌ها</span></a>
                <a href="places.php"><i class="fas fa-map-location-dot"></i> <span>اماکن شهری</span></a>
        <a href="notifications.php"><i class="fas fa-bell"></i> <span>ارسال اعلان</span></a>
<a href="export.php"><i class="fas fa-file-excel"></i> <span>خروجی اکسل</span></a>
<a href="settings.php"><i class="fas fa-cog"></i> <span>تنظیمات</span></a>
<a href="version.php"><i class="fas fa-clipboard-check"></i> <span>بررسی نسخه</span></a>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1>
            <i class="fas fa-user-circle" style="color: var(--primary-500); margin-left: 12px;"></i>
            پروفایل کاربر
          </h1>
          <p>نمایش جزئیات، گزارش‌ها و تیکت‌های مرتبط</p>
        </div>
        <div class="topbar-right">
          <a href="users.php" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
          <a href="user_edit.php?id=<?= (int)$user['id'] ?>" class="btn btn-warning">
            <i class="fas fa-pen"></i> ویرایش
          </a>
          <a href="report_add.php?user_phone=<?= urlencode($user['phone']) ?>" class="btn btn-primary">
            <i class="fas fa-plus"></i> گزارش جدید
          </a>
        </div>
      </header>

      <!-- ===== کارت پروفایل کاربر ===== -->
      <div class="user-profile-card">
        <div class="user-profile-avatar">
          <?= htmlspecialchars(mb_substr($user['name'] ?? 'U', 0, 1)) ?>
        </div>
        <div class="user-profile-info">
          <h3><?= htmlspecialchars($user['name'] ?? 'کاربر ناشناس') ?></h3>
          <div class="user-profile-details">
            <span><i class="fas fa-phone"></i> <?= htmlspecialchars($user['phone']) ?></span>
            <?php if (!empty($user['nid'])): ?>
              <span><i class="fas fa-id-card"></i> <?= htmlspecialchars($user['nid']) ?></span>
            <?php endif; ?>
            <?php if (!empty($user['email'])): ?>
              <span><i class="fas fa-envelope"></i> <?= htmlspecialchars($user['email']) ?></span>
            <?php endif; ?>
            <?php if (!empty($user['address'])): ?>
              <span><i class="fas fa-map-pin"></i> <?= htmlspecialchars($user['address']) ?></span>
            <?php endif; ?>
            <span><i class="fas fa-calendar-alt"></i> عضو از: <?= htmlspecialchars($user['created_at'] ?? 'نامشخص') ?></span>
          </div>
          <div style="margin-top: 8px;">
            <span class="badge-code">
              <i class="fas fa-id-badge"></i> ID: #<?= (int)$user['id'] ?>
            </span>
            <?php if (!empty($user['role']) && $user['role'] !== 'user'): ?>
              <span class="badge-code" style="background: var(--warning-bg); color: var(--warning); border-color: var(--warning);">
                <i class="fas fa-user-shield"></i> 
                <?= $user['role'] === 'admin' ? 'مدیر' : ($user['role'] === 'super_admin' ? 'مدیر کل' : 'کاربر عادی') ?>
              </span>
            <?php endif; ?>
          </div>
        </div>
      </div>

      <!-- ===== آمار کاربر ===== -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
        <!-- آمار گزارش‌ها -->
        <div class="stats-mini" style="margin-bottom: 0;">
          <div style="width: 100%;">
            <h4 style="font-size: 14px; color: var(--dark-500); margin-bottom: 8px;">
              <i class="fas fa-flag" style="color: var(--primary-500);"></i> گزارش‌ها
            </h4>
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="stat-item">
                <i class="fas fa-list" style="color: var(--primary-500);"></i>
                <span>کل: <strong><?= count($reports) ?></strong></span>
              </div>
              <div class="stat-item">
                <i class="fas fa-hourglass-half" style="color: var(--warning);"></i>
                <span>در انتظار: <strong><?= $pending ?></strong></span>
              </div>
              <div class="stat-item">
                <i class="fas fa-spinner" style="color: var(--info);"></i>
                <span>در حال رسیدگی: <strong><?= $inProgress ?></strong></span>
              </div>
              <div class="stat-item">
                <i class="fas fa-check-circle" style="color: var(--success);"></i>
                <span>انجام شد: <strong><?= $done ?></strong></span>
              </div>
            </div>
          </div>
        </div>

        <!-- آمار تیکت‌ها -->
        <div class="stats-mini" style="margin-bottom: 0;">
          <div style="width: 100%;">
            <h4 style="font-size: 14px; color: var(--dark-500); margin-bottom: 8px;">
              <i class="fas fa-ticket-alt" style="color: var(--primary-500);"></i> تیکت‌ها
            </h4>
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="stat-item">
                <i class="fas fa-list" style="color: var(--primary-500);"></i>
                <span>کل: <strong><?= count($tickets) ?></strong></span>
              </div>
              <div class="stat-item">
                <i class="fas fa-hourglass-half" style="color: var(--warning);"></i>
                <span>در انتظار: <strong><?= $ticketPending ?></strong></span>
              </div>
              <div class="stat-item">
                <i class="fas fa-spinner" style="color: var(--info);"></i>
                <span>در حال رسیدگی: <strong><?= $ticketInProgress ?></strong></span>
              </div>
              <div class="stat-item">
                <i class="fas fa-check-circle" style="color: var(--success);"></i>
                <span>انجام شد: <strong><?= $ticketDone ?></strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== گزارش‌های کاربر ===== -->
      <section class="panel">
        <div class="panel-header">
          <h2>
            <i class="fas fa-flag" style="color: var(--primary-500); margin-left: 10px;"></i>
            گزارش‌های این کاربر
          </h2>
          <div class="panel-actions">
            <a href="report_add.php?user_phone=<?= urlencode($user['phone']) ?>" class="btn btn-primary btn-sm">
              <i class="fas fa-plus"></i> گزارش جدید
            </a>
          </div>
        </div>

        <?php if ($reports): ?>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th><i class="fas fa-hashtag"></i> کد</th>
                  <th><i class="fas fa-tag"></i> عنوان</th>
                  <th><i class="fas fa-folder"></i> دسته‌بندی</th>
                  <th><i class="fas fa-check-circle"></i> وضعیت</th>
                  <th><i class="fas fa-calendar"></i> تاریخ</th>
                  <th><i class="fas fa-cogs"></i> عملیات</th>
                </tr>
              </thead>
              <tbody>
                <?php $counter = 1; ?>
                <?php foreach ($reports as $report): ?>
                  <tr>
                    <td><?= $counter++ ?></td>
                    <td><span class="badge-code">#<?= htmlspecialchars($report['code'] ?? '') ?></span></td>
                    <td><strong><?= htmlspecialchars($report['title']) ?></strong></td>
                    <td><?= htmlspecialchars($report['category'] ?? 'سایر') ?></td>
                    <td>
                      <?php
                        $statusClass = normalizeStatusValue($report['status']) === 'done' ? 'status-done' : 
                                      (normalizeStatusValue($report['status']) === 'in_progress' ? 'status-progress' : 'status-pending');
                        $statusText = normalizeStatusValue($report['status']) === 'done' ? 'انجام شد' :
                                     (normalizeStatusValue($report['status']) === 'in_progress' ? 'در حال رسیدگی' : 'در انتظار');
                      ?>
                      <span class="<?= $statusClass ?>">
                        <?php if ($statusText === 'در انتظار'): ?>
                          <i class="fas fa-hourglass-half"></i>
                        <?php elseif ($statusText === 'در حال رسیدگی'): ?>
                          <i class="fas fa-spinner fa-spin"></i>
                        <?php elseif ($statusText === 'انجام شد'): ?>
                          <i class="fas fa-check-circle"></i>
                        <?php endif; ?>
                        <?= $statusText ?>
                      </span>
                    </td>
                    <td><?= htmlspecialchars($report['created_at']) ?></td>
                    <td>
                      <div class="action-buttons">
                        <a href="report_detail.php?id=<?= (int)$report['id'] ?>" class="btn-action view" title="مشاهده جزئیات">
                          <i class="fas fa-eye"></i>
                        </a>
                      </div>
                    </td>
                  </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        <?php else: ?>
          <div class="empty-state">
            <i class="fas fa-inbox" style="font-size: 48px; color: var(--dark-300);"></i>
            <h3>هیچ گزارشی وجود ندارد</h3>
            <p>این کاربر تاکنون هیچ گزارشی ثبت نکرده است.</p>
            <a href="report_add.php?user_phone=<?= urlencode($user['phone']) ?>" class="btn btn-primary" style="margin-top: 12px;">
              <i class="fas fa-plus"></i> ثبت گزارش جدید
            </a>
          </div>
        <?php endif; ?>
      </section>

      <!-- ===== تیکت‌های کاربر ===== -->
      <section class="panel">
        <div class="panel-header">
          <h2>
            <i class="fas fa-ticket-alt" style="color: var(--primary-500); margin-left: 10px;"></i>
            تیکت‌های این کاربر
          </h2>
          <div class="panel-actions">
            <a href="ticket_add.php?user_phone=<?= urlencode($user['phone']) ?>" class="btn btn-primary btn-sm">
              <i class="fas fa-plus"></i> تیکت جدید
            </a>
          </div>
        </div>

        <?php if ($tickets): ?>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th><i class="fas fa-tag"></i> عنوان</th>
                  <th><i class="fas fa-folder"></i> دسته‌بندی</th>
                  <th><i class="fas fa-flag"></i> اولویت</th>
                  <th><i class="fas fa-check-circle"></i> وضعیت</th>
                  <th><i class="fas fa-calendar"></i> تاریخ</th>
                  <th><i class="fas fa-cogs"></i> عملیات</th>
                </tr>
              </thead>
              <tbody>
                <?php $counter = 1; ?>
                <?php foreach ($tickets as $ticket): ?>
                  <tr>
                    <td><?= $counter++ ?></td>
                    <td><strong><?= htmlspecialchars($ticket['title']) ?></strong></td>
                    <td><?= htmlspecialchars($ticket['category'] ?? 'سایر') ?></td>
                    <td>
                      <?php
                        $priorityMap = [
                            'low' => ['class' => 'priority-low', 'icon' => 'fa-arrow-down', 'text' => 'پایین'],
                            'medium' => ['class' => 'priority-medium', 'icon' => 'fa-minus', 'text' => 'متوسط'],
                            'high' => ['class' => 'priority-high', 'icon' => 'fa-arrow-up', 'text' => 'بالا'],
                            'critical' => ['class' => 'priority-critical', 'icon' => 'fa-exclamation-triangle', 'text' => 'بحرانی']
                        ];
                        $priority = $priorityMap[$ticket['priority'] ?? 'medium'] ?? $priorityMap['medium'];
                      ?>
                      <span class="<?= $priority['class'] ?>">
                        <i class="fas <?= $priority['icon'] ?>"></i>
                        <?= $priority['text'] ?>
                      </span>
                    </td>
                    <td>
                      <?php
                        $statusClass = normalizeStatusValue($ticket['status'] ?? 'pending') === 'done' ? 'status-done' : 
                                      (normalizeStatusValue($ticket['status'] ?? 'pending') === 'in_progress' ? 'status-progress' : 'status-pending');
                        $statusText = normalizeStatusValue($ticket['status'] ?? 'pending') === 'done' ? 'انجام شد' :
                                     (normalizeStatusValue($ticket['status'] ?? 'pending') === 'in_progress' ? 'در حال رسیدگی' : 'در انتظار');
                      ?>
                      <span class="<?= $statusClass ?>">
                        <?php if ($statusText === 'در انتظار'): ?>
                          <i class="fas fa-hourglass-half"></i>
                        <?php elseif ($statusText === 'در حال رسیدگی'): ?>
                          <i class="fas fa-spinner fa-spin"></i>
                        <?php elseif ($statusText === 'انجام شد'): ?>
                          <i class="fas fa-check-circle"></i>
                        <?php endif; ?>
                        <?= $statusText ?>
                      </span>
                    </td>
                    <td><?= htmlspecialchars($ticket['created_at']) ?></td>
                    <td>
                      <div class="action-buttons">
                        <a href="ticket_detail.php?id=<?= (int)$ticket['id'] ?>" class="btn-action view" title="مشاهده جزئیات">
                          <i class="fas fa-eye"></i>
                        </a>
                      </div>
                    </td>
                  </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        <?php else: ?>
          <div class="empty-state">
            <i class="fas fa-inbox" style="font-size: 48px; color: var(--dark-300);"></i>
            <h3>هیچ تیکتی وجود ندارد</h3>
            <p>این کاربر تاکنون هیچ تیکتی ثبت نکرده است.</p>
            <a href="ticket_add.php?user_phone=<?= urlencode($user['phone']) ?>" class="btn btn-primary" style="margin-top: 12px;">
              <i class="fas fa-plus"></i> ثبت تیکت جدید
            </a>
          </div>
        <?php endif; ?>
      </section>
    </main>
  </div>
</body>
</html>