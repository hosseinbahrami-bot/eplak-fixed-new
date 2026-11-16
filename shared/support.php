<?php
/* ============================================================================
   shared/support.php — «پشتیبانی آنلاین»: گفتگوی زنده‌ی شهروند با تیمِ پشتیبانی
   ============================================================================
   چرا این فایل هست؟
     در صفحه‌ی «تماس با ما»ی اپ یک کارتِ «پشتیبانی آنلاین — چت مستقیم با
     پشتیبان» بود که هیچ هندلری نداشت (فقط تزئینی). از طرفی سیستمِ تیکتِ
     موجود فقط «یک پرسش و یک پاسخ» داشت: ستونِ tickets.reply یک فیلدِ تنهاست
     و هر پاسخِ جدید، پاسخِ قبلی را پاک می‌کند ⇒ گفتگو ممکن نبود.

     راه‌حل: «رشته‌پیام» روی همان ظرفِ تیکت. یعنی هر گفتگو یک ردیفِ tickets
     با channel='support' است و پیام‌هایش در ticket_messages می‌نشینند. با این
     کار همه‌چیزِ موجود دوباره استفاده می‌شود:
       • هویتِ کاربر = همان شماره‌ی موبایلِ تأییدشده با OTP
       • واحدِ مسئول = «پشتیبانی عمومی» ⇒ دامنه‌ی دسترسیِ پنل (acl.php) کار می‌کند
       • اعلان و پوش = همان مسیرِ shared/notify_events.php و shared/fcm.php
       • خروجی، جست‌وجو و آمار = همان جدولِ تیکت‌ها

   چرا polling و نه WebSocket؟
     هاست، cPanel اشتراکی با PHP 7.4 است: هیچ پروسه‌ی دائمی (Node/daemon)
     نمی‌تواند بالا بماند و long-polling هم worker‌های PHP-FPM را تمام می‌کند
     (که یعنی کند شدنِ کلِ سایت، حتی OTP). پس:
       • وقتی صفحه‌ی چت باز است ⇒ pollingِ تطبیقی (سریع در شروع، کُند در سکوت)
       • وقتی بسته است ⇒ پوشِ FCM/Web Push خبر می‌دهد
     پوش «هل» است نه «منبعِ حقیقت»: روی بسیاری از گوشی‌های اندرویدیِ ایران
     سرویسِ گوگل نیست، پس حقیقت همیشه از pollingِ دیتابیس خوانده می‌شود.

   سازگاری با نسخه‌های نصب‌شده‌ی اپ
     آخرین پاسخِ پشتیبان هم‌زمان در tickets.reply قدیمی هم نوشته می‌شود؛
     وگرنه شهروندی که APK نسخه‌ی ۲٫۳ دارد هیچ پاسخی نمی‌بیند.

   حریمِ خصوصی و امنیت
     • هیچ مسیری بدونِ «شماره‌ی مالک» به پیام‌ها نمی‌رسد (مالکیت در هر کوئری)
     • متنِ پیام strip_tags و محدود به طول است؛ خروجی همیشه htmlspecialchars
     • پیوست فقط از فهرستِ مجاز (تصویر/ویدیو/سند) و با سقفِ حجم؛ مسیرِ سرو
       با realpath داخلِ uploads/support مهار می‌شود (path traversal بسته)
     • سقفِ نرخ: هر شماره در ساعت حداکثر N پیام (ضدِ اسپم)
   ============================================================================ */

require_once __DIR__ . '/fa_datetime.php';
/* کمکی‌های رسانه (تشخیصِ نوعِ واقعیِ فایل، decodeِ base64، ساختِ پوشه) —
   بدونِ این، هر پیوستی با «bad_data» رد می‌شد. */
if (is_file(__DIR__ . '/media.php')) {
    require_once __DIR__ . '/media.php';
}

if (!defined('EPLAK_SUPPORT_TABLE'))       define('EPLAK_SUPPORT_TABLE', 'ticket_messages');
if (!defined('EPLAK_SUPPORT_CHANNEL'))     define('EPLAK_SUPPORT_CHANNEL', 'support');
if (!defined('EPLAK_SUPPORT_DEPARTMENT'))  define('EPLAK_SUPPORT_DEPARTMENT', 'پشتیبانی عمومی');
if (!defined('EPLAK_SUPPORT_MAX_BODY'))    define('EPLAK_SUPPORT_MAX_BODY', 2000);
if (!defined('EPLAK_SUPPORT_UPLOAD_DIR'))  define('EPLAK_SUPPORT_UPLOAD_DIR', 'uploads/support');
if (!defined('EPLAK_SUPPORT_KEEP_DAYS'))   define('EPLAK_SUPPORT_KEEP_DAYS', 730);

/**
 * مقدارهای پیش‌فرضِ تنظیماتِ پشتیبانی.
 * روزهای کاری با شماره‌ی ISOِ میلادی نوشته می‌شوند (۶=شنبه … ۵=جمعه) چون
 * هفته‌ی کاریِ ایران شنبه تا چهارشنبه است.
 */
function eplakSupportDefaults(): array
{
    return [
        'enabled'        => '1',
        'days'           => '6,7,1,2,3',          /* شنبه تا چهارشنبه */
        'from'           => '07:30',
        'to'             => '16:30',
        'department'     => EPLAK_SUPPORT_DEPARTMENT,
        'auto_reply'     => 'سلام. الان بیرونِ ساعتِ پاسخ‌گویی هستیم؛ پیامِ شما ثبت شد و در نخستین ساعتِ کاری (شنبه تا چهارشنبه، ۰۷:۳۰ تا ۱۶:۳۰) پاسخ می‌دهیم. برایِ مواردِ فوری با سامانه‌ی ۱۳۷ تماس بگیرید.',
        'welcome'        => 'سلام، به پشتیبانی آنلاین ای‌پلاک خوش آمدید. سؤال یا مشکلِ خود را بنویسید؛ کارشناسان ما در ساعتِ اداری پاسخ می‌دهند.',
        'canned'         => "سلام، وقت بخیر. در خدمت شما هستیم.\nممنون از صبوری شما؛ موضوع در حال بررسی است.\nموضوع حل شد؛ در صورت نیاز دوباره پیام بدهید.",
        'attach_images'  => '1',
        'attach_files'   => '1',
        'max_image_mb'   => '8',
        'max_file_mb'    => '15',
        'rate_per_hour'  => '40',
    ];
}

/** خواندنِ تنظیمات از app_settings (با بازگشت به پیش‌فرض) — همه از پنل قابل تغییر است */
function eplakSupportSettings(PDO $pdo): array
{
    $out = eplakSupportDefaults();
    foreach ($out as $key => $default) {
        try {
            $value = eplakAppSetting($pdo, 'support_' . $key, null);
        } catch (Throwable $e) {
            $value = null;
        }
        if ($value !== null && trim((string) $value) !== '') {
            $out[$key] = (string) $value;
        }
    }
    return $out;
}

/** ذخیره‌ی تنظیمات از پنل (فقط کلیدهایی که می‌شناسیم؛ هیچ کلیدِ ناشناخته‌ای نوشته نمی‌شود) */
function eplakSupportSaveSettings(PDO $pdo, array $input): array
{
    $saved = [];
    foreach (array_keys(eplakSupportDefaults()) as $key) {
        if (!array_key_exists($key, $input)) {
            continue;
        }
        $value = is_scalar($input[$key]) ? trim((string) $input[$key]) : '';
        if ($key === 'days') {
            $days = [];
            foreach (explode(',', $value) as $d) {
                $d = (int) trim($d);
                if ($d >= 1 && $d <= 7) {
                    $days[] = $d;
                }
            }
            $value = implode(',', array_values(array_unique($days)));
        }
        if (in_array($key, ['from', 'to'], true) && !preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', $value)) {
            continue;                                   /* ساعتِ نامعتبر ذخیره نمی‌شود */
        }
        if (in_array($key, ['max_image_mb', 'max_file_mb', 'rate_per_hour'], true)) {
            $value = (string) max(1, min(200, (int) $value));
        }
        if (in_array($key, ['enabled', 'attach_images', 'attach_files'], true)) {
            $value = ($value === '1' || $value === 'on' || $value === 'true') ? '1' : '0';
        }
        if (in_array($key, ['auto_reply', 'welcome', 'canned'], true)) {
            $value = eplakSupportClean($value, 2000);
        }
        if ($key === 'department') {
            $value = eplakSupportClean($value, 120) ?: EPLAK_SUPPORT_DEPARTMENT;
        }
        try {
            eplakSetAppSetting($pdo, 'support_' . $key, $value);
            $saved[$key] = $value;
        } catch (Throwable $e) {
            error_log('[eplak][support] save setting failed: ' . $e->getMessage());
        }
    }
    return $saved;
}

/** پاک‌سازیِ متنِ آزاد: بدونِ HTML، بدونِ نویسه‌ی کنترلی، با طولِ محدود */
function eplakSupportClean(string $text, int $max): string
{
    $text = str_replace(["\r\n", "\r"], "\n", $text);
    $text = strip_tags($text);
    $text = preg_replace('/[^\P{C}\n\t]+/u', '', $text);
    if ($text === null) {
        $text = '';
    }
    $text = trim($text);
    if (function_exists('mb_substr')) {
        $text = mb_substr($text, 0, $max, 'UTF-8');
    } else {
        $text = substr($text, 0, $max);
    }
    return $text;
}

/** آیا جدولِ پیام‌ها هست؟ (بدونِ خطا — برایِ دیتابیسِ قدیمی/قطع) */
function eplakSupportReady(?PDO $pdo): bool
{
    if (!($pdo instanceof PDO)) {
        return false;
    }
    static $cache = [];
    $key = spl_object_hash($pdo);
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    try {
        if (function_exists('eplakIsSqlite') && eplakIsSqlite($pdo)) {
            $st = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name='" . EPLAK_SUPPORT_TABLE . "'");
            return $cache[$key] = (bool) $st->fetch();
        }
        $st = $pdo->prepare('SHOW TABLES LIKE :t');
        $st->execute([':t' => EPLAK_SUPPORT_TABLE]);
        return $cache[$key] = (bool) $st->fetchColumn();
    } catch (Throwable $e) {
        return $cache[$key] = false;
    }
}

/** ستونِ تازه روی tickets هست؟ (روی هاستی که ALTER اجازه ندارد، مسیرِ سازگار انتخاب می‌شود) */
function eplakSupportHasChannel(PDO $pdo): bool
{
    return function_exists('eplakTableHasColumn')
        ? eplakTableHasColumn($pdo, 'tickets', 'channel')
        : true;
}

/**
 * آیا پشتیبانی «الان باز» است؟
 * @return array{open:bool,reason:string,label:string,now:string}
 */
function eplakSupportIsOpen(array $settings, ?string $nowDb = null): array
{
    $out = ['open' => false, 'reason' => '', 'label' => '', 'now' => ''];
    if (($settings['enabled'] ?? '1') !== '1') {
        $out['reason'] = 'disabled';
        $out['label']  = 'پشتیبانی آنلاین موقتاً غیرفعال است';
        return $out;
    }
    try {
        $now = new DateTimeImmutable(
            (is_string($nowDb) && trim($nowDb) !== '') ? trim($nowDb) : 'now',
            function_exists('eplakDbTimezone') ? eplakDbTimezone() : new DateTimeZone('Asia/Tehran')
        );
    } catch (Throwable $e) {
        $now = new DateTimeImmutable('now');
    }
    $out['now'] = $now->format('Y-m-d H:i:s');

    $dow = (int) $now->format('N');                 /* ۱=دوشنبه … ۶=شنبه، ۷=یکشنبه */
    $days = array_map('intval', array_filter(explode(',', (string) ($settings['days'] ?? '')), 'strlen'));
    $hm   = $now->format('H:i');
    $from = (string) ($settings['from'] ?? '07:30');
    $to   = (string) ($settings['to'] ?? '16:30');

    $weekdayNames = function_exists('eplakAnalyticsFaWeekdays')
        ? eplakAnalyticsFaWeekdays()
        : [6 => 'شنبه', 7 => 'یکشنبه', 1 => 'دوشنبه', 2 => 'سه‌شنبه', 3 => 'چهارشنبه', 4 => 'پنجشنبه', 5 => 'جمعه'];
    $dayNames = [];
    foreach ($days as $d) {
        if (isset($weekdayNames[$d])) {
            $dayNames[] = $weekdayNames[$d];
        }
    }
    $out['label'] = 'ساعتِ پاسخ‌گویی: ' . (function_exists('eplakFaDigits') ? eplakFaDigits($from . ' تا ' . $to) : ($from . ' تا ' . $to))
        . ($dayNames ? ' — ' . implode('، ', $dayNames) : '');

    if ($days && !in_array($dow, $days, true)) {
        $out['reason'] = 'closed_day';
        return $out;
    }
    if ($hm < $from || $hm > $to) {
        $out['reason'] = 'closed_hour';
        return $out;
    }
    $out['open'] = true;
    return $out;
}

/**
 * گرفتنِ «گفتگویِ بازِ» این شهروند؛ اگر نبود یکی می‌سازد.
 * هر شماره در هر زمان فقط یک گفتگویِ باز دارد (بایگانی‌شده‌ها با closed_at مشخص‌اند).
 */
function eplakSupportOpenThread(PDO $pdo, string $phone, string $name = '', array $settings = []): array
{
    $out = ['ok' => false, 'ticket' => null, 'created' => false, 'error' => ''];
    $phone = function_exists('eplakNormalizePhone') ? eplakNormalizePhone($phone) : trim($phone);
    if ($phone === '') {
        $out['error'] = 'bad_phone';
        return $out;
    }
    if (!$settings) {
        $settings = eplakSupportSettings($pdo);
    }
    $hasChannel = eplakSupportHasChannel($pdo);
    try {
        if ($hasChannel) {
            $st = $pdo->prepare("SELECT * FROM tickets WHERE user_phone = ? AND channel = ? AND (closed_at IS NULL OR closed_at = '') ORDER BY id DESC LIMIT 1");
            $st->execute([$phone, EPLAK_SUPPORT_CHANNEL]);
        } else {
            /* دیتابیسِ قدیمی بدونِ ستون channel ⇒ همان عنوانِ پشتیبانی نشانه‌ی گفتگو است */
            $st = $pdo->prepare("SELECT * FROM tickets WHERE user_phone = ? AND title = 'پشتیبانی آنلاین' AND (reply IS NULL OR reply = '') ORDER BY id DESC LIMIT 1");
            $st->execute([$phone]);
        }
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $out['ok'] = true;
            $out['ticket'] = $row;
            return $out;
        }

        /* گفتگویِ تازه فقط برای شماره‌ای ساخته می‌شود که پیش‌تر با OTP وارد شده
           و در جدول users ردیف دارد؛ وگرنه هر کسی می‌توانست برای شماره‌های
           تصادفی تیکتِ خالی بسازد و صندوقِ پشتیبانی را پر کند.
           (اگر جدول users در این دیتابیس نبود، سخت‌گیری نمی‌کنیم تا سامانه‌ی
           قدیمی از کار نیفتد.) */
        if (!eplakSupportPhoneKnown($pdo, $phone)) {
            $out['error'] = 'unknown_phone';
            return $out;
        }

        $now = function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : date('Y-m-d H:i:s');
        $title = 'پشتیبانی آنلاین';
        $dept  = (string) ($settings['department'] ?: EPLAK_SUPPORT_DEPARTMENT);
        $cols  = $hasChannel
            ? '(user_phone, title, description, category, department, priority, status, channel, last_message_at, last_sender, created_at)'
            : '(user_phone, title, description, category, department, priority, status, created_at)';
        $vals  = $hasChannel
            ? 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            : 'VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        $params = $hasChannel
            ? [$phone, $title, (string) ($settings['welcome'] ?? ''), 'پشتیبانی', $dept, 'medium', 'pending', EPLAK_SUPPORT_CHANNEL, $now, 'system', $now]
            : [$phone, $title, (string) ($settings['welcome'] ?? ''), 'پشتیبانی', $dept, 'medium', 'pending', $now];
        $pdo->prepare('INSERT INTO tickets ' . $cols . ' ' . $vals)->execute($params);
        $id = (int) $pdo->lastInsertId();

        /* پیامِ خوش‌آمد به‌عنوانِ نخستین سطرِ رشته هم ثبت می‌شود تا در چت دیده شود */
        if ($id > 0 && eplakSupportReady($pdo) && trim((string) ($settings['welcome'] ?? '')) !== '') {
            eplakSupportInsertRow($pdo, $id, 'system', (string) $settings['welcome'], '', 0, 'سامانه', []);
        }
        $st = $pdo->prepare('SELECT * FROM tickets WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        $out['ok'] = true;
        $out['created'] = true;
        $out['ticket'] = $st->fetch(PDO::FETCH_ASSOC) ?: null;
        return $out;
    } catch (Throwable $e) {
        error_log('[eplak][support] open thread failed: ' . $e->getMessage());
        $out['error'] = 'failed';
        return $out;
    }
}

/** آیا این شماره پیش‌تر در سامانه ثبت شده است؟ (ورودِ موفق با OTP ⇒ ردیفِ users) */
function eplakSupportPhoneKnown(PDO $pdo, string $phone): bool
{
    try {
        $st = $pdo->prepare('SELECT COUNT(*) FROM users WHERE phone = ?');
        $st->execute([$phone]);
        return (int) $st->fetchColumn() > 0;
    } catch (Throwable $e) {
        return true;      /* جدول users نیست ⇒ سخت‌گیری نکن، فقط گفتگو را بساز */
    }
}

/** درجِ خامِ یک پیام (بدونِ منطقِ شمارنده‌ها) */
function eplakSupportInsertRow(PDO $pdo, int $ticketId, string $sender, string $body, string $clientRef, int $adminId = 0, string $senderName = '', array $media = []): int
{
    $now = function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : date('Y-m-d H:i:s');
    $st = $pdo->prepare('INSERT INTO ' . EPLAK_SUPPORT_TABLE
        . ' (ticket_id, sender, sender_name, admin_id, body, media_path, media_kind, media_name, media_size, client_ref, created_at)'
        . ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $st->execute([
        $ticketId, $sender, $senderName, $adminId, $body,
        (string) ($media['path'] ?? ''), (string) ($media['kind'] ?? ''),
        (string) ($media['name'] ?? ''), (int) ($media['size'] ?? 0),
        ($clientRef === '' ? null : $clientRef), $now,
    ]);
    return (int) $pdo->lastInsertId();
}

/**
 * ثبتِ یک پیام در گفتگو.
 *
 * @param string $sender citizen|admin|system
 * @return array{ok:bool,id:int,duplicate:bool,error:string,message:array}
 */
function eplakSupportPostMessage(PDO $pdo, array $ticket, string $sender, string $body, string $clientRef = '', int $adminId = 0, string $senderName = '', array $media = []): array
{
    $out = ['ok' => false, 'id' => 0, 'duplicate' => false, 'error' => '', 'message' => []];
    $ticketId = (int) ($ticket['id'] ?? 0);
    if ($ticketId <= 0) {
        $out['error'] = 'no_ticket';
        return $out;
    }
    if (!eplakSupportReady($pdo)) {
        $out['error'] = 'no_table';
        return $out;
    }
    if (!in_array($sender, ['citizen', 'admin', 'system'], true)) {
        $out['error'] = 'bad_sender';
        return $out;
    }
    $body = eplakSupportClean($body, EPLAK_SUPPORT_MAX_BODY);
    $hasMedia = trim((string) ($media['path'] ?? '')) !== '';
    if ($body === '' && !$hasMedia) {
        $out['error'] = 'empty';
        return $out;
    }

    try {
        /* ضدِ تکرار: همان client_ref که اپ برایِ هر پیام می‌سازد. اگر پیامِ
           یکسان (رفرش صفحه، قطعِ شبکه، تلاشِ دوباره) برسد، دوباره ثبت نمی‌شود. */
        if ($clientRef !== '') {
            $st = $pdo->prepare('SELECT * FROM ' . EPLAK_SUPPORT_TABLE . ' WHERE client_ref = ? LIMIT 1');
            $st->execute([$clientRef]);
            $existing = $st->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                $out['ok'] = true;
                $out['duplicate'] = true;
                $out['id'] = (int) $existing['id'];
                $out['message'] = $existing;
                return $out;
            }
        }

        $id = eplakSupportInsertRow($pdo, $ticketId, $sender, $body, $clientRef, $adminId, $senderName, $media);
        if ($id <= 0) {
            $out['error'] = 'insert_failed';
            return $out;
        }
        $now = function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : date('Y-m-d H:i:s');

        /* شمارنده‌ها و «آخرین پیام» روی خودِ گفتگو — تا فهرستِ پنل و اپ بدونِ
           شمارشِ کلِ رشته، نشانِ «خوانده‌نشده» و ترتیبِ درست داشته باشند. */
        $hasChannel = eplakSupportHasChannel($pdo);
        if ($hasChannel) {
            $bump = $sender === 'citizen' ? 'unread_admin = unread_admin + 1' : 'unread_citizen = unread_citizen + 1';
            if ($sender === 'system') {
                $bump = 'unread_citizen = unread_citizen + 1';
            }
            try {
                $pdo->prepare('UPDATE tickets SET last_message_at = ?, last_sender = ?, ' . $bump . ' WHERE id = ?')
                    ->execute([$now, $sender, $ticketId]);
            } catch (Throwable $e) {
                error_log('[eplak][support] counter update failed: ' . $e->getMessage());
            }
        }

        /* سازگاری با اپِ نصب‌شده‌ی قدیمی: آخرین پاسخِ پشتیبان در tickets.reply هم
           می‌نشیند، چون نسخه‌ی ۲٫۳ فقط همان یک فیلد را نشان می‌دهد. */
        if ($sender === 'admin' && $body !== '') {
            try {
                $pdo->prepare('UPDATE tickets SET reply = ?, status = ? WHERE id = ?')
                    ->execute([$body, 'in_progress', $ticketId]);
            } catch (Throwable $e) {
                error_log('[eplak][support] legacy reply mirror failed: ' . $e->getMessage());
            }
        }

        $st = $pdo->prepare('SELECT * FROM ' . EPLAK_SUPPORT_TABLE . ' WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        $out['ok'] = true;
        $out['id'] = $id;
        $out['message'] = $st->fetch(PDO::FETCH_ASSOC) ?: [];
        return $out;
    } catch (Throwable $e) {
        error_log('[eplak][support] post message failed: ' . $e->getMessage());
        $out['error'] = 'failed';
        return $out;
    }
}

/**
 * خواندنِ رشته‌ی پیام‌ها — به‌صورتِ «افزایشی» (فقط پیام‌های بعد از $sinceId).
 * این همان چیزی است که هزینه‌ی polling را کم می‌کند: پاسخِ معمولی چند صد بایت است.
 */
function eplakSupportMessages(PDO $pdo, int $ticketId, int $sinceId = 0, int $limit = 80): array
{
    if (!eplakSupportReady($pdo) || $ticketId <= 0) {
        return ['messages' => [], 'last_id' => $sinceId];
    }
    $limit = max(1, min(200, $limit));
    try {
        $st = $pdo->prepare('SELECT * FROM ' . EPLAK_SUPPORT_TABLE
            . ' WHERE ticket_id = ? AND id > ? ORDER BY id ASC LIMIT ' . $limit);
        $st->execute([$ticketId, max(0, $sinceId)]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        error_log('[eplak][support] messages failed: ' . $e->getMessage());
        return ['messages' => [], 'last_id' => $sinceId];
    }
    $last = $sinceId;
    foreach ($rows as $r) {
        $last = max($last, (int) $r['id']);
    }
    return ['messages' => $rows, 'last_id' => $last];
}

/** علامتِ «خوانده شد» برای یک طرفِ گفتگو */
function eplakSupportMarkRead(PDO $pdo, int $ticketId, string $who): bool
{
    if (!eplakSupportHasChannel($pdo) || $ticketId <= 0) {
        return false;
    }
    $col = $who === 'citizen' ? 'unread_citizen' : 'unread_admin';
    $now = function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : date('Y-m-d H:i:s');
    try {
        $pdo->prepare('UPDATE tickets SET ' . $col . ' = 0 WHERE id = ?')->execute([$ticketId]);
        $sender = $who === 'citizen' ? 'admin' : 'citizen';
        $pdo->prepare('UPDATE ' . EPLAK_SUPPORT_TABLE . " SET read_at = ? WHERE ticket_id = ? AND sender = ? AND (read_at IS NULL OR read_at = '')")
            ->execute([$now, $ticketId, $sender]);
        return true;
    } catch (Throwable $e) {
        error_log('[eplak][support] mark read failed: ' . $e->getMessage());
        return false;
    }
}

/** سقفِ نرخ: چند پیامِ اخیرِ این شماره در یک ساعتِ گذشته؟ */
function eplakSupportRateOk(PDO $pdo, string $phone, array $settings): array
{
    $limit = max(1, (int) ($settings['rate_per_hour'] ?? 40));
    if (!eplakSupportReady($pdo) || $phone === '') {
        return ['ok' => true, 'count' => 0, 'limit' => $limit];
    }
    try {
        $cutoff = function_exists('eplakDbAgoString') ? eplakDbAgoString(3600, $pdo) : date('Y-m-d H:i:s', time() - 3600);
        $st = $pdo->prepare('SELECT COUNT(*) FROM ' . EPLAK_SUPPORT_TABLE . ' m'
            . ' JOIN tickets t ON t.id = m.ticket_id'
            . " WHERE t.user_phone = ? AND m.sender = 'citizen' AND m.created_at >= ?");
        $st->execute([$phone, $cutoff]);
        $count = (int) $st->fetchColumn();
        return ['ok' => $count < $limit, 'count' => $count, 'limit' => $limit];
    } catch (Throwable $e) {
        return ['ok' => true, 'count' => 0, 'limit' => $limit];   /* خطا ⇒ مسدود نکردنِ کاربر */
    }
}

/** انواعِ مجازِ پیوست (تصویر/ویدیو/سند) — اسکریپت و SVG عمداً مجاز نیستند */
function eplakSupportAllowedTypes(bool $files): array
{
    $types = [
        'image/jpeg' => ['ext' => 'jpg', 'kind' => 'image'],
        'image/png'  => ['ext' => 'png', 'kind' => 'image'],
        'image/webp' => ['ext' => 'webp', 'kind' => 'image'],
        'image/gif'  => ['ext' => 'gif', 'kind' => 'image'],
        'image/heic' => ['ext' => 'heic', 'kind' => 'image'],
        'video/mp4'  => ['ext' => 'mp4', 'kind' => 'video'],
        'video/webm' => ['ext' => 'webm', 'kind' => 'video'],
        'video/quicktime' => ['ext' => 'mov', 'kind' => 'video'],
        'video/3gpp' => ['ext' => '3gp', 'kind' => 'video'],
    ];
    if ($files) {
        $types += [
            'application/pdf' => ['ext' => 'pdf', 'kind' => 'file'],
            'application/msword' => ['ext' => 'doc', 'kind' => 'file'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['ext' => 'docx', 'kind' => 'file'],
            'application/vnd.ms-excel' => ['ext' => 'xls', 'kind' => 'file'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['ext' => 'xlsx', 'kind' => 'file'],
            'text/plain' => ['ext' => 'txt', 'kind' => 'file'],
        ];
    }
    return $types;
}

/** سقفِ حجم بر حسبِ نوع */
function eplakSupportMaxBytes(array $settings, string $kind): int
{
    $mb = $kind === 'file' ? (int) ($settings['max_file_mb'] ?? 15)
        : (($kind === 'video' ? 25 : (int) ($settings['max_image_mb'] ?? 8)));
    return max(1, $mb) * 1024 * 1024;
}

/**
 * ذخیره‌ی پیوست از base64 (همان مسیری که اپ برایِ عکسِ گزارش استفاده می‌کند).
 * @return array{ok:bool,path:string,kind:string,name:string,size:int,error:string}
 */
function eplakSupportStoreAttachment(string $base64, string $originalName, string $declaredMime, array $settings): array
{
    $out = ['ok' => false, 'path' => '', 'kind' => '', 'name' => '', 'size' => 0, 'error' => ''];
    $allowFiles = ($settings['attach_files'] ?? '1') === '1';
    $allowImages = ($settings['attach_images'] ?? '1') === '1';
    if (!$allowFiles && !$allowImages) {
        $out['error'] = 'attachments_disabled';
        return $out;
    }
    $binary = function_exists('eplakMediaDecodeBase64') ? eplakMediaDecodeBase64($base64) : null;
    if ($binary === null || $binary === '') {
        /* اگر داده با «فرم ساده» آمده باشد، مرورگر/سرور «+» را به فاصله تبدیل
           می‌کند و base64 خراب می‌شود؛ یک‌بار همان فاصله‌ها را به «+» برمی‌گردانیم.
           (مسیرِ اصلیِ اپ JSON است، این فقط تورِ ایمنی است.) */
        if (strpos($base64, ' ') !== false && function_exists('eplakMediaDecodeBase64')) {
            $binary = eplakMediaDecodeBase64(str_replace(' ', '+', $base64));
        }
    }
    if ($binary === null || $binary === '') {
        $out['error'] = 'bad_data';
        return $out;
    }
    $originalName = eplakSupportClean(str_replace('/', '_', $originalName), 120);
    $ext = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));

    /* نوعِ واقعی از رویِ خودِ فایل (نه ادعایِ کلاینت) */
    $allowed = eplakSupportAllowedTypes($allowFiles);
    $mime = '';
    $tmp = '';
    try {
        $tmp = tempnam(sys_get_temp_dir(), 'eplaksup');
        if ($tmp !== false && @file_put_contents($tmp, $binary) !== false) {
            if (function_exists('eplakMediaDetectType')) {
                $detected = eplakMediaDetectType($tmp, $originalName);
                $mime = (string) ($detected['mime'] ?? '');
            }
            if ($mime === '' && function_exists('finfo_open')) {
                $fi = @finfo_open(FILEINFO_MIME_TYPE);
                if ($fi) {
                    $mime = (string) @finfo_file($fi, $tmp);
                    @finfo_close($fi);
                }
            }
        }
    } catch (Throwable $e) {
        $mime = '';
    }
    if ($mime === '' || !isset($allowed[$mime])) {
        /* پسوند هم به‌عنوانِ شاهدِ دوم بررسی می‌شود (بعضی فایل‌های سند magic ندارند) */
        $byExt = '';
        foreach ($allowed as $m => $info) {
            if ($info['ext'] === $ext) {
                $byExt = $m;
                break;
            }
        }
        if ($byExt === '') {
            if ($tmp) {
                @unlink($tmp);
            }
            $out['error'] = 'bad_type';
            return $out;
        }
        $mime = $byExt;
    }
    $kind = $allowed[$mime]['kind'];
    if ($kind === 'image' && !$allowImages) {
        $out['error'] = 'images_disabled';
        if ($tmp) { @unlink($tmp); }
        return $out;
    }
    if ($kind !== 'image' && !$allowFiles) {
        $out['error'] = 'files_disabled';
        if ($tmp) { @unlink($tmp); }
        return $out;
    }
    $size = strlen($binary);
    if ($size > eplakSupportMaxBytes($settings, $kind)) {
        $out['error'] = 'too_large';
        if ($tmp) { @unlink($tmp); }
        return $out;
    }

    $sub  = date('Y/m');
    $root = defined('EPLAK_ROOT') ? EPLAK_ROOT : dirname(__DIR__);
    $dir  = $root . '/' . EPLAK_SUPPORT_UPLOAD_DIR . '/' . $sub;
    if (!(function_exists('eplakMediaEnsureDir') ? eplakMediaEnsureDir($dir) : (@mkdir($dir, 0775, true) || is_dir($dir)))) {
        $out['error'] = 'dir_failed';
        if ($tmp) { @unlink($tmp); }
        return $out;
    }
    $safe = bin2hex(random_bytes(8)) . '.' . $allowed[$mime]['ext'];
    if (!@rename($tmp, $dir . '/' . $safe)) {
        if (@file_put_contents($dir . '/' . $safe, $binary) === false) {
            $out['error'] = 'write_failed';
            if ($tmp) { @unlink($tmp); }
            return $out;
        }
        @unlink($tmp);
    }
    @chmod($dir . '/' . $safe, 0644);

    $out['ok']   = true;
    $out['path'] = EPLAK_SUPPORT_UPLOAD_DIR . '/' . $sub . '/' . $safe;
    $out['kind'] = $kind;
    $out['name'] = $originalName !== '' ? $originalName : $safe;
    $out['size'] = $size;
    $out['mime'] = $mime;
    return $out;
}

/**
 * مسیرِ نسبیِ پیوست ← مسیرِ مطلقِ امن.
 * فقط فایل‌های «داخلِ» uploads/support مجازند (path traversal بسته است).
 */
function eplakSupportAttachmentPath(string $relative): ?string
{
    $relative = str_replace('\\', '/', trim($relative));
    if ($relative === '' || strpos($relative, '..') !== false || strpos($relative, "\0") !== false) {
        return null;
    }
    $relative = preg_replace('#^.*?' . preg_quote(EPLAK_SUPPORT_UPLOAD_DIR, '#') . '/#', '', $relative) ?? '';
    if ($relative === '') {
        return null;
    }
    $root = defined('EPLAK_ROOT') ? EPLAK_ROOT : dirname(__DIR__);
    $base = realpath($root . '/' . EPLAK_SUPPORT_UPLOAD_DIR);
    if ($base === false) {
        return null;
    }
    $full = realpath($base . '/' . $relative);
    if ($full === false || strpos($full, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($full)) {
        return null;
    }
    return $full;
}

/** گفتگوهای شهروند (برایِ فهرستِ «پشتیبانی» در اپ) */
function eplakSupportThreadsOf(PDO $pdo, string $phone, int $limit = 20): array
{
    $limit = max(1, min(100, $limit));
    try {
        if (eplakSupportHasChannel($pdo)) {
            $st = $pdo->prepare("SELECT id, title, status, department, unread_citizen, last_message_at, last_sender, closed_at, rating, created_at
                                 FROM tickets WHERE user_phone = ? AND channel = ? ORDER BY id DESC LIMIT " . $limit);
            $st->execute([$phone, EPLAK_SUPPORT_CHANNEL]);
        } else {
            $st = $pdo->prepare("SELECT id, title, status, department, reply, created_at
                                 FROM tickets WHERE user_phone = ? AND title = 'پشتیبانی آنلاین' ORDER BY id DESC LIMIT " . $limit);
            $st->execute([$phone]);
        }
        return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        error_log('[eplak][support] threads failed: ' . $e->getMessage());
        return [];
    }
}

/**
 * صندوقِ مرکزیِ پشتیبانی (پنل) — با فیلتر و دامنه‌ی دسترسی.
 * @param array $scope خروجیِ eplakAdminScope() برایِ محدود کردنِ مدیرِ حوزه
 */
function eplakSupportAdminInbox(PDO $pdo, array $filters = [], array $scope = []): array
{
    $limit = max(1, min(200, (int) ($filters['limit'] ?? 60)));
    $where = [];
    $params = [];
    if (eplakSupportHasChannel($pdo)) {
        $where[] = 'channel = :channel';
        $params[':channel'] = EPLAK_SUPPORT_CHANNEL;
    } else {
        $where[] = "title = 'پشتیبانی آنلاین'";
    }
    $state = (string) ($filters['state'] ?? '');
    if ($state === 'unread' && eplakSupportHasChannel($pdo)) {
        $where[] = 'unread_admin > 0';
    } elseif ($state === 'open') {
        $where[] = "(closed_at IS NULL OR closed_at = '')";
    } elseif ($state === 'closed') {
        $where[] = "closed_at IS NOT NULL AND closed_at <> ''";
    }
    $q = trim((string) ($filters['q'] ?? ''));
    if ($q !== '') {
        $where[] = '(user_phone LIKE :q OR title LIKE :q OR description LIKE :q)';
        $params[':q'] = '%' . $q . '%';
    }
    /* دامنه‌ی دسترسی: اگر روزی مجوزِ «پشتیبانی» به یک مدیرِ حوزه‌محدود داده شود،
       فقط گفتگوهای همان واحد را می‌بیند (همان تابعِ مشترکِ گزارش‌ها/تیکت‌ها).
       برایِ مدیر کل رشته‌ی خالی برمی‌گردد ⇒ همه‌ی گفتگوها. */
    if (!empty($scope) && empty($scope['is_super']) && function_exists('eplakScopeSql')) {
        $s = eplakScopeSql($scope, 'tickets');
        if (!empty($s['sql'])) {
            $where[] = ltrim(preg_replace('/^\s*AND\s+/i', '', $s['sql']));
            $params += $s['params'];
        }
    }
    $order = eplakSupportHasChannel($pdo)
        ? "ORDER BY (last_message_at <> '') DESC, last_message_at DESC, id DESC"
        : 'ORDER BY id DESC';
    try {
        $st = $pdo->prepare('SELECT * FROM tickets WHERE ' . implode(' AND ', $where) . ' ' . $order . ' LIMIT ' . $limit);
        $st->execute($params);
        return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        error_log('[eplak][support] inbox failed: ' . $e->getMessage());
        return [];
    }
}

/** جمعِ خوانده‌نشده‌های پشتیبانی (برایِ نشانِ منو و live-pulse پنل) */
function eplakSupportUnreadTotal(PDO $pdo): int
{
    if (!eplakSupportHasChannel($pdo)) {
        return 0;
    }
    try {
        $st = $pdo->prepare('SELECT COALESCE(SUM(unread_admin), 0) FROM tickets WHERE channel = ?');
        $st->execute([EPLAK_SUPPORT_CHANNEL]);
        return (int) $st->fetchColumn();
    } catch (Throwable $e) {
        return 0;
    }
}

/**
 * «حضورِ» پشتیبان: آخرین فعالیتی که از پنل ثبت شده.
 * عمداً از روی فعالیتِ واقعی خوانده می‌شود، نه یک نقطه‌ی سبزِ تزیینی —
 * اگر کسی پشتِ پنل نباشد، شهروند باید بداند.
 */
function eplakSupportAgentSeen(PDO $pdo): string
{
    try {
        return (string) eplakAppSetting($pdo, 'support_agent_seen', '');
    } catch (Throwable $e) {
        return '';
    }
}

/** ثبتِ فعالیتِ پشتیبان (از پنل صدا زده می‌شود) */
function eplakSupportAgentTouch(PDO $pdo): void
{
    try {
        eplakSetAppSetting($pdo, 'support_agent_seen', function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : date('Y-m-d H:i:s'));
    } catch (Throwable $e) {
        /* بی‌ضرر */
    }
}

/** آیا پشتیبان «الان» فعال است؟ (حداکثر $window ثانیه پیش) */
function eplakSupportAgentOnline(PDO $pdo, int $window = 240): bool
{
    $seen = eplakSupportAgentSeen($pdo);
    if ($seen === '' || !function_exists('eplakDbAgeSeconds')) {
        return false;
    }
    try {
        return eplakDbAgeSeconds($seen, $pdo) <= $window;
    } catch (Throwable $e) {
        return false;
    }
}

/** پاسخ‌های آماده (از تنظیمات) — برایِ سرعتِ پشتیبان */
function eplakSupportCanned(array $settings): array
{
    $raw = (string) ($settings['canned'] ?? '');
    $parts = preg_split('/\r?\n/', $raw) ?: [];
    $out = [];
    foreach ($parts as $p) {
        $p = trim($p);
        if ($p !== '') {
            $out[] = $p;
        }
    }
    return array_slice($out, 0, 20);
}

/** شکلِ عمومیِ یک پیام برایِ JSON (بدونِ افشای ستون‌های داخلی) */
function eplakSupportPublicMessage(array $row): array
{
    $mediaPath = (string) ($row['media_path'] ?? '');
    return [
        'id'          => (int) ($row['id'] ?? 0),
        'sender'      => (string) ($row['sender'] ?? 'system'),
        'sender_name' => (string) ($row['sender_name'] ?? ''),
        'body'        => (string) ($row['body'] ?? ''),
        'media'       => $mediaPath === '' ? null : [
            'path' => $mediaPath,
            'kind' => (string) ($row['media_kind'] ?? ''),
            'name' => (string) ($row['media_name'] ?? ''),
            'size' => (int) ($row['media_size'] ?? 0),
        ],
        'created_at'  => (string) ($row['created_at'] ?? ''),
        'created_fa'  => function_exists('eplakFaDateTimeOf') ? eplakFaDateTimeOf($row['created_at'] ?? null, '') : '',
        'read'        => !empty($row['read_at']),
    ];
}

/** بستنِ گفتگو (با ثبتِ زمان و امتیازِ اختیاری) */
function eplakSupportClose(PDO $pdo, int $ticketId, int $rating = 0): bool
{
    if ($ticketId <= 0) {
        return false;
    }
    $now = function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : date('Y-m-d H:i:s');
    try {
        if (eplakSupportHasChannel($pdo)) {
            $pdo->prepare('UPDATE tickets SET closed_at = ?, status = ?, rating = ?, unread_admin = 0, unread_citizen = 0 WHERE id = ?')
                ->execute([$now, 'done', max(0, min(5, $rating)), $ticketId]);
        } else {
            $pdo->prepare("UPDATE tickets SET status = 'done' WHERE id = ?")->execute([$ticketId]);
        }
        return true;
    } catch (Throwable $e) {
        error_log('[eplak][support] close failed: ' . $e->getMessage());
        return false;
    }
}

/** بازکردنِ دوباره‌ی گفتگو */
function eplakSupportReopen(PDO $pdo, int $ticketId): bool
{
    if ($ticketId <= 0 || !eplakSupportHasChannel($pdo)) {
        return false;
    }
    try {
        $pdo->prepare("UPDATE tickets SET closed_at = '', status = 'pending' WHERE id = ?")->execute([$ticketId]);
        return true;
    } catch (Throwable $e) {
        return false;
    }
}
