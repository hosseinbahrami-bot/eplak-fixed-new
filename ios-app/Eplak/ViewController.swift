import UIKit
import WebKit
import CoreLocation

/// ای‌پلاک — پوسته‌ی iOS.
///
/// یک WKWebView که همان فایل‌های وبِ بسته‌بندی‌شده (پوشه‌ی «Web» داخل برنامه) را از روی file://
/// باز می‌کند؛ دقیقاً مثل اپ اندروید که فایل‌ها را از assets می‌خواند. در این حالت خودِ وب‌اپ
/// (core/storage.js) آدرس API را روی https://eplak.ir/eplak-fixed/api می‌گذارد، پس همه‌ی کارها
/// (ورود با کد تایید، ثبت گزارش با عکس/ویدیو، اعلان‌های داخل برنامه، نقشه‌ی اماکن شهری) از همان
/// سرور انجام می‌شود.
///
/// کارهایی که فقط پوسته‌ی نیتیو می‌تواند انجام دهد:
///  • باز کردن برنامه‌ی «نشان» (neshan://)، تلفن، پیامک و لینک‌های وب بیرون از اپ
///  • اجازه‌ی دوربین/میکروفون برای وب (iOS 15+)، و پنجره‌های alert/confirm/prompt
///  • موقعیت مکانی (GPS) از CoreLocation — جایگزین navigator.geolocation (پایین، «GeoBridge»)
///  • لرزش لمسی (haptic)، اشتراک‌گذاری و دکمه‌ی بازگشت با لبه‌ی صفحه
///
/// آزمون دودی (فقط CI): اگر برنامه با «-eplakSelfTest» اجرا شود، چند مرحله را روی صفحه‌ی واقعی
/// اجرا و نتیجه را در Documents/selftest-N.json می‌نویسد (ios-app/ci/simulator-smoke.sh).
/// در اجرای عادی هیچ‌کدام از این کدها فعال نمی‌شود.
class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIGestureRecognizerDelegate {

    private var webView: WKWebView!
    private var activityIndicator: UIActivityIndicatorView!

    private let selfTestMode = ProcessInfo.processInfo.arguments.contains("-eplakSelfTest")
    private var selfTestStarted = false
    private var externalOpens: [String] = []

    /// موقعیت مکانی برای وب‌اپ (جایگزین navigator.geolocation)؛ پایین‌تر توضیح داده شده
    private lazy var geo: GeoBridge = GeoBridge(run: { [weak self] js in
        DispatchQueue.main.async { self?.webView.evaluateJavaScript(js, completionHandler: nil) }
    })

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        setupWebView()
        setupBackGesture()
        loadWebContent()
    }

    private func setupUI() {
        view.backgroundColor = UIColor(red: 13/255.0, green: 21/255.0, blue: 39/255.0, alpha: 1.0) // #0d1527
    }

    private func setupWebView() {
        let configuration = WKWebViewConfiguration()
        let contentController = WKUserContentController()

        // پل وب ← نیتیو: window.webkit.messageHandlers.iOSApp.postMessage({ action: ... })
        contentController.add(self, name: "iOSApp")
        // به صفحه خبر می‌دهد که داخل پوسته‌ی نیتیو است
        contentController.addUserScript(WKUserScript(source: "window.EPLAK_IOS_APP = true;",
                                                     injectionTime: .atDocumentStart,
                                                     forMainFrameOnly: true))
        // navigator.geolocation را به CoreLocation وصل می‌کند (جلوگیری از پنجره‌ی «مسیر فایل … می‌خواهد موقعیت شما را بداند»)
        contentController.addUserScript(WKUserScript(source: ViewController.geolocationShim,
                                                     injectionTime: .atDocumentStart,
                                                     forMainFrameOnly: true))
        configuration.userContentController = contentController

        configuration.allowsInlineMediaPlayback = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.backgroundColor = .clear
        webView.isOpaque = false
        webView.allowsLinkPreview = false
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        // نشانگر بارگذاری
        activityIndicator = UIActivityIndicatorView(style: .large)
        activityIndicator.color = .white
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.hidesWhenStopped = true
        view.addSubview(activityIndicator)

        NSLayoutConstraint.activate([
            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activityIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])

        activityIndicator.startAnimating()
    }

    private func setupBackGesture() {
        // بازگشت با کشیدن از لبه‌ی صفحه (راست برای چیدمان راست‌به‌چپ، و چپ)
        let edgePan = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleEdgePan(_:)))
        edgePan.edges = .right
        edgePan.delegate = self
        view.addGestureRecognizer(edgePan)

        let leftEdgePan = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleEdgePan(_:)))
        leftEdgePan.edges = .left
        leftEdgePan.delegate = self
        view.addGestureRecognizer(leftEdgePan)
    }

    @objc private func handleEdgePan(_ recognizer: UIScreenEdgePanGestureRecognizer) {
        if recognizer.state == .ended {
            triggerJavaScriptBack()
        }
    }

    private func triggerJavaScriptBack() {
        let js = """
        (function() {
            if (typeof window.handleAppBack === 'function') {
                return window.handleAppBack(false);
            } else if (typeof window.goBack === 'function') {
                return window.goBack();
            }
            return false;
        })();
        """
        webView.evaluateJavaScript(js) { [weak self] (result, error) in
            guard let self = self else { return }
            let handled = (result as? Bool) ?? false
            if !handled && self.webView.canGoBack {
                self.webView.goBack()
            }
        }
    }

    private func loadWebContent() {
        // فایل‌های وب داخل برنامه (ios-app/sync-web.sh آن‌ها را از ریشه‌ی پروژه کپی می‌کند)
        if let webDirPath = Bundle.main.path(forResource: "Web", ofType: nil),
           let indexUrl = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") {
            let webDirUrl = URL(fileURLWithPath: webDirPath)
            webView.loadFileURL(indexUrl, allowingReadAccessTo: webDirUrl)
            return
        }

        activityIndicator.stopAnimating()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            let alert = UIAlertController(
                title: "ای‌پلاک",
                message: "فایل‌های برنامه (پوشه‌ی Web) در بسته پیدا نشد. پیش از ساخت پروژه، دستور «bash ios-app/sync-web.sh» را اجرا کنید.",
                preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "متوجه شدم", style: .default))
            self?.present(alert, animated: true)
        }
    }

    // MARK: - بیرون از اپ باز کردن (نشان، تلفن، پیامک، وب)
    private func openExternally(_ url: URL) {
        externalOpens.append(url.absoluteString)
        // در آزمون دودی چیزی واقعاً باز نمی‌شود (وگرنه اپ به پس‌زمینه می‌رود)؛ فقط ثبت می‌شود
        if selfTestMode { return }
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }

    // MARK: - WKScriptMessageHandler
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "iOSApp", let body = message.body as? [String: Any] else { return }

        let action = body["action"] as? String

        switch action {
        case "haptic":
            let style = body["style"] as? String ?? "medium"
            triggerHaptic(style: style)
        case "openUrl":
            if let text = body["url"] as? String, let url = URL(string: text) {
                openExternally(url)
            }
        case "geoGet":
            if let id = body["id"] as? Int {
                geo.request(id: id, high: (body["high"] as? Bool) ?? false)
            }
        case "geoStatus":
            if let id = body["id"] as? Int {
                geo.status(id: id)
            }
        case "exitApp":
            // طبق رهنمود اپل برنامه نباید خودش را ببندد؛ در صورت درخواست فقط به پس‌زمینه می‌رود
            UIControl().sendAction(#selector(NSXPCConnection.suspend), to: UIApplication.shared, for: nil)
        case "share":
            if let text = body["text"] as? String {
                let activityVC = UIActivityViewController(activityItems: [text], applicationActivities: nil)
                // آیپد: بدون لنگر، نمایش پنجره‌ی اشتراک‌گذاری خطا می‌دهد
                activityVC.popoverPresentationController?.sourceView = view
                activityVC.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
                present(activityVC, animated: true)
            }
        default:
            break
        }
    }

    private func triggerHaptic(style: String) {
        switch style {
        case "light":
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "heavy":
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "success":
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning":
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "error":
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        default:
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }

    // MARK: - WKNavigationDelegate
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        activityIndicator.stopAnimating()
        startSelfTestIfNeeded()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
    }

    /// iOS هنگام کمبود حافظه فرایند وب را در پس‌زمینه می‌کُشد (مثلاً وقتی برای مسیریابی به برنامه‌ی نشان می‌روید)؛
    /// بدون این تابع، برگشتن به اپ صفحه‌ی سفید نشان می‌دهد. با بارگذاری دوباره (ورود کاربر در حافظه می‌ماند) درست می‌شود.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        activityIndicator.startAnimating()
        loadWebContent()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let scheme = url.scheme?.lowercased() ?? ""

        // صفحه‌ی خودِ اپ و منابع داخلی آن
        if scheme == "file" || scheme == "about" || scheme == "blob" || scheme == "data" || scheme == "javascript" {
            decisionHandler(.allow)
            return
        }
        // قاب‌های داخل صفحه (iframe) داخل همان صفحه می‌مانند
        if (scheme == "http" || scheme == "https") && navigationAction.targetFrame?.isMainFrame == false {
            decisionHandler(.allow)
            return
        }
        // هر چیز دیگر — برنامه‌ی نشان (neshan://)، تلفن، پیامک، ایمیل و لینک‌های وب — بیرون از اپ باز
        // می‌شود. خودِ اپ همیشه از file:// بالا می‌آید و هیچ‌وقت صفحه‌ی وب بیرونی را داخل خودش نشان نمی‌دهد.
        openExternally(url)
        decisionHandler(.cancel)
    }

    // MARK: - WKUIDelegate
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // window.open(...) و target=_blank: پنجره‌ی تازه نمی‌سازیم؛ آدرس بیرون از اپ باز می‌شود
        if let url = navigationAction.request.url, url.scheme?.lowercased() != "about" {
            openExternally(url)
        }
        return nil
    }

    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        // دوربین/میکروفون برای ثبت گزارش؛ پنجره‌ی اجازه‌ی خودِ iOS (Info.plist) پیش از این می‌آید
        decisionHandler(.grant)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "ای‌پلاک", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "متوجه شدم", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "ای‌پلاک", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "تایید", style: .default) { _ in completionHandler(true) })
        alert.addAction(UIAlertAction(title: "انصراف", style: .cancel) { _ in completionHandler(false) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: "ای‌پلاک", message: prompt, preferredStyle: .alert)
        alert.addTextField { field in field.text = defaultText }
        alert.addAction(UIAlertAction(title: "تایید", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        alert.addAction(UIAlertAction(title: "انصراف", style: .cancel) { _ in completionHandler(nil) })
        present(alert, animated: true)
    }

    // MARK: - آزمون دودی (فقط با «-eplakSelfTest»؛ ios-app/ci/simulator-smoke.sh)

    private func startSelfTestIfNeeded() {
        guard selfTestMode, !selfTestStarted else { return }
        selfTestStarted = true
        // اجازه بده وب‌اپ کامل بالا بیاید (راه‌اندازی، بررسی اتصال و …). این ویو‌کنترلر تا پایان
        // اجرای اپ زنده است و بستارها یک‌بارمصرف‌اند؛ پس نیازی به weak نیست.
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            self.runSelfTestStage(1, script: ViewController.selfTestStage1) {
                DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                    self.runSelfTestStage(2, script: ViewController.selfTestStage2) {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                            self.runSelfTestStage(3, script: ViewController.selfTestStage3) {
                                self.writeSelfTestFile("selftest-done.json", "{\"done\":true}")
                            }
                        }
                    }
                }
            }
        }
    }

    private func writeSelfTestFile(_ name: String, _ text: String) {
        guard let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        try? text.write(to: dir.appendingPathComponent(name), atomically: true, encoding: .utf8)
    }

    private func runSelfTestStage(_ stage: Int, script: String, next: @escaping () -> Void) {
        webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: WKContentWorld.page) { result in
            var text: String
            switch result {
            case .success(let value):
                text = (value as? String) ?? "{\"error\":\"unexpected result type\"}"
            case .failure(let error):
                let message = String(describing: error)
                    .replacingOccurrences(of: "\"", with: "'")
                    .replacingOccurrences(of: "\n", with: " ")
                text = "{\"error\":\"" + message + "\"}"
            }
            // فهرست چیزهایی که پوسته‌ی نیتیو «بیرون از اپ» باز کرده است را هم به نتیجه اضافه کن
            if var object = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] {
                object["externalOpens"] = self.externalOpens
                if let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]),
                   let merged = String(data: data, encoding: .utf8) {
                    text = merged
                }
            }
            self.writeSelfTestFile("selftest-\(stage).json", text)
            next()
        }
    }

    /// جایگزین navigator.geolocation و navigator.permissions.query({name:'geolocation'}) که به پل نیتیو
    /// (GeoBridge) وصل است. چرا؟ وقتی صفحه از file:// باز است، WebKit برای هر بار موقعیت‌خواهی پنجره‌ای با
    /// «مسیر کامل index.html داخل برنامه» نشان می‌دهد (در آزمون شبیه‌ساز دیده شد) و تا پاسخ کاربر هیچ نتیجه‌ای
    /// نمی‌دهد. با این پل فقط پنجره‌ی اجازه‌ی خودِ iOS (متن فارسی Info.plist) و فقط یک‌بار می‌آید.
    private static let geolocationShim = #"""
    (function () {
      'use strict';
      if (window.__eplakGeoShim) { return; }
      var h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iOSApp;
      if (!h) { return; }
      window.__eplakGeoShim = true;

      var seq = 0, pending = {}, statusWaiters = {}, watches = {}, last = null;

      function GeoError(code, message) { this.code = code; this.message = message || ''; }
      GeoError.prototype.PERMISSION_DENIED = 1;
      GeoError.prototype.POSITION_UNAVAILABLE = 2;
      GeoError.prototype.TIMEOUT = 3;

      function toPosition(r) {
        return {
          coords: { latitude: r.lat, longitude: r.lng, accuracy: r.acc || 0, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
          timestamp: r.ts || Date.now()
        };
      }

      function finish(id, fn) {
        var p = pending[id];
        if (!p) { return; }
        delete pending[id];
        if (p.timer) { clearTimeout(p.timer); }
        fn(p);
      }

      function ask(opts, ok, fail) {
        var id = ++seq;
        var t = (opts && isFinite(opts.timeout) && opts.timeout >= 0) ? Number(opts.timeout) : 60000;
        pending[id] = { ok: ok, fail: fail, timeout: t, timer: null };
        try {
          h.postMessage({ action: 'geoGet', id: id, high: !!(opts && opts.enableHighAccuracy) });
        } catch (e) {
          finish(id, function (p) { if (p.fail) { p.fail(new GeoError(2, 'Position unavailable')); } });
        }
      }

      /* مهلت از لحظه‌ای شروع می‌شود که iOS واقعاً دنبال موقعیت رفته (نه وقتی پنجره‌ی اجازه باز است) */
      window.__eplakGeoStarted = function (id) {
        var p = pending[id];
        if (!p || p.timer) { return; }
        p.timer = setTimeout(function () {
          finish(id, function (q) { if (q.fail) { q.fail(new GeoError(3, 'Timeout expired')); } });
        }, p.timeout);
      };

      window.__eplakGeoResult = function (id, r) {
        finish(id, function (p) {
          if (r && r.ok) { last = toPosition(r); if (p.ok) { p.ok(last); } }
          else if (p.fail) { p.fail(new GeoError((r && r.code) || 2, (r && r.message) || 'Position unavailable')); }
        });
      };

      window.__eplakGeoStatus = function (id, state) {
        var w = statusWaiters[id];
        if (w) { delete statusWaiters[id]; w(state); }
      };

      var geo = {
        getCurrentPosition: function (ok, fail, opts) {
          var maxAge = (opts && isFinite(opts.maximumAge)) ? Number(opts.maximumAge) : 0;
          if (last && maxAge > 0 && (Date.now() - last.timestamp) <= maxAge) {
            var cached = last;
            setTimeout(function () { if (ok) { ok(cached); } }, 0);
            return;
          }
          ask(opts, ok, fail);
        },
        watchPosition: function (ok, fail, opts) {
          var wid = ++seq, active = true;
          watches[wid] = function () { active = false; };
          (function tick() {
            if (!active) { return; }
            ask(opts, function (pos) {
              if (!active) { return; }
              if (ok) { ok(pos); }
              setTimeout(tick, 3000);
            }, function (err) {
              if (!active) { return; }
              if (fail) { fail(err); }
              if (err && err.code !== 1) { setTimeout(tick, 5000); }
            });
          })();
          return wid;
        },
        clearWatch: function (wid) {
          var stop = watches[wid];
          if (stop) { stop(); delete watches[wid]; }
        }
      };

      var realPerms = navigator.permissions;
      var perms = {
        query: function (desc) {
          if (desc && desc.name === 'geolocation') {
            return new Promise(function (resolve) {
              var id = ++seq;
              statusWaiters[id] = function (state) { resolve({ state: state, onchange: null }); };
              try { h.postMessage({ action: 'geoStatus', id: id }); }
              catch (e) { delete statusWaiters[id]; resolve({ state: 'prompt', onchange: null }); }
            });
          }
          return (realPerms && typeof realPerms.query === 'function') ? realPerms.query(desc) : Promise.reject(new TypeError('Unsupported permission'));
        }
      };

      try { Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true }); } catch (e) { /* WebKit خودش جواب می‌دهد */ }
      try { Object.defineProperty(navigator, 'permissions', { value: perms, configurable: true }); } catch (e) { /* WebKit خودش جواب می‌دهد */ }
    })();
    """#

    /// مرحله ۱: صفحه از file:// بالا آمده؟ ماژول‌ها هستند؟ سرور (api/ping.php) از داخل WKWebView جواب می‌دهد؟
    private static let selfTestStage1 = #"""
    const out = { stage: 1 };
    out.protocol = location.protocol;
    out.ua = navigator.userAgent;
    out.title = document.title;
    out.apiBase = window.EPLAK_API_BASE_URL || null;
    out.nativeFlag = window.EPLAK_IOS_APP === true;
    out.fns = {
      showScreen: typeof window.showScreen,
      cityMap: typeof (window.EplakCityMap && window.EplakCityMap.route),
      places: typeof (window.EplakPlaces && window.EplakPlaces.neshanLinks)
    };
    out.placesCount = (window.EplakPlaces && typeof window.EplakPlaces.places === 'function') ? window.EplakPlaces.places().length : null;
    out.screen = (document.querySelector('.screen.active') || {}).id || null;
    out.offlineGate = document.documentElement.classList.contains('eplak-offline');
    out.online = navigator.onLine;
    out.geoShim = window.__eplakGeoShim === true;
    try { out.geoPermission = (await navigator.permissions.query({ name: 'geolocation' })).state; } catch (e) { out.geoPermission = 'error: ' + String(e); }
    try {
      const r = await fetch((out.apiBase || '') + '/ping.php?_=' + Date.now(), { cache: 'no-store' });
      const t = await r.text();
      out.ping = { status: r.status, body: t.slice(0, 160) };
    } catch (e) { out.ping = { error: String(e) }; }
    try {
      localStorage.setItem('eplak_selftest', '1');
      out.localStorage = localStorage.getItem('eplak_selftest') === '1';
      localStorage.removeItem('eplak_selftest');
    } catch (e) { out.localStorage = false; }
    return JSON.stringify(out);
    """#

    /// مرحله ۲: «نقشه و اماکن شهری» را باز می‌کند و می‌شمارد چه چیزی کشیده شد.
    private static let selfTestStage2 = #"""
    const out = { stage: 2 };
    window.showScreen('screen-map');
    await new Promise(function (r) { setTimeout(r, 7000); });
    const q = function (s) { return document.querySelectorAll(s); };
    out.screen = (document.querySelector('.screen.active') || {}).id || null;
    out.chips = q('#screen-map .cm-chip').length;
    out.rows = q('#screen-map .cm-row').length;
    const imgs = Array.prototype.slice.call(q('#cityMapCanvas .ep-map-tiles img'));
    out.tiles = imgs.length;
    out.tilesLoaded = imgs.filter(function (i) { return i.complete && i.naturalWidth > 0; }).length;
    out.markers = q('#cityMapCanvas .ep-map-markers > *').length;
    const meta = document.getElementById('cityMapMeta');
    out.meta = meta ? meta.textContent.trim().slice(0, 80) : null;
    return JSON.stringify(out);
    """#

    /// مرحله ۳: «موقعیت من» (GPS شبیه‌ساز) و «مسیریابی با نشان» روی بیمارستان مفتح؛
    /// لینک neshan:// باید به پوسته‌ی نیتیو برسد (externalOpens).
    private static let selfTestStage3 = #"""
    const out = { stage: 3 };
    const CM = window.EplakCityMap;
    out.env = CM._test.detectEnv();
    let pos = null;
    try {
      pos = await Promise.race([CM.locate(), new Promise(function (r) { setTimeout(function () { r('timeout'); }, 20000); })]);
    } catch (e) { out.locateError = String(e); }
    out.loc = (pos && pos !== 'timeout') ? { lat: pos.lat, lng: pos.lng, acc: pos.acc } : (pos === 'timeout' ? 'timeout' : null);
    let status = null;
    try { status = await CM.route('mofatteh-hospital'); } catch (e) { out.routeError = String(e); }
    out.routeStatus = status;
    await new Promise(function (r) { setTimeout(r, 2500); });
    return JSON.stringify(out);
    """#
}

/// موقعیت مکانی برای وب‌اپ: درخواست‌های شیمِ جاوااسکریپت (geoGet / geoStatus) را با CoreLocation جواب می‌دهد.
/// پنجره‌ی اجازه‌ی iOS فقط یک‌بار می‌آید و متنش از Info.plist (NSLocationWhenInUseUsageDescription) است.
final class GeoBridge: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var waiting: [Int] = []
    private let run: (String) -> Void

    init(run: @escaping (String) -> Void) {
        self.run = run
        super.init()
        manager.delegate = self
    }

    /// وضعیت اجازه به شکل Permissions API: granted / denied / prompt
    func status(id: Int) {
        let state: String
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            state = "granted"
        case .denied, .restricted:
            state = "denied"
        default:
            state = "prompt"
        }
        run("window.__eplakGeoStatus && window.__eplakGeoStatus(\(id), '\(state)');")
    }

    func request(id: Int, high: Bool) {
        manager.desiredAccuracy = high ? kCLLocationAccuracyBest : kCLLocationAccuracyHundredMeters
        waiting.append(id)
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            begin()
        case .denied, .restricted:
            fail(code: 1, message: "Location permission denied")
        default:
            // اولین بار: پنجره‌ی اجازه‌ی iOS؛ مهلتِ صفحه تا پاسخ کاربر شروع نمی‌شود
            manager.requestWhenInUseAuthorization()
        }
    }

    private func begin() {
        for id in waiting {
            run("window.__eplakGeoStarted && window.__eplakGeoStarted(\(id));")
        }
        manager.requestLocation()
    }

    private func fail(code: Int, message: String) {
        let ids = waiting
        waiting = []
        for id in ids {
            send(id, ["ok": false, "code": code, "message": message])
        }
    }

    private func send(_ id: Int, _ payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        run("window.__eplakGeoResult && window.__eplakGeoResult(\(id), \(json));")
    }

    // MARK: - CLLocationManagerDelegate
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard !waiting.isEmpty else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            begin()
        case .denied, .restricted:
            fail(code: 1, message: "Location permission denied")
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let ids = waiting
        waiting = []
        for id in ids {
            send(id, [
                "ok": true,
                "lat": location.coordinate.latitude,
                "lng": location.coordinate.longitude,
                "acc": max(location.horizontalAccuracy, 0),
                "ts": Int(location.timestamp.timeIntervalSince1970 * 1000)
            ])
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let denied = (error as? CLError)?.code == .denied
        fail(code: denied ? 1 : 2, message: error.localizedDescription)
    }
}
