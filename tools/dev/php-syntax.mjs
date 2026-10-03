/* بررسی نحوی همه‌ی فایل‌های PHP پروژه (۰ خطای پارس) */
import fs from 'fs'; import path from 'path';
import parser from 'php-parser';
const engine = new parser.Engine({ parser: { extractDoc: false, suppressErrors: true }, ast: { withPositions: false } });
const root = process.argv[2] || '.';
const skip = new Set(['node_modules', '.git', 'vendor', 'build', 'android-app']);
let files = 0, bad = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.php$/i.test(e.name)) {
      files++;
      try { engine.parseCode(fs.readFileSync(p, 'utf8'), p); }
      catch (err) { bad++; console.log('❌ ' + p + ' → ' + err.message.split('\n')[0]); }
    }
  }
})(root);
console.log(`${files} فایل PHP، ${bad} خطای نحوی`);
process.exit(bad ? 1 : 0);
