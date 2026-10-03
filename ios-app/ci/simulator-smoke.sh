#!/usr/bin/env bash
# ============================================================================
#  آزمون دودی اپ iOS روی شبیه‌ساز iPhone (فقط روی macOS؛ در GitHub Actions اجرا می‌شود)
#
#  نصب ← اجرا با «-eplakSelfTest» ← در هر مرحله عکس از صفحه ← سنجش نتیجه‌ی JSON.
#  چه چیزی را واقعاً می‌سنجد؟
#   ۱) صفحه از file:// بالا آمده و آدرس API روی سرور ای‌پلاک است؛ ماژول‌های نقشه و اماکن هستند
#   ۲) api/ping.php از داخل WKWebView جواب می‌دهد (CORS و شبکه) و پرده‌ی «بدون اینترنت» نیامده
#   ۳) «نقشه و اماکن شهری» باز می‌شود: چیپ‌های دسته، فهرست مکان‌ها، کاشی‌های نقشه
#   ۴) «موقعیت من» (GPS شبیه‌ساز: ورامین) و «مسیریابی با نشان» → لینک neshan://… به پوسته‌ی
#      نیتیو می‌رسد (که در گوشی واقعی برنامه‌ی نشان را باز می‌کند)
#  این آزمون جای امتحان روی گوشی واقعی را نمی‌گیرد (دوربین، اعلان، نصب برنامه‌ی نشان).
#
#  استفاده:  bash ios-app/ci/simulator-smoke.sh <مسیر Eplak.app (ساخت شبیه‌ساز)> <پوشه‌ی خروجی>
# ============================================================================
set -euo pipefail

APP="${1:?مسیر Eplak.app را بدهید}"
OUT="${2:?پوشه‌ی خروجی را بدهید}"
BUNDLE_ID="ir.eplak.app"
mkdir -p "$OUT"

# ── ۱) یک شبیه‌ساز iPhone (جدیدترین iOS) ────────────────────────────────────
UDID="$(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
data = json.load(sys.stdin)["devices"]
def key(rt):
    m = re.search(r"iOS-(\d+)-(\d+)", rt)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)
for rt in sorted((r for r in data if "iOS" in r), key=key, reverse=True):
    phones = [d for d in data[rt] if d.get("isAvailable", True) and d["name"].startswith("iPhone")]
    if phones:
        pref = [d for d in phones if "Pro" in d["name"] and "Max" not in d["name"]] or phones
        print(pref[0]["udid"]); break
')"
if [ -z "$UDID" ]; then
  echo "❌ هیچ شبیه‌ساز iPhone پیدا نشد"; xcrun simctl list devices available; exit 1
fi
NAME="$(xcrun simctl list devices -j | python3 -c '
import json, sys
u = sys.argv[1]
for rt, ds in json.load(sys.stdin)["devices"].items():
    for d in ds:
        if d["udid"] == u:
            print(d["name"] + " — " + rt.split(".")[-1])
' "$UDID")"
echo "شبیه‌ساز: $NAME ($UDID)"

echo "$UDID" > "$OUT/udid.txt"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl install "$UDID" "$APP"
xcrun simctl privacy "$UDID" grant location "$BUNDLE_ID" || true
xcrun simctl location "$UDID" set 35.3335,51.6402 || true     # ورامین، میدان امام حسین (ع)
xcrun simctl launch "$UDID" "$BUNDLE_ID" -eplakSelfTest
DATA="$(xcrun simctl get_app_container "$UDID" "$BUNDLE_ID" data)"
echo "پوشه‌ی داده‌ی اپ: $DATA"

wait_for() { # نام‌فایل  ثانیه
  local i=0
  while [ "$i" -lt "$2" ]; do
    [ -f "$DATA/Documents/$1" ] && return 0
    sleep 1; i=$((i + 1))
  done
  return 1
}
shot() { xcrun simctl io "$UDID" screenshot "$OUT/$1.png" >/dev/null 2>&1 || echo "(عکس $1 گرفته نشد)"; }
fail_dump() {
  shot "timeout-$1"
  echo "❌ مرحله‌ی $1 در مهلت تمام نشد؛ آخرین لاگ‌های اپ:"
  xcrun simctl spawn "$UDID" log show --last 3m --style compact --predicate 'process == "Eplak"' 2>/dev/null | tail -n 60 || true
  exit 1
}

wait_for selftest-1.json 150 || fail_dump 1
shot 1-start
wait_for selftest-2.json 90 || fail_dump 2
shot 2-map
wait_for selftest-3.json 120 || fail_dump 3
shot 3-route
wait_for selftest-done.json 15 || true

cp "$DATA"/Documents/selftest-*.json "$OUT"/ 2>/dev/null || true
echo "$NAME" > "$OUT/simulator.txt"

# ── ۲) سنجش ─────────────────────────────────────────────────────────────────
python3 - "$OUT" <<'PYEOF'
import json, os, re, sys
out = sys.argv[1]
def load(n):
    with open(os.path.join(out, "selftest-%d.json" % n), encoding="utf-8") as f:
        return json.load(f)
s1, s2, s3 = load(1), load(2), load(3)
errors, notes = [], []

def need(cond, msg):
    if not cond:
        errors.append(msg)

for n, s in ((1, s1), (2, s2), (3, s3)):
    need("error" not in s, "مرحله‌ی %d خطای جاوااسکریپت داد: %s" % (n, s.get("error")))

# مرحله ۱
need(s1.get("protocol") == "file:", "صفحه از file:// باز نشده: %r" % s1.get("protocol"))
need(s1.get("apiBase") == "https://eplak.ir/eplak-fixed/api", "آدرس API درست نیست: %r" % s1.get("apiBase"))
need(s1.get("nativeFlag") is True, "پرچم EPLAK_IOS_APP به صفحه نرسید")
fns = s1.get("fns") or {}
need(fns.get("showScreen") == "function" and fns.get("cityMap") == "function" and fns.get("places") == "function",
     "ماژول‌های وب (router/city-map/places) بالا نیامدند: %r" % fns)
need((s1.get("placesCount") or 0) >= 130, "فهرست اماکن کم است: %r" % s1.get("placesCount"))
ping = s1.get("ping") or {}
need(ping.get("status") == 200, "api/ping.php از داخل WKWebView جواب نداد: %r" % ping)
need(s1.get("offlineGate") is False, "پرده‌ی «بدون اینترنت» آمده است")
need(s1.get("localStorage") is True, "localStorage در دسترس نیست")
need(s1.get("geoShim") is True, "پل موقعیت (GeoBridge) نصب نشده؛ WebKit پنجره‌ی «مسیر فایل … موقعیت شما» را نشان می‌دهد")
# مرحله ۲
need(s2.get("screen") == "screen-map", "صفحه‌ی نقشه باز نشد: %r" % s2.get("screen"))
need((s2.get("chips") or 0) >= 9, "چیپ‌های دسته کم است: %r" % s2.get("chips"))
need((s2.get("rows") or 0) >= 10, "فهرست مکان‌ها کم است: %r" % s2.get("rows"))
# مرحله ۳
opens = s3.get("externalOpens") or []
need(s3.get("env") == "ios", "محیط به‌عنوان iOS شناخته نشد: %r" % s3.get("env"))
need(any(u.startswith("neshan://") for u in opens), "لینک neshan:// به پوسته‌ی نیتیو نرسید: %r" % opens)
# GPS شبیه‌ساز (ورامین) باید از CoreLocation و پل نیتیو به صفحه برسد؛ بدون پنجره‌ی WebKit
SIM = (35.3335, 51.6402)
loc = s3.get("loc")
near = isinstance(loc, dict) and abs(loc.get("lat", 0) - SIM[0]) < 0.02 and abs(loc.get("lng", 0) - SIM[1]) < 0.02
need(near, "موقعیت شبیه‌ساز (ورامین) از پل نیتیو به صفحه نرسید: %r" % (loc,))

# فقط گزارش (به شبکه/شبیه‌ساز بستگی دارد)
notes.append("کاشی‌های نقشه: %s از %s بارگذاری شد؛ نشانگرها: %s" % (s2.get("tilesLoaded"), s2.get("tiles"), s2.get("markers")))
notes.append("اجازه‌ی موقعیت (Permissions API): %s" % s1.get("geoPermission"))
notes.append("موقعیت من (GPS شبیه‌ساز): %s" % (json.dumps(loc, ensure_ascii=False) if loc else "دریافت نشد"))
neshan = [u for u in opens if u.startswith("neshan://")]
if neshan:
    notes.append("لینک نشان: " + neshan[0])
    # مبدأ = موقعیت کاربر، مقصد = بیمارستان مفتح (نه برعکس)
    m = re.search(r"origin=([\d.]+),([\d.]+)&destination=([\d.]+),([\d.]+)", neshan[0])
    need(bool(m), "لینک نشان origin و destination ندارد: %s" % neshan[0])
    if m:
        o = (float(m.group(1)), float(m.group(2))); d = (float(m.group(3)), float(m.group(4)))
        need(abs(o[0] - SIM[0]) < 0.02 and abs(o[1] - SIM[1]) < 0.02, "مبدأ لینک نشان موقعیت کاربر نیست: %s" % (o,))
        need(abs(d[0] - 35.32837) < 0.002 and abs(d[1] - 51.66248) < 0.002, "مقصد لینک نشان بیمارستان مفتح (core/places-data.js) نیست: %s" % (d,))
web = [u for u in opens if u.startswith("https://nshn.ir")]
notes.append("بازگشتِ نسخه‌ی وب نشان: " + (web[0] if web else "—"))
notes.append("وضعیت مسیریابی: %r" % s3.get("routeStatus"))

lines = ["## آزمون دودی iOS (شبیه‌ساز)", ""]
lines += ["- " + n for n in notes]
lines.append("")
if errors:
    lines += ["### ❌ خطاها"] + ["- " + e for e in errors]
else:
    lines.append("### ✅ همه‌ی بررسی‌ها گذشت")
text = "\n".join(lines)
print(text)
summary = os.environ.get("GITHUB_STEP_SUMMARY")
if summary:
    with open(summary, "a", encoding="utf-8") as f:
        f.write(text + "\n")
with open(os.path.join(out, "report.md"), "w", encoding="utf-8") as f:
    f.write(text + "\n")
sys.exit(1 if errors else 0)
PYEOF
