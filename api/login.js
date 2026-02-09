module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const USERS = getUsers();

  // Check admin
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: ADMIN_PASSWORD, role: 'admin', name: 'Admin' });
  }

  // Check designer users
  const user = USERS.find(u => u.password === password);
  if (user) {
    return res.json({ success: true, token: user.password, role: 'designer', name: user.name });
  }

  res.status(401).json({ error: 'Incorrect password' });
};

function getUsers() {
  try { return JSON.parse(process.env.DESIGNER_USERS || '[]'); }
  catch { return []; }
}
