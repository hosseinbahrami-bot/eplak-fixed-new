<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$message = '';
$messageType = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $phone = trim($_POST['phone'] ?? '');
    $name = trim($_POST['name'] ?? '');
    $address = trim($_POST['address'] ?? '');
    $nid = trim($_POST['nid'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $role = trim($_POST['role'] ?? 'user');

    if ($phone !== '' && $name !== '') {
        $existing = getUserByPhone($pdo, $phone);
        if ($existing) {
            $message = '⚠️ این شماره موبایل قبلاً ثبت شده است.';
            $messageType = 'danger';
        } else {
            createUser($pdo, [
                'phone' => $phone,
                'name' => $name,
                'address' => $address,
                'nid' => $nid,
                'email' => $email,
                'role' => $role,
            ]);
            eplakRedirect('users.php?success=1');
            exit;
        }
    } else {
        $message = '⚠️ لطفاً نام و شماره موبایل را وارد کنید.';
        $messageType = 'danger';
    }
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>افزودن کاربر جدید</title>
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
            <i class="fas fa-user-plus" style="color: var(--primary-500); margin-left: 12px;"></i>
            افزودن کاربر جدید
          </h1>
          <p>ثبت اطلاعات شهروند جدید در سامانه</p>
        </div>
        <div class="topbar-right">
          <a href="users.php" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
        </div>
      </header>

      <?php if ($message): ?>
        <div class="alert alert-<?= $messageType ?>">
          <i class="fas fa-exclamation-circle"></i>
          <?= htmlspecialchars($message) ?>
        </div>
      <?php endif; ?>

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
                  required 
                  placeholder="نام و نام خانوادگی را وارد کنید"
                  autofocus
                >
              </div>
              <small class="help-text">نام کامل کاربر را وارد کنید</small>
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
                  required 
                  placeholder="مثلاً 09123456789"
                  dir="ltr"
                >
              </div>
              <small class="help-text">شماره موبایل ۱۱ رقمی را وارد کنید</small>
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
                  placeholder="مثلاً 1234567890"
                  dir="ltr"
                >
              </div>
              <small class="help-text">کد ملی ۱۰ رقمی را وارد کنید</small>
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
                  placeholder="example@email.com"
                  dir="ltr"
                >
              </div>
              <small class="help-text">آدرس ایمیل کاربر را وارد کنید</small>
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
                  <option value="user">کاربر عادی</option>
                  <option value="admin">مدیر</option>
                  <option value="super_admin">مدیر کل</option>
                </select>
              </div>
              <small class="help-text">نقش و دسترسی کاربر در سیستم</small>
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
                ></textarea>
              </div>
              <small class="help-text">آدرس کامل محل سکونت یا محل کار</small>
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
                  تاریخ ثبت به‌طور خودکار ذخیره می‌شود.
                </span>
              </div>
            </div>
          </div>

          <!-- ===== دکمه‌های عملیات ===== -->
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-lg">
              <i class="fas fa-save"></i> ذخیره کاربر
            </button>
            <button type="reset" class="btn btn-secondary">
              <i class="fas fa-undo"></i> بازنشانی
            </button>
            <a href="users.php" class="btn btn-outline">
              <i class="fas fa-times"></i> انصراف
            </a>
          </div>
        </form>
      </section>
    </main>
  </div>

  <script>
    // ===== اعتبارسنجی سمت کاربر =====
    document.addEventListener('DOMContentLoaded', function() {
      const form = document.querySelector('form');
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