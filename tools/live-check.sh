#!/usr/bin/env bash
# ============================================================================
#  بررسی سایت زنده — آیا نسخه‌ی جدید روی eplak.ir اعمال شده است؟
#
#  اجرا:   bash tools/live-check.sh                       (آدرس پیش‌فرض)
#          bash tools/live-check.sh https://آدرس-دیگر     (آدرس دلخواه)
#
#  این اسکریپت هیچ رمز و اطلاعات محرمانه‌ای لازم ندارد؛ فقط صفحات عمومی
#  سایت را می‌خواند و نشانه‌های نسخه‌ی جدید را در آن‌ها جست‌وجو می‌کند.
# ============================================================================
set -uo pipefail

BASE="${1:-https://eplak.ir/eplak-fixed}"
BASE="${BASE%/}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
TMP="$(mktemp -d)"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
STATUS="pass"      # pass | fail | unreachable
ISSUES=()

say()  { printf '%s\n' "$*"; }
hdr()  { printf '\n### %s\n\n' "$*"; }

# دانلود یک آدرس؛ خروجی: کد HTTP روی خط اول، فایل بدنه در مسیر داده‌شده
grab() {
  local url="$1" out="$2" code
  code=$(curl -sS -L --max-time 30 -A "$UA" -o "$out" -w '%{http_code}' "$url" 2>"$out.err") || code="000"
  printf '%s' "${code:-000}"
}

has() { [ -f "$1" ] && grep -qF -- "$2" "$1"; }
countof() { [ -f "$1" ] && grep -oF -- "$2" "$1" | wc -l | tr -d ' ' || echo 0; }

say "# گزارش بررسی سایت زنده"
say ""
say "- آدرس بررسی‌شده: \`$BASE\`"
say "- زمان بررسی (UTC): $(date -u '+%Y-%m-%d %H:%M')"
say "- نسخه‌ی مخزن: \`$(cd "$REPO" && git log --oneline -1 2>/dev/null | cut -c1-60)\`"

# ── ۱) صفحه‌ی ورود پنل ادمین ────────────────────────────────────────────────
hdr "۱) پنل ادمین — صفحه‌ی ورود"
LOGIN="$TMP/login.html"
CODE_LOGIN=$(grab "$BASE/admin/login.php" "$LOGIN")
say "| مورد | نتیجه |"
say "|---|---|"
say "| کد پاسخ | \`$CODE_LOGIN\` |"
say "| حجم پاسخ | $(wc -c < "$LOGIN" 2>/dev/null | tr -d ' ') بایت |"
TITLE=$(grep -oE '<title>[^<]*</title>' "$LOGIN" 2>/dev/null | head -1 | sed 's/<[^>]*>//g')
say "| عنوان صفحه | ${TITLE:-—} |"
if grep -qiE 'Fatal error|Warning:|Parse error' "$LOGIN" 2>/dev/null; then
  say "| خطای PHP | ❌ دیده شد |"
  ISSUES+=("صفحه‌ی ورود پنل خطای PHP می‌دهد")
else
  say "| خطای PHP | ✅ ندارد |"
fi
if [ "$CODE_LOGIN" = "200" ] && [ "$(wc -c < "$LOGIN" 2>/dev/null | tr -d ' ')" -gt 500 ]; then
  say "| وضعیت | ✅ پنل ادمین بالاست |"
else
  say "| وضعیت | ❌ پنل ادمین جواب درست نداد |"
  STATUS="fail"
  ISSUES+=("صفحه‌ی ورود پنل در دسترس نبود (کد $CODE_LOGIN)")
fi

# ── ۱-۲) اگر سایت خطای دیتابیس دارد، متن دقیق خطا را نشان بده ──────────────
if [ "$CODE_LOGIN" = "500" ]; then
  hdr "۱-۲) ⚠️ متن دقیق خطای سرور"
  python3 - "$LOGIN" <<'PYEOF'
import re, sys, html
try:
    raw = open(sys.argv[1], encoding='utf-8', errors='replace').read()
except Exception as e:
    print('  (خواندن پاسخ ممکن نشد:', e, ')'); raise SystemExit
m = re.search(r'<div class="detail">(.*?)</div>', raw, re.S)
detail = html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else ''
title = re.search(r'<h1>(.*?)</h1>', raw, re.S)
print('  پیام:', html.unescape(re.sub(r'<[^>]+>', '', title.group(1))).strip() if title else '—')
print('  جزئیات فنی:', detail if detail else '—')
body = html.unescape(re.sub(r'<[^>]+>', ' ', raw))
hints = [h.strip() for h in re.findall(r'<li>(.*?)</li>', raw, re.S)]
if hints:
    print()
    print('  راه‌حل‌های پیشنهادی خود سایت:')
    for h in hints[:4]:
        print('   •', html.unescape(re.sub(r'<[^>]+>', '', h)).strip()[:180])
PYEOF
  say ""
  say "**🛠 راه‌حل سریع:** فایل \`shared/config.php\` را دستی بسازید (ابزار خودکار \`rescue-db.php\` برای امنیت حذف شده است):"
  say ""
  say "۱) cPanel → **File Manager** → پوشه‌ی \`shared\` → فایل \`config.example.php\` را کپی کنید و نام کپی را \`config.php\` بگذارید."
  say "۲) \`config.php\` را Edit کنید و چهار مقدار \`host\` / \`user\` / \`pass\` / \`name\` را بنویسید."
  say ""
  say "اطلاعات دیتابیس در cPanel → **MySQL® Databases** است (ستون Databases و Users؛ رمز را اگر یادتان نیست با Change Password عوض کنید)."
  say "راهنمای کامل: بخش «۶-۶» در \`docs/DEPLOY_UPDATE_FA.md\`."
  say ""
fi

# ── ۲) فایل جاوااسکریپت اعلان‌ها (نشانه‌ی اصلی نسخه‌ی جدید) ─────────────────
hdr "۲) فایل \`modules/live.js\` — نشانه‌های نسخه‌ی جدید"
LIVE="$TMP/live.js"
CODE_LIVE=$(grab "$BASE/modules/live.js" "$LIVE")
say "| نشانه | روی سرور | انتظار |"
say "|---|---|---|"
check_marker() { # label marker
  local label="$1" marker="$2" live_has="❌ نیست" repo_has="—"
  if has "$LIVE" "$marker"; then live_has="✅ هست"; fi
  if [ -f "$REPO/modules/live.js" ] && grep -qF -- "$marker" "$REPO/modules/live.js"; then repo_has="✅ باید باشد"; else repo_has="— نمی‌خواهد باشد"; fi
  say "| $label | $live_has | $repo_has |"
}
check_marker "ثبت دستگاه اپ (فایربیس)" "registerAppDevice"
check_marker "کنش \`register_fcm\`" "register_fcm"
check_marker "تلاش مجدد و «تست اعلان» در ثبت گوشی (اپ تازه)" "eplakOnFcmToken"
check_marker "تشخیص آماده بودن فایربیس" "isFcmReady"
check_marker "اعلان‌های داخل برنامه" "اعلان‌های داخل برنامه فعال است"
check_marker "کنش حذف اعلان" "deleteNotifications"
check_marker "اعلان فوری پس از ثبت درخواست" "refreshNotificationsNow"
say ""
say "- کد پاسخ فایل: \`$CODE_LIVE\` • حجم: $(wc -c < "$LIVE" 2>/dev/null | tr -d ' ') بایت"
say "- تعداد اشاره به fcm در فایل: \`$(countof "$LIVE" 'fcm')\`"

NEW_WEB="no"
NEW_ONLINE="no"
SMOKE_OK="no"
ENGINE_OK="no"
NEW_VER_PAGE="no"
APK_FCM="no"
RESCUE_PRESENT="no"
if has "$LIVE" "registerAppDevice"; then NEW_WEB="yes"; fi

# ── ۳) سرویس اعلان سرور ────────────────────────────────────────────────────
hdr "۳) سرویس اعلان — \`api/push.php?action=config\`"
PUSH="$TMP/push.json"
CODE_PUSH=$(grab "$BASE/api/push.php?action=config" "$PUSH")
say "| مورد | نتیجه |"
say "|---|---|"
say "| کد پاسخ | \`$CODE_PUSH\` |"
say "| پاسخ | \`$(head -c 300 "$PUSH" 2>/dev/null)\` |"
NEW_API="no"
if has "$PUSH" "fcm_ready"; then
  NEW_API="yes"
  say "| کلیدهای فایربیس | ✅ \`fcm_ready\` هست → کد سرور به‌روز شده |"
else
  say "| کلیدهای فایربیس | ❌ \`fcm_ready\` نیست → کد سرور قدیمی است |"
fi
if [ "$NEW_API" = "no" ] && [ "$NEW_WEB" = "no" ]; then
  STATUS="fail"
  ISSUES+=("سایت هنوز نسخه‌ی قدیم را اجرا می‌کند (بسته‌ی به‌روزرسانی آپلود نشده)")
fi

# ── ۳-۲) سرویس اعلان‌های کاربر (وضعیت خوانده‌شدن برای هر کاربر) ─────────────
hdr "۳-۲) فهرست اعلان‌های کاربر — \`api/notifications.php\`"
NOTIF="$TMP/notif.json"
CODE_NOTIF=$(grab "$BASE/api/notifications.php?phone=09000000000&device=probe-device" "$NOTIF")
say "| مورد | نتیجه |"
say "|---|---|"
say "| کد پاسخ | \`$CODE_NOTIF\` |"
HEADNOTIF="$(head -c 300 "$NOTIF" 2>/dev/null)"
say "| پاسخ | \`$HEADNOTIF\` |"
if has "$NOTIF" "\"unread\"" && has "$NOTIF" "notifications"; then
  say "| وضعیت | ✅ سرویس اعلان‌های کاربر بالاست |"
  NEW_NOTIF="yes"
else
  say "| وضعیت | ❌ پاسخ مورد انتظار نبود |"
  NEW_NOTIF="no"
  STATUS="fail"
  ISSUES+=("سرویس api/notifications.php پاسخ درست نداد")
fi

# ── ۳-۳) ثبت گوشی با «فرم ساده» — همان قالبی که اپ اندروید می‌فرستد ──────────
hdr "۳-۳) ثبت گوشی از اپ — \`register_fcm\` با فرم ساده"
say "> یک توکن آزمایشی ثبت می‌کند و بلافاصله پاکش می‌کند؛ به هیچ گوشی/کاربری اعلان نمی‌رود."
say "> اگر این گام ❌ باشد، هیچ گوشی‌ای ثبت نمی‌شود و **هیچ اعلان پنلی (در حال رسیدگی / انجام شد) به گوشی نمی‌رسد**."
say ""
PROBE_TOKEN="eplak-livecheck-$(date -u +%s)-$$"
REG="$TMP/reg.json"; REGST="$TMP/regst.json"; REGDEL="$TMP/regdel.json"
CODE_REG=$(curl -sS --max-time 30 -A "$UA" -o "$REG" -w '%{http_code}' -X POST \
  --data-urlencode "action=register_fcm" --data-urlencode "phone=09000000000" \
  --data-urlencode "token=$PROBE_TOKEN" --data-urlencode "platform=android" \
  "$BASE/api/push.php" 2>/dev/null) || CODE_REG="000"
say "| مورد | نتیجه |"
say "|---|---|"
say "| ثبت با فرم ساده — کد پاسخ | \`$CODE_REG\` |"
say "| پاسخ | \`$(head -c 220 "$REG" 2>/dev/null | tr '\n' ' ')\` |"
FORM_REG="no"
if has "$REG" '"success":true'; then
  FORM_REG="yes"
  say "| ثبت از فرم ساده | ✅ سرور می‌پذیرد (اپ اندروید می‌تواند گوشی را ثبت کند) |"
  # همان گوشی در سرور دیده می‌شود؟
  CODE_REGST=$(grab "$BASE/api/push.php?action=status&phone=09000000000&token=$PROBE_TOKEN" "$REGST")
  if has "$REGST" '"registered":true'; then
    say "| دیده شدن گوشی در سرور | ✅ \`registered: true\` |"
  else
    say "| دیده شدن گوشی در سرور | ⚠️ پاسخ \`status\` قدیمی است یا گوشی ذخیره نشد (کد $CODE_REGST) |"
    ISSUES+=("پس از ثبت، وضعیت گوشی در سرور تأیید نشد (api/push.php?action=status)")
  fi
  # پاک‌سازی: توکن آزمایشی نباید در جدول بماند
  curl -sS --max-time 20 -A "$UA" -o "$REGDEL" -X POST \
    --data-urlencode "action=unregister_fcm" --data-urlencode "token=$PROBE_TOKEN" \
    "$BASE/api/push.php" >/dev/null 2>&1 || true
  grab "$BASE/api/push.php?action=status&phone=09000000000&token=$PROBE_TOKEN" "$REGST" >/dev/null
  if has "$REGST" '"registered":false'; then
    say "| پاک‌سازی توکن آزمایشی | ✅ انجام شد |"
  else
    say "| پاک‌سازی توکن آزمایشی | ⚠️ تأیید نشد (توکن \`$PROBE_TOKEN\` را می‌توان از «تنظیمات ← گوشی‌های ثبت‌شده» دید؛ اثری بر کاربران ندارد) |"
  fi
else
  say "| ثبت از فرم ساده | ❌ سرور نپذیرفت |"
  say ""
  say "**علت محتمل:** \`api/push.php\` و \`api/_common.php\` از آخرین بسته‌ی به‌روزرسانی روی هاست نیامده‌اند"
  say "(نسخه‌ی قدیمی فقط JSON می‌خواند، ولی اپ فرم ساده می‌فرستد ← خطای ۴۰۰ «توکن دستگاه الزامی است»)."
  STATUS="fail"
  ISSUES+=("ثبت گوشی از اپ (فرم ساده) روی سرور پذیرفته نمی‌شود؛ فایل‌های api/push.php و api/_common.php بسته‌ی تازه را آپلود کنید")
fi

# ── ۴) نسخه‌ی فایل‌های اصلی سایت (کش‌باستر) ────────────────────────────────
hdr "۴) نسخه‌ی فایل‌های سایت (کش‌باستر)"
IDX="$TMP/index.html"
CODE_IDX=$(grab "$BASE/index.html" "$IDX")
say "- کد پاسخ: \`$CODE_IDX\` • حجم: $(wc -c < "$IDX" 2>/dev/null | tr -d ' ') بایت"
if [ -f "$IDX" ] && [ -f "$REPO/index.html" ]; then
  say ""
  say "| فایل | روی سرور | در مخزن | وضعیت |"
  say "|---|---|---|---|"
  for f in "assets/css/style.css" "modules/reports.js" "modules/live.js" "modules/auth.js" "core/i18n.js" "modules/city-map.js" "core/places-data.js" "app.js"; do
    lv=$(grep -oE "${f//./\\.}\?v=[0-9]+" "$IDX" | head -1 | grep -oE '[0-9]+$')
    rv=$(grep -oE "${f//./\\.}\?v=[0-9]+" "$REPO/index.html" | head -1 | grep -oE '[0-9]+$')
    if [ -z "$lv" ]; then lv="—"; fi
    if [ -z "$rv" ]; then rv="—"; fi
    mark="✅ یکسان"
    if [ "$lv" != "$rv" ]; then mark="⚠️ متفاوت"; fi
    say "| $f | $lv | $rv | $mark |"
  done
else
  say ""
  say "⚠️ مقایسه‌ی کش‌باستر انجام نشد (یکی از فایل‌ها خوانده نشد)."
fi

# ── ۵) بررسی وجود موتور فایربیس (بدون دسترسی مستقیم) ─────────────────────
hdr "۵) فایل‌های جدید نسخه"
say "> پوشه‌ی \`shared/\` در فایل \`.htaccess\` عمداً مسدود شده است (امنیت)؛ پس"
say "> ۴۰۴ گرفتن از آن **طبیعی** است و نشانه‌ی نبودن فایل نیست."
say ""
say "| فایل | کد پاسخ | تفسیر |"
say "|---|---|---|"

# shared/* → ۴۰۴ طبیعی است؛ وجود واقعی‌شان از روی api/push.php فهمیده می‌شود
for f in "shared/fcm.php" "shared/notification_reads.php"; do
  c=$(grab "$BASE/$f" "$TMP/x.out")
  case "$c" in
    404) note="✅ طبیعی است (پوشه‌ی محافظت‌شده)" ;;
    200) note="✅ فایل هست و مستقیم هم باز می‌شود (محافظت غیرفعال)" ;;
    403|401) note="✅ طبیعی است (پوشه‌ی محافظت‌شده)" ;;
    000) note="❓ پاسخ نداد" ;;
    *) note="کد $c" ;;
  esac
  say "| $f | $c | $note |"
done

# بررسی واقعی وجود موتور فایربیس از روی پاسخ سرور
if has "$PUSH" "fcm_ready"; then
  say "| موتور فایربیس (از روی \`api/push.php\`) | $CODE_PUSH | ✅ نصب است و اجرا می‌شود |"
  ENGINE_OK="yes"
else
  say "| موتور فایربیس (از روی \`api/push.php\`) | $CODE_PUSH | ❌ نصب نشده |"
  ENGINE_OK="no"
fi

# صفحه‌ی بررسی نسخه‌ی پنل (پشت ورود) و دیگر صفحات پنل
for f in "admin/version.php" "admin/notification_view.php" "admin/notifications.php" "admin/settings.php"; do
  pc=$(grab "$BASE/$f" "$TMP/p.out")
  if [ "$pc" = "404" ]; then
    note="❌ روی سرور نیست"
    if [ "$f" = "admin/version.php" ]; then ISSUES+=("صفحه‌ی «بررسی نسخه» هنوز آپلود نشده است (بسته‌ی قدیمی‌تر روی هاست است)"); fi
  elif has "$TMP/p.out" "Fatal error" || has "$TMP/p.out" "Parse error"; then
    note="❌ خطای PHP"
    STATUS="fail"; ISSUES+=("صفحه‌ی $f خطای PHP می‌دهد")
  elif has "$TMP/p.out" "پنل مدیریت" || has "$TMP/p.out" "ورود"; then
    note="✅ هست (پشت ورود پنل)"
  else
    note="✅ هست"
  fi
  say "| $f | $pc | $note |"
  if [ "$f" = "admin/version.php" ] && [ "$pc" != "404" ]; then NEW_VER_PAGE="yes"; fi
done

# اماکن شهری (مدیریت از پنل): api/places.php باید JSON سالم بدهد؛ نبودنش فقط یعنی بسته‌ی تازه آپلود نشده
PLACES_OUT="$TMP/places.json"
CODE_PLACES=$(grab "$BASE/api/places.php" "$PLACES_OUT")
if has "$PLACES_OUT" '"success":true' && has "$PLACES_OUT" '"ready":true'; then
  say "| اماکن شهری (\`api/places.php\`) | $CODE_PLACES | ✅ کار می‌کند (جدول ساخته شده؛ اصلاح‌های ادمین به اپ می‌رسد) |"
elif has "$PLACES_OUT" '"success":true'; then
  say "| اماکن شهری (\`api/places.php\`) | $CODE_PLACES | ⚠️ جواب می‌دهد ولی جدول ساخته نشده (دسترسی CREATE TABLE دیتابیس را بررسی کنید)؛ اپ فهرست پیش‌فرض را نشان می‌دهد |"
elif [ "$CODE_PLACES" = "404" ]; then
  say "| اماکن شهری (\`api/places.php\`) | $CODE_PLACES | ⏳ هنوز آپلود نشده (بسته‌ی دور ۳۰ روی هاست نیست) |"
else
  say "| اماکن شهری (\`api/places.php\`) | $CODE_PLACES | ⚠️ پاسخ غیرمنتظره |"
fi

# ── ۵-۲) بررسی امنیتی: ابزار قدیمیِ rescue-db.php نباید روی سایت بماند ──────
#  این ابزار رمز نداشت و می‌توانست shared/config.php را بازنویسی کند؛ از مخزن و
#  بسته‌ی آپلود حذف شده. ولی Extract کردن بسته فایل‌های قدیمیِ هاست را پاک نمی‌کند:
#    ۲۰۰ ← هنوز باز است (خطرناک)    ۴۰۳ ← .htaccess تازه آن را بسته است
#    ۴۰۴ ← فایل نیست
hdr "۵-۲) ابزار قدیمیِ بازیابی (rescue-db.php) — باید حذف شده باشد"
RESCUE_OUT="$TMP/rescue.html"
CODE_RESCUE=$(grab "$BASE/rescue-db.php" "$RESCUE_OUT")
say "| مورد | نتیجه |"
say "|---|---|"
say "| کد پاسخ | \`$CODE_RESCUE\` |"
case "$CODE_RESCUE" in
  200)
    if has "$RESCUE_OUT" "بازیابی اتصال دیتابیس"; then
      say "| وضعیت | 🔴 **ابزار قدیمی هنوز روی سایت باز است** — رمز ندارد و هر کسی می‌تواند با آن اتصال دیتابیس سایت را بازنویسی کند. از cPanel → File Manager فایل \`rescue-db.php\` را پاک کنید (و بسته‌ی تازه را Extract کنید تا \`.htaccess\` هم آن را ببندد) |"
      RESCUE_PRESENT="yes"
      ISSUES+=("🔴 rescue-db.php (ابزار قدیمیِ بدون رمز) هنوز روی سایت باز است؛ از File Manager پاکش کنید")
    else
      say "| وضعیت | ✅ فایل نیست (صفحه‌ی دیگری پاسخ داد) |"
      RESCUE_PRESENT="no"
    fi
    ;;
  404) say "| وضعیت | ✅ روی سایت نیست |"; RESCUE_PRESENT="no" ;;
  403) say "| وضعیت | ✅ دسترسی وب بسته است (قاعده‌ی \`.htaccess\` بسته‌ی تازه فعال است). اگر فایل هنوز داخل پوشه‌ی سایت هست، از File Manager پاکش کنید |"; RESCUE_PRESENT="no" ;;
  000) say "| وضعیت | ❓ پاسخ نداد |"; RESCUE_PRESENT="no" ;;
  *) say "| وضعیت | کد $CODE_RESCUE |"; RESCUE_PRESENT="no" ;;
esac

# فایل‌های CI گیت‌هاب روی هاست لازم نیستند (از بسته‌ی تازه حذف شده‌اند)
CODE_CI=$(grab "$BASE/.github/workflows/live-check.yml" "$TMP/ci.out")
if [ "$CODE_CI" = "200" ]; then
  say "| فایل‌های CI گیت‌هاب روی هاست | ⚠️ هست — لازم نیست؛ می‌توانید پوشه‌ی \`.github\` را پاک کنید (اختیاری) |"
else
  say "| فایل‌های CI گیت‌هاب روی هاست | ✅ نیست (درست است) |"
fi

# ── ۵-۳) PWA روی خودِ سایت: فایل‌های لازم برای «نصب روی گوشی» ──────────────
#  PWA همان سایت است؛ اگر manifest، سرویس‌ورکر یا آیکون‌ها از هاست جواب ندهند (مثلاً فایروال)، نصب نمی‌شود.
hdr "۵-۳) PWA روی سایت (نصب روی آیفون و اندروید)"
PWA_OK="yes"
MF_OUT="$TMP/manifest.json"
CODE_MF=$(grab "$BASE/manifest.json" "$MF_OUT")
CODE_SWJS=$(grab "$BASE/sw.js" "$TMP/sw.js")
CODE_I192=$(grab "$BASE/assets/img/pwa-icon-192.png" "$TMP/i192.png")
CODE_I512=$(grab "$BASE/assets/img/pwa-icon-512.png" "$TMP/i512.png")
CODE_IAPL=$(grab "$BASE/assets/img/apple-touch-icon.png" "$TMP/iapl.png")
say "| مورد | کد پاسخ | وضعیت |"
say "|---|---|---|"
MF_STATE=$(python3 - "$MF_OUT" <<'PYEOF' 2>/dev/null || echo "bad"
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
ok = d.get("display") == "standalone" and len(d.get("icons", [])) >= 2 and bool(d.get("start_url"))
print("ok" if ok else "bad")
PYEOF
)
if [ "$CODE_MF" = "200" ] && [ "$MF_STATE" = "ok" ]; then
  say "| manifest.json | $CODE_MF | ✅ سالم (حالت تمام‌صفحه + آیکون‌ها) |"
else
  say "| manifest.json | $CODE_MF | ❌ نیست یا خراب است |"; PWA_OK="no"
  ISSUES+=("manifest.json روی سایت درست جواب نمی‌دهد؛ PWA نصب نمی‌شود")
fi
if [ "$CODE_SWJS" = "200" ] && grep -q "addEventListener('push'" "$TMP/sw.js" 2>/dev/null; then
  say "| sw.js (سرویس‌ورکر و اعلان) | $CODE_SWJS | ✅ هست |"
else
  say "| sw.js (سرویس‌ورکر و اعلان) | $CODE_SWJS | ❌ نیست یا قدیمی است |"; PWA_OK="no"
  ISSUES+=("sw.js روی سایت درست جواب نمی‌دهد؛ PWA نصب نمی‌شود و اعلان وب کار نمی‌کند")
fi
PAGES_SITE="https://hosseinbahrami-bot.github.io/eplak-fixed"
CODE_PAGES=$(grab "$PAGES_SITE/manifest.json" "$TMP/pages-manifest.json")
PAGES_UP="no"
if [ "$CODE_PAGES" = "200" ] && grep -q '"standalone"' "$TMP/pages-manifest.json" 2>/dev/null; then PAGES_UP="yes"; fi
if [ "$PAGES_UP" = "yes" ]; then
  say "| PWA روی GitHub Pages (لینک مستقیم) | $CODE_PAGES | ✅ بالاست: $PAGES_SITE/ |"
else
  say "| PWA روی GitHub Pages (لینک مستقیم) | $CODE_PAGES | ⏳ هنوز منتشر نشده — مالک مخزن: Settings ← Pages ← Source: GitHub Actions |"
fi
for pair in "آیکون ۱۹۲|$CODE_I192" "آیکون ۵۱۲|$CODE_I512" "آیکون آیفون (apple-touch-icon)|$CODE_IAPL"; do
  label="${pair%%|*}"; c="${pair#*|}"
  if [ "$c" = "200" ]; then
    say "| $label | $c | ✅ هست |"
  else
    say "| $label | $c | ❌ نیست |"; PWA_OK="no"; ISSUES+=("$label روی سایت نیست؛ PWA نصب نمی‌شود")
  fi
done
say ""

# ── ۶) لینک‌های دانلود روی گیت‌هاب ────────────────────────────────────────
hdr "۶) لینک‌های دانلود (گیت‌هاب)"
ZIP_URL="https://github.com/hosseinbahrami-bot/eplak-fixed/raw/main/eplak-fixed-update.zip"
REL_BASE="https://github.com/hosseinbahrami-bot/eplak-fixed/releases/download/v2.0-eplak-update"
APK_URL="$REL_BASE/eplak-app.apk"
IPA_URL="$REL_BASE/eplak-app-unsigned.ipa"
XPROJ_URL="$REL_BASE/eplak-ios-project.zip"
say "| فایل | کد پاسخ | حجم | وضعیت |"
say "|---|---|---|---|"
for pair in "بسته‌ی سایت (zip)|$ZIP_URL" "اپ اندروید (APK)|$APK_URL" "اپ iOS (IPA بدون امضا)|$IPA_URL" "پروژه‌ی Xcode (zip)|$XPROJ_URL"; do
  label="${pair%%|*}"; url="${pair#*|}"
  # فقط هدرها را می‌خوانیم (سرور گیت‌هاب ۳۰۲ می‌دهد و برای بررسی همین کافی است)
  headers=$(curl -sIL --max-time 40 "$url" 2>/dev/null || echo '')
  code=$(printf '%s' "$headers" | grep -oE '^HTTP/[0-9.]+ [0-9]+' | tail -1 | awk '{print $2}')
  code="${code:-000}"
  size=$(printf '%s' "$headers" | grep -i '^content-length:' | tail -1 | tr -dc '0-9')
  size="${size:-0}"
  case "$code" in
    200|206|302) note="✅ قابل دانلود" ;;
    404) note="❌ پیدا نشد"; STATUS="fail"; ISSUES+=("لینک دانلود «$label» کار نمی‌کند") ;;
    000) note="❓ پاسخ نداد" ;;
    *) note="کد $code" ;;
  esac
  say "| $label | $code | $size بایت | $note |"
done
say ""
say "> لینک‌ها: بسته‌ی سایت ← \`$ZIP_URL\` • اپ اندروید ← \`$APK_URL\` • اپ iOS ← \`$IPA_URL\` • پروژه‌ی Xcode ← \`$XPROJ_URL\`"

# ── ۷) وضعیت فایل APK منتشرشده (از روی صفحه‌ی Releases) ───────────────────
hdr "۷) اپ اندروید منتشرشده"
REL_JSON="$TMP/release.json"
gh api "repos/hosseinbahrami-bot/eplak-fixed/releases/tags/v2.0-eplak-update" > "$REL_JSON" 2>/dev/null || echo '{}' > "$REL_JSON"

APK_SIZE=$(python3 - "$REL_JSON" <<'PYEOF' 2>/dev/null || echo 0
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    for a in d.get("assets", []):
        if a.get("name") == "eplak-app.apk":
            print(a.get("size", 0))
except Exception:
    print(0)
PYEOF
)
BODY_TXT=$(python3 - "$REL_JSON" <<'PYEOF' 2>/dev/null || echo ""
import json, sys
try:
    print(json.load(open(sys.argv[1])).get("body", ""))
except Exception:
    print("")
PYEOF
)
VER=$(printf '%s' "$BODY_TXT" | grep -oE 'نسخه‌ی اپ \| `[^`]+`' | head -1 | grep -oE '`[^`]+`' | tr -d '`')
COMMIT=$(printf '%s' "$BODY_TXT" | grep -oE 'کامیت \| `[^`]+`' | head -1 | grep -oE '`[^`]+`' | tr -d '`')
FCM_LINE=$(printf '%s' "$BODY_TXT" | grep -oE 'فایربیس در بیلد \| [^|]+' | head -1 | sed 's/.*| //' | sed 's/ *$//')
if [ -z "$FCM_LINE" ]; then
  # سازگاری با توضیحات قدیمی Releases (قبل از اصلاح متن‌ها)
  FCM_LINE=$(printf '%s' "$BODY_TXT" | grep -oE 'اعلان فایربیس \(اپ بسته\) \| [^|]+' | head -1 | sed 's/.*| //' | sed 's/ *$//')
fi
LINK_LINE=$(printf '%s' "$BODY_TXT" | grep -oE 'متصل به پروژه‌ی [0-9]+' | head -1)

say "| مورد | مقدار |"
say "|---|---|"
say "| نسخه‌ی اپ | \`${VER:-؟}\` |"
say "| کامیت ساخته‌شده | \`${COMMIT:-؟}\` |"
say "| حجم فایل | ${APK_SIZE:-0} بایت |"
APK_VER_NUM="$(printf '%s' "${VER:-}" | awk -F. '{print $3+0}')"
if [ "${APK_VER_NUM:-0}" -ge 14 ] 2>/dev/null; then
  say "| نسخه‌ی تازه اپ (۲.۰.۱۴ یا بالاتر) | ✅ \`${VER}\` |"
else
  say "| نسخه‌ی تازه اپ | ⚠️ \`${VER:-؟}\` — نسخه‌ی ۲.۰.۱۴ حذف اعلان، سپر آفلاین و ورود دوباره را دارد |"
  ISSUES+=("روی گوشی نسخه‌ی ۲.۰.۱۴ یا بالاتر نصب کنید (نسخه‌ی فعلی Releases: ${VER:-؟})")
fi
say "| فایربیس داخل اپ | ${FCM_LINE:-؟} |"
say "| اتصال پروژه | ${LINK_LINE:-—} |"
if printf '%s' "$FCM_LINE" | grep -qE "گنجانده|متصل"; then
  say "| نتیجه | ✅ کد و تنظیمات فایربیس داخل بیلد اپ هست (رسیدن اعلان در حالت بسته بودن اپ باید روی گوشی تأیید شود) |"
  APK_FCM="wired"
elif printf '%s' "$FCM_LINE" | grep -q "فعال"; then
  say "| نتیجه | ⚠️ متن قدیمی Releases — «فعال» ادعای تأییدنشده است؛ به‌جای آن «گنجانده شد» نوشته می‌شود |"
  APK_FCM="wired"
else
  say "| نتیجه | ⏳ اپ فعلی بدون فایربیس ساخته شده |"
  APK_FCM="no"
fi

# ── ۸) امکانات نسخه‌ی جدید (آنلاین‌اجباری، حذف اعلان، ورود دوباره) ─────────
hdr "۸) امکانات نسخه‌ی جدید"
say "> این بخش نشانه‌های چهار خواسته‌ی تازه را روی سایت بررسی می‌کند:"
say "> ۱) اپ فقط آنلاین کار کند • ۲) حذف اعلان • ۳) اعلان فوری پس از ثبت درخواست •"
say "> ۴) درخواست دوباره‌ی کد تایید پس از خروج از اپ."
say ""
say "| مورد | کد پاسخ | وضعیت |"
say "|---|---|---|"

# ۱) نقطه‌ی اتصال اینترنت
CODE_PING=$(grab "$BASE/api/ping.php" "$TMP/ping.out")
if [ "$CODE_PING" = "200" ] && has "$TMP/ping.out" '"online":true'; then
  say "| \`api/ping.php\` (بررسی اتصال) | $CODE_PING | ✅ هست و پاسخ می‌دهد |"
  NEW_ONLINE="yes"
else
  say "| \`api/ping.php\` (بررسی اتصال) | $CODE_PING | ⚠️ نیست — پرده‌ی «بدون اینترنت» کار نمی‌کند |"
  NEW_ONLINE="no"
  ISSUES+=("api/ping.php روی هاست نیست؛ بسته‌ی تازه را روی هاست Extract کنید")
fi

# ۲) سپر آفلاین و دکمه‌های حذف، از روی فایل‌های واقعی روی سرور
CODE_GUARD=$(grab "$BASE/modules/online-guard.js" "$TMP/guard.out")
if [ "$CODE_GUARD" = "200" ] && has "$TMP/guard.out" "eplakOfflineGate"; then
  say "| \`modules/online-guard.js\` (سپر آفلاین) | $CODE_GUARD | ✅ نصب است |"
else
  say "| \`modules/online-guard.js\` (سپر آفلاین) | $CODE_GUARD | ⚠️ نیست |"
fi
CODE_LIVEJS=$(grab "$BASE/modules/live.js" "$TMP/live2.out")
if [ "$CODE_LIVEJS" = "200" ] && has "$TMP/live2.out" "deleteNotifications"; then
  say "| حذف اعلان در \`modules/live.js\` | $CODE_LIVEJS | ✅ هست |"
else
  say "| حذف اعلان در \`modules/live.js\` | $CODE_LIVEJS | ⏳ کد قدیمی است |"
fi
if [ "$CODE_LIVEJS" = "200" ] && has "$TMP/live2.out" "refreshNotificationsNow"; then
  say "| اعلان فوری پس از ثبت درخواست | $CODE_LIVEJS | ✅ هست |"
else
  say "| اعلان فوری پس از ثبت درخواست | $CODE_LIVEJS | ⏳ کد قدیمی است |"
fi
CODE_STORAGE=$(grab "$BASE/core/storage.js" "$TMP/storage.out")
if [ "$CODE_STORAGE" = "200" ] && has "$TMP/storage.out" "prepareAppExit"; then
  say "| پاک شدن حساب پس از خروج از اپ | $CODE_STORAGE | ✅ هست |"
else
  say "| پاک شدن حساب پس از خروج از اپ | $CODE_STORAGE | ⏳ کد قدیمی است |"
fi

# پرده‌ی «بدون اینترنت» باید هم در صفحه باشد و هم محتوا را پنهان کند
CODE_INDEX=$(grab "$BASE/index.html" "$TMP/index2.out")
if [ "$CODE_INDEX" = "200" ] && has "$TMP/index2.out" "eplakOfflineGate"; then
  if has "$TMP/index2.out" "phone-frame { visibility: hidden"; then
    say "| پرده‌ی «بدون اینترنت» در صفحه + پنهان شدن محتوا | $CODE_INDEX | ✅ هست |"
  else
    say "| پرده‌ی «بدون اینترنت» در صفحه | $CODE_INDEX | ⚠️ هست ولی پنهان‌سازی محتوا نیست |"
  fi
else
  say "| پرده‌ی «بدون اینترنت» در صفحه | $CODE_INDEX | ⏳ نیست |"
  ISSUES+=("index.html روی هاست قدیمی است؛ بسته‌ی تازه را Extract کنید")
fi

# نشانه‌های «موقعیت دقیق روی نقشه» و «ارسال عکس/فیلم» روی فایل‌های واقعی سرور
CODE_MAP=$(grab "$BASE/assets/js/ep-map.js" "$TMP/map.out")
if [ "$CODE_MAP" = "200" ] && has "$TMP/map.out" "tile.openstreetmap.org"; then
  say "| موتور نقشه‌ی موقعیت (\`assets/js/ep-map.js\`) | $CODE_MAP | ✅ نصب است |"
else
  say "| موتور نقشه‌ی موقعیت (\`assets/js/ep-map.js\`) | $CODE_MAP | ⏳ نیست |"
  ISSUES+=("assets/js/ep-map.js روی هاست نیست؛ بسته‌ی تازه را Extract کنید")
fi
CODE_REPORTS=$(grab "$BASE/modules/reports.js" "$TMP/reportsjs.out")
if [ "$CODE_REPORTS" = "200" ] && has "$TMP/reportsjs.out" "getCurrentPosition"; then
  say "| GPS واقعی گوشی در فرم ثبت درخواست | $CODE_REPORTS | ✅ هست |"
else
  say "| GPS واقعی گوشی در فرم ثبت درخواست | $CODE_REPORTS | ⏳ کد قدیمی است |"
fi
if [ "$CODE_INDEX" = "200" ] && has "$TMP/index2.out" "reportMapPicker"; then
  say "| نقشه‌ی واقعی در مرحله‌ی «موقعیت» صفحه‌ی اپ | $CODE_INDEX | ✅ هست |"
else
  say "| نقشه‌ی واقعی در مرحله‌ی «موقعیت» صفحه‌ی اپ | $CODE_INDEX | ⏳ کد قدیمی است |"
fi
if [ "$CODE_STORAGE" = "200" ] && has "$TMP/storage.out" "syncFormDataToBackendWithProgress"; then
  say "| آپلود عکس/فیلم با نمایش درصد پیشرفت | $CODE_STORAGE | ✅ هست |"
else
  say "| آپلود عکس/فیلم با نمایش درصد پیشرفت | $CODE_STORAGE | ⏳ کد قدیمی است |"
fi

# نمودار درصدیِ «هر فایل» + کاشی‌های نقشه از سرور خودِ ای‌پلاک
CODE_UPP=$(grab "$BASE/core/upload-progress.js" "$TMP/upp.out")
if [ "$CODE_UPP" = "200" ] && has "$TMP/upp.out" "EplakUploadProgress"; then
  say "| نمودار درصدیِ بارگذاری هر فایل (\`core/upload-progress.js\`) | $CODE_UPP | ✅ نصب است |"
else
  say "| نمودار درصدیِ بارگذاری هر فایل (\`core/upload-progress.js\`) | $CODE_UPP | ⏳ نیست |"
  ISSUES+=("core/upload-progress.js روی هاست نیست؛ بسته‌ی تازه را Extract کنید")
fi
# z=5 در محدوده‌ی «نمای کلی» است و به محدوده‌ی ایران وابسته نیست
CODE_TILE=$(grab "$BASE/api/tiles.php?z=5&x=20&y=12" "$TMP/tile.out")
case "$CODE_TILE" in
  200) say "| کاشی نقشه از سرور خودمان (\`api/tiles.php\`) | $CODE_TILE | ✅ جواب می‌دهد (OpenStreetMap از طریق سرور) |" ;;
  429|502|504)
    say "| کاشی نقشه از سرور خودمان (\`api/tiles.php\`) | $CODE_TILE | ⚠️ نصب است ولی از هاست به OpenStreetMap وصل نمی‌شود (خروجی اینترنت هاست) |"
    ISSUES+=("api/tiles.php نصب است ولی هاست به سرور نقشه وصل نمی‌شود؛ از پشتیبانی هاست دسترسی HTTPS خروجی (cURL) را بخواهید") ;;
  *)
    say "| کاشی نقشه از سرور خودمان (\`api/tiles.php\`) | $CODE_TILE | ⏳ نیست |"
    ISSUES+=("api/tiles.php روی هاست نیست؛ بسته‌ی تازه را Extract کنید (نقشه‌ی موقعیت بدون آن در اپ خالی می‌ماند)") ;;
esac

# نشانه‌های سرور تازه: اعلان رویدادی و تاریخ شمسی
CODE_PUSH2=$(grab "$BASE/api/push.php?action=config" "$TMP/push2.out")
if [ "$CODE_PUSH2" = "200" ] && has "$TMP/push2.out" "fcm_ready"; then
  say "| موتور سرور تازه (فایربیس + اعلان رویدادی) | $CODE_PUSH2 | ✅ هست |"
else
  say "| موتور سرور تازه (فایربیس + اعلان رویدادی) | $CODE_PUSH2 | ⏳ سرور قدیمی است |"
fi
say ""

# ── ۹) آزمون واقعی سرتاسری (فقط با EPLAK_SMOKE=1) ─────────────────────────
#  این بخش با یک «شماره‌ی آزمایشی» (۰۹۰۰۰۰۰۰۰۰۰ — شماره‌ای که به هیچ کس تعلق
#  ندارد) یک درخواست ثبت می‌کند، اعلان فوری همان درخواست را می‌خواند، آن را
#  حذف می‌کند و در پایان گزارش آزمایشی را هم پاک می‌کند. هدف: اثبات کارکرد
#  واقعی سه خواسته (اعلان فوری، حذف اعلان، سرور تازه) روی سایت زنده.
if [ "${EPLAK_SMOKE:-0}" = "1" ]; then
  hdr "۹) آزمون واقعی سرتاسری (درخواست ← اعلان فوری ← حذف ← پاک‌سازی)"
  TEST_PHONE="09000000000"
  J="$(mktemp)"

  # ۹-۰) درخواست «پیش‌پرواز» (OPTIONS) — مرورگر/وب‌ویوی اپ وقتی صفحه از
  #      file:// باز می‌شود (origin = null) این را می‌فرستد. اگر پاسخ درست
  #      نباشد، ارسال از داخل اپ بی‌صدا شکست می‌خورد («پیوست‌ها نرسیدند»).
  PRE_CODE=$(curl -sS -L --max-time 25 -A "$UA" -D "$TMP/preflight.hdr" -o "$TMP/preflight.out" -w '%{http_code}' \
    -X OPTIONS -H 'Origin: null' -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: content-type' "$BASE/api/reports.php" 2>/dev/null) || PRE_CODE="000"
  PRE_ACAO=$(tr -d '\r' < "$TMP/preflight.hdr" 2>/dev/null | grep -i '^access-control-allow-origin' | head -1 | cut -d: -f2- | tr -d ' ')
  if [ "$PRE_CODE" = "200" ] || [ "$PRE_CODE" = "204" ]; then
    if [ -n "$PRE_ACAO" ]; then
      say "| ۹-۰ | ✅ درخواست پیش‌پرواز (OPTIONS) پاسخ درست می‌گیرد (کد $PRE_CODE، allow-origin: $PRE_ACAO) |"
    else
      say "| ۹-۰ | ⚠️ پیش‌پرواز پاسخ داد (کد $PRE_CODE) ولی هدر allow-origin ندارد — اپ از مسیر «بدون پیش‌پرواز» استفاده می‌کند |"
    fi
  else
    say "| ۹-۰ | ⚠️ پیش‌پرواز پاسخ درست نگرفت (کد $PRE_CODE) — اپ عمداً درخواست‌ها را «ساده» می‌فرستد تا پیش‌پرواز لازم نشود |"
  fi

  # ۹-۱) ثبت یک درخواست آزمایشی
  SMOKE_CODE=$(curl -sS -L --max-time 40 -A "$UA" -o "$J" -w '%{http_code}' \
    -H 'Content-Type: text/plain;charset=UTF-8' \
    -d "{\"phone\":\"$TEST_PHONE\",\"name\":\"آزمون خودکار سامانه\",\"title\":\"آزمون خودکار سامانه — قابل حذف\",\"description\":\"این رکورد برای بررسی خودکار سامانه ساخته شده و در همان آزمون پاک می‌شود.\",\"category\":\"سایر\"}" \
    "$BASE/api/reports.php" 2>/dev/null) || SMOKE_CODE="000"
  RID=$(python3 - "$J" <<'PYEOF' 2>/dev/null || echo ""
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(d.get("id", "") if d.get("success") else "")
except Exception:
    print("")
PYEOF
)
  RCODE=$(python3 - "$J" <<'PYEOF' 2>/dev/null || echo ""
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(d.get("tracking_code", "") if d.get("success") else "")
except Exception:
    print("")
PYEOF
)
  if [ -n "$RID" ]; then
    say "| ۹-۱ | ✅ درخواست آزمایشی ثبت شد (کد پاسخ $SMOKE_CODE، شناسه $RID، کد پیگیری \`$RCODE\`) |"
  else
    say "| ۹-۱ | ❌ ثبت درخواست آزمایشی ناموفق (کد پاسخ $SMOKE_CODE) |"
    SMOKE_OK="no"
    ISSUES+=("آزمون واقعی: ثبت درخواست روی سایت کار نکرد")
  fi

  # ۹-۲) اعلان فوری همان درخواست باید ساخته شده باشد
  NID=""
  if [ -n "$RCODE" ]; then
    sleep 2
    code=$(curl -sS -L --max-time 40 -A "$UA" -o "$J" -w '%{http_code}' "$BASE/api/notifications.php?phone=$TEST_PHONE&t=$(date +%s)" 2>/dev/null) || code="000"
    NID=$(python3 - "$J" "$RCODE" <<'PYEOF' 2>/dev/null || echo ""
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    for n in d.get("notifications", []):
        if sys.argv[2] and sys.argv[2] in str(n.get("body", "")):
            print(n.get("id", ""))
            break
    else:
        if d.get("notifications"):
            print(d["notifications"][0].get("id", ""))
except Exception:
    print("")
PYEOF
)
    HAS_CODE=$(python3 - "$J" "$RCODE" <<'PYEOF' 2>/dev/null || echo "no"
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    body = " ".join(str(n.get("body", "")) for n in d.get("notifications", []))
    print("yes" if (sys.argv[2] in body and "ساعت" in body) else "no")
except Exception:
    print("no")
PYEOF
)
    if [ "$HAS_CODE" = "yes" ]; then
      say "| ۹-۲ | ✅ اعلان فوری «درخواست ثبت شد» با کد پیگیری و تاریخ/ساعت رسید (شناسه $NID) |"
    else
      say "| ۹-۲ | ❌ اعلان فوری با کد پیگیری/تاریخ پیدا نشد (کد پاسخ $code) |"
      ISSUES+=("آزمون واقعی: اعلان فوری پس از ثبت درخواست ساخته نشد")
    fi
  fi

  # ۹-۳) حذف همان اعلان برای همین کاربر
  if [ -n "$NID" ]; then
    code=$(curl -sS -L --max-time 40 -A "$UA" -o "$J" -w '%{http_code}' \
      -H 'Content-Type: application/x-www-form-urlencoded;charset=UTF-8' \
      -d "action=delete&phone=$TEST_PHONE&ids=$NID" "$BASE/api/notifications.php" 2>/dev/null) || code="000"
    DEL_HIDDEN=$(python3 - "$J" <<'PYEOF' 2>/dev/null || echo ""
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(d.get("hidden", "") if d.get("success") else "")
except Exception:
    print("")
PYEOF
)
    sleep 1
    curl -sS -L --max-time 40 -A "$UA" -o "$J" "$BASE/api/notifications.php?phone=$TEST_PHONE&t=$(date +%s)" >/dev/null 2>&1 || true
    STILL=$(python3 - "$J" "$NID" <<'PYEOF' 2>/dev/null || echo "yes"
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    ids = [str(n.get("id", "")) for n in d.get("notifications", [])]
    print("yes" if sys.argv[2] in ids else "no")
except Exception:
    print("yes")
PYEOF
)
    if [ -n "$DEL_HIDDEN" ] && [ "$STILL" = "no" ]; then
      say "| ۹-۳ | ✅ اعلان حذف شد و از فهرست همین کاربر رفت (کد پاسخ $code، مخفی‌شده: $DEL_HIDDEN) |"
      SMOKE_OK="yes"
    else
      say "| ۹-۳ | ❌ حذف اعلان تأیید نشد (کد پاسخ $code، مخفی‌شده: ${DEL_HIDDEN:-—}، هنوز در فهرست: $STILL) |"
      ISSUES+=("آزمون واقعی: حذف اعلان کار نکرد")
    fi
  fi

  # ۹-۴) پاک‌سازی: گزارش آزمایشی حذف می‌شود که در پنل ادمین نماند
  if [ -n "$RID" ]; then
    code=$(curl -sS -L --max-time 40 -A "$UA" -X DELETE -o "$J" -w '%{http_code}' \
      "$BASE/api/reports.php?id=$RID&phone=$TEST_PHONE" 2>/dev/null) || code="000"
    CLEAN=$(python3 - "$J" <<'PYEOF' 2>/dev/null || echo "no"
import json, sys
try:
    print("yes" if json.load(open(sys.argv[1])).get("success") else "no")
except Exception:
    print("no")
PYEOF
)
    if [ "$CLEAN" = "yes" ]; then
      say "| ۹-۴ | ✅ گزارش آزمایشی پاک شد (کد پاسخ $code) — داده‌ی آزمایشی روی سایت نماند |"
    else
      say "| ۹-۴ | ⚠️ گزارش آزمایشی پاک نشد (کد پاسخ $code) — در پنل ادمین گزارش «آزمون خودکار سامانه — قابل حذف» را دستی حذف کنید |"
      ISSUES+=("گزارش آزمایشی روی سایت مانده؛ از پنل ادمین حذفش کنید")
    fi
  fi

  # ۹-۵) آزمون واقعی «ارسال عکس همراه گزارش از مسیر JSON» — همان مسیری که اپ
  #      استفاده می‌کند (multipart روی این هاست با کد 403 بسته است).
  PNG="$TMP/smoke-photo.png"
  printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d > "$PNG" 2>/dev/null || true
  MRI=""; MSG_CODE=""; MEDIA_COUNT=""; MEDIA_URL=""; GEO_LAT=""; GEO_KEY="no"
  BODY="$TMP/smoke-media.json"
  if [ -s "$PNG" ]; then
    python3 - "$PNG" "$BODY" "$TEST_PHONE" <<'PYEOF' 2>/dev/null || true
import base64, json, sys
png, out, phone = sys.argv[1], sys.argv[2], sys.argv[3]
b64 = base64.b64encode(open(png, 'rb').read()).decode('ascii')
body = {
    "phone": phone,
    "name": "آزمون خودکار سامانه",
    "title": "آزمون خودکار پیوست — قابل حذف",
    "description": "بررسی خودکار آپلود عکس و ثبت موقعیت GPS",
    "category": "سایر",
    "location": "آزمون موقعیت — خیابان نمونه",
    "lat": 35.3242100,
    "lng": 51.6455300,
    "media": [{"name": "smoke.png", "mime": "image/png", "data": "data:image/png;base64," + b64}],
}
open(out, 'w', encoding='utf-8').write(json.dumps(body, ensure_ascii=False))
PYEOF
    if [ -s "$BODY" ]; then
      MSG_CODE=$(curl -sS -L --max-time 60 -A "$UA" -o "$J" -w '%{http_code}' \
        -H 'Content-Type: text/plain;charset=UTF-8' --data-binary "@$BODY" \
        "$BASE/api/reports.php" 2>/dev/null) || MSG_CODE="000"
    fi
    read_smoke_field() { # $1 = نام کلید در پاسخ JSON
      python3 - "$J" "$1" <<'PYEOF' 2>/dev/null || echo ""
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    key = sys.argv[2]
    if key == "media_url":
        m = d.get("media") or []
        print(m[0].get("url", "") if m else "")
    elif key == "lat":
        print(d.get("lat", "") if d.get("lat") is not None else "")
    elif key == "media_count":
        print(d.get("media_count", ""))
    elif key == "has_lat_key":
        print("yes" if "lat" in d else "no")
    else:
        print(d.get(key, "") if d.get("success") else "")
except Exception:
    print("")
PYEOF
    }
    MRI=$(read_smoke_field id)
    MEDIA_COUNT=$(read_smoke_field media_count)
    MEDIA_URL=$(read_smoke_field media_url)
    GEO_LAT=$(read_smoke_field lat)
    GEO_KEY=$(read_smoke_field has_lat_key)
  fi

  if [ "$MEDIA_COUNT" = "1" ] && [ -n "$MEDIA_URL" ]; then
    say "| ۹-۵ | ✅ گزارش با عکس از مسیر JSON ثبت شد (شناسه $MRI، تعداد پیوست: $MEDIA_COUNT) |"
  else
    SNIPPET=""
    if [ -s "$J" ]; then
      SNIPPET=$(head -c 400 "$J" 2>/dev/null | tr '\n\r\t' '   ' | tr -d '|' | cut -c1-260)
    fi
    say "| ۹-۵ | ❌ ارسال گزارش با عکس ناموفق بود (کد پاسخ $MSG_CODE، تعداد پیوست: ${MEDIA_COUNT:-—}) |"
    say "| ۹-۵-ب | پاسخ سرور: \`${SNIPPET:-—}\` |"
    SMOKE_OK="no"
    ISSUES+=("آزمون واقعی: ارسال عکس از مسیر JSON روی هاست کار نکرد (کد $MSG_CODE)")
  fi

  # ۹-۵-۲) مسیر «ارسال تکه‌تکه‌ی فایل حجیم» (فیلم‌ها) — روی نسخه‌ی تازه فعال است
  if [ -n "$MRI" ] && [ -s "$PNG" ]; then
    CHUNK_BODY="$TMP/smoke-chunk.json"
    python3 - "$PNG" "$CHUNK_BODY" "$TEST_PHONE" "$MRI" <<'PYEOF' 2>/dev/null || true
import base64, json, sys
png, out, phone, rid = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
b64 = base64.b64encode(open(png, 'rb').read()).decode('ascii')
body = {
    "phone": phone, "reportId": int(rid), "uploadId": "smokechunk0000abc",
    "index": 0, "total": 1, "name": "smoke-chunk.png", "mime": "image/png",
    "data": "data:image/png;base64," + b64,
}
open(out, 'w', encoding='utf-8').write(json.dumps(body, ensure_ascii=False))
PYEOF
    CHUNK_CODE=$(curl -sS -L --max-time 60 -A "$UA" -o "$J.chunk" -w '%{http_code}' \
      -H 'Content-Type: text/plain;charset=UTF-8' --data-binary "@$CHUNK_BODY" \
      "$BASE/api/media.php?action=chunk" 2>/dev/null) || CHUNK_CODE="000"
    CHUNK_DONE=$(python3 - "$J.chunk" <<'PYEOF' 2>/dev/null || echo "no"
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print("yes" if (d.get("success") and d.get("done")) else "no")
except Exception:
    print("no")
PYEOF
)
    if [ "$CHUNK_DONE" = "yes" ]; then
      say "| ۹-۵-۲ | ✅ ارسال تکه‌تکه‌ی فایل حجیم (فیلم) هم کار می‌کند (کد $CHUNK_CODE) |"
    elif [ "$CHUNK_CODE" = "404" ] || [ "$CHUNK_DONE" = "no" ]; then
      say "| ۹-۵-۲ | ⏳ ارسال تکه‌تکه روی این هاست فعال نیست (کد $CHUNK_CODE) — برای فیلم‌های حجیم بسته‌ی تازه را Extract کنید |"
      media_chunk_old="yes"
    else
      say "| ۹-۵-۲ | ⚠️ پاسخ سرور برای ارسال تکه‌تکه: کد $CHUNK_CODE |"
    fi
  fi

  # ۹-۶) همان عکس باید از روی هاست قابل نمایش باشد (پنل ادمین همین آدرس را نشان می‌دهد)
  if [ -n "$MEDIA_URL" ]; then
    case "$MEDIA_URL" in
      http*) MU="$MEDIA_URL" ;;
      /*)    MU="$BASE$MEDIA_URL" ;;
      *)     MU="$BASE/${MEDIA_URL#./}" ;;
    esac
    CODE_IMG=$(grab "$MU" "$TMP/smoke-get.png")
    if [ "$CODE_IMG" = "200" ] && [ "$(wc -c < "$TMP/smoke-get.png" 2>/dev/null | tr -d ' ')" -gt 0 ]; then
      say "| ۹-۶ | ✅ عکس از روی هاست نمایش داده می‌شود (کد $CODE_IMG) — همین آدرس در پنل ادمین دیده می‌شود |"
    else
      say "| ۹-۶ | ⚠️ عکس ذخیره شد ولی از روی هاست خوانده نشد (کد $CODE_IMG) — دسترسی پوشه‌ی \`uploads\` را بررسی کنید |"
      ISSUES+=("فایل آپلودشده از روی هاست خوانده نشد (دسترسی uploads)")
    fi
  fi

  # ۹-۷) سایت باید مختصات GPS را هم ذخیره کرده باشد
  #     (اگر کد هاست قدیمی باشد، پاسخ سرور اصلاً کلید lat را ندارد)
  if [ -n "$GEO_LAT" ]; then
    say "| ۹-۷ | ✅ موقعیت GPS روی سرور ذخیره شد (عرض جغرافیایی: $GEO_LAT) |"
  elif [ "$GEO_KEY" = "yes" ]; then
    say "| ۹-۷ | ❌ مختصات GPS ذخیره نشد — ستون‌های موقعیت در دیتابیس ساخته نشده‌اند |"
    SMOKE_OK="no"
    ISSUES+=("ستون‌های lat/lng در دیتابیس ساخته نشد؛ پنل ادمین ← تنظیمات ← «ترمیم اسکیمای دیتابیس» را بزنید")
  else
    say "| ۹-۷ | ⏳ نسخه‌ی کد روی هاست قدیمی است (پاسخ سرور کلید موقعیت ندارد) — بسته‌ی تازه را Extract کنید |"
  fi

  # ۹-۸) پاک‌سازی گزارش و فایل آزمایشی
  if [ -n "$MRI" ]; then
    code=$(curl -sS -L --max-time 60 -A "$UA" -X DELETE -o "$J" -w '%{http_code}' \
      "$BASE/api/reports.php?id=$MRI&phone=$TEST_PHONE" 2>/dev/null) || code="000"
    CLEAN2=$(python3 - "$J" <<'PYEOF' 2>/dev/null || echo "no"
import json, sys
try:
    print("yes" if json.load(open(sys.argv[1])).get("success") else "no")
except Exception:
    print("no")
PYEOF
)
    if [ "$CLEAN2" = "yes" ]; then
      say "| ۹-۸ | ✅ گزارش آزمایشی پیوست‌دار و فایلش پاک شد (کد پاسخ $code) |"
    else
      say "| ۹-۸ | ⚠️ گزارش آزمایشی پیوست‌دار پاک نشد (کد پاسخ $code) — در پنل ادمین حذفش کنید |"
    fi
  fi

  # ۹-۹) سقف حجم بدنه روی این هاست — دلیل «پیوست‌ها به سرور نرسیدند» این بود
  #      که درخواست حاوی base64 عکس چند مگابایتی بود. حالا اپ فقط بسته‌های
  #      کوچک (≈۷۰۰ کیلوبایت) می‌فرستد؛ اینجا می‌سنجیم هاست تا چه حجمی را
  #      می‌پذیرد. پاسخ ۴۰۰ (شماره‌ی نامعتبر) یعنی «بدنه پذیرفته شد».
  BODY_OK_MAX="0"
  for KB in 64 512 1024 2048; do
    PF="$TMP/probe-$KB.json"
    python3 - "$PF" "$KB" <<'PROBE_PY' 2>/dev/null || true
import json, sys
path, kb = sys.argv[1], int(sys.argv[2])
body = {"phone": "09000000001", "title": "probe", "description": "x" * (kb * 1024)}
open(path, 'w', encoding='utf-8').write(json.dumps(body))
PROBE_PY
    PCODE=$(curl -sS -L --max-time 90 -A "$UA" -o "$TMP/probe.out" -w '%{http_code}' \
      -H 'Content-Type: text/plain;charset=UTF-8' --data-binary "@$PF" \
      "$BASE/api/reports.php" 2>/dev/null) || PCODE="000"
    if [ "$PCODE" = "400" ] || [ "$PCODE" = "422" ] || [ "$PCODE" = "200" ]; then
      BODY_OK_MAX="$KB"
    fi
    rm -f "$PF"
  done
  if [ "$BODY_OK_MAX" -ge 512 ]; then
    say "| ۹-۹ | ✅ هاست بدنه‌ی تا ${BODY_OK_MAX} کیلوبایتی را می‌پذیرد (اپ بسته‌های ≈۷۰۰ کیلوبایتی می‌فرستد) |"
  elif [ "$BODY_OK_MAX" -ge 64 ]; then
    say "| ۹-۹ | ⚠️ هاست فقط بدنه‌ی تا ${BODY_OK_MAX} کیلوبایتی را می‌پذیرد — اندازه‌ی تکه‌های اپ باید کمتر شود |"
  else
    say "| ۹-۹ | ⚠️ سنجش حجم بدنه انجام نشد (شاید فایروال درخواست‌های بزرگ را می‌بندد) |"
  fi
  media_body_size="$BODY_OK_MAX"

  # ۹-۱۰) آزمون «فایلِ واقعی»: عکسی با محتوای تصادفی (مثل عکس گوشی) از همان
  #       مسیری که اپ استفاده می‌کند فرستاده می‌شود. آزمون‌های قبلی با PNG
  #       کوچک و کم‌حجم انجام می‌شد و همین باعث می‌شد فایروال هاست (که به
  #       محتوای فایل و حجم واقعی حساس است) هرگز آزموده نشود. اینجا:
  #       گزارش ساخته می‌شود → عکس واقعی داخل همان درخواست → سپس همان عکس از
  #       مسیر تکه‌تکه (۲۰۰ کیلوبایتی، دقیقاً مثل اپ) → و در پایان با کنش
  #       پشتیبانِ add_media. نتیجه‌ی هر سه مسیر جداگانه گزارش می‌شود.
  REAL_IMG="$TMP/real-photo.jpg"
  python3 - "$REAL_IMG" <<'REALPY' 2>/dev/null || true
import io, sys, zlib, struct, random
# ساخت JPEG واقعی ۶۴۰×۴۸۰ با نویز تصادفی (ساختار سالم + حجم واقعی ~۴۰۰KB)
w, h = 640, 480
random.seed(7)
pixels = bytes(random.getrandbits(8) for _ in range(w * h * 3))
def seg(marker, data):
    return b'\xff' + marker + struct.pack('>H', len(data) + 2) + data
out = io.BytesIO()
out.write(b'\xff\xd8')
out.write(seg(b'\xe0', b'JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'))
qt = bytes([16] * 64)
out.write(seg(b'\xdb', b'\x00' + qt))
out.write(seg(b'\xdb', b'\x01' + qt))
out.write(seg(b'\xc0', struct.pack('>BHHB', 8, h, w, 3) + bytes([1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0])))
def huff(bits):
    return bytes([0] * 16) + bytes(bits)
out.write(seg(b'\xc4', b'\x00' + huff([])))
out.write(seg(b'\xda', b'\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00'))
out.write(pixels)
out.write(b'\xff\xd9')
open(sys.argv[1], 'wb').write(out.getvalue())
REALPY
  if [ -s "$REAL_IMG" ]; then
    REAL_KB=$(( $(wc -c < "$REAL_IMG") / 1024 ))
    REAL_BODY="$TMP/real-inline.json"
    python3 - "$REAL_IMG" "$REAL_BODY" "$TEST_PHONE" <<'REALJSON' 2>/dev/null || true
import base64, json, sys
img, out, phone = sys.argv[1], sys.argv[2], sys.argv[3]
b64 = base64.b64encode(open(img, 'rb').read()).decode('ascii')
body = {
    "phone": phone, "title": "آزمون عکس واقعی", "description": "بررسی مسیر فایل واقعی",
    "category": "سایر",
    "media": [{"name": "real-photo.jpg", "mime": "image/jpeg", "data": "data:image/jpeg;base64," + b64}],
}
open(out, 'w', encoding='utf-8').write(json.dumps(body, ensure_ascii=False))
REALJSON
    REAL_CODE=$(curl -sS -L --max-time 120 -A "$UA" -o "$TMP/real.out" -w '%{http_code}' \
      -H 'Content-Type: text/plain;charset=UTF-8' --data-binary "@$REAL_BODY" \
      "$BASE/api/reports.php" 2>/dev/null) || REAL_CODE="000"
    REAL_ID=$(python3 - "$TMP/real.out" <<'REALID' 2>/dev/null || echo ""
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(d.get('id', '') if d.get('success') else '')
except Exception:
    print('')
REALID
)
    REAL_MEDIA=$(python3 - "$TMP/real.out" <<'REALCNT' 2>/dev/null || echo ""
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(d.get('media_count', 0))
except Exception:
    print('')
REALCNT
)
    if [ -n "$REAL_ID" ] && [ "${REAL_MEDIA:-0}" -ge 1 ] 2>/dev/null; then
      say "| ۹-۱۰ | ✅ عکس واقعی ${REAL_KB} کیلوبایتی همراه گزارش ذخیره شد (گزارش $REAL_ID) |"
      REAL_OK="yes"
    else
      SNIP2=$(head -c 300 "$TMP/real.out" 2>/dev/null | tr '\n\r\t' '   ' | tr -d '|' | cut -c1-200)
      say "| ۹-۱۰ | ❌ ارسال عکس واقعی ${REAL_KB} کیلوبایتی ناموفق بود (کد $REAL_CODE) |"
      say "| ۹-۱۰-ب | پاسخ سرور: \`${SNIP2:-—}\` |"
      ISSUES+=("آزمون فایل واقعی: عکس ${REAL_KB} کیلوبایتی همراه گزارش ذخیره نشد (کد $REAL_CODE)")
      REAL_OK="no"
    fi

    # ۹-۱۱) همان عکس از مسیر تکه‌تکه‌ی اپ (تکه‌های ۲۰۰ کیلوبایتی)
    if [ -n "$REAL_ID" ]; then
      REAL_MEDIA2="$TMP/real-media2.json"
      python3 - "$REAL_IMG" "$REAL_MEDIA2" "$TEST_PHONE" "$REAL_ID" <<'REALCHUNK' 2>/dev/null || true
import base64, json, sys
img, out, phone, rid = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
b64 = base64.b64encode(open(img, 'rb').read()).decode('ascii')
body = {
    "phone": phone, "reportId": int(rid), "uploadId": "realchunk0000001",
    "index": 0, "total": 1, "name": "real-photo-2.jpg", "mime": "image/jpeg",
    "data": "data:image/jpeg;base64," + b64,
}
open(out, 'w', encoding='utf-8').write(json.dumps(body, ensure_ascii=False))
REALCHUNK
      C2_CODE=$(curl -sS -L --max-time 120 -A "$UA" -o "$TMP/real2.out" -w '%{http_code}' \
        -H 'Content-Type: text/plain;charset=UTF-8' --data-binary "@$REAL_MEDIA2" \
        "$BASE/api/media.php?action=chunk" 2>/dev/null) || C2_CODE="000"
      C2_OK=$(python3 - "$TMP/real2.out" <<'C2PY' 2>/dev/null || echo no
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print('yes' if (d.get('success') and d.get('media')) else 'no')
except Exception:
    print('no')
C2PY
)
      if [ "$C2_OK" = "yes" ]; then
        say "| ۹-۱۱ | ✅ همان عکس از مسیر تکه‌تکه‌ی اپ هم ذخیره شد |"
      else
        say "| ۹-۱۱ | ⚠️ مسیر تکه‌تکه عکس واقعی را نپذیرفت (کد $C2_CODE) — اپ از مسیر پشتیبان استفاده می‌کند |"
      fi

      # ۹-۱۲) مسیر پشتیبان: افزودن پیوست از دروازه‌ی گزارش‌ها (add_media)
      REAL_MEDIA3="$TMP/real-media3.json"
      python3 - "$REAL_IMG" "$REAL_MEDIA3" "$TEST_PHONE" "$REAL_ID" <<'REALADD' 2>/dev/null || true
import base64, json, sys
img, out, phone, rid = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
b64 = base64.b64encode(open(img, 'rb').read()).decode('ascii')
body = {
    "action": "add_media", "phone": phone, "reportId": int(rid),
    "name": "real-photo-3.jpg", "mime": "image/jpeg",
    "data": "data:image/jpeg;base64," + b64,
}
open(out, 'w', encoding='utf-8').write(json.dumps(body, ensure_ascii=False))
REALADD
      C3_CODE=$(curl -sS -L --max-time 120 -A "$UA" -o "$TMP/real3.out" -w '%{http_code}' \
        -H 'Content-Type: text/plain;charset=UTF-8' --data-binary "@$REAL_MEDIA3" \
        "$BASE/api/reports.php" 2>/dev/null) || C3_CODE="000"
      C3_OK=$(python3 - "$TMP/real3.out" <<'C3PY' 2>/dev/null || echo no
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print('yes' if (d.get('success') and d.get('media')) else 'no')
except Exception:
    print('no')
C3PY
)
      if [ "$C3_OK" = "yes" ]; then
        say "| ۹-۱۲ | ✅ مسیر پشتیبان (افزودن پیوست از دروازه‌ی گزارش‌ها) هم کار می‌کند |"
        if [ "${REAL_OK:-yes}" = "no" ]; then
          REAL_OK="fallback"
        fi
      else
        say "| ۹-۱۲ | ⚠️ مسیر پشتیبان پاسخ نداد (کد $C3_CODE) — ممکن است هاست هنوز نسخه‌ی تازه را نداشته باشد |"
      fi

      # پاک‌سازی گزارش آزمون
      cleanup_code=$(curl -sS -L --max-time 30 -A "$UA" -o /dev/null -w '%{http_code}' \
        "$BASE/api/reports.php?action=delete&id=$REAL_ID&phone=$TEST_PHONE" 2>/dev/null) || cleanup_code="000"
      say "| ۹-۱۳ | پاک‌سازی گزارش آزمون فایل واقعی (کد $cleanup_code) |"
    fi
  else
    say "| ۹-۱۰ | ⚠️ ساخت عکس آزمون ممکن نشد (python3 در دسترس نبود) |"
  fi

  rm -f "$J"
  say ""
fi

# ── نتیجه‌ی نهایی ─────────────────────────────────────────────────────────
hdr "نتیجه"
NEW_WEB="no"; NEW_API="no"  # توجه: NEW_ONLINE در بخش ۸ تعیین شده و این‌جا صفر نمی‌شود
if has "$LIVE" "registerAppDevice"; then NEW_WEB="yes"; fi
if has "$PUSH" "fcm_ready"; then NEW_API="yes"; fi

if [ "$CODE_LIVE" = "000" ] && [ "$CODE_LOGIN" = "000" ]; then
  say "❓ **سایت از بیرون پاسخ نداد** — یا موقتاً پایین است، یا فقط از داخل ایران در دسترس است."
  say ""
  say "راه جایگزین: خودتان این آدرس را در مرورگر باز کنید و نتیجه را بگویید:"
  say "\`$BASE/admin/version.php\` (بعد از ورود به پنل)"
  STATUS="unreachable"
elif [ "$NEW_WEB" = "yes" ] && [ "$NEW_API" = "yes" ]; then
  say "✅ **نسخه‌ی جدید روی سایت اعمال شده است.** موتور اعلان‌ها (فایربیس) و کد سرور تازه روی سایت فعال است."
  if [ "$ENGINE_OK" = "yes" ] && has "$PUSH" '"fcm_ready":false'; then
    say ""
    say "ℹ️ فایربیس روی سرور آماده است ولی **کلید سرویس هنوز وارد نشده**؛ برای فعال شدن:"
    say "پنل ادمین → تنظیمات → «اعلان گوشی برای اپ اندروید (فایربیس)» → چسباندن فایل JSON کلید سرویس."
  fi
elif [ "$NEW_WEB" = "yes" ] && [ "$NEW_API" = "no" ]; then
  say "⚠️ **بخشی از تغییرات اعمال شده است.** کد سایت (\`modules/live.js\`) تازه است ولی موتور سرور فایربیس پاسخ نمی‌دهد."
  say "یعنی \`shared/fcm.php\` و \`shared/bootstrap.php\` جدید آپلود نشده‌اند."
else
  say "❌ **نسخه‌ی جدید هنوز روی سایت اعمال نشده است.**"
  say ""
  say "یعنی فایل \`eplak-fixed-update.zip\` هنوز روی هاست باز نشده است."
fi

# چک‌لیست وضعیت سه قدم اصلی
say ""
say "**چک‌لیست:**"
say ""
if [ "$CODE_LOGIN" = "500" ]; then
  say "- ❌ **سایت الان دیتابیس را پیدا نمی‌کند** — راه‌حل در بخش ۱-۲ همین گزارش"
fi
if has "$PUSH" '"fcm_ready":true'; then
  say "- ✅ کلید سرویس فایربیس در پنل ثبت شده (سرور آماده‌ی ارسال است)"
else
  say "- ⏳ کلید سرویس فایربیس در پنل ثبت نشده — پنل ادمین → تنظیمات → «اعلان فایربیس»"
fi
if [ "$NEW_VER_PAGE" = "yes" ]; then
  say "- ✅ بسته‌ی تازه‌ی سایت روی هاست باز شده (صفحه‌ی «بررسی نسخه» هست)"
else
  say "- ⏳ بسته‌ی تازه‌ی سایت روی هاست باز نشده — فایل eplak-fixed-update.zip را Extract کنید"
fi
if [ "$APK_FCM" = "wired" ]; then
  say "- ✅ فایل APK منتشرشده کد و تنظیمات فایربیس را دارد (نصبش کنید و رسیدن اعلان را روی گوشی امتحان کنید)"
elif [ "$APK_FCM" = "yes" ]; then
  say "- ✅ فایل APK منتشرشده با اعلان فایربیس ساخته شده (نصبش کنید)"
else
  say "- ⏳ فایل APK فعلی فایربیس ندارد"
fi
if [ "${EPLAK_SMOKE:-0}" = "1" ]; then
  if [ "$SMOKE_OK" = "yes" ]; then
    say "- ✅ آزمون واقعی روی سایت سبز بود: ثبت درخواست ← اعلان فوری با کد پیگیری و تاریخ ← حذف اعلان ← پاک‌سازی"
  else
    say "- ⚠️ آزمون واقعی سرتاسری کامل سبز نشد — بخش ۹ را ببینید"
  fi
fi
if [ "${REAL_OK:-yes}" = "no" ]; then
  STATUS="fail"
  ISSUES+=("مسیر فایل واقعی (عکس چند صد کیلوبایتی) روی هاست کار نکرد — این همان چیزی است که کاربر در اپ می‌بیند")
fi
if [ "${REAL_OK:-yes}" = "fallback" ]; then
  ISSUES+=("مسیر «عکس همراه گزارش» روی این هاست بسته است؛ اپ به‌طور خودکار از مسیر پشتیبان استفاده می‌کند (بررسی شود)")
fi

if [ "${media_chunk_old:-no}" = "yes" ]; then
  say "- ⏳ ارسال فیلم‌های حجیم (تکه‌تکه) روی هاست فعال نشده — بسته‌ی تازه را Extract کنید (عکس‌ها همین حالا کار می‌کنند)"
fi
if [ -n "${media_body_size:-}" ] && [ "${media_body_size}" -lt 512 ] 2>/dev/null; then
  say "- ⚠️ فایروال هاست بدنه‌های بزرگ‌تر از ${media_body_size} کیلوبایت را می‌بندد — اگر پیوستی ارسال نشد، همین را به پشتیبانی هاست بگویید (درخواست‌های POST بزرگ را باز کند)"
fi
if [ "$CODE_MAP" = "200" ] && has "$TMP/map.out" "tile.openstreetmap.org"; then
  say "- ✅ نقشه‌ی موقعیت و GPS در فرم ثبت درخواست روی سایت نصب شده (مرحله‌ی «موقعیت» واقعی است)"
else
  say "- ⏳ نقشه‌ی موقعیت روی سایت نصب نشده — بسته‌ی تازه را Extract کنید"
fi
if [ "$CODE_STORAGE" = "200" ] && has "$TMP/storage.out" "syncFormDataToBackendWithProgress"; then
  say "- ✅ ارسال عکس/فیلم با نمایش درصد پیشرفت روی سایت نصب شده"
else
  say "- ⏳ ارسال عکس/فیلم نسخه‌ی تازه روی سایت نصب نشده — بسته‌ی تازه را Extract کنید"
fi
if [ "$NEW_ONLINE" = "yes" ]; then
  say "- ✅ نقطه‌ی بررسی اتصال (\`api/ping.php\`) و پرده‌ی «بدون اینترنت اتصال ممکن نیست» نصب شده‌اند"
else
  say "- ⏳ پرده‌ی «بدون اینترنت» هنوز روی سایت نصب نشده — بسته‌ی تازه را Extract کنید"
fi
say "- 📱 برای دیدن تعداد گوشی‌های ثبت‌شده: پنل ادمین → «بررسی نسخه» (باید بزرگ‌تر از صفر باشد)"
if [ "$PAGES_UP" = "yes" ]; then
  say "- ✅ PWA روی GitHub Pages بالاست (لینک مستقیم): $PAGES_SITE/"
else
  say "- ⏳ PWA روی GitHub Pages هنوز منتشر نشده — مالک مخزن یک‌بار: Settings ← Pages ← Source: GitHub Actions؛ بعد Re-run آخرین اجرای «Build PWA package»"
fi
if [ "$PWA_OK" = "yes" ]; then
  say "- ✅ PWA روی سایت قابل نصب است (manifest، سرویس‌ورکر و آیکون‌ها در دسترس‌اند)؛ نصب روی آیفون: Safari ← «افزودن به صفحه اصلی»"
else
  say "- ⏳ فایل‌های PWA (manifest/سرویس‌ورکر/آیکون) روی سایت کامل نیست — بسته‌ی تازه را Extract کنید"
fi
if [ "$RESCUE_PRESENT" = "yes" ]; then
  say "- 🔴 ابزار قدیمیِ \`rescue-db.php\` (بدون رمز) هنوز روی سایت باز است — از cPanel → File Manager پاکش کنید"
fi

if [ ${#ISSUES[@]} -gt 0 ]; then
  say ""
  say "**نکته‌های نیازمند پیگیری:**"
  for i in "${ISSUES[@]}"; do say "- $i"; done
fi

rm -rf "$TMP"
if [ "$STATUS" = "fail" ]; then exit 1; fi
exit 0
