<?php
/* api/news.php — دریافت اخبار و دانستنی‌ها برای اپلیکیشن
   خروجی به‌صورت زنده از پایگاه داده خوانده می‌شود؛ هر تغییری در پنل ادمین
   بلافاصله در اپ نمایش داده می‌شود.

   پارامترها (اختیاری):
     type  = news | tip | all
     limit = تعداد (پیش‌فرض ۵۰)
*/
require_once __DIR__ . '/../admin/includes/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$type  = strtolower(trim($_GET['type'] ?? 'all'));
$limit = (int)($_GET['limit'] ?? 50);
if ($limit < 1) {
    $limit = 50;
}
if ($limit > 200) {
    $limit = 200;
}

$where = 'WHERE published = 1';
$params = [];
if ($type === 'news' || $type === 'tip') {
    $where .= ' AND type = :type';
    $params[':type'] = $type;
}

try {
    /* سازگاری با دیتابیس قدیمی: ستون‌هایی مثل badge که روی هاست اضافه نشده‌اند
       (کاربر دیتابیس اجازه‌ی ALTER TABLE ندارد) به‌صورت NULL انتخاب می‌شوند تا کل
       فهرست اخبار با خطای ۵۰۰ «Unknown column» از کار نیفتد. */
    $columns = eplakSelectColumns($pdo, 'news', [
        'id', 'type', 'title', 'summary', 'body', 'icon', 'badge', 'image_url', 'sort_order', 'updated_at',
    ]);
    $stmt = $pdo->prepare(
        "SELECT $columns
         FROM news $where
         ORDER BY sort_order ASC, id DESC
         LIMIT $limit"
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $shape = static function (array $row): array {
        return [
            'id'        => (int)$row['id'],
            'type'      => $row['type'],
            'title'     => $row['title'],
            'summary'   => $row['summary'] ?: mb_substr($row['body'], 0, 80),
            'body'      => $row['body'],
            'icon'      => $row['icon'] ?: ($row['type'] === 'tip' ? '🏛️' : '📰'),
            'badge'     => $row['badge'] ?? '',
            'image_url' => $row['image_url'],
            'sort_order' => (int)$row['sort_order'],
            'updated_at' => $row['updated_at'],
        ];
    };

    $items = array_map($shape, $rows);
    $news  = array_values(array_filter($items, static fn($i) => $i['type'] === 'news'));
    $tips  = array_values(array_filter($items, static fn($i) => $i['type'] === 'tip'));

    echo json_encode([
        'success' => true,
        'count'   => count($items),
        'items'   => $items,
        'news'    => $news,
        'tips'    => $tips,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    error_log('[eplak-news] ' . $e->getMessage());
    $payload = ['success' => false, 'error' => $e->getMessage()];
    if (eplakIsSchemaError($e->getMessage())) {
        $payload['schema'] = 'out_of_date';
        $payload['hint']   = eplakSchemaErrorHint();
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
}
