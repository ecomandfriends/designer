const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  const token = req.headers['x-auth-token'];
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const USERS = getUsers();
  const isAdmin = token === ADMIN_PASSWORD;
  const user = USERS.find(u => u.password === token);

  if (!isAdmin && !user) {
    return res.status(401).json({ error: 'Not authorized' });
  }

  const userName = isAdmin ? 'Admin' : user.name;

  // GET — fetch all statuses
  if (req.method === 'GET') {
    try {
      const designed = await kv.get('designed') || {};
      const notes = await kv.get('notes') || {};
      return res.json({ designed, notes });
    } catch (err) {
      console.error('KV read error:', err);
      return res.json({ designed: {}, notes: {} });
    }
  }

  // POST — update a status
  if (req.method === 'POST') {
    const { action, orderId, note } = req.body || {};

    try {
      if (action === 'mark') {
        const designed = await kv.get('designed') || {};
        designed[orderId] = { at: new Date().toISOString(), by: userName };
        await kv.set('designed', designed);
        return res.json({ success: true, designed });
      }

      if (action === 'unmark') {
        const designed = await kv.get('designed') || {};
        delete designed[orderId];
        await kv.set('designed', designed);
        return res.json({ success: true, designed });
      }

      if (action === 'note') {
        const notes = await kv.get('notes') || {};
        if (note) notes[orderId] = { text: note, by: userName, at: new Date().toISOString() };
        else delete notes[orderId];
        await kv.set('notes', notes);
        return res.json({ success: true, notes });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (err) {
      console.error('KV write error:', err);
      return res.status(500).json({ error: 'Storage error' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};

function getUsers() {
  try { return JSON.parse(process.env.DESIGNER_USERS || '[]'); }
  catch { return []; }
}
