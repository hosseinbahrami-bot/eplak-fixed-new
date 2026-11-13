<?php
/* ============================================================================
   admin/admins.php — مدیریت حساب‌های مدیر (فقط «مدیر کل»)
   ----------------------------------------------------------------------------
   چرا این صفحه؟ چون کارفرما خواست برای هر حوزه/معاونت یک مدیر جدا بسازد و آن
   مدیر «فقط پیام‌های حوزه‌ی خودش» را ببیند. پیش از این پنل یک حساب بیشتر
   نداشت (admin) و ستون role هم هیچ اثری روی دسترسی نداشت.

   قواعد (طبق تصمیم کارفرما):
     • مدیرِ حوزه/معاونت: فقط «گزارش‌ها» و «تیکت‌ها»ی حوزه‌ی خودش
       (مشاهده + پاسخ + تغییر وضعیت) و داشبوردِ محدود به همان حوزه.
     • بدون دسترسی به: کاربران، واحدها، اخبار، اماکن، اعلان، خروجی اکسل،
       تنظیمات و همین صفحه‌ی مدیران.
     • حوزه‌ها فقط از «واحدهای سطح اول» انتخاب می‌شوند (حوزه شهردار و معاونت‌ها)؛
       زیرمجموعه‌های هر واحد خودکار در دامنه‌ی همان مدیر می‌آیند.
     • گزارش‌های قدیمیِ بدون حوزه فقط برای «مدیر کل» دیده می‌شوند.

   امنیت: رمز عبور همان‌جا با password_hash هش می‌شود، هرگز در پاسخ/نشانی/لاگ
   برنمی‌گردد، و همه‌ی تغییرها با توکن CSRF انجام می‌شوند.
   لایه‌ی واقعیِ دسترسی در admin/includes/acl.php است (نه فقط در منو).
   ============================================================================ */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

/* دسترسی: admins — مدیرِ حوزه/معاونت به این صفحه نمی‌رسد (admin/includes/acl.php) */
eplakRequirePermission('admins');

$eplakScope   = eplakAdminScope($pdo);
$me           = eplakAdminId();
$meUsername   = eplakAdminUsername();
$topUnits     = eplakTopLevelDepartments($pdo, false);   /* غیرفعال‌ها هم می‌آیند تا تخصیصِ قدیمی قابل ویرایش بماند */
$admins       = getAdminUsers($pdo);

/* ── پیام‌ها (الگوی «ارسال، سپس تغییر مسیر» تا با تازه‌کردن صفحه کار تکرار نشود) */
$message     = '';
$messageType = 'success';
$query       = $_GET;
if (!empty($query['err'])) {
    $message     = '❌ ' . (string) $query['err'];
    $messageType = 'danger';
} elseif (isset($query['created'])) {
    $message     = '✅ حساب «' . (string) ($query['u'] ?? '') . '» ساخته شد. رمز عبور فقط یک بار از شما گرفته شد و هیچ‌جا ذخیره یا نمایش داده نمی‌شود؛ آن را به همان مدیر بدهید.';
} elseif (isset($query['saved'])) {
    $message     = '✅ تغییرهای حساب ذخیره شد.';
} elseif (isset($query['pw'])) {
    $message     = '✅ رمز عبور تازه ذخیره شد. رمز قبلی از این لحظه بی‌اعتبار است.';
} elseif (isset($query['toggled'])) {
    $message     = (string) ($query['active'] ?? '') === '1'
        ? '✅ حساب فعال شد؛ مدیر می‌تواند وارد شود.'
        : '✅ حساب غیرفعال شد؛ از این پس نمی‌تواند وارد شود (داده‌هایش پاک نشده).';
} elseif (isset($query['deleted'])) {
    $message     = '✅ حساب حذف شد و حوزه‌های سپرده‌شده به آن هم برداشته شد.';
}

/* ── پردازش فرم‌ها ───────────────────────────────────────────────────────── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $action  = (string) ($_POST['admin_action'] ?? '');
    $adminId = (int) ($_POST['admin_id'] ?? 0);
    $err     = '';
    $to      = 'admins.php';

    if ($action === 'create') {
        $username = trim((string) ($_POST['username'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');
        $fullName = trim((string) ($_POST['full_name'] ?? ''));
        $role     = ((string) ($_POST['role'] ?? 'admin')) === 'super_admin' ? 'super_admin' : 'admin';
        $unitIds  = array_map('intval', (array) ($_POST['departments'] ?? []));

        /* مدیرِ حوزه باید دستِ‌کم یک واحد سطح اول داشته باشد، وگرنه پنلش خالی است */
        if ($role === 'admin' && !$unitIds) {
            $err = 'برای مدیرِ حوزه/معاونت دستِ‌کم یک واحد (حوزه یا معاونت) انتخاب کنید.';
        } else {
            $created = eplakCreateAdminUser($pdo, $username, $password, $fullName, $role);
            if ((int) $created['id'] <= 0) {
                $err = (string) ($created['error'] ?: 'ساختن حساب ناموفق بود.');
            } else {
                if ($role === 'admin') {
                    $assign = eplakSetAdminDepartments($pdo, (int) $created['id'], $unitIds);
                    if ($assign['error'] !== '') {
                        $err = 'حساب ساخته شد ولی ذخیره‌ی حوزه‌ها ناموفق بود: ' . $assign['error'];
                    }
                }
                $to = $err === ''
                    ? 'admins.php?' . http_build_query(['created' => 1, 'u' => $username])
                    : 'admins.php?' . http_build_query(['err' => $err]);
            }
        }
        if ($err !== '' && $to === 'admins.php') {
            $to = 'admins.php?' . http_build_query(['err' => $err]);
        }
        eplakRedirect($to);
        exit;
    }

    if ($action === 'update') {
        $target = getAdminById($pdo, $adminId);
        if (!$target) {
            $err = 'حساب مدیر یافت نشد.';
        } else {
            $fullName = trim((string) ($_POST['full_name'] ?? ''));
            $role     = ((string) ($_POST['role'] ?? 'admin')) === 'super_admin' ? 'super_admin' : 'admin';
            $unitIds  = array_map('intval', (array) ($_POST['departments'] ?? []));
            $isActive = isset($_POST['is_active']) ? 1 : 0;

            /* محافظِ خودقفل‌شدن: مدیر کل نمی‌تواند حساب خودش را غیرفعال کند یا
               دسترسی مدیر کلِ خودش را بگیرد (وگرنه پنل بی‌مدیر می‌ماند). */
            if ($adminId === $me && ($isActive === 0 || $role !== 'super_admin')) {
                $err = 'نمی‌توانید حساب خودتان را غیرفعال کنید یا دسترسی مدیر کلِ خودتان را بگیرید.';
            }

            if ($err === '' && mb_strlen($fullName) > 255) {
                $err = 'نام و نام خانوادگی بیش از حد بلند است.';
            }
            if ($err === '' && $role === 'admin' && !$unitIds) {
                $err = 'برای مدیرِ حوزه/معاونت دستِ‌کم یک واحد (حوزه یا معاونت) انتخاب کنید.';
            }

            /* نام کاربری */
            $newUsername = trim((string) ($_POST['username'] ?? ''));
            if ($err === '' && $newUsername !== '' && $newUsername !== (string) $target['username']) {
                $err = updateAdminUsername($pdo, $adminId, $newUsername);
            }

            /* نقش */
            if ($err === '' && $role !== (string) ($target['role'] ?? 'admin')) {
                $err = eplakSetAdminRole($pdo, $adminId, $role, $me);
            }

            /* وضعیت فعال بودن */
            if ($err === '' && $isActive !== (int) ($target['is_active'] ?? 1)) {
                $err = eplakSetAdminActive($pdo, $adminId, $isActive === 1, $me);
            }

            /* نام و نام خانوادگی */
            if ($err === '') {
                try {
                    $pdo->prepare('UPDATE admin_users SET full_name = :f WHERE id = :id')
                        ->execute([':f' => $fullName, ':id' => $adminId]);
                } catch (Throwable $e) {
                    $err = 'ذخیره‌ی نام و نام خانوادگی ناموفق بود: ' . $e->getMessage();
                }
            }

            /* حوزه‌ها (برای مدیر کل معنا ندارد — حوزه‌ها نادیده گرفته می‌شوند) */
            if ($err === '' && $role === 'admin') {
                $assign = eplakSetAdminDepartments($pdo, $adminId, $unitIds);
                if ($assign['error'] !== '') {
                    $err = $assign['error'];
                }
            }

            /* رمز عبور تازه (اختیاری) */
            $newPassword    = (string) ($_POST['password_new'] ?? '');
            $confirmPassword = (string) ($_POST['password_confirm'] ?? '');
            if ($err === '' && ($newPassword !== '' || $confirmPassword !== '')) {
                if (mb_strlen($newPassword) < 8) {
                    $err = 'رمز عبور باید حداقل ۸ کاراکتر باشد.';
                } elseif ($newPassword !== $confirmPassword) {
                    $err = 'رمز عبور تازه و تکرار آن یکسان نیستند.';
                } elseif (!preg_match('/[A-Za-z]/', $newPassword) || !preg_match('/[0-9]/', $newPassword)) {
                    $err = 'رمز عبور باید ترکیبی از حرف و عدد باشد.';
                } elseif (password_verify($newPassword, (string) $target['password_hash'])) {
                    $err = 'رمز تازه باید با رمز قبلی متفاوت باشد.';
                } else {
                    try {
                        $pdo->prepare('UPDATE admin_users SET password_hash = :h WHERE id = :id')
                            ->execute([':h' => password_hash($newPassword, PASSWORD_DEFAULT), ':id' => $adminId]);
                        /* نشستِ فعالِ آن مدیر با رمز قدیم اعتباری ندارد؛ ورود دوباره لازم است */
                        $pwChanged = true;
                    } catch (Throwable $e) {
                        $err = 'ذخیره‌ی رمز عبور ناموفق بود: ' . $e->getMessage();
                    }
                }
            }
        }
        $to = $err === ''
            ? 'admins.php?' . http_build_query(array_filter([
                'saved' => 1,
                'pw'    => !empty($pwChanged) ? 1 : null,
                'edit'  => $adminId,
            ]))
            : 'admins.php?' . http_build_query(['err' => $err, 'edit' => $adminId]);
        eplakRedirect($to);
        exit;
    }

    if ($action === 'toggle') {
        $target  = getAdminById($pdo, $adminId);
        $nowActive = $target ? (int) ($target['is_active'] ?? 1) : 1;
        $err = eplakSetAdminActive($pdo, $adminId, $nowActive === 0, $me);
        eplakRedirect('admins.php?' . http_build_query($err === ''
            ? ['toggled' => 1, 'active' => $nowActive === 0 ? 1 : 0]
            : ['err' => $err]));
        exit;
    }

    if ($action === 'delete') {
        $err = eplakDeleteAdminUser($pdo, $adminId, $me);
        eplakRedirect('admins.php?' . http_build_query($err === '' ? ['deleted' => 1] : ['err' => $err]));
        exit;
    }

    eplakRedirect('admins.php?' . http_build_query(['err' => 'عملیات ناشناخته است.']));
    exit;
}

/* ── حساب در حال ویرایش ─────────────────────────────────────────────────── */
$editId = (int) ($_GET['edit'] ?? 0);
$editing = $editId > 0 ? getAdminById($pdo, $editId) : null;
if ($editing) {
    $editing['id']             = (int) $editing['id'];
    $editing['department_ids'] = eplakAdminDepartmentIds($pdo, (int) $editing['id']);
    $editing['is_self']        = ((int) $editing['id'] === $me);
}
$roleLabels = ['super_admin' => 'مدیر کل (دسترسی کامل)', 'admin' => 'مدیر حوزه/معاونت'];
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>مدیریت مدیران</title>
  <link rel="stylesheet" href="assets/style.css?v=10">
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
      <nav data-testid="admin-sidebar">
<?php /* منوی آگاه از دسترسی — admin/includes/acl.php */ ?>
<?= eplakAdminSidebar('admins') ?>      </nav>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1>
            <i class="fas fa-user-shield" style="color: var(--primary-500); margin-left: 12px;"></i>
            مدیران سامانه
          </h1>
          <p>ساخت حساب برای مدیرِ هر حوزه/معاونت و تعیین اینکه چه پیام‌هایی را ببیند</p>
        </div>
        <div class="topbar-right">
          <?= eplakAdminScopeBadge($pdo) ?>
        </div>
      </header>

      <?php if ($message !== ''): ?>
        <div class="alert alert-<?= htmlspecialchars($messageType) ?>" style="margin:0 20px 14px;" data-testid="admins-message">
          <?= htmlspecialchars($message) ?>
        </div>
      <?php endif; ?>

      <!-- قاعده‌ی دسترسی، روشن و قابل اتکا -->
      <section class="panel" data-testid="admins-rules">
        <div class="panel-header">
          <h2><i class="fas fa-circle-info" style="color: #0f766e; margin-left: 10px;"></i>هر مدیر چه چیزی می‌بیند؟</h2>
        </div>
        <div style="padding: 4px 6px 10px; line-height: 2; font-size: 13.5px;">
          <p style="margin:0 0 6px;">
            <strong>مدیر کل:</strong> همه‌ی گزارش‌ها، تیکت‌ها، کاربران، واحدها، اخبار، اماکن، اعلان‌ها، خروجی اکسل، تنظیمات و همین صفحه.
            گزارش‌های قدیمیِ <em>بدون حوزه</em> هم فقط برای مدیر کل دیده می‌شوند.
          </p>
          <p style="margin:0 0 6px;">
            <strong>مدیر حوزه/معاونت:</strong> فقط «گزارش‌ها» و «تیکت‌ها»ی حوزه‌ی خودش (مشاهده، پاسخ و تغییر وضعیت) و داشبوردِ محدود به همان حوزه.
            زیرمجموعه‌های آن واحد (مثلاً «حراست» زیر «حوزه شهردار») خودکار در دامنه‌اش هستند.
            صفحه‌های دیگر برایش بسته‌اند و اگر نشانی‌شان را دستی هم باز کند، پیام «دسترسی ندارید» می‌بیند.
          </p>
          <p style="margin:0; color: var(--dark-500);">
            رمز عبور هر حساب به‌صورت هش‌شده ذخیره می‌شود؛ نه در صفحه، نه در نشانی و نه در لاگ نشان داده نمی‌شود.
            اگر رمز حسابی گم شد، از همین‌جا رمز تازه بگذارید.
          </p>
        </div>
      </section>

      <?php if ($editing): ?>
      <!-- ════════ ویرایش حساب ════════ -->
      <section class="panel" data-testid="admin-edit-panel">
        <div class="panel-header">
          <h2><i class="fas fa-user-pen" style="color: var(--primary-500); margin-left: 10px;"></i>ویرایش حساب: <?= htmlspecialchars((string) $editing['username']) ?></h2>
          <a href="admins.php" class="btn btn-secondary"><i class="fas fa-times"></i> بازگشت به فهرست</a>
        </div>

        <?php if ($editing['is_self']): ?>
          <div class="alert alert-warning" style="margin: 0 0 14px;">
            <i class="fas fa-triangle-exclamation"></i>
            این حسابِ خودتان است. برای اینکه پنل بی‌مدیر نماند، «وضعیت فعال» و «نقش مدیر کل» برای خودتان قفل است.
          </div>
        <?php endif; ?>

        <form method="post" action="admins.php">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="admin_action" value="update">
          <input type="hidden" name="admin_id" value="<?= (int) $editing['id'] ?>">

          <div class="form-group">
            <label for="username"><i class="fas fa-user" style="color: var(--primary-500); margin-left: 6px;"></i>نام کاربری</label>
            <input class="form-control" type="text" id="username" name="username" autocomplete="off"
                   value="<?= htmlspecialchars((string) $editing['username']) ?>" required minlength="3" maxlength="60"
                   data-testid="edit-username">
          </div>

          <div class="form-group">
            <label for="full_name"><i class="fas fa-id-card" style="color: var(--primary-500); margin-left: 6px;"></i>نام و نام خانوادگی</label>
            <input class="form-control" type="text" id="full_name" name="full_name" maxlength="255"
                   value="<?= htmlspecialchars((string) ($editing['full_name'] ?? '')) ?>"
                   placeholder="مثلاً: مهندس رضایی — معاونت خدمات شهری" data-testid="edit-full-name">
          </div>

          <div class="form-group">
            <label for="role"><i class="fas fa-key" style="color: var(--primary-500); margin-left: 6px;"></i>نقش</label>
            <select class="form-control" id="role" name="role" data-testid="edit-role"
                    <?= $editing['is_self'] ? 'disabled' : '' ?>>
              <?php foreach ($roleLabels as $value => $label): ?>
                <option value="<?= htmlspecialchars($value) ?>" <?= (string) ($editing['role'] ?? 'admin') === $value ? 'selected' : '' ?>>
                  <?= htmlspecialchars($label) ?>
                </option>
              <?php endforeach; ?>
            </select>
            <?php if ($editing['is_self']): ?>
              <input type="hidden" name="role" value="super_admin">
            <?php endif; ?>
          </div>

          <div class="form-group" data-testid="edit-units">
            <label><i class="fas fa-sitemap" style="color: var(--primary-500); margin-left: 6px;"></i>حوزه‌ها/معاونت‌های تحت دسترسی (فقط واحدهای سطح اول)</label>
            <?php if (!$topUnits): ?>
              <p style="margin:6px 0; color:#b91c1c; font-size:13px;">
                واحدی در جدول «واحدهای اداری» پیدا نشد. ابتدا از صفحه‌ی «واحدهای اداری» حوزه‌ها/معاونت‌ها را بسازید.
              </p>
            <?php else: ?>
              <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap:8px; margin-top:6px;">
                <?php foreach ($topUnits as $unit): ?>
                  <?php $unitId = (int) ($unit['id'] ?? 0); ?>
                  <label style="display:flex; align-items:flex-start; gap:8px; padding:8px 10px; border:1px solid var(--dark-200); border-radius:10px; cursor:pointer; font-weight:normal;">
                    <input type="checkbox" name="departments[]" value="<?= $unitId ?>"
                           <?= in_array($unitId, (array) $editing['department_ids'], true) ? 'checked' : '' ?>
                           style="margin-top:3px;">
                    <span>
                      <?= htmlspecialchars((string) ($unit['name'] ?? '')) ?>
                      <?php if ((int) ($unit['is_active'] ?? 1) === 0): ?>
                        <em style="color:#b45309; font-size:11.5px;">(غیرفعال)</em>
                      <?php endif; ?>
                    </span>
                  </label>
                <?php endforeach; ?>
              </div>
            <?php endif; ?>
          </div>

          <div class="form-group">
            <label for="password_new"><i class="fas fa-lock" style="color: var(--primary-500); margin-left: 6px;"></i>رمز عبور تازه (اختیاری)</label>
            <input class="form-control" type="password" id="password_new" name="password_new" autocomplete="new-password"
                   minlength="8" placeholder="خالی بگذارید تا رمز عوض نشود" data-testid="edit-password">
          </div>
          <div class="form-group">
            <label for="password_confirm">تکرار رمز عبور تازه</label>
            <input class="form-control" type="password" id="password_confirm" name="password_confirm" autocomplete="new-password"
                   minlength="8" placeholder="خالی بگذارید تا رمز عوض نشود">
          </div>

          <div class="form-group">
            <label for="is_active" style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="is_active" name="is_active" value="1"
                     <?= ((int) ($editing['is_active'] ?? 1) === 1 || $editing['is_self']) ? 'checked' : '' ?>
                     <?= $editing['is_self'] ? 'disabled' : '' ?> data-testid="edit-active">
              <span>حساب فعال باشد (اگر بردارید، این مدیر نمی‌تواند وارد شود ولی داده‌هایش می‌ماند)</span>
            </label>
            <?php if ($editing['is_self']): ?>
              <input type="hidden" name="is_active" value="1">
            <?php endif; ?>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
            <button type="submit" class="btn btn-primary" data-testid="edit-save"><i class="fas fa-floppy-disk"></i> ذخیره‌ی تغییرها</button>
            <a href="admins.php" class="btn btn-secondary">انصراف</a>
          </div>
        </form>
      </section>
      <?php endif; ?>

      <!-- ════════ ساخت حساب تازه ════════ -->
      <section class="panel" data-testid="admin-create-panel">
        <div class="panel-header">
          <h2><i class="fas fa-user-plus" style="color: var(--primary-500); margin-left: 10px;"></i>ساخت حساب مدیر تازه</h2>
        </div>

        <form method="post" action="admins.php">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="admin_action" value="create">

          <div class="form-group">
            <label for="new_username"><i class="fas fa-user" style="color: var(--primary-500); margin-left: 6px;"></i>نام کاربری (همان چیزی که مدیر با آن وارد می‌شود)</label>
            <input class="form-control" type="text" id="new_username" name="username" autocomplete="off"
                   required minlength="3" maxlength="60" placeholder="مثلاً: khadamat-shahri" data-testid="new-username">
          </div>

          <div class="form-group">
            <label for="new_password"><i class="fas fa-lock" style="color: var(--primary-500); margin-left: 6px;"></i>رمز عبور (دستِ‌کم ۸ نویسه، ترکیب حرف و عدد)</label>
            <input class="form-control" type="password" id="new_password" name="password" autocomplete="new-password"
                   required minlength="8" data-testid="new-password">
          </div>

          <div class="form-group">
            <label for="new_full_name"><i class="fas fa-id-card" style="color: var(--primary-500); margin-left: 6px;"></i>نام و نام خانوادگی (اختیاری)</label>
            <input class="form-control" type="text" id="new_full_name" name="full_name" maxlength="255"
                   placeholder="مثلاً: مهندس رضایی" data-testid="new-full-name">
          </div>

          <div class="form-group">
            <label for="new_role"><i class="fas fa-key" style="color: var(--primary-500); margin-left: 6px;"></i>نقش</label>
            <select class="form-control" id="new_role" name="role" data-testid="new-role"
                    onchange="document.getElementById('new-units').style.display = (this.value === 'admin' ? '' : 'none');">
              <option value="admin" selected>مدیر حوزه/معاونت — فقط پیام‌های حوزه‌ی خودش</option>
              <option value="super_admin">مدیر کل — دسترسی کامل به همه‌چیز</option>
            </select>
          </div>

          <div class="form-group" id="new-units" data-testid="new-units">
            <label><i class="fas fa-sitemap" style="color: var(--primary-500); margin-left: 6px;"></i>حوزه‌ها/معاونت‌های تحت دسترسی (فقط واحدهای سطح اول؛ زیرمجموعه‌ها خودکار شامل می‌شوند)</label>
            <?php if (!$topUnits): ?>
              <p style="margin:6px 0; color:#b91c1c; font-size:13px;">
                واحدی در جدول «واحدهای اداری» پیدا نشد. ابتدا از صفحه‌ی «واحدهای اداری» حوزه‌ها/معاونت‌ها را بسازید.
              </p>
            <?php else: ?>
              <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap:8px; margin-top:6px;">
                <?php foreach ($topUnits as $unit): ?>
                  <?php $unitId = (int) ($unit['id'] ?? 0); ?>
                  <label style="display:flex; align-items:flex-start; gap:8px; padding:8px 10px; border:1px solid var(--dark-200); border-radius:10px; cursor:pointer; font-weight:normal;">
                    <input type="checkbox" name="departments[]" value="<?= $unitId ?>" style="margin-top:3px;">
                    <span>
                      <?= htmlspecialchars((string) ($unit['name'] ?? '')) ?>
                      <?php if ((int) ($unit['is_active'] ?? 1) === 0): ?>
                        <em style="color:#b45309; font-size:11.5px;">(غیرفعال)</em>
                      <?php endif; ?>
                    </span>
                  </label>
                <?php endforeach; ?>
              </div>
            <?php endif; ?>
          </div>

          <div style="margin-top:10px;">
            <button type="submit" class="btn btn-primary" data-testid="create-admin"><i class="fas fa-plus"></i> ساخت حساب</button>
          </div>
        </form>
      </section>

      <!-- ════════ فهرست حساب‌ها ════════ -->
      <section class="panel" data-testid="admins-list-panel">
        <div class="panel-header">
          <h2><i class="fas fa-users-gear" style="color: #0f766e; margin-left: 10px;"></i>حساب‌های مدیر (<?= count($admins) ?>)</h2>
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>حساب</th>
                <th>نقش</th>
                <th>حوزه‌های دسترسی</th>
                <th>پیام‌هایی که می‌بیند</th>
                <th>وضعیت</th>
                <th>آخرین ورود</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              <?php if (!$admins): ?>
                <tr>
                  <td colspan="7">
                    <div class="empty-state" style="padding: 30px 20px;">
                      <i class="fas fa-user-slash" style="font-size: 44px; color: var(--dark-300);"></i>
                      <h3>حساب مدیری پیدا نشد</h3>
                    </div>
                  </td>
                </tr>
              <?php endif; ?>

              <?php foreach ($admins as $admin): ?>
                <?php
                  $isSuperAdmin = ((string) $admin['role']) === 'super_admin';
                  $isActive     = (int) $admin['is_active'] === 1;
                  $isSelf       = ((int) $admin['id'] === $me);
                  $msgs         = (array) $admin['messages'];
                ?>
                <tr data-testid="admin-row">
                  <td>
                    <strong><?= htmlspecialchars((string) $admin['username']) ?></strong>
                    <?php if ($isSelf): ?>
                      <em style="color:#0f766e; font-size:11.5px;">(شما)</em>
                    <?php endif; ?>
                    <?php if ((string) $admin['full_name'] !== ''): ?>
                      <br><span style="color: var(--dark-500); font-size:12px;"><?= htmlspecialchars((string) $admin['full_name']) ?></span>
                    <?php endif; ?>
                  </td>
                  <td>
                    <span style="display:inline-block; padding:2px 9px; border-radius:999px; font-size:12px;
                                 background: <?= $isSuperAdmin ? '#0f766e' : '#1d4ed8' ?>; color:#fff;">
                      <?= htmlspecialchars($isSuperAdmin ? 'مدیر کل' : 'مدیر حوزه/معاونت') ?>
                    </span>
                  </td>
                  <td>
                    <?php if ($isSuperAdmin): ?>
                      <span style="color:#0f766e;">همه‌ی حوزه‌ها (بدون محدودیت)</span>
                    <?php elseif (!$admin['departments']): ?>
                      <span style="color:#b91c1c;" data-testid="admin-no-units">هیچ حوزه‌ای اختصاص نیافته — این مدیر هیچ پیامی نمی‌بیند</span>
                    <?php else: ?>
                      <?php foreach ($admin['departments'] as $deptName): ?>
                        <span style="display:inline-block; margin:2px 4px 2px 0; padding:2px 8px; border-radius:8px;
                                     background: var(--dark-100, #f1f5f9); font-size:12px;">
                          <?= htmlspecialchars((string) $deptName) ?>
                        </span>
                      <?php endforeach; ?>
                    <?php endif; ?>
                  </td>
                  <td>
                    <?php if ($isSuperAdmin): ?>
                      همه‌ی گزارش‌ها و تیکت‌ها
                    <?php else: ?>
                      <span data-testid="admin-msg-counts">
                        <?= (int) ($msgs['reports'] ?? 0) ?> گزارش
                        ·
                        <?= (int) ($msgs['tickets'] ?? 0) ?> تیکت
                      </span>
                    <?php endif; ?>
                  </td>
                  <td>
                    <span style="display:inline-block; padding:2px 9px; border-radius:999px; font-size:12px;
                                 background: <?= $isActive ? '#dcfce7' : '#fee2e2' ?>;
                                 color: <?= $isActive ? '#166534' : '#991b1b' ?>;">
                      <?= $isActive ? 'فعال' : 'غیرفعال' ?>
                    </span>
                  </td>
                  <td>
                    <?php if ((string) $admin['last_login_at'] !== ''): ?>
                      <?= htmlspecialchars(eplakFaDateTimeOf($admin['last_login_at'], '—')) ?>
                    <?php else: ?>
                      <span style="color: var(--dark-400);">هنوز وارد نشده</span>
                    <?php endif; ?>
                  </td>
                  <td>
                    <div class="action-buttons" style="display:flex; gap:6px; flex-wrap:wrap;">
                      <a href="admins.php?edit=<?= (int) $admin['id'] ?>" class="btn-action edit" title="ویرایش">
                        <i class="fas fa-pen"></i>
                      </a>

                      <form method="post" action="admins.php" style="margin:0; display:inline;">
                        <?= eplakCsrfField() ?>
                        <input type="hidden" name="admin_action" value="toggle">
                        <input type="hidden" name="admin_id" value="<?= (int) $admin['id'] ?>">
                        <button type="submit" class="btn-action <?= $isActive ? 'delete' : 'view' ?>"
                                title="<?= $isActive ? 'غیرفعال کردن' : 'فعال کردن' ?>"
                                <?= $isSelf ? 'disabled' : '' ?> data-testid="toggle-admin">
                          <i class="fas <?= $isActive ? 'fa-ban' : 'fa-circle-check' ?>"></i>
                        </button>
                      </form>

                      <form method="post" action="admins.php" style="margin:0; display:inline;"
                            onsubmit="return confirm('آیا از حذف این حساب مدیر اطمینان دارید؟ حوزه‌های سپرده‌شده به آن هم برداشته می‌شود.');">
                        <?= eplakCsrfField() ?>
                        <input type="hidden" name="admin_action" value="delete">
                        <input type="hidden" name="admin_id" value="<?= (int) $admin['id'] ?>">
                        <button type="submit" class="btn-action delete" title="حذف حساب"
                                <?= $isSelf ? 'disabled' : '' ?> data-testid="delete-admin">
                          <i class="fas fa-trash"></i>
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </section>

      <p style="margin: 0 20px 24px; color: var(--dark-500); font-size: 12.5px; line-height: 2;">
        <i class="fas fa-shield-halved"></i>
        دسترسی‌ها سمت سرور اعمال می‌شوند (<code>admin/includes/acl.php</code>)؛ یعنی حتی اگر مدیرِ حوزه نشانی صفحه‌ای را
        دستی باز کند یا درخواستی را مستقیم بفرستد، پاسخ «دسترسی ندارید» می‌گیرد.
        حساب فعلی شما: <strong><?= htmlspecialchars($meUsername) ?></strong>.
      </p>
    </main>
  </div>
</body>
</html>
