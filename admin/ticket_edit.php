<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$id = (int)($_GET['id'] ?? 0);
$ticket = getTicketById($pdo, $id);
$message = '';
$messageType = '';

if (!$ticket) {
    eplakRedirect('tickets.php');
    exit;
}

// دریافت لیست کاربران برای انتخاب
$users = getAllUsers($pdo);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $userPhone = trim($_POST['user_phone'] ?? '');
    $title = trim($_POST['title'] ?? '');
    $description = trim($_POST['description'] ?? '');
    $reply = trim($_POST['reply'] ?? '');
    $status = trim($_POST['status'] ?? 'pending');
    $category = trim($_POST['category'] ?? 'سایر');
    $department = trim($_POST['department'] ?? '');
    $priority = trim($_POST['priority'] ?? 'medium');

    if ($userPhone !== '' && $title !== '' && $description !== '') {
        saveTicketDetails($pdo, $id, $title, $description, $userPhone, $reply, normalizeStatusValue($status), $category, $department, $priority);
        $ticket = getTicketById($pdo, $id);
        $message = '✅ تیکت با موفقیت بروزرسانی شد.';
        $messageType = 'success';
    } else {
        $message = '⚠️ لطفاً موبایل، عنوان و توضیحات را وارد کنید.';
        $messageType = 'danger';
    }
}

// تنظیم کد تیکت
if (!isset($ticket['code'])) {
    $ticket['code'] = 'TK-1403-' . str_pad((string)((int)$ticket['id'] + 1000), 4, '0', STR_PAD_LEFT);
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ویرایش تیکت</title>
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
            <i class="fas fa-pen" style="color: var(--primary-500); margin-left: 12px;"></i>
            ویرایش تیکت
          </h1>
          <p>
            <span class="badge-code" style="margin-left: 8px;">#<?= htmlspecialchars($ticket['code'] ?? '') ?></span>
            بروزرسانی پاسخ و وضعیت
          </p>
        </div>
        <div class="topbar-right">
          <a href="ticket_detail.php?id=<?= (int)$ticket['id'] ?>" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
          <a href="ticket_detail.php?id=<?= (int)$ticket['id'] ?>" class="btn btn-primary">
            <i class="fas fa-eye"></i> مشاهده
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
                  value="<?= htmlspecialchars($ticket['user_phone']) ?>" 
                  required 
                  placeholder="مثلاً 09123456789"
                  list="userPhoneList"
                >
                <datalist id="userPhoneList">
                  <?php foreach ($users as $user): ?>
                    <option value="<?= htmlspecialchars($user['phone']) ?>">
                      <?= htmlspecialchars($user['name'] . ' - ' . $user['phone']) ?>
                    </option>
                  <?php endforeach; ?>
                </datalist>
              </div>
              <small class="help-text">شماره موبایل کاربری که تیکت برای او ثبت شده است</small>
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
                  value="<?= htmlspecialchars($ticket['title']) ?>" 
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
                  <option value="سایر" <?= ($ticket['category'] ?? '') === 'سایر' ? 'selected' : '' ?>>سایر</option>
                  <option value="فنی" <?= ($ticket['category'] ?? '') === 'فنی' ? 'selected' : '' ?>>فنی</option>
                  <option value="اداری" <?= ($ticket['category'] ?? '') === 'اداری' ? 'selected' : '' ?>>اداری</option>
                  <option value="مالی" <?= ($ticket['category'] ?? '') === 'مالی' ? 'selected' : '' ?>>مالی</option>
                  <option value="حقوقی" <?= ($ticket['category'] ?? '') === 'حقوقی' ? 'selected' : '' ?>>حقوقی</option>
                  <option value="پشتیبانی" <?= ($ticket['category'] ?? '') === 'پشتیبانی' ? 'selected' : '' ?>>پشتیبانی</option>
                  <option value="فروش" <?= ($ticket['category'] ?? '') === 'فروش' ? 'selected' : '' ?>>فروش</option>
                  <option value="بازاریابی" <?= ($ticket['category'] ?? '') === 'بازاریابی' ? 'selected' : '' ?>>بازاریابی</option>
                  <option value="منابع انسانی" <?= ($ticket['category'] ?? '') === 'منابع انسانی' ? 'selected' : '' ?>>منابع انسانی</option>
                  <option value="فناوری اطلاعات" <?= ($ticket['category'] ?? '') === 'فناوری اطلاعات' ? 'selected' : '' ?>>فناوری اطلاعات</option>
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
                  value="<?= htmlspecialchars($ticket['department'] ?? '') ?>" 
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
                  <option value="low" <?= ($ticket['priority'] ?? '') === 'low' ? 'selected' : '' ?>>پایین</option>
                  <option value="medium" <?= ($ticket['priority'] ?? 'medium') === 'medium' ? 'selected' : '' ?>>متوسط</option>
                  <option value="high" <?= ($ticket['priority'] ?? '') === 'high' ? 'selected' : '' ?>>بالا</option>
                  <option value="critical" <?= ($ticket['priority'] ?? '') === 'critical' ? 'selected' : '' ?>>بحرانی</option>
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
                  <option value="pending" <?= normalizeStatusValue($ticket['status']) === 'pending' ? 'selected' : '' ?>>
                    در انتظار
                  </option>
                  <option value="in_progress" <?= normalizeStatusValue($ticket['status']) === 'in_progress' ? 'selected' : '' ?>>
                    در حال رسیدگی
                  </option>
                  <option value="done" <?= normalizeStatusValue($ticket['status']) === 'done' ? 'selected' : '' ?>>
                    انجام شد
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
                rows="5" 
                required 
                placeholder="توضیحات کامل تیکت را وارد کنید..."
              ><?= htmlspecialchars($ticket['description']) ?></textarea>
            </div>
          </div>

          <!-- ===== ردیف ۵: پاسخ ===== -->
          <div class="form-row">
            <div class="form-group full-width">
              <label for="reply">
                <i class="fas fa-comment" style="color: var(--primary-500); margin-left: 6px;"></i>
                پاسخ
              </label>
              <textarea 
                id="reply"
                name="reply" 
                class="form-control" 
                rows="6" 
                placeholder="پاسخ خود را برای کاربر وارد کنید..."
              ><?= htmlspecialchars($ticket['reply'] ?? '') ?></textarea>
              <small class="help-text">پاسخ شما برای کاربر نمایش داده خواهد شد</small>
            </div>
          </div>

          <!-- ===== اطلاعات تکمیلی ===== -->
          <div class="form-row">
            <div class="form-group full-width">
              <div class="report-meta-info">
                <span>
                  <i class="fas fa-hashtag" style="color: var(--dark-400);"></i>
                  کد تیکت: <strong>#<?= htmlspecialchars($ticket['code'] ?? '') ?></strong>
                </span>
                <span>
                  <i class="fas fa-calendar" style="color: var(--dark-400);"></i>
                  تاریخ ثبت: <strong><?= htmlspecialchars($ticket['created_at']) ?></strong>
                </span>
                <?php if (!empty($ticket['updated_at']) && $ticket['updated_at'] !== $ticket['created_at']): ?>
                  <span>
                    <i class="fas fa-edit" style="color: var(--dark-400);"></i>
                    آخرین بروزرسانی: <strong><?= htmlspecialchars($ticket['updated_at']) ?></strong>
                  </span>
                <?php endif; ?>
                <span>
                  <i class="fas fa-flag" style="color: var(--dark-400);"></i>
                  وضعیت فعلی:
                  <span class="<?= normalizeStatusValue($ticket['status']) === 'done' ? 'status-done' : (normalizeStatusValue($ticket['status']) === 'in_progress' ? 'status-progress' : 'status-pending') ?>" style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 2px 12px;">
                    <?php if (normalizeStatusValue($ticket['status']) === 'done'): ?>
                      <i class="fas fa-check-circle"></i> انجام شد
                    <?php elseif (normalizeStatusValue($ticket['status']) === 'in_progress'): ?>
                      <i class="fas fa-spinner fa-spin"></i> در حال رسیدگی
                    <?php else: ?>
                      <i class="fas fa-hourglass-half"></i> در انتظار
                    <?php endif; ?>
                  </span>
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
            <a href="ticket_detail.php?id=<?= (int)$ticket['id'] ?>" class="btn btn-outline">
              <i class="fas fa-times"></i> انصراف
            </a>
            <a href="actions.php?type=ticket_delete&id=<?= (int)$ticket['id'] ?><?= eplakCsrfQuery() ?>" class="btn btn-danger" onclick="return confirm('آیا از حذف این تیکت اطمینان دارید؟')">
              <i class="fas fa-trash"></i> حذف تیکت
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
          
          // به‌روزرسانی نمایش اولویت در اطلاعات تکمیلی
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