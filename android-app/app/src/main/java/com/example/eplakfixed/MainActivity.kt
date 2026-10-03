package com.example.eplakfixed

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Address
import android.location.Geocoder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.provider.Settings
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.util.Locale

class MainActivity : AppCompatActivity() {

    companion object {
        /* حافظه‌ی «باید دوباره کد تایید گرفته شود».
           خواسته‌ی کارفرما: پس از خروج از اپ (دوبار زدن دکمه‌ی بازگشت) و باز
           شدن دوباره، حساب کاربری به‌خاطر سپرده نشود و کاربر باید دوباره کد
           تایید بگیرد. */
        const val SESSION_PREFS = "eplak_session"
        const val KEY_REQUIRE_LOGIN = "require_login"

        /* بسته‌ی برنامه‌ی «نشان» (Neshan) — برای مسیریابی در «نقشه و اماکن شهری» */
        const val NESHAN_PACKAGE = "org.rajman.neshan.traffic.tehran.navigator"

        /* آخرین WebView زنده. وقتی فایربیس توکن تازه‌ای می‌دهد (توکن غیرهمگام
           می‌رسد؛ در اولین اجرا لایه‌ی وب آن را هنوز ندارد)، به لایه‌ی وب خبر
           می‌دهیم تا همان لحظه گوشی را در سرور ثبت کند. بدون این هم‌خوانی، ثبت
           گوشی تا «بار بعدی باز شدن اپ» عقب می‌افتاد. */
        @Volatile
        private var liveWebView: java.lang.ref.WeakReference<WebView>? = null

        fun notifyFcmTokenReady() {
            val view = liveWebView?.get() ?: return
            view.post {
                view.evaluateJavascript(
                    "window.eplakOnFcmToken && window.eplakOnFcmToken();",
                    null
                )
            }
        }
    }

    private lateinit var webView: WebView

    /* ── انتخاب عکس/فیلم از گالری ─────────────────────────────────────────
       بدون این بخش، ضربه زدن روی «افزودن عکس یا فیلم» در فرم ثبت درخواست
       هیچ کاری نمی‌کرد (اندروید فایل‌چوزر را خودش باز نمی‌کند و باید با
       onShowFileChooser از طرف صفحه‌ی وب باز شود). */
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    /* ── گرفتن عکس و فیلم با دوربین گوشی ─────────────────────────────────
       کاربر باید بتواند داخل اپ عکس بگیرد و فیلم ضبط کند و همان را با گزارش
       بارگذاری کند. دو مسیر پشتیبانی می‌شود:
         ۱) دوربین داخل اپ (getUserMedia در لایه‌ی وب — assets/js/ep-camera.js)
            که با onPermissionRequest اجازه‌ی دوربین/میکروفون را به WebView می‌دهیم.
         ۲) دوربین خود گوشی: وقتی صفحه input با capture باز کند، در کنار گالری
            یک گزینه‌ی «دوربین» به پنجره‌ی انتخاب اضافه می‌کنیم و نتیجه (فایل
            عکس/فیلم) را مثل فایل گالری داخل کش اپ کپی و به WebView می‌دهیم. */
    private var pendingCameraFile: File? = null
    private var pendingChooserIntent: Intent? = null
    private var pendingWebPermissionRequest: PermissionRequest? = null

    /* ── موقعیت مکانی (GPS) ───────────────────────────────────────────────
       callback مربوط به درخواست موقعیت از داخل WebView تا زمان پاسخ کاربر
       نگه داشته می‌شود. */
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private var pendingGeoOrigin: String? = null

    /* درخواست اجازه‌ی اعلان (اندروید ۱۳ و بالاتر) — نتیجه‌اش به لایه‌ی وب خبر داده می‌شود */
    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            webView.evaluateJavascript(
                "window.eplakNativePermissionResult && window.eplakNativePermissionResult($granted);",
                null
            )
        }

    /* نتیجه‌ی انتخاب فایل (تک یا چند فایل) به WebView برگردانده می‌شود.
       اگر کاربر لغو کند، باید مقدار null بفرستیم؛ وگرنه فیلد فایل هرگز
       دوباره کار نمی‌کرد. */
    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = filePathCallback ?: return@registerForActivityResult
            filePathCallback = null
            callback.onReceiveValue(collectChosenUris(result.resultCode, result.data))
        }

    /* نتیجه‌ی اجازه‌ی دوربین/میکروفون:
       الف) اگر پنجره‌ی انتخاب فایل در انتظار باشد، همان باز می‌شود.
       ب) اگر درخواست از خود WebView آمده باشد (دوربین داخل اپ)، اجازه به
          WebView برگردانده می‌شود تا getUserMedia کار کند. */
    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
            val cameraGranted = grants[Manifest.permission.CAMERA] == true
            val micGranted = grants[Manifest.permission.RECORD_AUDIO] == true

            val webRequest = pendingWebPermissionRequest
            pendingWebPermissionRequest = null
            if (webRequest != null) {
                val ok = mutableListOf<String>()
                webRequest.resources.forEach { res ->
                    if (res == PermissionRequest.RESOURCE_VIDEO_CAPTURE && cameraGranted) ok.add(res)
                    if (res == PermissionRequest.RESOURCE_AUDIO_CAPTURE && micGranted) ok.add(res)
                }
                try {
                    if (ok.isNotEmpty()) webRequest.grant(ok.toTypedArray()) else webRequest.deny()
                } catch (e: Throwable) {
                }
                webView.evaluateJavascript(
                    "window.eplakCameraPermissionResult && window.eplakCameraPermissionResult($cameraGranted);",
                    null
                )
            }

            val chooser = pendingChooserIntent
            pendingChooserIntent = null
            if (chooser != null) {
                if (cameraGranted) {
                    try {
                        fileChooserLauncher.launch(chooser)
                        return@registerForActivityResult
                    } catch (e: Throwable) {
                        /* اگر دوربین باز نشد، همان گالری امتحان می‌شود */
                    }
                }
                /* بدون اجازه‌ی دوربین، فقط گالری می‌ماند */
                filePathCallback?.onReceiveValue(null)
                filePathCallback = null
                Toast.makeText(
                    this,
                    "اجازه‌ی دوربین داده نشد؛ می‌توانید عکس/فیلم را از گالری انتخاب کنید",
                    Toast.LENGTH_LONG
                ).show()
            }
        }

    /* نتیجه‌ی اجازه‌ی موقعیت مکانی */
    private val locationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
            val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true

            /* پاسخ به WebView (اگر درخواست از سمت خود WebView آمده باشد) */
            val callback = pendingGeoCallback
            val origin = pendingGeoOrigin
            pendingGeoCallback = null
            pendingGeoOrigin = null
            if (callback != null && origin != null) {
                callback.invoke(origin, granted, false)
            }

            /* خبر دادن به لایه‌ی وب تا در صورت گرفتن اجازه، موقعیت را دوباره بخواهد */
            notifyWebLocationPermission(granted)

            if (!granted) {
                Toast.makeText(
                    this,
                    "اجازه‌ی موقعیت مکانی داده نشد؛ می‌توانید محل را با کشیدن نقشه انتخاب کنید",
                    Toast.LENGTH_LONG
                ).show()
            }
        }

    private fun notifyWebLocationPermission(granted: Boolean) {
        webView.post {
            try {
                webView.evaluateJavascript(
                    "window.eplakLocationPermissionResult && window.eplakLocationPermissionResult($granted);",
                    null
                )
            } catch (e: Throwable) {
            }
        }
    }

    /* ── آدرس نوشتاری دقیق از مختصات (آدرس‌یاب خود گوشی) ─────────────────
       لایه‌ی وب (modules/reports.js) پس از گرفتن موقعیت، این متد را صدا
       می‌زند و نتیجه با window.eplakAddressResult(lat, lng, text) به وب
       برمی‌گردد. اگر گوشی آدرسی پیدا نکرد، رشته‌ی خالی می‌فرستیم و لایه‌ی
       وب خودش سرویس OpenStreetMap را امتحان می‌کند. */
    private fun requestAddressForWeb(lat: Double, lng: Double) {
        if (lat.isNaN() || lng.isNaN() || lat.isInfinite() || lng.isInfinite()) return
        Thread {
            val text = lookupAddressText(lat, lng)
            webView.post {
                try {
                    webView.evaluateJavascript(
                        "window.eplakAddressResult && window.eplakAddressResult(" +
                            lat.toString() + "," + lng.toString() + "," +
                            JSONObject.quote(text) + ");",
                        null
                    )
                } catch (e: Throwable) {
                }
            }
        }.start()
    }

    /* آدرس‌یاب گوشی؛ اول با زبان فارسی و در صورت نبود نتیجه با زبان پیش‌فرض */
    @Suppress("DEPRECATION")
    private fun lookupAddressText(lat: Double, lng: Double): String {
        if (!Geocoder.isPresent()) return ""
        val locales = listOf(Locale("fa", "IR"), Locale.getDefault())
        for (locale in locales) {
            try {
                val results = Geocoder(this, locale).getFromLocation(lat, lng, 1)
                val address = results?.firstOrNull() ?: continue
                val text = buildAddressText(address)
                if (text.isNotEmpty()) return text
            } catch (e: Throwable) {
                /* زبان بعدی را امتحان می‌کنیم */
            }
        }
        return ""
    }

    /* ساخت آدرس کوتاه و دقیق: «خیابان، پلاک، محله، شهر» */
    private fun buildAddressText(address: Address): String {
        val parts = mutableListOf<String>()
        val street = address.thoroughfare?.trim().orEmpty()
        val house = address.subThoroughfare?.trim().orEmpty()
        if (street.isNotEmpty()) {
            parts.add(if (house.isNotEmpty()) "$street، پلاک $house" else street)
        }
        val hood = address.subLocality?.trim().orEmpty()
        if (hood.isNotEmpty() && !parts.contains(hood)) parts.add(hood)
        val city = address.locality?.trim().orEmpty().ifEmpty { address.subAdminArea?.trim().orEmpty() }
        if (city.isNotEmpty() && !parts.contains(city)) parts.add(city)
        return parts.joinToString("، ")
    }

    private fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
        return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
    }

    private fun requestLocationPermission() {
        if (hasLocationPermission()) {
            notifyWebLocationPermission(true)
            return
        }
        locationPermissionLauncher.launch(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        )
    }

    /* Uriهای انتخاب‌شده (یک فایل یا چند فایل) از نتیجه‌ی گالری.
       ─ هر Uri پیش از تحویل به WebView، داخل حافظه‌ی خود اپ کپی می‌شود ─
       چرا؟ گالری‌ها و برنامه‌های «فایل» روی گوشی‌های مختلف، Uri را از
       سرویس‌دهنده‌های گوناگون (content://) می‌دهند و دسترسی خواندن آن‌ها
       همیشه به WebView منتقل نمی‌شود؛ نتیجه این بود که فایل انتخاب‌شده
       «خالی/ناخوانا» به صفحه می‌رسید و آپلود بی‌صدا شکست می‌خورد. حالا بایت‌های
       فایل همان لحظه (که مجوز خواندن فعال است) داخل پوشه‌ی کشِ خود اپ نوشته
       می‌شود و آدرس file:// تحویل WebView می‌گردد؛ این آدرس همیشه خواناست. */
    private fun collectChosenUris(resultCode: Int, data: Intent?): Array<Uri>? {
        if (resultCode != android.app.Activity.RESULT_OK) {
            pendingCameraFile = null
            return null
        }

        /* ── عکسی که با دوربین گوشی گرفته شده ─────────────────────────────
           در این حالت Intent نتیجه خالی است (چون آدرس خروجی را خودمان داده‌ایم)
           و فایل در پوشه‌ی کش اپ نوشته شده است. */
        val shot = pendingCameraFile
        pendingCameraFile = null
        if (data == null || (data.data == null && data.clipData == null)) {
            if (shot != null && shot.exists() && shot.length() > 0L) {
                val local = copyExistingFileToPicked(shot, "jpg")
                if (local != null) {
                    notifyWebFilePick(1, 1)
                    return arrayOf(local)
                }
            }
            return null
        }

        val raw = ArrayList<Uri>()

        /* انتخاب چندتایی */
        data.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) {
                clip.getItemAt(i)?.uri?.let { raw.add(it) }
            }
        }

        /* انتخاب تک‌فایل */
        if (raw.isEmpty()) {
            data.data?.let { raw.add(it) }
        }
        if (raw.isEmpty()) return null

        val out = ArrayList<Uri>(raw.size)
        var copied = 0
        raw.forEach { uri ->
            val local = copyPickedFileToCache(uri)
            if (local != null) {
                out.add(local)
                copied++
            } else {
                /* اگر کپی ممکن نشد، همان Uri اصلی را می‌دهیم تا شانس دوم از دست نرود */
                out.add(uri)
            }
        }
        notifyWebFilePick(copied, out.size)
        return out.toTypedArray()
    }

    /* کپی فایل انتخاب‌شده در پوشه‌ی کش اپ و برگرداندن آدرس file:// آن */
    private fun copyPickedFileToCache(uri: Uri): Uri? {
        return try {
            val resolver = contentResolver
            val mime = resolver.getType(uri) ?: ""
            val display = queryDisplayName(uri) ?: ""
            val extension = when {
                display.contains('.') -> display.substringAfterLast('.').take(8)
                mime.startsWith("image/") -> mime.removePrefix("image/").take(5)
                mime.startsWith("video/") -> mime.removePrefix("video/").take(5)
                else -> "bin"
            }
            val dir = java.io.File(cacheDir, "picked").apply { mkdirs() }
            val dest = java.io.File(dir, "pick-" + System.currentTimeMillis() + "-" + (0..9999).random() + "." + extension)

            resolver.openInputStream(uri)?.use { input ->
                java.io.FileOutputStream(dest).use { output ->
                    input.copyTo(output, 256 * 1024)
                }
            } ?: return null

            if (dest.length() <= 0L) {
                dest.delete()
                return null
            }
            /* کش قدیمی پاک می‌شود تا حافظه‌ی گوشی پر نشود */
            cleanOldPickedFiles(dir, dest)
            Uri.fromFile(dest)
        } catch (e: Exception) {
            null
        }
    }

    /* کپی یک فایل موجود (مثلاً عکس گرفته‌شده با دوربین) در پوشه‌ی کش اپ و
       برگرداندن آدرس file:// آن — همان مسیری که WebView همیشه می‌خواندش. */
    private fun copyExistingFileToPicked(src: File, fallbackExt: String): Uri? {
        return try {
            val dir = File(cacheDir, "picked").apply { mkdirs() }
            val ext = src.name.substringAfterLast('.', fallbackExt).take(8).ifEmpty { fallbackExt }
            val dest = File(dir, "shot-" + System.currentTimeMillis() + "-" + (0..9999).random() + "." + ext)
            if (!src.copyTo(dest, true).exists() || dest.length() <= 0L) {
                dest.delete()
                return null
            }
            cleanOldPickedFiles(dir, dest)
            Uri.fromFile(dest)
        } catch (e: Throwable) {
            null
        }
    }

    /* نام نمایشی فایل از سرویس‌دهنده (برای پسوند درست) */
    private fun queryDisplayName(uri: Uri): String? {
        return try {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && cursor.moveToFirst()) cursor.getString(idx) else null
            }
        } catch (e: Exception) {
            null
        }
    }

    /* نگه‌داشتن حداکثر ۱۲ فایل تازه در کش انتخاب‌ها */
    private fun cleanOldPickedFiles(dir: java.io.File, keep: java.io.File) {
        try {
            val files = dir.listFiles()?.sortedByDescending { it.lastModified() } ?: return
            files.drop(12).forEach { if (it.absolutePath != keep.absolutePath) it.delete() }
        } catch (e: Exception) {
            /* بی‌اهمیت */
        }
    }

    /* خبر دادن نتیجه‌ی انتخاب فایل به لایه‌ی وب (برای پیام‌های دقیق‌تر) */
    private fun notifyWebFilePick(copied: Int, total: Int) {
        try {
            webView.post {
                webView.evaluateJavascript(
                    "window.eplakNativeFilesPicked && window.eplakNativeFilesPicked($copied, $total);",
                    null
                )
            }
        } catch (e: Exception) {
            /* بی‌اهمیت */
        }
    }

    /* ساخت Intent گالری: هم عکس، هم فیلم و (اگر صفحه چند انتخاب بخواهد) چندتایی */
    private fun buildFileChooserIntent(params: WebChromeClient.FileChooserParams): Intent {
        val mimeTypes = LinkedHashSet<String>()
        params.acceptTypes?.forEach { raw ->
            raw.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach { mimeTypes.add(it) }
        }
        if (mimeTypes.isEmpty()) {
            mimeTypes.add("image/*")
            mimeTypes.add("video/*")
        }

        val allowMultiple = params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE

        val pickIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toTypedArray())
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple)
        }

        val wantsVideo = mimeTypes.any { it.startsWith("video") }
        val wantsImage = mimeTypes.any { it.startsWith("image") }

        val chooser = Intent.createChooser(pickIntent, "انتخاب عکس یا فیلم").apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        /* صفحه input با capture باز کرده (دکمه‌های «گرفتن عکس» و «گرفتن فیلم»)
           یا نوع فایل فقط عکس/فیلم است → گزینه‌ی «دوربین» هم اضافه می‌شود تا
           کاربر بتواند همان‌جا با گوشی عکس بگیرد یا فیلم ضبط کند. */
        val capture = params.isCaptureEnabled || (mimeTypes.size == 1)
        val cameraIntent = if (capture) buildCameraIntent(wantsVideo, wantsImage) else null
        if (cameraIntent != null) {
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
        }
        return chooser
    }

    /* ساخت Intent دوربین: فیلم با ACTION_VIDEO_CAPTURE و عکس با
       ACTION_IMAGE_CAPTURE که نتیجه‌اش داخل پوشه‌ی کش اپ نوشته می‌شود. */
    private fun buildCameraIntent(wantsVideo: Boolean, wantsImage: Boolean): Intent? {
        return try {
            if (wantsVideo && !wantsImage) {
                Intent(MediaStore.ACTION_VIDEO_CAPTURE).apply {
                    putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1)
                    putExtra(MediaStore.EXTRA_DURATION_LIMIT, 60)
                }
            } else {
                val dir = File(cacheDir, "camera").apply { mkdirs() }
                val shot = File(dir, "shot-" + System.currentTimeMillis() + ".jpg")
                pendingCameraFile = shot
                val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", shot)
                Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                    putExtra(MediaStore.EXTRA_OUTPUT, uri)
                    addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }
        } catch (e: Throwable) {
            pendingCameraFile = null
            null
        }
    }

    /* اجازه‌ی دوربین/میکروفون داریم؟ (برای باز کردن دوربین خود گوشی) */
    private fun hasCameraPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun requestCameraPermission(needMic: Boolean) {
        val wanted = mutableListOf(Manifest.permission.CAMERA)
        if (needMic) wanted.add(Manifest.permission.RECORD_AUDIO)
        cameraPermissionLauncher.launch(wanted.toTypedArray())
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        /* اگر این، یک «بالا آمدن تازه»ی اپ است (نه چرخش صفحه یا برگشت از
           پس‌زمینه)، ورود قبلی معتبر نیست و لایه‌ی وب باید صفحه‌ی کد تایید را
           نشان بدهد. */
        if (savedInstanceState == null) {
            getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_REQUIRE_LOGIN, true)
                .apply()
        }

        webView = findViewById<WebView>(R.id.myWebView)
        liveWebView = java.lang.ref.WeakReference(webView)
        val webSettings = webView.settings

        // فعال‌سازی جاوااسکریپت و ذخیره‌سازی
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
        webSettings.databaseEnabled = true
        webSettings.javaScriptCanOpenWindowsAutomatically = true

        /* دسترسی به فایل‌ها
           ــ نکته‌ی مهم (اصلاح باگ «پیوست‌ها به سرور نرسید»): صفحه‌ی اپ از
              file:///android_asset باز می‌شود و origin آن «null» است. اگر
              allowUniversalAccessFromFileURLs خاموش باشد، وب‌ویو درخواست‌های
              شبکه‌ای (fetch/XHR) از این صفحه به دامنه‌ی سرور را بی‌صدا رد
              می‌کند — یعنی گزارش/عکس/فیلم هرگز به سرور نمی‌رسید در حالی که
              صفحه‌ی «ثبت شد» نمایش داده می‌شد. پس این گزینه باید روشن باشد.
           ــ ریشه‌ی باگ «عکس/فیلم بارگذاری نمی‌شود»: تا پیش از این،
              allowFileAccess خاموش بود. از اندروید ۱۱ (API ۳۰) به بعد، اگر
              اپ با targetSdk ≥ ۳۰ ساخته شود، پیش‌فرض این گزینه «خاموش» است؛
              یعنی هر فایلی که با آدرس file:// به صفحه داده شود (همان چیزی که
              پنجره‌ی انتخاب فایل تحویل می‌دهد و همان چیزی که ما فایل انتخابی
              کاربر را داخل آن کپی می‌کنیم) برای WebView ناخوانا بود. نتیجه:
              فایل انتخاب می‌شد ولی هنگام ارسال، خالی/ناخوانا به‌نظر می‌رسید و
              ارسال بی‌صدا شکست می‌خورد. اکنون هر دو دسترسی روشن است:
                • allowFileAccess   → خواندن فایل‌های کش خودِ اپ (کپی انتخابی‌ها)
                • allowContentAccess → خواندن فایل‌های گالری با content:// */
        webSettings.allowFileAccess = true
        webSettings.allowContentAccess = true
        @Suppress("DEPRECATION")
        webSettings.allowFileAccessFromFileURLs = true
        @Suppress("DEPRECATION")
        webSettings.allowUniversalAccessFromFileURLs = true

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            webSettings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        /* فعال‌سازی موقعیت‌یابی داخل WebView (به‌جز اجازه‌ی کاربر، همین گزینه
           هم باید روشن باشد تا navigator.geolocation کار کند). */
        @Suppress("DEPRECATION")
        webSettings.setGeolocationEnabled(true)

        // دیباگ وب‌ویو فقط در بیلد Debug (در نسخه‌ی انتشار، امکان اتصال DevTools به اپ بسته می‌شود)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // پل ارتباطی جاوااسکریپت و اندروید برای خروج هماهنگ و کنترل سخت‌افزاری
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidApp")

        // اتصال کلاینت‌ها
        webView.webViewClient = WebViewClient()

        /* ── WebChromeClient واقعی ────────────────────────────────────────
           دو قابلیت حیاتی از همین‌جا تأمین می‌شود:
             ۱) باز شدن گالری برای انتخاب عکس/فیلم در فرم ثبت درخواست
             ۲) اجازه‌ی موقعیت مکانی برای بخش «موقعیت» (GPS گوشی) */
        webView.webChromeClient = object : WebChromeClient() {

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                /* درخواست قبلی (اگر نیمه‌کاره مانده) بسته می‌شود */
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                return try {
                    val chooserIntent = buildFileChooserIntent(fileChooserParams)
                    /* اگر گزینه‌ی «دوربین» اضافه شده و اجازه‌اش را نداریم، اول
                       اجازه را می‌گیریم و بعد همان پنجره را باز می‌کنیم؛ وگرنه
                       اندروید با SecurityException جلوی دوربین را می‌گیرد. */
                    if (chooserIntent.hasExtra(Intent.EXTRA_INITIAL_INTENTS) && !hasCameraPermission()) {
                        pendingChooserIntent = chooserIntent
                        requestCameraPermission(false)
                        return true
                    }
                    fileChooserLauncher.launch(chooserIntent)
                    true
                } catch (e: ActivityNotFoundException) {
                    this@MainActivity.filePathCallback = null
                    filePathCallback.onReceiveValue(null)
                    Toast.makeText(
                        this@MainActivity,
                        "برنامه‌ی گالری روی این گوشی پیدا نشد",
                        Toast.LENGTH_LONG
                    ).show()
                    false
                } catch (e: Throwable) {
                    this@MainActivity.filePathCallback = null
                    filePathCallback.onReceiveValue(null)
                    false
                }
            }

            /* ── دوربینِ داخل اپ ───────────────────────────────────────────
               وقتی لایه‌ی وب (assets/js/ep-camera.js) با getUserMedia دوربین
               را باز می‌کند، WebView اجازه را از اینجا می‌پرسد. بدون این بخش،
               دوربین داخل اپ بی‌صدا کار نمی‌کرد و اپ به دوربین خود گوشی
               برمی‌گشت. */
            override fun onPermissionRequest(request: PermissionRequest) {
                val wantsCamera = request.resources.any { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }
                val wantsMic = request.resources.any { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }
                val needed = mutableListOf<String>()
                if (wantsCamera && !hasCameraPermission()) needed.add(Manifest.permission.CAMERA)
                if (wantsMic && ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.RECORD_AUDIO)

                if (needed.isEmpty()) {
                    try {
                        request.grant(request.resources)
                    } catch (e: Throwable) {
                        try { request.deny() } catch (e2: Throwable) { }
                    }
                    return
                }
                try { pendingWebPermissionRequest?.deny() } catch (e: Throwable) { }
                pendingWebPermissionRequest = request
                cameraPermissionLauncher.launch(needed.toTypedArray())
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                if (hasLocationPermission()) {
                    /* اجازه قبلاً گرفته شده است */
                    callback.invoke(origin, true, false)
                    return
                }

                /* اجازه را از کاربر می‌گیریم و پس از پاسخ، به WebView خبر می‌دهیم */
                pendingGeoCallback = callback
                pendingGeoOrigin = origin
                requestLocationPermission()
            }

            override fun onGeolocationPermissionsHidePrompt() {
                super.onGeolocationPermissionsHidePrompt()
                pendingGeoCallback = null
                pendingGeoOrigin = null
            }
        }

        // مدیریت هوشمند دکمه بازگشت (Hardware Back Button / Gesture Back)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // ارسال رویداد بازگشت به لایه مدیریت تاریخچه در جاوااسکریپت
                webView.evaluateJavascript(
                    """
                    (function() {
                        if (typeof window.handleAppBack === 'function') {
                            return window.handleAppBack(false);
                        } else if (typeof window.goBack === 'function') {
                            return window.goBack();
                        }
                        return false;
                    })();
                    """.trimIndent()
                ) { result ->
                    val handled = result == "true"
                    // اگر در جاوااسکریپت هندل نشد (یا وب‌ویو هنوز لود نشده بود)
                    if (!handled) {
                        if (webView.canGoBack()) {
                            webView.goBack()
                        } else {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                            isEnabled = true
                        }
                    }
                }
            }
        })

        /* کانال اعلان‌ها از همان ابتدا ساخته می‌شود تا اعلان اول از دست نرود */
        NotificationBridge.ensureChannel(this)

        // بارگذاری فایل HTML
        webView.loadUrl("file:///android_asset/index.html")
    }

    inner class WebAppInterface(private val activity: AppCompatActivity) {

        @JavascriptInterface
        fun exitApp() {
            /* پیش از بسته شدن، علامت می‌زنیم که دفعه‌ی بعد کد تایید لازم است */
            activity.getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_REQUIRE_LOGIN, true)
                .apply()
            activity.runOnUiThread {
                activity.finish()
            }
        }

        /* ── موقعیت مکانی (GPS) ───────────────────────────────────────────
           لایه‌ی وب (modules/reports.js) پیش از صدا زدن navigator.geolocation
           این دو متد را صدا می‌زند تا اگر اجازه داده نشده، اول از کاربر پرسیده
           شود؛ نتیجه‌ی اجازه با window.eplakLocationPermissionResult به وب
           برمی‌گردد. */

        /** آدرس نوشتاری دقیق از مختصات (نتیجه با window.eplakAddressResult می‌آید) */
        @JavascriptInterface
        fun getAddress(lat: Double, lng: Double) {
            this@MainActivity.requestAddressForWeb(lat, lng)
        }

        /** آیا اجازه‌ی موقعیت مکانی به اپ داده شده است؟ */
        @JavascriptInterface
        fun hasLocationPermission(): Boolean = this@MainActivity.hasLocationPermission()

        /** درخواست اجازه‌ی موقعیت مکانی از کاربر (اندروید ۶ و بالاتر) */
        @JavascriptInterface
        fun requestLocationPermission() {
            activity.runOnUiThread { this@MainActivity.requestLocationPermission() }
        }

        /** باز کردن صفحه‌ی تنظیمات خود اپ (برای روشن کردن دسترسی موقعیت) */
        @JavascriptInterface
        fun openAppSettings() {
            activity.runOnUiThread {
                try {
                    val intent = Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", activity.packageName, null)
                    )
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    activity.startActivity(intent)
                } catch (e: Throwable) {
                    try {
                        activity.startActivity(
                            Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        )
                    } catch (e2: Throwable) {
                    }
                }
            }
        }

        /** آیا سرویس موقعیت‌یاب گوشی (GPS) روشن است؟ */
        @JavascriptInterface
        fun isLocationServiceEnabled(): Boolean {
            return try {
                val manager = activity.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    manager.isLocationEnabled
                } else {
                    manager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) ||
                        manager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)
                }
            } catch (e: Throwable) {
                true
            }
        }

        /** باز کردن یک لینک بیرونی (مثل نمایش موقعیت در نقشه‌ی کامل) */
        @JavascriptInterface
        fun openUrl(url: String) {
            if (url.isBlank()) return
            activity.runOnUiThread {
                try {
                    activity.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                } catch (e: Throwable) {
                    Toast.makeText(activity, "برنامه‌ای برای باز کردن این لینک پیدا نشد", Toast.LENGTH_SHORT).show()
                }
            }
        }

        /* ── نشان (Neshan): مسیریابی از موقعیت کاربر تا مقصد ────────────────────
           لایه‌ی وب (modules/city-map.js) لینک مستندِ نشان را می‌سازد:
               https://nshn.ir/?origin=lat,lng&destination=lat,lng&vehicle=d
           (مبدأ = GPS کاربر؛ بدون GPS فقط https://nshn.ir/?lat=..&lng=.. برای نمایش مقصد)
           و همین‌جا باز می‌شود:
             ۱) اگر برنامه‌ی نشان نصب باشد، مستقیم در همان باز می‌شود؛
             ۲) وگرنه نسخه‌ی وب نشان در مرورگر گوشی.
           خروجی برای لایه‌ی وب:  "app" | "web" | "none"
           فقط لینک‌های خودِ نشان (nshn.ir) پذیرفته می‌شود تا این پل برای باز کردن
           هر آدرس دلخواهی استفاده نشود. */
        @JavascriptInterface
        fun openNeshan(url: String): String {
            val uri = try { Uri.parse(url.trim()) } catch (e: Throwable) { return "none" }
            val scheme = (uri.scheme ?: "").lowercase(Locale.ROOT)
            val host = (uri.host ?: "").lowercase(Locale.ROOT)
            val nshn = host == "nshn.ir" || host.endsWith(".nshn.ir")
            if ((scheme != "https" && scheme != "http") || !nshn) return "none"

            /* ۱) خودِ برنامه‌ی نشان: اول همان لینک https، و اگر برنامه فقط شکل http را
               ثبت کرده باشد همان لینک با http. بدون NEW_TASK: با دکمه‌ی «بازگشت» در نشان،
               کاربر به همین اپ برمی‌گردد. */
            val candidates = ArrayList<Uri>()
            candidates.add(uri)
            if (scheme == "https") candidates.add(uri.buildUpon().scheme("http").build())
            for (candidate in candidates) {
                try {
                    val intent = Intent(Intent.ACTION_VIEW, candidate).apply {
                        setPackage(NESHAN_PACKAGE)
                    }
                    activity.startActivity(intent)
                    return "app"
                } catch (e: ActivityNotFoundException) {
                    /* برنامه این شکل لینک را نمی‌شناسد یا نصب نیست → شکل بعدی / نسخه‌ی وب */
                } catch (e: Throwable) {
                    /* ادامه */
                }
            }

            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
                return "web"
            } catch (e: Throwable) {
                /* مرورگری هم پیدا نشد */
            }
            return "none"
        }

        /** آیا برنامه‌ی «نشان» روی این گوشی نصب است؟ */
        @Suppress("DEPRECATION")
        @JavascriptInterface
        fun isNeshanInstalled(): Boolean {
            return try {
                activity.packageManager.getPackageInfo(NESHAN_PACKAGE, 0)
                true
            } catch (e: Throwable) {
                false
            }
        }

        /* ── نگه‌داشتن حساب در اپ؟ ─────────────────────────────────────────
           اگر اپ تازه بالا آمده باشد یا کاربر با دوبار دکمه‌ی بازگشت خارج شده
           باشد، این متد true برمی‌گرداند؛ لایه‌ی وب در این حالت اطلاعات ورود
           را پاک می‌کند و صفحه‌ی «ورود + کد تایید» را نشان می‌دهد. */
        @JavascriptInterface
        fun shouldRequireLogin(): Boolean {
            return activity.getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_REQUIRE_LOGIN, false)
        }

        /** کاربر همین حالا کد تایید را درست وارد کرده است */
        @JavascriptInterface
        fun markLoginDone() {
            activity.getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_REQUIRE_LOGIN, false)
                .apply()
        }

        /** قبل از خروج کامل از اپ صدا زده می‌شود (دوبار دکمه‌ی بازگشت) */
        @JavascriptInterface
        fun prepareExit() {
            activity.getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_REQUIRE_LOGIN, true)
                .apply()
        }

        /* ── اعلان سیستمی روی گوشی ────────────────────────────────────────
           اندروید در WebView نه Push API دارد و نه Notification API؛ پس اعلان
           از همین پل نمایش داده می‌شود. لایه‌ی وب (modules/live.js) وقتی اعلان
           تازه‌ای از سرور می‌گیرد این متد را صدا می‌زند. */

        /** ساخت/اطمینان از وجود کانال اعلان‌ها */
        @JavascriptInterface
        fun ensureNotificationChannel() {
            NotificationBridge.ensureChannel(activity)
        }

        /** آیا اعلان روی این گوشی مجاز است؟ */
        @JavascriptInterface
        fun notificationsEnabled(): Boolean = NotificationBridge.isEnabled(activity)

        /** درخواست اجازه‌ی اعلان از کاربر (اندروید ۱۳+) */
        @JavascriptInterface
        fun requestNotificationPermission() {
            activity.runOnUiThread {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    !NotificationBridge.isEnabled(activity)
                ) {
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        }

        /** نمایش اعلان در نوار اعلان‌های گوشی */
        @JavascriptInterface
        fun showNotification(title: String, body: String, id: String) {
            activity.runOnUiThread {
                NotificationBridge.show(activity, title, body, id)
            }
        }

        /* ── توکن فایربیس (برای اعلان در حالت بسته بودن کامل اپ) ─────────────
           لایه‌ی وب این توکن را می‌گیرد و همراه شماره‌ی کاربر به سرور می‌فرستد
           (api/push.php?action=register_fcm). اگر پروژه‌ی فایربیس راه‌اندازی
           نشده باشد، رشته‌ی خالی برمی‌گردد و هیچ خطایی رخ نمی‌دهد. */

        /** توکن فایربیس این دستگاه (اگر آماده باشد) */
        @JavascriptInterface
        fun getFcmToken(): String {
            val prefs = activity.getSharedPreferences(EplakMessagingService.PREFS, Context.MODE_PRIVATE)

            /* توکن قبلی که خود فایربیس ساخته و در دستگاه ذخیره شده است */
            val cached = prefs.getString(EplakMessagingService.KEY_TOKEN, "") ?: ""
            if (cached.isNotEmpty()) return cached

            /* درخواست توکن تازه؛ نتیجه غیرهمگام است و دفعه‌ی بعد خوانده می‌شود.
               اگر پروژه‌ی فایربیس راه‌اندازی نشده باشد، رشته‌ی خالی برمی‌گردد. */
            return try {
                com.google.firebase.messaging.FirebaseMessaging.getInstance().token
                    .addOnSuccessListener { fresh ->
                        prefs.edit().putString(EplakMessagingService.KEY_TOKEN, fresh).apply()
                        notifyFcmTokenReady()
                    }
                ""
            } catch (e: Throwable) {
                ""
            }
        }

        /** آیا اعلان فایربیس روی این دستگاه آماده است؟ */
        @JavascriptInterface
        fun isFcmReady(): Boolean {
            val prefs = activity.getSharedPreferences(EplakMessagingService.PREFS, Context.MODE_PRIVATE)
            if (!(prefs.getString(EplakMessagingService.KEY_TOKEN, "") ?: "").isEmpty()) return true
            return try {
                com.google.firebase.FirebaseApp.getInstance()
                true
            } catch (e: Throwable) {
                false
            }
        }

        /** درخواست تازه‌سازی توکن (اگر کاربر بعداً اجازه‌ی اعلان داد) */
        @JavascriptInterface
        fun refreshFcmToken() {
            try {
                com.google.firebase.messaging.FirebaseMessaging.getInstance().token
                    .addOnSuccessListener { fresh ->
                        activity.getSharedPreferences(EplakMessagingService.PREFS, Context.MODE_PRIVATE)
                            .edit().putString(EplakMessagingService.KEY_TOKEN, fresh).apply()
                        notifyFcmTokenReady()
                    }
            } catch (e: Throwable) {
                /* فایربیس فعال نیست */
            }
        }

        /* ── عیب‌یابی اعلان (برای پیام وضعیت و دکمه‌ی «تست اعلان» در اپ) ───── */

        /** وضعیت اعلان روی همین گوشی، به‌صورت JSON: مجوز؟ توکن؟ فایربیس؟ نسخه‌ی اندروید */
        @JavascriptInterface
        fun getPushDiagnostics(): String {
            val prefs = activity.getSharedPreferences(EplakMessagingService.PREFS, Context.MODE_PRIVATE)
            val info = JSONObject()
            info.put("enabled", NotificationBridge.isEnabled(activity))
            info.put("token", !(prefs.getString(EplakMessagingService.KEY_TOKEN, "") ?: "").isEmpty())
            info.put("sdk", Build.VERSION.SDK_INT)
            info.put(
                "firebase",
                try {
                    com.google.firebase.FirebaseApp.getInstance()
                    true
                } catch (e: Throwable) {
                    false
                }
            )
            return info.toString()
        }

        /** باز کردن «تنظیمات اعلان» همین برنامه (وقتی اندروید دیگر پنجره‌ی اجازه را نشان نمی‌دهد) */
        @JavascriptInterface
        fun openNotificationSettings() {
            activity.runOnUiThread {
                try {
                    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    intent.putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
                    activity.startActivity(intent)
                } catch (e: Throwable) {
                    try {
                        val fallback = Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + activity.packageName)
                        )
                        activity.startActivity(fallback)
                    } catch (ignored: Throwable) {
                        /* گوشی صفحه‌ی تنظیمات را ندارد */
                    }
                }
            }
        }
    }
}
