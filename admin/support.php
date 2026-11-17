<?php
/* ============================================================================
   admin/support.php — «پشتیبانی آنلاین»: صندوقِ مرکزیِ گفتگوها + رشته‌ی چت
   ============================================================================
   خواسته‌ی کارفرما: «چت مستقیم با پشتیبان» — یک تیمِ مرکزیِ پشتیبانی، در
   ساعاتِ اداری، با امکانِ ارسالِ متن و عکس و فایل.

   سه نما دارد:
     ۱) صندوق (پیش‌فرض)  — فهرستِ گفتگوها با نشانِ «خوانده‌نشده»، فیلتر و جست‌وجو
     ۲) رشته (?id=N)     — حباب‌های گفتگو، کادرِ نوشتن، پاسخ‌های آماده، پیوست،
                            بستن/بازکردن و امتیازِ شهروند؛ با تازه‌سازیِ خودکار
     ۳) تنظیمات (?view=settings) — ساعت و روزهای کاری، پاسخِ خودکار، متنِ
                            خوش‌آمد، پاسخ‌های آماده، سیاستِ پیوست و سقفِ نرخ

   دسترسی: فقط مجوزِ `support` (مدیر کل / تیمِ مرکزیِ پشتیبانی). مدیرِ
   حوزه/معاونت طبقِ docs/ADMIN_ACCESS_FA.md نه منو را می‌بیند نه صفحه را (۴۰۳).

   داده: ظرفِ گفتگو همان ردیفِ tickets با channel='support' است و پیام‌ها در
   ticket_messages ⇒ جست‌وجو، واحدِ مسئول و تاریخچه با بقیه‌ی پنل یکی می‌ماند
   (shared/support.php).

   تازه‌سازیِ زنده: رشته هر ۵ ثانیه با `?json=1&since=<id>` فقط «پیام‌های جدید»
   را می‌گیرد (چند صد بایت). این همان الگویی است که live-pulse.js در پنل دارد؛
   روی هاستِ اشتراکی WebSocket ممکن نیست و long-polling هم worker‌های PHP-FPM
   را تمام می‌کند.

   حضورِ پشتیبان: هر بار که این صفحه (یا همان poll) باز شود، زمانِ فعالیت در
   app_settings ثبت می‌شود تا اپ بتواند صادقانه بگوید «پشتیبان آنلاین است».
   ============================================================================ */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';
require_once dirname(__DIR__) . '/shared/support.php';
/* اعلانِ «پاسخِ پشتیبانی» به گوشیِ شهروند از همین مسیر می‌رود (دیتابیس + FCM +
   Web Push). functions.php آن را فقط داخلِ تابع‌های خودش require می‌کند، پس
   این‌جا صریح بار می‌شود — وگرنه function_exists نادرست می‌گفت و اعلان
   بی‌صدا نمی‌رفت (دقیقاً همان باگی که پیش‌تر در اعلان‌ها داشتیم). */
require_once dirname(__DIR__) . '/shared/notify_events.php';

eplakRequirePermission('support');

$settings = eplakSupportSettings($pdo);
$scope    = eplakAdminScope($pdo);
$notice   = '';
$error    = '';

/* حضورِ پشتیبان — تا شهروند بداند کسی پشتِ پنل هست */
eplakSupportAgentTouch($pdo);

/* ── عملیات‌ها (POST + CSRF) ───────────────────────────────────────────── */
if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'POST') {
    eplakRequireCsrf();
    $act = (string) ($_POST['act'] ?? '');
    $id  = (int) ($_POST['id'] ?? 0);

    if ($act === 'send') {
        $body = (string) ($_POST['body'] ?? '');
        $media = ['path' => '', 'kind' => '', 'name' => '', 'size' => 0];

        /* پیوستِ ارسالی از پنل: همان اعتبارسنجیِ سمتِ اپ (نوعِ واقعیِ فایل، سقفِ حجم) */
        $attach = $_FILES['attach'] ?? null;
        if (is_array($attach) && isset($attach['error']) && (int) $attach['error'] !== UPLOAD_ERR_NO_FILE) {
            /* فایل انتخاب شده است. اگر آپلود در سطحِ PHP شکست خورده باشد
               (معمولاً چون حجمِ عکس از upload_max_filesizeِ هاست بزرگ‌تر است)،
               پیش‌تر این‌جا بی‌صدا رد می‌شد و پیام «بدونِ عکس» ارسال می‌شد —
               ادمین فکر می‌کرد عکس رفته ولی شهروند هیچ‌وقت نمی‌دید. حالا خطا
               صریح به ادمین نشان داده می‌شود و پیام اصلاً ارسال نمی‌شود. */
            $upErr = (int) $attach['error'];
            if ($upErr !== UPLOAD_ERR_OK) {
                $error = ($upErr === UPLOAD_ERR_INI_SIZE || $upErr === UPLOAD_ERR_FORM_SIZE)
                    ? 'حجمِ عکس بیشتر از حدِ مجازِ سرور است؛ لطفاً عکسِ کوچک‌تری بفرستید.'
                    : 'آپلودِ عکس ناموفق بود؛ لطفاً دوباره تلاش کنید.';
            } elseif ((int) ($attach['size'] ?? 0) <= 0) {
                $error = 'فایلِ انتخاب‌شده خالی است.';
            } else {
                $raw = @file_get_contents((string) $attach['tmp_name']);
                if ($raw === false) {
                    $error = 'خواندنِ فایلِ پیوست ممکن نشد.';
                } else {
                    $stored = eplakSupportStoreAttachment(base64_encode($raw),
                        (string) ($attach['name'] ?? ''),
                        (string) ($attach['type'] ?? ''), $settings);
                    if (empty($stored['ok'])) {
                        $hints = ['bad_type' => 'این نوع فایل مجاز نیست (فقط عکس، ویدیو و سند).',
                                  'too_large' => 'حجمِ فایل بیشتر از حدِ مجاز است.',
                                  'attachments_disabled' => 'ارسالِ پیوست غیرفعال است.'];
                        $error = $hints[(string) $stored['error']] ?? 'ذخیره‌ی پیوست ممکن نشد.';
                    } else {
                        $media = ['path' => $stored['path'], 'kind' => $stored['kind'],
                                  'name' => $stored['name'], 'size' => (int) $stored['size']];
                    }
                }
            }
        }

        if ($error === '' && $id > 0) {
            $st = $pdo->prepare('SELECT * FROM tickets WHERE id = ? LIMIT 1');
            $st->execute([$id]);
            $ticket = $st->fetch(PDO::FETCH_ASSOC);
            if (!$ticket) {
                $error = 'گفتگو پیدا نشد.';
            } else {
                $posted = eplakSupportPostMessage($pdo, $ticket, 'admin', $body, '',
                    (int) eplakAdminId(), (string) eplakAdminUsername(), $media);
                if (empty($posted['ok'])) {
                    $error = 'ارسالِ پاسخ ممکن نشد (' . htmlspecialchars((string) $posted['error'], ENT_QUOTES, 'UTF-8') . ').';
                } else {
                    /* اعلان به گوشیِ شهروند — همان مسیرِ پاسخِ تیکت.
                       نکته‌ی سرعت: «ثبت در دیتابیس» سریع است ولی «رساندنِ فوری به
                       گوشی» (FCM + Web Push) تماسِ شبکه‌ایِ کند با گوگل/مرورگر است
                       و اگر همگام صدا زده شود، ارسالِ ادمین ده‌ها ثانیه قفل می‌شود
                       (گزارشِ کاربر: «ارسال خیلی کند است»). پس این‌جا فقط اعلان را
                       در دیتابیس ثبت می‌کنیم (شهروند در اپ می‌بیند)، پاسخِ فوری
                       (ریدایرکت) به ادمین می‌دهیم، و پوشِ گوشی را «پس از پاسخ» در
                       پس‌زمینه انجام می‌دهیم تا ادمین منتظر نماند. */
                    $excerpt = trim($body) !== '' ? $body : 'پیوستِ تازه دریافت کردید';
                    $notifBody = function_exists('eplakNotifyTrim') ? eplakNotifyTrim($excerpt, 180) : $excerpt;
                    $notifId = 0;
                    if (function_exists('eplakNotificationInsert')) {
                        try {
                            $ins = eplakNotificationInsert($pdo, (string) $ticket['user_phone'],
                                'پاسخِ پشتیبانی ای‌پلاک', $notifBody);
                            $notifId = (int) ($ins['id'] ?? 0);
                        } catch (Throwable $e) {
                            /* ثبتِ اعلان ناموفق بود، ولی پیام ثبت شده است */
                        }
                    }
                    eplakSupportMarkRead($pdo, $id, 'admin');

                    /* پاسخِ فوری به ادمین (همان نشانیِ eplakRedirect) */
                    $target = '/admin/support.php?id=' . $id;
                    $target = eplakUrl($target);
                    if (eplakSessionInUrlNeeded()) {
                        $sep = (strpos($target, '?') === false) ? '?' : '&';
                        $target .= $sep . rawurlencode((string) session_name()) . '=' . rawurlencode((string) session_id());
                    }
                    header('Location: ' . $target);
                    /* پاسخ را همین حالا به ادمین بفرست؛ ادامه (پوشِ گوشی) در پس‌زمینه */
                    if (function_exists('fastcgi_finish_request')) {
                        fastcgi_finish_request();
                    } else {
                        ignore_user_abort(true);
                    }

                    /* اعلانِ فوری به گوشی (FCM + Web Push) — پس از پاسخِ ادمین */
                    if ($notifId > 0 && function_exists('eplakNotifyPushOnly')) {
                        try {
                            eplakNotifyPushOnly($pdo, $notifId, (string) $ticket['user_phone'],
                                'پاسخِ پشتیبانی ای‌پلاک', $excerpt);
                        } catch (Throwable $e) {
                            /* اعلانِ گوشی نرسید، ولی پیام و اعلانِ دیتابیس ثبت شده‌اند */
                        }
                    }
                    exit;
                }
            }
        } elseif ($error === '') {
            $error = 'شناسه‌ی گفتگو نامعتبر است.';
        }
    } elseif ($act === 'close' && $id > 0) {
        $ok = eplakSupportClose($pdo, $id, 0);
        $notice = $ok ? 'گفتگو بسته شد.' : '';
        $error  = $ok ? '' : 'بستنِ گفتگو ممکن نشد.';
    } elseif ($act === 'reopen' && $id > 0) {
        $ok = eplakSupportReopen($pdo, $id);
        $notice = $ok ? 'گفتگو دوباره باز شد.' : '';
        $error  = $ok ? '' : 'بازکردنِ گفتگو ممکن نشد.';
    } elseif ($act === 'delete' && $id > 0) {
        /* حذفِ کاملِ گفتگو (پیام‌ها + پیوست‌ها + ردیف) — فقط channel='support' */
        $ok = eplakSupportDeleteThread($pdo, $id);
        if ($ok) {
            eplakRedirect('support.php');
            exit;
        }
        $error = 'حذفِ گفتگو ممکن نشد.';
    } elseif ($act === 'delete_closed') {
        /* پاک‌سازیِ صندوق: حذفِ همه‌ی گفتگوهای بسته‌شده */
        $deleted = eplakSupportDeleteClosed($pdo);
        $notice = $deleted > 0
            ? '✅ ' . eplakChartNumFa($deleted) . ' گفتگوی بسته‌شده حذف شد.'
            : 'گفتگوی بسته‌شده‌ای برای حذف نبود.';
    } elseif ($act === 'save_settings') {
        $saved = eplakSupportSaveSettings($pdo, $_POST);
        $settings = eplakSupportSettings($pdo);
        $notice = count($saved) > 0
            ? 'تنظیماتِ پشتیبانی ذخیره شد (' . eplakChartNumFa(count($saved)) . ' مورد).'
            : 'هیچ تغییری برای ذخیره نبود.';
    } else {
        $error = 'عملیاتِ ناشناخته.';
    }
}

/** رقمِ فارسی (این صفحه charts.php را بار نمی‌کند) */
function eplakChartNumFa($n): string
{
    $n = number_format((int) $n);
    return function_exists('eplakFaDigits') ? eplakFaDigits($n) : $n;
}

/* ── نمایِ رشته + حالتِ JSON برایِ تازه‌سازیِ خودکار ───────────────────── */
$view = (string) ($_GET['view'] ?? '');
$id   = (int) ($_GET['id'] ?? 0);
$esc  = static function ($v) { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); };

if ($id > 0 && $view !== 'settings') {
    $st = $pdo->prepare('SELECT * FROM tickets WHERE id = ? LIMIT 1');
    $st->execute([$id]);
    $ticket = $st->fetch(PDO::FETCH_ASSOC);
    if (!$ticket) {
        $error = 'گفتگو پیدا نشد.';
        $id = 0;
    } else {
        eplakSupportMarkRead($pdo, $id, 'admin');
        $since = max(0, (int) ($_GET['since'] ?? 0));
        $thread = eplakSupportMessages($pdo, $id, $since, 120);

        if ((string) ($_GET['json'] ?? '') === '1') {
            while (ob_get_level() > 0) {
                ob_end_clean();
            }
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store, no-cache, must-revalidate');
            header('X-Content-Type-Options: nosniff');
            echo json_encode([
                'success'  => true,
                'last_id'  => (int) $thread['last_id'],
                'messages' => array_map(static function ($m) {
                    $pub = eplakSupportPublicMessage($m);
                    $pub['created_fa'] = function_exists('eplakFaDateTimeOf')
                        ? eplakFaDateTimeOf($m['created_at'] ?? null, '') : '';
                    return $pub;
                }, $thread['messages']),
                'unread'   => 0,
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
}

$inbox = ($id > 0 && $view !== 'settings') ? [] : eplakSupportAdminInbox($pdo, [
    'state' => (string) ($_GET['state'] ?? ''),
    'q'     => (string) ($_GET['q'] ?? ''),
    'limit' => 80,
], $scope);
$unreadTotal = eplakSupportUnreadTotal($pdo);
$canned = eplakSupportCanned($settings);
$state  = eplakSupportIsOpen($settings, function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : null);
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>پشتیبانی آنلاین — پنل مدیریت ای‌پلاک</title>
  <link rel="stylesheet" href="assets/style.css?v=10">
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
  <style>
    /* ── فقط این صفحه: پوسته‌ی گفتگو (با هر دو حالتِ روشن/تاریکِ پنل) ── */
    .sup-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:18px}
    .sup-seg{display:inline-flex;flex-wrap:wrap;gap:5px;padding:4px;border:1px solid var(--dark-200);border-radius:var(--radius-full);background:var(--dark-50)}
    .sup-seg a{padding:7px 14px;border-radius:var(--radius-full);font-size:13px;font-weight:600;text-decoration:none;color:var(--dark-600)}
    .sup-seg a.active{background:var(--primary-500);color:#fff}
    .sup-badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 7px;border-radius:var(--radius-full);background:var(--danger,#ef4444);color:#fff;font-size:12px;font-weight:800}
    .sup-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
    .sup-list li a{display:flex;align-items:center;gap:13px;padding:14px 16px;border:1px solid var(--ch-border,var(--dark-100));border-radius:var(--radius-lg,14px);background:var(--ch-card,#fff);text-decoration:none;color:inherit}
    .sup-list li a:hover{border-color:var(--primary-400)}
    .sup-list li{display:flex;align-items:center;gap:10px}
    .sup-list li>a{flex:1;min-width:0}
    .sup-list li>form{flex:0 0 auto}
    .sup-who{flex:0 0 auto;display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:var(--primary-50,#e0f2fe);color:var(--primary-600);font-size:17px}
    .sup-main{flex:1;min-width:0}
    .sup-main strong{display:block;font-size:14px;color:var(--dark-900);direction:ltr;text-align:right}
    .sup-main span{display:block;font-size:12.5px;color:var(--dark-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sup-meta{flex:0 0 auto;text-align:left;font-size:11.5px;color:var(--dark-500)}
    .sup-chat{display:flex;flex-direction:column;gap:10px;max-height:min(62vh,620px);overflow-y:auto;padding:6px 4px 14px}
    .sup-msg{max-width:min(78%,620px);padding:11px 15px;border-radius:18px;font-size:14px;line-height:1.9;word-break:break-word}
    .sup-msg time{display:block;margin-top:5px;font-size:11px;opacity:.72}
    .sup-citizen{align-self:flex-start;background:var(--dark-50);border:1px solid var(--ch-border,var(--dark-100));border-bottom-right-radius:6px;color:var(--dark-800)}
    .sup-admin{align-self:flex-end;background:var(--primary-500);color:#fff;border-bottom-left-radius:6px}
    .sup-system{align-self:center;max-width:min(92%,680px);background:var(--warning-bg,#fef3c7);color:#92400e;border-radius:14px;font-size:12.5px;text-align:center}
    .sup-attach{display:inline-flex;align-items:center;gap:7px;margin-top:7px;padding:6px 11px;border-radius:10px;background:rgba(255,255,255,.16);font-size:12.5px;text-decoration:none;color:inherit}
    .sup-citizen .sup-attach{background:var(--dark-100)}
    .sup-composer{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-top:14px;padding-top:14px;border-top:1px solid var(--dark-100)}
    .sup-composer textarea{flex:1;min-width:220px;min-height:74px;padding:12px 14px;border:2px solid var(--dark-200);border-radius:var(--radius-md);background:var(--dark-50);color:var(--dark-800);font-family:var(--font-family);font-size:14px;line-height:1.9;resize:vertical}
    .sup-canned{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}
    .sup-canned button{padding:6px 12px;border:1px solid var(--dark-200);border-radius:var(--radius-full);background:var(--dark-50);color:var(--dark-600);font-family:var(--font-family);font-size:12.5px;cursor:pointer}
    .sup-canned button:hover{border-color:var(--primary-400);color:var(--primary-600)}
    .sup-state{display:inline-flex;align-items:center;gap:7px;padding:4px 12px;border-radius:var(--radius-full);font-size:12.5px;font-weight:700}
    .sup-open{background:#dcfce7;color:#047857}
    .sup-closed{background:var(--dark-100);color:var(--dark-600)}
    .sup-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
    .sup-field label{display:block;font-size:13px;font-weight:600;color:var(--dark-700);margin-bottom:6px}
    .sup-field input[type=text],.sup-field input[type=time],.sup-field input[type=number],.sup-field textarea,.sup-field select{width:100%;padding:10px 13px;border:2px solid var(--dark-200);border-radius:var(--radius-md);background:var(--dark-50);color:var(--dark-800);font-family:var(--font-family);font-size:14px}
    .sup-field textarea{min-height:96px;line-height:1.9;resize:vertical}
    .sup-days{display:flex;flex-wrap:wrap;gap:9px}
    .sup-days label{display:inline-flex;align-items:center;gap:6px;margin:0;font-weight:500}
    .sup-note{font-size:12.5px;color:var(--dark-500);line-height:2;margin:7px 0 0}
    @media (max-width:640px){.sup-msg{max-width:92%}.sup-meta{display:none}}
  </style>
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
<?= eplakAdminSidebar('support') ?>      </nav>
    </aside>

    <main class="main">
      <header class="topbar">
        <h1>پشتیبانی آنلاین <?= eplakAdminScopeBadge($pdo) ?></h1>
        <p>گفتگوی زنده‌ی شهروندان با تیمِ پشتیبانی — <?= $esc($state['label'] ?: 'ساعتِ کاری تنظیم نشده') ?></p>
      </header>

<?php if ($notice !== ''): ?>
      <div class="alert alert-success"><i class="fa-solid fa-circle-check"></i> <?= $esc($notice) ?></div>
<?php endif; ?>
<?php if ($error !== ''): ?>
      <div class="alert alert-danger"><i class="fa-solid fa-triangle-exclamation"></i> <?= $esc($error) ?></div>
<?php endif; ?>

<?php if ($id > 0 && isset($ticket) && $ticket): ?>
      <!-- ══════════ نمایِ رشته‌ی گفتگو ══════════ -->
      <section class="panel" data-testid="support-thread">
        <div class="panel-header">
          <div>
            <h2 class="section-title">
              <i class="fa-solid fa-headset"></i> گفتگو با <?= $esc($ticket['user_phone']) ?>
              <span class="sup-state <?= trim((string) ($ticket['closed_at'] ?? '')) !== '' ? 'sup-closed' : 'sup-open' ?>">
                <?= trim((string) ($ticket['closed_at'] ?? '')) !== '' ? 'بسته‌شده' : 'باز' ?>
              </span>
            </h2>
            <p class="sup-note" style="margin:6px 0 0">
              واحد: <?= $esc($ticket['department'] ?: '—') ?> ·
              شروع: <?= $esc(function_exists('eplakFaDateTimeOf') ? eplakFaDateTimeOf($ticket['created_at'] ?? null, '—') : '—') ?>
              <?php if ((int) ($ticket['rating'] ?? 0) > 0): ?>
                · امتیازِ شهروند: <?= $esc(eplakChartNumFa($ticket['rating'])) ?> از ۵
              <?php endif; ?>
            </p>
          </div>
          <div class="panel-actions">
            <a class="btn btn-outline btn-sm" href="support.php"><i class="fa-solid fa-inbox"></i> صندوقِ گفتگوها</a>
            <form method="post" action="support.php?id=<?= (int) $ticket['id'] ?>" style="display:inline"
                  onsubmit="return confirm('این گفتگو (همه‌ی پیام‌ها و پیوست‌ها) برای همیشه حذف می‌شود. ادامه می‌دهید؟');">
              <?= eplakCsrfField() ?>
              <input type="hidden" name="act" value="delete">
              <input type="hidden" name="id" value="<?= (int) $ticket['id'] ?>">
              <button class="btn btn-danger btn-sm" type="submit"><i class="fa-solid fa-trash"></i> حذفِ گفتگو</button>
            </form>
<?php if (trim((string) ($ticket['closed_at'] ?? '')) === ''): ?>
            <form method="post" action="support.php?id=<?= (int) $ticket['id'] ?>" style="display:inline">
              <?= eplakCsrfField() ?>
              <input type="hidden" name="act" value="close">
              <input type="hidden" name="id" value="<?= (int) $ticket['id'] ?>">
              <button class="btn btn-secondary btn-sm" type="submit"><i class="fa-solid fa-check-double"></i> بستنِ گفتگو</button>
            </form>
<?php else: ?>
            <form method="post" action="support.php?id=<?= (int) $ticket['id'] ?>" style="display:inline">
              <?= eplakCsrfField() ?>
              <input type="hidden" name="act" value="reopen">
              <input type="hidden" name="id" value="<?= (int) $ticket['id'] ?>">
              <button class="btn btn-secondary btn-sm" type="submit"><i class="fa-solid fa-rotate-left"></i> بازکردنِ دوباره</button>
            </form>
<?php endif; ?>
          </div>
        </div>

        <div class="sup-chat" id="supChat" data-last="<?= (int) $thread['last_id'] ?>">
<?php
$allMessages = eplakSupportMessages($pdo, $id, 0, 300);
foreach ($allMessages['messages'] as $m):
    $pub  = eplakSupportPublicMessage($m);
    $kind = (string) $pub['sender'];
    $cls  = $kind === 'admin' ? 'sup-admin' : ($kind === 'citizen' ? 'sup-citizen' : 'sup-system');
    $when = function_exists('eplakFaDateTimeOf') ? eplakFaDateTimeOf($m['created_at'] ?? null, '') : '';
?>
          <div class="sup-msg <?= $esc($cls) ?>" data-id="<?= (int) $pub['id'] ?>">
<?php if ($kind === 'admin'): ?>
            <strong style="font-size:12px;opacity:.85"><?= $esc($pub['sender_name'] ?: 'پشتیبانی') ?></strong>
<?php endif; ?>
            <div><?= nl2br($esc($pub['body'])) ?></div>
<?php if (!empty($pub['media'])): ?>
            <a class="sup-attach" target="_blank" rel="noreferrer"
               href="../api/support.php?action=file&amp;m=<?= $esc(urlencode($pub['media']['path'])) ?>&amp;phone=<?= $esc(urlencode($ticket['user_phone'])) ?>">
              <i class="fa-solid <?= $pub['media']['kind'] === 'image' ? 'fa-image' : ($pub['media']['kind'] === 'video' ? 'fa-film' : 'fa-paperclip') ?>"></i>
              <?= $esc($pub['media']['name'] ?: 'پیوست') ?>
              <?php if ((int) $pub['media']['size'] > 0): ?>
                <em style="font-style:normal;opacity:.7">(<?= $esc(eplakChartNumFa((int) round($pub['media']['size'] / 1024))) ?> کیلوبایت)</em>
              <?php endif; ?>
            </a>
<?php endif; ?>
            <time><?= $esc($when) ?><?= !empty($pub['read']) ? ' · خوانده‌شده' : '' ?></time>
          </div>
<?php endforeach; ?>
        </div>

        <form class="sup-composer" method="post" action="support.php?id=<?= (int) $ticket['id'] ?>" enctype="multipart/form-data">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="act" value="send">
          <input type="hidden" name="id" value="<?= (int) $ticket['id'] ?>">
          <textarea name="body" id="supBody" maxlength="<?= (int) EPLAK_SUPPORT_MAX_BODY ?>"
                    placeholder="پاسخ خود را بنویسید… (Enter برایِ فرستادن، Shift+Enter برایِ سطرِ تازه)"></textarea>
          <div style="display:grid;gap:9px">
            <label class="btn btn-outline btn-sm" style="cursor:pointer">
              <i class="fa-solid fa-paperclip"></i> پیوست
              <input type="file" name="attach" id="supAttach" style="display:none"
                     accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt">
            </label>
            <span id="supAttachNote" style="font-size:11.5px;color:var(--dark-500)"></span>
            <button class="btn btn-primary btn-sm" type="submit"><i class="fa-solid fa-paper-plane"></i> ارسالِ پاسخ</button>
          </div>
<?php if ($canned): ?>
          <div class="sup-canned" style="flex-basis:100%">
<?php foreach ($canned as $c): ?>
            <button type="button" data-canned="<?= $esc($c) ?>"><?= $esc(function_exists('eplakNotifyTrim') ? eplakNotifyTrim($c, 46) : $c) ?></button>
<?php endforeach; ?>
          </div>
<?php endif; ?>
        </form>
        <p class="chart-note"><i class="fa-solid fa-circle-info"></i>
          با هر پاسخ، اعلان به گوشیِ شهروند هم فرستاده می‌شود (همان مسیرِ پاسخِ تیکت: دیتابیس + FCM + Web Push).
          این صفحه هر ۵ ثانیه فقط پیام‌های تازه را می‌گیرد.</p>
      </section>

      <script>
      (function () {
        'use strict';
        var chat = document.getElementById('supChat');
        var body = document.getElementById('supBody');
        if (!chat) { return; }

        /* کوچک‌سازیِ خودکارِ عکس پیش از آپلود: عکس‌های گوشی معمولاً ۳ تا ۵
           مگابایت‌اند و روی هاست‌های اشتراکی upload_max_filesize اغلب ۲ مگابایت
           است — در این حالت PHP فایل را اصلاً تحویل نمی‌دهد و عکس «گم» می‌شد.
           این‌جا عکسِ بزرگ را با canvas تا حداکثر ۱۶۰۰ پیکسل و JPEG کم می‌کنیم
           تا همیشه زیرِ سقف بماند و به شهروند برسد. */
        var attachInput = document.getElementById('supAttach');
        var attachNote = document.getElementById('supAttachNote');
        if (attachInput) {
          attachInput.addEventListener('change', function () {
            var file = attachInput.files && attachInput.files[0];
            if (!file) { if (attachNote) { attachNote.textContent = ''; } return; }
            if (attachNote) { attachNote.textContent = file.name; }
            if (!/^image\//.test(file.type || '') || file.size <= 2 * 1024 * 1024) { return; }
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
              var maxDim = 1600;
              var scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
              var canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
              canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
              var ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(url);
              if (canvas.toBlob) {
                canvas.toBlob(function (blob) {
                  if (!blob) { return; }
                  try {
                    var dt = new DataTransfer();
                    var name = String(file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
                    dt.items.add(new File([blob], name, { type: 'image/jpeg' }));
                    attachInput.files = dt.files;
                    if (attachNote) { attachNote.textContent = name + ' (کوچک شد: ' + Math.round(blob.size / 1024) + ' کیلوبایت)'; }
                  } catch (e) { /* مرورگرِ قدیمی: همان فایلِ اصلی می‌رود */ }
                }, 'image/jpeg', 0.85);
              }
            };
            img.onerror = function () { URL.revokeObjectURL(url); };
            img.src = url;
          });
        }

        /* پاسخ‌های آماده ⇒ داخلِ کادرِ نوشتن */
        Array.prototype.forEach.call(document.querySelectorAll('[data-canned]'), function (btn) {
          btn.addEventListener('click', function () {
            if (!body) { return; }
            body.value = btn.getAttribute('data-canned') || '';
            body.focus();
          });
        });

        /* Enter = ارسال، Shift+Enter = سطرِ تازه */
        if (body) {
          body.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (String(body.value).trim() !== '') { body.form.submit(); }
            }
          });
        }

        var esc = function (s) {
          return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
          });
        };

        function appendMessage(m) {
          var kind = m.sender === 'admin' ? 'sup-admin' : (m.sender === 'citizen' ? 'sup-citizen' : 'sup-system');
          var el = document.createElement('div');
          el.className = 'sup-msg ' + kind;
          el.setAttribute('data-id', String(m.id));
          var who = m.sender === 'admin'
            ? '<strong style="font-size:12px;opacity:.85">' + esc(m.sender_name || 'پشتیبانی') + '</strong>' : '';
          var media = '';
          if (m.media && m.media.path) {
            var icon = m.media.kind === 'image' ? 'fa-image' : (m.media.kind === 'video' ? 'fa-film' : 'fa-paperclip');
            media = '<a class="sup-attach" target="_blank" rel="noreferrer" href="../api/support.php?action=file&m='
              + encodeURIComponent(m.media.path) + '&phone=<?= $esc(urlencode($ticket['user_phone'])) ?>">'
              + '<i class="fa-solid ' + icon + '"></i> ' + esc(m.media.name || 'پیوست') + '</a>';
          }
          el.innerHTML = who + '<div>' + esc(m.body).replace(/\n/g, '<br>') + '</div>' + media
            + '<time>' + esc(m.created_fa || '') + '</time>';
          chat.appendChild(el);
          chat.scrollTop = chat.scrollHeight;
        }

        /* تازه‌سازیِ زنده: فقط پیام‌های «بعد از» آخرین شناسه (چند صد بایت) */
        var busy = false;
        async function poll() {
          if (busy || document.hidden) { return; }
          busy = true;
          try {
            var since = chat.getAttribute('data-last') || '0';
            var res = await fetch('support.php?id=<?= (int) $id ?>&json=1&since=' + encodeURIComponent(since) + '&t=' + Date.now(), {
              cache: 'no-store', credentials: 'same-origin'
            });
            var data = await res.json();
            if (data && data.success === true && Array.isArray(data.messages)) {
              data.messages.forEach(function (m) {
                if (!chat.querySelector('[data-id="' + m.id + '"]')) { appendMessage(m); }
              });
              if (data.last_id) { chat.setAttribute('data-last', String(data.last_id)); }
            }
          } catch (e) { /* بی‌صدا: گفتگو از قبل روی صفحه هست */ }
          busy = false;
        }
        chat.scrollTop = chat.scrollHeight;
        setInterval(poll, 5000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { poll(); } });
      })();
      </script>

<?php elseif ($view === 'settings'): ?>
      <!-- ══════════ تنظیماتِ پشتیبانی ══════════ -->
      <section class="panel" data-testid="support-settings">
        <div class="panel-header">
          <h2 class="section-title"><i class="fa-solid fa-sliders"></i> تنظیماتِ پشتیبانی آنلاین</h2>
          <a class="btn btn-outline btn-sm" href="support.php"><i class="fa-solid fa-inbox"></i> بازگشت به صندوق</a>
        </div>
        <form method="post" action="support.php?view=settings">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="act" value="save_settings">
          <div class="sup-fields">
            <div class="sup-field">
              <label for="enabled">وضعیتِ بخش</label>
              <select id="enabled" name="enabled">
                <option value="1" <?= $settings['enabled'] === '1' ? 'selected' : '' ?>>فعال</option>
                <option value="0" <?= $settings['enabled'] !== '1' ? 'selected' : '' ?>>غیرفعال (موقت)</option>
              </select>
              <p class="sup-note">اگر غیرفعال شود، اپ پیامِ «پشتیبانی موقتاً غیرفعال است» نشان می‌دهد و پیامی ثبت نمی‌شود.</p>
            </div>
            <div class="sup-field">
              <label for="department">واحدِ مسئول</label>
              <input type="text" id="department" name="department" maxlength="120" value="<?= $esc($settings['department']) ?>">
              <p class="sup-note">همان واحدی که در تیکت‌ها استفاده می‌شود؛ گفتگوها به آن نسبت داده می‌شوند.</p>
            </div>
            <div class="sup-field">
              <label for="from">از ساعت</label>
              <input type="text" id="from" name="from" dir="ltr" maxlength="5" value="<?= $esc($settings['from']) ?>" placeholder="07:30">
            </div>
            <div class="sup-field">
              <label for="to">تا ساعت</label>
              <input type="text" id="to" name="to" dir="ltr" maxlength="5" value="<?= $esc($settings['to']) ?>" placeholder="16:30">
            </div>
            <div class="sup-field" style="grid-column:1/-1">
              <label>روزهای پاسخ‌گویی</label>
              <div class="sup-days">
<?php
$dayNames = [6 => 'شنبه', 7 => 'یکشنبه', 1 => 'دوشنبه', 2 => 'سه‌شنبه', 3 => 'چهارشنبه', 4 => 'پنجشنبه', 5 => 'جمعه'];
$selected = array_map('intval', array_filter(explode(',', (string) $settings['days']), 'strlen'));
foreach ([6, 7, 1, 2, 3, 4, 5] as $dow): ?>
                <label><input type="checkbox" name="days_csv[]" value="<?= (int) $dow ?>" <?= in_array($dow, $selected, true) ? 'checked' : '' ?>> <?= $esc($dayNames[$dow]) ?></label>
<?php endforeach; ?>
              </div>
              <p class="sup-note">بیرونِ این روزها و ساعت‌ها، پیامِ خودکار ثبت می‌شود و گفتگو باز می‌ماند.</p>
            </div>
            <div class="sup-field" style="grid-column:1/-1">
              <label for="welcome">متنِ خوش‌آمد (نخستین پیامِ سامانه)</label>
              <textarea id="welcome" name="welcome" maxlength="2000"><?= $esc($settings['welcome']) ?></textarea>
            </div>
            <div class="sup-field" style="grid-column:1/-1">
              <label for="auto_reply">پاسخِ خودکارِ بیرونِ ساعتِ کاری</label>
              <textarea id="auto_reply" name="auto_reply" maxlength="2000"><?= $esc($settings['auto_reply']) ?></textarea>
            </div>
            <div class="sup-field" style="grid-column:1/-1">
              <label for="canned">پاسخ‌های آماده (هر خط یکی)</label>
              <textarea id="canned" name="canned" maxlength="2000"><?= $esc($settings['canned']) ?></textarea>
              <p class="sup-note">این‌ها به‌صورتِ دکمه زیرِ کادرِ نوشتن نشان داده می‌شوند تا پاسخ‌گویی سریع‌تر شود.</p>
            </div>
            <div class="sup-field">
              <label>پیوست‌ها</label>
              <label style="font-weight:500"><input type="checkbox" name="attach_images" value="1" <?= $settings['attach_images'] === '1' ? 'checked' : '' ?>> عکس و ویدیو مجاز باشد</label>
              <label style="font-weight:500"><input type="checkbox" name="attach_files" value="1" <?= $settings['attach_files'] === '1' ? 'checked' : '' ?>> سند (PDF/Word/Excel/TXT) مجاز باشد</label>
            </div>
            <div class="sup-field">
              <label for="max_image_mb">سقفِ حجمِ عکس (مگابایت)</label>
              <input type="number" id="max_image_mb" name="max_image_mb" min="1" max="50" value="<?= (int) $settings['max_image_mb'] ?>">
            </div>
            <div class="sup-field">
              <label for="max_file_mb">سقفِ حجمِ سند (مگابایت)</label>
              <input type="number" id="max_file_mb" name="max_file_mb" min="1" max="100" value="<?= (int) $settings['max_file_mb'] ?>">
            </div>
            <div class="sup-field">
              <label for="rate_per_hour">سقفِ پیامِ هر شماره در ساعت</label>
              <input type="number" id="rate_per_hour" name="rate_per_hour" min="1" max="200" value="<?= (int) $settings['rate_per_hour'] ?>">
              <p class="sup-note">ضدِ اسپم: بیشتر از این، پیام رد می‌شود و به شهروند پیامِ خوانا می‌دهیم.</p>
            </div>
          </div>
          <div class="form-actions" style="margin-top:18px">
            <button class="btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> ذخیره‌ی تنظیمات</button>
            <a class="btn-secondary" href="support.php">انصراف</a>
          </div>
        </form>
        <script>
        /* روزها به‌صورتِ فهرستِ checkbox آمده‌اند؛ همان‌ها را به رشته‌ی «days» تبدیل می‌کنیم */
        (function () {
          var form = document.querySelector('form[action="support.php?view=settings"]');
          if (!form) { return; }
          form.addEventListener('submit', function () {
            var boxes = form.querySelectorAll('input[name="days_csv[]"]');
            var picked = [];
            Array.prototype.forEach.call(boxes, function (b) { if (b.checked) { picked.push(b.value); } });
            var hidden = document.createElement('input');
            hidden.type = 'hidden'; hidden.name = 'days'; hidden.value = picked.join(',');
            form.appendChild(hidden);
            Array.prototype.forEach.call(boxes, function (b) { b.name = ''; b.disabled = true; });
          });
        })();
        </script>
      </section>

<?php else: ?>
      <!-- ══════════ صندوقِ گفتگوها ══════════ -->
      <section class="panel" data-testid="support-inbox">
        <div class="panel-header">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-inbox"></i> صندوقِ گفتگوهای پشتیبانی</h2>
            <p class="sup-note" style="margin:6px 0 0">
              <?= $esc(eplakChartNumFa(count($inbox))) ?> گفتگو ·
              خوانده‌نشده: <?= $esc(eplakChartNumFa($unreadTotal)) ?> ·
              وضعیتِ فعلی:
              <span class="sup-state <?= $state['open'] ? 'sup-open' : 'sup-closed' ?>">
                <?= $state['open'] ? 'باز (در ساعتِ کاری)' : 'بسته — ' . $esc($state['reason'] === 'closed_day' ? 'روزِ غیرکاری' : ($state['reason'] === 'disabled' ? 'غیرفعال' : 'بیرونِ ساعتِ کاری')) ?>
              </span>
            </p>
          </div>
          <div class="panel-actions">
            <a class="btn btn-outline btn-sm" href="support.php?view=settings"><i class="fa-solid fa-sliders"></i> تنظیماتِ پشتیبانی</a>
            <form method="post" action="support.php" style="display:inline"
                  onsubmit="return confirm('همه‌ی گفتگوهای بسته‌شده (پیام‌ها و پیوست‌ها) برای همیشه حذف می‌شوند. ادامه می‌دهید؟');">
              <?= eplakCsrfField() ?>
              <input type="hidden" name="act" value="delete_closed">
              <button class="btn btn-outline btn-sm" type="submit"><i class="fa-solid fa-broom"></i> پاک‌سازیِ گفتگوهای بسته‌شده</button>
            </form>
          </div>
        </div>

        <form class="sup-toolbar" method="get" action="support.php">
          <span class="sup-seg">
<?php foreach (['' => 'همه', 'unread' => 'خوانده‌نشده', 'open' => 'باز', 'closed' => 'بسته‌شده'] as $key => $label): ?>
            <a class="<?= ((string) ($_GET['state'] ?? '')) === $key ? 'active' : '' ?>"
               href="?state=<?= $esc($key) ?>"><?= $esc($label) ?></a>
<?php endforeach; ?>
          </span>
          <input class="search-input" type="text" name="q" value="<?= $esc($_GET['q'] ?? '') ?>"
                 placeholder="جست‌وجو با شماره یا متن…" style="min-width:220px">
          <button class="btn btn-secondary btn-sm" type="submit"><i class="fa-solid fa-magnifying-glass"></i> جست‌وجو</button>
        </form>

<?php if (!$inbox): ?>
        <div class="empty-state">
          <i class="fa-solid fa-headset" style="font-size:26px;opacity:.5"></i>
          <p>گفتگویی با این فیلتر پیدا نشد.</p>
          <p class="sup-note">وقتی شهروندی در اپ «پشتیبانی آنلاین» را باز کند و پیام بنویسد، گفتگویش همین‌جا می‌آید.</p>
        </div>
<?php else: ?>
        <ul class="sup-list">
<?php foreach ($inbox as $t):
    $unread = (int) ($t['unread_admin'] ?? 0);
    $closed = trim((string) ($t['closed_at'] ?? '')) !== '';
    $last = '';
    try {
        $stLast = $pdo->prepare('SELECT body, sender, created_at FROM ' . EPLAK_SUPPORT_TABLE . ' WHERE ticket_id = ? ORDER BY id DESC LIMIT 1');
        $stLast->execute([(int) $t['id']]);
        $lastRow = $stLast->fetch(PDO::FETCH_ASSOC) ?: [];
        $last = trim((string) ($lastRow['body'] ?? ''));
    } catch (Throwable $e) {
        $lastRow = [];
    }
?>
          <li>
            <a href="support.php?id=<?= (int) $t['id'] ?>">
              <span class="sup-who"><i class="fa-solid fa-user"></i></span>
              <span class="sup-main">
                <strong><?= $esc($t['user_phone']) ?></strong>
                <span><?= $esc($last !== '' ? (function_exists('eplakNotifyTrim') ? eplakNotifyTrim($last, 70) : $last) : ($t['description'] ?? '')) ?></span>
              </span>
              <span class="sup-meta">
                <?php if ($unread > 0): ?><span class="sup-badge"><?= $esc(eplakChartNumFa($unread)) ?></span><?php endif; ?>
                <span class="sup-state <?= $closed ? 'sup-closed' : 'sup-open' ?>" style="margin-top:6px"><?= $closed ? 'بسته' : 'باز' ?></span>
                <span style="display:block;margin-top:6px">
                  <?= $esc(function_exists('eplakFaDateTimeOf')
                      ? eplakFaDateTimeOf(($lastRow['created_at'] ?? null) ?: ($t['last_message_at'] ?? null) ?: ($t['created_at'] ?? null), '—')
                      : '—') ?>
                </span>
              </span>
            </a>
            <form method="post" action="support.php" style="display:inline"
                  onsubmit="return confirm('این گفتگو (همه‌ی پیام‌ها و پیوست‌ها) برای همیشه حذف می‌شود. ادامه می‌دهید؟');">
              <?= eplakCsrfField() ?>
              <input type="hidden" name="act" value="delete">
              <input type="hidden" name="id" value="<?= (int) $t['id'] ?>">
              <button class="btn btn-outline btn-sm" type="submit" title="حذفِ گفتگو"><i class="fa-solid fa-trash"></i></button>
            </form>
          </li>
<?php endforeach; ?>
        </ul>
<?php endif; ?>
      </section>
<?php endif; ?>

    </main>
  </div>
</body>
</html>
