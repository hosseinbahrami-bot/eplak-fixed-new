# Report media (photo/video) upload + precise GPS location on the map

This document covers the two new requirements:

1. **Photo/video upload in “Submit Request”** must work, and every uploaded file must be visible in the **admin panel**.
2. The location step must use the **phone’s GPS** and show the user’s **precise position on a map**.

---

## 1) Why it did not work before (root cause)

| Item | Cause |
|---|---|
| Picking files inside the app | `MainActivity.kt` only had `webView.webChromeClient = WebChromeClient()`. Android does **not** open a file picker by itself — the app must implement `onShowFileChooser`. Because it was missing, tapping “tap to add photo or video” did nothing. |
| GPS in the form | `useCurrentLocation()` only wrote a **fixed string** (“current user location (from GPS)”) into the address box. No GPS, no map. |
| Location-step map | It was a **decorative card**: “selected location map (demo)”. |
| Location permission | No `ACCESS_FINE_LOCATION` in the manifest, no `setGeolocationEnabled(true)`, no `onGeolocationPermissionsShowPrompt`. |

---

## 2) What was fixed

### A) Android app (`android-app/`)

- `MainActivity.kt`
  - `onShowFileChooser` implemented → the **gallery/file picker opens** (images + videos, multi-select).
  - Multi-select via `EXTRA_ALLOW_MULTIPLE` and `clipData` handling.
  - If the user cancels, `onReceiveValue(null)` is returned so the file field never gets stuck.
  - `setGeolocationEnabled(true)` + `onGeolocationPermissionsShowPrompt` → the app asks for location permission and answers `navigator.geolocation`.
  - New JS-bridge methods: `hasLocationPermission()`, `requestLocationPermission()`, `openAppSettings()`, `isLocationServiceEnabled()`, `openUrl(url)`.
- `AndroidManifest.xml`
  - Added `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION`.
  - `uses-feature android.hardware.location.gps required="false"` so devices without GPS can still install the app.

### B) Web layer

- `assets/js/ep-map.js` (**new file**) — a lightweight map engine on free **OpenStreetMap** tiles:
  - **No API key required**, and if tiles cannot be downloaded the flow still works (coordinates are stored).
  - Finger-drag panning, `+`/`−` zoom, center pin, and reverse geocoding (`nominatim.openstreetmap.org`) to fill the street address.
- `modules/reports.js`
  - Real `useCurrentLocation()` using `navigator.geolocation.getCurrentPosition(..., { enableHighAccuracy: true })`.
  - In the Android app, the location permission is requested first, then the position is read.
  - Coordinates are kept in `reportDraft.geo` and **sent to the server** with the report (`lat`, `lng`).
  - Photos are **compressed before upload** (max 1600 px, quality 82%) so mobile uploads are fast and reliable.
  - Upload percentage is shown on the success screen, followed by a final confirmation.
- `index.html`
  - Real map in the location step + latitude/longitude display + “view on map” button.
  - Upload status line under the tracking code.
- `core/storage.js`
  - `syncFormDataToBackendWithProgress` — upload via `XMLHttpRequest` with progress reporting.

### C) Server and admin panel

- `shared/bootstrap.php`
  - New `reports` columns: `lat`, `lng`, `location_accuracy` (added automatically to an existing database).
  - Schema version: `2026-09-30.2`.
- `api/reports.php`
  - Coordinate validation (`eplakReportCoord`) and persistence; invalid coordinates never break report creation.
  - Report list also returns `lat`/`lng`.
- `admin/report_detail.php`
  - **Precise location map** with marker + coordinates + accuracy (meters) + “open in full map”.
  - Citizen photos and videos (already implemented) are displayed in the same page.
- `admin/reports.php`
  - Under the location column: a “📍 precise location on map” link for geolocated reports.

### D) Key finding from the live test on eplak.ir: the host firewall blocks file uploads

The automated live test (section 9 of the live-check report) showed:

| Test | Result |
|---|---|
| `multipart/form-data` **without a file** (text only) | ✅ HTTP 200 |
| The same request **with a file** (even a 70-byte PNG) | ❌ HTTP **403** (host Forbidden page) |

So the host firewall (ModSecurity/Imunify360) has a rule against “file upload to a PHP script” and
rejects the request. This was likely one of the main causes of the user’s “upload does not work” experience.

**Implemented solution (no host settings change required):**

- The app sends files **inside the JSON body as base64** (this route is open on the host).
- Compressed photos and small files (up to 6 MB each, 12 MB total) travel with the report itself:
  one request, no multipart upload at all.
- Large videos are sent **in 1 MB chunks** to `api/media.php?action=chunk` after the report is created,
  and are reassembled on the server (chunk order is enforced; type/size validation happens on the last chunk).
- If the phone number does not own the report, or the 6-file cap is reached, the file is rejected.

> Important: **photos work with the new APK and no host change at all.**
> Only large videos (over 6 MB) require extracting the new package on the host.

### E) Two reported issues fixed: precise written address + attachments not reaching the server

**1) The written address is now precise.**
Previously the address text was the map service's long, unordered string (or stayed empty).
It is now built short, ordered and Persian: **"street, house number, neighbourhood, city"**.

- In the **Android app**, the phone's own geocoder is asked first (Persian locale — the most
  precise option, and independent from external services); if the phone returns nothing,
  the free OpenStreetMap service is used.
- In the **web**, the same OpenStreetMap service is used with a 6-second timeout.
- While looking up, the address field shows "در حال گرفتن آدرس دقیق…" and then the precise
  text replaces it (a user-typed address is never overwritten, except via the
  "use my current location" button).
- The final address is stored with the report and shown in the admin panel.

**2) The cause of "report saved but attachments did not reach the server" was found and fixed.**
Three separate problems were behind that message:

| # | Problem | Fix |
|---|---|---|
| 1 | In the Android app the page is loaded from `file://`; the WebView blocked network requests from that page (`allowUniversalAccessFromFileURLs=false`) | The flag is now enabled (`MainActivity.kt`) — without it, nothing sent from inside the app reached the server |
| 2 | Sending with `Content-Type: application/json` triggers a CORS preflight (OPTIONS); when that did not get a proper answer the upload failed silently | Requests now use `text/plain;charset=UTF-8` (a "simple" request, no preflight); the server reads the body regardless of content type |
| 3 | The request carried several MB of base64 photos and the host firewall blocked it | The inline threshold is now small (600 KB per file, 700 KB total) and everything else is uploaded in 512 KB chunks |

Three safeguards were added as well:

- If the "report + attachments" request fails, the **report is still submitted without attachments**
  (so it is never lost) and the files are sent through the chunked path.
- The "report saved" screen now offers a **"retry sending attachments"** button.
- After uploading, the saved attachment count is verified against the server
  (`action=media_status`) so the success message is real, not assumed.
- Each chunk is retried up to 3 times on network errors and error messages show the
  **real server code** (e.g. "413" for size, "403" for the firewall).

> If attachments still fail, check the server code shown in the app:
> 413 means size, 403 means the host firewall. In that case you may ask the host support to
> relax ModSecurity rules for large POST requests under `api/` (the app itself sends small
> chunks, so this is normally unnecessary).

---

## 3) Step by step: apply to the live site (host panel)

1. Download `eplak-fixed-update.zip` from GitHub.
2. Host panel → **File Manager** → open the `eplak-fixed` folder.
3. Upload the ZIP → right-click it → **Extract** → confirm.
4. Open this page once so the **new database columns are created**:
   `https://eplak.ir/eplak-fixed/admin/login.php` → sign in → **Settings** → click **“repair database schema”**.
5. Final verification: run the live check from GitHub Actions (tick the smoke option).

---

## 4) Step by step: install the new APK

1. APK link:
   `https://github.com/hosseinbahrami-bot/eplak-fixed/releases/download/v2.0-eplak-update/eplak-app.apk`
2. Download → allow “install from unknown sources” if asked → **Install**.
3. The first time you tap **“use my current location”**, Android asks for the location permission → choose **While using the app**.

### Photo/video test

1. App → home → **“Submit Request”**.
2. Fill the steps up to the **“Photos”** step.
3. Tap the “tap to add photo or video” box → **the gallery opens** → pick up to 3 files.
4. **Next** → **Confirm and send**.
5. Under the tracking code you will see the upload percentage and then “✅ … attachment uploaded and registered in the municipality panel”.

### Location test

1. In the **“Location”** step, tap the blue **“use my current location”** button.
2. Grant the permission → the map moves to your position and the coordinates + accuracy (meters) appear below.
3. Drag the map with your finger to fine-tune the pin onto the exact spot.

---

## 5) Step by step: see media and location in the admin panel

1. `https://eplak.ir/eplak-fixed/admin/login.php` → sign in.
2. Menu **“Reports”** → under the location column, look for “📍 precise location on map”.
3. Click the **eye** icon (view & reply).
4. On the report page:
   - **“Citizen attachments”** → photos and videos (videos are playable) + download buttons.
   - **“Precise location on map”** → map with marker, coordinates, accuracy, and “open in full map”.

---

## 6) Size limits (configurable in code)

| Item | Default | Where to change |
|---|---|---|
| Image | 12 MB | `shared/media.php` (`EPLAK_MEDIA_MAX_IMAGE_MB`) |
| Video | 80 MB | `shared/media.php` (`EPLAK_MEDIA_MAX_VIDEO_MB`) |
| Files per report | 6 on server, 3 in the app | `shared/media.php` · `modules/reports.js` |
| Inline (JSON) upload threshold | 6 MB per file / 12 MB total | `modules/reports.js` (`INLINE_MAX_FILE` / `INLINE_MAX_TOTAL`) |
| Video chunk size | 1 MB | `core/storage.js` |
| PHP upload cap | 64 MB | `.htaccess` (`upload_max_filesize`) |

Note: photos are compressed inside the app, so an 8 MB phone photo becomes roughly 200–500 KB and the upload almost always succeeds.

---

## 20) Status refresh, polished attachment gallery, and edit-button fix

### 1. Admin status change now reaches the app immediately
- Root cause: `modules/reports.js` built six API URLs with `${apiBase}` (no parentheses),
  so the function text itself ended up inside the URL and every report-list request failed
  silently. The app therefore never picked up new statuses.
- Fix: all six now use `${apiBase()}`.
- In addition, the app refreshes report statuses every 45 seconds (and whenever it returns
  from the background), so a change made by the municipality appears within seconds.

### 2. Quick status change from the admin reports list
- Each row's status cell now has a select (Pending / In progress / Done).
- Changing it saves immediately, keeps the existing admin reply, and shows a green
  confirmation banner at the top of the list.

### 3. Edit button (fully broken before)
- Root cause: the button linked to `actions.php?type=report_edit&id=…`, but no such action
  exists in `admin/actions.php`, so it bounced back to the dashboard.
- Fix: the link now points to the real page, `report_edit.php?id=…`.

### 4. Admin attachment gallery (smaller and much nicer)
- Photos render as 104px rounded square chips with a soft shadow and a size label.
- Videos show a preview with a play badge and a size label.
- Clicking a chip opens a fullscreen lightbox; `Esc` closes it.
- A download button appears on hover.

### 5. In-app attachment gallery (proper size, pretty)
- In the report detail screen, photos are square tiles and videos are preview cards with a
  play badge.
- Tapping opens a fullscreen viewer with close/prev/next, a counter, and `Esc` / arrows;
  the Android back button closes the viewer first.

### 6. Upload diagnostics
- Every upload attempt is logged (file count, size, server status code, error message).
- If an attachment fails, a "Show technical details" button appears under the status message;
  send that text to support so the exact cause can be identified.
- Final verification: the app asks the server how many attachments were stored, so the
  "Uploading…" message never stays on screen.
- **Automatic retry:** if an attachment fails, the file is kept in the phone's own storage
  (IndexedDB) and is re-sent automatically at the first opportunity — reopening the app,
  regaining connectivity, or the periodic refresh — with no action needed from the user,
  so photos and videos are never lost.

### Deploy steps
1. Download the fresh `eplak-fixed-update.zip` from the Releases page.
2. In your host's File Manager, upload it into the `eplak-fixed` folder and **Extract** (overwrite).
3. Fully close and reopen the app (or press `Ctrl+F5` in a browser).

---

## 21) Definitive photo/video upload fix + unified processing flow

### 1. Real root cause of the upload failure (Android app)
The app targets `targetSdk 36`, and since Android 11 `WebSettings.allowFileAccess`
defaults to **false** (the previous code also set it to false explicitly). Result:
picked files were handed to the page as `file://` URIs the WebView was not allowed to
read, so the file arrived as "zero bytes / unreadable" and the upload failed silently.

**Fixes:** `allowFileAccess = true` (+ `allowContentAccess = true` for gallery picks);
the picked file is copied into the app's own cache while the read permission is live and
a readable `file://…/cache/picked/…` URI is handed to the page; the original URI is used
as a second chance if copying fails; and zero-byte files are detected right at pick time
with a clear user message instead of a silent failure.

### 2. Multi-layer upload path
Photos are compressed in stages to ~220 KB; small files travel inside the report request;
the rest go in 200 KB chunks to `api/media.php?action=chunk`; if the host rejects a chunk
the app steps down automatically (200→100→50→25 KB); if chunking is unavailable entirely,
files are sent whole through the report gateway (`api/reports.php` action `add_media`);
and any file that still fails is queued on the phone and retried automatically.

### 3. Unified processing flow (app ↔ admin panel)
A new `report_events` table feeds both sides: report created, department assignment, status
changes, admin replies, report edits and attachments. The app shows a status card plus a
step-by-step timeline (icon, title, actor, text, date, animated current step); the admin
panel's report page shows the same steps, so both sides always tell the same story.

### 4. New live check
The GitHub live check now builds a real few-hundred-KB photo and pushes it through all
three upload paths, reporting the exact server status code for each.

### Deploy steps
1. Extract the fresh `eplak-fixed-update.zip` over the `eplak-fixed` folder (the DB schema
   auto-upgrades to `2026-10-01.1` and creates the processing-flow table).
2. Install the new APK (`2.0.24` or higher) — the upload fix lives in the Android code,
   so the app must be updated for it to take effect.

---

## 22) Four-stage processing flow, professional icon pack, and ticket-reply notifications

### 1. The processing flow now has exactly four stages
Both the app and the admin panel use:

> **Report submitted → Waiting → In progress → Completed**

- Status labels were unified on both sides (previously "در انتظار / در حال بررسی / انجام‌شده").
- Every stage has its own icon, a state badge ("in progress", "passed", "waiting", "completed")
  and a Jalali date/time; the real timeline events (step text, admin reply) are attached to
  the matching stage.
- The active stage pulses in the app so citizens can see work is happening.
- The card above the report detail shows the current status and how many of the four stages
  have been passed.
- The admin report page renders the very same four stages, with the full internal event
  history underneath.
- Legacy data still works: old statuses stored as "در حال بررسی" or "انجام‌شده" are mapped
  correctly to the new stages.

### 2. One professional, consistent icon pack
- 26 new icons were added: flow stages (`file-plus`, `clock`, `tools`, `check-circle`,
  `hourglass`), attachments (`image`, `video`, `paperclip`, `send`, `edit`, `message`),
  weather/climate (`thermometer`, `fog`, `snowflake`, `moon`) and notification/connectivity
  (`bell-off`, `wifi-off`).
- The emoji map was rebuilt: 170 unique mappings (no duplicate keys) in six topic groups, so
  every emoji used anywhere in the app or its data renders as a pack icon.
- Static HTML spots (ticket icons, municipality header, filter tabs, the offline gate) now use
  the pack too; a `data-eplak-icon` hook fills any icon automatically.

### 3. Bug fix: admin ticket replies now notify the citizen
Saving a reply or status change from the admin ticket pages previously updated the database
only — the user received nothing. Now `saveTicketReply` and `saveTicketDetails` both create a
notification containing the ticket tracking code (e.g. `TK-0042`), the Persian status, the
reply text and the Jalali date/time; it is stored in the in-app notification list and pushed
via FCM (works with the app closed). Report replies use the same shared helper.

### 4. New tests
Seven tests cover the ticket notification path (create → admin reply → notification row →
reply edit), three cover the icon pack (map integrity, weather/AQI/services mappings, fresh
cache-busted load) and several cover the four-stage flow.

### Deploy steps
1. Extract the fresh `eplak-fixed-update.zip` over the `eplak-fixed` folder (Overwrite).
2. Hard-refresh the browser once (Ctrl+F5) to pick up the new `icons.js` and `style.css`.
3. Install the new APK so the app shows the four stages and the new icons.
4. To test ticket notifications: open **Tickets** in the admin panel, open a ticket, type a
   reply and press **Save changes**; the app's notifications list should show
   "📣 پاسخ تیکت TK-...." with the reply text and time.


---

## 23) One request = one tracking code, and photos/videos upload together

### 1. Root cause of the duplicate reports
When an upload got stuck in the host firewall, the app sent the report **twice** —
once with media and, as a safety net, once without. If the first response was lost,
the server stored both, giving two reports with two tracking codes (one with media,
one without).

### 2. Fix: a unique request id
- The app now generates a unique id (`EPL-…`) per request and sends it with **every
  attempt** (with media, without media, offline retry).
- Before creating a report, the server looks the id up; if it exists it does **not**
  create a second report, returns the **same tracking code**, attaches any media from
  the new attempt to the existing report, and sends no duplicate notification.
- A `client_ref` column with a **unique constraint** was added, so even two perfectly
  simultaneous requests cannot create two reports (the second resolves to the first).
- The server also refuses to store the same file twice (same name + size on the same
  report), and a repeated final chunk no longer creates a second file.
- The app locks the submit button: two taps on “ثبت نهایی” produce one request.

### 3. Photos and videos upload simultaneously
- Files used to be uploaded one at a time; now up to **3 files upload at once**
  (configurable via `window.EPLAK_MEDIA_UPLOAD_CONCURRENCY`, default 3).
- Preparing files (reading photo and video to base64) is parallel too.
- Attachment order on the server stays correct and progress is more accurate.

### 4. Tests
- 9 new anti-duplication tests (resubmitting the same request with and without media
  → same id and code, exactly one row, no duplicate file, DB unique constraint, while
  genuinely different requests still create separate reports).
- 5 new tests for parallel upload and the unique id.
- Verified with a real run: submitting one request three times yields
  `1 EP-1403-0001`, `rows: 1`, `media: 1`, `notif: 1`.

### Deploy steps
1. Extract the fresh `eplak-fixed-update.zip` over the `eplak-fixed` folder
   (Overwrite); the schema auto-upgrades to `2026-10-02.1` and adds `client_ref`.
2. Install the new APK (the old app does not send the unique id).
3. Test: submit a report with a photo **and** a video — the app shows one row with one
   tracking code, and the admin panel shows one report with both attachments.
4. Previously created duplicates are not deleted automatically; remove them from the
   admin panel (Reports → delete) if you want.

---

## 24) Round 25 — “Photos and videos first, tracking code last” (one code, with attachments)

### 1. What the user reported
“Inside the report details the same submission appears twice, each with its own
tracking code”, and “give one tracking code with the photo and video, and do not give
a tracking code until all photos and videos finish uploading”.

### 2. Root cause
- Previously the app **created the report first** (and got the code), then uploaded
  photos/videos. If an upload stalled, the app re-submitted, and the local row (with
  its own local code) sat next to the server row → “two rows, two codes”.
- A local row was dropped only when title/description/location matched a server row
  exactly; otherwise both were rendered.

### 3. The new flow: media first, report second
1. The user taps “ثبت نهایی”; the app immediately creates a unique `client_ref` and
   shows the success screen with **“در حال بارگذاری…”** — **no code at all**.
2. **All** photos and videos (chunked for large files) are uploaded with that reference
   and stored server-side with `report_id = 0` as **staged** rows.
3. Only after **every** file is delivered does the app create the report.
4. The server attaches the staged files to that single new report and returns **one**
   tracking code; the app reveals the code only now.
5. If any file fails: **no report is created and no code is issued**; the files stay in
   the phone’s retry queue and are re-sent by the “تلاش دوباره برای ارسال عکس/فیلم”
   button or automatically (app open / network back) — always with the **same**
   `client_ref`, so two reports/two codes can never be created.

### 4. Duplicate row in report details — fixed
- The reports list API now returns `client_ref`.
- The app matches rows by that reference: if the server has two rows for one request,
  only one (the one with more attachments) is shown, and the local row for that request
  is no longer rendered beside it.
- Until uploads finish, the code position shows “در حال بارگذاری عکس/فیلم…”; there is no
  temporary/fabricated code anymore.

### 5. Older app versions (no unique id)
If an older app submits **without** a reference, the server treats the same
phone+title+description within a short window (3 minutes) as a duplicate and returns
the existing report and code, so even an old app cannot create two reports with two codes.

### 6. Database changes
- `report_media.client_ref` was added; schema is now `2026-10-03.1` (auto-upgrades).
- Staged files older than 24 hours are cleaned up automatically so host storage does not
  fill up.
- The admin “reports with media” stat no longer counts staged rows.

### 7. Tests
- 10 new tests across both sides: (a) server — staging with `report_id = 0`, auto-attach
  at creation, no leftover staged rows, single row in the list, legacy-app anti-duplication;
  (b) app — media-before-report order, no code until completion, retry queue keyed by the
  unique id, duplicate rows collapsed to one.
- Verified with a real run: two staged files → report created with `media_count = 2` and
  `rows = 1`; legacy resubmission → `deduped = true` with the same code.

### Deploy steps
1. Extract the fresh `eplak-fixed-update.zip` over the `eplak-fixed` folder (Overwrite);
   the schema auto-upgrades to `2026-10-03.1`.
2. Install the new APK (2.0.30+); older versions reveal the code immediately.
3. Test: submit a report with a photo **and** a video. The success screen first shows
   “در حال بارگذاری…”, then **one tracking code**; “گزارش‌های من” and the details show
   one row with one code and the same photo/video.
4. Previously created duplicates are not deleted automatically; remove them from the
   admin panel (Reports → delete) if you want.

---

## 25) Round 26 — “Photos and videos are not re-uploaded” (root-cause fix) + in-app camera

### 1. Symptom
- On build 2.0.30, photos and videos were not uploaded when submitting a report, and
  “retry sending photo/video” never succeeded. The report stayed at
  “در حال بارگذاری عکس/فیلم…” and no tracking code was issued.

### 2. Root cause (four real defects, all fixed)
1. **Chunks were sent without the unique request reference.** The primary upload path is
   `api/media.php?action=chunk`; the request body only carried
   `phone/reportId/uploadId/index/total/name/mime/data` — no `client_ref`. Because the new
   “media first, report later” flow sends `reportId = 0`, the server answered
   `شناسه‌ی گزارش نامعتبر است` and **rejected every file**.
2. **Any server answer was treated as a hard failure**, so the file was neither retried with
   a smaller chunk nor sent through the backup gateway — it was silently dropped.
3. **The backup gateway had no staging mode.** `api/reports.php?action=add_media` only
   accepted `reportId > 0`, so the last-resort path was closed too.
4. **The retry queue was never cleaned.** `flushPendingMediaRef` used a transaction where a
   store was expected (`tx.objectStore('files')`), so no row was deleted and the function
   returned `false` even after a successful upload → the report was never created and every
   retry restarted from scratch.

### 3. Fixes
- `client_ref` is now sent with **every chunk** and on the backup gateway path.
- Only size/type/limit errors are “hard” (`isHardMediaError`); every other error gets another
  chance, and after a logical server answer we go straight to the backup gateway.
- `api/reports.php?action=add_media` now also accepts staged files (`reportId = 0` + `client_ref`)
  and returns `staged` and `media_count`.
- The queue is cleared with a correct transaction (`pendingDbDelete`): only rows that really
  reached the server are removed; on failure the files stay on the phone.
- “Retry” now takes files from **three sources**: the page’s own files, an in-memory copy of the
  last attempt, and the persistent IndexedDB queue (survives app restarts).
- Once stranded files arrive, `flushPendingCreates` creates the report so **one tracking code**
  (with its attachments) is issued.
- If the files are gone from app memory, a “select photo/video again” button appears; the file is
  uploaded with the **same unique reference**, so no second report or second code is created.

### 4. In-app camera (take photos and videos with the phone)
- The “images” step now has two new buttons: **“گرفتن عکس” (take photo)** and
  **“گرفتن فیلم” (take video)**, next to “choose from gallery”.
- `assets/js/ep-camera.js` opens the camera **inside the app** (getUserMedia): live viewfinder,
  front/rear switch, full-sensor photo capture encoded as JPEG, and video recording with
  MediaRecorder (60-second cap + elapsed-time badge).
- If camera permission is denied or recording is unsupported, the app silently falls back to the
  **phone’s own camera** (`input capture="environment"` / `camcorder`).
- Android side: `CAMERA` and `RECORD_AUDIO` permissions, a registered `FileProvider`, a “Camera”
  entry added to the file chooser, permission requested before opening the camera, the captured
  photo copied into app storage, and `onPermissionRequest` granting video/audio capture to the WebView.
- Camera output is a regular file and travels the very same shared path
  (`prepareCapturedFiles` → chunked upload → retry queue).

### 5. Tests
- 35 new tests: 8 server-side (staged storage through both the chunk path and the backup gateway,
  rejection without a reference, retry idempotency, both paths attaching to **one** report with
  **one** code) and 27 app-side — including **real execution** of the camera module
  (photo/video → file) and **real execution** of the queue and upload code with a fake IndexedDB
  and XHR (reference present in every chunk, delivery through the backup gateway, queue emptied
  after success, files kept on the phone after failure).
- Result: NOTIFY 32 · APP 156 · PUSHCRYPTO 8 · FCM 28 · BACKEND 137 · RESCUE 19 · ONLINE 55 ·
  GEO/MEDIA 128 — all green.

### Deploy steps
1. Extract the fresh `eplak-fixed-update.zip` over the `eplak-fixed` folder on the host (Overwrite).
   No database structure change is required (still `2026-10-03.1`).
2. Install the new APK (**2.0.31** or newer); the in-app camera and the fixed retry exist only there.
3. The first time you tap “take photo/video”, tap **Allow** on the camera permission prompt.
4. Test: submit a report with a photo **and** a video (one from the camera, one from the gallery).
   You should see “در حال بارگذاری… ٪” and then **one tracking code**, and in the report details
   **one row** with that photo/video.

---

## 26) Round 27 — per-file upload progress, “the video never arrived” fix, and the location map from our own server

**What the user reported:** the photo arrived but the video did not; the location map was invisible (use what Snapp/Neshan use); and a per-file percentage line chart inside the *Processing Flow* that turns into just “File uploaded” when done.

**Per-file progress chart** — shown in the report details under *Processing Flow → Report submitted* (and on the “Report submitted” screen): queued → bar + percent (“45%”, “4.8 of 10.6 MB”) → retrying → **bar disappears and only “File uploaded” remains** → or “Upload failed” with the real reason and a *Try again* button. Percent is byte-based, updates *inside* each chunk, and never shows 100% before the server confirms (`core/upload-progress.js`).

**Why the video did not arrive (all fixed):**
1. **The report was created before the video finished** (main cause). The periodic report sync (every 45 s, when opening “My reports”, when the app returns to the foreground) created every “pending” report; a video that is still uploading is not in the failure queue yet, so the sync assumed nothing was left, created the report with *only the photo* and issued the tracking code while the video was still in flight. If the app went to the background or closed in those minutes the video never attached. Reproduced in a real browser test; now a request is never created or re-sent while its files are uploading.
2. The server rejected more than 500 chunks, so large videos failed once the app shrank chunks behind a strict firewall. The cap is now 6000 (`EPLAK_MEDIA_MAX_CHUNKS`); with an old server the app enlarges the chunk instead.
3. A lost response made the retry get “order mismatch (409)” and restart the video. The server now acknowledges duplicate chunks without appending them; with an old server the app resumes from the server’s `expected` position.
4. Only 3 retries and no wait for connectivity: now 6 retries with growing pauses, 502–504 retried, and the app waits (up to 45 s) for the `online` event.

The in-app camera now records 720p at 1.5 Mbit/s (~11 MB/min instead of ~20).

**Location map.** Tiles came straight from `tile.openstreetmap.org`, but the app page is `file://` (no `Referer`), which OSM blocks. Snapp and Neshan both serve **OpenStreetMap-based** maps from their own servers ([Snapp](https://wiki.openstreetmap.org/wiki/Fa:Snapp), [Neshan](https://platform.neshan.org/)). Eplak now does the same: `api/tiles.php` fetches tiles from OSM (identifying User-Agent/Referer), caches them on disk and serves them from the same server the uploads use. Source order: our server → OSM direct; automatic failover (including a 12 s watchdog), a *Try again* button, and `geo:` links so Android offers installed map apps (Neshan, Balad, Google Maps). If the municipality obtains Neshan’s direct raster-tile service, put `tile_upstreams` / `tile_api_key` in `shared/config.php` (the key stays on the server). The host must allow outgoing HTTPS (cURL); the live check now verifies it.

**Tests:** `upload.test.mjs` (70) and `tiles.test.mjs` (59) were added; all 692 checks pass.

**Update steps:** extract the new `eplak-fixed-update.zip` (new files: `api/tiles.php`, `shared/tiles.php`, `core/upload-progress.js`) and install the new APK (the signing key of a GitHub build is kept in that branch’s cache; if it differs from the installed app’s, Android says “App not installed” — uninstall the previous build once).
