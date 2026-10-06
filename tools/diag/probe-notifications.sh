#!/usr/bin/env bash
# ============================================================================
#  tools/diag/probe-notifications.sh — کاوش «اعلان‌ها» روی سرور زنده‌ی ای‌پلاک
#
#  چرا؟ از محیط توسعه (سندباکس) نمی‌شود به eplak.ir رسید؛ اما رانر GitHub Actions
#  می‌تواند. این اسکریپت همان درخواست‌هایی را می‌زند که اپ/سایت می‌زنند و «کد پاسخ +
#  بدنه‌ی کامل» را چاپ می‌کند تا علت واقعیِ «اعلان‌ها نمایش داده نمی‌شود» معلوم شود
#  (api/notifications.php خطایش را در بدنه‌ی JSON برمی‌گرداند: {'success':false,'error':…}).
#
#  اجرا:  bash tools/diag/probe-notifications.sh [آدرس پایه]
#  خروجی: متن گزارش روی stdout (ورک‌فلو آن را در ci-logs و برچسب artifacts/diag می‌گذارد)
# ============================================================================
set -uo pipefail

BASE="${1:-${EPLAK_BASE:-https://eplak.ir/eplak-fixed}}"
BASE="${BASE%/}"
API="$BASE/api"
PHONE="${EPLAK_DIAG_PHONE:-09120000000}"      # شماره‌ی آزمایشی (کاربر واقعی نیست)
OUT_DIR="${2:-diag-out}"
mkdir -p "$OUT_DIR"

echo "═══════════════════════════════════════════════════════════════"
echo " کاوش اعلان‌ها روی سرور زنده: $BASE"
echo " زمان: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "═══════════════════════════════════════════════════════════════"

out_file() {  # نام کاوش → مسیر فایل خروجی
  echo "$OUT_DIR/$(echo "$1" | tr ' /?&=' '_____' ).txt"
}

probe() {  # probe <نام> <متد> <آدرس> [بدنه] [هدرهای اضافی]
  local name="$1" method="$2" url="$3" body="${4:-}" hdr="${5:-}"
  local out; out="$(out_file "$name")"
  echo
  echo "──── $name"
  echo "     $method $url"
  [ -n "$body" ] && echo "     body: $body"
  local args=(-sS -m 40 -X "$method" -w '\n[HTTP %{http_code}] time=%{time_total}s size=%{size_download}B' -D "$out.headers")
  [ -n "$hdr" ] && args+=(-H "$hdr")
  if [ "$method" = "POST" ]; then
    args+=(-H 'Content-Type: application/json' --data "$body")
  fi
  if curl "${args[@]}" "$url" > "$out" 2>"$out.err"; then
    head -c 2000 "$out"
    echo
    echo "     هدرها: $(grep -iE '^(content-type|x-powered-by|server):' "$out.headers" | tr -d '\r' | paste -sd' | ' -)"
  else
    echo "     ❌ درخواست ناموفق: $(head -c 300 "$out.err")"
  fi
}

# ۱) سلامت پایه
probe "ping" GET "$API/ping.php"

# ۲) فهرست اعلان‌ها — دقیقاً همان چیزی که اپ صدا می‌زند
probe "notifications-no-param"        GET  "$API/notifications.php"
probe "notifications-phone"           GET  "$API/notifications.php?phone=$PHONE"
probe "notifications-phone-unread"    GET  "$API/notifications.php?phone=$PHONE&unread=1"
probe "notifications-phone-device"    GET  "$API/notifications.php?phone=$PHONE&device=diagdevice1"
probe "notifications-phone-plus98"    GET  "$API/notifications.php?phone=%2B98${PHONE#0}"
probe "notifications-guest"           GET  "$API/notifications.php?device=diagdevice1"

# ۳) عملیات خوانده‌شده/حذف (بدون ساختن داده)
probe "notifications-mark-read"       POST "$API/notifications.php" "{\"action\":\"read\",\"phone\":\"$PHONE\",\"device\":\"diagdevice1\",\"all\":1}"
probe "notifications-delete-form"     POST "$API/notifications.php" "action=delete&phone=$PHONE&device=diagdevice1&id=0"

# ۴) endpoints کنارِ اعلان‌ها (در آزمون دودی PWA هم ۵۰۰ شدند)
probe "news"                          GET  "$API/news.php"
probe "departments"                   GET  "$API/departments.php"
probe "places"                        GET  "$API/places.php"
probe "users"                         GET  "$API/users.php"
probe "push"                          GET  "$API/push.php"

# ۴-۲) بقیه‌ی endpointهای دیتابیس‌دار — اگر ستونِ دیگری هم روی هاست جا افتاده
#       باشد (مثل reports.client_ref)، این‌جا با «Unknown column» معلوم می‌شود.
probe "reports-list"                  GET  "$API/reports.php?phone=$PHONE"
probe "tickets-list"                  GET  "$API/tickets.php?phone=$PHONE"
probe "users-profile"                 GET  "$API/users.php?phone=$PHONE"
probe "media-head"                    GET  "$API/media.php?action=list&id=1"

# ۵) صفحه‌ی ورود پنل (بدون لاگین) — برای دیدن اینکه دیتابیس بالا است
probe "admin-login-page"              GET  "$BASE/admin/login.php"
probe "admin-notifications-page"      GET  "$BASE/admin/notifications.php"

echo
echo "═══════════════════════════════════════════════════════════════"
echo " خلاصه‌ی کدهای پاسخ"
echo "═══════════════════════════════════════════════════════════════"
for f in "$OUT_DIR"/*.txt; do
  [ -e "$f" ] || continue
  code="$(grep -o '\[HTTP [0-9]*\]' "$f" | tail -1)"
  printf '%-38s %s\n' "$(basename "$f" .txt)" "$code"
done | tee "$OUT_DIR/summary.txt"

echo
echo "═══════════════════════════════════════════════════════════════"
echo " بدنه‌ی پاسخ‌های خطادار (۵۰۰/۴xx) — علت واقعی این‌جاست"
echo "═══════════════════════════════════════════════════════════════"
for f in "$OUT_DIR"/*.txt; do
  [ -e "$f" ] || continue
  case "$(basename "$f")" in summary.txt|*.headers|*.err) continue ;; esac
  if grep -q '\[HTTP 5[0-9][0-9]\]\|\[HTTP 4[0-9][0-9]\]' "$f"; then
    echo "── $(basename "$f" .txt)"
    sed 's/\[HTTP /[HTTP /' "$f" | head -c 1500
    echo
  fi
done

echo
echo "═══════════════════════════════════════════════════════════════"
echo " داوری (انتظار: اعلان‌ها و اخبار باید ۲۰۰ و success:true باشند)"
echo "═══════════════════════════════════════════════════════════════"
VERDICT_FAIL=0
: > "$OUT_DIR/verdict.txt"
expect() {  # expect <نام کاوش> <کد انتظار> [رشته‌ی انتظار در بدنه] [حیاتی؟]
  local name="$1" want="$2" needle="${3:-}" critical="${4:-yes}"
  local f; f="$(out_file "$name")"
  if [ ! -f "$f" ]; then
    printf '%-30s ❌ پاسخی ثبت نشد\n' "$name" | tee -a "$OUT_DIR/verdict.txt"
    [ "$critical" = yes ] && VERDICT_FAIL=1
    return 0
  fi
  local code; code="$(grep -o '\[HTTP [0-9]*\]' "$f" | tail -1)"
  local status="✅"
  if [ "$code" != "[$want]" ]; then
    status="❌ انتظار $want بود، $code شد"; [ "$critical" = yes ] && VERDICT_FAIL=1
  elif [ -n "$needle" ] && ! grep -qF -- "$needle" "$f"; then
    status="❌ «$needle» در بدنه نبود"; [ "$critical" = yes ] && VERDICT_FAIL=1
  fi
  printf '%-30s %s %s\n' "$name" "$code" "$status" | tee -a "$OUT_DIR/verdict.txt"
}

expect "notifications-phone"      "HTTP 200" '"success":true'
expect "notifications-no-param"   "HTTP 200" '"success":true'
expect "notifications-guest"      "HTTP 200" '"success":true'
expect "notifications-phone-plus98" "HTTP 200" '"success":true'
expect "notifications-mark-read"  "HTTP 200" '"success":true'
expect "news"                     "HTTP 200" '"success":true'
expect "ping"                     "HTTP 200" '"success":true'
expect "places"                   "HTTP 200" '"success":true'
expect "departments"              "HTTP 200" '"success":true'
expect "reports-list"             "HTTP 200" '"success":true' no
expect "tickets-list"             "HTTP 200" '"success":true' no
# users.php برای شماره‌ی آزمایشی (کاربر واقعی نیست) success:false برمی‌گرداند —
# مهم «۲۰۰ بودن و JSON سالم» است، نه وجودِ آن کاربر.
expect "users-profile"            "HTTP 200" '"success"'      no
# media.php سرویسِ فایل است؛ برای شناسه‌ی ناموجود ۴۰۴ درست است (یعنی پرس‌وجو سالم بود)
expect "media-head"               "HTTP 404" ''               no
expect "admin-login-page"         "HTTP 200" ''               no

echo
if [ "$VERDICT_FAIL" -eq 0 ]; then
  echo "✅ داوری: اعلان‌ها و اخبار روی سرور زنده سالم‌اند."
  echo "   (اگر هنوز در اپ اعلانی دیده نمی‌شود، مسئله سمت کلاینت/شماره‌ی کاربر است.)"
else
  echo "❌ داوری: دست‌کم یکی از endpointهای حیاتی اعلان/اخبار روی سرور زنده خطا داد."
  echo "   → بدنه‌ی پاسخ همان بالا نوشته شده؛ اگر «Unknown column» بود، بسته‌ی به‌روزرسانی"
  echo "     روی هاست باز شود (خودش دیتابیس را ترمیم می‌کند) یا در پنل: تنظیمات ← ترمیم ساختار دیتابیس."
fi

echo
echo "✅ کاوش تمام شد؛ همه‌ی پاسخ‌ها در پوشه‌ی «$OUT_DIR» ذخیره شد."
exit $VERDICT_FAIL
