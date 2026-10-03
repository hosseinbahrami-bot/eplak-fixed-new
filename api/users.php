<?php
require_once __DIR__ . '/_common.php';

eplakApiHeaders();

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET') {
    $phone = eplakNormalizePhone($_GET['phone'] ?? '');
    if ($phone === '') {
        eplakJsonError('شماره موبایل معتبر الزامی است', 400);
    }

    $stmt = $pdo->prepare('SELECT id, phone, name, address, nid, created_at FROM users WHERE phone = :phone LIMIT 1');
    $stmt->execute([':phone' => $phone]);
    $user = $stmt->fetch();
    if (!$user) {
        echo json_encode(['success' => false, 'user' => null], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['success' => true, 'user' => $user], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON'], JSON_UNESCAPED_UNICODE);
    exit;
}

$phone = eplakNormalizePhone($input['phone'] ?? $input['userPhone'] ?? '');
$name = eplakStr($input['name'] ?? '', 255);
$address = eplakStr($input['address'] ?? '', 500);
$nid = eplakStr($input['nid'] ?? '', 20);

if ($phone === '') {
    eplakJsonError('شماره موبایل معتبر الزامی است', 400);
}
if ($nid !== '' && !preg_match('/^\d{10}$/', $nid)) {
    eplakJsonError('کد ملی باید ۱۰ رقم باشد', 400);
}

if ($name === '') {
    $name = 'شهروند';
}

try {
    $stmt = $pdo->prepare(eplakUsersUpsertSql($pdo, true));
    $stmt->execute([
        ':phone' => $phone,
        ':name' => $name,
        ':address' => $address,
        ':nid' => $nid,
    ]);

    $stmtGet = $pdo->prepare('SELECT id, phone, name, address, nid, created_at FROM users WHERE phone = :phone LIMIT 1');
    $stmtGet->execute([':phone' => $phone]);
    $savedUser = $stmtGet->fetch();

    echo json_encode(['success' => true, 'user' => $savedUser], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    eplakServerError($e, 'users');
}
