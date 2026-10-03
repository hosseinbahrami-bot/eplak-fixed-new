const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

function createApp(pool) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/reports', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM reports ORDER BY created_at DESC');
      res.status(200).json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /* ===== اخبار و دانستنی‌ها ===== */
  app.get('/news', async (req, res) => {
    try {
      const type = (req.query.type || 'all').toString().toLowerCase();
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      let sql = 'SELECT id, type, title, summary, body, icon, image_url, sort_order, updated_at FROM news WHERE published = 1';
      const params = [];
      if (type === 'news' || type === 'tip') {
        sql += ' AND type = ?';
        params.push(type);
      }
      sql += ' ORDER BY sort_order ASC, id DESC LIMIT ' + limit;
      const [rows] = await pool.query(sql, params);
      res.status(200).json({ success: true, count: rows.length, items: rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ===== اعلان‌های ارسالی از پنل ادمین ===== */
  app.get('/notifications/:phone', async (req, res) => {
    try {
      const { phone } = req.params;
      const [rows] = await pool.query(
        'SELECT id, title, body, read_flag, created_at FROM notifications WHERE user_phone = ? ORDER BY id DESC LIMIT 100',
        [phone]
      );
      const unread = rows.filter(r => !r.read_flag).length;
      res.status(200).json({ success: true, count: rows.length, unread, notifications: rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/notifications', async (req, res) => {
    const { phone, name, address, nid } = req.body;
    if (!phone || !name) return res.status(400).json({ error: 'Phone and name are required' });

    try {
      await pool.execute(
        `INSERT INTO users (phone, name, address, nid) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), address = VALUES(address), nid = VALUES(nid)`,
        [phone, name, address || null, nid || null]
      );
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/reports', async (req, res) => {
    const { userPhone, phone, title, description, category, department, subDepartment, sub_department, location } = req.body;
    const userPhoneValue = userPhone || phone;
    if (!userPhoneValue || !title || !description || !category) return res.status(400).json({ error: 'Missing report fields' });

    try {
      const [result] = await pool.execute(
        'INSERT INTO reports (user_phone, title, description, category, department, sub_department, location) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userPhoneValue, title, description, category, department || '', subDepartment || sub_department || '', location || '']
      );
      res.status(201).json({ id: result.insertId, success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/reports/:id/reply', async (req, res) => {
    const { id } = req.params;
    const { reply, status } = req.body || {};
    if (!reply && reply !== '') return res.status(400).json({ error: 'Reply is required' });

    try {
      await pool.execute('UPDATE reports SET reply = ?, status = ? WHERE id = ?', [reply, status || 'pending', id]);
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/reports/:id/reply', async (req, res) => {
    const { id } = req.params;

    try {
      await pool.execute('UPDATE reports SET reply = NULL, status = ? WHERE id = ?', ['pending', id]);
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/tickets/:id/reply', async (req, res) => {
    const { id } = req.params;
    const { reply, status } = req.body || {};
    if (!reply && reply !== '') return res.status(400).json({ error: 'Reply is required' });

    try {
      await pool.execute('UPDATE tickets SET reply = ?, status = ? WHERE id = ?', [reply, status || 'pending', id]);
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/tickets/:id/reply', async (req, res) => {
    const { id } = req.params;

    try {
      await pool.execute('UPDATE tickets SET reply = NULL, status = ? WHERE id = ?', ['pending', id]);
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/payments', async (req, res) => {
    const { userPhone, code, title, dueDate, amount } = req.body;
    if (!userPhone || !code || !title || !dueDate || amount === undefined) return res.status(400).json({ error: 'Missing payment fields' });

    try {
      const [result] = await pool.execute(
        'INSERT INTO payments (user_phone, code, title, due_date, amount) VALUES (?, ?, ?, ?, ?)',
        [userPhone, code, title, dueDate, amount]
      );
      res.status(201).json({ id: result.insertId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/favorites', async (req, res) => {
    const { userPhone, itemId } = req.body;
    if (!userPhone || !itemId) return res.status(400).json({ error: 'Missing favorite fields' });

    try {
      const [result] = await pool.execute(
        'INSERT INTO favorites (user_phone, item_id) VALUES (?, ?)',
        [userPhone, itemId]
      );
      res.status(201).json({ id: result.insertId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}

if (require.main === module) {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    // همان پایگاه داده پنل ادمین؛ در صورت نیاز با متغیر محیطی EPLAK_DB_NAME تغییر دهید
    database: process.env.EPLAK_DB_NAME || 'wigitali_eplak-db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  const app = createApp(pool);
  app.listen(8080, () => console.log('Server running on port 8080'));
}

module.exports = { createApp };
