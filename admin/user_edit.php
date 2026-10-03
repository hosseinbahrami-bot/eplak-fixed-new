<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$id = (int)($_GET['id'] ?? 0);
$user = getUserById($pdo, $id);
$message = '';
$messageType = '';

if (!$user) {
    eplakRedirect('users.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $phone = trim($_POST['phone'] ?? '');
    $name = trim($_POST['name'] ?? '');
    $address = trim($_POST['address'] ?? '');
    $nid = trim($_POST['nid'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $role = trim($_POST['role'] ?? 'user');

    // بررسی تکراری نبودن شماره موبایل (به جز خود کاربر)
    $existing = getUserByPhone($pdo, $phone);
    if ($existing && $existing['id'] != $id) {
        $message = '⚠️ این شماره موبایل قبلاً برای کاربر دیگری ثبت شده است.';
        $messageType = 'danger';
    } elseif ($phone !== '' && $name !== '') {
        updateUser($pdo, $id, [
            'phone' => $phone,
            'name' => $name,
            'address' => $address,
            'nid' => $nid,
            'email' => $email,
            'role' => $role,
        ]);

        $user = getUserById($pdo, $id);
        $message = '✅ اطلاعات کاربر با موفقیت بروزرسانی شد.';
        $messageType = 'success';
    } else {
        $message = '⚠️ لطفاً نام و شماره موبایل را وارد کنید.';
        $messageType = 'danger';
    }
}

// محاسبه تعداد گزارش‌های کاربر
$reportsCount = count(getReportsByUser($pdo, $user['phone']));
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ویرایش کاربر</title>
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
            <i class="fas fa-user-edit" style="color: var(--primary-500); margin-left: 12px;"></i>
            ویرایش کاربر
          </h1>
          <p>
            <span class="badge-code" style="margin-left: 8px;">ID: #<?= (int)$user['id'] ?></span>
            بروزرسانی اطلاعات فرد
          </p>
        </div>
        <div class="topbar-right">
          <a href="users.php" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
          <a href="user_reports.php?phone=<?= urlencode($user['phone']) ?>" class="btn btn-primary">
            <i class="fas fa-flag"></i> گزارش‌ها
          </a>
        </div>
      </header>

      <?php if ($message): ?>
        <div class="alert alert-<?= $messageType ?>">
          <?php if ($messageType === 'success'): ?>
            <i class="fas fa-check-circle"></i>
          <?php else: ?>
            <i class="fas fa-exclamation-circle"></i>
          <?php endif; ?>
          <?= htmlspecialchars($message) ?>
        </div>
      <?php endif; ?>

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
            <span><i class="fas fa-flag"></i> تعداد گزارش‌ها: <strong><?= $reportsCount ?></strong></span>
            <span><i class="fas fa-calendar-alt"></i> عضو از: <?= htmlspecialchars($user['created_at'] ?? 'نامشخص') ?></span>
          </div>
        </div>
      </div>

      <!-- ===== فرم ویرایش ===== -->
      <section class="panel">
        <form method="post" class="report-form">
<?= eplakCsrfField() ?>
          <!-- ===== ردیف ۱: نام کامل و شماره موبایل ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="name">
                <i class="fas fa-user" style="color: var(--primary-500); margin-left: 6px;"></i>
                نام کامل <span class="required">*</span>
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-user input-icon"></i>
                <input 
                  type="text" 
                  id="name"
                  name="name" 
                  class="form-control" 
                  value="<?= htmlspecialchars($user['name']) ?>" 
                  required 
                  placeholder="نام و نام خانوادگی را وارد کنید"
                  autofocus
                >
              </div>
            </div>

            <div class="form-group">
              <label for="phone">
                <i class="fas fa-phone" style="color: var(--primary-500); margin-left: 6px;"></i>
                شماره موبایل <span class="required">*</span>
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-mobile-alt input-icon"></i>
                <input 
                  type="text" 
                  id="phone"
                  name="phone" 
                  class="form-control" 
                  value="<?= htmlspecialchars($user['phone']) ?>" 
                  required 
                  placeholder="مثلاً 09123456789"
                  dir="ltr"
                >
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۲: کد ملی و ایمیل ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="nid">
                <i class="fas fa-id-card" style="color: var(--primary-500); margin-left: 6px;"></i>
                کد ملی
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-id-card input-icon"></i>
                <input 
                  type="text" 
                  id="nid"
                  name="nid" 
                  class="form-control" 
                  value="<?= htmlspecialchars($user['nid'] ?? '') ?>" 
                  placeholder="مثلاً 1234567890"
                  dir="ltr"
                >
              </div>
            </div>

            <div class="form-group">
              <label for="email">
                <i class="fas fa-envelope" style="color: var(--primary-500); margin-left: 6px;"></i>
                ایمیل
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-envelope input-icon"></i>
                <input 
                  type="email" 
                  id="email"
                  name="email" 
                  class="form-control" 
                  value="<?= htmlspecialchars($user['email'] ?? '') ?>" 
                  placeholder="example@email.com"
                  dir="ltr"
                >
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۳: نقش کاربری و آدرس ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="role">
                <i class="fas fa-user-tag" style="color: var(--primary-500); margin-left: 6px;"></i>
                نقش کاربری
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-user-shield input-icon"></i>
                <select id="role" name="role" class="form-control">
                  <option value="user" <?= ($user['role'] ?? 'user') === 'user' ? 'selected' : '' ?>>کاربر عادی</option>
                  <option value="admin" <?= ($user['role'] ?? '') === 'admin' ? 'selected' : '' ?>>مدیر</option>
                  <option value="super_admin" <?= ($user['role'] ?? '') === 'super_admin' ? 'selected' : '' ?>>مدیر کل</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="address">
                <i class="fas fa-map-pin" style="color: var(--primary-500); margin-left: 6px;"></i>
                آدرس
              </label>
              <div class="input-icon-wrapper" style="align-items: flex-start;">
                <i class="fas fa-home input-icon" style="top: 14px; transform: none;"></i>
                <textarea 
                  id="address"
                  name="address" 
                  class="form-control" 
                  rows="3" 
                  placeholder="آدرس کامل کاربر را وارد کنید..."
                ><?= htmlspecialchars($user['address'] ?? '') ?></textarea>
              </div>
            </div>
          </div>

          <!-- ===== اطلاعات تکمیلی ===== -->
          <div class="form-row">
            <div class="form-group full-width">
              <div style="display: flex; gap: 24px; flex-wrap: wrap; padding: 12px 16px; background: var(--dark-50); border-radius: var(--radius-md); border: 1px solid var(--dark-200);">
                <span style="font-size: 13px; color: var(--dark-500);">
                  <i class="fas fa-info-circle" style="color: var(--dark-400);"></i>
                  فیلدهای دارای <span class="required" style="font-size: 16px;">*</span> اجباری هستند.
                </span>
                <span style="font-size: 13px; color: var(--dark-500);">
                  <i class="fas fa-clock" style="color: var(--dark-400);"></i>
                  آخرین بروزرسانی: <strong><?= htmlspecialchars($user['updated_at'] ?? $user['created_at'] ?? 'نامشخص') ?></strong>
                </span>
                <span style="font-size: 13px; color: var(--dark-500);">
                  <i class="fas fa-id-badge" style="color: var(--dark-400);"></i>
                  ID کاربر: <strong>#<?= (int)$user['id'] ?></strong>
                </span>
              </div>
            </div>
          </div>

          <!-- ===== دکمه‌های عملیات ===== -->
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-lg">
              <i class="fas fa-save"></i> ذخیره تغییرات
            </button>
            <button type="reset" class="btn btn-secondary">
              <i class="fas fa-undo"></i> بازنشانی
            </button>
            <a href="users.php" class="btn btn-outline">
              <i class="fas fa-times"></i> انصراف
            </a>
            <a href="actions.php?type=user_delete&id=<?= (int)$user['id'] ?><?= eplakCsrfQuery() ?>" class="btn btn-danger" onclick="return confirm('آیا از حذف این کاربر اطمینان دارید؟\nهمه گزارش‌های این کاربر نیز حذف خواهند شد.')">
              <i class="fas fa-trash"></i> حذف کاربر
            </a>
          </div>
        </form>
      </section>
    </main>
  </div>

  <script>
    // ===== اعتبارسنجی سمت کاربر =====
    document.addEventListener('DOMContentLoaded', function() {
      const phoneInput = document.getElementById('phone');
      const nidInput = document.getElementById('nid');
      
      // اعتبارسنجی شماره موبایل
      if (phoneInput) {
        phoneInput.addEventListener('input', function() {
          // حذف کاراکترهای غیرعددی
          this.value = this.value.replace(/[^0-9]/g, '');
          
          // محدودیت به ۱۱ رقم
          if (this.value.length > 11) {
            this.value = this.value.slice(0, 11);
          }
        });
      }
      
      // اعتبارسنجی کد ملی
      if (nidInput) {
        nidInput.addEventListener('input', function() {
          // حذف کاراکترهای غیرعددی
          this.value = this.value.replace(/[^0-9]/g, '');
          
          // محدودیت به ۱۰ رقم
          if (this.value.length > 10) {
            this.value = this.value.slice(0, 10);
          }
        });
      }
    });
  </script>
</body>
</html>