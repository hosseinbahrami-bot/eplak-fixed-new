<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$users = getAllUsers($pdo);

// محاسبه آمار
$totalUsers = count($users);
$activeUsers = count(array_filter($users, fn($u) => ($u['report_count'] ?? 0) > 0));
$newUsers = count(array_filter($users, fn($u) => strtotime($u['created_at']) > strtotime('-7 days')));
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>مدیریت کاربران</title>
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
            <i class="fas fa-users" style="color: #0f766e; margin-left: 12px;"></i>
            مدیریت کاربران
          </h1>
          <p>مشاهده و مدیریت کاربران ثبت‌شده در سامانه</p>
        </div>
        <div class="topbar-right">
          <a href="user_add.php" class="btn btn-primary">
            <i class="fas fa-user-plus"></i> کاربر جدید
          </a>
        </div>
      </header>

      <!-- ===== آمار کاربران ===== -->
      <div class="stats-mini">
        <div class="stat-item">
          <i class="fas fa-users" style="color: #0f766e;"></i>
          <span>کل کاربران: <strong><?= $totalUsers ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-user-check" style="color: #16a34a;"></i>
          <span>کاربران فعال: <strong><?= $activeUsers ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-user-plus" style="color: #2563eb;"></i>
          <span>کاربران جدید (۷ روز): <strong><?= $newUsers ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-flag" style="color: #d97706;"></i>
          <span>کل گزارش‌ها: <strong><?= array_sum(array_column($users, 'report_count')) ?></strong></span>
        </div>
      </div>

      <!-- ===== جدول کاربران ===== -->
      <section class="panel">
        <div class="panel-header">
          <h2>
            <i class="fas fa-list" style="color: #0f766e; margin-left: 10px;"></i>
            لیست کاربران
          </h2>
          <div class="panel-actions">
            <input type="text" id="searchUser" class="search-input" placeholder="جستجوی کاربر..." onkeyup="filterUsers()">
            <select id="filterUser" class="filter-select" onchange="filterUsers()">
              <option value="all">همه کاربران</option>
              <option value="active">فعال (دارای گزارش)</option>
              <option value="inactive">غیرفعال (بدون گزارش)</option>
              <option value="new">جدید (۷ روز اخیر)</option>
            </select>
          </div>
        </div>

        <div class="table-wrapper">
          <table id="usersTable">
            <thead>
              <tr>
                <th>#</th>
                <th><i class="fas fa-user"></i> نام</th>
                <th><i class="fas fa-phone"></i> موبایل</th>
                <th><i class="fas fa-map-pin"></i> آدرس</th>
                <th><i class="fas fa-id-card"></i> کد ملی</th>
                <th><i class="fas fa-flag"></i> گزارش‌ها</th>
                <th><i class="fas fa-calendar"></i> تاریخ ثبت</th>
                <th><i class="fas fa-cogs"></i> عملیات</th>
              </tr>
            </thead>
            <tbody>
              <?php $counter = 1; ?>
              <?php foreach ($users as $user): ?>
                <tr data-phone="<?= htmlspecialchars($user['phone']) ?>" 
                    data-report-count="<?= (int)$user['report_count'] ?>"
                    data-created="<?= htmlspecialchars($user['created_at']) ?>">
                  <td><?= $counter++ ?></td>
                  <td>
                    <div class="user-info">
                      <div class="user-avatar">
                        <?= htmlspecialchars(mb_substr($user['name'], 0, 1)) ?>
                      </div>
                      <strong><?= htmlspecialchars($user['name']) ?></strong>
                    </div>
                  </td>
                  <td dir="ltr"><?= htmlspecialchars($user['phone']) ?></td>
                  <td><?= htmlspecialchars($user['address'] ?? '—') ?></td>
                  <td dir="ltr"><?= htmlspecialchars($user['nid'] ?? '—') ?></td>
                  <td>
                    <a href="user_reports.php?phone=<?= urlencode($user['phone']) ?>" class="report-count-badge">
                      <i class="fas fa-flag"></i> <?= (int)$user['report_count'] ?>
                    </a>
                  </td>
                  <td><?= htmlspecialchars($user['created_at']) ?></td>
                  <td>
                    <div class="action-buttons">
                      <a href="user_view.php?id=<?= (int)$user['id'] ?>" class="btn-action view" title="مشاهده">
                        <i class="fas fa-eye"></i>
                      </a>
                      <a href="user_edit.php?id=<?= (int)$user['id'] ?>" class="btn-action edit" title="ویرایش">
                        <i class="fas fa-pen"></i>
                      </a>
                      <a href="actions.php?type=user_delete&id=<?= (int)$user['id'] ?><?= eplakCsrfQuery() ?>" class="btn-action delete" title="حذف" onclick="return confirm('آیا از حذف این کاربر اطمینان دارید؟\nهمه گزارش‌های این کاربر نیز حذف خواهند شد.')">
                        <i class="fas fa-trash"></i>
                      </a>
                    </div>
                  </td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>

        <?php if (empty($users)): ?>
          <div class="empty-state">
            <i class="fas fa-user-slash" style="font-size: 48px; color: #94a3b8;"></i>
            <p>هیچ کاربری در سامانه ثبت نشده است.</p>
            <a href="user_add.php" class="btn btn-primary" style="margin-top: 12px;">
              <i class="fas fa-user-plus"></i> افزودن کاربر جدید
            </a>
          </div>
        <?php endif; ?>
      </section>
    </main>
  </div>

  <script>
    // ===== جستجو و فیلتر کاربران =====
    /* ارقام فارسی/عربی را به لاتین تبدیل می‌کند تا جستجو با هر دو نوع عدد کار کند */
    function normalizeDigits(value) {
      return String(value == null ? '' : value)
        .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
        .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
    }
    function filterUsers() {
      const searchTerm = normalizeDigits(document.getElementById('searchUser').value.toLowerCase().trim());
      const filterType = document.getElementById('filterUser').value;
      const rows = document.querySelectorAll('#usersTable tbody tr');
      
      rows.forEach(row => {
        const name = normalizeDigits(row.querySelector('td:nth-child(2) strong')?.textContent?.toLowerCase() || '');
        const phone = row.dataset.phone || '';
        const reportCount = parseInt(row.dataset.reportCount) || 0;
        const created = row.dataset.created || '';
        
        // جستجو
        let show = name.includes(searchTerm) || phone.includes(searchTerm);
        
        // فیلتر
        if (show) {
          switch (filterType) {
            case 'active':
              show = reportCount > 0;
              break;
            case 'inactive':
              show = reportCount === 0;
              break;
            case 'new':
              const daysAgo = (Date.now() - new Date(created).getTime()) / (1000 * 60 * 60 * 24);
              show = daysAgo <= 7;
              break;
            default:
              show = true;
          }
        }
        
        row.style.display = show ? '' : 'none';
      });
      
      // نمایش پیام خالی
      const visibleRows = document.querySelectorAll('#usersTable tbody tr:not([style*="display: none"])');
      let emptyMsg = document.querySelector('.filter-empty');
      
      if (visibleRows.length === 0) {
        if (!emptyMsg) {
          emptyMsg = document.createElement('div');
          emptyMsg.className = 'filter-empty';
          emptyMsg.innerHTML = `
            <i class="fas fa-search" style="font-size: 28px; color: #94a3b8;"></i>
            <p style="color: #94a3b8; margin-top: 8px;">نتیجه‌ای یافت نشد.</p>
          `;
          document.querySelector('#usersTable').after(emptyMsg);
        }
        emptyMsg.style.display = 'block';
      } else if (emptyMsg) {
        emptyMsg.style.display = 'none';
      }
    }
  </script>
</body>
</html>