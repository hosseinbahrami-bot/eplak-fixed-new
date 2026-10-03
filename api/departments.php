<?php
require_once __DIR__ . '/../shared/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $pdo = eplakGetPdo();
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'اتصال به دیتابیس برقرار نشد. راه‌اندازی و پیکربندی دیتابیس را بررسی کنید.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$root = $pdo->query('SELECT * FROM departments WHERE parent_id IS NULL OR parent_id = 0 ORDER BY sort_order ASC, name ASC')->fetchAll();
$departments = [];

foreach ($root as $parent) {
    $children = $pdo->prepare('SELECT * FROM departments WHERE parent_id = :parent_id ORDER BY sort_order ASC, name ASC');
    $children->execute([':parent_id' => (int)$parent['id']]);
    $departments[] = [
        'id' => (int)$parent['id'],
        'name' => $parent['name'],
        'parent_id' => 0,
        'sort_order' => (int)($parent['sort_order'] ?? 0),
        'children' => array_map(function ($row) {
            return [
                'id' => (int)$row['id'],
                'name' => $row['name'],
                'parent_id' => (int)($row['parent_id'] ?? 0),
                'sort_order' => (int)($row['sort_order'] ?? 0),
            ];
        }, $children->fetchAll()),
    ];
}

if (empty($departments)) {
    echo json_encode(['success' => true, 'departments' => []]);
    exit;
}

echo json_encode(['success' => true, 'departments' => $departments]);
