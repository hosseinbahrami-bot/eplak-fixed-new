<?php
/* ============================================================================
   shared/payamak.php — «ملی پیامک» (rest.payamak-panel.com)
   ----------------------------------------------------------------------------
   تنها ارائه‌دهنده‌ی پیامکِ پروژه برای ارسال «کد تایید» ورود.

   چرا این فایل؟
     پیش‌تر دو مسیر پشتیبانی می‌شد: ملی پیامک و (به‌عنوان چاره‌ی آخر) آموت‌اس‌ام‌اس.
     به درخواست کارفرما آموت **کاملاً حذف** شد تا یک مسیرِ روشن بماند و روی هاست
     تازه هیچ‌کس نداند پیامک از کجا می‌رود. حالا همه‌ی مقدارهای مشترک یک‌جا این‌جا
     تعریف می‌شوند تا api/auth.php (فرستنده)، api/status.php (تشخیص) و setup.php
     (راه‌انداز) هر سه دقیقاً یک چیز بگویند.

   چه چیزی این‌جاست؟
     EPLAK_PAYAMAK_TEMPLATE_DEFAULT = شناسه‌ی «متن تأییدشده» (bodyId) پیش‌فرض
     EPLAK_PAYAMAK_ENDPOINT         = نشانیِ سرویس ارسال (فقط مستندسازی/تشخیص)
     eplakPayamakDefaultTemplate()  = همان شناسه‌ی پیش‌فرض
     eplakPayamakTemplateId($cfg)   = شناسه‌ی مؤثر: محیطی ← config.php ← پیش‌فرض
     eplakPayamakReady($cfg)        = آیا «کد تایید» همین حالا ارسال می‌شود؟
     eplakPayamakPartial($cfg)      = تنظیمات نیمه‌کاره است (مثلاً فقط نام کاربری)

   امنیت:
     این فایل هیچ نام کاربری یا رمزی را در خودش ندارد و هیچ رمزی را برنمی‌گرداند
     (فقط «هست/نیست»). مقدارها از متغیرهای محیطی یا shared/config.php خوانده
     می‌شوند که آن فایل عمداً خارج از گیت و خارج از بسته‌ی آپلود است.
   ============================================================================ */

/* شناسه‌ی «متن تأییدشده» (bodyId) در پنل ملی پیامک.
   اگر در shared/config.php یا متغیر محیطی PAYAMAK_TEMPLATE_ID مقدار دیگری باشد،
   همان برنده است؛ این فقط پیش‌فرض است تا روی هاست تازه «کد تایید» بی‌دلیل از
   کار نیفتد (شکایت واقعی: «ارسال کد تایید انجام نشد»). */
if (!defined('EPLAK_PAYAMAK_TEMPLATE_DEFAULT')) {
    define('EPLAK_PAYAMAK_TEMPLATE_DEFAULT', '573639');
}

/* نشانیِ سرویس ارسالِ ملی پیامک. درخواستِ واقعی در api/auth.php ساخته می‌شود؛
   این ثابت برای مستندسازی و گزارش‌های تشخیصی (api/status.php) است. */
if (!defined('EPLAK_PAYAMAK_ENDPOINT')) {
    define('EPLAK_PAYAMAK_ENDPOINT', 'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber');
}

if (!function_exists('eplakPayamakDefaultTemplate')) {
    /** شناسه‌ی متنِ پیش‌فرض (bodyId) — «573639» */
    function eplakPayamakDefaultTemplate(): string
    {
        return (string) EPLAK_PAYAMAK_TEMPLATE_DEFAULT;
    }
}

if (!function_exists('eplakPayamakUsername')) {
    /** نام کاربری پنل ملی پیامک (محیطی بر config.php برتری دارد) */
    function eplakPayamakUsername(array $config = []): string
    {
        return trim((string) (getenv('PAYAMAK_USERNAME') ?: ($config['payamak_username'] ?? '')));
    }
}

/* ── کلید API در برابرِ رمز عبورِ پنل ──────────────────────────────────────
   ریشه‌ی واقعیِ «کد تایید نمی‌آید» روی هاستِ کارفرما همین بود: ملی پیامک در
   وب‌سرویسِ خود به‌جای «رمز عبور پنل»، «کلید API» (ApiKey) می‌خواهد و اگر رمز
   پنل فرستاده شود پاسخ RetStatus=-110 («الزام استفاده از ApiKey به‌جای رمز
   عبور») می‌دهد. برای اینکه این اشتباه دیگر تکرار نشود:
     • کلیدِ اصلی و صریح:  payamak_api_key   (متغیر محیطی PAYAMAK_API_KEY)
     • کلیدِ قدیمیِ هاست:  payamak_password  (متغیر محیطی PAYAMAK_PASSWORD)
   ترتیبِ خواندن: محیطیِ کلید API ← فایلِ کلید API ← محیطیِ رمز ← فایلِ رمز.
   یعنی تنظیمی که کارفرما پیش‌تر با payamak_password درست کرده بود، بی‌آنکه
   چیزی را عوض کند کار می‌کند؛ ولی از این پس جایِ درست و نامِ درست دارد.
   هیچ‌کدام از این تابع‌ها مقدارِ کلید را برنمی‌گردانند به‌جز «جایی که از آن
   خوانده شد» — چون خودِ کلید مثلِ رمز عبور است و نباید در صفحه/گزارش بیاید. */
if (!function_exists('eplakPayamakSecretSource')) {
    /** کلید از کجا آمده؟ 'api_key' | 'password' | '' (هیچ‌کدام) */
    function eplakPayamakSecretSource(array $config = []): string
    {
        $envKey = getenv('PAYAMAK_API_KEY');
        if ($envKey !== false && trim((string) $envKey) !== '') {
            return 'api_key';
        }
        if (trim((string) ($config['payamak_api_key'] ?? '')) !== '') {
            return 'api_key';
        }
        $envPass = getenv('PAYAMAK_PASSWORD');
        if ($envPass !== false && trim((string) $envPass) !== '') {
            return 'password';
        }
        if (trim((string) ($config['payamak_password'] ?? '')) !== '') {
            return 'password';
        }
        return '';
    }
}

if (!function_exists('eplakPayamakSecret')) {
    /**
     * مقدارِ مؤثری که در فیلد passwordِ وب‌سرویس فرستاده می‌شود.
     * با ملی پیامک این مقدار باید «کلید API» باشد؛ اگر فقط رمزِ قدیمی در
     * تنظیمات باشد، همان خوانده می‌شود (سازگاری با هاستِ فعلی).
     */
    function eplakPayamakSecret(array $config = []): string
    {
        $candidates = [
            getenv('PAYAMAK_API_KEY'),
            $config['payamak_api_key'] ?? '',
            getenv('PAYAMAK_PASSWORD'),
            $config['payamak_password'] ?? '',
        ];
        foreach ($candidates as $value) {
            if ($value === false || $value === null) {
                continue;
            }
            $value = trim((string) $value);
            if ($value !== '') {
                return $value;
            }
        }
        return '';
    }
}

if (!function_exists('eplakPayamakPasswordSet')) {
    /**
     * آیا «کلید/رمز» پنل تنظیم شده است؟ (خودِ مقدار هرگز برگردانده نمی‌شود)
     * نامِ تابع برای سازگاری با setup.php و api/status.php حفظ شده است.
     */
    function eplakPayamakPasswordSet(array $config = []): bool
    {
        return eplakPayamakSecret($config) !== '';
    }
}

if (!function_exists('eplakPayamakSecretLabel')) {
    /** برچسبِ خوانا برای پنل/گزارش: از کدام کلید استفاده می‌شود و درست است یا نه */
    function eplakPayamakSecretLabel(array $config = []): string
    {
        $source = eplakPayamakSecretSource($config);
        if ($source === 'api_key') {
            return 'کلید API (payamak_api_key) — درست';
        }
        if ($source === 'password') {
            return 'رمزِ قدیمی (payamak_password) — ملی پیامک ممکن است با خطای ۱۱۰- رد کند؛ بهتر است «کلید API» را در shared/config.php بگذارید';
        }
        return 'تنظیم نشده';
    }
}

if (!function_exists('eplakPayamakTemplateId')) {
    /** شناسه‌ی مؤثرِ «متن تأییدشده»: محیطی ← config.php ← پیش‌فرضِ 573639 */
    function eplakPayamakTemplateId(array $config = []): string
    {
        $template = trim((string) (getenv('PAYAMAK_TEMPLATE_ID') ?: ($config['payamak_template_id'] ?? '')));
        return $template !== '' ? $template : eplakPayamakDefaultTemplate();
    }
}

if (!function_exists('eplakPayamakTemplateRaw')) {
    /** همان شناسه ولی «بدون» پیش‌فرض — برای اینکه بفهمیم کاربر خودش وارد کرده یا نه */
    function eplakPayamakTemplateRaw(array $config = []): string
    {
        return trim((string) (getenv('PAYAMAK_TEMPLATE_ID') ?: ($config['payamak_template_id'] ?? '')));
    }
}

if (!function_exists('eplakPayamakReady')) {
    /**
     * آیا ارسال «کد تایید» با ملی پیامک همین حالا ممکن است؟
     * نام کاربری + رمز + شناسه‌ی رقمی (که با پیش‌فرض همیشه رقمی است).
     */
    function eplakPayamakReady(array $config = []): bool
    {
        return eplakPayamakUsername($config) !== ''
            && eplakPayamakPasswordSet($config)
            && preg_match('/^\d+$/', eplakPayamakTemplateId($config)) === 1;
    }
}

if (!function_exists('eplakPayamakPartial')) {
    /**
     * تنظیمات نیمه‌کاره است؟ مثلاً فقط نام کاربری وارد شده و رمز نه.
     * این حالت از «هیچ» بدتر است، چون کاربر فکر می‌کند کار تمام است؛ پس
     * api/status.php و setup.php آن را جدا گزارش می‌کنند.
     */
    function eplakPayamakPartial(array $config = []): bool
    {
        if (eplakPayamakReady($config)) {
            return false;
        }
        return eplakPayamakUsername($config) !== ''
            || eplakPayamakPasswordSet($config)
            || eplakPayamakTemplateRaw($config) !== '';
    }
}

/* ── ترجمه‌ی فارسیِ پاسخِ ملی پیامک ────────────────────────────────────────
   ملی پیامک در پاسخِ وب‌سرویس سه مقدار می‌دهد:
     RetStatus    = کدِ عددیِ وضعیت (۱ یعنی موفق)
     StrRetStatus = توضیحِ متنیِ همان کد (گاهی فارسی، گاهی انگلیسی)
     Value        = در موفقیت «شناسه‌ی رکورد ارسال» (عددِ بلند) و در شکست،
                    دوباره همان کدِ خطا
   پیش‌تر فقط «RetStatus=1 یا نه» نگاه می‌شد و در error_log هم تنها یک عددِ
   خام می‌آمد؛ برای همین پیدا کردنِ دلیلِ «کد تایید نمی‌آید» روی هاست ساعت‌ها
   طول می‌کشید. حالا هر کد، توضیحِ فارسی و «چه‌کار باید کرد» دارد. */
if (!function_exists('eplakPayamakStatusText')) {
    /**
     * توضیحِ فارسیِ کدِ وضعیتِ ملی پیامک.
     * منبع: مستندات رسمی «فهرست خطاهای وب‌سرویس پیامک» و راهنمای SendByBaseNumber.
     * اگر کد ناشناخته باشد رشته‌ی خالی برمی‌گردد.
     */
    function eplakPayamakStatusText(string $code): string
    {
        /* رقم‌های فارسی/عربی به لاتین، تا «۱-» و «-1» یکی دیده شوند */
        $code = str_replace(
            ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹','٠','١','٢','٣','٤','٥','٦','٧','٨','٩',' ','+'],
            ['0','1','2','3','4','5','6','7','8','9','0','1','2','3','4','5','6','7','8','9','',''],
            $code
        );
        $code = trim($code);
        $table = [
            '1'    => 'موفق — پیامک به صف ارسال رفت (Value = شناسه‌ی رکورد ارسال است)',
            '0'    => 'نام کاربری یا کلید API اشتباه است',
            '-1'   => 'وب‌سرویسِ «الگوی تأییدشده» (pattern) روی پنل غیرفعال است',
            '-2'   => 'در هر درخواست فقط یک شماره مجاز است',
            '-3'   => 'خطِ ارسال‌کننده تعریف نشده است',
            '-4'   => 'شناسه‌ی متن (bodyId) اشتباه یا هنوز تأیید نشده است',
            '-5'   => 'متنِ ارسالی با متغیرهای الگوی تأییدشده مطابقت ندارد',
            '-6'   => 'سامانه در حال به‌روزرسانی است؛ چند دقیقه بعد دوباره تلاش کنید',
            '-7'   => 'خطِ ارسال‌کننده (شماره‌ی مبدأ) نامعتبر است',
            '-8'   => 'ارسال خارج از بازه‌ی مجازِ ۰۷:۰۰ تا ۲۲:۰۰ است',
            '-9'   => 'زمانِ درخواست برای ارسال در گذشته است',
            '-10'  => 'ارتباطی بین متن و متغیرهای الگو پیدا نشد',
            '-108' => 'IP سرور مسدود شده است',
            '-109' => 'محدودسازی IP فعال است و IP سرور در فهرست مجاز نیست',
            '-110' => 'باید به‌جای «رمز عبور پنل»، «کلید API» فرستاده شود',
            '-111' => 'IP نامعتبر است (سرور از IP ناشناس درخواست می‌دهد)',
            '2'    => 'اعتبارِ پنلِ پیامک کافی نیست (باید شارژ شود)',
            '6'    => 'سامانه در حال به‌روزرسانی است',
            '7'    => 'شماره یا کلمه در فهرستِ فیلترِ پنل است',
            '10'   => 'کاربرِ پنل غیرفعال است',
            '11'   => 'ارسال انجام نشد (خطای عمومیِ سمت پنل)',
            '12'   => 'مدارکِ پنل ناقص است و خط فعال نشده',
            '19'   => 'سقفِ ارسالِ ساعتی پر شده است',
            '35'   => 'شماره‌ی گیرنده در لیست سیاه مخابرات است (امکان ارسال نیست)',
        ];
        return $table[$code] ?? '';
    }
}

if (!function_exists('eplakPayamakExplain')) {
    /**
     * پاسخِ ملی پیامک را به یک گزارشِ فارسیِ قابلِ اقدام تبدیل می‌کند.
     *
     * @param mixed  $payload   خروجیِ json_decode (معمولاً آرایه)
     * @param int    $http      کدِ HTTP پاسخ
     * @param string $curlError خطای cURL (در صورت وجود)
     * @return array{ok:bool,status:string,text:string,str:string,value:string,
     *               fa:string,hint:string,log:string}
     */
    function eplakPayamakExplain($payload, int $http = 0, string $curlError = ''): array
    {
        $data = is_array($payload) ? $payload : [];
        $status = trim((string) ($data['RetStatus'] ?? ''));
        $str = trim((string) ($data['StrRetStatus'] ?? ''));
        $value = trim((string) ($data['Value'] ?? ''));
        $ok = ($status === '1');

        /* در شکست، گاهی کدِ واقعی در Value می‌آید (REST ملی پیامک این‌طور است) */
        $code = $status !== '' ? $status : $value;
        $text = eplakPayamakStatusText($code);

        /* پیامِ کاربر: کوتاه و بدون جزئیاتِ فنی — همان چیزی که در اپ دیده می‌شود */
        $fa = 'ارسال کد پیامکی انجام نشد؛ لطفاً کمی بعد دوباره تلاش کنید.';
        $hint = '';
        if ($curlError !== '') {
            $fa = 'اتصال سرور به سامانه‌ی پیامک برقرار نشد؛ لطفاً کمی بعد دوباره تلاش کنید.';
            $hint = 'خطای اتصال (cURL): ' . $curlError;
        } elseif ($http > 0 && ($http < 200 || $http >= 300)) {
            $fa = 'سامانه‌ی پیامک پاسخِ غیرمنتظره داد (HTTP ' . $http . ')؛ کمی بعد دوباره تلاش کنید.';
            $hint = 'کدِ HTTP پاسخ: ' . $http;
        } elseif ($ok) {
            $fa = 'کد تایید با موفقیت ارسال شد.';
            $hint = $text;
        } elseif ($code === '-110' || $code === '0') {
            $fa = 'کلیدِ دسترسیِ پنل پیامک پذیرفته نشد؛ مدیر سایت باید «کلید API» را در تنظیمات بگذارد.';
            $hint = ($text !== '' ? $text : 'کلید/نام کاربری رد شد')
                . ' — کلید API از «پنل ملی پیامک ← توسعه‌دهندگان ← تنظیمات وب‌سرویس» کپی و در'
                . ' shared/config.php با نام payamak_api_key ذخیره می‌شود.';
        } elseif ($code === '-109' || $code === '-111' || $code === '-108') {
            $fa = 'سامانه‌ی پیامک، IP سرور را نپذیرفت؛ مدیر سایت باید IP را در پنل پیامک مجاز کند.';
            $hint = ($text !== '' ? $text : 'IP رد شد')
                . ' — در پنل ملی پیامک: «تنظیمات وب‌سرویس ← IPهای مجاز»، IP سرور را اضافه کنید'
                . ' (یا محدودسازی IP را خاموش کنید).';
        } elseif ($code === '-4' || $code === '-5' || $code === '-1' || $code === '-10' || $code === '-3' || $code === '-7') {
            $fa = 'الگوی پیامکِ «کد تایید» در پنل پیامک تأیید نشده است؛ مدیر سایت باید شناسه‌ی متن را بررسی کند.';
            $hint = ($text !== '' ? $text : 'الگو/خط رد شد')
                . ' — شناسه‌ی متن (bodyId) پیش‌فرضِ پروژه ' . eplakPayamakDefaultTemplate() . ' است؛'
                . ' اگر الگوی دیگری تأیید شده، همان را در shared/config.php (payamak_template_id) بگذارید.';
        } elseif ($code === '2') {
            $fa = 'اعتبارِ پنلِ پیامک تمام شده است؛ لطفاً بعداً دوباره تلاش کنید.';
            $hint = 'پنل ملی پیامک باید شارژ شود.';
        } elseif ($code === '35' || $code === '7') {
            $fa = 'برای این شماره امکانِ دریافت پیامک وجود ندارد (لیست سیاه مخابرات).';
            $hint = 'شماره در لیست سیاه است؛ با شماره‌ی دیگری امتحان کنید.';
        } elseif ($code === '-8') {
            $fa = 'ارسال پیامک در این ساعت مجاز نیست (۰۷:۰۰ تا ۲۲:۰۰).';
            $hint = 'بازه‌ی مجازِ ارسالِ پنل ملی پیامک ۰۷:۰۰ تا ۲۲:۰۰ است.';
        } elseif ($code === '19') {
            $fa = 'سقفِ ارسالِ پیامک در این ساعت پر شده است؛ کمی بعد دوباره تلاش کنید.';
            $hint = 'محدودیتِ ساعتیِ پنل پر شده است.';
        } elseif ($code === '-6' || $code === '6') {
            $fa = 'سامانه‌ی پیامک در حال به‌روزرسانی است؛ چند دقیقه دیگر دوباره تلاش کنید.';
            $hint = 'پنل ملی پیامک در حال به‌روزرسانی است.';
        } elseif ($text !== '') {
            $fa = 'سامانه‌ی پیامک کد را ارسال نکرد: ' . $text;
            $hint = $text;
        } elseif ($str !== '') {
            $fa = 'سامانه‌ی پیامک کد را ارسال نکرد: ' . $str;
        }

        /* یک خطِ گزارش برای error_log هاست — بدون هیچ کلید/رمزی */
        $logParts = ['[eplak-sms]'];
        $logParts[] = 'http=' . ($http > 0 ? (string) $http : 'n/a');
        $logParts[] = 'ret=' . ($status !== '' ? $status : 'n/a');
        if ($str !== '') {
            $logParts[] = 'str=' . $str;
        }
        if ($value !== '') {
            /* در موفقیت Value شناسه‌ی رکورد است؛ در شکست، کدِ خطا */
            $logParts[] = ($ok ? 'rec_id=' : 'value=') . $value;
        }
        if ($text !== '') {
            $logParts[] = 'fa=' . $text;
        }
        if ($curlError !== '') {
            $logParts[] = 'curl=' . $curlError;
        }
        if (!$ok && $status === '' && $value === '' && $str === '') {
            $logParts[] = 'raw=' . (is_array($payload) ? json_encode($payload, JSON_UNESCAPED_UNICODE) : (string) $payload);
        }

        return [
            'ok'     => $ok,
            'status' => $status,
            'text'   => $text,
            'str'    => $str,
            'value'  => $value,
            'fa'     => $fa,
            'hint'   => $hint,
            'log'    => implode(' ', $logParts),
        ];
    }
}

if (!function_exists('eplakPayamakSendCode')) {
    /**
     * تنها تابعِ ارسالِ پیامکِ پروژه (هم «کد تایید» ورود و هم «پیامک آزمایشی»
     * پنل ادمین از همین یک مسیر می‌روند تا نتیجه‌ی آزمایش دقیقاً همان چیزی باشد
     * که کاربر تجربه می‌کند).
     *
     * @param array  $config   آرایه‌ی shared/config.php
     * @param string $to       شماره‌ی مقصد (09xxxxxxxxx)
     * @param string $code     متنِ جایگزینِ الگو — برای «کد تایید» همان ۴ رقم است
     * @param array  $override اگر api/auth.php مقدارها را خودش خوانده، همان‌ها برنده‌اند:
     *                         ['username'=>…, 'secret'=>…, 'bodyId'=>…]
     * @return array شامل ok, http, raw, curl_error, payload, to, body_id, secret_source +
     *               همه‌ی کلیدهای eplakPayamakExplain (fa/hint/log/…)
     */
    function eplakPayamakSendCode(array $config, string $to, string $code, array $override = []): array
    {
        $username = isset($override['username']) ? trim((string) $override['username']) : eplakPayamakUsername($config);
        $secret = isset($override['secret']) ? trim((string) $override['secret']) : eplakPayamakSecret($config);
        $bodyId = isset($override['bodyId']) ? trim((string) $override['bodyId']) : eplakPayamakTemplateId($config);
        $source = eplakPayamakSecretSource($config);
        if (isset($override['secret']) && $source === '') {
            $source = 'override';
        }

        $result = [
            'ok' => false, 'status' => '', 'text' => '', 'str' => '', 'value' => '',
            'fa' => '', 'hint' => '', 'log' => '',
            'http' => 0, 'raw' => '', 'curl_error' => '', 'payload' => [],
            'to' => $to, 'body_id' => $bodyId, 'secret_source' => $source,
            'rec_id' => '',
        ];

        /* شماره‌ی مقصد در گزارش‌ها پوشیده می‌شود (داده‌ی شخصیِ شهروند است) */
        $masked = strlen($to) > 6 ? (substr($to, 0, 4) . '***' . substr($to, -3)) : '***';

        if (!function_exists('curl_init')) {
            $result['fa'] = 'امکانِ اتصال به سامانه‌ی پیامک روی سرور فعال نیست.';
            $result['hint'] = 'ماژول cURL در PHP فعال نیست (php -m | grep curl).';
            $result['log'] = '[eplak-sms] curl extension missing; nothing sent to ' . $masked;
            return $result;
        }
        if ($username === '' || $secret === '') {
            $result['fa'] = 'پنل ملی پیامک تنظیم نشده است؛ نام کاربری و «کلید API» را در setup.php وارد کنید.';
            $result['hint'] = 'نام کاربری یا کلید API خالی است.';
            $result['log'] = '[eplak-sms] credentials missing (username=' . ($username !== '' ? 'set' : 'empty')
                . ' secret=' . ($secret !== '' ? 'set' : 'empty') . '); nothing sent';
            return $result;
        }
        if (preg_match('/^\d+$/', $bodyId) !== 1) {
            $result['fa'] = 'شناسه‌ی متنِ تأییدشده (bodyId) باید فقط رقم باشد.';
            $result['hint'] = 'مقدار فعلی: ' . ($bodyId === '' ? '(خالی)' : $bodyId);
            $result['log'] = '[eplak-sms] invalid bodyId; nothing sent';
            return $result;
        }
        if (preg_match('/^09\d{9}$/', $to) !== 1) {
            $result['fa'] = 'شماره‌ی موبایل معتبر نیست (باید با 09 شروع شود و ۱۱ رقم باشد).';
            $result['hint'] = 'شماره‌ی واردشده پذیرفته نشد.';
            $result['log'] = '[eplak-sms] invalid destination number; nothing sent';
            return $result;
        }

        /* شکلِ درخواست: همان چیزی که ملی پیامک برای «الگوی تأییدشده» می‌خواهد.
           فیلد password عمداً همان نام را دارد (وب‌سرویس این‌طور تعریف شده) ولی
           مقدارش «کلید API» است. */
        $request = [
            'username' => $username,
            'password' => $secret,
            'text'     => (string) $code,
            'to'       => $to,
            'bodyId'   => $bodyId,
        ];

        $curl = curl_init(EPLAK_PAYAMAK_ENDPOINT);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER => ['content-type: application/x-www-form-urlencoded'],
            CURLOPT_POSTFIELDS => http_build_query($request),
            CURLOPT_TIMEOUT => 20,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);
        $raw = curl_exec($curl);
        $curlError = (string) curl_error($curl);
        $http = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);

        $result['http'] = $http;
        $result['curl_error'] = $curlError;
        $result['raw'] = is_string($raw) ? $raw : '';
        $payload = ($raw === false || $raw === null || $raw === '') ? [] : json_decode((string) $raw, true);
        $result['payload'] = is_array($payload) ? $payload : [];

        $explained = eplakPayamakExplain($result['payload'], $http, $curlError);
        foreach ($explained as $key => $value2) {
            $result[$key] = $value2;
        }
        $result['rec_id'] = $explained['ok'] ? $explained['value'] : '';

        /* گزارشِ یک‌خطی برای error_log: مقصدِ پوشیده + شناسه‌ی متن + نتیجه‌ی فارسی.
           هیچ کلید/رمزی اینجا نوشته نمی‌شود. */
        $result['log'] .= ' to=' . $masked . ' bodyId=' . $bodyId . ' secret=' . $source;

        return $result;
    }
}
