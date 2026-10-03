<?php
if (!defined('EPLAK_ROOT')) {
    define('EPLAK_ROOT', dirname(__DIR__));
}

function eplakBasePath(): string {
    $projectRoot = realpath(EPLAK_ROOT);
    $documentRoot = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));

    if ($projectRoot !== false && $documentRoot !== false) {
        $projectRoot = rtrim(str_replace('\\', '/', $projectRoot), '/');
        $documentRoot = rtrim(str_replace('\\', '/', $documentRoot), '/');

        if ($projectRoot === $documentRoot) {
            return '';
        }

        $documentPrefix = $documentRoot . '/';
        if (strncasecmp($projectRoot, $documentPrefix, strlen($documentPrefix)) === 0) {
            return '/' . trim(substr($projectRoot, strlen($documentPrefix)), '/');
        }
    }

    $scriptPath = str_replace('\\', '/', (string)parse_url($_SERVER['SCRIPT_NAME'] ?? '', PHP_URL_PATH));
    if (preg_match('#^(.*?)/(?:admin|api|shared|views)/#', $scriptPath, $matches)) {
        return rtrim($matches[1], '/');
    }

    $directory = dirname($scriptPath);
    return $directory === '.' || $directory === '/' ? '' : rtrim($directory, '/');
}

function eplakUrl(string $path): string {
    if (preg_match('#^(?:https?:)?//#i', $path)) {
        return $path;
    }

    $path = '/' . ltrim($path, '/');
    $basePath = eplakBasePath();

    if ($basePath !== '' && ($path === $basePath || strpos($path, $basePath . '/') === 0)) {
        return $path;
    }

    return $basePath . $path;
}
