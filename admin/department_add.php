<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$message = '';
$messageType = '';
$parents = getAllDepartments($pdo);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $name = trim($_POST['name'] ?? '');
    $slug = trim($_POST['slug'] ?? '');
    $code = trim($_POST['code'] ?? '');
    $parentId = isset($_POST['parent_id']) && $_POST['parent_id'] !== '' ? (int)$_POST['parent_id'] : null;
    $sortOrder = isset($_POST['sort_order']) ? (int)$_POST['sort_order'] : 0;
    $isActive = isset($_POST['is_active']) ? 1 : 0;
    $description = trim($_POST['description'] ?? '');
    $icon = trim($_POST['icon'] ?? 'fa-building');
    $color = trim($_POST['color'] ?? '#0f766e');

    if ($name !== '') {
        // ساخت slug از نام اگر وارد نشده باشد
        if (empty($slug)) {
            $slug = str_replace(' ', '-', preg_replace('/[^a-zA-Z0-9آ-ی\s]/', '', $name));
            $slug = strtolower(trim($slug, '-'));
        }

        $id = createDepartment($pdo, [
            'name' => $name,
            'slug' => $slug,
            'code' => $code,
            'parent_id' => $parentId,
            'sort_order' => $sortOrder,
            'is_active' => $isActive,
            'description' => $description,
            'icon' => $icon,
            'color' => $color,
        ]);

        if ($id > 0) {
            eplakRedirect('departments.php?success=1');
            exit;
        } else {
            $message = '⚠️ خطا در ذخیره‌سازی واحد. ممکن است کد یا slug تکراری باشد.';
            $messageType = 'danger';
        }
    } else {
        $message = '⚠️ لطفاً نام واحد را وارد کنید.';
        $messageType = 'danger';
    }
}

// لیست آیکون‌های پیشنهادی
$suggestedIcons = [
    'fa-building' => 'ساختمان',
    'fa-user-tie' => 'مدیریت',
    'fa-users' => 'کاربران',
    'fa-laptop-code' => 'فناوری اطلاعات',
    'fa-hard-hat' => 'عمرانی',
    'fa-city' => 'شهرسازی',
    'fa-broom' => 'خدمات شهری',
    'fa-bus' => 'حمل و نقل',
    'fa-music' => 'فرهنگی',
    'fa-chart-pie' => 'برنامه‌ریزی',
    'fa-coins' => 'مالی',
    'fa-recycle' => 'پسماند',
    'fa-tree' => 'فضای سبز',
    'fa-truck' => 'تدارکات',
    'fa-gavel' => 'حقوقی',
    'fa-shield-alt' => 'حراست',
    'fa-handshake' => 'روابط عمومی',
    'fa-search' => 'بازرسی',
];
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>افزودن واحد جدید</title>
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
        <a href="users.php"><i class="fas fa-users"></i> <span>کاربران</span></a>
        <a class="active" href="departments.php"><i class="fas fa-sitemap"></i> <span>واحدها</span></a>
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
            افزودن واحد جدید
          </h1>
          <p>تعریف واحد اصلی یا زیرواحد برای سیستم گزارش‌گیری</p>
        </div>
        <div class="topbar-right">
          <a href="departments.php" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
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
          <!-- ===== ردیف ۱: عنوان واحد و Slug ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="name">
                <i class="fas fa-building" style="color: var(--primary-500); margin-left: 6px;"></i>
                عنوان واحد <span class="required">*</span>
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-building input-icon"></i>
                <input 
                  type="text" 
                  id="name"
                  name="name" 
                  class="form-control" 
                  required 
                  placeholder="نام واحد را وارد کنید"
                  autofocus
                >
              </div>
              <small class="help-text">نام کامل واحد سازمانی را وارد کنید</small>
            </div>

            <div class="form-group">
              <label for="slug">
                <i class="fas fa-link" style="color: var(--primary-500); margin-left: 6px;"></i>
                Slug (نام یکتا)
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-link input-icon"></i>
                <input 
                  type="text" 
                  id="slug"
                  name="slug" 
                  class="form-control" 
                  placeholder="به‌طور خودکار تولید می‌شود"
                  dir="ltr"
                >
              </div>
              <small class="help-text">برای URL استفاده می‌شود - در صورت خالی بودن خودکار ساخته می‌شود</small>
            </div>
          </div>

          <!-- ===== ردیف ۲: کد اختصاری و واحد والد ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="code">
                <i class="fas fa-hashtag" style="color: var(--primary-500); margin-left: 6px;"></i>
                کد اختصاری
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-hashtag input-icon"></i>
                <input 
                  type="text" 
                  id="code"
                  name="code" 
                  class="form-control" 
                  placeholder="مثلاً IT"
                  dir="ltr"
                >
              </div>
              <small class="help-text">کد اختصاری واحد (باید یکتا باشد)</small>
            </div>

            <div class="form-group">
              <label for="parent_id">
                <i class="fas fa-level-up-alt" style="color: var(--primary-500); margin-left: 6px;"></i>
                واحد والد
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-sitemap input-icon"></i>
                <select id="parent_id" name="parent_id" class="form-control">
                  <option value="">بدون والد (واحد اصلی)</option>
                  <?php foreach ($parents as $parent): ?>
                    <?php if ((int)($parent['parent_id'] ?? 0) === 0): ?>
                      <option value="<?= (int)$parent['id'] ?>">
                        <?= htmlspecialchars($parent['name']) ?>
                      </option>
                    <?php endif; ?>
                  <?php endforeach; ?>
                </select>
              </div>
              <small class="help-text">واحد بالادستی این واحد را انتخاب کنید</small>
            </div>
          </div>

          <!-- ===== ردیف ۳: ترتیب نمایش و وضعیت ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="sort_order">
                <i class="fas fa-sort" style="color: var(--primary-500); margin-left: 6px;"></i>
                ترتیب نمایش
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-sort-numeric-down input-icon"></i>
                <input 
                  type="number" 
                  id="sort_order"
                  name="sort_order" 
                  class="form-control" 
                  min="0" 
                  value="0"
                  placeholder="۰"
                >
              </div>
              <small class="help-text">اعداد کوچکتر در ابتدا نمایش داده می‌شوند</small>
            </div>

            <div class="form-group">
              <label for="is_active">
                <i class="fas fa-toggle-on" style="color: var(--primary-500); margin-left: 6px;"></i>
                وضعیت
              </label>
              <div style="display: flex; align-items: center; gap: 12px; padding: 10px 0;">
                <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer; margin: 0;">
                  <input type="checkbox" id="is_active" name="is_active" checked style="width: 20px; height: 20px; accent-color: var(--primary-500); cursor: pointer;">
                  <span style="font-size: 14px; color: var(--dark-600);">واحد فعال باشد</span>
                </label>
                <span id="statusLabel" style="font-size: 13px; padding: 2px 12px; border-radius: var(--radius-full); background: var(--success-bg); color: var(--success);">
                  فعال
                </span>
              </div>
              <small class="help-text">در صورت غیرفعال بودن، واحد در لیست‌ها نمایش داده نمی‌شود</small>
            </div>
          </div>

          <!-- ===== ردیف ۴: آیکون و رنگ ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="icon">
                <i class="fas fa-icons" style="color: var(--primary-500); margin-left: 6px;"></i>
                آیکون
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-icons input-icon"></i>
                <select id="icon" name="icon" class="form-control">
                  <?php foreach ($suggestedIcons as $iconClass => $iconName): ?>
                    <option value="<?= $iconClass ?>" <?= $iconClass === 'fa-building' ? 'selected' : '' ?>>
                      <i class="fas <?= $iconClass ?>"></i> <?= $iconName ?>
                    </option>
                  <?php endforeach; ?>
                  <option value="custom">سفارشی...</option>
                </select>
              </div>
              <small class="help-text">آیکون نمایش داده شده در کنار نام واحد</small>
            </div>

            <div class="form-group">
              <label for="color">
                <i class="fas fa-palette" style="color: var(--primary-500); margin-left: 6px;"></i>
                رنگ
              </label>
              <div style="display: flex; align-items: center; gap: 12px;">
                <input 
                  type="color" 
                  id="color"
                  name="color" 
                  class="form-control" 
                  value="#0f766e"
                  style="width: 60px; height: 44px; padding: 2px; cursor: pointer;"
                >
                <span id="colorPreview" style="display: inline-block; width: 20px; height: 20px; border-radius: 50%; background: #0f766e; border: 2px solid var(--dark-200);"></span>
                <span style="font-size: 13px; color: var(--dark-500);" id="colorValue">#0f766e</span>
              </div>
              <small class="help-text">رنگ اختصاصی واحد</small>
            </div>
          </div>

          <!-- ===== ردیف ۵: توضیحات ===== -->
          <div class="form-row">
            <div class="form-group full-width">
              <label for="description">
                <i class="fas fa-align-left" style="color: var(--primary-500); margin-left: 6px;"></i>
                توضیحات
              </label>
              <textarea 
                id="description"
                name="description" 
                class="form-control" 
                rows="4" 
                placeholder="توضیحات مربوط به این واحد را وارد کنید..."
              ></textarea>
              <small class="help-text">توضیحات تکمیلی درباره واحد (اختیاری)</small>
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
                <span style="font-size: 13px; color: var(--dark-500);">
                  <i class="fas fa-globe" style="color: var(--dark-400);"></i>
                  Slug باید یکتا باشد.
                </span>
                <span style="font-size: 13px; color: var(--dark-500);">
                  <i class="fas fa-hashtag" style="color: var(--dark-400);"></i>
                  کد باید یکتا باشد.
                </span>
              </div>
            </div>
          </div>

          <!-- ===== دکمه‌های عملیات ===== -->
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-lg">
              <i class="fas fa-save"></i> ذخیره واحد
            </button>
            <button type="reset" class="btn btn-secondary">
              <i class="fas fa-undo"></i> بازنشانی
            </button>
            <a href="departments.php" class="btn btn-outline">
              <i class="fas fa-times"></i> انصراف
            </a>
          </div>
        </form>
      </section>
    </main>
  </div>

  <script>
    // ===== به‌روزرسانی برچسب وضعیت =====
    document.addEventListener('DOMContentLoaded', function() {
      const isActiveCheckbox = document.getElementById('is_active');
      const statusLabel = document.getElementById('statusLabel');
      
      if (isActiveCheckbox && statusLabel) {
        isActiveCheckbox.addEventListener('change', function() {
          if (this.checked) {
            statusLabel.textContent = 'فعال';
            statusLabel.style.background = 'var(--success-bg)';
            statusLabel.style.color = 'var(--success)';
          } else {
            statusLabel.textContent = 'غیرفعال';
            statusLabel.style.background = 'var(--danger-bg)';
            statusLabel.style.color = 'var(--danger)';
          }
        });
      }

      // ===== پیش‌نمایش رنگ =====
      const colorInput = document.getElementById('color');
      const colorPreview = document.getElementById('colorPreview');
      const colorValue = document.getElementById('colorValue');
      
      if (colorInput && colorPreview && colorValue) {
        colorInput.addEventListener('input', function() {
          colorPreview.style.background = this.value;
          colorValue.textContent = this.value;
        });
      }

      // ===== تولید خودکار slug از نام =====
      const nameInput = document.getElementById('name');
      const slugInput = document.getElementById('slug');
      
      if (nameInput && slugInput) {
        nameInput.addEventListener('input', function() {
          // اگر slug خالی باشد یا کاربر هنوز آن را تغییر نداده باشد
          if (!slugInput.dataset.userEdited) {
            const slug = this.value
              .replace(/[^a-zA-Z0-9آ-ی\s]/g, '')
              .replace(/\s+/g, '-')
              .toLowerCase()
              .trim('-');
            slugInput.value = slug;
          }
        });

        slugInput.addEventListener('input', function() {
          this.dataset.userEdited = 'true';
        });
      }

      // ===== آیکون سفارشی =====
      const iconSelect = document.getElementById('icon');
      if (iconSelect) {
        iconSelect.addEventListener('change', function() {
          if (this.value === 'custom') {
            const customIcon = prompt('نام آیکون FontAwesome را وارد کنید (مثلاً fa-star):', 'fa-star');
            if (customIcon && customIcon.trim() !== '') {
              // اضافه کردن گزینه جدید
              const option = document.createElement('option');
              option.value = customIcon.trim();
              option.textContent = '🔹 ' + customIcon.trim() + ' (سفارشی)';
              this.insertBefore(option, this.lastElementChild);
              this.value = customIcon.trim();
            } else {
              this.value = 'fa-building';
            }
          }
        });
      }
    });
  </script>
</body>
</html>