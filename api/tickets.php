<?php
/* api/tickets.php — تیکت‌های پشتیبانی شهروندان

   GET    ?phone=09xxxxxxxxx                  → تیکت‌های همان شماره
   POST   {userPhone,title,description,...}  → ثبت تیکت جدید
   POST   ?action=delete&id=..&phone=..  (یا بدنه‌ی JSON با action=delete)
   DELETE ?id=..&phone=..                    → حذف تیکت (فقط توسط مالک)

   پاسخ‌دهی به تیکت (reply/status) فقط از پنل مدیریت (با نشست ادمین)
   انجام می‌شود؛ مسیر PATCH/PUT عمومی حذف شده تا امکان جعل «پاسخ شهرداری»
   توسط کاربر ناشناس وجود نداشته باشد.
*/
require_once __DIR__ . '/_common.php';

eplakApiHeaders();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$query  = $_GET;

if ($method === 'GET') {
    $phone = eplakNormalizePhone($query['phone'] ?? '');
    if ($phone === '') {
        eplakJsonError('شماره موبایل معتبر الزامی است', 400);
    }
    try {
        $stmt = $pdo->prepare('SELECT id, user_phone, title, description, status, reply, category, department, priority, created_at,
                                      CONCAT("TK-1403-", LPAD(id + 1000, 4, "0")) AS code
                               FROM tickets WHERE user_phone = :phone ORDER BY created_at DESC, id DESC LIMIT 200');
        $stmt->execute([':phone' => $phone]);
        eplakJson(['success' => true, 'tickets' => $stmt->fetchAll()]);
    } catch (Throwable $e) {
        eplakServerError($e, 'tickets.get');
    }
}

$input = eplakReadJsonBody();

$isDelete = $method === 'DELETE'
    || (($query['action'] ?? '') === 'delete')
    || (($input['action'] ?? '') === 'delete');

if ($isDelete) {
    $id = (int) ($query['id'] ?? 0);
    if ($id <= 0) {
        $id = (int) ($input['id'] ?? 0);
    }
    $phone = eplakNormalizePhone($query['phone'] ?? ($input['phone'] ?? ($input['userPhone'] ?? '')));

    if ($id <= 0) {
        eplakJsonError('شناسه‌ی تیکت نامعتبر است', 400);
    }
    if ($phone === '') {
        eplakJsonError('برای حذف تیکت، شماره‌ی مالک الزامی است', 400);
    }

    try {
        $stmt = $pdo->prepare('DELETE FROM tickets WHERE id = :id AND user_phone = :phone');
        $stmt->execute([':id' => $id, ':phone' => $phone]);
        if ($stmt->rowCount() === 0) {
            eplakJson(['success' => false, 'error' => 'تیکت یافت نشد', 'deleted_id' => $id], 404);
        }
        eplakJson(['success' => true, 'deleted_id' => $id]);
    } catch (Throwable $e) {
        eplakServerError($e, 'tickets.delete');
    }
}

if ($method === 'PATCH' || $method === 'PUT') {
    // پاسخ‌دهی فقط از پنل ادمین
    eplakJsonError('Forbidden', 403);
}

if ($method !== 'POST') {
    eplakJsonError('Method not allowed', 405);
}

if (!$input) {
    eplakJsonError('Invalid JSON', 400);
}

$phone       = eplakNormalizePhone($input['userPhone'] ?? ($input['phone'] ?? ''));
$title       = eplakStr($input['title'] ?? ($input['subject'] ?? ''), 255);
$description = eplakStr($input['description'] ?? ($input['details'] ?? ''), 4000);
$category    = eplakStr($input['category'] ?? 'پشتیبانی عمومی', 100);
$department  = eplakStr($input['department'] ?? 'حوزه شهردار و روابط عمومی', 255);
$priority    = eplakStr($input['priority'] ?? 'medium', 20);
$name        = eplakStr($input['name'] ?? '', 255);
$address     = eplakStr($input['address'] ?? '', 500);
$nid         = eplakStr($input['nid'] ?? '', 20);

if (!in_array($priority, ['low', 'medium', 'high', 'urgent'], true)) {
    $priority = 'medium';
}
if ($category === '') {
    $category = 'پشتیبانی عمومی';
}
if ($department === '') {
    $department = 'حوزه شهردار و روابط عمومی';
}
// وضعیت اولیه همیشه pending است؛ کاربر نمی‌تواند تیکت را «پاسخ‌داده‌شده» ثبت کند
$status = 'pending';

if ($phone === '') {
    eplakJsonError('شماره موبایل معتبر الزامی است', 400);
}
if ($title === '' || $description === '') {
    eplakJsonError('عنوان و متن تیکت الزامی است', 400);
}

try {
    $pdo->beginTransaction();

    $stmtUser = $pdo->prepare(eplakUsersUpsertSql($pdo, false));
    $stmtUser->execute([
        ':phone'   => $phone,
        ':name'    => $name,
        ':address' => $address,
        ':nid'     => $nid,
    ]);

    $stmt = $pdo->prepare('INSERT INTO tickets (user_phone, title, description, category, department, priority, status, reply)
                           VALUES (:phone, :title, :description, :category, :department, :priority, :status, :reply)');
    $stmt->execute([
        ':phone'       => $phone,
        ':title'       => $title,
        ':description' => $description,
        ':category'    => $category,
        ':department'  => $department,
        ':priority'    => $priority,
        ':status'      => $status,
        ':reply'       => '',
    ]);
    $ticketId = (int) $pdo->lastInsertId();

    $pdo->commit();
    $code = 'TK-1403-' . str_pad((string) ($ticketId + 1000), 4, '0', STR_PAD_LEFT);

    /* اعلان فوری برای خودِ کاربر (فهرست اعلان‌های اپ/سایت + فایربیس در حالت بسته) */
    try {
        require_once __DIR__ . '/../shared/notify_events.php';
        eplakNotifyRequestCreated($pdo, $phone, 'پیام/درخواست', $code);
    } catch (Throwable $e) {
        error_log('[eplak-api:tickets.notify] ' . $e->getMessage());
    }

    eplakJson([
        'success'       => true,
        'id'            => $ticketId,
        'tracking_code' => $code,
        'ticket'        => [
            'id'          => $ticketId,
            'code'        => $code,
            'user_phone'  => $phone,
            'title'       => $title,
            'description' => $description,
            'category'    => $category,
            'department'  => $department,
            'priority'    => $priority,
            'status'      => $status,
            'created_at'  => date('Y-m-d H:i:s'),
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    eplakServerError($e, 'tickets.create');
}
