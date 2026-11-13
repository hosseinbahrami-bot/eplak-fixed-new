<?php
/* ============================================================================
   admin/ads.php — مدیریت تبلیغاتِ اپ (فقط «مدیر کل»)
   ----------------------------------------------------------------------------
   چرا این صفحه؟ چون کارفرما خواست «تمام بخش تبلیغات رو بتونیم تغییر بدم و
   حذف کنم یا اضافه کنم»، «اگر دو یا سه تا تصویر هم گذاشتم تصاویر به ترتیب
   نمایش داده بشه و عوض بشن» و «جای گذاشتن لینک هم داشته باشه».

   پیش از این، تبلیغاتِ اپ سه بنرِ «ثابت» در index.html بود که فقط با تغییرِ کد
   و ساختِ دوباره‌ی APK عوض می‌شد. حالا همان سه «جای بنر» از دیتابیس خوانده
   می‌شود (api/ads.php) و اپ (modules/ads.js) تصویرهای هر جای بنر را به ترتیب
   و به‌صورت چرخشی نشان می‌دهد:

       home_top  → خانه، بنر بزرگِ بالای شبکه‌ی خدمات
       home_mid  → خانه، بنر میانیِ بالای «میراث ورامین»
       dash_slim → داشبورد، بنر باریکِ زیر آب‌وهوا

   قواعد:
     • هر ردیف = یک تصویر. چند ردیف در یک جای بنر = چرخشِ تصویرها به همان
       ترتیبی که این‌جا هست (با دکمه‌های ↑ و ↓ عوض می‌شود).
     • لینک فقط http/https پذیرفته می‌شود و در «مرورگر گوشی» باز می‌شود؛
       بنرِ بی‌لینک فقط نمایش داده می‌شود.
     • آمار کلیک در همین صفحه هست (تعداد + IPِ یکتا + آخرین کلیک). دو کلیکِ
       پیاپیِ یک نفر در کمتر از یک دقیقه، یکی شمرده می‌شود.
     • تصویرهای پیش‌فرضِ داخل بسته‌ی اپ (assets/img/ad-*) به‌عنوان سه تبلیغِ
       اولیه درج می‌شوند تا ظاهر اپ تا وقتی چیزی عوض نکرده‌اید دقیقاً مثل قبل
       بماند؛ آن‌ها را هم می‌شود ویرایش یا حذف کرد.
     • حذفِ یک تبلیغ، فایلِ «آپلودشده‌ی» آن (uploads/ads/…) را هم پاک می‌کند؛
       به فایل‌های assets/… که بخشی از بسته‌ی اپ‌اند دست نمی‌زنیم.
   ============================================================================ */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/../shared/ads.php';

/* دسترسی: ads — مدیرِ حوزه/معاونت به این صفحه نمی‌رسد (admin/includes/acl.php) */
eplakRequirePermission('ads');

$placements = eplakAdsPlacements();
$tableReady = is_array(eplakAdsTableColumns($pdo)) && count((array) eplakAdsTableColumns($pdo)) > 0;

/* ── پیام‌ها (الگوی «ارسال، سپس تغییر مسیر» تا با تازه‌کردن صفحه کار تکرار نشود) */
$message     = '';
$messageType = 'success';
$query       = $_GET;
if (!empty($query['err'])) {
    $message     = '❌ ' . (string) $query['err'];
    $messageType = 'danger';
} elseif (isset($query['created'])) {
    $message     = '✅ تبلیغ اضافه شد و در اپ نمایش داده می‌شود (اگر فعال باشد).';
} elseif (isset($query['saved'])) {
    $message     = '✅ تغییرهای تبلیغ ذخیره شد.';
} elseif (isset($query['toggled'])) {
    $message     = (string) ($query['active'] ?? '') === '1'
        ? '✅ تبلیغ فعال شد؛ از این پس در اپ نمایش داده می‌شود.'
        : '✅ تبلیغ غیرفعال شد؛ در اپ نمایش داده نمی‌شود (حذف نشده و آمارش مانده).';
} elseif (isset($query['deleted'])) {
    $message     = '✅ تبلیغ حذف شد.';
} elseif (isset($query['moved'])) {
    $message     = '✅ ترتیب نمایش عوض شد.';
} elseif (isset($query['repaired'])) {
    $message     = '✅ ساختار جدول تبلیغات ترمیم شد و ' . (int) ($query['seeded'] ?? 0) . ' بنرِ پیش‌فرض درج شد.';
}

/* ── پردازش فرم‌ها ───────────────────────────────────────────────────────── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $action = (string) ($_POST['ad_action'] ?? '');
    $adId   = (int) ($_POST['ad_id'] ?? 0);
    $err    = '';
    $to     = 'ads.php';

    /* ساخت جدول + بنرهای پیش‌فرض (برای دیتابیسِ قدیمی یا وقتی جدول نیست) */
    if ($action === 'repair') {
        try {
            if (function_exists('eplakRunSchemaSync')) {
                eplakRunSchemaSync($pdo);   /* ستون‌های نبوده اضافه می‌شوند */
            }
            $cols  = eplakAdsTableColumns($pdo);
            $count = (is_array($cols) && count($cols) > 0)
                ? (int) $pdo->query('SELECT COUNT(*) FROM ' . EPLAK_ADS_TABLE)->fetchColumn()
                : 0;
            /* اگر جدول خالی است (یا تازه ساخته شده)، بنرهای پیش‌فرض برگردند تا
               اپ با جای بنرِ خالی نماند. اگر مدیر عمداً تبلیغ‌ها را پاک کرده
               باشد و جدول خالی نباشد، به نشانه‌ی «یک‌بار درج شدن» دست نمی‌زنیم
               ⇒ چیزی برنمی‌گردد. */
            if ($count === 0 && function_exists('eplakSetAppSetting')) {
                eplakSetAppSetting($pdo, 'ads_seeded', '0');
            }
            $seedReport = null;
            $seeded = (int) eplakSeedDefaultAds($pdo, $seedReport);
            if (!empty($seedReport['skipped']) && $seedReport['skipped'] === 'no_table') {
                $err = 'جدول تبلیغات ساخته نشد. در پنل → بررسی نسخه/تنظیمات «ترمیم ساختار دیتابیس» را بزنید یا با کاربرِ دیتابیسِ دارای اجازه‌ی CREATE تلاش کنید.';
            }
        } catch (Throwable $e) {
            $err = 'ترمیم ساختار ناموفق بود: ' . $e->getMessage();
        }
        eplakRedirect('ads.php?' . http_build_query($err === ''
            ? ['repaired' => 1, 'seeded' => isset($seeded) ? (int) $seeded : 0]
            : ['err' => $err]));
        exit;
    }

    /** تصویرِ آپلودشده (اگر فایلی انتخاب شده باشد) جای مقدارِ فیلد را می‌گیرد */
    $readUpload = static function (string $field): string {
        if (empty($_FILES[$field]['name'])) {
            return '';
        }
        $upload = eplakMediaStoreSimpleFile($_FILES[$field], 'ads');
        return $upload['ok'] ? (string) $upload['path'] : ('__error__' . $upload['error']);
    };

    if ($action === 'create' || $action === 'update') {
        $imagePath = trim((string) ($_POST['image_path'] ?? ''));
        $imageWebp = trim((string) ($_POST['image_webp'] ?? ''));

        $uploaded = $readUpload('image_file');
        if (strpos($uploaded, '__error__') === 0) {
            $err = substr($uploaded, 9);
        } elseif ($uploaded !== '') {
            $imagePath = $uploaded;
        }

        $uploadedWebp = $readUpload('image_webp_file');
        if ($err === '' && strpos($uploadedWebp, '__error__') === 0) {
            $err = substr($uploadedWebp, 9);
        } elseif ($uploadedWebp !== '') {
            $imageWebp = $uploadedWebp;
        }

        if ($err === '') {
            $checked = eplakAdsValidateInput([
                'placement'  => (string) ($_POST['placement'] ?? ''),
                'title'      => (string) ($_POST['title'] ?? ''),
                'alt_text'   => (string) ($_POST['alt_text'] ?? ''),
                'image_path' => $imagePath,
                'image_webp' => $imageWebp,
                'link_url'   => (string) ($_POST['link_url'] ?? ''),
                'sort_order' => (int) ($_POST['sort_order'] ?? 0),
                'is_active'  => isset($_POST['is_active']) ? 1 : 0,
            ]);
            if (!$checked['ok']) {
                $err = (string) $checked['error'];
            } elseif ($action === 'create') {
                $created = eplakAdsCreate($pdo, $checked['data']);
                if ((int) $created['id'] <= 0) {
                    $err = (string) ($created['error'] ?: 'افزودن تبلیغ ناموفق بود.');
                } else {
                    $to = 'ads.php?' . http_build_query(['created' => 1, 'u' => (int) $created['id']]);
                }
            } else {
                $updated = eplakAdsUpdate($pdo, $adId, $checked['data']);
                if (empty($updated['ok'])) {
                    $err = (string) ($updated['error'] ?: 'ذخیره‌ی تغییرها ناموفق بود.');
                } else {
                    $to = 'ads.php?' . http_build_query(['saved' => 1, 'edit' => $adId]);
                }
            }
        }
        if ($err !== '' && $to === 'ads.php') {
            $to = 'ads.php?' . http_build_query(array_filter(['err' => $err, 'edit' => $action === 'update' ? $adId : null]));
        }
        eplakRedirect($to);
        exit;
    }

    if ($action === 'toggle') {
        $row = eplakAdsGetById($pdo, $adId);
        if (!$row) {
            $err = 'تبلیغ یافت نشد.';
        } else {
            $nowActive = (int) ($row['is_active'] ?? 1) === 1;
            $err = eplakAdsSetActive($pdo, $adId, !$nowActive);
            if ($err === '') {
                eplakRedirect('ads.php?' . http_build_query(['toggled' => 1, 'active' => $nowActive ? 0 : 1]));
                exit;
            }
        }
        eplakRedirect('ads.php?' . http_build_query(['err' => $err]));
        exit;
    }

    if ($action === 'move_up' || $action === 'move_down') {
        $err = eplakAdsMove($pdo, $adId, $action === 'move_up' ? -1 : 1);
        eplakRedirect('ads.php?' . http_build_query($err === '' ? ['moved' => 1] : ['err' => $err]));
        exit;
    }

    if ($action === 'delete') {
        $err = eplakAdsDelete($pdo, $adId);
        eplakRedirect('ads.php?' . http_build_query($err === '' ? ['deleted' => 1] : ['err' => $err]));
        exit;
    }

    eplakRedirect('ads.php?' . http_build_query(['err' => 'عملیات ناشناخته است.']));
    exit;
}

/* ── ردیف‌ها و آمار ──────────────────────────────────────────────────────── */
$adminRows = ['rows' => [], 'degraded' => [], 'hint' => ''];
if ($tableReady) {
    $adminRows = eplakAdsAdminRows($pdo);
}
$grouped = [];
foreach ($placements as $p) {
    $grouped[$p] = [];
}
foreach ((array) $adminRows['rows'] as $row) {
    $p = eplakAdsNormalizePlacement((string) ($row['placement'] ?? ''));
    if ($p !== '' && isset($grouped[$p])) {
        $grouped[$p][] = $row;
    }
}

$totalAds    = count((array) $adminRows['rows']);
$totalActive = 0;
$totalClicks = 0;
foreach ((array) $adminRows['rows'] as $row) {
    if ((int) ($row['is_active'] ?? 0) === 1) {
        $totalActive++;
    }
    $totalClicks += (int) ($row['click_count'] ?? 0);
}

/* جدول نیست یا خالی است ⇒ همان دکمه‌ی «ترمیم و درج بنرهای پیش‌فرض» پیشنهاد می‌شود */
$needsSeed = !$tableReady || $totalAds === 0;

/* ── تبلیغ در حال ویرایش ─────────────────────────────────────────────────── */
$editId  = (int) ($_GET['edit'] ?? 0);
$editing = $editId > 0 ? eplakAdsGetById($pdo, $editId) : null;
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>مدیریت تبلیغات</title>
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
<?= eplakAdminSidebar('ads') ?>      </nav>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1>
            <i class="fas fa-bullhorn" style="color: var(--primary-500); margin-left: 12px;"></i>
            تبلیغات اپ
          </h1>
          <p>سه جای بنر داخل اپ؛ هر جای بنر می‌تواند چند تصویرِ مرتب و چرخشی با لینک داشته باشد</p>
        </div>
        <div class="topbar-right">
          <?= eplakAdminScopeBadge($pdo) ?>
        </div>
      </header>

      <?php if ($message !== ''): ?>
        <div class="alert alert-<?= htmlspecialchars($messageType) ?>" style="margin:0 20px 14px;" data-testid="ads-message">
          <?= htmlspecialchars($message) ?>
        </div>
      <?php endif; ?>

      <!-- آمارِ کلی -->
      <section class="panel" data-testid="ads-stats">
        <div class="panel-header">
          <h2><i class="fas fa-chart-simple" style="color: #0f766e; margin-left: 10px;"></i>وضعیت تبلیغات</h2>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:10px; padding:4px 6px 12px;">
          <div style="flex:1 1 150px; border:1px solid var(--dark-200, #e5e7eb); border-radius:12px; padding:12px 14px;">
            <div style="font-size:22px; font-weight:800;" data-testid="ads-total"><?= (int) $totalAds ?></div>
            <div style="font-size:12.5px; color:var(--dark-500);">کل تبلیغ‌ها</div>
          </div>
          <div style="flex:1 1 150px; border:1px solid var(--dark-200, #e5e7eb); border-radius:12px; padding:12px 14px;">
            <div style="font-size:22px; font-weight:800; color:#0f766e;" data-testid="ads-active"><?= (int) $totalActive ?></div>
            <div style="font-size:12.5px; color:var(--dark-500);">فعال (در اپ دیده می‌شود)</div>
          </div>
          <div style="flex:1 1 150px; border:1px solid var(--dark-200, #e5e7eb); border-radius:12px; padding:12px 14px;">
            <div style="font-size:22px; font-weight:800; color:#b45309;" data-testid="ads-clicks"><?= (int) $totalClicks ?></div>
            <div style="font-size:12.5px; color:var(--dark-500);">مجموع کلیک‌ها</div>
          </div>
        </div>
      </section>

      <!-- قاعده‌ها، روشن و قابل اتکا -->
      <section class="panel" data-testid="ads-rules">
        <div class="panel-header">
          <h2><i class="fas fa-circle-info" style="color: #0f766e; margin-left: 10px;"></i>چطور کار می‌کند؟</h2>
        </div>
        <div style="padding: 4px 6px 10px; line-height: 2; font-size: 13.5px;">
          <p style="margin:0 0 6px;">
            <strong>سه جای بنر:</strong>
            <?php foreach ($placements as $i => $p): ?><?= $i ? ' · ' : '' ?><code><?= htmlspecialchars($p) ?></code> = <?= htmlspecialchars(eplakAdsPlacementLabel($p)) ?><?php endforeach; ?>
          </p>
          <p style="margin:0 0 6px;">
            <strong>چند تصویر در یک جای بنر:</strong> هر ردیف یک تصویر است. اگر برای یک جای بنر دو یا سه تصویر بگذارید،
            اپ آن‌ها را <em>به همین ترتیب</em> نشان می‌دهد و هر چند ثانیه خودکار عوض می‌کند (با کشیدنِ انگشت هم می‌شود عوضشان کرد).
            ترتیب را با دکمه‌های ↑ و ↓ همین صفحه عوض کنید.
          </p>
          <p style="margin:0 0 6px;">
            <strong>لینک:</strong> اگر لینک بگذارید، با زدنِ بنر در <em>مرورگر گوشی</em> باز می‌شود (بیرون از اپ) و همان کلیک
            در «آمار کلیک» همین صفحه شمرده می‌شود. لینک باید با <code>http://</code> یا <code>https://</code> شروع شود؛
            خالی بگذارید تا بنر فقط نمایش داده شود.
          </p>
          <p style="margin:0 0 6px;">
            <strong>آمار کلیک:</strong> تعداد کلیک، تعداد IPِ یکتا و زمانِ آخرین کلیک برای هر تبلیغ نشان داده می‌شود.
            دو کلیکِ پیاپیِ یک نفر در کمتر از یک دقیقه یکی شمرده می‌شود تا آمار باد نکند. نشانی IP به‌صورت «هش» ذخیره
            می‌شود، نه خام.
          </p>
          <p style="margin:0; color: var(--dark-500);">
            تغییرها <strong>بدون ساختِ دوباره‌ی اپ</strong> در اپِ نصب‌شده دیده می‌شوند (اپ تبلیغ‌ها را از سرور می‌خواند).
            نسخه‌های قدیمی‌تر از ۲.۳ اپ که این بخش را ندارند، همان بنرهای ثابتِ داخل بسته‌شان را نشان می‌دهند.
          </p>
        </div>
      </section>

      <?php if ($needsSeed): ?>
      <!-- ════════ جدول نیست یا خالی است ════════ -->
      <section class="panel" data-testid="ads-repair-panel">
        <div class="panel-header">
          <h2><i class="fas fa-triangle-exclamation" style="color:#b45309; margin-left:10px;"></i><?= $tableReady ? 'تبلیغی در دیتابیس نیست' : 'جدول تبلیغات در دیتابیس نیست' ?></h2>
        </div>
        <div style="padding:4px 6px 14px; line-height:2; font-size:13.5px;">
          <p style="margin:0 0 10px;">
            <?php if ($tableReady): ?>
              هیچ تبلیغی ثبت نشده است، پس اپ در هر سه جای بنر همان تصویرهای ثابتِ داخل بسته‌ی خودش را نشان می‌دهد.
              با دکمه‌ی زیر، سه بنرِ فعلیِ اپ به‌عنوان تبلیغِ پیش‌فرض درج می‌شوند و از همان‌جا قابل ویرایش/حذف خواهند بود
              (یا خودتان تبلیغ تازه اضافه کنید).
            <?php else: ?>
              تا وقتی جدول <code>ads</code> ساخته نشود، اپ همان بنرهای ثابتِ داخل بسته‌ی خودش را نشان می‌دهد و این صفحه
              چیزی برای مدیریت ندارد. با دکمه‌ی زیر، جدول ساخته می‌شود و سه بنرِ فعلیِ اپ به‌عنوان تبلیغِ پیش‌فرض درج
              می‌شوند (تا ظاهر اپ عوض نشود).
            <?php endif; ?>
          </p>
          <form method="post" action="ads.php" style="margin:0;">
            <?= eplakCsrfField() ?>
            <input type="hidden" name="ad_action" value="repair">
            <button type="submit" class="btn btn-primary" data-testid="ads-repair">
              <i class="fas fa-screwdriver-wrench"></i> ساخت جدول تبلیغات و درج بنرهای پیش‌فرض
            </button>
          </form>
        </div>
      </section>
      <?php endif; ?>

      <?php if ($editing): ?>
      <!-- ════════ ویرایش تبلیغ ════════ -->
      <section class="panel" data-testid="ad-edit-panel">
        <div class="panel-header">
          <h2><i class="fas fa-pen-to-square" style="color: var(--primary-500); margin-left: 10px;"></i>ویرایش تبلیغ #<?= (int) $editing['id'] ?></h2>
          <a href="ads.php" class="btn btn-secondary"><i class="fas fa-times"></i> بازگشت به فهرست</a>
        </div>

        <form method="post" action="ads.php" enctype="multipart/form-data">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="ad_action" value="update">
          <input type="hidden" name="ad_id" value="<?= (int) $editing['id'] ?>">

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:14px; padding:4px 6px 10px;">
            <div class="form-group">
              <label for="edit_placement">جای بنر <span style="color:#b91c1c;">*</span></label>
              <select class="form-control" id="edit_placement" name="placement" data-testid="edit-placement">
                <?php foreach ($placements as $p): ?>
                  <option value="<?= htmlspecialchars($p) ?>" <?= (string) ($editing['placement'] ?? '') === $p ? 'selected' : '' ?>>
                    <?= htmlspecialchars(eplakAdsPlacementLabel($p)) ?>
                  </option>
                <?php endforeach; ?>
              </select>
            </div>

            <div class="form-group">
              <label for="edit_title">عنوان تبلیغ <span style="color:#b91c1c;">*</span></label>
              <input type="text" class="form-control" id="edit_title" name="title" maxlength="255" required
                     value="<?= htmlspecialchars((string) ($editing['title'] ?? '')) ?>"
                     placeholder="مثلاً: بازار حاجی اعلا — زعفران و پسته" data-testid="edit-title">
            </div>

            <div class="form-group">
              <label for="edit_alt">متن جایگزین (alt)</label>
              <input type="text" class="form-control" id="edit_alt" name="alt_text" maxlength="255"
                     value="<?= htmlspecialchars((string) ($editing['alt_text'] ?? '')) ?>"
                     placeholder="اگر خالی بماند، عنوان استفاده می‌شود" data-testid="edit-alt">
            </div>

            <div class="form-group">
              <label for="edit_link">لینک (اختیاری)</label>
              <input type="text" class="form-control" id="edit_link" name="link_url" maxlength="700" dir="ltr"
                     value="<?= htmlspecialchars((string) ($editing['link_url'] ?? '')) ?>"
                     placeholder="https://example.com" data-testid="edit-link">
              <small style="color:var(--dark-500);">فقط http/https — در مرورگر گوشی باز می‌شود و کلیکش شمرده می‌شود.</small>
            </div>

            <div class="form-group">
              <label for="edit_image_file">تصویر تازه (آپلود از سیستم)</label>
              <input type="file" class="form-control" id="edit_image_file" name="image_file" accept="image/*" data-testid="edit-image-file">
              <small style="color:var(--dark-500);">اگر فایلی انتخاب کنید، جای تصویر فعلی را می‌گیرد (jpg، png، webp، gif).</small>
            </div>

            <div class="form-group">
              <label for="edit_image_path">مسیر/نشانی تصویر <span style="color:#b91c1c;">*</span></label>
              <input type="text" class="form-control" id="edit_image_path" name="image_path" maxlength="500" dir="ltr" required
                     value="<?= htmlspecialchars((string) ($editing['image_path'] ?? '')) ?>"
                     placeholder="uploads/ads/2026/11/….jpg یا assets/img/ad-haji.jpg" data-testid="edit-image-path">
            </div>

            <div class="form-group">
              <label for="edit_image_webp">نسخه‌ی webp (اختیاری)</label>
              <input type="file" class="form-control" id="edit_image_webp_file" name="image_webp_file" accept="image/webp" data-testid="edit-image-webp-file">
              <input type="text" class="form-control" id="edit_image_webp" name="image_webp" maxlength="500" dir="ltr" style="margin-top:6px;"
                     value="<?= htmlspecialchars((string) ($editing['image_webp'] ?? '')) ?>"
                     placeholder="assets/img/ad-haji.webp" data-testid="edit-image-webp">
              <small style="color:var(--dark-500);">اگر باشد، مرورگرها همین را نشان می‌دهند (کم‌حجم‌تر).</small>
            </div>

            <div class="form-group">
              <label for="edit_order">ترتیب نمایش</label>
              <input type="number" class="form-control" id="edit_order" name="sort_order" min="0" max="9999" step="1"
                     value="<?= (int) ($editing['sort_order'] ?? 0) ?>" data-testid="edit-sort">
              <small style="color:var(--dark-500);">عددِ کوچک‌تر = زودتر دیده می‌شود.</small>
            </div>

            <div class="form-group">
              <label for="edit_active">وضعیت</label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
                <input type="checkbox" id="edit_active" name="is_active" value="1"
                       <?= (int) ($editing['is_active'] ?? 1) === 1 ? 'checked' : '' ?> data-testid="edit-active">
                فعال (در اپ نمایش داده شود)
              </label>
            </div>
          </div>

          <?php if ((string) ($editing['image_path'] ?? '') !== ''): ?>
            <div style="padding:0 6px 12px;">
              <div style="font-size:12.5px; color:var(--dark-500); margin-bottom:6px;">تصویر فعلی:</div>
              <img src="<?= htmlspecialchars(eplakAdsAdminPreviewUrl((string) $editing['image_path'])) ?>"
                   alt="<?= htmlspecialchars((string) ($editing['title'] ?? '')) ?>"
                   style="max-width:320px; width:100%; border-radius:12px; border:1px solid var(--dark-200, #e5e7eb);"
                   data-testid="edit-preview">
            </div>
          <?php endif; ?>

          <div style="display:flex; gap:10px; padding:0 6px 14px; flex-wrap:wrap;">
            <button type="submit" class="btn btn-primary" data-testid="edit-save"><i class="fas fa-floppy-disk"></i> ذخیره‌ی تغییرها</button>
            <a href="ads.php" class="btn btn-secondary"><i class="fas fa-xmark"></i> انصراف</a>
          </div>
        </form>
      </section>
      <?php endif; ?>

      <!-- ════════ افزودن تبلیغ ════════ -->
      <section class="panel" data-testid="ad-create-panel">
        <div class="panel-header">
          <h2><i class="fas fa-plus" style="color: var(--primary-500); margin-left: 10px;"></i>افزودن تبلیغ تازه</h2>
        </div>

        <form method="post" action="ads.php" enctype="multipart/form-data">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="ad_action" value="create">

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:14px; padding:4px 6px 10px;">
            <div class="form-group">
              <label for="new_placement">جای بنر <span style="color:#b91c1c;">*</span></label>
              <select class="form-control" id="new_placement" name="placement" data-testid="new-placement">
                <?php foreach ($placements as $p): ?>
                  <option value="<?= htmlspecialchars($p) ?>"><?= htmlspecialchars(eplakAdsPlacementLabel($p)) ?></option>
                <?php endforeach; ?>
              </select>
            </div>

            <div class="form-group">
              <label for="new_title">عنوان تبلیغ <span style="color:#b91c1c;">*</span></label>
              <input type="text" class="form-control" id="new_title" name="title" maxlength="255" required
                     placeholder="مثلاً: فروشگاه نمونه — تخفیف پاییزه" data-testid="new-title">
            </div>

            <div class="form-group">
              <label for="new_image_file">تصویر (آپلود از سیستم) <span style="color:#b91c1c;">*</span></label>
              <input type="file" class="form-control" id="new_image_file" name="image_file" accept="image/*" data-testid="new-image-file">
              <small style="color:var(--dark-500);">
                اندازه‌ی پیشنهادی: بنر بزرگ و میانی ۱۵۶۰×۶۰۰ و بنر باریک ۱۵۶۰×۳۱۲ پیکسل.
                اگر فایل آپلود کنید، مسیرش خودکار در فیلد پایین گذاشته می‌شود.
              </small>
            </div>

            <div class="form-group">
              <label for="new_image_path">مسیر/نشانی تصویر <span style="color:#b91c1c;">*</span></label>
              <input type="text" class="form-control" id="new_image_path" name="image_path" maxlength="500" dir="ltr"
                     placeholder="uploads/ads/2026/11/….jpg" data-testid="new-image-path">
              <small style="color:var(--dark-500);">یا نشانی کامل (https://…) یا مسیرِ فایل روی سرور.</small>
            </div>

            <div class="form-group">
              <label for="new_link">لینک (اختیاری)</label>
              <input type="text" class="form-control" id="new_link" name="link_url" maxlength="700" dir="ltr"
                     placeholder="https://example.com" data-testid="new-link">
            </div>

            <div class="form-group">
              <label for="new_alt">متن جایگزین (alt)</label>
              <input type="text" class="form-control" id="new_alt" name="alt_text" maxlength="255"
                     placeholder="اگر خالی بماند، عنوان استفاده می‌شود" data-testid="new-alt">
            </div>

            <div class="form-group">
              <label for="new_webp">نسخه‌ی webp (اختیاری)</label>
              <input type="file" class="form-control" id="new_webp_file" name="image_webp_file" accept="image/webp" data-testid="new-image-webp-file">
              <input type="text" class="form-control" id="new_webp" name="image_webp" maxlength="500" dir="ltr" style="margin-top:6px;"
                     placeholder="assets/img/….webp" data-testid="new-image-webp">
            </div>

            <div class="form-group">
              <label for="new_order">ترتیب نمایش</label>
              <input type="number" class="form-control" id="new_order" name="sort_order" min="0" max="9999" step="1" value="1" data-testid="new-sort">
            </div>

            <div class="form-group">
              <label for="new_active">وضعیت</label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
                <input type="checkbox" id="new_active" name="is_active" value="1" checked data-testid="new-active">
                فعال (در اپ نمایش داده شود)
              </label>
            </div>
          </div>

          <div style="display:flex; gap:10px; padding:0 6px 14px; flex-wrap:wrap;">
            <button type="submit" class="btn btn-primary" data-testid="create-ad"><i class="fas fa-plus"></i> افزودن تبلیغ</button>
          </div>
        </form>
      </section>

      <!-- ════════ فهرست تبلیغ‌ها ════════ -->
      <section class="panel" data-testid="ads-list-panel">
        <div class="panel-header">
          <h2><i class="fas fa-images" style="color: #0f766e; margin-left: 10px;"></i>تبلیغ‌ها به تفکیکِ جای بنر (<?= (int) $totalAds ?>)</h2>
        </div>

        <?php foreach ($placements as $placement): ?>
          <?php $rows = (array) $grouped[$placement]; ?>
          <div style="padding:6px 6px 0;" data-testid="ad-placement-group" data-placement="<?= htmlspecialchars($placement) ?>">
            <h3 style="margin:14px 0 8px; font-size:14.5px;">
              <i class="fas fa-location-dot" style="color:var(--primary-500); margin-left:8px;"></i>
              <?= htmlspecialchars(eplakAdsPlacementLabel($placement)) ?>
              <code style="font-size:11.5px; color:var(--dark-500);"><?= htmlspecialchars($placement) ?></code>
              <span style="font-size:12px; color:var(--dark-500);">(<?= count($rows) ?> تصویر — به همین ترتیب در اپ می‌چرخند)</span>
            </h3>

            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style="width:52px;">ترتیب</th>
                    <th style="width:150px;">تصویر</th>
                    <th>عنوان</th>
                    <th>لینک</th>
                    <th style="width:110px;">وضعیت</th>
                    <th style="width:150px;">آمار کلیک</th>
                    <th style="width:170px;">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  <?php if (!$rows): ?>
                    <tr>
                      <td colspan="7">
                        <div class="empty-state" style="padding:22px 16px;" data-testid="ads-empty-placement">
                          <i class="fas fa-image" style="font-size:34px; color:var(--dark-300);"></i>
                          <h3 style="font-size:14px;">برای این جای بنر تبلیغی نیست</h3>
                          <p style="font-size:12.5px; color:var(--dark-500); margin:6px 0 0;">
                            اپ در این حالت همان بنرِ ثابتِ داخل بسته‌ی خودش را نشان می‌دهد.
                          </p>
                        </div>
                      </td>
                    </tr>
                  <?php endif; ?>

                  <?php foreach ($rows as $index => $ad): ?>
                    <?php
                      $adId     = (int) ($ad['id'] ?? 0);
                      $isActive = (int) ($ad['is_active'] ?? 0) === 1;
                      $link     = trim((string) ($ad['link_url'] ?? ''));
                      $stats    = (array) ($ad['click_stats'] ?? ['count' => 0, 'ips' => 0, 'last' => '']);
                      $preview  = eplakAdsAdminPreviewUrl((string) ($ad['image_path'] ?? ''));
                    ?>
                    <tr data-testid="ad-row" data-ad-id="<?= $adId ?>">
                      <td>
                        <strong><?= (int) $index + 1 ?></strong>
                        <div style="font-size:11px; color:var(--dark-500);">sort=<?= (int) ($ad['sort_order'] ?? 0) ?></div>
                      </td>
                      <td>
                        <?php if ($preview !== ''): ?>
                          <img src="<?= htmlspecialchars($preview) ?>" alt="<?= htmlspecialchars((string) ($ad['title'] ?? '')) ?>"
                               style="width:132px; max-width:100%; border-radius:8px; border:1px solid var(--dark-200, #e5e7eb); display:block;"
                               loading="lazy" data-testid="ad-image">
                        <?php else: ?>
                          <span style="color:#b91c1c; font-size:12px;" data-testid="ad-no-image">بدون تصویر</span>
                        <?php endif; ?>
                      </td>
                      <td>
                        <strong><?= htmlspecialchars((string) ($ad['title'] ?? '')) ?></strong>
                        <?php if ((string) ($ad['alt_text'] ?? '') !== '' && (string) ($ad['alt_text'] ?? '') !== (string) ($ad['title'] ?? '')): ?>
                          <div style="font-size:11.5px; color:var(--dark-500);">alt: <?= htmlspecialchars((string) $ad['alt_text']) ?></div>
                        <?php endif; ?>
                        <div style="font-size:11px; color:var(--dark-500);" dir="ltr"><?= htmlspecialchars((string) ($ad['image_path'] ?? '')) ?></div>
                        <?php if (function_exists('eplakFaDateTimeOf') && (string) ($ad['created_at'] ?? '') !== ''): ?>
                          <div style="font-size:11px; color:var(--dark-500);">ثبت: <?= htmlspecialchars(eplakFaDateTimeOf($ad['created_at'], '—')) ?></div>
                        <?php endif; ?>
                      </td>
                      <td>
                        <?php if ($link !== '' && eplakAdLinkAllowed($link)): ?>
                          <a href="<?= htmlspecialchars($link) ?>" target="_blank" rel="noopener noreferrer"
                             dir="ltr" style="font-size:12px; word-break:break-all;" data-testid="ad-link">
                            <?= htmlspecialchars(mb_strlen($link) > 46 ? mb_substr($link, 0, 46) . '…' : $link) ?>
                            <i class="fas fa-arrow-up-right-from-square" style="font-size:10px;"></i>
                          </a>
                        <?php elseif ($link !== ''): ?>
                          <span style="color:#b91c1c; font-size:12px;" data-testid="ad-bad-link">لینک نامعتبر — به اپ فرستاده نمی‌شود</span>
                        <?php else: ?>
                          <span style="color:var(--dark-500); font-size:12px;" data-testid="ad-no-link">بدون لینک (فقط نمایش)</span>
                        <?php endif; ?>
                      </td>
                      <td>
                        <?php if ($isActive): ?>
                          <span style="display:inline-block; padding:3px 10px; border-radius:999px; background:rgba(15,118,110,.12); color:#0f766e; font-size:12px; font-weight:700;" data-testid="ad-status-active">فعال</span>
                        <?php else: ?>
                          <span style="display:inline-block; padding:3px 10px; border-radius:999px; background:rgba(180,83,9,.12); color:#b45309; font-size:12px; font-weight:700;" data-testid="ad-status-inactive">غیرفعال</span>
                        <?php endif; ?>
                      </td>
                      <td data-testid="ad-clicks">
                        <strong><?= (int) ($ad['click_count'] ?? 0) ?></strong> کلیک
                        <?php if ((int) ($stats['count'] ?? 0) > 0): ?>
                          <div style="font-size:11.5px; color:var(--dark-500);">
                            <?= (int) $stats['ips'] ?> IP یکتا
                            <?php if ((string) ($stats['last'] ?? '') !== '' && function_exists('eplakFaDateTimeOf')): ?>
                              <br>آخرین: <?= htmlspecialchars(eplakFaDateTimeOf($stats['last'], '—')) ?>
                            <?php endif; ?>
                          </div>
                        <?php endif; ?>
                      </td>
                      <td>
                        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                          <form method="post" action="ads.php" style="margin:0; display:inline;">
                            <?= eplakCsrfField() ?>
                            <input type="hidden" name="ad_action" value="move_up">
                            <input type="hidden" name="ad_id" value="<?= $adId ?>">
                            <button type="submit" class="btn-action" title="یک پله بالا (زودتر دیده شود)" data-testid="move-up-ad">
                              <i class="fas fa-arrow-up"></i>
                            </button>
                          </form>

                          <form method="post" action="ads.php" style="margin:0; display:inline;">
                            <?= eplakCsrfField() ?>
                            <input type="hidden" name="ad_action" value="move_down">
                            <input type="hidden" name="ad_id" value="<?= $adId ?>">
                            <button type="submit" class="btn-action" title="یک پله پایین" data-testid="move-down-ad">
                              <i class="fas fa-arrow-down"></i>
                            </button>
                          </form>

                          <form method="post" action="ads.php" style="margin:0; display:inline;">
                            <?= eplakCsrfField() ?>
                            <input type="hidden" name="ad_action" value="toggle">
                            <input type="hidden" name="ad_id" value="<?= $adId ?>">
                            <button type="submit" class="btn-action" title="<?= $isActive ? 'غیرفعال کردن' : 'فعال کردن' ?>" data-testid="toggle-ad">
                              <i class="fas <?= $isActive ? 'fa-ban' : 'fa-circle-check' ?>"></i>
                            </button>
                          </form>

                          <a href="ads.php?edit=<?= $adId ?>" class="btn-action" title="ویرایش" data-testid="edit-ad">
                            <i class="fas fa-pen"></i>
                          </a>

                          <form method="post" action="ads.php" style="margin:0; display:inline;"
                                onsubmit="return confirm('آیا از حذف این تبلیغ اطمینان دارید؟ اگر تصویرش را آپلود کرده باشید، فایلش هم پاک می‌شود.');">
                            <?= eplakCsrfField() ?>
                            <input type="hidden" name="ad_action" value="delete">
                            <input type="hidden" name="ad_id" value="<?= $adId ?>">
                            <button type="submit" class="btn-action delete" title="حذف تبلیغ" data-testid="delete-ad">
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
          </div>
        <?php endforeach; ?>
      </section>

      <p style="margin: 0 20px 24px; color: var(--dark-500); font-size: 12.5px; line-height: 2;">
        <i class="fas fa-mobile-screen"></i>
        اپ تبلیغ‌ها را از <code>api/ads.php</code> می‌خواند؛ پس تغییرِ این صفحه <strong>بی‌نیاز از ساختِ دوباره‌ی APK/IPA</strong>
        در اپِ نصب‌شده دیده می‌شود (به‌شرط اینکه اپ نسخه‌ی ۲.۳ به بعد باشد). اگر سرور در دسترس نباشد یا جدول خالی باشد،
        اپ همان بنرهای ثابتِ داخل بسته‌ی خودش را نشان می‌دهد.
      </p>
    </main>
  </div>
</body>
</html>
