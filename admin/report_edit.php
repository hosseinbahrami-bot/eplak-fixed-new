<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$id = (int)($_GET['id'] ?? 0);
$report = getReportById($pdo, $id);
$message = '';
$messageType = '';

if (!$report) {
    eplakRedirect('reports.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $payload = [
        'user_phone' => trim($_POST['user_phone'] ?? ''),
        'title' => trim($_POST['title'] ?? ''),
        'description' => trim($_POST['description'] ?? ''),
        'category' => trim($_POST['category'] ?? 'سایر'),
        'department' => trim($_POST['department'] ?? ''),
        'sub_department' => trim($_POST['sub_department'] ?? ''),
        'location' => trim($_POST['location'] ?? ''),
        'status' => trim($_POST['status'] ?? 'pending'),
    ];

    if ($payload['user_phone'] !== '' && $payload['title'] !== '' && $payload['description'] !== '') {
        $notify = updateReport($pdo, $id, $payload);
        $report = getReportById($pdo, $id);
        $message = '✅ گزارش با موفقیت بروزرسانی شد.';
        $messageType = 'success';
        /* اگر وضعیت عوض شده باشد، کاربر اعلان می‌گیرد؛ نتیجه‌ی ارسال را همین‌جا نشان بده */
        if ($notify) {
            require_once __DIR__ . '/../shared/notify_events.php';
            $d = eplakNotifyDescribe($notify);
            $message .= ' ' . $d['text'];
            $messageType = $d['type'];
        }
    } else {
        $message = '⚠️ لطفاً موبایل، عنوان و توضیحات را وارد کنید.';
        $messageType = 'danger';
    }
}

// دریافت لیست کاربران برای انتخاب
$users = getAllUsers($pdo);

// تنظیم کد گزارش
if ($report && !isset($report['code'])) {
    $report['code'] = 'EP-1403-' . str_pad((string)((int)$report['id'] + 1000), 4, '0', STR_PAD_LEFT);
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ویرایش گزارش</title>
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
            ویرایش گزارش
          </h1>
          <p>
            <span class="badge-code" style="margin-left: 8px;">#<?= htmlspecialchars($report['code'] ?? '') ?></span>
            بروزرسانی اطلاعات و وضعیت گزارش
          </p>
        </div>
        <div class="topbar-right">
          <a href="report_detail.php?id=<?= (int)$report['id'] ?>" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
          <a href="report_detail.php?id=<?= (int)$report['id'] ?>" class="btn btn-primary">
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
                  value="<?= htmlspecialchars($report['user_phone']) ?>" 
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
              <small class="help-text">شماره موبایل کاربری که گزارش برای او ثبت شده است</small>
            </div>

            <div class="form-group">
              <label for="title">
                <i class="fas fa-tag" style="color: var(--primary-500); margin-left: 6px;"></i>
                عنوان گزارش <span class="required">*</span>
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-heading input-icon"></i>
                <input 
                  type="text" 
                  id="title"
                  name="title" 
                  class="form-control" 
                  value="<?= htmlspecialchars($report['title']) ?>" 
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
                <i class="fas fa-folder" style="color: var(--primary-500); margin-left: 6px;"></i>
                دسته‌بندی
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-folder-open input-icon"></i>
                <select id="category" name="category" class="form-control">
                  <option value="سایر" <?= $report['category'] === 'سایر' ? 'selected' : '' ?>>سایر</option>
                  <option value="فنی" <?= $report['category'] === 'فنی' ? 'selected' : '' ?>>فنی</option>
                  <option value="اداری" <?= $report['category'] === 'اداری' ? 'selected' : '' ?>>اداری</option>
                  <option value="مالی" <?= $report['category'] === 'مالی' ? 'selected' : '' ?>>مالی</option>
                  <option value="حقوقی" <?= $report['category'] === 'حقوقی' ? 'selected' : '' ?>>حقوقی</option>
                  <option value="پشتیبانی" <?= $report['category'] === 'پشتیبانی' ? 'selected' : '' ?>>پشتیبانی</option>
                  <option value="فروش" <?= $report['category'] === 'فروش' ? 'selected' : '' ?>>فروش</option>
                  <option value="بازاریابی" <?= $report['category'] === 'بازاریابی' ? 'selected' : '' ?>>بازاریابی</option>
                  <option value="منابع انسانی" <?= $report['category'] === 'منابع انسانی' ? 'selected' : '' ?>>منابع انسانی</option>
                  <option value="فناوری اطلاعات" <?= $report['category'] === 'فناوری اطلاعات' ? 'selected' : '' ?>>فناوری اطلاعات</option>
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
                  value="<?= htmlspecialchars($report['department'] ?? '') ?>" 
                  placeholder="نام واحد را وارد کنید"
                >
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۳: زیرواحد و موقعیت ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="sub_department">
                <i class="fas fa-sitemap" style="color: var(--primary-500); margin-left: 6px;"></i>
                زیرواحد
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-sitemap input-icon"></i>
                <input 
                  type="text" 
                  id="sub_department"
                  name="sub_department" 
                  class="form-control" 
                  value="<?= htmlspecialchars($report['sub_department'] ?? '') ?>" 
                  placeholder="زیرواحد مربوطه را وارد کنید"
                >
              </div>
            </div>

            <div class="form-group">
              <label for="location">
                <i class="fas fa-map-pin" style="color: var(--primary-500); margin-left: 6px;"></i>
                موقعیت
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-map-marker-alt input-icon"></i>
                <input 
                  type="text" 
                  id="location"
                  name="location" 
                  class="form-control" 
                  value="<?= htmlspecialchars($report['location'] ?? '') ?>" 
                  placeholder="موقعیت مکانی را وارد کنید"
                >
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۴: وضعیت ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="status">
                <i class="fas fa-check-circle" style="color: var(--primary-500); margin-left: 6px;"></i>
                وضعیت
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-flag input-icon"></i>
                <select id="status" name="status" class="form-control">
                  <option value="pending" <?= normalizeStatusValue($report['status']) === 'pending' ? 'selected' : '' ?>>
                    در انتظار
                  </option>
                  <option value="in_progress" <?= normalizeStatusValue($report['status']) === 'in_progress' ? 'selected' : '' ?>>
                    در حال رسیدگی
                  </option>
                  <option value="done" <?= normalizeStatusValue($report['status']) === 'done' ? 'selected' : '' ?>>
                    انجام شد
                  </option>
                </select>
              </div>
            </div>

            <div class="form-group" style="display: flex; align-items: flex-end;">
              <div style="display: flex; gap: 12px; flex-wrap: wrap; width: 100%;">
                <div class="status-preview-box" style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: var(--dark-50); border-radius: var(--radius-md); border: 1px solid var(--dark-200);">
                  <i class="fas fa-info-circle" style="color: var(--dark-400);"></i>
                  <span style="font-size: 13px; color: var(--dark-500);">وضعیت فعلی: </span>
                  <span class="status-preview <?= normalizeStatusValue($report['status']) === 'done' ? 'status-done' : (normalizeStatusValue($report['status']) === 'in_progress' ? 'status-progress' : 'status-pending') ?>">
                    <?php
                      $currentStatus = normalizeStatusValue($report['status']);
                      if ($currentStatus === 'done') {
                        echo '<i class="fas fa-check-circle"></i> انجام شد';
                      } elseif ($currentStatus === 'in_progress') {
                        echo '<i class="fas fa-spinner fa-spin"></i> در حال رسیدگی';
                      } else {
                        echo '<i class="fas fa-hourglass-half"></i> در انتظار';
                      }
                    ?>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۵: توضیحات ===== -->
          <div class="form-row">
            <div class="form-group full-width">
              <label for="description">
                <i class="fas fa-align-left" style="color: var(--primary-500); margin-left: 6px;"></i>
                توضیحات گزارش <span class="required">*</span>
              </label>
              <textarea 
                id="description"
                name="description" 
                class="form-control" 
                rows="6" 
                required 
                placeholder="توضیحات کامل گزارش را وارد کنید..."
              ><?= htmlspecialchars($report['description']) ?></textarea>
              <small class="help-text">توضیحات کامل و دقیق گزارش را بنویسید</small>
            </div>
          </div>

          <!-- ===== اطلاعات تکمیلی ===== -->
          <div class="form-row">
            <div class="form-group full-width">
              <div style="display: flex; gap: 24px; flex-wrap: wrap; padding: 12px 16px; background: var(--dark-50); border-radius: var(--radius-md); border: 1px solid var(--dark-200);">
                <span style="font-size: 13px; color: var(--dark-500);">
                  <i class="fas fa-hashtag" style="color: var(--dark-400);"></i>
                  کد گزارش: <strong style="color: var(--dark-900);">#<?= htmlspecialchars($report['code'] ?? '') ?></strong>
                </span>
                <span style="font-size: 13px; color: var(--dark-500);">
                  <i class="fas fa-calendar" style="color: var(--dark-400);"></i>
                  تاریخ ثبت: <strong style="color: var(--dark-900);"><?= htmlspecialchars($report['created_at']) ?></strong>
                </span>
                <?php if (!empty($report['updated_at']) && $report['updated_at'] !== $report['created_at']): ?>
                  <span style="font-size: 13px; color: var(--dark-500);">
                    <i class="fas fa-edit" style="color: var(--dark-400);"></i>
                    آخرین بروزرسانی: <strong style="color: var(--dark-900);"><?= htmlspecialchars($report['updated_at']) ?></strong>
                  </span>
                <?php endif; ?>
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
            <a href="report_detail.php?id=<?= (int)$report['id'] ?>" class="btn btn-outline">
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
            'in_progress': { class: 'status-progress', icon: 'fa-spinner fa-spin', text: 'در حال رسیدگی' },
            'done': { class: 'status-done', icon: 'fa-check-circle', text: 'انجام شد' }
          };
          
          const status = statusMap[this.value] || statusMap['pending'];
          statusPreview.className = 'status-preview ' + status.class;
          statusPreview.innerHTML = `<i class="fas ${status.icon}"></i> ${status.text}`;
        });
      }
    });
  </script>
</body>
</html>