<?php
require_once dirname(__DIR__) . '/shared/bootstrap.php';
eplakStartSession('eplak_admin');
session_destroy();
eplakRedirect('login.php');
exit;
