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
    define('EPLAK_PAYAMAK_TEMPLATE_DEFAULT', '552115');
}

/* نشانیِ سرویس ارسالِ ملی پیامک. درخواستِ واقعی در api/auth.php ساخته می‌شود؛
   این ثابت برای مستندسازی و گزارش‌های تشخیصی (api/status.php) است. */
if (!defined('EPLAK_PAYAMAK_ENDPOINT')) {
    define('EPLAK_PAYAMAK_ENDPOINT', 'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber');
}

if (!function_exists('eplakPayamakDefaultTemplate')) {
    /** شناسه‌ی متنِ پیش‌فرض (bodyId) — «552115» */
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

if (!function_exists('eplakPayamakPasswordSet')) {
    /** آیا رمز پنل تنظیم شده است؟ (خودِ رمز هرگز برگردانده نمی‌شود) */
    function eplakPayamakPasswordSet(array $config = []): bool
    {
        $fromEnv = getenv('PAYAMAK_PASSWORD');
        if ($fromEnv !== false && trim((string) $fromEnv) !== '') {
            return true;
        }
        return trim((string) ($config['payamak_password'] ?? '')) !== '';
    }
}

if (!function_exists('eplakPayamakTemplateId')) {
    /** شناسه‌ی مؤثرِ «متن تأییدشده»: محیطی ← config.php ← پیش‌فرضِ 552115 */
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
