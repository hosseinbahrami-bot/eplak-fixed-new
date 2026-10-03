<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$message = '';
$messageType = 'danger';
$userPhone = trim($_GET['user_phone'] ?? $_GET['phone'] ?? $_GET['userPhone'] ?? '');

// دریافت لیست کاربران برای انتخاب
$users = getAllUsers($pdo);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $userPhone = trim($_POST['user_phone'] ?? $_POST['phone'] ?? '');
    $title = trim($_POST['title'] ?? '');
    $description = trim($_POST['description'] ?? '');
    $category = trim($_POST['category'] ?? 'سایر');
    $department = trim($_POST['department'] ?? '');
    $subDepartment = trim($_POST['sub_department'] ?? '');
    $location = trim($_POST['location'] ?? '');
    $status = trim($_POST['status'] ?? 'pending');

    if ($userPhone !== '' && $title !== '' && $description !== '') {
        createReport($pdo, [
            'user_phone' => $userPhone,
            'title' => $title,
            'description' => $description,
            'category' => $category,
            'department' => $department,
            'sub_department' => $subDepartment,
            'location' => $location,
            'status' => $status,
        ]);

        eplakRedirect('reports.php?success=1');
        exit;
    }

    $message = '⚠️ لطفاً موبایل، عنوان و توضیحات را وارد کنید.';
    $messageType = 'danger';
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>افزودن گزارش جدید</title>
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
        <a class="active" href="reports.php"><i class="fas fa-flag"></i> <span>گزارش‌ها</span></a>
        <a href="tickets.php"><i class="fas fa-ticket-alt"></i> <span>تیکت‌ها</span></a>
        <a href="users.php"><i class="fas fa-users"></i> <span>کاربران</span></a>
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
            <i class="fas fa-plus-circle" style="color: #0f766e; margin-left: 12px;"></i>
            افزودن گزارش جدید
          </h1>
          <p>ثبت گزارش برای کاربر یا نقش مدیر</p>
        </div>
        <div class="topbar-right">
          <a href="reports.php" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
        </div>
      </header>

      <section class="panel">
        <?php if ($message): ?>
          <div class="alert alert-<?= $messageType ?>">
            <?= htmlspecialchars($message) ?>
          </div>
        <?php endif; ?>

        <form method="post" class="report-form">
<?= eplakCsrfField() ?>
          <!-- ===== ردیف ۱: شماره موبایل و عنوان ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="user_phone">
                <i class="fas fa-phone" style="color: #0f766e; margin-left: 6px;"></i>
                شماره موبایل <span class="required">*</span>
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-user input-icon"></i>
                <input 
                  type="text" 
                  id="user_phone"
                  name="user_phone" 
                  class="form-control" 
                  value="<?= htmlspecialchars($userPhone) ?>" 
                  required 
                  placeholder="مثلاً 09123456789"
                  list="userPhoneList"
                  autofocus
                >
                <datalist id="userPhoneList">
                  <?php foreach ($users as $user): ?>
                    <option value="<?= htmlspecialchars($user['phone']) ?>">
                      <?= htmlspecialchars($user['name'] . ' - ' . $user['phone']) ?>
                    </option>
                  <?php endforeach; ?>
                </datalist>
              </div>
              <small class="help-text">شماره موبایل کاربری که گزارش برای او ثبت می‌شود</small>
            </div>

            <div class="form-group">
              <label for="title">
                <i class="fas fa-tag" style="color: #0f766e; margin-left: 6px;"></i>
                عنوان گزارش <span class="required">*</span>
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-heading input-icon"></i>
                <input 
                  type="text" 
                  id="title"
                  name="title" 
                  class="form-control" 
                  required 
                  placeholder="عنوان گزارش را وارد کنید"
                >
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۲: دسته‌بندی و واحد ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="category">
                <i class="fas fa-folder" style="color: #0f766e; margin-left: 6px;"></i>
                دسته‌بندی
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-folder-open input-icon"></i>
                <select id="category" name="category" class="form-control">
                  <option value="سایر">سایر</option>
                  <option value="فنی">فنی</option>
                  <option value="اداری">اداری</option>
                  <option value="مالی">مالی</option>
                  <option value="حقوقی">حقوقی</option>
                  <option value="پشتیبانی">پشتیبانی</option>
                  <option value="فروش">فروش</option>
                  <option value="بازاریابی">بازاریابی</option>
                  <option value="منابع انسانی">منابع انسانی</option>
                  <option value="فناوری اطلاعات">فناوری اطلاعات</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="department">
                <i class="fas fa-building" style="color: #0f766e; margin-left: 6px;"></i>
                واحد مربوطه
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-building input-icon"></i>
                <input 
                  type="text" 
                  id="department"
                  name="department" 
                  class="form-control" 
                  placeholder="نام واحد را وارد کنید"
                >
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۳: زیرواحد و موقعیت ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="sub_department">
                <i class="fas fa-sitemap" style="color: #0f766e; margin-left: 6px;"></i>
                زیرواحد
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-sitemap input-icon"></i>
                <input 
                  type="text" 
                  id="sub_department"
                  name="sub_department" 
                  class="form-control" 
                  placeholder="زیرواحد مربوطه را وارد کنید"
                >
              </div>
            </div>

            <div class="form-group">
              <label for="location">
                <i class="fas fa-map-pin" style="color: #0f766e; margin-left: 6px;"></i>
                موقعیت
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-map-marker-alt input-icon"></i>
                <input 
                  type="text" 
                  id="location"
                  name="location" 
                  class="form-control" 
                  placeholder="موقعیت مکانی را وارد کنید"
                >
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۴: وضعیت ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="status">
                <i class="fas fa-check-circle" style="color: #0f766e; margin-left: 6px;"></i>
                وضعیت
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-flag input-icon"></i>
                <select id="status" name="status" class="form-control">
                  <option value="pending">
                    <i class="fas fa-hourglass-half"></i> در انتظار
                  </option>
                  <option value="in_progress">
                    <i class="fas fa-spinner"></i> در حال رسیدگی
                  </option>
                  <option value="done">
                    <i class="fas fa-check-circle"></i> انجام شد
                  </option>
                </select>
              </div>
            </div>

            <div class="form-group" style="display: flex; align-items: flex-end;">
              <div style="display: flex; gap: 12px; flex-wrap: wrap; width: 100%;">
                <div class="status-preview" style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                  <i class="fas fa-info-circle" style="color: #94a3b8;"></i>
                  <span style="font-size: 13px; color: #64748b;">وضعیت پیش‌فرض: </span>
                  <span class="status-pending"><i class="fas fa-hourglass-half"></i> در انتظار</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۵: توضیحات ===== -->
          <div class="form-row">
            <div class="form-group full-width">
              <label for="description">
                <i class="fas fa-align-left" style="color: #0f766e; margin-left: 6px;"></i>
                توضیحات گزارش <span class="required">*</span>
              </label>
              <textarea 
                id="description"
                name="description" 
                class="form-control" 
                rows="6" 
                required 
                placeholder="توضیحات کامل گزارش را وارد کنید..."
              ></textarea>
              <small class="help-text">توضیحات کامل و دقیق گزارش را بنویسید</small>
            </div>
          </div>

          <!-- ===== دکمه‌های عملیات ===== -->
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-lg">
              <i class="fas fa-save"></i> ذخیره گزارش
            </button>
            <button type="reset" class="btn btn-secondary">
              <i class="fas fa-undo"></i> بازنشانی
            </button>
            <a href="reports.php" class="btn btn-outline">
              <i class="fas fa-times"></i> انصراف
            </a>
          </div>
        </form>
      </section>
    </main>
  </div>

  <script>
    // ===== پیش‌نمایش وضعیت هنگام تغییر =====
    document.addEventListener('DOMContentLoaded', function() {
      const statusSelect = document.getElementById('status');
      const statusPreview = document.querySelector('.status-preview');
      
      if (statusSelect && statusPreview) {
        statusSelect.addEventListener('change', function() {
          const statusMap = {
            'pending': { class: 'status-pending', icon: 'fa-hourglass-half', text: 'در انتظار' },
            'in_progress': { class: 'status-progress', icon: 'fa-spinner', text: 'در حال رسیدگی' },
            'done': { class: 'status-done', icon: 'fa-check-circle', text: 'انجام شد' }
          };
          
          const status = statusMap[this.value] || statusMap['pending'];
          statusPreview.className = status.class;
          statusPreview.innerHTML = `<i class="fas ${status.icon}"></i> ${status.text}`;
        });
      }
    });
  </script>
</body>
</html>