<?php
/* api/support.php — «پشتیبانی آنلاین»: گفتگوی زنده‌ی شهروند با تیمِ پشتیبانی
   ────────────────────────────────────────────────────────────────────────────
   چرا این فایل هست؟
     کارتِ «پشتیبانی آنلاین — چت مستقیم با پشتیبان» در صفحه‌ی «تماس با ما»ی اپ
     هیچ هندلری نداشت و سیستمِ تیکتِ موجود هم فقط «یک پرسش و یک پاسخ» بود
     (ستونِ tickets.reply با هر پاسخِ تازه پاک می‌شد). حالا گفتگو یک «رشته»
     است: ظرفِ گفتگو همان ردیفِ tickets (با channel='support') و پیام‌ها در
     ticket_messages — پس هویتِ کاربر، واحدِ مسئول، جست‌وجو و دسترسی‌های پنل
     همه از همان مسیرِ تیکت‌ها کار می‌کنند (منطق در shared/support.php).

   درخواست‌ها:
     GET  api/support.php?action=config                     → تنظیماتِ عمومی (ساعتِ کاری، باز/بسته، سیاستِ پیوست)
     POST api/support.php  action=open   {phone}            → گرفتن/ساختنِ گفتگویِ باز
     GET  api/support.php?action=thread&phone=…&since=<id>  → رشته + فقط پیام‌های «بعد از» since (همگام‌سازیِ افزایشی)
     POST api/support.php  action=send   {phone,body,client_ref,media?}
     POST api/support.php  action=read   {phone}
     POST api/support.php  action=upload {phone,name,mime,data(base64)}  → پیوست (پیش از send)
     POST api/support.php  action=close  {phone,rating}
     GET  api/support.php?action=file&m=uploads/support/…&phone=…        → سروِ امنِ پیوست

   قاعده‌ها (همان درس‌هایی که از api/news.php و api/ads.php گرفتیم):
     ۱) پاسخ هرگز ۵۰۰ یا HTML نیست؛ اگر جدول/دیتابیس مشکل داشت، ۲۰۰ با
        success=false برمی‌گردد تا اپ «حالتِ خالی» نشان دهد نه پرده‌ی خطا.
     ۲) هویتِ شهروند همان شماره‌ی موبایلِ ورودِ اوست (مثلِ api/tickets.php) و
        هر کوئری با user_phone مقید می‌شود ⇒ هیچ‌کس رشته‌ی دیگری را نمی‌خواند.
     ۳) client_ref ارسالِ تکراری را یکی می‌کند (رفرش، قطعِ شبکه، صفِ آفلاین).
     ۴) سقفِ نرخ برایِ هر شماره تا گفتگو به ابزارِ اسپم تبدیل نشود.
     ۵) پیوست فقط از فهرستِ مجاز و با سقفِ حجم؛ مسیرِ سرو با realpath داخلِ
        uploads/support مهار می‌شود (SVG/HTML/اسکریپت پذیرفته نمی‌شود).
   ────────────────────────────────────────────────────────────────────────────
*/

/* اگر اتصال دیتابیس برقرار نشد، db.php صفحه‌ی HTML خطا می‌دهد؛ برای API همان
   خطا را JSON می‌خواهیم تا اپ بتواند درست تصمیم بگیرد (حالتِ خالی، نه پرده‌ی خطا). */
$_SERVER['HTTP_X_REQUESTED_WITH'] = 'XMLHttpRequest';
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../shared/support.php';

eplakApiHeaders();

$input  = eplakRequestInput();
$action = strtolower(trim((string) ($input['action'] ?? ($_GET['action'] ?? ''))));

/** پاسخِ «خراب ولی بی‌ضرر»: ۲۰۰ + success=false تا اپ حالتِ خالی نشان دهد */
function eplakSupportFail(string $reason, string $hint = ''): void
{
    $payload = ['success' => false, 'reason' => $reason];
    if ($hint !== '') {
        $payload['hint'] = $hint;
    }
    eplakJson($payload, 200);
}

/** تنظیماتِ عمومیِ پشتیبانی (بدونِ هیچ داده‌ی شخصی) */
function eplakSupportPublicConfig(PDO $pdo, array $settings): array
{
    $now   = function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : null;
    $state = eplakSupportIsOpen($settings, $now);
    return [
        'enabled'      => ($settings['enabled'] ?? '1') === '1',
        'open'         => (bool) $state['open'],
        'reason'       => (string) $state['reason'],
        'hours_label'  => (string) $state['label'],
        'auto_reply'   => (string) ($settings['auto_reply'] ?? ''),
        'welcome'      => (string) ($settings['welcome'] ?? ''),
        'department'   => (string) ($settings['department'] ?? EPLAK_SUPPORT_DEPARTMENT),
        'attachments'  => [
            'images'     => ($settings['attach_images'] ?? '1') === '1',
            'files'      => ($settings['attach_files'] ?? '1') === '1',
            'max_image'  => (int) ($settings['max_image_mb'] ?? 8),
            'max_file'   => (int) ($settings['max_file_mb'] ?? 15),
        ],
        'agent_online' => eplakSupportAgentOnline($pdo),
        'server_time'  => (string) ($now ?: date('Y-m-d H:i:s')),
    ];
}

try {
    $settings = eplakSupportSettings($pdo);

    /* ── ۱) تنظیماتِ عمومی ───────────────────────────────────────────── */
    if ($action === 'config') {
        eplakJson(['success' => true] + eplakSupportPublicConfig($pdo, $settings), 200);
    }

    /* ── ۲) سروِ امنِ پیوست ──────────────────────────────────────────── */
    if ($action === 'file') {
        $phone = eplakNormalizePhone($input['phone'] ?? ($_GET['phone'] ?? ''));
        $rel   = (string) ($input['m'] ?? ($_GET['m'] ?? ''));
        if ($phone === '') {
            eplakJsonError('شماره موبایل معتبر الزامی است', 400);
        }
        $full = eplakSupportAttachmentPath($rel);
        if ($full === null) {
            eplakJsonError('پیوست یافت نشد', 404);
        }
        /* مالکیت: این پیوست باید به یکی از گفتگوهای همین شماره تعلق داشته باشد */
        $owner = false;
        try {
            $st = $pdo->prepare('SELECT COUNT(*) FROM ' . EPLAK_SUPPORT_TABLE . ' m'
                . ' JOIN tickets t ON t.id = m.ticket_id'
                . ' WHERE t.user_phone = ? AND m.media_path = ?');
            $st->execute([$phone, preg_replace('#^.*?' . preg_quote(EPLAK_SUPPORT_UPLOAD_DIR, '#') . '/#', EPLAK_SUPPORT_UPLOAD_DIR . '/', $rel)]);
            $owner = (int) $st->fetchColumn() > 0;
        } catch (Throwable $e) {
            $owner = false;
        }
        if (!$owner) {
            eplakJsonError('به این پیوست دسترسی ندارید', 403);
        }
        $mime = 'application/octet-stream';
        if (function_exists('finfo_open')) {
            $fi = @finfo_open(FILEINFO_MIME_TYPE);
            if ($fi) {
                $detected = (string) @finfo_file($fi, $full);
                @finfo_close($fi);
                if ($detected !== '') {
                    $mime = $detected;
                }
            }
        }
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($full));
        /* اسناد با attachment باز می‌شوند تا مرورگر چیزی را «اجرا» یا رندر نکند */
        header('Content-Disposition: ' . (strpos($mime, 'image/') === 0 ? 'inline' : 'attachment')
            . '; filename="' . basename($full) . '"');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, max-age=60');
        readfile($full);
        exit;
    }

    /* ── از این‌جا به بعد همه‌ی اکشن‌ها شماره‌ی مالک می‌خواهند ─────────── */
    $phone = eplakNormalizePhone($input['phone'] ?? ($_GET['phone'] ?? ''));
    if ($phone === '') {
        eplakJsonError('شماره موبایل معتبر الزامی است', 400);
    }

    /* ── ۳) گرفتن/ساختنِ گفتگویِ باز ─────────────────────────────────── */
    if ($action === 'open') {
        $opened = eplakSupportOpenThread($pdo, $phone, eplakStr($input['name'] ?? '', 120), $settings);
        if (empty($opened['ok']) || empty($opened['ticket'])) {
            eplakSupportFail((string) ($opened['error'] ?: 'failed'),
                ($opened['error'] ?? '') === 'unknown_phone'
                    ? 'برایِ گفتگو با پشتیبانی، ابتدا با شماره‌ی موبایل و کد تایید وارد شوید.'
                    : 'ساختنِ گفتگو ممکن نشد؛ دوباره تلاش کنید.');
        }
        $ticket = $opened['ticket'];
        $thread = eplakSupportMessages($pdo, (int) $ticket['id'], 0, 80);
        eplakJson([
            'success' => true,
            'created' => (bool) $opened['created'],
            'ticket'  => [
                'id'         => (int) $ticket['id'],
                'title'      => (string) $ticket['title'],
                'status'     => (string) $ticket['status'],
                'department' => (string) $ticket['department'],
                'unread'     => (int) ($ticket['unread_citizen'] ?? 0),
                'closed'     => trim((string) ($ticket['closed_at'] ?? '')) !== '',
            ],
            'messages' => array_map('eplakSupportPublicMessage', $thread['messages']),
            'last_id'  => (int) $thread['last_id'],
        ] + eplakSupportPublicConfig($pdo, $settings), 200);
    }

    /* ── ۴) خواندنِ رشته (همگام‌سازیِ افزایشی) ───────────────────────── */
    if ($action === 'thread') {
        $since = max(0, (int) ($input['since'] ?? ($_GET['since'] ?? 0)));
        $opened = eplakSupportOpenThread($pdo, $phone, '', $settings);
        if (empty($opened['ok']) || empty($opened['ticket'])) {
            eplakSupportFail((string) ($opened['error'] ?: 'failed'));
        }
        $ticket = $opened['ticket'];
        $thread = eplakSupportMessages($pdo, (int) $ticket['id'], $since, 100);
        eplakJson([
            'success'  => true,
            'ticket'   => [
                'id'      => (int) $ticket['id'],
                'status'  => (string) $ticket['status'],
                'unread'  => (int) ($ticket['unread_citizen'] ?? 0),
                'closed'  => trim((string) ($ticket['closed_at'] ?? '')) !== '',
                'rating'  => (int) ($ticket['rating'] ?? 0),
            ],
            'messages' => array_map('eplakSupportPublicMessage', $thread['messages']),
            'last_id'  => (int) $thread['last_id'],
        ] + eplakSupportPublicConfig($pdo, $settings), 200);
    }

    /* ── ۵) آپلودِ پیوست (پیش از send، تا نوارِ پیشرفت ممکن باشد) ───── */
    if ($action === 'upload') {
        $stored = eplakSupportStoreAttachment(
            (string) ($input['data'] ?? ''),
            (string) ($input['name'] ?? ''),
            (string) ($input['mime'] ?? ''),
            $settings
        );
        if (empty($stored['ok'])) {
            $reasons = [
                'bad_type'           => 'این نوع فایل مجاز نیست (فقط عکس، ویدیو و سند).',
                'too_large'          => 'حجمِ فایل بیشتر از حدِ مجاز است.',
                'attachments_disabled' => 'ارسالِ پیوست در حال حاضر غیرفعال است.',
                'images_disabled'    => 'ارسالِ عکس غیرفعال است.',
                'files_disabled'     => 'ارسالِ فایل غیرفعال است.',
            ];
            $reason = (string) $stored['error'];
            eplakJson(['success' => false, 'reason' => $reason,
                       'hint' => $reasons[$reason] ?? 'ارسالِ پیوست ممکن نشد.'], 200);
        }
        eplakJson(['success' => true, 'media' => [
            'path' => $stored['path'], 'kind' => $stored['kind'],
            'name' => $stored['name'], 'size' => (int) $stored['size'],
        ]], 200);
    }

    /* ── ۶) فرستادنِ پیام ────────────────────────────────────────────── */
    if ($action === 'send') {
        $rate = eplakSupportRateOk($pdo, $phone, $settings);
        if (empty($rate['ok'])) {
            eplakJson(['success' => false, 'reason' => 'rate_limited',
                       'hint' => 'تعدادِ پیام‌های شما در ساعتِ گذشته زیاد است. کمی بعد دوباره بنویسید.'], 200);
        }
        $opened = eplakSupportOpenThread($pdo, $phone, eplakStr($input['name'] ?? '', 120), $settings);
        if (empty($opened['ok']) || empty($opened['ticket'])) {
            eplakSupportFail((string) ($opened['error'] ?: 'failed'));
        }
        $ticket = $opened['ticket'];
        $ticketId = (int) $ticket['id'];

        /* اگر گفتگو بسته شده بود و شهروند دوباره نوشت ⇒ باز می‌شود */
        if (trim((string) ($ticket['closed_at'] ?? '')) !== '') {
            eplakSupportReopen($pdo, $ticketId);
        }

        $media = [];
        if (!empty($input['media']) && is_array($input['media'])) {
            $path = (string) ($input['media']['path'] ?? '');
            if ($path !== '' && eplakSupportAttachmentPath($path) !== null) {
                $media = [
                    'path' => $path,
                    'kind' => (string) ($input['media']['kind'] ?? ''),
                    'name' => eplakSupportClean((string) ($input['media']['name'] ?? ''), 120),
                    'size' => max(0, (int) ($input['media']['size'] ?? 0)),
                ];
            }
        }
        $clientRef = preg_replace('/[^A-Za-z0-9_\-]/', '', (string) ($input['client_ref'] ?? '')) ?? '';
        $posted = eplakSupportPostMessage($pdo, $ticket, 'citizen',
            (string) ($input['body'] ?? ''), substr($clientRef, 0, 64), 0, '', $media);

        if (empty($posted['ok'])) {
            $reason = (string) ($posted['error'] ?: 'failed');
            $hints = ['empty' => 'پیام خالی است.', 'no_table' => 'جدولِ گفتگو در دیتابیس نیست.'];
            eplakJson(['success' => false, 'reason' => $reason,
                       'hint' => $hints[$reason] ?? 'ارسالِ پیام ممکن نشد؛ دوباره تلاش کنید.'], 200);
        }

        /* بیرونِ ساعتِ کاری ⇒ یک پیامِ سیستمیِ «ثبت شد، در ساعتِ اداری پاسخ
           می‌دهیم» اضافه می‌شود. فقط یک بار پشتِ سر هم، تا برایِ هر پیامِ
           شهروند تکرار نشود و گفتگو پر از پیامِ خودکار نگردد.
           این کار «پیش از» خواندنِ رشته انجام می‌شود تا last_idِ پاسخ شاملِ
           خودِ پیامِ خودکار هم باشد و pollِ بعدیِ اپ آن را دوباره نگیرد. */
        $state = eplakSupportIsOpen($settings, function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : null);
        $autoReply = trim((string) ($settings['auto_reply'] ?? ''));
        if (!$state['open'] && ($settings['enabled'] ?? '1') === '1' && $autoReply !== '') {
            /* فقط اگر «آخرین» پیامِ سیستمی همان متنِ خودکار نباشد؛ وگرنه با هر
               پیامِ شهروند یک پاسخِ خودکارِ تکراری به گفتگو اضافه می‌شد. */
            $alreadyAuto = false;
            try {
                $st = $pdo->prepare('SELECT body FROM ' . EPLAK_SUPPORT_TABLE
                    . " WHERE ticket_id = ? AND sender = 'system' ORDER BY id DESC LIMIT 1");
                $st->execute([$ticketId]);
                $lastBody = $st->fetchColumn();
                $alreadyAuto = is_string($lastBody) && trim($lastBody) === $autoReply;
            } catch (Throwable $e) {
                $alreadyAuto = false;
            }
            if (!$alreadyAuto) {
                eplakSupportPostMessage($pdo, $ticket, 'system', $autoReply);
            }
        }

        $thread = eplakSupportMessages($pdo, $ticketId, 0, 120);
        eplakJson([
            'success'   => true,
            'duplicate' => (bool) $posted['duplicate'],
            'id'        => (int) $posted['id'],
            'message'   => eplakSupportPublicMessage((array) $posted['message']),
            'messages'  => array_map('eplakSupportPublicMessage', $thread['messages']),
            'last_id'   => (int) $thread['last_id'],
        ] + eplakSupportPublicConfig($pdo, $settings), 200);
    }

    /* ── ۷) خوانده‌شدن ───────────────────────────────────────────────── */
    if ($action === 'read') {
        $opened = eplakSupportOpenThread($pdo, $phone, '', $settings);
        $ok = !empty($opened['ok']) && !empty($opened['ticket'])
            ? eplakSupportMarkRead($pdo, (int) $opened['ticket']['id'], 'citizen')
            : false;
        eplakJson(['success' => true, 'marked' => (bool) $ok], 200);
    }

    /* ── ۸) بستنِ گفتگو و امتیاز ─────────────────────────────────────── */
    if ($action === 'close') {
        $opened = eplakSupportOpenThread($pdo, $phone, '', $settings);
        if (empty($opened['ok']) || empty($opened['ticket'])) {
            eplakSupportFail('no_thread');
        }
        $rating = max(0, min(5, (int) ($input['rating'] ?? 0)));
        $ok = eplakSupportClose($pdo, (int) $opened['ticket']['id'], $rating);
        eplakJson(['success' => (bool) $ok, 'closed' => (bool) $ok, 'rating' => $rating], 200);
    }

    /* ── ۹) فهرستِ گفتگوهای همین شماره ───────────────────────────────── */
    if ($action === 'threads') {
        eplakJson(['success' => true, 'threads' => eplakSupportThreadsOf($pdo, $phone)], 200);
    }

    eplakJsonError('اکشن نامعتبر است', 400);
} catch (Throwable $e) {
    /* هیچ‌وقت ۵۰۰ یا HTML نمی‌دهیم: اپ باید حالتِ خالی نشان دهد، نه پرده‌ی خطا */
    error_log('[eplak][support-api] ' . $e->getMessage());
    eplakSupportFail('error', 'خطای داخلی سرور؛ کمی بعد دوباره تلاش کنید.');
}
