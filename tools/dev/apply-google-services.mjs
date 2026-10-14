#!/usr/bin/env node
/* tools/dev/apply-google-services.mjs — جایگزینی امن google-services.json اپ اندروید

   اجرا:
     node tools/dev/apply-google-services.mjs <مسیر google-services.json تازه> [--dry-run] [--adopt-package]

   --adopt-package: اگر اپ اندروید در فایربیس با نام بسته‌ی دیگری ثبت شده (مثلاً com.eplak به‌جای
     com.example.eplakfixed)، همان نام بسته را برای اپ می‌پذیرد: applicationId در build.gradle،
     ثابت EPLAK_APP_PACKAGE سرور و مستندات با آن یکی می‌شوند. (namespace/بسته‌ی کدِ کاتلین دست
     نمی‌خورد — اندروید اجازه می‌دهد applicationId با namespace فرق کند.)
     ⚠️ تغییر applicationId یعنی اندروید آن را «اپ دیگری» می‌داند: نسخه‌ی قبلی باید حذف شود
     (وگرنه دو آیکن می‌ماند) و توکن‌های FCM قبلی بی‌اعتبار می‌شوند.

   چه می‌کند؟
     ۱) فایل را می‌خواند و می‌سنجد: project_info (project_id، project_number) و یک client با
        package_name برابر applicationId اپ (android-app/app/build.gradle). اگر client هم‌خوان
        نباشد، پلاگین google-services ساخت APK را با «No matching client found» متوقف می‌کرد.
     ۲) آن را روی android-app/app/google-services.json می‌نویسد.
     ۳) ثابت‌های پروژه‌ی APK در shared/fcm.php را (EPLAK_APP_FCM_PROJECT_ID / _SENDER_ID) با همان
        مقدارها یکی می‌کند — سرور با همین‌ها «کلید سرویس از پروژه‌ی دیگر» (SenderId mismatch) را
        تشخیص می‌دهد.
     ۴) شناسه‌ی پروژه‌ی قبلی را در مستندات (docs/*.md) با شناسه‌ی تازه جایگزین می‌کند و هر جای
        دیگری که هنوز شناسه‌ی قبلی را دارد گزارش می‌کند.
   پس از اجرا: bash tools/dev/run-regression.sh push  (آزمونِ «ثابت‌ها = google-services.json»)
   و commit؛ CI با APK تازه (پروژه‌ی تازه) می‌سازد. کلید سرویس پنل هم باید از همین پروژه باشد.
*/
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const adopt = args.includes('--adopt-package');
const src = args.find((a) => !a.startsWith('--'));
if (!src) {
  console.error('استفاده: node tools/dev/apply-google-services.mjs <google-services.json> [--dry-run]');
  process.exit(2);
}
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DEST = path.join(ROOT, 'android-app/app/google-services.json');
const FCM = path.join(ROOT, 'shared/fcm.php');
const GRADLE = path.join(ROOT, 'android-app/app/build.gradle');

const die = (msg) => { console.error('❌ ' + msg); process.exit(1); };

const raw = fs.readFileSync(path.resolve(src), 'utf8').replace(/^\uFEFF/, '');
let gs;
try { gs = JSON.parse(raw); } catch (e) { die('فایل JSON معتبر نیست: ' + e.message); }
if (gs.type === 'service_account' || gs.private_key) die('این فایل «کلید سرویس» است، نه google-services.json. کلید سرویس فقط در پنل چسبانده می‌شود و هرگز داخل مخزن نمی‌رود.');
const project = String(gs.project_info?.project_id || '');
const sender = String(gs.project_info?.project_number || '');
if (!project || !sender) die('project_info.project_id / project_number در فایل نیست.');

const gradleText = fs.readFileSync(GRADLE, 'utf8');
const oldAppId = (gradleText.match(/applicationId\s+'([^']+)'/) || [])[1] || 'com.example.eplakfixed';
let appId = oldAppId;
let client = (gs.client || []).find((c) => c?.client_info?.android_client_info?.package_name === appId);
if (!client) {
  const found = (gs.client || []).map((c) => c?.client_info?.android_client_info?.package_name).filter(Boolean);
  if (adopt && found.length === 1 && /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(found[0])) {
    appId = found[0];
    client = gs.client.find((c) => c?.client_info?.android_client_info?.package_name === appId);
    console.log(`ℹ️ نام بسته‌ی اپ از «${oldAppId}» به «${appId}» (ثبت‌شده در فایربیس) تغییر می‌کند (--adopt-package).`);
  } else {
    die(`هیچ client با نام بسته‌ی «${appId}» در فایل نیست (بسته‌های موجود: ${found.join(', ') || '—'}). یا در Firebase Console اپ اندروید را با همین نام بسته ثبت کنید و فایل را دوباره دانلود کنید، یا با --adopt-package همان نام بسته‌ی فایربیس را برای اپ بپذیرید.`);
  }
}
const mobilesdkAppId = String(client.client_info?.mobilesdk_app_id || '');
const apiKey = (client.api_key || []).find((k) => k?.current_key)?.current_key || '';
if (!mobilesdkAppId.startsWith(`1:${sender}:android:`)) die(`mobilesdk_app_id (${mobilesdkAppId}) با project_number (${sender}) هم‌خوان نیست؛ فایل خراب است.`);
if (!apiKey) die('api_key.current_key در client نیست؛ فایل ناقص است.');

/* پروژه‌ی قبلی (برای جایگزینی در مستندات) */
let oldProject = '', oldSender = '';
try {
  const cur = JSON.parse(fs.readFileSync(DEST, 'utf8'));
  oldProject = String(cur.project_info?.project_id || '');
  oldSender = String(cur.project_info?.project_number || '');
} catch (e) { /* فایل قبلی نبود */ }

console.log(`پروژه‌ی تازه: ${project} · فرستنده ${sender} · app id ${mobilesdkAppId} · بسته ${appId}`);
if (oldProject) console.log(`پروژه‌ی قبلی: ${oldProject} · فرستنده ${oldSender}`);
if (dry) console.log('(حالت --dry-run: چیزی نوشته نمی‌شود)');

/* ۲) کپی فایل */
if (!dry) fs.writeFileSync(DEST, raw.endsWith('\n') ? raw : raw + '\n');
console.log('✅ android-app/app/google-services.json' + (dry ? ' (نوشته می‌شد)' : ' نوشته شد'));

/* ۳) ثابت‌های shared/fcm.php (+ applicationId در build.gradle اگر نام بسته عوض شد) */
let fcm = fs.readFileSync(FCM, 'utf8');
const before = fcm;
fcm = fcm.replace(/define\('EPLAK_APP_FCM_PROJECT_ID', '[^']*'\)/, `define('EPLAK_APP_FCM_PROJECT_ID', '${project}')`);
fcm = fcm.replace(/define\('EPLAK_APP_FCM_SENDER_ID', '[^']*'\)/, `define('EPLAK_APP_FCM_SENDER_ID', '${sender}')`);
fcm = fcm.replace(/define\('EPLAK_APP_PACKAGE', '[^']*'\)/, `define('EPLAK_APP_PACKAGE', '${appId}')`);
if (!fcm.includes(`'${project}'`) || !fcm.includes(`'${sender}'`) || !fcm.includes(`'${appId}'`)) die('ثابت‌های EPLAK_APP_FCM_* / EPLAK_APP_PACKAGE در shared/fcm.php پیدا نشد.');
if (!dry && fcm !== before) fs.writeFileSync(FCM, fcm);
console.log('✅ shared/fcm.php: EPLAK_APP_FCM_PROJECT_ID / EPLAK_APP_FCM_SENDER_ID / EPLAK_APP_PACKAGE = ' + project + ' / ' + sender + ' / ' + appId + (fcm === before ? ' (از قبل همین بود)' : ''));
if (appId !== oldAppId) {
  const nextGradle = gradleText.replace(/applicationId\s+'[^']+'/, `applicationId '${appId}'`);
  if (!dry) fs.writeFileSync(GRADLE, nextGradle);
  console.log(`✅ android-app/app/build.gradle: applicationId '${oldAppId}' → '${appId}' (namespace بدون تغییر)`);
}

/* ۴) مستندات و بقیه‌ی جاها */
const replacements = [];
if (oldProject && oldProject !== project) replacements.push([oldProject, project]);
if (oldSender && oldSender !== sender) replacements.push([oldSender, sender]);
if (appId !== oldAppId) replacements.push([oldAppId, appId]);
if (replacements.length) {
  const docs = fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => path.join('docs', f));
  for (const rel of docs) {
    const p = path.join(ROOT, rel);
    const txt = fs.readFileSync(p, 'utf8');
    let next = txt;
    for (const [from, to] of replacements) next = next.split(from).join(to);
    if (next === txt) continue;
    if (!dry) fs.writeFileSync(p, next);
    console.log(`✅ ${rel}: ` + replacements.filter(([from]) => txt.includes(from)).map(([from, to]) => `${from} → ${to}`).join(' · '));
  }
}
if (oldProject && oldProject !== project) {
  /* گزارش بقیه‌ی فایل‌ها (کد/آزمون/CI) که هنوز شناسه‌ی قبلی را دارند */
  const scan = (dir, acc = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'build', '.gradle', 'pwa-dist'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) scan(p, acc);
      else if (/\.(php|js|mjs|kt|yml|yaml|md|html|sh|json|gradle)$/.test(e.name)) acc.push(p);
    }
    return acc;
  };
  const left = scan(ROOT).filter((p) => p !== DEST && fs.readFileSync(p, 'utf8').includes(oldProject)).map((p) => path.relative(ROOT, p));
  if (left.length) {
    console.log('ℹ️ شناسه‌ی قبلی هنوز در این فایل‌ها هست (بررسی دستی؛ در آزمون‌ها معمولاً فقط «یک پروژه‌ی دیگر» است):');
    left.forEach((f) => console.log('   • ' + f));
  }
}
console.log('\nبعدی: bash tools/dev/run-regression.sh push   ← سپس commit/push؛ کلید سرویس پنل هم باید از پروژه‌ی «' + project + '» باشد.');
