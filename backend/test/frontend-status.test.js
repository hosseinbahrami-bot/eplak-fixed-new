const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '../../core/state.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const context = {
  console,
  window: {},
  document: { querySelectorAll: () => [], getElementById: () => null },
  setTimeout,
  clearTimeout
};
vm.createContext(context);
vm.runInContext(source, context);

test('normalizeStatusValue maps Persian admin statuses to frontend keys', () => {
  assert.equal(vm.runInContext('normalizeStatusValue("در انتظار")', context), 'pending');
  assert.equal(vm.runInContext('normalizeStatusValue("در حال بررسی")', context), 'in_progress');
  assert.equal(vm.runInContext('normalizeStatusValue("پاسخ داده شده")', context), 'done');
});
