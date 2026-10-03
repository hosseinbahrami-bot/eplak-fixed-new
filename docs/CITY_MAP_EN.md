# “City Map & Places” + routing with Neshan

The **City Map & Places** screen (`screen-map`, the “City Map” card on Home / Services) is now a live map of Varamin
that shows the **city’s key places grouped by category**. One tap on a place **starts routing in the Neshan app**:
the origin is the **user’s own GPS position**, the destination is the place they tapped.

---

## 1) What the screen contains

| Part | Notes |
|---|---|
| Live map | The same lightweight `EplakMap` engine and the OpenStreetMap tiles served by the Eplak server (`api/tiles.php`). Colored markers per category, numbered clusters for nearby markers, pinch zoom (Ctrl+wheel / double-click in a browser) |
| Map buttons | “+”, “−”, **My location** (blue dot + accuracy circle), **Show all places** |
| Search | Persian / Arabic / English; “کهنه گل”, “کهنه‌گل” and “کهنهگل” are the same; Persian and Latin digits are equivalent |
| Category chips | All + 9 categories with counts (counts follow the search) |
| List | “All”: grouped by category with “Show all N”; one category or a search: flat list. With GPS: distance per place, sorted nearest first |
| Place card (bottom of the map) | Name, category, distance, address/note, **Route with Neshan**, car/motorcycle toggle, call button (only for verified numbers) |

### Categories (134 places)

| Category | Count | Examples |
|---|---|---|
| Health | 9 | Dr. Mofatteh Hospital, Shohada-ye 15 Khordad Hospital, 24-hour clinics, health network, social emergency |
| Mosques & Shrines | 28 | Jame Mosque of Varamin, Imamzadeh Yahya, Imamzadeh Hossein Reza, Tomb of Seyyed Fathollah, other imamzadehs, mosques, hosseiniyeh, martyrs’ cemetery |
| Culture & Heritage | 6 (+4 via second category) | Alaeddin Tower, Iraj Castle, Remains of Bajak Castle, Varamin Sugar Refinery (national heritage), Razi Cultural Center & Library; the Jame Mosque, Imamzadeh Yahya, Imamzadeh Hossein Reza and the Tomb of Seyyed Fathollah also match this filter |
| Offices | 18 | Governorate, Municipality (main / district / zone), courthouse, deeds registry, water, electricity, gas, social security, education … |
| Police & Rescue | 12 | Police command, police stations, traffic/cyber police, fire stations 1–4 |
| Education | 7 | Azad University (Sama / Agriculture), municipality applied-science center, Higher Education Complex of Health, agricultural research center, seminaries |
| Parks & Sports | 20 | Parks, Shohada Stadium, sports halls |
| Transport | 3 | Bus terminal, railway station, taxi stand |
| Neighborhoods & Squares | 31 | Kheyrabad, Shahrak-e Modarres, Kohneh Gol …; Imam Khomeini, Imam Hossein, Razi squares … |

---

## 2) How routing with Neshan works

Links are built **exactly as in Neshan’s official docs** (`platform.neshan.org/faq`, “intent links”):

| Case | Link |
|---|---|
| Route (Android & web) | `https://nshn.ir/?origin=lat,lng&destination=lat,lng&vehicle=d` (`d` car, `m` motorcycle) |
| Route (iOS) | `neshan://?origin=lat,lng&destination=lat,lng&vehicle=d` |
| Show the destination only (when GPS is unavailable) | `https://nshn.ir/?lat=lat&lng=lng` — iOS: `neshan://?ll=lat,lng` |

The origin is always the **user’s GPS position**. When “Route with Neshan” is tapped:

1. A position taken less than 2 minutes ago is reused; otherwise location permission is requested and GPS is read
   (high accuracy first; on timeout, one retry with the coarse network position).
2. The link above is built with origin = user and destination = place.
3. The link is opened according to the environment:

| Environment | Behavior |
|---|---|
| **Android app** | `AndroidApp.openNeshan(url)` in `MainActivity.kt`: first `Intent.ACTION_VIEW` with `setPackage("org.rajman.neshan.traffic.tehran.navigator")` (the Neshan app; the https link, then the same link over http if needed); if it is not installed, the same link opens in the phone’s browser (Neshan web). Only `nshn.ir` URLs are accepted. The result `app` / `web` / `none` is returned to the web layer, which shows a suitable message |
| Older Android app (no `openNeshan`) | `AndroidApp.openUrl(url)` |
| Android browser | `intent://nshn.ir/…#Intent;scheme=https;package=…;S.browser_fallback_url=…;end` |
| iOS | `neshan://…`; if the page is still visible after 1.6 s (app did not open) the web version is opened |
| Mobile browsers (Android/iOS) — note | A browser only allows opening an app right at the tap. If that same tap has to wait for GPS (and the permission prompt), the message “Your location is ready; tap … once more” is shown and the second tap opens Neshan instantly. (A position already permitted is read silently when the page opens, so one tap is usually enough.) The Android app has no such limit |
| Desktop | A new tab opened at tap time (so the browser does not block it) is pointed at the Neshan link once GPS arrives |

If GPS is unavailable (permission denied, GPS off, timeout), the flow does not break: **the destination opens in Neshan**
and the user is told to tap “Directions” there (Neshan takes the origin from the current location). If the Neshan app
is not installed, the place card shows an “Install Neshan” link (Cafe Bazaar); this uses `<queries>` in
`AndroidManifest.xml` and `AndroidApp.isNeshanInstalled()`.

---

## 3) Files

| File | Purpose |
|---|---|
| `core/places-data.js` | **Data only**: categories and places (Persian/English names, coordinates, address, phone) |
| `core/places.js` | Pure logic: search, distance, sorting, category icons and the **Neshan link builder** (`neshanLinks`) |
| `modules/city-map.js` | The screen: map, chips, list, place card, GPS, routing, and fetching the admin’s changes from `api/places.php` (cached) |
| `admin/places.php` | **“City places” admin page**: add / edit / hide / delete a place with a location-picker map |
| `api/places.php` | Public, read-only: the *difference* from the built-in list (added places, edits, hidden ones) |
| `shared/places_store.php` | Logic and the `city_places` table (validation, saving, public output) |
| `assets/js/ep-map.js` (v4) | Map engine; new “viewer map” mode (`picker:false`) with markers / clusters / “my location” / `fitBounds` / pinch zoom |
| `assets/css/style.css` | “City Map & Places” section (`.cm-*`) with day/night and LTR support |
| `android-app/.../MainActivity.kt`, `AndroidManifest.xml` | `openNeshan`, `isNeshanInstalled`, `<queries>` |
| `tools/dev/tests/places.test.mjs` | Automated test of the app screen (jsdom) |
| `tools/dev/tests/placesadmin.test.mjs` | Automated test of the admin page + API (real PHP) and the server ↔ app contract |

---

## 4) Adding or fixing a place — from the admin panel (no developer needed)

Admin menu → **“اماکن شهری” (City places)** (`admin/places.php`). The app’s built-in list is shown there, and municipality staff can:

| Task | How | Result in the app |
|---|---|---|
| **Add a place** | “Add a new place” → category, Persian name (required), English name, address, phone, note; **drag the map** so the red pin sits on the exact spot (or type latitude/longitude; Persian digits are accepted) | The place shows in its category, in search and on the map, and Neshan routing goes to that point |
| **Edit a built-in place** | The ✎ button next to a place; change name / coordinates / phone / note | That place changes in the app; “Restore to default” removes the edit |
| **Hide** | The crossed-eye button (e.g. a place that no longer exists) | Removed from the app’s list and map; “Show in app” brings it back |
| **Draft** | For an added place, untick “Show in the app immediately” | Not in the app until you publish it |
| **Delete** | Added places only | Gone for good (built-in places can only be hidden or edited) |

Notes:

- **When does the app see a change?** Each time “City Map & Places” opens, `api/places.php` is asked (at most once every 90 s; 15 s after an error). The last answer is kept on the phone, so added places also show offline. No APK update is needed.
- **The table** `city_places` is created automatically on first use (`CREATE TABLE IF NOT EXISTS`); no SQL import. If the hosting DB user lacks `CREATE TABLE`, the admin page says so and the app keeps showing the built-in list (nothing breaks).
- **Bounds:** coordinates must be inside Varamin (city bounds + ~6 km margin); anything outside is rejected.
- **Phone:** digits only (3–15 digits, with area code); enter verified numbers only.
- **“Approximate”:** tick it if you estimated the coordinates from an address; the app then shows an “approximate” badge.
- **Security:** every action requires an admin login and a CSRF token; texts are escaped when displayed (admin and app). `api/places.php` is read-only and carries no user data.
- **Source of truth:** the built-in list still lives in `core/places-data.js` (for developers); the panel only stores the *difference* in the database.

### As a file (developers): one line in `core/places-data.js`

One line in the `places` array of `core/places-data.js`:

```js
{"id": "my-place", "cat": "health", "fa": "درمانگاه نمونه", "en": "Sample Clinic", "lat": 35.32837, "lng": 51.66248, "addr": "خیابان …", "addrEn": "… St.", "tel": "02112345678"},
```

- `id` unique and ASCII; `cat` one of `health`, `mosque`, `culture`, `office`, `safety`, `edu`, `park`, `transport`, `area`.
- `also` (optional): a second category for filtering (e.g. `"also": "culture"` for a historic mosque).
- `lat`/`lng`: take them from OpenStreetMap (right-click → “Show address”) or from the Neshan app (long-press a point → coordinates); at most 5 decimals.
- `tel`: verified numbers only (110, 123, 125, 137 or a landline with the 021… prefix).
- `approx: 1`: when you estimated the coordinates from an address; the place card then shows “approximate”.
- After editing run `bash tools/dev/run-regression.sh places` (checks unique ids, city bounds, duplicates, phone format) and bump `core/places-data.js?v=…` in `index.html` so phones refresh their cache.

## 5) Data source and limits

- Coordinates come from **OpenStreetMap** (© OpenStreetMap contributors, ODbL), fetched on 2026-10-01 and cross-checked against official sources
  (hospital addresses/phones, governorate and municipality addresses from their official sites, landmarks against Wikipedia).
  Only places that are named in OSM are included; unnamed mosques or very new buildings may be missing — add them yourself.
- The **Varamin Governorate** is unnamed in OSM; its position follows the official address (“Emam Hossein Sq., Shahid Beheshti St., opposite the Municipality”) and the point recorded for it on the Balad map (Governorate St.); with no official coordinates source it is flagged `approx`.
- **Offices without reliable coordinates** are not listed and should be added from the panel: the Welfare office next to the Governorate (the existing “Welfare” point is the Kheyrabad center), Municipality Zone 3 and the municipal districts, the waste-management organization, civil registry, tax office … (how to add: section 4).
- **Four registered national monuments** (Imamzadeh Hossein Reza, Tomb of Seyyed Fathollah, Remains of Bajak Castle, Varamin Sugar Refinery) are not named in OSM; their coordinates come from **Wikidata** (CC0; items with “National Heritage of Iran”) and, having no second source, are flagged `approx`.
- The base map needs internet and the tile server; if it fails you see “Map imagery could not be loaded” with a retry button, but the list and routing still work.
- Unnamed or brand-new mosques, offices and cultural venues are not in OSM/Wikidata (e.g. civil registry, tax office, post, council, relief …); municipality staff add them through the **“City places” admin page** (section 4).

## 6) Testing on a real phone

1. Install the new APK and turn GPS on.
2. Home → “City Map” → “Health” chip → “Dr. Mofatteh Hospital” → “Route with Neshan” (grant location permission).
3. The Neshan app should open with a route from your position to the hospital. Without Neshan installed, the Neshan web version opens.
4. If Neshan opens but only shows the point (no route), send us that link so the format can be aligned with your Neshan version.
