/* بررسی نحوی فایل‌های JS پروژه */
import fs from 'fs'; import path from 'path';
import vm from 'vm';
const root = process.argv[2] || '.';
const skip = new Set(['node_modules', '.git', 'vendor', 'build', 'android-app', 'dist']);
let files = 0, bad = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.js$/i.test(e.name)) {
      files++;
      try { new vm.Script(fs.readFileSync(p, 'utf8'), { filename: p }); }
      catch (err) { bad++; console.log('❌ ' + p + ' → ' + err.message.split('\n')[0]); }
    }
  }
})(root);
console.log(`${files} فایل JS، ${bad} خطای نحوی`);
process.exit(bad ? 1 : 0);
