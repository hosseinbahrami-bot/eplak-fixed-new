const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createApp } = require('../server');

function loadFrontEndState() {
  const source = fs.readFileSync(path.join(__dirname, '../../core/state.js'), 'utf8');
  const context = { console, setTimeout, clearTimeout, window: {}, document: { querySelectorAll: () => [] } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test('frontend status normalization handles all/review states consistently', () => {
  const ctx = loadFrontEndState();
  assert.equal(ctx.normalizeStatusValue('all'), 'all');
  assert.equal(ctx.normalizeStatusValue('همه'), 'all');
  assert.equal(ctx.normalizeStatusValue('review'), 'in_progress');
  assert.equal(ctx.normalizeStatusValue('بررسی'), 'in_progress');
  assert.equal(ctx.normalizeStatusValue('done'), 'done');
  assert.equal(ctx.normalizeStatusValue('انجام شده'), 'done');

  const meta = ctx.getStatusMeta('review');
  assert.equal(meta.label, 'در حال بررسی');
  assert.equal(meta.className, 'status-review');
});

test('POST /users returns 400 when phone or name is missing', async () => {
  const app = createApp({
    execute: async () => ({})
  });

  const server = app.listen(0);
  const { port } = await new Promise((resolve) => {
    server.once('listening', () => resolve({ port: server.address().port }));
  });

  const response = await fetch(`http://127.0.0.1:${port}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  assert.equal(response.status, 400);
  server.close();
});

test('GET /reports returns reports list for admin dashboard', async () => {
  const app = createApp({
    query: async () => [[{ id: 1, user_phone: '09120000000', title: 'آب‌گرفتگی', status: 'pending' }]],
    execute: async () => ({})
  });

  const server = app.listen(0);
  const { port } = await new Promise((resolve) => {
    server.once('listening', () => resolve({ port: server.address().port }));
  });

  const response = await fetch(`http://127.0.0.1:${port}/reports`);
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.equal(Array.isArray(data), true);
  assert.equal(data[0].title, 'آب‌گرفتگی');

  server.close();
});

test('PATCH /reports/:id/reply updates the stored admin response', async () => {
  let updated = null;
  const app = createApp({
    query: async () => [[]],
    execute: async (sql, params) => {
      updated = { sql, params };
      return { insertId: 1 };
    }
  });

  const server = app.listen(0);
  const { port } = await new Promise((resolve) => {
    server.once('listening', () => resolve({ port: server.address().port }));
  });

  const response = await fetch(`http://127.0.0.1:${port}/reports/7/reply`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reply: 'پیام جدید', status: 'done' })
  });

  assert.equal(response.status, 200);
  assert.match(updated.sql, /UPDATE reports/i);
  assert.equal(updated.params.includes('پیام جدید'), true);

  server.close();
});

test('DELETE /reports/:id/reply clears the admin response', async () => {
  let cleared = null;
  const app = createApp({
    query: async () => [[]],
    execute: async (sql, params) => {
      cleared = { sql, params };
      return { insertId: 1 };
    }
  });

  const server = app.listen(0);
  const { port } = await new Promise((resolve) => {
    server.once('listening', () => resolve({ port: server.address().port }));
  });

  const response = await fetch(`http://127.0.0.1:${port}/reports/7/reply`, {
    method: 'DELETE'
  });

  assert.equal(response.status, 200);
  assert.match(cleared.sql, /UPDATE reports/i);
  assert.equal(cleared.params[0], 'pending');
  assert.equal(cleared.params[1], '7');

  server.close();
});
