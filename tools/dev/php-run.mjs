/* اجرای یک فایل PHP با PHP-WASM */
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import fs from 'fs';
const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);
try {
  const res = await php.run({ code: fs.readFileSync(process.argv[2], 'utf8') });
  process.stdout.write(res.text);
} catch (e) {
  console.log('PHP RUN FAILED: ' + e.message);
  if (e.text) console.log(String(e.text).slice(0, 2000));
}
process.exit(0);
