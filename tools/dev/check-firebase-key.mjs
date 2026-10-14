#!/usr/bin/env node
/* tools/dev/check-firebase-key.mjs — بررسی «کلید سرویس فایربیس» پیش از چسباندن در پنل
   (بدون تماس با گوگل؛ بدون چاپ کلید خصوصی)

   اجرا:
     node tools/dev/check-firebase-key.mjs <service-account.json> [google-services.json]
   اگر google-services.json داده نشود، فایل مخزن (android-app/app/google-services.json) مبنا است.

   چه چیزی سنجیده می‌شود؟
     ۱) ساختار فایل: type=service_account، project_id، client_email، private_key، token_uri
     ۲) کلید خصوصی واقعاً قابل خواندن است و با آن می‌شود JWT با RS256 امضا کرد
        (همان کاری که shared/fcm.php برای گرفتن access_token می‌کند) و امضا با کلید
        عمومیِ خودش تأیید می‌شود
     ۳) client_email متعلق به همان پروژه است (…@<project>.iam.gserviceaccount.com)
     ۴) مهم‌ترین: project_id کلید = project_id فایل google-services.json داخل APK
        (وگرنه گوگل هر ارسال را با «HTTP 403 PERMISSION_DENIED SenderId mismatch» رد می‌کند)
   خروجی: ✅/❌ برای هر گام؛ کد خروج ۰ یعنی همه سالم.
   ⚠️ این فایل محرمانه است: هرگز در مخزن commit نشود (.gitignore آن را مسدود می‌کند).
*/
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const args = process.argv.slice(2);
if (!args[0]) {
  console.error('استفاده: node tools/dev/check-firebase-key.mjs <service-account.json> [google-services.json]');
  process.exit(2);
}
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const keyPath = path.resolve(args[0]);
const gsPath = path.resolve(args[1] || path.join(ROOT, 'android-app/app/google-services.json'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? '  — ' + extra : '')); }
  return !!cond;
};
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

console.log('=== بررسی کلید سرویس فایربیس: ' + path.basename(keyPath) + ' ===');
let key = null;
try {
  const raw = fs.readFileSync(keyPath, 'utf8').replace(/^\uFEFF/, '');
  key = JSON.parse(raw);
} catch (e) {
  ok('فایل JSON معتبر است', false, e.message);
  process.exit(1);
}
ok('فایل JSON معتبر است', key && typeof key === 'object');
ok('type = service_account (کلید سرویس است، نه google-services.json)', key.type === 'service_account' && !key.project_info,
  key.project_info ? 'این فایل google-services.json است (مخصوص داخل APK)؛ کلید سرویس از Service accounts → Generate new private key دانلود می‌شود' : `type=${key.type}`);
const project = String(key.project_id || '');
ok('project_id دارد', project !== '', '');
ok('client_email دارد', typeof key.client_email === 'string' && key.client_email.includes('@'));
ok('client_email متعلق به همین پروژه است', typeof key.client_email === 'string' && key.client_email.endsWith(`@${project}.iam.gserviceaccount.com`), String(key.client_email || ''));
ok('token_uri درست است', key.token_uri === 'https://oauth2.googleapis.com/token', String(key.token_uri || ''));
ok('private_key با BEGIN PRIVATE KEY شروع می‌شود', typeof key.private_key === 'string' && key.private_key.includes('BEGIN PRIVATE KEY'));

/* امضای JWT مثل shared/fcm.php */
let signed = false, verified = false, detail = '';
try {
  const priv = crypto.createPrivateKey(key.private_key);
  const pub = crypto.createPublicKey(priv);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: key.token_uri, iat: now, exp: now + 3600 }));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(header + '.' + claims), priv);
  signed = sig.length > 0;
  verified = crypto.verify('RSA-SHA256', Buffer.from(header + '.' + claims), pub, sig);
  detail = `RSA ${priv.asymmetricKeyDetails?.modulusLength || '?'} بیت`;
} catch (e) {
  detail = e.message;
}
ok('کلید خصوصی خوانده شد و JWT با RS256 امضا و تأیید می‌شود (' + detail + ')', signed && verified, detail);

/* هم‌خوانی با google-services.json */
console.log('\n=== هم‌خوانی با پروژه‌ی APK: ' + path.relative(ROOT, gsPath) + ' ===');
let gs = null;
try { gs = JSON.parse(fs.readFileSync(gsPath, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { gs = null; }
if (!ok('google-services.json خوانده شد', gs && gs.project_info)) {
  console.log('\n' + (fail ? `❌ ${fail} مشکل، ${pass} سالم` : `✅ ${pass} سالم`));
  process.exit(fail ? 1 : 0);
}
const gsProject = String(gs.project_info.project_id || '');
const gsSender = String(gs.project_info.project_number || '');
console.log(`  پروژه‌ی کلید: ${project}   ·   پروژه‌ی APK: ${gsProject} (فرستنده ${gsSender})`);
ok('project_id کلید با پروژه‌ی google-services.json یکی است (وگرنه: SenderId mismatch)', project !== '' && project === gsProject,
  `کلید=${project} ≠ اپ=${gsProject} → کلید را از پروژه‌ی «${gsProject}» بسازید یا APK را با google-services.json پروژه‌ی «${project}» دوباره بسازید`);

console.log('\n' + (fail ? `❌ ${fail} مشکل، ${pass} سالم — این کلید را در پنل نچسبانید تا مشکل رفع شود.` : `✅ همه‌ی ${pass} بررسی سالم است — این کلید را در پنل → تنظیمات → «کلید سرویس فایربیس» بچسبانید (یا فایل را انتخاب کنید).`));
process.exit(fail ? 1 : 0);
