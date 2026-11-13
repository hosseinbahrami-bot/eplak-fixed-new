<?php
/* ============================================================================
   admin/includes/charts.php — نمودارهای SVG/HTMLِ «آمارِ سایت و دانلودها»
   ============================================================================
   چرا دست‌ساز و نه Chart.js؟
     ۱) پنل روی هاستِ اشتراکی و گاهی «بدونِ اینترنتِ کاربر» باز می‌شود؛ هیچ
        CDN یا فایلِ کتابخانه‌ی بیرونی لازم نیست.
     ۲) داشبوردِ موجود (admin/index.php) هم نمودارهایش را با SVGِ سمتِ سرور
        می‌سازد ⇒ همان زبانِ بصری، همان پوسته‌ی روشن/تاریک (theme.js).
     ۳) نمودارِ سمتِ سرور یعنی «بدونِ جاوااسکریپت» هم دیده می‌شود، چاپ و
        اسکرین‌شاتِ پوستر تمیز است و آزمونش با PHPِ واقعی ممکن است.

   راست‌به‌چپ (قراردادِ سراسریِ این پنل):
     • محورِ زمان در همه‌ی نمودارهای کارتزی از «راست» شروع می‌شود و به «چپ»
       می‌رود (قدیمی‌ترین نقطه سمتِ راست، تازه‌ترین سمتِ چپ) — چون صفحه‌ی پنل
       dir=rtl است و نمودارِ چپ‌به‌راست در آن «انگلیسی» دیده می‌شود.
     • محورِ مقدارها (عددِ عمودی) سمتِ «راست» می‌نشیند، نه چپ.
     • متنِ داخلِ SVG خاصیتِ direction را از <html dir="rtl"> به ارث می‌برد،
       پس «آبان ۱۴۰۵» درست چیده می‌شود (نه «۱۴۰۵ آبان»).
     • رقم‌ها فارسی و جداکننده‌ی هزارگان «٬» فارسی است (نه کامای لاتین).
     • نمودارهای HTML (نقشه‌ی حرارتی، ستون‌های ساعت، میله‌های افقی) با flex
       در زمینه‌ی RTL خودبه‌خود راست‌به‌چپ چیده می‌شوند.

   همه‌ی تابع‌ها «خالص»‌اند: ورودی = داده، خروجی = رشته‌ی HTML/SVG.
   همه‌ی متن‌ها با htmlspecialchars بیرون می‌روند (XSS) و همه‌ی رقم‌ها فارسی‌اند
   (eplakFaDigits) تا با بقیه‌ی پنل یکی باشند.
   ============================================================================ */

require_once dirname(__DIR__, 2) . '/shared/fa_datetime.php';

/** پالتِ رنگِ نمودارها (با پوسته‌ی روشن و تاریکِ پنل می‌خواند) */
function eplakChartPalette(): array
{
    return ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444',
            '#14b8a6', '#6366f1', '#eab308', '#94a3b8'];
}

/** فرارِ HTML */
function eplakChartEsc($text): string
{
    return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
}

/**
 * عدد با رقمِ فارسی: «۱,۲۳۴».
 *
 * چرا جداکننده «٬» (U+066C) نیست؟ چون رقمِ فارسی (U+06F0..U+06F9) کلاسِ bidi‏اش
 * EN است و «٬» کلاسِ AN؛ آمیختنِ این دو در یک عدد می‌تواند باعثِ وارونه‌چینی شود
 * («۲۳۴٬۱»). اما کاما کلاسِ CS است و طبقِ قاعده‌ی W4 بینِ دو رقمِ هم‌نوع خودش
 * EN می‌شود ⇒ «۱,۲۳۴» همیشه یک تکه و درست می‌ماند (در RTL و LTR هر دو).
 */
function eplakChartNum($n): string
{
    $n = (int) $n;
    return function_exists('eplakFaDigits')
        ? eplakFaDigits(number_format($n))
        : number_format($n);
}

/** درصدِ فارسی (بدونِ علامتِ منفیِ بی‌معنی) */
function eplakChartPct($value, int $digits = 0): string
{
    $v = round((float) $value, $digits);
    return eplakChartNum((int) ($digits === 0 ? round($v) : $v)) . '٪';
}

/** «سقفِ خوش‌خوان» برای محورِ عمودی: ۰/۵/۱۰/۲۰/۵۰/۱۰۰/۲۰۰/… */
function eplakChartNiceMax(int $max): int
{
    if ($max <= 5) {
        return max(5, $max + 1);
    }
    $mag = (int) pow(10, floor(log10($max)));
    $norm = $max / $mag;
    foreach ([1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10] as $step) {
        if ($norm <= $step) {
            return (int) ceil($step * $mag);
        }
    }
    return (int) ceil($norm) * $mag;
}

/** نازک‌کردنِ برچسب‌های محورِ افقی تا روی هم نیفتند (حداکثر $max برچسب) */
function eplakChartLabelStep(int $count, int $max = 10): int
{
    if ($count <= $max) {
        return 1;
    }
    return (int) ceil($count / $max);
}

/* ── ۱) نمودارِ سطحی/خطی (روندِ بازدید) ─────────────────────────────────── */

/**
 * نمودارِ سطحی با گرادیان + خطِ «بازدیدکننده‌ی یکتا».
 *
 * @param array $series [['label'=>'۱۴۰۴/۰۸/۲۱','views'=>12,'uniques'=>8], …]
 * @param array $opts   ['height'=>240,'color'=>'#10b981','show_dots'=>true,'title'=>'…']
 */
function eplakChartArea(array $series, array $opts = []): string
{
    $w  = (int) ($opts['width'] ?? 900);
    $h  = (int) ($opts['height'] ?? 250);
    /* RTL: محورِ مقدارها سمتِ راست ⇒ فضایِ برچسب در padR */
    $padL = 16; $padR = 54; $padT = 20; $padB = 40;
    $plotW = max(10, $w - $padL - $padR);
    $plotH = max(10, $h - $padT - $padB);
    $color = (string) ($opts['color'] ?? '#10b981');
    $n = count($series);

    if ($n === 0) {
        return eplakChartEmpty('داده‌ای برای این بازه نیست.');
    }

    $maxV = 0;
    foreach ($series as $row) {
        $maxV = max($maxV, (int) ($row['views'] ?? 0), (int) ($row['uniques'] ?? 0));
    }
    $maxV = eplakChartNiceMax($maxV);

    /* جهتِ زمان «راست ← چپ»: نقطه‌ی اول (قدیمی‌ترین) سمتِ راست و آخرین
       (تازه‌ترین) سمتِ چپ، چون صفحه‌ی پنل راست‌به‌چپ است. */
    $x = static function ($i) use ($n, $padR, $w, $plotW) {
        if ($n === 1) {
            return ($w - $padR) - $plotW / 2;
        }
        return ($w - $padR) - ($plotW * $i / ($n - 1));
    };
    $y = static function ($v) use ($maxV, $padT, $plotH) {
        return $padT + $plotH - ($maxV > 0 ? ($v / $maxV) * $plotH : 0);
    };

    $svg  = '<svg class="ega-chart ega-area" viewBox="0 0 ' . $w . ' ' . $h . '" role="img" style="direction:rtl" '
          . 'aria-label="' . eplakChartEsc($opts['title'] ?? 'نمودارِ روندِ بازدید') . '">' . "\n";
    $svg .= '  <defs><linearGradient id="egaAreaFill" x1="0" y1="0" x2="0" y2="1">'
          . '<stop offset="0%" stop-color="' . $color . '" stop-opacity="0.42"/>'
          . '<stop offset="100%" stop-color="' . $color . '" stop-opacity="0.02"/>'
          . '</linearGradient></defs>' . "\n";

    /* خطوطِ راهنما + برچسبِ محورِ عمودی */
    for ($g = 0; $g <= 4; $g++) {
        $val = (int) round($maxV * $g / 4);
        $gy  = $y($val);
        $svg .= '  <line class="ega-grid" x1="' . $padL . '" y1="' . round($gy, 1) . '" x2="' . ($w - $padR)
              . '" y2="' . round($gy, 1) . '"></line>' . "\n";
        /* text-anchor="middle" عمداً انتخاب شد: معنیِ start/end با direction
           جابه‌جا می‌شود (در RTL، «start» یعنی لبه‌ی راست) و برچسبِ محور به
           داخلِ نمودار می‌ریخت؛ middle در هر دو جهت یکسان است. */
        $svg .= '  <text class="ega-axis ega-axis-num" x="' . round($w - ($padR / 2) + 2, 1) . '" y="' . round($gy + 4, 1)
              . '" text-anchor="middle">' . eplakChartNum($val) . '</text>' . "\n";
    }

    /* مسیرِ سطح و خط */
    $linePts = [];
    $uniqPts = [];
    foreach ($series as $i => $row) {
        $linePts[] = round($x($i), 1) . ',' . round($y((int) ($row['views'] ?? 0)), 1);
        $uniqPts[] = round($x($i), 1) . ',' . round($y((int) ($row['uniques'] ?? 0)), 1);
    }
    $poly  = implode(' ', $linePts);
    $baseY = round($padT + $plotH, 1);
    $svg  .= '  <polygon class="ega-area-fill" points="' . round($x(0), 1) . ',' . $baseY . ' ' . $poly . ' '
           . round($x($n - 1), 1) . ',' . $baseY . '" fill="url(#egaAreaFill)"></polygon>' . "\n";
    /* نقطه‌ی «امروز» با هاله‌ی نرم دیده شود تا انتهای نمودار گم نشود */
    $svg  .= '  <circle class="ega-dot-last" cx="' . round($x($n - 1), 1) . '" cy="'
           . round($y((int) ($series[$n - 1]['views'] ?? 0)), 1) . '" r="5" fill="' . $color
           . '" stroke="#ffffffcc" stroke-width="2"></circle>' . "\n";
    $svg  .= '  <polyline class="ega-area-line" points="' . $poly . '" fill="none" stroke="' . $color
           . '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"></polyline>' . "\n";
    $svg  .= '  <polyline class="ega-area-uniq" points="' . implode(' ', $uniqPts) . '" fill="none" stroke="#3b82f6"'
          . ' stroke-width="1.8" stroke-dasharray="5 4" stroke-linejoin="round" opacity="0.9"></polyline>' . "\n";

    /* نقطه‌ها + راهنمایِ هاور (کمتر از ۶۲ نقطه تا شلوغ نشود) */
    if ($n <= 62 && !empty($opts['show_dots'])) {
        foreach ($series as $i => $row) {
            $v = (int) ($row['views'] ?? 0);
            $u = (int) ($row['uniques'] ?? 0);
            $cx = round($x($i), 1);
            $svg .= '  <circle class="ega-dot" cx="' . $cx . '" cy="' . round($y($v), 1) . '" r="3.4" fill="' . $color . '">'
                  . '<title>' . eplakChartEsc(($row['label'] ?? '')) . ' — بازدید: ' . eplakChartNum($v)
                  . ' · یکتا: ' . eplakChartNum($u) . '</title></circle>' . "\n";
        }
    }

    /* ستون‌های نامرئیِ هاور + برچسب‌های محورِ افقی */
    $step = eplakChartLabelStep($n, 10);
    foreach ($series as $i => $row) {
        if ($i % $step !== 0 && $i !== $n - 1) {
            continue;
        }
        $svg .= '  <text class="ega-axis" x="' . round($x($i), 1) . '" y="' . ($h - 14) . '" text-anchor="middle">'
              . eplakChartEsc($row['label'] ?? '') . '</text>' . "\n";
    }
    $svg .= '</svg>';
    return $svg;
}

/* ── ۲) نمودارِ ستونیِ گروهی (دانلودِ APK در برابرِ PWA و QR) ────────────── */

/**
 * @param array $series [['label'=>'…','apk'=>3,'pwa'=>2,'qr'=>1], …]
 */
function eplakChartGroupedBars(array $series, array $opts = []): string
{
    $w = (int) ($opts['width'] ?? 900);
    $h = (int) ($opts['height'] ?? 220);
    $padL = 16; $padR = 54; $padT = 18; $padB = 42;   /* RTL: محورِ مقدارها سمتِ راست */
    $plotW = max(10, $w - $padL - $padR);
    $plotH = max(10, $h - $padT - $padB);
    $n = count($series);
    if ($n === 0) {
        return eplakChartEmpty('دانلودی در این بازه ثبت نشده است.');
    }
    $groups = isset($opts['groups']) && is_array($opts['groups']) ? $opts['groups']
        : [['key' => 'apk', 'label' => 'دانلودِ APK', 'color' => '#10b981'],
           ['key' => 'pwa', 'label' => 'نسخه‌ی PWA', 'color' => '#3b82f6'],
           ['key' => 'qr',  'label' => 'کدِ QR',     'color' => '#f59e0b']];

    $maxV = 0;
    foreach ($series as $row) {
        foreach ($groups as $g) {
            $maxV = max($maxV, (int) ($row[$g['key']] ?? 0));
        }
    }
    $maxV = eplakChartNiceMax($maxV);

    $slot = $plotW / $n;
    $barW = max(3, min(18, ($slot * 0.72) / max(1, count($groups))));
    $step = eplakChartLabelStep($n, 10);

    $svg  = '<svg class="ega-chart ega-bars" viewBox="0 0 ' . $w . ' ' . $h . '" role="img" style="direction:rtl" '
          . 'aria-label="' . eplakChartEsc($opts['title'] ?? 'نمودارِ دانلودها') . '">' . "\n";
    for ($g = 0; $g <= 4; $g++) {
        $val = (int) round($maxV * $g / 4);
        $gy  = $padT + $plotH - ($maxV > 0 ? ($val / $maxV) * $plotH : 0);
        $svg .= '  <line class="ega-grid" x1="' . $padL . '" y1="' . round($gy, 1) . '" x2="' . ($w - $padR)
              . '" y2="' . round($gy, 1) . '"></line>' . "\n";
        $svg .= '  <text class="ega-axis ega-axis-num" x="' . round($w - ($padR / 2) + 2, 1) . '" y="' . round($gy + 4, 1)
              . '" text-anchor="middle">' . eplakChartNum($val) . '</text>' . "\n";
    }
    foreach ($series as $i => $row) {
        $cx = ($w - $padR) - ($slot * $i + $slot / 2);   /* RTL: از راست به چپ */
        $total = 0;
        foreach ($groups as $gi => $g) {
            $v = (int) ($row[$g['key']] ?? 0);
            $total += $v;
            $bh = $maxV > 0 ? ($v / $maxV) * $plotH : 0;
            if ($bh <= 0) {
                continue;
            }
            /* داخلِ هر گروه هم راست‌به‌چپ: اولین گروه (APK) سمتِ راست */
            $bx = $cx + ($barW * count($groups) / 2) - (($gi + 1) * $barW);
            $svg .= '  <rect class="ega-bar" x="' . round($bx + 0.8, 1) . '" y="' . round($padT + $plotH - $bh, 1)
                  . '" width="' . round($barW - 1.6, 1) . '" height="' . round(max(2, $bh), 1) . '" rx="3" fill="'
                  . eplakChartEsc($g['color']) . '"><title>' . eplakChartEsc($row['label'] ?? '') . ' — '
                  . eplakChartEsc($g['label']) . ': ' . eplakChartNum($v) . '</title></rect>' . "\n";
        }
        if ($total === 0) {
            $svg .= '  <rect class="ega-bar-zero" x="' . round($cx - $barW / 2, 1) . '" y="' . ($padT + $plotH - 2)
                  . '" width="' . round($barW, 1) . '" height="2" rx="1"></rect>' . "\n";
        }
        if ($i % $step === 0 || $i === $n - 1) {
            $svg .= '  <text class="ega-axis" x="' . round($cx, 1) . '" y="' . ($h - 14) . '" text-anchor="middle">'
                  . eplakChartEsc($row['label'] ?? '') . '</text>' . "\n";
        }
    }
    $svg .= '</svg>';
    return $svg;
}

/* ── ۳) دونات (سهمِ دستگاه‌ها) ─────────────────────────────────────────── */

/**
 * @param array $segments [['label'=>'موبایل','count'=>120,'color'=>'#10b981'], …]
 */
function eplakChartDonut(array $segments, array $opts = []): string
{
    $total = 0;
    foreach ($segments as $s) {
        $total += (int) ($s['count'] ?? 0);
    }
    $caption = (string) ($opts['caption'] ?? 'کل');
    $r = 62; $c = 2 * M_PI * $r; $offset = 0.0;
    $svg  = '<div class="ega-donut-wrap"><svg class="ega-donut" viewBox="0 0 170 170" role="img" style="direction:rtl" '
          . 'aria-label="' . eplakChartEsc($opts['title'] ?? 'نمودارِ دایره‌ای') . '">' . "\n";
    $svg .= '  <circle class="ega-donut-track" cx="85" cy="85" r="' . $r . '" fill="none" stroke-width="22"></circle>' . "\n";
    /* آینه‌ی راست‌به‌چپ: قطعه‌ها از ساعتِ ۱۲ پادساعت‌گرد می‌روند تا با ترتیبِ
       راهنما (که در RTL از راست شروع می‌شود) هم‌خوان باشند. متنِ وسط بیرونِ
       این گروه می‌ماند تا وارونه نشود. */
    $svg .= '  <g transform="translate(170,0) scale(-1,1)">' . "\n";
    if ($total > 0) {
        foreach ($segments as $s) {
            $cnt = (int) ($s['count'] ?? 0);
            if ($cnt <= 0) {
                continue;
            }
            $len = ($cnt / $total) * $c;
            $svg .= '  <circle cx="85" cy="85" r="' . $r . '" fill="none" stroke="' . eplakChartEsc($s['color'] ?? '#94a3b8')
                  . '" stroke-width="22" stroke-dasharray="' . number_format($len, 2, '.', '') . ' '
                  . number_format($c - $len, 2, '.', '') . '" stroke-dashoffset="'
                  . number_format(-$offset, 2, '.', '') . '" transform="rotate(-90 85 85)">'
                  . '<title>' . eplakChartEsc($s['label'] ?? '') . ': ' . eplakChartNum($cnt)
                  . ' (' . eplakChartPct($cnt / $total * 100) . ')</title></circle>' . "\n";
            $offset += $len;
        }
    }
    $svg .= '  </g>' . "\n";
    $svg .= '  <text class="ega-donut-total" x="85" y="83" text-anchor="middle">' . eplakChartNum($total) . '</text>' . "\n";
    $svg .= '  <text class="ega-donut-caption" x="85" y="104" text-anchor="middle">' . eplakChartEsc($caption) . '</text>' . "\n";
    $svg .= '</svg><ul class="ega-legend">' . "\n";
    foreach ($segments as $s) {
        $cnt = (int) ($s['count'] ?? 0);
        $svg .= '  <li><span class="ega-dot-lg" style="background:' . eplakChartEsc($s['color'] ?? '#94a3b8') . '"></span>'
              . '<span class="ega-lg-label">' . eplakChartEsc($s['label'] ?? '') . '</span>'
              . '<span class="ega-lg-count">' . eplakChartNum($cnt) . '</span>'
              . '<span class="ega-lg-pct">' . eplakChartPct($total > 0 ? ($cnt / $total * 100) : 0) . '</span></li>' . "\n";
    }
    $svg .= '</ul></div>';
    return $svg;
}

/* ── ۴) میله‌های افقی (مرورگرها، سیستم‌عامل‌ها، منابع، صفحه‌ها) ─────────── */

/**
 * @param array $rows [['key'=>'کروم','count'=>210,'uniques'=>90], …]
 */
function eplakChartHBars(array $rows, array $opts = []): string
{
    if (!$rows) {
        return eplakChartEmpty((string) ($opts['empty'] ?? 'داده‌ای نیست.'));
    }
    $max = 0; $sum = 0;
    foreach ($rows as $r) {
        $max = max($max, (int) $r['count']);
        $sum += (int) $r['count'];
    }
    $labelOf = isset($opts['label_cb']) && is_callable($opts['label_cb']) ? $opts['label_cb'] : null;
    $html = '<ul class="ega-hbar-list">' . "\n";
    foreach ($rows as $i => $r) {
        $label = $labelOf !== null ? (string) call_user_func($labelOf, (string) $r['key']) : (string) $r['key'];
        if (trim($label) === '') {
            $label = (string) ($opts['empty_label'] ?? 'نامشخص');
        }
        $pct = $max > 0 ? (int) round(((int) $r['count'] / $max) * 100) : 0;
        $share = $sum > 0 ? round(((int) $r['count'] / $sum) * 100) : 0;
        $color = (string) ($opts['color'] ?? eplakChartPalette()[$i % count(eplakChartPalette())]);
        $html .= '  <li><span class="ega-hbar-label" title="' . eplakChartEsc($label) . '">' . eplakChartEsc($label) . '</span>'
              . '<span class="ega-hbar-track"><span class="ega-hbar-fill" style="width:' . $pct . '%;background:'
              . eplakChartEsc($color) . '"></span></span>'
              . '<span class="ega-hbar-count">' . eplakChartNum($r['count']) . '</span>'
              . '<span class="ega-hbar-share">' . eplakChartPct($share) . '</span></li>' . "\n";
    }
    return $html . '</ul>';
}

/* ── ۵) نقشه‌ی حرارتیِ «روزِ هفته × ساعت» ─────────────────────────────── */

/**
 * @param array $cells [dow => [hour => count]]  (dow = شماره‌ی ISO: 1=دوشنبه … 7=یکشنبه)
 */
function eplakChartHeatmap(array $cells, int $max, array $opts = []): string
{
    if ($max <= 0) {
        return eplakChartEmpty('هنوز بازدیدی ثبت نشده تا ساعت‌های اوج دیده شود.');
    }
    $weekdays = function_exists('eplakAnalyticsFaWeekdays') ? eplakAnalyticsFaWeekdays() : [];
    $order = function_exists('eplakAnalyticsWeekdayOrder') ? eplakAnalyticsWeekdayOrder() : [6, 7, 1, 2, 3, 4, 5];
    $color = (string) ($opts['color'] ?? '#10b981');

    /* چیدمانِ HTML در زمینه‌ی dir=rtl خودبه‌خود راست‌به‌چپ است: نامِ روزها
       سمتِ راست، ساعتِ ۰ سمتِ راست و ساعتِ ۲۳ سمتِ چپ. */
    $html  = '<div class="ega-heat"><div class="ega-heat-hours">' . "\n";
    for ($h = 0; $h < 24; $h++) {
        $html .= '    <span>' . ($h % 3 === 0 ? eplakChartNum($h) : '') . '</span>' . "\n";
    }
    $html .= '  </div>' . "\n";
    foreach ($order as $dow) {
        $html .= '  <div class="ega-heat-row"><span class="ega-heat-day">'
              . eplakChartEsc($weekdays[$dow] ?? '') . '</span><span class="ega-heat-cells">' . "\n";
        for ($h = 0; $h < 24; $h++) {
            $v = isset($cells[$dow][$h]) ? (int) $cells[$dow][$h] : 0;
            $alpha = $v <= 0 ? 0.05 : round(0.14 + 0.86 * ($v / $max), 3);
            $html .= '    <i style="background:' . eplakChartEsc($color) . ';opacity:' . $alpha . '" title="'
                  . eplakChartEsc(($weekdays[$dow] ?? '') . ' ساعت ' . eplakChartNum($h) . ' — '
                  . eplakChartNum($v) . ' رویداد') . '"></i>' . "\n";
        }
        $html .= '  </span></div>' . "\n";
    }
    /* پلکانِ «کم ← زیاد» در RTL از راست شروع می‌شود ⇒ گرادیان هم برگردانده شد */
    $html .= '  <div class="ega-heat-scale"><span>کم</span><span class="ega-heat-ramp" style="background:linear-gradient(270deg,'
          . eplakChartEsc($color) . '22,' . eplakChartEsc($color) . ')"></span><span>زیاد</span>'
          . '<em>بیشینه: ' . eplakChartNum($max) . ' رویداد در یک ساعت</em></div>' . "\n</div>";
    return $html;
}

/* ── ۶) ستون‌های ساعتِ روز (ساعت‌های اوج) ─────────────────────────────── */

/** @param int[] $hours ۲۴ مقدار */
function eplakChartHourColumns(array $hours, array $opts = []): string
{
    $max = max(1, count($hours) ? max($hours) : 1);
    $color = (string) ($opts['color'] ?? '#3b82f6');
    $peak = array_keys($hours, max($hours));
    $html = '<div class="ega-hours">' . "\n";
    foreach ($hours as $h => $v) {
        $pct = (int) round(($v / $max) * 100);
        $isPeak = in_array($h, $peak, true) && $v > 0;
        $html .= '  <span class="ega-hour' . ($isPeak ? ' ega-hour-peak' : '') . '" title="ساعت '
              . eplakChartNum($h) . ' — ' . eplakChartNum($v) . ' رویداد">'
              . '<i style="height:' . max(3, $pct) . '%;background:' . eplakChartEsc($isPeak ? '#f59e0b' : $color) . '"></i>'
              . '<em>' . ($h % 3 === 0 ? eplakChartNum($h) : '') . '</em></span>' . "\n";
    }
    return $html . '</div>';
}

/* ── ۷) جرقه‌نمودارِ کارت‌های KPI ─────────────────────────────────────── */

/** @param int[] $values */
function eplakChartSpark(array $values, array $opts = []): string
{
    $values = array_values(array_map('intval', $values));
    if (count($values) < 2) {
        return '';
    }
    $w = (int) ($opts['width'] ?? 132);
    $h = (int) ($opts['height'] ?? 34);
    $max = max(1, max($values));
    $color = (string) ($opts['color'] ?? '#10b981');
    $last = count($values) - 1;
    $pts = [];
    foreach ($values as $i => $v) {
        $x = $last > 0 ? ($w - ($w * $i / $last)) : $w / 2;   /* RTL: از راست به چپ */
        $y = $h - 2 - (($v / $max) * ($h - 6));
        $pts[] = round($x, 1) . ',' . round($y, 1);
    }
    $lastX = $last > 0 ? 0 : $w / 2;
    $lastY = $h - 2 - (($values[$last] / $max) * ($h - 6));
    return '<svg class="ega-spark" viewBox="0 0 ' . $w . ' ' . $h . '" aria-hidden="true">'
        . '<polyline points="' . implode(' ', $pts) . '" fill="none" stroke="' . eplakChartEsc($color)
        . '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.95"></polyline>'
        . '<circle cx="' . round($lastX, 1) . '" cy="' . round($lastY, 1) . '" r="2.8" fill="'
        . eplakChartEsc($color) . '"></circle></svg>';
}

/* ── ۸) حالتِ خالی و راهنما ───────────────────────────────────────────── */

/** جعبه‌ی «داده‌ای نیست» — به‌جای نمودارِ خالی */
function eplakChartEmpty(string $text, string $hint = ''): string
{
    return '<div class="ega-empty"><i class="fa-solid fa-chart-simple"></i><p>' . eplakChartEsc($text) . '</p>'
        . ($hint !== '' ? '<small>' . eplakChartEsc($hint) . '</small>' : '') . '</div>';
}

/** نشانِ تغییر نسبت به دوره‌ی قبل (رشد/افت) */
function eplakChartDelta(array $delta, string $suffix = 'نسبت به دوره‌ی قبل'): string
{
    $dir = (string) ($delta['dir'] ?? 'flat');
    $icons = ['up' => 'fa-arrow-trend-up', 'down' => 'fa-arrow-trend-down', 'flat' => 'fa-minus'];
    $sign = $dir === 'up' ? '+' : ($dir === 'down' ? '−' : '');
    $pct = abs((int) ($delta['pct'] ?? 0));
    return '<span class="ega-delta ega-delta-' . eplakChartEsc($dir) . '">'
        . '<i class="fa-solid ' . $icons[$dir] . '"></i> '
        . eplakChartEsc($sign . eplakChartNum($pct) . '٪')
        . '<em>' . eplakChartEsc($suffix) . ': ' . eplakChartNum($delta['prev'] ?? 0) . '</em></span>';
}
