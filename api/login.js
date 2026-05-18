const { getShops, authCheck } = require('./_helpers');

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body || {};
  const auth = authCheck(password);
  if (!auth) return res.status(401).json({ error: 'Incorrect password' });

  // Return shop list (id + name only, never tokens)
  const shops = getShops().map(s => ({ id: s.id, name: s.name }));

  res.json({ success: true, token: password, role: auth.role, name: auth.name, shops });
};
