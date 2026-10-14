#!/usr/bin/env bash
# ============================================================================
#  tools/safari-pwa.sh — PWA ای‌پلاک داخل Safari واقعیِ iPhone (شبیه‌ساز، فقط روی macOS)
#
#  یک شبیه‌ساز iPhone را بالا می‌آورد، آدرس PWA را داخل Safari باز می‌کند و در چند لحظه
#  عکس از صفحه می‌گیرد (Safari در شبیه‌ساز بار اول کند بالا می‌آید؛ پس سه عکس).
#  این سنجش فقط «صفحه داخل WebKit درست کشیده می‌شود» را نشان می‌دهد؛ «افزودن به صفحه اصلی» و
#  اعلان را نمی‌شود روی شبیه‌ساز خودکار امتحان کرد.
#
#  نکته‌ی CI: لاگ کامل اجرا همیشه در دسترس نیست، پس نتیجه‌ی هر مرحله به‌صورت
#  annotation («::notice/::warning/::error») هم چاپ می‌شود تا در گزارش اجرا دیده شود.
#
#  استفاده:  bash tools/safari-pwa.sh <آدرس PWA> <پوشه‌ی خروجی>
# ============================================================================
# عمداً «-e» ندارد: هر مرحله باید خودش گزارش بدهد، نه اینکه بی‌صدا اجرا را بشکند.
set -uo pipefail

URL="${1:?آدرس PWA را بدهید}"
OUT="${2:?پوشه‌ی خروجی را بدهید}"
mkdir -p "$OUT"
echo "$URL" > "$OUT/url.txt"

note() { echo "::notice title=Safari iPhone::$*"; }
warn() { echo "::warning::$*"; echo "⚠️  $*"; WARNINGS=$((WARNINGS + 1)); }
err()  { echo "::error::$*"; echo "❌ $*"; }
WARNINGS=0
summary() { # خلاصه را هم در لاگ و هم در گزارش CI می‌نویسد
  echo "$1"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"; fi
}

# ── ۰) محیط: چه Xcode و چه رانتایم‌هایی هست ───────────────────────────────────
echo "Xcode: $(xcode-select -p 2>/dev/null || echo '?')"
xcrun simctl list runtimes 2>&1 | tee "$OUT/runtimes.txt" | grep -i ios || warn "هیچ رانتایم iOS فهرست نشد"

# ── ۱) یک شبیه‌ساز iPhone (جدیدترین iOS؛ ترجیحاً Pro و نه Max) ──────────────────
# بارِ اول ممکن است CoreSimulator «سرد» باشد و JSON ندهد؛ پس سه تلاش.
pick() {
python3 -c '
import json, re, sys
try:
    data = json.load(sys.stdin)["devices"]
except Exception as e:
    sys.stderr.write("json: %s\n" % e); sys.exit(0)
def key(rt):
    m = re.search(r"iOS-(\d+)-(\d+)", rt)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)
for rt in sorted((r for r in data if "iOS" in r), key=key, reverse=True):
    phones = [d for d in data[rt] if d.get("isAvailable", True) and d["name"].startswith("iPhone")]
    if phones:
        pref = [d for d in phones if "Pro" in d["name"] and "Max" not in d["name"]] or phones
        print(pref[0]["udid"] + " " + pref[0]["name"] + " - " + rt.split(".")[-1]); break
'
}
UDID=""
for i in 1 2 3; do
  UDID="$(xcrun simctl list devices available -j 2>/dev/null | pick 2>/dev/null || true)"
  [ -n "$UDID" ] && break
  warn "تلاش $i از ۳: شبیه‌سار iPhone پیدا نشد (۱۰ ثانیه صبر)"
  sleep 10
done
if [ -z "$UDID" ]; then
  xcrun simctl list devices 2>&1 | tee "$OUT/devices.txt" >/dev/null || true
  err "هیچ شبیه‌سار iPhone در دسترس نیست؛ فهرست دستگاه‌ها در Artifact (devices.txt)"
  exit 1
fi
DESC="${UDID#* }"; UDID="${UDID%% *}"
echo "$DESC" > "$OUT/simulator.txt"
echo "$UDID" > "$OUT/udid.txt"
echo "شبیه‌ساز: $DESC ($UDID)"
note "شبیه‌ساز: $DESC"

# ── ۲) بالا آوردن شبیه‌ساز (و اطمینان از Booted بودن) ─────────────────────────
state() {
python3 -c '
import json, sys
u = sys.argv[1]
try:
    data = json.load(sys.stdin)["devices"]
except Exception:
    print("?"); sys.exit(0)
for ds in data.values():
    for d in ds:
        if d["udid"] == u:
            print(d.get("state", "?")); sys.exit(0)
print("?")
' "$UDID"
}
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || warn "bootstatus خطا داد؛ وضعیت را دستی بررسی می‌کنیم"
WAITED=0
while [ "$WAITED" -lt 180 ]; do
  S="$(xcrun simctl list devices -j 2>/dev/null | state || echo '?')"
  [ "$S" = "Booted" ] && break
  sleep 5; WAITED=$((WAITED + 5))
done
if [ "${S:-?}" != "Booted" ]; then
  err "شبیه‌ساز بالا نیامد (وضعیت: ${S:-?})؛ عکسی گرفته نمی‌شود"
  xcrun simctl list devices 2>&1 | tee "$OUT/devices.txt" >/dev/null || true
  exit 1
fi
echo "✅ شبیه‌ساز Booted است (پس از ${WAITED}s انتظار)"

# ── ۳) باز کردن آدرس داخل Safari ─────────────────────────────────────────────
OPENED=0
for i in 1 2 3; do
  if xcrun simctl openurl "$UDID" "$URL" 2>"$OUT/openurl-error.txt"; then OPENED=1; break; fi
  warn "تلاش $i از ۳ برای باز کردن آدرس ناموفق: $(tail -1 "$OUT/openurl-error.txt" 2>/dev/null || echo '?')"
  sleep 10
done
if [ "$OPENED" -ne 1 ]; then
  # راه جایگزین: راه‌اندازی مستقیم Safari با آدرس
  if xcrun simctl launch "$UDID" com.apple.mobilesafari "$URL" >/dev/null 2>&1; then
    warn "openurl جواب نداد؛ Safari مستقیم با آدرس راه‌اندازی شد"
    OPENED=1
  fi
fi
if [ "$OPENED" -ne 1 ]; then
  err "آدرس داخل Safari باز نشد: $URL"
  exit 1
fi
note "آدرس داخل Safari باز شد: $URL"

# ── ۴) سه عکس در سه لحظه (۳۰/۶۰/۹۰ ثانیه) ───────────────────────────────────
for t in 30 60 90; do
  sleep 30
  xcrun simctl io "$UDID" screenshot "$OUT/safari-${t}s.png" > /dev/null 2>&1 || warn "عکس ${t}s گرفته نشد"
done
ls -l "$OUT" | tee "$OUT/files.txt"

# ── ۵) سنجش نتیجه: عکس‌ها باید واقعی باشند (نه صفر بایت) ───────────────────────
SHOTS=0; SMALL=0
for t in 30 60 90; do
  F="$OUT/safari-${t}s.png"
  if [ -f "$F" ]; then
    SHOTS=$((SHOTS + 1))
    B=$(wc -c < "$F" | tr -d ' ')
    if [ "$B" -lt 20000 ]; then SMALL=$((SMALL + 1)); warn "عکس safari-${t}s.png فقط $B بایت است (احتمالاً صفحه سفید/خالی)"; fi
  fi
done
if [ "$SHOTS" -eq 0 ]; then
  err "هیچ عکسی از Safari گرفته نشد"
  exit 1
fi
note "$SHOTS عکس از Safariِ $DESC گرفته شد ($URL)$( [ "$SMALL" -gt 0 ] && echo " · $SMALL عکس مشکوک" || true)"
summary ""
summary "| عکس‌های Safari | \`$SHOTS\` از ۳ (شبیه‌ساز: \`$DESC\`) |"
summary "| هشدارها | \`$WARNINGS\` |"
if [ "$WARNINGS" -gt 0 ] || [ "$SMALL" -gt 0 ]; then
  echo "ℹ️ اجرا تمام شد ولی $WARNINGS هشدار داشت (عکس‌ها را در Artifact ببینید)"
fi
echo "✅ $SHOTS عکس از $URL داخل Safari شبیه‌ساز گرفته شد"
