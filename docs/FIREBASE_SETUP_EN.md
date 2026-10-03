# 🔥 Step-by-step: creating the Firebase files

> Written for the **Eplak** project. When you finish, panel notifications will reach
> the phone **even when the Android app is completely closed**.
>
> Time needed: about **10 minutes**. Cost: **free**.

---

## 🎯 You will end up with two files

These two are often confused — read this table first:

| File | What it does | Where it goes | Secret? |
|---|---|---|---|
| **`google-services.json`** | Tells the app which Firebase project to use | GitHub, path `android-app/app/` | ❌ not secret |
| **Service-account key** (a JSON file named like `eplak-firebase-adminsdk-xxxx.json`) | Lets the **server** send notifications | Only in the **admin panel → Settings** | ✅ **strictly secret** |

> ⚠️ Never commit the service-account key or share it with anyone.

---

## 📋 Before you start

- A Google account (use the same one throughout).
- Access to the admin panel (`eplak.ir/eplak-fixed/admin`).
- Access to the GitHub repository (to upload `google-services.json`).

---

# Part 1 — Create the Firebase project

1. Open <https://console.firebase.google.com> and sign in with Google.
2. Click **Create a project** (a.k.a. *Add project*).
3. Type a name, e.g. `eplak`, then **Continue**.
4. Google Analytics: **not needed** — switch it **off**, then click **Create project**.
5. Wait a few seconds → **Continue**. You are now on the **Project Overview** page.

---

# Part 2 — Register the Android app and download `google-services.json`

1. On the Project Overview page, under **“Get started by adding Firebase to your app”**,
   click the **Android** icon.
   *(Alternative: ⚙️ gear → Project settings → **Add app** → Android.)*
2. Fill in the form — only one field is required:

| Field | Value |
|---|---|
| **Android package name** | `com.example.eplakfixed` |
| **App nickname** (optional) | `Eplak` |
| **Debug signing certificate SHA-1** (optional) | leave **empty** (not needed for FCM) |

   > 🔴 The package name must match **exactly**. One wrong letter and the app will not connect.

3. Click **Register app**.
4. Step 2 says *“Download and then add config file”* → click **Download google-services.json**.
5. Click **Next** through step 3 (*Add Firebase SDK* — change nothing; it is already configured
   in this project) and step 4 → **Continue to console**.

### 🟦 If the console asks “Kotlin DSL or Groovy?” — which one?

On the **“Add Firebase SDK”** step the console shows two code tabs:
`Kotlin DSL (build.gradle.kts)` and `Groovy (build.gradle)`.

> ✅ **Neither. Copy nothing — just click `Next`.**

**Why:** both required pieces are already in this project:

| Requirement | Status in the Eplak app | File |
|---|---|---|
| Google Services Gradle plugin | ✅ already added (`classpath 'com.google.gms:google-services:4.4.2'`) | `android-app/build.gradle` |
| Plugin applied to the app | ✅ automatic as soon as `google-services.json` exists | `android-app/app/build.gradle` |
| Firebase Messaging SDK | ✅ already added (`firebase-messaging`, `firebase-bom:33.7.0`) | `android-app/app/build.gradle` |

This project uses **Groovy** (there is no `build.gradle.kts` anywhere), so if you ever do
need to add code, the **Groovy** tab is the right one — but not today.

> ⚠️ Pasting those snippets into the project would break the APK build with
> `Duplicate class` / `plugin already applied` errors. Just press `Next`.

**Lost the file?** Download it again any time:
**⚙️ Project settings → General tab → Your apps → the Android app → `google-services.json`**.

---

# Part 3 — Put the file on GitHub

The file must live at **`android-app/app/google-services.json`**.

**Easiest way (no tools needed):**

1. Open
   <https://github.com/hosseinbahrami-bot/eplak-fixed/tree/main/android-app/app>
2. Click **Add file → Upload files**, drag `google-services.json` in.
3. Write a short message, e.g. `add firebase google-services.json`, and click **Commit changes**.

**Or with git:**

```bash
cp ~/Downloads/google-services.json android-app/app/google-services.json
git add android-app/app/google-services.json
git commit -m "add firebase google-services.json"
git push
```

⚠️ Keep the exact file name and the exact folder — not the repo root, not `android-app/`.

**What happens next:** the GitHub Action **Build Android APK** runs automatically
(1–2 minutes) and publishes a fresh APK **with Firebase enabled**:
<https://github.com/hosseinbahrami-bot/eplak-fixed/releases/download/v2.0-eplak-update/eplak-app.apk>

In the build log you should see:
`EplakFCM: google-services.json پیدا شد — اعلان فایربیس فعال می‌شود.` ✅

Install that APK on the phone (it updates over the previous version; if you get
“App not installed”, uninstall the old one first).

---

# Part 4 — Get the service-account key (for server-side sending)

1. In the Firebase console click **⚙️ (gear) → Project settings**.
2. Open the **Service accounts** tab.
3. Under **Firebase Admin SDK** click **Generate new private key** → **Generate key**.
4. A JSON file downloads (e.g. `eplak-firebase-adminsdk-a1b2c.json`).

> 🔒 This file is your server’s password. Keep it out of GitHub, chat and email.
> The repository’s `.gitignore` already blocks `*firebase-adminsdk*.json`.

Open it in a text editor (do **not** change anything). Note the two useful values:

```json
{
  "type": "service_account",
  "project_id": "eplak",
  "private_key": "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-…@eplak.iam.gserviceaccount.com",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

---

# Part 5 — Paste the key into the admin panel

1. Sign in: <https://eplak.ir/eplak-fixed/admin/login.php>
2. Sidebar → **تنظیمات (Settings)**.
3. Find the section **«اعلان گوشی برای اپ اندروید (فایربیس)»** (key icon 🔑).
4. Open the key file, select all (**Ctrl+A**), copy (**Ctrl+C**), paste into the
   **«کلید سرویس فایربیس (محتوای فایل JSON)»** box.
5. Click **«ذخیره و بررسی اتصال»** (Save and check connection).

A green message like this means the server successfully talked to Google:

> **«✅ کلید سرویس فایربیس ذخیره شد و اتصال به گوگل برقرار است (پروژه: eplak)»**

---

# Part 6 — Final test (the important part)

1. **Install the new APK** (built after adding `google-services.json`), open the app once and
   allow notifications (Android 13+ asks; tap **Allow**). The phone registers itself automatically —
   the app deliberately does **not** claim “phone notifications are fully active”; the only real test is to fully close the app, send a test notification from the admin panel and check that it arrives.
2. In the panel → **تنظیمات** → fill **«ارسال آزمایشی به اپ اندروید»** with the phone number
   used in the app → click **«ارسال آزمایشی فایربیس»**. You should get
   *«✅ اعلان آزمایشی فایربیس برای … دستگاه ارسال شد.»*
3. **Lock the phone or fully close the app**, then send a normal notification from
   **«ارسال اعلان»**. It should arrive within seconds. 🎉
4. Quick health check: panel → **«بررسی نسخه» (Version check)** →
   *Firebase* should read **آماده (ready)** and *registered phones* should be **> 0**.

---

# 🛠 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Panel says “service key not entered” | key not saved | do Parts 4–5 |
| `SERVICE_DISABLED` / HTTP 403 | Google messaging API disabled for the project | click the blue *Enable* link in the error message, wait 2 min, save again |
| “registered phones” = 0 | Firebase APK not installed / never opened | install the new APK and open it once |
| `SENDER_ID_MISMATCH` | `google-services.json` from a different project | re-download from the same project and replace |
| `UNREGISTERED` | that device token is stale | open the app again (handled automatically) |
| App open but no tray notification | notification permission denied | phone Settings → Apps → Eplak → Notifications → on |
| Intermittent on Xiaomi/Huawei/Samsung | battery optimisation kills the app | phone Settings → Battery → Eplak → **Unrestricted** |
| Nothing at all | app was “Force stopped” | open the app once (Android holds messages until then) |
| Build log: `google-services.json` missing | wrong folder or filename | must be `android-app/app/google-services.json` |

The panel now shows Google’s real error text (e.g. `UNREGISTERED`, `SERVICE_DISABLED`) on the
**«ارسال اعلان»** page and on **«بررسی نسخه»**.

---

## 🔔 “I set a report to *in progress / done* but the citizen got no notification”

A status change or reply is created from **three places** and **all three** now notify the citizen:
the *reply* form on the report detail page, the *quick status* select on the reports list, and the *edit* page.
(Only when the status or the reply text **actually changed** — re-saving the same status with the same reply does not create a duplicate.)

After every change the panel shows a coloured message with the **real outcome**:

| Panel message | Meaning | What to do |
|---|---|---|
| ✅ “… phone notification sent to N devices” | Google accepted the message | nothing; if the phone shows nothing, check notification permission and battery saver |
| ⚠️ “no phone registered” | the in-app notification was stored but this user's phone is not registered on the server | the user must install the **latest APK**, open it and sign in with their number (registration is automatic); then press *resend last notification* on the report page |
| ⚠️ “Firebase key not configured” | no service key in the panel | Parts 4–5 of this guide |
| ❌ “server cannot reach Google” | the host firewall/DNS blocks outbound HTTPS to `googleapis.com` | ask the host to allow `oauth2.googleapis.com` and `fcm.googleapis.com` on port 443 |
| ❌ “Google rejected the send …” | a Google error (text + fix shown in the message) | the table above |

**Diagnostics inside the panel (no host access needed):**
- **Settings → section «بررسی زنجیره‌ی اعلان» (Check the notification chain) → button «بررسی اتصال به گوگل و فایربیس»** — tests key → Google OAuth → FCM API → registered phones, with a plain-language fix for each broken step. Sends nothing to anyone.
- **Settings → “Registered phones” / “Latest sends”**.
- **Report detail → “Phone notification for this user”** — the user's devices, per-report send results, *resend* and *test* buttons.
- **Version check** — the *registered phones* number, and the marker “phone registration from the Android app” must read *present*; if it does not, `api/_common.php` / `api/push.php` from the latest update package are not on the host.

**Inside the app (citizen):** the notifications screen shows a status line (✅ registered / ⏳ fetching id / ⚠️ not registered) and a **“Test notification”** button that sends a test to *this* phone and explains any failure. If the permission was denied, **“Phone notification settings”** opens the app's system notification settings.

> **Previous root cause:** the app registered its phone as a plain form post, but `api/push.php` only read JSON, so every registration was rejected with HTTP 400 and `device_tokens` stayed empty (no panel notification ever left the server). The server now accepts both formats, and the app retries with 2/4/8/16/30 s back-off until registration succeeds and refreshes it every 6 hours.

---

# ❓ FAQ

**Is it free?** Yes — FCM is free at this volume.
**Can I redo it later?** Yes: replace `google-services.json`, paste the new key, rebuild.
**Is `google-services.json` secret?** No, it only identifies the project. The *service-account key* is secret.
**Can I turn FCM off later?** Yes — delete the key in the panel; the app keeps working (in-app notifications only).
**How do I verify both files belong to one project?** Compare `project_id` — the panel shows it on the
**«بررسی نسخه»** page.

---

# ✅ Final checklist

- [ ] Firebase project created
- [ ] Android app registered as `com.example.eplakfixed`
- [ ] `google-services.json` downloaded
- [ ] committed at `android-app/app/google-services.json`
- [ ] **Build Android APK** green and the new APK installed & opened once
- [ ] service-account key generated (**Project settings → Service accounts**)
- [ ] key saved in the panel (**تنظیمات → اعلان فایربیس**) with the ✅ message
- [ ] test notification received on the phone
- [ ] notification received while the app was **closed** 🎉
