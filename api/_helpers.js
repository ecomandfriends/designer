// SHOPS env var format:
// [{"id":"playerly","name":"Playerly","shop":"mipersonalizadocom.myshopify.com","token":"shpat_xxx"},{"id":"store2","name":"My Other Store","shop":"otherstore.myshopify.com","token":"shpat_yyy"}]

function getShops() {
  try { return JSON.parse(process.env.SHOPS || '[]'); }
  catch { return []; }
}

function getUsers() {
  try { return JSON.parse(process.env.DESIGNER_USERS || '[]'); }
  catch { return []; }
}

function authCheck(token) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const USERS = getUsers();
  const isAdmin = token === ADMIN_PASSWORD;
  const user = USERS.find(u => u.password === token);
  if (!isAdmin && !user) return null;
  return { isAdmin, name: isAdmin ? 'Admin' : user.name, role: isAdmin ? 'admin' : 'designer' };
}

module.exports = { getShops, getUsers, authCheck };
