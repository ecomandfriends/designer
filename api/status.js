const { kv } = require('@vercel/kv');
const { authCheck } = require('./_helpers');

module.exports = async (req, res) => {
  const token = req.headers['x-auth-token'];
  const auth = authCheck(token);
  if (!auth) return res.status(401).json({ error: 'Not authorized' });

  const shopId = req.query.shop || req.body?.shopId;
  if (!shopId) return res.status(400).json({ error: 'Missing shop parameter' });

  const dKey = `designed:${shopId}`;
  const nKey = `notes:${shopId}`;

  if (req.method === 'GET') {
    try {
      const designed = await kv.get(dKey) || {};
      const notes = await kv.get(nKey) || {};
      return res.json({ designed, notes });
    } catch (err) {
      console.error('KV read error:', err);
      return res.json({ designed: {}, notes: {} });
    }
  }

  if (req.method === 'POST') {
    const { action, orderId, note } = req.body || {};
    try {
      if (action === 'mark') {
        const designed = await kv.get(dKey) || {};
        designed[orderId] = { at: new Date().toISOString(), by: auth.name };
        await kv.set(dKey, designed);
        return res.json({ success: true, designed });
      }
      if (action === 'unmark') {
        const designed = await kv.get(dKey) || {};
        delete designed[orderId];
        await kv.set(dKey, designed);
        return res.json({ success: true, designed });
      }
      if (action === 'note') {
        const notes = await kv.get(nKey) || {};
        if (note) notes[orderId] = { text: note, by: auth.name, at: new Date().toISOString() };
        else delete notes[orderId];
        await kv.set(nKey, notes);
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
