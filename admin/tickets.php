<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$statusFilter = $_GET['status'] ?? 'all';
$search = trim($_GET['search'] ?? '');
$tickets = getTickets($pdo, $statusFilter, $search);

// محاسبه آمار
$totalTickets = count($tickets);
$pendingTickets = count(array_filter($tickets, fn($t) => normalizeStatusValue($t['status']) === 'pending'));
$inProgressTickets = count(array_filter($tickets, fn($t) => normalizeStatusValue($t['status']) === 'in_progress'));
$doneTickets = count(array_filter($tickets, fn($t) => normalizeStatusValue($t['status']) === 'done'));
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>مدیریت تیکت‌ها</title>
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
        <a class="active" href="tickets.php"><i class="fas fa-ticket-alt"></i> <span>تیکت‌ها</span></a>
        <a href="users.php"><i class="fas fa-users"></i> <span>کاربران</span></a>
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
            <i class="fas fa-ticket-alt" style="color: var(--primary-500); margin-left: 12px;"></i>
            مدیریت تیکت‌ها
          </h1>
          <p>جست‌وجو، فیلتر، پاسخ و مدیریت تیکت‌ها</p>
        </div>
        <div class="topbar-right">
          <a href="ticket_add.php" class="btn btn-primary">
            <i class="fas fa-plus"></i> تیکت جدید
          </a>
        </div>
      </header>

      <!-- ===== آمار تیکت‌ها ===== -->
      <div class="stats-mini">
        <div class="stat-item">
          <i class="fas fa-list" style="color: var(--primary-500);"></i>
          <span>کل تیکت‌ها: <strong><?= $totalTickets ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-hourglass-half" style="color: var(--warning);"></i>
          <span>در انتظار: <strong><?= $pendingTickets ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-spinner" style="color: var(--info);"></i>
          <span>در حال رسیدگی: <strong><?= $inProgressTickets ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-check-circle" style="color: var(--success);"></i>
          <span>انجام شد: <strong><?= $doneTickets ?></strong></span>
        </div>
      </div>

      <!-- ===== جدول تیکت‌ها ===== -->
      <section class="panel">
        <div class="panel-header">
          <h2>
            <i class="fas fa-list" style="color: var(--primary-500); margin-left: 10px;"></i>
            لیست تیکت‌ها
          </h2>
          <div class="panel-actions">
            <form method="get" class="filter-form" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; width: 100%;">
              <div style="flex: 1; min-width: 150px;">
                <input 
                  type="text" 
                  name="search" 
                  class="search-input" 
                  value="<?= htmlspecialchars($search) ?>" 
                  placeholder="جست‌وجو بر اساس عنوان یا شماره تلفن"
                  style="width: 100%;"
                >
              </div>
              <div style="min-width: 130px;">
                <select name="status" class="filter-select" style="width: 100%;">
                  <option value="all" <?= $statusFilter === 'all' ? 'selected' : '' ?>>همه وضعیت‌ها</option>
                  <option value="pending" <?= $statusFilter === 'pending' ? 'selected' : '' ?>>در انتظار</option>
                  <option value="in_progress" <?= $statusFilter === 'in_progress' ? 'selected' : '' ?>>در حال رسیدگی</option>
                  <option value="done" <?= $statusFilter === 'done' ? 'selected' : '' ?>>انجام شد</option>
                </select>
              </div>
              <button type="submit" class="btn btn-primary">
                <i class="fas fa-search"></i> جستجو
              </button>
              <?php if ($search !== '' || $statusFilter !== 'all'): ?>
                <a href="tickets.php" class="btn btn-secondary">
                  <i class="fas fa-times"></i> پاک کردن
                </a>
              <?php endif; ?>
            </form>
          </div>
        </div>

        <div class="table-wrapper">
          <table id="ticketsTable">
            <thead>
              <tr>
                <th>#</th>
                <th><i class="fas fa-tag"></i> عنوان</th>
                <th><i class="fas fa-user"></i> کاربر</th>
                <th><i class="fas fa-folder"></i> دسته‌بندی</th>
                <th><i class="fas fa-flag"></i> اولویت</th>
                <th><i class="fas fa-check-circle"></i> وضعیت</th>
                <th><i class="fas fa-calendar"></i> تاریخ</th>
                <th><i class="fas fa-cogs"></i> عملیات</th>
              </tr>
            </thead>
            <tbody>
              <?php if ($tickets): ?>
                <?php $counter = 1; ?>
                <?php foreach ($tickets as $ticket): ?>
                  <tr>
                    <td><?= $counter++ ?></td>
                    <td><strong><?= htmlspecialchars($ticket['title']) ?></strong></td>
                    <td>
                      <div class="user-info">
                        <div class="user-avatar" data-color="<?= ($counter % 5) + 1 ?>">
                          <?= htmlspecialchars(mb_substr($ticket['user_phone'] ?? 'U', -4, 1)) ?>
                        </div>
                        <?= htmlspecialchars($ticket['user_phone']) ?>
                      </div>
                    </td>
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
                        $statusClass = normalizeStatusValue($ticket['status']) === 'done' ? 'status-done' : 
                                      (normalizeStatusValue($ticket['status']) === 'in_progress' ? 'status-progress' : 'status-pending');
                        $statusText = normalizeStatusValue($ticket['status']) === 'done' ? 'انجام شد' :
                                     (normalizeStatusValue($ticket['status']) === 'in_progress' ? 'در حال رسیدگی' : 'در انتظار');
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
                        <a href="ticket_edit.php?id=<?= (int)$ticket['id'] ?>" class="btn-action edit" title="ویرایش">
                          <i class="fas fa-pen"></i>
                        </a>
                        <a href="actions.php?type=ticket_delete&id=<?= (int)$ticket['id'] ?><?= eplakCsrfQuery() ?>" class="btn-action delete" title="حذف" onclick="return confirm('آیا از حذف این تیکت اطمینان دارید؟')">
                          <i class="fas fa-trash"></i>
                        </a>
                      </div>
                    </td>
                  </tr>
                <?php endforeach; ?>
              <?php else: ?>
                <tr>
                  <td colspan="8">
                    <div class="empty-state" style="padding: 30px 20px;">
                      <i class="fas fa-inbox" style="font-size: 48px; color: var(--dark-300);"></i>
                      <h3>تیکتی یافت نشد</h3>
                      <p>هیچ تیکتی با شرایط جستجوی شما یافت نشد.</p>
                      <a href="ticket_add.php" class="btn btn-primary" style="margin-top: 12px;">
                        <i class="fas fa-plus"></i> ثبت تیکت جدید
                      </a>
                    </div>
                  </td>
                </tr>
              <?php endif; ?>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</body>
</html>