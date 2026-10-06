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

probe() {  # probe <نام> <متد> <آدرس> [بدنه] [هدرهای اضافی]
  local name="$1" method="$2" url="$3" body="${4:-}" hdr="${5:-}"
  local out="$OUT_DIR/$(echo "$name" | tr ' /?&=' '_____' ).txt"
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
echo "✅ کاوش تمام شد؛ همه‌ی پاسخ‌ها در پوشه‌ی «$OUT_DIR» ذخیره شد."
