#!/usr/bin/env bash
# ============================================================================
#  tools/safari-pwa.sh — PWA ای‌پلاک داخل Safari واقعیِ iPhone (شبیه‌ساز، فقط روی macOS)
#
#  یک شبیه‌ساز iPhone را بالا می‌آورد، آدرس PWA را داخل Safari باز می‌کند و در چند لحظه
#  عکس از صفحه می‌گیرد (Safari در شبیه‌ساز بار اول کند بالا می‌آید؛ پس سه عکس).
#  این سنجش فقط «صفحه داخل WebKit درست کشیده می‌شود» را نشان می‌دهد؛ «افزودن به صفحه اصلی» و
#  اعلان را نمی‌شود روی شبیه‌ساز خودکار امتحان کرد.
#
#  استفاده:  bash tools/safari-pwa.sh <آدرس PWA> <پوشه‌ی خروجی>
# ============================================================================
set -euo pipefail

URL="${1:?آدرس PWA را بدهید}"
OUT="${2:?پوشه‌ی خروجی را بدهید}"
mkdir -p "$OUT"

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
        print(pref[0]["udid"] + " " + pref[0]["name"] + " - " + rt.split(".")[-1]); break
')"
[ -n "$UDID" ] || { echo "❌ هیچ شبیه‌ساز iPhone پیدا نشد"; exit 1; }
DESC="${UDID#* }"; UDID="${UDID%% *}"
echo "شبیه‌ساز: $DESC ($UDID)"
echo "$DESC" > "$OUT/simulator.txt"
echo "$URL" > "$OUT/url.txt"

xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b > /dev/null
xcrun simctl openurl "$UDID" "$URL"
for t in 30 60 90; do
  sleep 30
  xcrun simctl io "$UDID" screenshot "$OUT/safari-${t}s.png" > /dev/null 2>&1 || echo "(عکس ${t}s گرفته نشد)"
done
ls -l "$OUT"
echo "✅ سه عکس از $URL داخل Safari شبیه‌ساز گرفته شد"
