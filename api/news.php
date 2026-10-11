<?php
/* api/news.php — دریافت اخبار و دانستنی‌ها برای اپلیکیشن
   خروجی به‌صورت زنده از پایگاه داده خوانده می‌شود؛ هر تغییری در پنل ادمین
   بلافاصله در اپ نمایش داده می‌شود.

   پارامترها (اختیاری):
     type  = news | tip | all
     limit = تعداد (پیش‌فرض ۵۰)

   ────────────────────────────────────────────────────────────────────────────
   چرا این فایل بازنویسی شد؟ (ریشه‌ی باگ «اخبار و اطلاعیه‌ها خالی است»)
   پیش از این، SELECT «همیشه» ستون badge را می‌خواست و هر خطا با پاسخ ۵۰۰
   بیرون می‌رفت. روی دیتابیس قدیمیِ هاست (دامپ backend/eplak-db.sql بدون ستون
   badge، یا دامپ DBasli که اصلاً جدول news ندارد) یعنی:
       app → fetch news.php → HTTP 500 → هیچ خبری و هیچ دانستنی‌ای نمایش نمی‌شد
   حالا:
     ۱) ساختار جدول «همان لحظه» بررسی و در صورت امکان ترمیم می‌شود
        (eplakNewsSchema: ساخت جدول، افزودن ستون‌های نبوده، تبدیل به utf8mb4)
     ۲) SQL فقط با ستون‌های «موجود» ساخته می‌شود
     ۳) پاسخ هرگز ۵۰۰ نیست: در بدترین حالت ۲۰۰ با success=false و
        «degraded» + «hint» فارسی برمی‌گردد تا اپ محتوای پیش‌فرض خودش را نشان دهد
     ۴) اگر جدول خالی باشد، محتوای پیش‌فرض یک‌بار درج می‌شود (eplakSeedDefaultNews)
     ۵) برای تصویرِ آپلودشده در پنل (uploads/news/…) نشانی مطلق هم برمی‌گردد
        (image_abs)؛ چون اپ صفحه را از file:// باز می‌کند و آدرس نسبی در آن
        به فایل‌های داخل گوشی اشاره می‌کند، نه به سرور.
   ────────────────────────────────────────────────────────────────────────────
*/

/* اگر اتصال دیتابیس برقرار نشد، db.php صفحه‌ی HTML خطا می‌دهد؛ برای API همان
   خطا را JSON می‌خواهیم تا اپ بتواند درست تصمیم بگیرد. */
$_SERVER['HTTP_X_REQUESTED_WITH'] = 'XMLHttpRequest';
require_once __DIR__ . '/_common.php';

eplakApiHeaders();

$type  = strtolower(trim((string) ($_GET['type'] ?? 'all')));
$limit = (int) ($_GET['limit'] ?? 50);
if ($limit < 1) {
    $limit = 50;
}
if ($limit > 200) {
    $limit = 200;
}

/** نشانی مطلق برای تصویرهای نسبی (uploads/news/…) — برای اپِ file:// */
function eplakNewsAbsoluteImage(string $path): string {
    $path = trim($path);
    if ($path === '') {
        return '';
    }
    if (preg_match('#^(https?:)?//#i', $path) || strpos($path, 'data:') === 0 || strpos($path, 'blob:') === 0) {
        return $path;
    }
    /* assets/… داخل بسته‌ی اپ هم هست؛ همان نسبی بماند تا آفلاین کار کند */
    if (strpos($path, 'assets/') === 0 || strpos($path, '/assets/') === 0) {
        return $path;
    }
    $https = (($_SERVER['HTTPS'] ?? '') === 'on') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host  = (string) ($_SERVER['HTTP_HOST'] ?? '');
    $script = (string) ($_SERVER['SCRIPT_NAME'] ?? '');
    if ($host === '') {
        return $path;
    }
    /* /eplak-fixed/api/news.php → /eplak-fixed */
    $base = str_replace('\\', '/', dirname($script, 2));
    $base = rtrim($base === '/' || $base === '.' ? '' : $base, '/');
    return ($https ? 'https://' : 'http://') . $host . $base . '/' . ltrim($path, '/');
}

$fail = static function (array $degraded, string $hint, string $reason = ''): void {
    $payload = [
        'success' => false,
        'count'   => 0,
        'items'   => [],
        'news'    => [],
        'tips'    => [],
        'degraded' => $degraded,
        'hint'    => $hint,
    ];
    if ($reason !== '') {
        $payload['reason'] = $reason;
    }
    eplakJson($payload, 200);
};

try {
    /* ۱) سلامت جدول: ساخت/افزودن ستون/utf8mb4 — همان لحظه، همان درخواست */
    $schema = eplakNewsSchema($pdo);
    if (!$schema['table']) {
        $fail(
            ['no_table'],
            'جدول اخبار در دیتابیس وجود ندارد و ساخته نشد. در پنل مدیریت → تنظیمات، «تعمیر ساختار دیتابیس» را بزنید.',
            implode(' | ', $schema['failed'])
        );
    }

    /* ۲) اگر جدول خالی است، محتوای پیش‌فرض یک‌بار درج می‌شود */
    $seedReport = null;
    eplakSeedDefaultNews($pdo, $seedReport);

    /* ۳) SELECT فقط با ستون‌های موجود */
    $wanted  = ['id', 'type', 'title', 'summary', 'body', 'icon', 'badge', 'image_url', 'sort_order', 'updated_at'];
    $columns = [];
    foreach ($wanted as $column) {
        if ($column === 'id' || eplakNewsHasColumn($pdo, $column)) {
            $columns[] = $column;
        }
    }
    if (!in_array('title', $columns, true)) {
        $fail(['no_title_column'], 'ستون عنوان در جدول اخبار در دسترس نیست؛ ساختار دیتابیس را از پنل → تنظیمات تعمیر کنید.');
    }

    $where  = '';
    $params = [];
    if (eplakNewsHasColumn($pdo, 'published')) {
        $where = 'WHERE published = 1';
    }
    if (($type === 'news' || $type === 'tip') && eplakNewsHasColumn($pdo, 'type')) {
        $where .= ($where === '' ? 'WHERE ' : ' AND ') . 'type = :type';
        $params[':type'] = $type;
    }
    $order = in_array('sort_order', $columns, true) ? 'sort_order ASC, id DESC' : 'id DESC';

    $stmt = $pdo->prepare(
        'SELECT ' . implode(', ', $columns) . " FROM news $where ORDER BY $order LIMIT $limit"
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $hasBadge = in_array('badge', $columns, true);
    $hasImage = in_array('image_url', $columns, true);
    $hasSumm  = in_array('summary', $columns, true);
    $hasIcon  = in_array('icon', $columns, true);
    $hasSort  = in_array('sort_order', $columns, true);
    $hasUpd   = in_array('updated_at', $columns, true);
    $hasType  = in_array('type', $columns, true);

    $items = [];
    foreach ($rows as $row) {
        $rowType = $hasType ? (string) ($row['type'] ?? 'news') : 'news';
        $body    = (string) ($row['body'] ?? '');
        $summary = $hasSumm ? (string) ($row['summary'] ?? '') : '';
        $image   = $hasImage ? (string) ($row['image_url'] ?? '') : '';
        $items[] = [
            'id'         => (int) ($row['id'] ?? 0),
            'type'       => $rowType === 'tip' ? 'tip' : 'news',
            'title'      => (string) ($row['title'] ?? ''),
            'summary'    => $summary !== '' ? $summary : mb_substr($body, 0, 80),
            'body'       => $body,
            'icon'       => ($hasIcon && !empty($row['icon']))
                            ? (string) $row['icon']
                            : ($rowType === 'tip' ? '🏛️' : '📰'),
            'badge'      => $hasBadge ? (string) ($row['badge'] ?? '') : '',
            'image_url'  => $image,
            /* نشانی مطلق برای اپ (که صفحه را از file:// باز می‌کند) */
            'image_abs'  => $image !== '' ? eplakNewsAbsoluteImage($image) : '',
            'sort_order' => $hasSort ? (int) ($row['sort_order'] ?? 0) : 0,
            'updated_at' => $hasUpd ? (string) ($row['updated_at'] ?? '') : '',
        ];
    }

    $news = array_values(array_filter($items, static fn($i) => $i['type'] === 'news'));
    $tips = array_values(array_filter($items, static fn($i) => $i['type'] === 'tip'));

    /* چه چیزی به‌خاطر دیتابیس قدیمی «سازگار» شد (برای راهنمایی مدیر) */
    $degraded = [];
    foreach (['badge', 'image_url', 'summary', 'sort_order', 'updated_at', 'published'] as $column) {
        if (!eplakNewsHasColumn($pdo, $column)) {
            $degraded[] = 'no_' . $column;
        }
    }
    if (!$schema['emoji']) {
        $degraded[] = 'no_emoji';
    }
    if (!empty($seedReport['inserted'])) {
        $degraded[] = 'seeded_defaults';
    }

    $payload = [
        'success' => true,
        'count'   => count($items),
        'items'   => $items,
        'news'    => $news,
        'tips'    => $tips,
    ];
    if ($degraded) {
        $payload['degraded'] = array_values(array_unique($degraded));
        $payload['hint'] = 'ساختار جدول اخبار با نسخه‌ی کد یکی نیست؛ بخشی از فیلدها ذخیره/خوانده نمی‌شود.'
            . ' از پنل مدیریت → تنظیمات «تعمیر ساختار دیتابیس» را بزنید.';
    }
    if (!empty($schema['repaired'])) {
        $payload['repaired'] = $schema['repaired'];
    }
    eplakJson($payload, 200);
} catch (Throwable $e) {
    /* هرگز ۵۰۰ نمی‌دهیم: اپ با success=false محتوای پیش‌فرض خودش را نشان می‌دهد */
    $fail(
        ['query_failed'],
        'خواندن اخبار از دیتابیس ممکن نشد. اگر این پیام ماند، ساختار دیتابیس را از پنل → تنظیمات تعمیر کنید.',
        $e->getMessage()
    );
}
