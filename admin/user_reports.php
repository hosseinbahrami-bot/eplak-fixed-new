<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$userPhone = trim($_GET['phone'] ?? '');

if ($userPhone === '') {
    eplakRedirect('users.php');
    exit;
}

$reports = getReportsByUser($pdo, $userPhone);
$user = getUserByPhone($pdo, $userPhone);

// محاسبه آمار
$totalReports = count($reports);
$pendingReports = count(array_filter($reports, fn($r) => $r['status'] === 'pending' || $r['status'] === 'در انتظار'));
$doneReports = count(array_filter($reports, fn($r) => $r['status'] === 'done' || $r['status'] === 'انجام شد'));
$inProgressReports = count(array_filter($reports, fn($r) => $r['status'] === 'in_progress' || $r['status'] === 'در حال رسیدگی'));
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>گزارش‌های کاربر</title>
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
            <i class="fas fa-user" style="color: #0f766e; margin-left: 12px;"></i>
            گزارش‌های کاربر
          </h1>
          <p>
            <i class="fas fa-phone" style="color: #94a3b8;"></i>
            مشاهده گزارش‌های ثبت‌شده توسط 
            <strong><?= htmlspecialchars($userPhone) ?></strong>
            <?php if ($user): ?>
              <span class="user-name-badge"><?= htmlspecialchars($user['name'] ?? '') ?></span>
            <?php endif; ?>
          </p>
        </div>
        <div class="topbar-right">
          <a href="users.php" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
          <?php if ($user): ?>
            <a href="user_view.php?id=<?= (int)$user['id'] ?>" class="btn btn-primary">
              <i class="fas fa-user"></i> پروفایل کاربر
            </a>
          <?php endif; ?>
        </div>
      </header>

      <!-- ===== اطلاعات کاربر ===== -->
      <?php if ($user): ?>
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
            <?php if (!empty($user['address'])): ?>
              <span><i class="fas fa-map-pin"></i> <?= htmlspecialchars($user['address']) ?></span>
            <?php endif; ?>
            <span><i class="fas fa-calendar-alt"></i> عضو از: <?= htmlspecialchars($user['created_at']) ?></span>
          </div>
        </div>
      </div>
      <?php endif; ?>

      <!-- ===== آمار گزارش‌ها ===== -->
      <div class="stats-mini">
        <div class="stat-item">
          <i class="fas fa-list" style="color: #0f766e;"></i>
          <span>کل گزارش‌ها: <strong><?= $totalReports ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-hourglass-half" style="color: #d97706;"></i>
          <span>در انتظار: <strong><?= $pendingReports ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-spinner" style="color: #2563eb;"></i>
          <span>در حال رسیدگی: <strong><?= $inProgressReports ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-check-circle" style="color: #16a34a;"></i>
          <span>انجام شد: <strong><?= $doneReports ?></strong></span>
        </div>
      </div>

      <!-- ===== جدول گزارش‌ها ===== -->
      <section class="panel">
        <div class="panel-header">
          <h2>
            <i class="fas fa-flag" style="color: #0f766e; margin-left: 10px;"></i>
            لیست گزارش‌های کاربر
          </h2>
          <div class="panel-actions">
            <input type="text" id="searchReport" class="search-input" placeholder="جستجوی گزارش..." onkeyup="filterReports()">
            <select id="filterStatus" class="filter-select" onchange="filterReports()">
              <option value="all">همه وضعیت‌ها</option>
              <option value="pending">در انتظار</option>
              <option value="in_progress">در حال رسیدگی</option>
              <option value="done">انجام شد</option>
            </select>
          </div>
        </div>

        <?php if ($reports): ?>
          <div class="table-wrapper">
            <table id="reportsTable">
              <thead>
                <tr>
                  <th>#</th>
                  <th><i class="fas fa-hashtag"></i> کد</th>
                  <th><i class="fas fa-tag"></i> عنوان</th>
                  <th><i class="fas fa-folder"></i> دسته‌بندی</th>
                  <th><i class="fas fa-building"></i> واحد</th>
                  <th><i class="fas fa-map-pin"></i> موقعیت</th>
                  <th><i class="fas fa-check-circle"></i> وضعیت</th>
                  <th><i class="fas fa-calendar"></i> تاریخ</th>
                  <th><i class="fas fa-cogs"></i> عملیات</th>
                </tr>
              </thead>
              <tbody>
                <?php $counter = 1; ?>
                <?php foreach ($reports as $report): ?>
                  <tr data-status="<?= htmlspecialchars($report['status']) ?>"
                      data-title="<?= htmlspecialchars(strtolower($report['title'])) ?>"
                      data-code="<?= htmlspecialchars(strtolower($report['code'])) ?>">
                    <td><?= $counter++ ?></td>
                    <td><span class="badge-code">#<?= htmlspecialchars($report['code']) ?></span></td>
                    <td><strong><?= htmlspecialchars($report['title']) ?></strong></td>
                    <td><?= htmlspecialchars($report['category']) ?></td>
                    <td><?= htmlspecialchars($report['department'] ?: ($report['sub_department'] ?: '—')) ?></td>
                    <td><?= htmlspecialchars($report['location'] ?: '—') ?></td>
                    <td>
                      <?php
                        $statusMap = [
                            'pending' => ['class' => 'status-pending', 'text' => 'در انتظار'],
                            'در انتظار' => ['class' => 'status-pending', 'text' => 'در انتظار'],
                            'in_progress' => ['class' => 'status-progress', 'text' => 'در حال رسیدگی'],
                            'در حال رسیدگی' => ['class' => 'status-progress', 'text' => 'در حال رسیدگی'],
                            'done' => ['class' => 'status-done', 'text' => 'انجام شد'],
                            'انجام شد' => ['class' => 'status-done', 'text' => 'انجام شد'],
                        ];
                        $status = $statusMap[$report['status']] ?? ['class' => 'status-pending', 'text' => $report['status']];
                      ?>
                      <span class="<?= $status['class'] ?>">
                        <?php if ($status['text'] === 'در انتظار'): ?>
                          <i class="fas fa-hourglass-half"></i>
                        <?php elseif ($status['text'] === 'در حال رسیدگی'): ?>
                          <i class="fas fa-spinner fa-spin"></i>
                        <?php elseif ($status['text'] === 'انجام شد'): ?>
                          <i class="fas fa-check-circle"></i>
                        <?php endif; ?>
                        <?= $status['text'] ?>
                      </span>
                    </td>
                    <td><?= htmlspecialchars($report['created_at']) ?></td>
                    <td>
                      <div class="action-buttons">
                        <a href="report_detail.php?id=<?= (int)$report['id'] ?>" class="btn-action view" title="مشاهده جزئیات">
                          <i class="fas fa-eye"></i>
                        </a>
                        <a href="report_edit.php?id=<?= (int)$report['id'] ?>" class="btn-action edit" title="ویرایش">
                          <i class="fas fa-pen"></i>
                        </a>
                        <a href="actions.php?type=report_delete&id=<?= (int)$report['id'] ?><?= eplakCsrfQuery() ?>" class="btn-action delete" title="حذف" onclick="return confirm('آیا از حذف این گزارش اطمینان دارید؟')">
                          <i class="fas fa-trash"></i>
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
            <i class="fas fa-inbox" style="font-size: 48px; color: #94a3b8;"></i>
            <p>هیچ گزارشی برای این کاربر ثبت نشده است.</p>
            <?php if ($user): ?>
              <a href="report_add.php?user_id=<?= (int)$user['id'] ?>" class="btn btn-primary" style="margin-top: 12px;">
                <i class="fas fa-plus"></i> ثبت گزارش جدید برای این کاربر
              </a>
            <?php endif; ?>
          </div>
        <?php endif; ?>
      </section>
    </main>
  </div>

  <script>
    // ===== جستجو و فیلتر گزارش‌ها =====
    /* ارقام فارسی/عربی را به لاتین تبدیل می‌کند تا جستجو با هر دو نوع عدد کار کند */
    function normalizeDigits(value) {
      return String(value == null ? '' : value)
        .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
        .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
    }
    function filterReports() {
      const searchTerm = normalizeDigits(document.getElementById('searchReport').value.toLowerCase().trim());
      const filterStatus = document.getElementById('filterStatus').value;
      const rows = document.querySelectorAll('#reportsTable tbody tr');
      
      rows.forEach(row => {
        const title = row.dataset.title || '';
        const code = row.dataset.code || '';
        const status = row.dataset.status || '';
        
        // جستجو
        let show = normalizeDigits(title).includes(searchTerm) || normalizeDigits(code).includes(searchTerm);
        
        // فیلتر وضعیت
        if (show && filterStatus !== 'all') {
          const statusMap = {
            'pending': ['pending', 'در انتظار'],
            'in_progress': ['in_progress', 'در حال رسیدگی'],
            'done': ['done', 'انجام شد']
          };
          show = statusMap[filterStatus]?.includes(status) || false;
        }
        
        row.style.display = show ? '' : 'none';
      });
      
      // نمایش پیام خالی
      const visibleRows = document.querySelectorAll('#reportsTable tbody tr:not([style*="display: none"])');
      let emptyMsg = document.querySelector('.filter-empty');
      
      if (visibleRows.length === 0) {
        if (!emptyMsg) {
          emptyMsg = document.createElement('div');
          emptyMsg.className = 'filter-empty';
          emptyMsg.innerHTML = `
            <i class="fas fa-search" style="font-size: 28px; color: #94a3b8;"></i>
            <p style="color: #94a3b8; margin-top: 8px;">نتیجه‌ای یافت نشد.</p>
          `;
          document.querySelector('#reportsTable').after(emptyMsg);
        }
        emptyMsg.style.display = 'block';
      } else if (emptyMsg) {
        emptyMsg.style.display = 'none';
      }
    }
  </script>
</body>
</html>