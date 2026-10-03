<?php
/* admin/places.php — مدیریت «اماکن شهری» (نقشه و اماکن شهری در اپ)

   فهرست پیش‌فرض اماکن داخل خودِ اپ است (core/places-data.js). اینجا کارمند شهرداری می‌تواند
   بدون برنامه‌نویس:
     • مکان تازه اضافه کند (مسجد، اداره، فرهنگسرا، …) و موقعیتش را روی نقشه مشخص کند
     • نام/مختصات/تلفن/توضیحِ یک مکانِ پیش‌فرض را اصلاح کند
     • مکانی را از نقشه‌ی اپ پنهان کند و هر وقت خواست برگرداند
   اپ با هر بار باز شدن «نقشه و اماکن شهری»، تغییرها را از api/places.php می‌گیرد.
   منطق و دیتابیس: shared/places_store.php */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';
require_once dirname(__DIR__) . '/shared/places_store.php';

$h = static function ($value): string {
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
};

$builtin = eplakPlacesBuiltin();
$cats = $builtin['categories'];
$ready = eplakPlacesEnsureTable($pdo);

$messages = [
    'saved'     => ['success', '✅ مکان ذخیره شد. با باز شدن «نقشه و اماکن شهری» در اپ، تغییر دیده می‌شود.'],
    'unchanged' => ['info', 'تغییری نسبت به فهرست پیش‌فرض نبود؛ چیزی ذخیره نشد.'],
    'hidden'    => ['info', '🙈 مکان از نقشه‌ی اپ پنهان شد. هر وقت خواستید دوباره نمایانش کنید.'],
    'shown'     => ['success', '👁️ مکان دوباره در نقشه‌ی اپ نمایش داده می‌شود.'],
    'deleted'   => ['info', '🗑️ مکان حذف شد.'],
    'restored'  => ['info', '↩️ مکان به حالت پیش‌فرض برگشت.'],
    'notfound'  => ['danger', '⚠️ این مکان پیدا نشد.'],
    'dberror'   => ['danger', '⚠️ انجام نشد؛ جدول اماکن در دیتابیس در دسترس نیست.'],
];

$errors = [];
$form = null;     /* وقتی مقدار دارد، «فرم» نمایش داده می‌شود */

/* ── کارهای POST (همه با CSRF) ─────────────────────────────────────────── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $action = is_scalar($_POST['action'] ?? null) ? (string) $_POST['action'] : '';
    $key = is_scalar($_POST['key'] ?? null) ? trim((string) $_POST['key']) : '';
    $keep = isset($_POST['back_cat']) && is_scalar($_POST['back_cat']) && isset($cats[(string) $_POST['back_cat']])
        ? '&cat=' . rawurlencode((string) $_POST['back_cat']) : '';
    $go = static function (string $msg) use ($keep): void {
        eplakRedirect('places.php?msg=' . $msg . $keep);
    };

    if (!$ready) {
        $go('dberror');
    }

    if ($action === 'save') {
        $result = eplakPlacesSave($pdo, $key, $_POST);
        if ($result['ok']) {
            $go(!empty($result['changed']) ? 'saved' : 'unchanged');
        }
        $errors = $result['errors'];
        $existing = $key !== '' ? eplakPlacesFind($pdo, $key) : null;
        if ($key !== '' && $existing === null) {
            $go('notfound');
        }
        $form = $result['values'] + [
            'key'       => $key,
            'source'    => $existing['source'] ?? 'custom',
            'hidden'    => empty($_POST['published']),
            'is_new'    => $key === '',
        ];
    } elseif ($action === 'hide' || $action === 'show') {
        if (eplakPlacesFind($pdo, $key) === null) {
            $go('notfound');
        }
        $go(eplakPlacesSetHidden($pdo, $key, $action === 'hide') ? ($action === 'hide' ? 'hidden' : 'shown') : 'dberror');
    } elseif ($action === 'delete' || $action === 'restore') {
        $item = eplakPlacesFind($pdo, $key);
        if ($item === null || ($action === 'delete' && $item['source'] !== 'custom')
            || ($action === 'restore' && $item['source'] !== 'edited')) {
            $go('notfound');
        }
        $go(eplakPlacesDelete($pdo, $key) ? ($action === 'delete' ? 'deleted' : 'restored') : 'dberror');
    } else {
        $go('notfound');
    }
}

/* ── نمایش فرم (افزودن / ویرایش) ───────────────────────────────────────── */
$box = eplakPlacesBox();
$bounds = $builtin['bounds'];
$cityCenter = [
    'lat' => round(($bounds['south'] + $bounds['north']) / 2, 5),
    'lng' => round(($bounds['west'] + $bounds['east']) / 2, 5),
];
if ($form === null && isset($_GET['new'])) {
    $form = [
        'key' => '', 'source' => 'custom', 'hidden' => false, 'is_new' => true,
        'cat' => isset($cats[(string) ($_GET['cat'] ?? '')]) ? (string) $_GET['cat'] : '',
        'name_fa' => '', 'name_en' => '', 'lat' => null, 'lng' => null,
        'addr_fa' => '', 'addr_en' => '', 'tel' => '', 'note_fa' => '', 'note_en' => '', 'approx' => 0,
    ];
} elseif ($form === null && isset($_GET['edit'])) {
    $item = eplakPlacesFind($pdo, is_scalar($_GET['edit']) ? trim((string) $_GET['edit']) : '');
    if ($item === null) {
        eplakRedirect('places.php?msg=notfound');
    }
    $form = $item + ['is_new' => false];
}

/* ── نمایش فهرست ───────────────────────────────────────────────────────── */
$flash = null;
if (isset($_GET['msg']) && is_scalar($_GET['msg']) && isset($messages[(string) $_GET['msg']])) {
    $flash = $messages[(string) $_GET['msg']];
}
$all = $form === null ? eplakPlacesAdminList($pdo) : [];
$counts = ['all' => count($all), 'custom' => 0, 'edited' => 0, 'hidden' => 0, 'cat' => []];
foreach ($all as $it) {
    if ($it['source'] === 'custom') { $counts['custom']++; }
    if ($it['source'] === 'edited') { $counts['edited']++; }
    if ($it['hidden']) { $counts['hidden']++; }
    $counts['cat'][$it['cat']] = ($counts['cat'][$it['cat']] ?? 0) + 1;
}
$fCat = isset($_GET['cat']) && is_scalar($_GET['cat']) && isset($cats[(string) $_GET['cat']]) ? (string) $_GET['cat'] : '';
$fShow = isset($_GET['show']) && is_scalar($_GET['show']) && in_array((string) $_GET['show'], ['custom', 'edited', 'hidden'], true)
    ? (string) $_GET['show'] : '';
$rows = array_values(array_filter($all, static function (array $it) use ($fCat, $fShow): bool {
    if ($fCat !== '' && $it['cat'] !== $fCat) { return false; }
    if ($fShow === 'custom') { return $it['source'] === 'custom'; }
    if ($fShow === 'edited') { return $it['source'] === 'edited'; }
    if ($fShow === 'hidden') { return $it['hidden']; }
    return true;
}));
$qs = static function (array $extra) use ($fCat, $fShow): string {
    $p = array_filter(['cat' => $fCat, 'show' => $fShow], static function ($v) { return $v !== ''; });
    foreach ($extra as $k => $v) {
        if ($v === null || $v === '') { unset($p[$k]); } else { $p[$k] = $v; }
    }
    return $p ? '?' . http_build_query($p) : '';
};
$neshan = static function ($lat, $lng): string {
    return 'https://nshn.ir/?lat=' . rawurlencode(number_format((float) $lat, 6, '.', '')) . '&lng=' . rawurlencode(number_format((float) $lng, 6, '.', ''));
};
$title = $form !== null ? (!empty($form['is_new']) ? 'افزودن مکان جدید' : 'ویرایش مکان') : 'اماکن شهری';
$sourceBadge = [
    'custom'  => ['status-done', 'افزوده‌شده'],
    'edited'  => ['status-progress', 'اصلاح‌شده'],
    'builtin' => ['', 'پیش‌فرض'],
];
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $h($title) ?> — نقشه و اماکن شهری</title>
  <link rel="stylesheet" href="assets/style.css?v=9">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
  <style>
    .pl-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-left:6px; vertical-align:middle; }
    .pl-sub { font-size:12px; color:var(--dark-500); margin-top:3px; }
    .pl-ltr { direction:ltr; unicode-bidi:embed; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; }
    .pl-hidden-row td { opacity:.55; }
    .pl-map { height:340px; border-radius:14px; overflow:hidden; border:2px solid var(--dark-200); position:relative; }
    .pl-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:18px; }
    .pl-note { font-size:13px; line-height:1.9; color:var(--dark-500); margin:0; }
    .pl-search { max-width:320px; }
    .pl-inline { display:inline; margin:0; }
    .pl-chips { gap:8px; }
    .pl-chips a.stat-item { text-decoration:none; padding:6px 14px; border-radius:999px; border:1px solid var(--dark-200); transition:border-color .2s, background .2s; }
    .pl-chips a.stat-item:hover { border-color:var(--primary-500); }
    .pl-chips a.stat-item.active { background:var(--primary-500); border-color:var(--primary-500); color:#fff; }
    .pl-chips a.stat-item.active strong { color:#fff; }
    .pl-chips a.stat-item.active .pl-dot { box-shadow:0 0 0 2px rgba(255,255,255,.7); }
  </style>
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
        <a href="departments.php"><i class="fas fa-sitemap"></i> <span>واحدها</span></a>
        <a href="news.php"><i class="fas fa-newspaper"></i> <span>اخبار و دانستنی‌ها</span></a>
        <a class="active" href="places.php"><i class="fas fa-map-location-dot"></i> <span>اماکن شهری</span></a>
        <a href="notifications.php"><i class="fas fa-bell"></i> <span>ارسال اعلان</span></a>
        <a href="export.php"><i class="fas fa-file-excel"></i> <span>خروجی اکسل</span></a>
        <a href="settings.php"><i class="fas fa-cog"></i> <span>تنظیمات</span></a>
        <a href="version.php"><i class="fas fa-clipboard-check"></i> <span>بررسی نسخه</span></a>
        <a href="logout.php"><i class="fas fa-sign-out-alt"></i> <span>خروج</span></a>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1>
            <i class="fas fa-map-location-dot" style="color: var(--primary-500); margin-left: 12px;"></i>
            <?= $h($title) ?>
          </h1>
          <p>مساجد، ادارات و اماکن دیگر را اینجا اضافه یا اصلاح کنید؛ در «نقشه و اماکن شهری» اپ دیده می‌شود</p>
        </div>
        <div class="topbar-right">
          <?php if ($form !== null): ?>
            <a href="places.php" class="btn btn-secondary"><i class="fas fa-arrow-right"></i> بازگشت به فهرست</a>
          <?php else: ?>
            <a href="places.php?new=1<?= $fCat !== '' ? '&amp;cat=' . $h(rawurlencode($fCat)) : '' ?>" class="btn btn-primary" data-testid="place-add">
              <i class="fas fa-plus"></i> افزودن مکان جدید
            </a>
          <?php endif; ?>
        </div>
      </header>

      <?php if (!$ready): ?>
        <div class="alert alert-danger" style="margin: 0 24px 16px;" data-testid="places-db-error">
          <i class="fas fa-triangle-exclamation"></i> جدول اماکن در دیتابیس ساخته نشد؛ دسترسی «CREATE TABLE» کاربر دیتابیس را بررسی کنید.
          تا آن زمان اپ همان فهرست پیش‌فرض را نشان می‌دهد.
        </div>
      <?php endif; ?>
      <?php if ($flash): ?>
        <div class="alert alert-<?= $h($flash[0]) ?>" style="margin: 0 24px 16px;" data-testid="places-flash"><?= $h($flash[1]) ?></div>
      <?php endif; ?>
      <?php if ($errors): ?>
        <div class="alert alert-danger" style="margin: 0 24px 16px;" data-testid="places-errors">
          <strong>ذخیره نشد:</strong>
          <ul style="margin:8px 22px 0; padding:0;">
            <?php foreach ($errors as $err): ?><li><?= $h($err) ?></li><?php endforeach; ?>
          </ul>
        </div>
      <?php endif; ?>

<?php if ($form !== null): ?>
<?php
    $isNew = !empty($form['is_new']);
    $isBuiltinItem = ($form['source'] ?? '') !== 'custom';
    $lat = $form['lat'] ?? null;
    $lng = $form['lng'] ?? null;
    $hasFix = $lat !== null && $lng !== null;
    $mapInit = [
        'lat' => $hasFix ? (float) $lat : $cityCenter['lat'],
        'lng' => $hasFix ? (float) $lng : $cityCenter['lng'],
        'zoom' => $hasFix ? 17 : 14,
        'hasFix' => $hasFix,
    ];
?>
      <section class="panel" style="margin: 0 24px 24px;">
        <h2><i class="fas fa-pen"></i> <?= $isNew ? 'اطلاعات مکان' : ($isBuiltinItem ? 'اصلاح مکانِ پیش‌فرض' : 'ویرایش مکان') ?></h2>
        <?php if ($isBuiltinItem && !$isNew): ?>
          <p class="pl-note" style="margin-top:10px;">
            این مکان جزو فهرست پیش‌فرض اپ است. اصلاح شما فقط همین مکان را در اپ عوض می‌کند و با «بازگردانی به پیش‌فرض» برمی‌گردد.
          </p>
        <?php endif; ?>
        <form method="post" id="placeForm" style="display:grid; gap:18px; margin-top:16px;" data-testid="place-form">
<?= eplakCsrfField() ?>
          <input type="hidden" name="action" value="save">
          <input type="hidden" name="key" value="<?= $h($form['key']) ?>">

          <div class="pl-grid">
            <div class="form-group">
              <label for="pl_cat">دسته <span style="color:var(--danger);">*</span></label>
              <select class="filter-select" id="pl_cat" name="cat" required style="width:100%;">
                <option value="">— انتخاب کنید —</option>
                <?php foreach ($cats as $cid => $c): ?>
                  <option value="<?= $h($cid) ?>"<?= ($form['cat'] ?? '') === $cid ? ' selected' : '' ?>><?= $h($c['fa'] ?? $cid) ?></option>
                <?php endforeach; ?>
              </select>
            </div>
            <div class="form-group">
              <label for="pl_tel">شماره‌ی تماس (اختیاری)</label>
              <input class="search-input" style="width:100%;" type="text" id="pl_tel" name="tel" dir="ltr" inputmode="tel"
                     maxlength="24" value="<?= $h($form['tel'] ?? '') ?>" placeholder="02136253164">
              <p class="help-text">فقط رقم، با کد شهر. در اپ دکمه‌ی تماس می‌سازد.</p>
            </div>
          </div>

          <div class="pl-grid">
            <div class="form-group">
              <label for="pl_name_fa">نام فارسی <span style="color:var(--danger);">*</span></label>
              <input class="search-input" style="width:100%;" type="text" id="pl_name_fa" name="name_fa" required maxlength="120"
                     value="<?= $h($form['name_fa'] ?? '') ?>" placeholder="مثال: مسجد جامع شهرک مدرس">
            </div>
            <div class="form-group">
              <label for="pl_name_en">نام انگلیسی (اختیاری)</label>
              <input class="search-input" style="width:100%;" type="text" id="pl_name_en" name="name_en" dir="ltr" maxlength="120"
                     value="<?= $h($form['name_en'] ?? '') ?>" placeholder="Shahrak-e Modarres Jame Mosque">
              <p class="help-text">اگر خالی بماند، در نسخه‌ی انگلیسی اپ همان نام فارسی دیده می‌شود.</p>
            </div>
          </div>

          <div class="pl-grid">
            <div class="form-group">
              <label for="pl_addr_fa">نشانی کوتاه فارسی (اختیاری)</label>
              <input class="search-input" style="width:100%;" type="text" id="pl_addr_fa" name="addr_fa" maxlength="160"
                     value="<?= $h($form['addr_fa'] ?? '') ?>" placeholder="مثال: خیابان امام، نرسیده به میدان">
            </div>
            <div class="form-group">
              <label for="pl_addr_en">نشانی انگلیسی (اختیاری)</label>
              <input class="search-input" style="width:100%;" type="text" id="pl_addr_en" name="addr_en" dir="ltr" maxlength="160"
                     value="<?= $h($form['addr_en'] ?? '') ?>" placeholder="Imam St., before the square">
            </div>
          </div>

          <div class="pl-grid">
            <div class="form-group">
              <label for="pl_note_fa">توضیح کوتاه فارسی (اختیاری)</label>
              <input class="search-input" style="width:100%;" type="text" id="pl_note_fa" name="note_fa" maxlength="240"
                     value="<?= $h($form['note_fa'] ?? '') ?>" placeholder="مثال: ساعت کار ۸ تا ۱۴">
            </div>
            <div class="form-group">
              <label for="pl_note_en">توضیح کوتاه انگلیسی (اختیاری)</label>
              <input class="search-input" style="width:100%;" type="text" id="pl_note_en" name="note_en" dir="ltr" maxlength="240"
                     value="<?= $h($form['note_en'] ?? '') ?>" placeholder="Open 8:00–14:00">
            </div>
          </div>

          <div class="form-group">
            <label>موقعیت روی نقشه <span style="color:var(--danger);">*</span></label>
            <p class="pl-note" style="margin-bottom:8px;">
              نقشه را با انگشت یا ماوس بکشید تا نشانگر قرمزِ وسط دقیقاً روی محل قرار بگیرد (با + و − بزرگ‌نمایی کنید).
              مسیریابی «نشان» در اپ به همین نقطه می‌رود. اگر نقشه بارگذاری نشد، عرض و طول جغرافیایی را دستی بنویسید.
            </p>
            <div id="plMap" class="pl-map" data-testid="place-map"></div>
          </div>

          <div class="pl-grid">
            <div class="form-group">
              <label for="pl_lat">عرض جغرافیایی (lat)</label>
              <input class="search-input" style="width:100%;" type="text" id="pl_lat" name="lat" dir="ltr" inputmode="decimal" required
                     value="<?= $lat !== null ? $h(number_format((float) $lat, 6, '.', '')) : '' ?>" placeholder="35.329630">
            </div>
            <div class="form-group">
              <label for="pl_lng">طول جغرافیایی (lng)</label>
              <input class="search-input" style="width:100%;" type="text" id="pl_lng" name="lng" dir="ltr" inputmode="decimal" required
                     value="<?= $lng !== null ? $h(number_format((float) $lng, 6, '.', '')) : '' ?>" placeholder="51.640159">
            </div>
          </div>

          <div class="form-group">
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="checkbox" name="approx" value="1" <?= !empty($form['approx']) ? 'checked' : '' ?> style="width:18px; height:18px;">
              <span>موقعیت تقریبی است (در اپ برچسب «موقعیت تقریبی» دیده می‌شود)</span>
            </label>
          </div>

          <?php if (!$isBuiltinItem): ?>
            <div class="form-group">
              <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                <input type="checkbox" name="published" value="1" <?= empty($form['hidden']) ? 'checked' : '' ?> style="width:18px; height:18px;">
                <span>بلافاصله در اپ نمایش داده شود (بدون تیک = پیش‌نویس)</span>
              </label>
            </div>
          <?php endif; ?>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="submit" class="btn btn-primary" data-testid="place-save"><i class="fas fa-save"></i> ذخیره</button>
            <a href="places.php" class="btn btn-secondary">انصراف</a>
          </div>
        </form>

        <?php if (!$isNew && in_array($form['source'], ['edited', 'custom'], true)): ?>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; border-top:1px solid var(--dark-200); padding-top:14px;">
            <?php if ($form['source'] === 'edited'): ?>
              <form method="post" class="pl-inline" onsubmit="return confirm('اصلاح‌های این مکان پاک شود و به حالت پیش‌فرض برگردد؟')">
<?= eplakCsrfField() ?>
                <input type="hidden" name="action" value="restore">
                <input type="hidden" name="key" value="<?= $h($form['key']) ?>">
                <button type="submit" class="btn btn-secondary" data-testid="place-restore"><i class="fas fa-rotate-left"></i> بازگردانی به پیش‌فرض</button>
              </form>
            <?php endif; ?>
            <?php if ($form['source'] === 'custom'): ?>
              <form method="post" class="pl-inline" onsubmit="return confirm('این مکان برای همیشه حذف شود؟')">
<?= eplakCsrfField() ?>
                <input type="hidden" name="action" value="delete">
                <input type="hidden" name="key" value="<?= $h($form['key']) ?>">
                <button type="submit" class="btn btn-secondary" style="color:var(--danger);" data-testid="place-delete"><i class="fas fa-trash"></i> حذف مکان</button>
              </form>
            <?php endif; ?>
          </div>
        <?php endif; ?>
      </section>

      <script src="../assets/js/ep-map.js?v=4"></script>
      <script>
      (function () {
        var box = document.getElementById('plMap');
        var latEl = document.getElementById('pl_lat');
        var lngEl = document.getElementById('pl_lng');
        if (!box || !latEl || !lngEl || !window.EplakMap) return;
        var init = <?= json_encode($mapInit, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
        var toLatin = function (s) {
          return String(s).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[٫،,]/g, '.');
        };
        var map = window.EplakMap.create(box, {
          lat: init.lat, lng: init.lng, zoom: init.zoom, hasFix: init.hasFix, draggable: true,
          tileProxy: '../api/tiles.php',
          onChange: function (pos) {
            if (!pos || !pos.hasFix) return;
            if (document.activeElement === latEl || document.activeElement === lngEl) return;
            latEl.value = pos.lat.toFixed(6);
            lngEl.value = pos.lng.toFixed(6);
          }
        });
        function fromInputs() {
          if (!map) return;
          var la = parseFloat(toLatin(latEl.value));
          var ln = parseFloat(toLatin(lngEl.value));
          if (isFinite(la) && isFinite(ln) && Math.abs(la) <= 85 && Math.abs(ln) <= 180) map.setPosition(la, ln, true);
        }
        latEl.addEventListener('input', fromInputs);
        lngEl.addEventListener('input', fromInputs);
      })();
      </script>

<?php else: ?>

      <section class="stats-mini pl-chips" style="margin: 0 24px 16px;">
        <a class="stat-item <?= $fCat === '' && $fShow === '' ? 'active' : '' ?>" href="places.php">همه <strong><?= (int) $counts['all'] ?></strong></a>
        <?php foreach ($cats as $cid => $c): ?>
          <a class="stat-item <?= $fCat === $cid ? 'active' : '' ?>" href="places.php?cat=<?= $h(rawurlencode($cid)) ?>">
            <span class="pl-dot" style="background:<?= $h($c['color'] ?? '#999') ?>"></span><?= $h($c['fa'] ?? $cid) ?>
            <strong><?= (int) ($counts['cat'][$cid] ?? 0) ?></strong>
          </a>
        <?php endforeach; ?>
      </section>
      <section class="stats-mini pl-chips" style="margin: 0 24px 16px;">
        <a class="stat-item <?= $fShow === 'custom' ? 'active' : '' ?>" href="places.php<?= $h($qs(['show' => $fShow === 'custom' ? null : 'custom'])) ?>">افزوده‌شده توسط شما <strong><?= (int) $counts['custom'] ?></strong></a>
        <a class="stat-item <?= $fShow === 'edited' ? 'active' : '' ?>" href="places.php<?= $h($qs(['show' => $fShow === 'edited' ? null : 'edited'])) ?>">اصلاح‌شده <strong><?= (int) $counts['edited'] ?></strong></a>
        <a class="stat-item <?= $fShow === 'hidden' ? 'active' : '' ?>" href="places.php<?= $h($qs(['show' => $fShow === 'hidden' ? null : 'hidden'])) ?>">پنهان / پیش‌نویس <strong><?= (int) $counts['hidden'] ?></strong></a>
      </section>

      <section class="panel" style="margin: 0 24px 24px;">
        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; justify-content:space-between;">
          <h2 style="margin:0;"><i class="fas fa-list"></i> فهرست اماکن (<?= count($rows) ?>)</h2>
          <input class="search-input pl-search" type="search" id="plSearch" placeholder="جستجو در نام و نشانی…" aria-label="جستجو" style="width:100%;">
        </div>
        <table style="margin-top:14px;" id="plTable">
          <thead>
            <tr>
              <th>نام</th>
              <th>دسته</th>
              <th>موقعیت</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            <?php if (!$rows): ?>
              <tr>
                <td colspan="5" style="text-align:center; padding: 30px; color: var(--dark-400);">
                  <i class="fas fa-inbox" style="font-size: 26px; display:block; margin-bottom: 10px;"></i>
                  موردی با این فیلتر پیدا نشد.
                </td>
              </tr>
            <?php endif; ?>
            <?php foreach ($rows as $it):
                $c = $cats[$it['cat']] ?? null;
                $badge = $sourceBadge[$it['source']] ?? $sourceBadge['builtin'];
                $hay = $it['name_fa'] . ' ' . $it['name_en'] . ' ' . $it['addr_fa'] . ' ' . $it['addr_en'] . ' ' . $it['note_fa'] . ' ' . ($c['fa'] ?? '');
            ?>
              <tr class="<?= $it['hidden'] ? 'pl-hidden-row' : '' ?>" data-testid="place-row" data-key="<?= $h($it['key']) ?>" data-hay="<?= $h($hay) ?>">
                <td>
                  <strong><?= $h($it['name_fa']) ?></strong>
                  <?php if ($it['name_en'] !== ''): ?><div class="pl-sub pl-ltr"><?= $h($it['name_en']) ?></div><?php endif; ?>
                  <?php if ($it['addr_fa'] !== ''): ?><div class="pl-sub"><i class="fas fa-location-dot" style="font-size:10px;"></i> <?= $h($it['addr_fa']) ?></div><?php endif; ?>
                  <?php if ($it['tel'] !== ''): ?><div class="pl-sub"><i class="fas fa-phone" style="font-size:10px;"></i> <span class="pl-ltr" data-keep-digits><?= $h($it['tel']) ?></span></div><?php endif; ?>
                </td>
                <td style="white-space:nowrap;">
                  <span class="pl-dot" style="background:<?= $h($c['color'] ?? '#999') ?>"></span><?= $h($c['fa'] ?? $it['cat']) ?>
                </td>
                <td style="white-space:nowrap;">
                  <a class="pl-ltr" data-keep-digits href="<?= $h($neshan($it['lat'], $it['lng'])) ?>" target="_blank" rel="noopener noreferrer" title="نمایش در نشان">
                    <?= $h(number_format((float) $it['lat'], 5, '.', '')) ?>, <?= $h(number_format((float) $it['lng'], 5, '.', '')) ?>
                  </a>
                  <?php if (!empty($it['approx'])): ?><div class="pl-sub">تقریبی</div><?php endif; ?>
                </td>
                <td>
                  <?php if ($badge[0] !== ''): ?>
                    <span class="<?= $h($badge[0]) ?>" style="padding: 3px 10px; border-radius: 999px; font-size: 12px;"><?= $h($badge[1]) ?></span>
                  <?php else: ?>
                    <span style="font-size:12px; color:var(--dark-500);"><?= $h($badge[1]) ?></span>
                  <?php endif; ?>
                  <?php if ($it['hidden']): ?>
                    <span class="status-pending" style="padding: 3px 10px; border-radius: 999px; font-size: 12px;"><?= $it['source'] === 'custom' ? 'پیش‌نویس' : 'پنهان' ?></span>
                  <?php endif; ?>
                </td>
                <td>
                  <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <a class="btn-action view" href="places.php?edit=<?= $h(rawurlencode($it['key'])) ?>" title="ویرایش" data-testid="place-edit"><i class="fas fa-edit"></i></a>
                    <form method="post" class="pl-inline">
<?= eplakCsrfField() ?>
                      <input type="hidden" name="action" value="<?= $it['hidden'] ? 'show' : 'hide' ?>">
                      <input type="hidden" name="key" value="<?= $h($it['key']) ?>">
                      <input type="hidden" name="back_cat" value="<?= $h($fCat) ?>">
                      <button type="submit" class="btn-action edit" title="<?= $it['hidden'] ? 'نمایش در اپ' : 'پنهان کردن از اپ' ?>" data-testid="<?= $it['hidden'] ? 'place-show' : 'place-hide' ?>">
                        <i class="fas fa-<?= $it['hidden'] ? 'eye' : 'eye-slash' ?>"></i>
                      </button>
                    </form>
                    <?php if ($it['source'] === 'custom'): ?>
                      <form method="post" class="pl-inline" onsubmit="return confirm('این مکان برای همیشه حذف شود؟')">
<?= eplakCsrfField() ?>
                        <input type="hidden" name="action" value="delete">
                        <input type="hidden" name="key" value="<?= $h($it['key']) ?>">
                        <input type="hidden" name="back_cat" value="<?= $h($fCat) ?>">
                        <button type="submit" class="btn-action delete" title="حذف" data-testid="place-delete"><i class="fas fa-trash"></i></button>
                      </form>
                    <?php elseif ($it['source'] === 'edited'): ?>
                      <form method="post" class="pl-inline" onsubmit="return confirm('اصلاح‌های این مکان پاک شود و به حالت پیش‌فرض برگردد؟')">
<?= eplakCsrfField() ?>
                        <input type="hidden" name="action" value="restore">
                        <input type="hidden" name="key" value="<?= $h($it['key']) ?>">
                        <input type="hidden" name="back_cat" value="<?= $h($fCat) ?>">
                        <button type="submit" class="btn-action reply" title="بازگردانی به پیش‌فرض" data-testid="place-restore"><i class="fas fa-rotate-left"></i></button>
                      </form>
                    <?php endif; ?>
                  </div>
                </td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
        <p class="pl-note" style="margin-top:14px;">
          اماکن «پیش‌فرض» همراه خودِ اپ هستند (منبع: OpenStreetMap و منابع رسمی). اگر مکانی جا افتاده، با «افزودن مکان جدید» اضافه کنید؛
          اگر اشتباه است، ویرایشش کنید یا پنهانش کنید. تغییرها با باز شدن «نقشه و اماکن شهری» در اپ دیده می‌شود.
        </p>
      </section>
      <script>
      (function () {
        var input = document.getElementById('plSearch');
        var rows = document.querySelectorAll('#plTable tbody tr[data-hay]');
        if (!input || !rows.length) return;
        var fix = function (s) {
          return String(s).toLowerCase()
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/[\u200c\s]+/g, ' ').trim();
        };
        input.addEventListener('input', function () {
          var q = fix(input.value);
          Array.prototype.forEach.call(rows, function (tr) {
            tr.style.display = !q || fix(tr.getAttribute('data-hay')).indexOf(q) > -1 ? '' : 'none';
          });
        });
      })();
      </script>
<?php endif; ?>
    </main>
  </div>
</body>
</html>
