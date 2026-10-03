<?php
/* admin router for dedicated live preview */
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

// If accessing root, redirect to the login page (absolute path — the
// preview proxy does not resolve relative Location values)
if ($uri === '/' || $uri === '') {
    header('Location: /admin/login.php');
    exit;
}

$file = __DIR__ . $uri;

if (is_file($file)) {
    // If it's a static asset (css, js, png, etc.), serve it
    $ext = pathinfo($file, PATHINFO_EXTENSION);
    $mimes = [
        'css' => 'text/css; charset=utf-8',
        'js' => 'application/javascript; charset=utf-8',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'svg' => 'image/svg+xml',
        'woff2' => 'font/woff2',
        'woff' => 'font/woff',
        'json' => 'application/json; charset=utf-8'
    ];
    if (isset($mimes[$ext])) {
        header('Content-Type: ' . $mimes[$ext]);
        header('Access-Control-Allow-Origin: *');
        readfile($file);
        exit;
    }
    // If it's a php file, require it
    if ($ext === 'php') {
        require $file;
        exit;
    }
}

// Default fallback
if (is_file(__DIR__ . $uri . '.php')) {
    require __DIR__ . $uri . '.php';
    exit;
}

return false;
