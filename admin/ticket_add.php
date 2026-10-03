<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$message = '';
$messageType = '';

// دریافت لیست کاربران برای انتخاب
$users = getAllUsers($pdo);

// دریافت شماره موبایل از پارامترهای GET
$userPhone = trim($_GET['user_phone'] ?? $_GET['phone'] ?? $_GET['userPhone'] ?? '');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $userPhone = trim($_POST['user_phone'] ?? '');
    $title = trim($_POST['title'] ?? '');
    $description = trim($_POST['description'] ?? '');
    $status = trim($_POST['status'] ?? 'pending');
    $category = trim($_POST['category'] ?? 'سایر');
    $department = trim($_POST['department'] ?? '');
    $priority = trim($_POST['priority'] ?? 'medium');

    if ($userPhone !== '' && $title !== '' && $description !== '') {
        createTicket($pdo, [
          'user_phone' => $userPhone,
          'title' => $title,
          'description' => $description,
          'status' => $status,
          'reply' => '',
          'category' => $category,
          'department' => $department,
          'priority' => $priority,
        ]);
        
        eplakRedirect('tickets.php?success=1');
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
  <title>افزودن تیکت جدید</title>
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
            <i class="fas fa-plus-circle" style="color: var(--primary-500); margin-left: 12px;"></i>
            افزودن تیکت جدید
          </h1>
          <p>ثبت درخواست جدید برای کاربر</p>
        </div>
        <div class="topbar-right">
          <a href="tickets.php" class="btn btn-secondary">
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
          <!-- ===== ردیف ۱: شماره موبایل و عنوان ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="user_phone">
                <i class="fas fa-phone" style="color: var(--primary-500); margin-left: 6px;"></i>
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
              <small class="help-text">شماره موبایل کاربری که تیکت برای او ثبت می‌شود</small>
            </div>

            <div class="form-group">
              <label for="title">
                <i class="fas fa-tag" style="color: var(--primary-500); margin-left: 6px;"></i>
                عنوان تیکت <span class="required">*</span>
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-heading input-icon"></i>
                <input 
                  type="text" 
                  id="title"
                  name="title" 
                  class="form-control" 
                  required 
                  placeholder="عنوان تیکت را وارد کنید"
                >
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۲: دسته‌بندی و واحد ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="category">
                <i class="fas fa-folder" style="color: var(--primary-500); margin-left: 6px;"></i>
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
                  <option value="پشتیبانی" selected>پشتیبانی</option>
                  <option value="فروش">فروش</option>
                  <option value="بازاریابی">بازاریابی</option>
                  <option value="منابع انسانی">منابع انسانی</option>
                  <option value="فناوری اطلاعات">فناوری اطلاعات</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="department">
                <i class="fas fa-building" style="color: var(--primary-500); margin-left: 6px;"></i>
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

          <!-- ===== ردیف ۳: اولویت و وضعیت ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="priority">
                <i class="fas fa-flag" style="color: var(--primary-500); margin-left: 6px;"></i>
                اولویت
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-signal input-icon"></i>
                <select id="priority" name="priority" class="form-control">
                  <option value="low">
                    <i class="fas fa-arrow-down" style="color: #22c55e;"></i> پایین
                  </option>
                  <option value="medium" selected>
                    <i class="fas fa-minus" style="color: #f59e0b;"></i> متوسط
                  </option>
                  <option value="high">
                    <i class="fas fa-arrow-up" style="color: #ef4444;"></i> بالا
                  </option>
                  <option value="critical">
                    <i class="fas fa-exclamation-triangle" style="color: #dc2626;"></i> بحرانی
                  </option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="status">
                <i class="fas fa-check-circle" style="color: var(--primary-500); margin-left: 6px;"></i>
                وضعیت
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-flag input-icon"></i>
                <select id="status" name="status" class="form-control">
                  <option value="pending" selected>
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
          </div>

          <!-- ===== ردیف ۴: توضیحات ===== -->
          <div class="form-row">
            <div class="form-group full-width">
              <label for="description">
                <i class="fas fa-align-left" style="color: var(--primary-500); margin-left: 6px;"></i>
                توضیحات تیکت <span class="required">*</span>
              </label>
              <textarea 
                id="description"
                name="description" 
                class="form-control" 
                rows="6" 
                required 
                placeholder="توضیحات کامل تیکت را وارد کنید..."
              ></textarea>
              <small class="help-text">توضیحات کامل و دقیق درخواست را بنویسید</small>
            </div>
          </div>

          <!-- ===== دکمه‌های عملیات ===== -->
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-lg">
              <i class="fas fa-save"></i> ذخیره تیکت
            </button>
            <button type="reset" class="btn btn-secondary">
              <i class="fas fa-undo"></i> بازنشانی
            </button>
            <a href="tickets.php" class="btn btn-outline">
              <i class="fas fa-times"></i> انصراف
            </a>
          </div>
        </form>
      </section>
    </main>
  </div>

  <script>
    // ===== پیش‌نمایش اولویت هنگام تغییر =====
    document.addEventListener('DOMContentLoaded', function() {
      const prioritySelect = document.getElementById('priority');
      
      if (prioritySelect) {
        prioritySelect.addEventListener('change', function() {
          const selectedOption = this.options[this.selectedIndex];
          const priorityText = selectedOption.textContent.trim();
          
          // به‌روزرسانی نمایش اولویت
          const priorityDisplay = document.querySelector('.priority-display');
          if (priorityDisplay) {
            const priorityMap = {
              'پایین': { color: '#22c55e', icon: 'fa-arrow-down' },
              'متوسط': { color: '#f59e0b', icon: 'fa-minus' },
              'بالا': { color: '#ef4444', icon: 'fa-arrow-up' },
              'بحرانی': { color: '#dc2626', icon: 'fa-exclamation-triangle' }
            };
            
            const priority = priorityMap[priorityText] || priorityMap['متوسط'];
            priorityDisplay.innerHTML = `<i class="fas ${priority.icon}" style="color: ${priority.color};"></i> ${priorityText}`;
          }
        });
      }
    });
  </script>
</body>
</html>