<?php
if (!defined('EPLAK_ROOT')) {
    define('EPLAK_ROOT', dirname(__DIR__));
}

function eplakIsHttpsRequest(): bool {
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    $fwdProto = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    if ($fwdProto === 'https') {
        return true;
    }
    $fwdPort = (string) ($_SERVER['HTTP_X_FORWARDED_PORT'] ?? '');
    return $fwdPort === '443';
}

function eplakStartSession(string $name): void {
    if (session_status() === PHP_SESSION_NONE) {
        /* سازگاری با اجرا پشت پروکسی/پیش‌نمایشِ جاسازی‌شده (iframe):
           اگر مرورگر کوکی شخص‌ثالث را مسدود کند، شناسه نشست از طریق URL
           منتقل می‌شود (به‌جای trans_sidِ رسمی که در PHP 8.5 غیرفعال/منسوخ
           شده؛ پیاده‌سازی داخلی: eplakAdoptUrlSessionId + eplakSessionUrlRewriter).
           در حالت عادی (کوکی پذیرفته می‌شود) نشانی‌ها تمیز می‌مانند و
           هیچ شناسه‌ای در URL ظاهر نمی‌شود. */
        @ini_set('session.use_cookies', '1');
        @ini_set('session.use_strict_mode', '1');
        @ini_set('session.cookie_httponly', '1');

        if (eplakIsHttpsRequest()) {
            session_set_cookie_params([
                'path'     => '/',
                'secure'   => true,
                'httponly' => true,
                'samesite' => 'None',
            ]);
        } else {
            session_set_cookie_params([
                'path'     => '/',
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        }
        session_name($name);
        eplakAdoptUrlSessionId();
        session_start();

        /* اگر کوکی نشست در این درخواست نبود (مرورگر کوکی را بلوک کرده)،
           بافر خروجی بازنویس‌کننده فعال می‌شود تا لینک‌ها و فرم‌ها شناسه
           نشست را در URL حمل کنند. */
        if (empty($_COOKIE[$name]) && session_status() === PHP_SESSION_ACTIVE) {
            ob_start('eplakSessionUrlRewriter');
        }
    }
}

/* قبل از session_start: اگر این درخواست کوکی نشست نداشته باشد ولی شناسه
   نشست را در پارامتر (?eplak_admin=...) یا فیلد پنهان فرم لاگین حمل
   کرده باشد، آن را می‌پذیریم. strict-mode شناسه‌های نامعتبر (غیرموجود در
   مخزن نشست) را رد می‌کند، پس سوءاستفاده از این مسیر برای hijack نمی‌شود.
   باید بعد از session_name() و قبل از session_start() فراخوانی شود. */
function eplakAdoptUrlSessionId(): void {
    if (session_status() !== PHP_SESSION_NONE) {
        return;
    }
    if (!empty($_COOKIE[session_name()])) {
        return; // حالت عادی: فقط کوکی معتبر است و مقادیر URL نادیده گرفته می‌شوند
    }
    $candidate = $_REQUEST[session_name()] ?? $_REQUEST['PHPSESSID'] ?? '';
    if (is_string($candidate) && preg_match('/^[a-zA-Z0-9]{10,100}$/', $candidate)) {
        session_id($candidate);
    }
}

/* بافر خروجی (فقط در حالتِ بلوک‌شدن کوکی): attributes href/src نسبی را بازنویسی
   می‌کند و یک فیلد پنهان در فرم‌ها می‌گذارد تا شناسه نشست در URL بماند.
   نشانی‌های خارجی/سکیم‌دار دست‌نخورده می‌مانند. */
function eplakSessionUrlRewriter(string $html, int $phase = 0): string {
    $id = session_id();
    if ($id === '' || $html === '') {
        return $html;
    }
    $name = session_name();
    $tag  = $name . '=' . rawurlencode($id);

    $html = preg_replace_callback(
        '/\b(href|src)\s*=\s*(["\'])([^\'"<>\s]+)\2/i',
        static function (array $m) use ($name, $tag): string {
            $url = $m[3];
            if ($url === '') {
                return $m[0];
            }
            if ($url[0] === '#') {
                return $m[0];
            }
            if (preg_match('#^(https?:)?//#i', $url) || preg_match('#^(javascript|mailto|tel|data):#i', $url)) {
                return $m[0];
            }
            if (strpos($url, $name . '=') !== false) {
                return $m[0]; // شناسه نشست را از قبل در بر دارد
            }
            return $m[1] . '=' . $m[2] . $url . (strpos($url, '?') === false ? '?' : '&') . $tag . $m[2];
        },
        $html
    );

    $hidden = '<input type="hidden" name="' . $name . '" value="' . $id . '">';
    $html   = preg_replace_callback('/<form\b[^>]*>/i', static fn(array $m): string => $m[0] . $hidden, $html);

    return $html;
}

function eplakSessionInUrlNeeded(): bool {
    $name = session_name();
    return session_status() !== PHP_SESSION_NONE
        && $name !== ''
        && session_id() !== ''
        && empty($_COOKIE[$name]);
}

/* هدایت سازگار با محیط‌هایی که کوکی را نمی‌پذیرند:
   اگر مرورگر کوکی نشست را نفرستاده باشد، شناسه نشست به نشانی مقصد افزوده
   می‌شود تا نشست بعد از هدایت هم حفظ گردد. در حالت عادی (کوکی فعال)
   نشانی‌ها دقیقاً همان قبل می‌مانند. */
function eplakRedirect(string $target): void {
    // فقط مسیرهای نسبی/داخلی — جلوگیری از Open Redirect
    if (preg_match('#^(https?:)?//#i', $target)) {
        $target = 'index.php';
    }
    /* مسیر نسبی را به مسیر مطلق (از ریشه) تبدیل می‌کنیم؛ برخی پروکسی/پیش‌نمایش‌ها
       Location نسبی را درست حل نمی‌کنند و کاربر را به‌جای پنل ادمین به ریشه‌ی
       اپ می‌فرستند (مثلاً «index.php» به‌جای /admin/index.php). */
    if ($target === '' || $target[0] !== '/') {
        $path = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/');
        $dir  = rtrim(dirname($path), '/');
        $target = $dir . '/' . $target;
    }
    /* اگر مرورگر کوکی نشست را نپذیرد (مثلاً پیش‌نمایش جاسازی‌شده/iframe)،
       شناسه نشست را در نشانی مقصد هم می‌بریم تا نشست بعد از هدایت حفظ شود؛
       در حالت عادی (کوکی فعال) نشانی بدون تغییر می‌ماند. */
    if (eplakSessionInUrlNeeded()) {
        $sep    = (strpos($target, '?') === false) ? '?' : '&';
        $target .= $sep . rawurlencode((string) session_name()) . '=' . rawurlencode((string) session_id());
    }
    header('Location: ' . $target);
    exit;
}

/* ─────────────────────────────────────────────────────────────────────────────
   درایور دیتابیس:
   - پیش‌فرض: mysql (همان رفتار قدیمی)
   - حالت توسعه/پیش‌نمایش بدون سرور MySQL: driver = sqlite
     (با متغیر محیطی DB_DRIVER یا کلید 'driver' در shared/config.php)
   در حالت sqlite، فایل دیتابیس پیش‌فرض data/eplak.sqlite در ریشه‌ی پروژه است
   و همه‌ی جداول + داده‌های پیش‌فرض به‌صورت خودکار ساخته می‌شوند.
   ───────────────────────────────────────────────────────────────────────────── */

function eplakIsSqlite(PDO $pdo): bool {
    return strtolower((string) $pdo->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite';
}

/* واحدهای اداری پیش‌فرض — مشترک بین مسیر MySQL و SQLite */
function eplakDefaultDepartments(): array {
    return [
        'حوزه شهردار' => ['دفتر شهردار', 'روابط عمومی و امور بین‌الملل', 'بازرسی و ارزیابی عملکرد', 'حراست', 'امور حقوقی', 'شورای مشاوران'],
        'معاونت اداری و مالی' => ['منابع انسانی', 'امور اداری', 'امور مالی و حسابداری', 'بودجه و برنامه‌ریزی', 'تدارکات و پشتیبانی', 'فناوری اطلاعات (IT)'],
        'معاونت فنی و عمرانی' => ['طراحی و اجرای پروژه‌های عمرانی', 'ساخت و نگهداری معابر', 'پل‌ها و تونل‌ها', 'ساختمان‌های عمومی', 'تأسیسات شهری'],
        'معاونت شهرسازی و معماری' => ['صدور پروانه ساختمانی', 'پایان کار ساختمان', 'کنترل و نظارت ساختمانی', 'طرح‌های توسعه شهری', 'کمیسیون‌های شهرسازی'],
        'معاونت خدمات شهری' => ['نظافت شهری', 'مدیریت پسماند', 'فضای سبز', 'زیباسازی شهر', 'آرامستان‌ها', 'کنترل حیوانات شهری'],
        'معاونت حمل‌ونقل و ترافیک' => ['مدیریت ترافیک', 'پارکینگ‌ها', 'حمل‌ونقل عمومی', 'پایانه‌ها', 'ایمنی و علائم راهنمایی'],
        'معاونت فرهنگی و اجتماعی' => ['فرهنگسراها', 'کتابخانه‌ها', 'امور جوانان', 'امور بانوان', 'مشارکت‌های مردمی', 'ورزش همگانی'],
        'معاونت برنامه‌ریزی و توسعه' => ['آمار و اطلاعات', 'پژوهش و نوآوری', 'مدیریت پروژه', 'هوشمندسازی شهر'],
        'سازمان‌ها و شرکت‌های وابسته' => ['سازمان مدیریت پسماند', 'سازمان آتش‌نشانی و خدمات ایمنی', 'سازمان پارک‌ها و فضای سبز', 'سازمان زیباسازی', 'سازمان حمل‌ونقل بار و مسافر', 'سازمان میادین و بازارها', 'سازمان آرامستان‌ها', 'سازمان فناوری اطلاعات و ارتباطات', 'سازمان فرهنگی، اجتماعی و ورزشی', 'سازمان سرمایه‌گذاری و مشارکت‌های مردمی', 'شرکت بهره‌برداری مترو (در شهرهای دارای مترو)', 'شرکت واحد اتوبوسرانی', 'شرکت نوسازی و بهسازی شهری'],
    ];
}

/* کاربر پیش‌فرض ادمین را در صورت خالی بودن جدول می‌سازد */
function eplakSeedDefaultAdmin(PDO $pdo): void {
    $count = (int) $pdo->query('SELECT COUNT(*) as count FROM admin_users')->fetch()['count'];
    if ($count === 0) {
        $stmt = $pdo->prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (:username, :password_hash, :role)');
        $stmt->execute([
            ':username'      => 'admin',
            ':password_hash' => password_hash('admin123', PASSWORD_DEFAULT),
            ':role'          => 'super_admin',
        ]);
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   «تنظیمات برنامه» — جدول کلید/مقدار برای نگه‌داشتن چیزهایی مثل کلیدهای VAPID
   اعلان‌های پس‌زمینه (Web Push). این کلیدها خودکار ساخته و در همین جدول
   ذخیره می‌شوند تا بین درخواست‌ها پایدار بمانند.
   ───────────────────────────────────────────────────────────────────────────── */
function eplakAppSetting(PDO $pdo, string $key, ?string $default = null): ?string {
    try {
        $stmt = $pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key = :k LIMIT 1');
        $stmt->execute([':k' => $key]);
        $value = $stmt->fetchColumn();
        return ($value === false || $value === null) ? $default : (string) $value;
    } catch (\Throwable $e) {
        return $default;
    }
}

function eplakSetAppSetting(PDO $pdo, string $key, string $value): void {
    $sql = eplakIsSqlite($pdo)
        ? 'INSERT INTO app_settings (setting_key, setting_value) VALUES (:k, :v)
           ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP'
        : 'INSERT INTO app_settings (setting_key, setting_value) VALUES (:k, :v)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP';
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':k' => $key, ':v' => $value]);
    } catch (\Throwable $e) {
        /* بی‌صدا: نبود این جدول نباید جلوی کار اصلی را بگیرد */
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   محتوای پیش‌فرض «اخبار و دانستنی‌ها»
   همان مطالبی که تا پیش از این به‌صورت ثابت داخل سایت/اپ بود؛ هنگام راه‌اندازی
   اولیه در جدول news درج می‌شود تا در پنل مدیریت دیده و ویرایش شود.
   (پس از درج، پنل مدیریت مرجع اصلی است و تغییراتش بلافاصله در سایت/اپ دیده می‌شود.)
   ───────────────────────────────────────────────────────────────────────────── */
function eplakDefaultSeedNews(): array {
    return [
        [
            'type' => 'news',
            'icon' => '🌳',
            'badge' => null,
            'sort_order' => 1,
            'title' => 'افتتاح پارک جدید در منطقه شمالی ورامین',
            'summary' => 'پارک جدید شهر با امکانات ورزشی و فضای سبز گسترده افتتاح شد.',
            'body' => 'پارک جدید شهرداری ورامین با مساحت بیش از ۵ هکتار و امکاناتی شامل زمین‌های ورزشی، مسیر پیاده‌روی، فضای بازی کودکان و فضای سبز گسترده، آماده بهره‌برداری شهروندان عزیز شده است. این پروژه با مشارکت شهروندان و در راستای ارتقای کیفیت زندگی شهری اجرا شده است.',
            'image_url' => null,
        ],
        [
            'type' => 'news',
            'icon' => '📋',
            'badge' => null,
            'sort_order' => 2,
            'title' => 'اطلاعیه نوبت‌دهی پرداخت عوارض نوسازی',
            'summary' => 'مهلت پرداخت عوارض نوسازی سال جاری تا پایان خرداد ماه تمدید شد.',
            'body' => 'به اطلاع شهروندان محترم می‌رساند مهلت پرداخت عوارض نوسازی سال جاری تا پایان خرداد ماه تمدید گردیده است. شهروندان می‌توانند از طریق بخش «پرداخت عوارض» همین برنامه نسبت به پرداخت بدهی خود اقدام نمایند.',
            'image_url' => null,
        ],
        [
            'type' => 'news',
            'icon' => '🎉',
            'badge' => null,
            'sort_order' => 3,
            'title' => 'برگزاری جشنواره فرهنگی شهر ورامین',
            'summary' => 'جشنواره فرهنگی و هنری شهر با حضور هنرمندان محلی برگزار می‌شود.',
            'body' => 'شهرداری ورامین با همکاری اداره فرهنگ و ارشاد اسلامی، جشنواره فرهنگی و هنری شهر را با حضور هنرمندان محلی و برنامه‌های متنوع برای خانواده‌ها برگزار می‌کند. زمان و مکان دقیق برگزاری متعاقباً اعلام خواهد شد.',
            'image_url' => null,
        ],
        [
            'type' => 'news',
            'icon' => '🏗️',
            'badge' => null,
            'sort_order' => 4,
            'title' => 'آغاز طرح بازآفرینی بافت فرسوده مرکز شهر',
            'summary' => 'طرح نوسازی و بازآفرینی بافت فرسوده مرکز شهر آغاز شد.',
            'body' => 'با هدف ارتقای کیفیت بصری و کالبدی مرکز شهر، طرح بازآفرینی بافت فرسوده با همکاری شهرداری و سازمان نوسازی شهری آغاز شده و طی فازهای مختلف تا پایان سال ادامه خواهد داشت.',
            'image_url' => null,
        ],
        [
            'type' => 'tip',
            'icon' => '🏛️',
            'badge' => '۷۲۲ ه.ق · دوره ایلخانی',
            'sort_order' => 1,
            'title' => 'مسجد جامع ورامین',
            'summary' => 'تنها نمونه کامل مساجد چهارایوانی ایران؛ شاهکاری از کاشی‌کاری معرق، گچ‌بری و آجرکاری دوران ایلخانی.',
            'body' => "مسجد جامع ورامین، معروف به مسجد جمعه ورامین، یکی از کهن‌ترین و باشکوه‌ترین بناهای برجامانده از دوره ایلخانی در ایران است. ساخت آن در روزگار سلطان محمد خدابنده (الجایتو) آغاز شد و در دوران فرزند و جانشین او، ابوسعید بهادرخان، در سال ۷۲۲ هجری قمری به پایان رسید.\n\nاین مسجد با نقشه‌ای مستطیلی به ابعاد تقریبی ۶۶ در ۴۳ متر، تنها نمونه کامل و یکپارچه مساجد چهارایوانی در ایران است؛ سبکی که از سلجوقیان آغاز شده و در این بنا به اوج پختگی خود رسیده است. گنبدخانه مسجد با گذر از فیل‌پوش‌ها از مربع به هشت‌ضلعی و سپس شانزده‌ضلعی، به گنبدی باشکوه ختم می‌شود.\n\nسردر بلند و کشیده ورودی، کاشی‌کاری‌های معرق فیروزه‌ای و لاجوردی، گچ‌بری‌های ظریف گرداگرد محراب و کتیبه‌های تاریخی به خط ثلث و کوفی، این بنا را به یکی از مهم‌ترین آثار هنری و معماری دوران اسلامی ایران بدل کرده‌اند. در دوران معاصر، استاد محمدکریم پیرنیا، پدر معماری سنتی ایران، مرمت این اثر گران‌بها را بر عهده داشت.",
            'image_url' => 'assets/img/varamin-mosque.jpg',
        ],
        [
            'type' => 'tip',
            'icon' => '🗼',
            'badge' => '۶۸۸ ه.ق · آرامگاهی',
            'sort_order' => 2,
            'title' => 'برج علاءالدوله ورامین',
            'summary' => 'برج آرامگاهی استوانه‌ای با گنبدی مخروطی بلند؛ از قدیمی‌ترین آثار ثبت‌شده ملی ایران.',
            'body' => "برج علاءالدوله، که با نام برج علاءالدین نیز شناخته می‌شود، یکی از قدیمی‌ترین برج‌های آرامگاهی به‌جامانده از ایران است. این بنا در سال ۶۸۸ هجری قمری، در اواخر سده هفتم هجری، به دستور فخرالدین بر فراز آرامگاه پدرش، حسن علاءالدوله، حاکم وقت شهر ری، ساخته شد.\n\nبرج از بدنه‌ای استوانه‌ای آجری با چین‌خوردگی‌های عمودی شکل گرفته که در ارتفاعی نزدیک به ۱۷ متر به گنبدی مخروطی و بلند ختم می‌شود؛ ترکیبی که سیمای منحصربه‌فرد و شناخته‌شده این بنا را در میدان مرکزی ورامین رقم زده است. در محل اتصال بخش استوانه‌ای به مخروطی، کتیبه‌ای آجری با خطوط کوفی برگ‌دار حک شده که نام بانی، تاریخ بنا و دعایی برای آرامش روح علاءالدوله را در خود دارد.\n\nنمای بیرونی برج با شمسه‌های آجری و کاشی‌های فیروزه‌ای و لاجوردی تزئین شده است. این اثر در ۱۵ دی ماه ۱۳۱۰ با شماره ثبت ۱۷۷ در فهرست آثار ملی ایران به ثبت رسید و امروزه یکی از نمادهای شناخته‌شده شهر ورامین و مقصد علاقه‌مندان به تاریخ و معماری ایرانی است.",
            'image_url' => 'assets/img/varamin-tower.jpg',
        ],
    ];
}

/* درج محتوای پیش‌فرض اخبار/دانستنی‌ها فقط زمانی که جدول news کاملاً خالی است
   (تا هرگز روی محتوای واقعی ادمین نوشته نشود). خروجی: تعداد ردیف درج‌شده. */
function eplakSeedDefaultNews(PDO $pdo): int {
    try {
        $count = (int) $pdo->query('SELECT COUNT(*) FROM news')->fetchColumn();
    } catch (\Throwable $e) {
        return 0;
    }
    if ($count > 0) {
        return 0;
    }

    $inserted = 0;
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO news (type, title, summary, body, icon, image_url, published, sort_order, badge)
             VALUES (:type, :title, :summary, :body, :icon, :image_url, 1, :sort_order, :badge)'
        );
        foreach (eplakDefaultSeedNews() as $item) {
            $stmt->execute([
                ':type'       => $item['type'],
                ':title'      => $item['title'],
                ':summary'    => $item['summary'],
                ':body'       => $item['body'],
                ':icon'       => $item['icon'],
                ':image_url'  => $item['image_url'],
                ':sort_order' => $item['sort_order'],
                ':badge'      => $item['badge'],
            ]);
            $inserted++;
        }
    } catch (\Throwable $e) {
        return 0;
    }
    return $inserted;
}

/* واحدهای اداری پیش‌فرض را در صورت خالی بودن جدول می‌سازد */
function eplakSeedDefaultDepartments(PDO $pdo): void {
    $count = (int) $pdo->query('SELECT COUNT(*) as count FROM departments')->fetch()['count'];
    if ($count !== 0) {
        return;
    }
    foreach (eplakDefaultDepartments() as $parentName => $children) {
        $parentStmt = $pdo->prepare('INSERT INTO departments (name, parent_id, sort_order, is_active) VALUES (:name, NULL, :sort_order, 1)');
        $parentStmt->execute([':name' => $parentName, ':sort_order' => 0]);
        $parentId = (int) $pdo->lastInsertId();

        foreach ($children as $index => $childName) {
            $childStmt = $pdo->prepare('INSERT INTO departments (name, parent_id, sort_order, is_active) VALUES (:name, :parent_id, :sort_order, 1)');
            $childStmt->execute([
                ':name'      => $childName,
                ':parent_id' => $parentId,
                ':sort_order' => $index + 1,
            ]);
        }
    }
}

/* توابع کمکی برای سازگاری SQLهای MySQL با SQLite (بدون تغییر کوئری‌های اپ) —
   سازگار با PHP 7.4 تا 8.5 (در 8.5 از Pdo\Sqlite استفاده می‌شود) */
function eplakSqliteCreateFunction(PDO $pdo, string $name, callable $fn, int $numArgs): void {
    if (method_exists($pdo, 'createFunction')) {
        $pdo->createFunction($name, $fn, $numArgs);
        return;
    }
    @$pdo->sqliteCreateFunction($name, $fn, $numArgs);
}

function eplakRegisterSqliteFunctions(PDO $pdo): void {
    eplakSqliteCreateFunction($pdo, 'concat', function (...$args): string {
        $out = '';
        foreach ($args as $a) {
            $out .= $a === null ? '' : (string) $a;
        }
        return $out;
    }, -1);

    eplakSqliteCreateFunction($pdo, 'lpad', function ($value, $length, $pad): string {
        return str_pad((string) $value, max(0, (int) $length), (string) $pad, STR_PAD_LEFT);
    }, 3);

    eplakSqliteCreateFunction($pdo, 'now', static function (): string {
        return date('Y-m-d H:i:s');
    }, 0);

    /* معادل ساده‌ی DATE_FORMAT() — فقط توکن‌های رایج */
    eplakSqliteCreateFunction($pdo, 'date_format', function ($value, $format = '%Y-%m-%d') {
        if ($value === null) {
            return null;
        }
        $ts = strtotime((string) $value);
        if ($ts === false) {
            return null;
        }
        $map = [
            '%Y' => 'Y', '%y' => 'y', '%m' => 'm', '%c' => 'n', '%d' => 'd', '%e' => 'j',
            '%H' => 'H', '%k' => 'G', '%i' => 'i', '%s' => 's', '%S' => 's', '%T' => 'H:i:s',
            '%M' => 'F', '%b' => 'M', '%W' => 'l', '%a' => 'D', '%p' => 'A',
        ];
        $phpFormat = strtr((string) $format, $map);
        return date($phpFormat, $ts);
    }, 2);
}

/* اسکیمای کامل SQLite — معادل اسکیمای نهایی MySQL (شامل ستون‌های ارتقاء‌یافته) */
function eplakSqliteBootstrap(PDO $pdo): void {
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        reply TEXT,
        category VARCHAR(100) DEFAULT '',
        department VARCHAR(255) DEFAULT '',
        priority VARCHAR(20) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone VARCHAR(20) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL DEFAULT '',
        address VARCHAR(500) DEFAULT '',
        nid VARCHAR(20) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        send_id INT,
        read_flag TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS notification_sends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        target_type VARCHAR(50) NOT NULL DEFAULT 'all',
        recipients_count INT NOT NULL DEFAULT 0,
        push_sent INT NOT NULL DEFAULT 0,
        push_failed INT NOT NULL DEFAULT 0,
        fcm_sent INT NOT NULL DEFAULT 0,
        fcm_failed INT NOT NULL DEFAULT 0,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        department VARCHAR(255) DEFAULT '',
        sub_department VARCHAR(255) DEFAULT '',
        location VARCHAR(500) DEFAULT '',
        lat DOUBLE NULL,
        lng DOUBLE NULL,
        location_accuracy DOUBLE NULL,
        status VARCHAR(50) DEFAULT 'pending',
        reply TEXT,
        client_ref VARCHAR(64) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    /* جلوگیری از ثبت تکراری: هر درخواست اپ یک «شناسه‌ی یکتا» می‌سازد و سرور
       همان را دوباره برنمی‌گرداند (ایندکس یکتا روی MySQL). */
    try { $pdo->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_client_ref ON reports (client_ref) WHERE client_ref <> ''"); } catch (Throwable $e) {}

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type VARCHAR(20) NOT NULL DEFAULT 'news',
        title VARCHAR(255) NOT NULL,
        summary TEXT,
        body TEXT NOT NULL,
        icon VARCHAR(50),
        badge VARCHAR(120),
        image_url VARCHAR(500),
        published TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    /* اشتراک‌های اعلان پس‌زمینه (Web Push) — برای رسیدن اعلان وقتی گوشی
       قفل است یا کاربر داخل برنامه نیست. */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone VARCHAR(20) NOT NULL DEFAULT '',
        endpoint VARCHAR(500) NOT NULL UNIQUE,
        p256dh VARCHAR(255) NOT NULL,
        auth_key VARCHAR(255) NOT NULL,
        content_encoding VARCHAR(50) NOT NULL DEFAULT 'aes128gcm',
        user_agent VARCHAR(255) DEFAULT '',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        fail_count INT NOT NULL DEFAULT 0,
        last_error VARCHAR(255) DEFAULT '',
        last_seen_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    /* «خوانده شدن» اعلان به‌ازای هر کاربر.
       ستون read_flag در جدول notifications یک مقدار برای کل ردیف است؛ اعلان‌های
       گروهی (user_phone = 'all') یک ردیف مشترک برای همه هستند، پس با آن نمی‌شد
       فهمید کدام کاربر اعلان را خوانده است. این جدول برای هر (اعلان، خواننده)
       یک سطر نگه می‌دارد. کلید خواننده برای کاربر وارد‌شده شماره‌ی موبایل و
       برای کاربر مهمان «guest:<شناسه‌ی دستگاه>» است. */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS notification_reads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id INT NOT NULL,
        user_phone VARCHAR(60) NOT NULL,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (notification_id, user_phone)
    )");

    /* «حذف اعلان» به‌ازای هر کاربر.
       اعلان‌های گروهی یک ردیف مشترک دارند؛ پس کاربر نمی‌تواند ردیف را واقعاً پاک
       کند (برای دیگران هم پاک می‌شود). این جدول برای هر (اعلان، خواننده) یک سطر
       نگه می‌دارد و اعلان‌های حذف‌شده فقط برای همان کاربر نمایش داده نمی‌شوند.
       کلید خواننده مثل notification_reads است (شماره یا guest:<دستگاه>). */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS notification_deletes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id INT NOT NULL,
        user_phone VARCHAR(60) NOT NULL,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (notification_id, user_phone)
    )");

    /* توکن دستگاه‌های اندروید (فایربیس/FCM).
       در WebView اندروید، «Push API» وجود ندارد؛ پس اعلان سیستمی در حالت بسته
       بودن اپ از مسیر FCM می‌رود و این جدول توکن هر دستگاه را نگه می‌دارد. */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS device_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone VARCHAR(20) NOT NULL DEFAULT '',
        token VARCHAR(400) NOT NULL UNIQUE,
        platform VARCHAR(20) NOT NULL DEFAULT 'android',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        fail_count INT NOT NULL DEFAULT 0,
        last_error VARCHAR(255) DEFAULT '',
        last_seen_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    /* دفتر ارسال اعلان گوشی: برای هر اعلانِ شخصی (مثل «در حال رسیدگی»)
       نتیجه‌ی ارسال ثبت می‌شود تا مدیر بدون دسترسی به هاست ببیند اعلان چرا
       رسید یا نرسید (گوشی ثبت نیست؟ گوگل خطا داد؟ سرور به گوگل نمی‌رسد؟). */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS push_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id INT NOT NULL DEFAULT 0,
        user_phone VARCHAR(20) NOT NULL DEFAULT '',
        kind VARCHAR(30) NOT NULL DEFAULT '',
        code VARCHAR(40) NOT NULL DEFAULT '',
        title VARCHAR(250) NOT NULL DEFAULT '',
        channel VARCHAR(20) NOT NULL DEFAULT 'fcm',
        devices INT NOT NULL DEFAULT 0,
        sent INT NOT NULL DEFAULT 0,
        failed INT NOT NULL DEFAULT 0,
        outcome VARCHAR(30) NOT NULL DEFAULT '',
        error VARCHAR(400) NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_push_log_phone ON push_log(user_phone)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_push_log_code ON push_log(code)');

    /* فایل‌های پیوست گزارش‌ها (عکس و فیلم ارسالی شهروند) */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS report_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INT NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'image',
        file_path VARCHAR(500) NOT NULL,
        original_name VARCHAR(255) DEFAULT '',
        mime_type VARCHAR(100) DEFAULT '',
        size_bytes INT NOT NULL DEFAULT 0,
        client_ref VARCHAR(64) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    /* ردیف‌های «در انتظار اتصال» (report_id = 0) با شناسه‌ی یکتای درخواست
       نگه داشته می‌شوند تا پیش از ساخته شدن گزارش هم عکس/فیلم ذخیره شود. */
    try { $pdo->exec("CREATE INDEX IF NOT EXISTS idx_report_media_client_ref ON report_media (client_ref)"); } catch (Throwable $e) {}

    /* روند رسیدگی به گزارش — همان چیزی که هم در اپ و هم در پنل ادمین
       نشان داده می‌شود. هر ردیف یک گام است: ثبت، ارجاع، تغییر وضعیت،
       پاسخ مدیریت، افزودن پیوست و … */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS report_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INT NOT NULL,
        type VARCHAR(40) NOT NULL DEFAULT 'note',
        title VARCHAR(200) NOT NULL DEFAULT '',
        body TEXT DEFAULT '',
        actor VARCHAR(40) NOT NULL DEFAULT 'system',
        status VARCHAR(30) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_report_events_report ON report_events(report_id)');

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_report_media_report ON report_media(report_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_push_subs_phone ON push_subscriptions(user_phone)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_notif_reads_notification ON notification_reads(notification_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_notif_deletes_notification ON notification_deletes(notification_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_device_tokens_phone ON device_tokens(user_phone)');

    /* تنظیمات کلید/مقدار برنامه (کلیدهای VAPID و …) */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL,
        parent_id INT,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        slug VARCHAR(255),
        code VARCHAR(50),
        description TEXT,
        icon VARCHAR(50),
        color VARCHAR(7) DEFAULT '#0f766e',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_department_parent FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE CASCADE
    )");

    $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_department_name_parent ON departments(name, parent_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_department_parent ON departments(parent_id)');

    /* همگام‌سازی اسکیمای دیتابیس‌های قدیمی‌تر: هر ستونی که در کد هست و در
       دیتابیس موجود نیست، اضافه می‌شود (مثل send_id در جدول notifications). */
    eplakRunSchemaSync($pdo);

    eplakSeedDefaultDepartments($pdo);
    eplakSeedDefaultAdmin($pdo);
    eplakSeedDefaultNews($pdo);
}

/* افزودن ستون در صورت نبودن — مخصوص SQLite (برای دیتابیس‌های قبلی) */
function eplakSqliteAddColumnIfMissing(PDO $pdo, string $table, string $column, string $definition): void {
    try {
        $cols = $pdo->query("PRAGMA table_info($table)")->fetchAll();
        foreach ($cols as $col) {
            if (isset($col['name']) && strcasecmp((string) $col['name'], $column) === 0) {
                return;
            }
        }
        $pdo->exec("ALTER TABLE $table ADD COLUMN $column $definition");
    } catch (\Throwable $e) {
        /* بی‌صدا — نبود ستون جلوی کار را نمی‌گیرد */
    }
}

/* کوئری upsert جدول users — سازگار با هر دو درایور */
function eplakUsersUpsertSql(PDO $pdo, bool $keepDefaultName = false): string {
    $base = 'INSERT INTO users (phone, name, address, nid) VALUES (:phone, :name, :address, :nid) ';
    if (eplakIsSqlite($pdo)) {
        $nameExpr = $keepDefaultName
            ? 'CASE WHEN (excluded.name <> "" AND excluded.name <> "شهروند") THEN excluded.name WHEN name <> "" THEN name ELSE excluded.name END'
            : 'CASE WHEN excluded.name = "" THEN name ELSE excluded.name END';
        return $base . 'ON CONFLICT(phone) DO UPDATE SET
            name = ' . $nameExpr . ',
            address = CASE WHEN excluded.address <> "" THEN excluded.address ELSE address END,
            nid = CASE WHEN excluded.nid <> "" THEN excluded.nid ELSE nid END';
    }
    $nameExpr = $keepDefaultName
        ? 'IF(VALUES(name) != "" AND VALUES(name) != "شهروند", VALUES(name), IF(name != "", name, VALUES(name)))'
        : 'IF(VALUES(name) = "", name, VALUES(name))';
    return $base . 'ON DUPLICATE KEY UPDATE
            name = ' . $nameExpr . ',
            address = IF(VALUES(address) != "", VALUES(address), address),
            nid = IF(VALUES(nid) != "", VALUES(nid), nid)';
}

/* ============================================================================
   همگام‌سازی اسکیما (افزودن ستون‌های تازه به دیتابیس‌های قدیمی)
   ----------------------------------------------------------------------------
   مشکل واقعی: روی سرورِ در حال اجرا، جدول‌ها از قبل ساخته شده‌اند؛
   «CREATE TABLE IF NOT EXISTS» هیچ ستونی به جدول موجود اضافه نمی‌کند. پس اگر
   نسخه‌ی جدید کد به ستونی نیاز داشته باشد (مثل notifications.send_id)،
   روی دیتابیس قدیمی خطای «Unknown column» رخ می‌دهد.

   راه‌حل: هر «CREATE TABLE» کد به‌عنوان مرجع اسکیما ثبت می‌شود؛ سپس ستون‌های
   همان تعریف با دیتابیس مقایسه و ستون‌های نبوده با ALTER TABLE اضافه می‌شوند.
   برای اینکه روی هر درخواست هزینه‌ی اضافه پرداخت نشود، نتیجه در
   app_settings.schema_version ذخیره می‌شود و تا نسخه‌ی بعدی تکرار نمی‌شود.

   اگر نسخه‌ی اسکیما را در کد تغییر می‌دهید، فقط EPLAK_SCHEMA_VERSION را
   یک پله بالا ببرید؛ بقیه‌اش خودکار انجام می‌شود.
   ============================================================================ */
if (!defined('EPLAK_SCHEMA_VERSION')) {
    define('EPLAK_SCHEMA_VERSION', '2026-10-03.1');   /* + client_ref روی report_media برای ارسال «اول فایل، بعد گزارش» */   /* + شناسه‌ی یکتای درخواست (reports.client_ref) برای جلوگیری از ثبت تکراری */
}

/* تعریف جداول (همان متن CREATE TABLE) برای مقایسه با دیتابیس.
   تعریف‌ها جدا برای هر درایور نگه داشته می‌شوند؛ وگرنه تعریف مخصوص SQLite
   (مثل INTEGER PRIMARY KEY AUTOINCREMENT) می‌توانست روی MySQL هم اجرا شود. */
function eplakSchemaDdl(string $driver = '', ?string $ddl = null): array {
    static $list = [];
    if ($ddl !== null && $driver !== '') {
        $list[$driver][] = $ddl;
        return $list[$driver];
    }
    if ($driver !== '') {
        return $list[$driver] ?? [];
    }
    return $list;
}

/* ساخت جدول + ثبت تعریف آن برای همگام‌سازی ستون‌ها */
function eplakCreateTable(PDO $pdo, string $ddl): void {
    $pdo->exec($ddl);
    eplakSchemaDdl(eplakIsSqlite($pdo) ? 'sqlite' : 'mysql', $ddl);
}

/* نام جدول از متن CREATE TABLE */
function eplakSchemaTableName(string $ddl): string {
    return preg_match('/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i', $ddl, $m) ? $m[1] : '';
}

/* ستون‌ها و تعریف‌شان از متن CREATE TABLE — کلید/ایندکس/قیدها نادیده گرفته می‌شوند */
function eplakSchemaColumnDefinitions(string $ddl): array {
    $open  = strpos($ddl, '(');
    $close = strrpos($ddl, ')');
    if ($open === false || $close === false || $close <= $open) {
        return [];
    }
    $body = substr($ddl, $open + 1, $close - $open - 1);
    $out  = [];
    foreach (preg_split('/\r?\n/', $body) ?: [] as $line) {
        $line = trim((string) $line);
        if ($line === '' || strpos($line, '--') === 0) {
            continue;
        }
        $line = rtrim($line, ',');
        if (!preg_match('/^`?([A-Za-z_][A-Za-z0-9_]*)`?\s+(.+)$/', $line, $m)) {
            continue;
        }
        $name = $m[1];
        /* سطرهای کلید/ایندکس ستون نیستند */
        if (preg_match('/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN|FULLTEXT|SPATIAL|CHECK)$/i', $name)) {
            continue;
        }
        $out[$name] = trim($m[2]);
    }
    return $out;
}

/* ستون‌های موجود در دیتابیس؛ null یعنی «خواندن ناموفق» (دست به ALTER نمی‌زنیم) */
function eplakTableColumns(PDO $pdo, string $table): ?array {
    if ($table === '') {
        return null;
    }
    try {
        if (eplakIsSqlite($pdo)) {
            $rows = $pdo->query('PRAGMA table_info(' . $table . ')')->fetchAll();
            $names = [];
            foreach ($rows ?: [] as $row) {
                $names[] = strtolower((string) ($row['name'] ?? ''));
            }
            return $names;
        }
        $rows = $pdo->query('SHOW COLUMNS FROM `' . str_replace('`', '', $table) . '`')->fetchAll();
        $names = [];
        foreach ($rows ?: [] as $row) {
            $names[] = strtolower((string) ($row['Field'] ?? ($row['field'] ?? '')));
        }
        return $names;
    } catch (\Throwable $e) {
        return null;
    }
}

/* افزودن ستون‌های نبوده‌ی یک جدول؛ نتیجه در $report ثبت می‌شود */
function eplakSyncTableColumns(PDO $pdo, string $ddl, array &$report): void {
    $table = eplakSchemaTableName($ddl);
    $definitions = eplakSchemaColumnDefinitions($ddl);
    if ($table === '' || !$definitions) {
        return;
    }
    $live = eplakTableColumns($pdo, $table);
    if ($live === null) {
        $report['failed'][] = $table . ' — خواندن فهرست ستون‌ها ممکن نشد.';
        return;
    }

    $sqlite = eplakIsSqlite($pdo);
    foreach ($definitions as $column => $definition) {
        if (in_array(strtolower($column), $live, true)) {
            continue;
        }
        /* SQLite نمی‌تواند ستون کلید/یکتا اضافه کند و ستون NOT NULL بدون مقدار پیش‌فرض را نمی‌پذیرد */
        if ($sqlite && preg_match('/\b(PRIMARY\s+KEY|UNIQUE|AUTOINCREMENT)\b/i', $definition)) {
            continue;
        }
        if ($sqlite && preg_match('/\bNOT\s+NULL\b/i', $definition) && !preg_match('/\bDEFAULT\b/i', $definition)) {
            continue;
        }

        $sql = $sqlite
            ? "ALTER TABLE {$table} ADD COLUMN {$column} {$definition}"
            : "ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}";
        try {
            $pdo->exec($sql);
            $report['added'][] = $table . '.' . $column;
        } catch (\Throwable $e) {
            $report['failed'][] = $table . '.' . $column . ' — ' . $e->getMessage();
        }
    }
}

/* آیا اسکیمای دیتابیس باید با کد همگام شود؟ */
function eplakSchemaSyncNeeded(PDO $pdo): bool {
    try {
        return (string) eplakAppSetting($pdo, 'schema_version', '') !== EPLAK_SCHEMA_VERSION;
    } catch (\Throwable $e) {
        return true;
    }
}

/* نتیجه‌ی آخرین همگام‌سازی (برای نمایش در پنل) */
function eplakSchemaSyncReport(?array $report = null): array {
    static $last = ['ran' => false, 'added' => [], 'failed' => []];
    if ($report !== null) {
        $last = $report;
    }
    return $last;
}

/* آیا جدول ستون خواسته‌شده را دارد؟
   روی هاست‌هایی که کاربر دیتابیس اجازه‌ی ALTER ندارد، همگام‌سازی اسکیما ممکن
   است ناقص بماند؛ با این بررسی، کد به‌جای خطای «Unknown column» مسیر
   سازگار (بدون آن ستون) را انتخاب می‌کند. */
function eplakTableHasColumn(PDO $pdo, string $table, string $column): bool {
    static $cache = [];
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    try {
        if (eplakIsSqlite($pdo)) {
            $stmt = $pdo->query('PRAGMA table_info(' . $pdo->quote($table) . ')');
            foreach ($stmt->fetchAll() as $row) {
                if (strcasecmp((string) ($row['name'] ?? ''), $column) === 0) {
                    return $cache[$key] = true;
                }
            }
            return $cache[$key] = false;
        }
        $stmt = $pdo->prepare('SHOW COLUMNS FROM `' . str_replace('`', '', $table) . '` LIKE :col');
        $stmt->execute([':col' => $column]);
        return $cache[$key] = (bool) $stmt->fetch();
    } catch (\Throwable $e) {
        return $cache[$key] = false;
    }
}

/* اجرای همگام‌سازی کامل؛ $force برای دکمه‌ی «ترمیم اسکیما» در پنل تنظیمات */
function eplakRunSchemaSync(PDO $pdo, bool $force = false): array {
    $report = ['ran' => false, 'added' => [], 'failed' => []];
    if (!$force) {
        if (!eplakSchemaSyncNeeded($pdo)) {
            eplakSchemaSyncReport($report);
            return $report;
        }
        /* اگر ترمیم قبلاً شکست خورده باشد (مثلاً کاربر دیتابیس دسترسی ALTER ندارد)
           تا ۱۰ دقیقه دوباره تلاش نمی‌کنیم تا هر درخواست کند نشود. */
        try {
            if ((int) eplakAppSetting($pdo, 'schema_sync_retry_at', '0') > time()) {
                eplakSchemaSyncReport($report);
                return $report;
            }
        } catch (\Throwable $e) {
        }
    }

    $report['ran'] = true;
    foreach (eplakSchemaDdl(eplakIsSqlite($pdo) ? 'sqlite' : 'mysql') as $ddl) {
        eplakSyncTableColumns($pdo, $ddl, $report);
    }
    /* ستون‌های ویژه‌ی MySQL که تعریف‌شان در متن CREATE TABLE نیست */
    if (!eplakIsSqlite($pdo)) {
        eplakMysqlLegacyAlters($pdo, $report);
    }

    /* نسخه فقط وقتی ثبت می‌شود که هیچ ستونی جا نمانده باشد؛ وگرنه درخواست بعدی
       (با کمی تأخیر) دوباره تلاش می‌کند. */
    try {
        if (!$report['failed']) {
            eplakSetAppSetting($pdo, 'schema_version', EPLAK_SCHEMA_VERSION);
            eplakSetAppSetting($pdo, 'schema_sync_retry_at', '0');
        } else {
            eplakSetAppSetting($pdo, 'schema_sync_retry_at', (string) (time() + 600));
        }
    } catch (\Throwable $e) {
    }
    eplakSchemaSyncReport($report);
    return $report;
}

/* ── به‌روزرسانی ستون‌های نسخه‌های قدیمی MySQL ──────────────────────────
   (فقط MySQL — چون در SQLite کل اسکیما در یک‌جا ساخته/همگام می‌شود) */
function eplakMysqlLegacyAlters(PDO $pdo, array &$report): void {
    $add = static function (string $table, string $column, string $definition) use ($pdo, &$report): void {
        try {
            $found = $pdo->query("SHOW COLUMNS FROM `$table` LIKE '$column'")->fetch();
            if ($found) {
                return;
            }
            $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
            $report['added'][] = $table . '.' . $column;
        } catch (\Throwable $e) {
            $report['failed'][] = $table . '.' . $column . ' — ' . $e->getMessage();
        }
    };

    $add('reports', 'reply', 'TEXT NULL');
    $add('reports', 'department', 'VARCHAR(255) DEFAULT ""');
    $add('reports', 'sub_department', 'VARCHAR(255) DEFAULT ""');
    $add('reports', 'location', 'VARCHAR(500) DEFAULT ""');
    $add('tickets', 'category', 'VARCHAR(100) DEFAULT ""');
    $add('tickets', 'department', 'VARCHAR(255) DEFAULT ""');
    $add('tickets', 'priority', 'VARCHAR(20) DEFAULT "medium"');
    $add('departments', 'slug', 'VARCHAR(255) NULL');
    $add('departments', 'code', 'VARCHAR(50) NULL');
    $add('departments', 'description', 'TEXT NULL');
    $add('departments', 'icon', 'VARCHAR(50) NULL');
    $add('departments', 'color', 'VARCHAR(7) DEFAULT "#0f766e"');
    $add('departments', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    $add('news', 'badge', 'VARCHAR(120) NULL');
    $add('notification_sends', 'push_sent', 'INT NOT NULL DEFAULT 0');
    $add('notification_sends', 'push_failed', 'INT NOT NULL DEFAULT 0');
    $add('notification_sends', 'fcm_sent', 'INT NOT NULL DEFAULT 0');
    $add('notification_sends', 'fcm_failed', 'INT NOT NULL DEFAULT 0');
}

function eplakGetPdo(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    /* اطلاعات اتصال: اول متغیرهای محیطی، سپس فایل خصوصی shared/config.php
       (خارج از گیت — نمونه: shared/config.example.php). رمز عبور دیگر در کد نیست. */
    $fileCfg = [];
    $cfgPath = __DIR__ . '/config.php';
    if (is_file($cfgPath)) {
        $loaded = include $cfgPath;
        if (is_array($loaded)) {
            $fileCfg = $loaded;
        }
    }
    $driver = strtolower((string) (getenv('DB_DRIVER') ?: ($fileCfg['driver'] ?? 'mysql')));
    $host   = getenv('DB_HOST') ?: ($fileCfg['host'] ?? '127.0.0.1');
    $user   = getenv('DB_USER') ?: ($fileCfg['user'] ?? 'wigitali_root');
    $pass   = getenv('DB_PASS') ?: ($fileCfg['pass'] ?? '');
    $dbname = getenv('DB_NAME') ?: ($fileCfg['name'] ?? 'wigitali_eplak-db');

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];

    /* ── حالت توسعه/پیش‌نمایش: SQLite بدون نیاز به سرور MySQL ─────────────── */
    if ($driver === 'sqlite') {
        $path = getenv('DB_SQLITE_PATH') ?: ($fileCfg['sqlite_path'] ?? EPLAK_ROOT . '/data/eplak.sqlite');
        $dir  = dirname($path);
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException("ساخت مسیر دیتابیس SQLite ممکن نشد: $dir");
        }
        try {
            if (class_exists('Pdo\\Sqlite')) {
                $pdo = new Pdo\Sqlite('sqlite:' . $path, null, null, $options);
            } else {
                $pdo = new PDO('sqlite:' . $path, null, null, $options);
            }
        } catch (\Throwable $e) {
            throw new \RuntimeException('اتصال به دیتابیس SQLite برقرار نشد (' . $e->getMessage() . ').', 0, $e);
        }
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA foreign_keys=ON');
        eplakRegisterSqliteFunctions($pdo);
        eplakSqliteBootstrap($pdo);
        return $pdo;
    }

    /* ── حالت پیش‌فرض: MySQL/MariaDB ──────────────────────────────────────── */
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass, $options);
    } catch (\Throwable $e) {
        /* تلاش دوم از روی همان دیتابیس روی 127.0.0.1؛ اگر این هم شکست بخورد
           خطا را با پیام مشخص پرتاب می‌کنیم تا به‌جای «صفحه سفید»،
           صفحه‌ی خطای خوانا در admin/includes/db.php نمایش داده شود. */
        try {
            $pdo = new PDO("mysql:host=127.0.0.1;dbname=$dbname;charset=utf8mb4", $user, $pass, $options);
        } catch (\Throwable $e2) {
            throw new \RuntimeException(
                'اتصال به دیتابیس MySQL برقرار نشد (' . $e2->getMessage() . '). '
                . 'بررسی کنید: ۱) MySQL روشن باشد، ۲) دیتابیس «' . $dbname . '» وجود داشته باشد، '
                . '۳) فایل shared/config.php (کپی از shared/config.example.php) یا متغیرهای محیطی '
                . 'DB_HOST / DB_USER / DB_PASS / DB_NAME با اطلاعات درست تنظیم شده باشند، '
                . '۴) اکستنشن pdo_mysql در PHP فعال باشد. '
                . 'برای اجرا بدون سرور MySQL می‌توانید درایور sqlite را فعال کنید '
                . '(DB_DRIVER=sqlite یا driver=sqlite در shared/config.php).',
                0,
                $e2
            );
        }
    }

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS tickets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        reply TEXT,
        category VARCHAR(100) DEFAULT '',
        department VARCHAR(255) DEFAULT '',
        priority VARCHAR(20) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(20) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL DEFAULT '',
        address VARCHAR(500) DEFAULT '',
        nid VARCHAR(20) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        send_id INT NULL,
        read_flag TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS notification_sends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        target_type VARCHAR(50) NOT NULL DEFAULT 'all',
        recipients_count INT NOT NULL DEFAULT 0,
        push_sent INT NOT NULL DEFAULT 0,
        push_failed INT NOT NULL DEFAULT 0,
        fcm_sent INT NOT NULL DEFAULT 0,
        fcm_failed INT NOT NULL DEFAULT 0,
        created_by VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    /* اشتراک‌های اعلان پس‌زمینه (Web Push) — رسیدن اعلان در حالت قفل بودن گوشی
       و زمانی که کاربر داخل برنامه نیست. */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_phone VARCHAR(20) NOT NULL DEFAULT '',
        endpoint VARCHAR(500) NOT NULL,
        p256dh VARCHAR(255) NOT NULL,
        auth_key VARCHAR(255) NOT NULL,
        content_encoding VARCHAR(50) NOT NULL DEFAULT 'aes128gcm',
        user_agent VARCHAR(255) DEFAULT '',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        fail_count INT NOT NULL DEFAULT 0,
        last_error VARCHAR(255) DEFAULT '',
        last_seen_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_push_endpoint (endpoint),
        KEY idx_push_subs_phone (user_phone)
    )");

    /* «خوانده شدن» اعلان به‌ازای هر کاربر (توضیح کامل در بخش SQLite همین فایل) */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS notification_reads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        notification_id INT NOT NULL,
        user_phone VARCHAR(60) NOT NULL,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_notification_reader (notification_id, user_phone),
        KEY idx_notification_reads_notification (notification_id)
    )");

    /* «حذف اعلان» به‌ازای هر کاربر — توضیح کامل در بخش SQLite همین فایل */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS notification_deletes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        notification_id INT NOT NULL,
        user_phone VARCHAR(60) NOT NULL,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_notification_deleter (notification_id, user_phone),
        KEY idx_notification_deletes_notification (notification_id)
    )");

    /* توکن دستگاه‌های اندروید (فایربیس/FCM) — توضیح کامل در بخش SQLite همین فایل */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS device_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_phone VARCHAR(20) NOT NULL DEFAULT '',
        token VARCHAR(400) NOT NULL,
        platform VARCHAR(20) NOT NULL DEFAULT 'android',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        fail_count INT NOT NULL DEFAULT 0,
        last_error VARCHAR(255) DEFAULT '',
        last_seen_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_device_token (token),
        KEY idx_device_tokens_phone (user_phone)
    )");

    /* دفتر ارسال اعلان گوشی (نتیجه‌ی هر ارسال؛ برای عیب‌یابی در پنل ادمین) */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS push_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        notification_id INT NOT NULL DEFAULT 0,
        user_phone VARCHAR(20) NOT NULL DEFAULT '',
        kind VARCHAR(30) NOT NULL DEFAULT '',
        code VARCHAR(40) NOT NULL DEFAULT '',
        title VARCHAR(250) NOT NULL DEFAULT '',
        channel VARCHAR(20) NOT NULL DEFAULT 'fcm',
        devices INT NOT NULL DEFAULT 0,
        sent INT NOT NULL DEFAULT 0,
        failed INT NOT NULL DEFAULT 0,
        outcome VARCHAR(30) NOT NULL DEFAULT '',
        error VARCHAR(400) NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_push_log_phone (user_phone),
        KEY idx_push_log_code (code)
    )");

    /* فایل‌های پیوست گزارش‌ها (عکس و فیلم ارسالی شهروند) */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS report_media (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_id INT NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'image',
        file_path VARCHAR(500) NOT NULL,
        original_name VARCHAR(255) DEFAULT '',
        mime_type VARCHAR(100) DEFAULT '',
        size_bytes INT NOT NULL DEFAULT 0,
        client_ref VARCHAR(64) DEFAULT '' ,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_report_media_report (report_id)
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS report_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_id INT NOT NULL,
        type VARCHAR(40) NOT NULL DEFAULT 'note',
        title VARCHAR(200) NOT NULL DEFAULT '',
        body TEXT DEFAULT '',
        actor VARCHAR(40) NOT NULL DEFAULT 'system',
        status VARCHAR(30) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_report_events_report (report_id)
    )");

    /* تنظیمات کلید/مقدار برنامه (کلیدهای VAPID و …) */
    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        department VARCHAR(255) DEFAULT '',
        sub_department VARCHAR(255) DEFAULT '',
        location VARCHAR(500) DEFAULT '',
        lat DECIMAL(10,7) NULL,
        lng DECIMAL(10,7) NULL,
        location_accuracy DECIMAL(8,2) NULL,
        status VARCHAR(50) DEFAULT 'pending',
        reply TEXT,
        client_ref VARCHAR(64) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_reports_client_ref (client_ref)
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS news (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(20) NOT NULL DEFAULT 'news',
        title VARCHAR(255) NOT NULL,
        summary TEXT NULL,
        body TEXT NOT NULL,
        icon VARCHAR(50) NULL,
        badge VARCHAR(120) NULL,
        image_url VARCHAR(500) NULL,
        published TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    eplakCreateTable($pdo, "CREATE TABLE IF NOT EXISTS departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_id INT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        slug VARCHAR(255) NULL,
        code VARCHAR(50) NULL,
        description TEXT NULL,
        icon VARCHAR(50) NULL,
        color VARCHAR(7) DEFAULT '#0f766e',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_department_name_parent (name, parent_id),
        KEY idx_department_parent (parent_id),
        CONSTRAINT fk_department_parent FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE CASCADE
    )");

    /* ارتقای اسکیمای دیتابیس‌های قدیمی: ستون‌های تازه (مثل notifications.send_id)
       به‌صورت خودکار اضافه می‌شوند — بدون این کار روی دیتابیس قدیمی خطای
       «Unknown column» رخ می‌داد. */
    eplakRunSchemaSync($pdo);

    eplakSeedDefaultDepartments($pdo);
    eplakSeedDefaultAdmin($pdo);
    eplakSeedDefaultNews($pdo);

    return $pdo;
}
