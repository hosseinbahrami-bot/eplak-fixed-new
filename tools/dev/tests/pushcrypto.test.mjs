/* pushcrypto.test.mjs — رمزنگاری اعلان مرورگر (RFC 8291) و امضای VAPID (ES256)
   پیام با کلید خصوصی «گوشی» رمزگشایی و امضا با کلید عمومی بررسی می‌شود. */
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import crypto from 'crypto';
import fs from 'fs'; import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const SHIM = '/tmp/eplak-regression-push';
const DB = '/tmp/eplak-regression-push.sqlite';
if (fs.existsSync(DB)) fs.unlinkSync(DB);

/* نسخه‌ی آزمایشی: در محیط WASM ساخت کلید EC کار نمی‌کند، پس کلید موقت از بیرون داده می‌شود */
fs.rmSync(SHIM, { recursive: true, force: true });
fs.mkdirSync(SHIM, { recursive: true });
fs.cpSync(`${ROOT}/shared`, `${SHIM}/shared`, { recursive: true });
fs.cpSync(`${ROOT}/admin`, `${SHIM}/admin`, { recursive: true });
let wp = fs.readFileSync(`${SHIM}/shared/webpush.php`, 'utf8');
wp = wp.replace(`    $ephemeral = @openssl_pkey_new([
        'private_key_type' => OPENSSL_KEYTYPE_EC,
        'curve_name'       => 'prime256v1',
    ]);
    if ($ephemeral === false) {
        $out['error'] = 'ساخت کلید موقت ناموفق بود.';
        return $out;
    }
    $ephDetails = openssl_pkey_get_details($ephemeral);
    if (empty($ephDetails['ec']['x']) || empty($ephDetails['ec']['y'])) {
        $out['error'] = 'خواندن کلید موقت ناموفق بود.';
        return $out;
    }
    $asPublic = "\\x04"
        . str_pad((string) $ephDetails['ec']['x'], 32, "\\x00", STR_PAD_LEFT)
        . str_pad((string) $ephDetails['ec']['y'], 32, "\\x00", STR_PAD_LEFT);`,
`    /* شیم فقط-آزمایشی: کلید موقت از بیرون */
    $ephPem = getenv('EPLAK_TEST_EPH_PEM') ?: '';
    $ephPub = getenv('EPLAK_TEST_EPH_PUB') ?: '';
    $ephemeral = @openssl_pkey_get_private((string) @file_get_contents($ephPem));
    $asPublic  = hex2bin($ephPub);`);
fs.writeFileSync(`${SHIM}/shared/webpush.php`, wp);

const serverKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const vapidPem = serverKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const serverPubRaw = serverKeys.publicKey.export({ type: 'spki', format: 'der' }).slice(-65);
const uaKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const uaPriv = uaKeys.privateKey;
const uaPubRaw = uaKeys.publicKey.export({ type: 'spki', format: 'der' }).slice(-65);
const authSecret = crypto.randomBytes(16);
const ephKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
fs.writeFileSync('/tmp/eplak-regression-eph.pem', ephKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
const ephPubHex = ephKeys.publicKey.export({ type: 'spki', format: 'der' }).slice(-65).toString('hex');

const payload = JSON.stringify({ title: 'قطعی آب', body: 'فردا از ۸ تا ۱۲', url: 'index.html', tag: 'eplak-send-5', id: 5 });
fs.writeFileSync('/tmp/eplak-regression-push-input.json', JSON.stringify({
  payload,
  ua_pub_hex: uaPubRaw.toString('hex'),
  auth_hex: authSecret.toString('hex'),
  vapid_pem: vapidPem,
  vapid_public: Buffer.from(serverPubRaw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
}));

const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);
const run = async (code) => String((await php.run({
  code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); `
    + `putenv('EPLAK_TEST_EPH_PEM=/tmp/eplak-regression-eph.pem'); putenv('EPLAK_TEST_EPH_PUB=${ephPubHex}'); ${code}`,
})).text).trim();

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4), 'base64');
const hkdf = (salt, ikm, info, len) => {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  let out = Buffer.alloc(0), prev = Buffer.alloc(0), c = 1;
  while (out.length < len) { prev = crypto.createHmac('sha256', prk).update(Buffer.concat([prev, info, Buffer.from([c++])])).digest(); out = Buffer.concat([out, prev]); }
  return out.subarray(0, len);
};
const pubFromRaw = (raw) => crypto.createPublicKey({
  key: Buffer.concat([Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex'), raw]),
  format: 'der', type: 'spki',
});

console.log('\n=== رمزنگاری پیام (RFC 8291) ===');
const enc = JSON.parse(await run(`
$in = json_decode((string) file_get_contents('/tmp/eplak-regression-push-input.json'), true);
require_once '${SHIM}/shared/webpush.php';
$r = eplakWebPushEncrypt($in['payload'], hex2bin($in['ua_pub_hex']), hex2bin($in['auth_hex']));
echo json_encode(['body' => base64_encode($r['body']), 'error' => $r['error']]);`));
ok('رمزنگاری بدون خطا انجام شد', enc.error === '' && enc.body.length > 2, JSON.stringify(enc).slice(0, 120));

let decrypted = null, err = '';
try {
  const buf = Buffer.from(enc.body, 'base64');
  const salt = buf.subarray(0, 16);
  const idlen = buf.readUInt8(20);
  const asPublic = buf.subarray(21, 21 + idlen);
  const rest = buf.subarray(21 + idlen);
  const ciphertext = rest.subarray(0, rest.length - 16);
  const tag = rest.subarray(rest.length - 16);
  const ecdh = crypto.diffieHellman({ privateKey: uaPriv, publicKey: pubFromRaw(asPublic) });
  const ikm = hkdf(authSecret, ecdh, Buffer.concat([Buffer.from('WebPush: info\x00'), uaPubRaw, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\x00'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\x00'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(tag);
  let plain = Buffer.concat([d.update(ciphertext), d.final()]);
  const delim = plain.lastIndexOf(0x02);
  if (delim >= 0) plain = plain.subarray(0, delim);
  decrypted = JSON.parse(plain.toString('utf8'));
} catch (e) { err = e.message; }

ok('پیام روی «گوشی» رمزگشایی و تأیید شد', !!decrypted, err);
ok('عنوان و متن درست منتقل شد', decrypted?.title === 'قطعی آب' && decrypted?.body === 'فردا از ۸ تا ۱۲', JSON.stringify(decrypted));
ok('اطلاعات مسیر/برچسب سالم است', decrypted?.url === 'index.html' && decrypted?.tag === 'eplak-send-5' && decrypted?.id === 5);

console.log('\n=== امضای VAPID (ES256) ===');
const token = await run(`
$in = json_decode((string) file_get_contents('/tmp/eplak-regression-push-input.json'), true);
require_once '${SHIM}/shared/webpush.php';
echo eplakVapidToken('https://fcm.googleapis.com', 'mailto:admin@eplak.ir', $in['vapid_pem']);`);
const [h, p, sig] = String(token).split('.');
let verified = false, jwt = null;
try {
  jwt = { header: JSON.parse(fromB64url(h).toString()), payload: JSON.parse(fromB64url(p).toString()) };
  verified = crypto.verify('sha256', Buffer.from(h + '.' + p), { key: pubFromRaw(serverPubRaw), dsaEncoding: 'ieee-p1363' }, fromB64url(sig));
} catch (e) { err = e.message; }
ok('توکن سه‌بخشی ساخته شد', !!h && !!p && !!sig);
ok('امضای ES256 با کلید عمومی تأیید شد', verified, err);
ok('مخاطب و نشانی تماس درست است', jwt?.payload?.aud === 'https://fcm.googleapis.com' && jwt?.payload?.sub === 'mailto:admin@eplak.ir', JSON.stringify(jwt?.payload));

console.log('\n=== محدودیت طول پیام ===');
const big = JSON.parse(await run(`
$in = json_decode((string) file_get_contents('/tmp/eplak-regression-push-input.json'), true);
require_once '${SHIM}/shared/webpush.php';
$r = eplakWebPushEncrypt(str_repeat('ا', 5000), hex2bin($in['ua_pub_hex']), hex2bin($in['auth_hex']));
echo json_encode(['error' => $r['error'], 'len' => strlen($r['body'])]);`));
ok('پیام بلند بدون خطا و در محدوده‌ی مجاز ارسال می‌شود', big.error === '' && big.len < 4096, JSON.stringify(big));

console.log('\n' + '='.repeat(52));
console.log(`PUSHCRYPTO: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
