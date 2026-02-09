module.exports = (req, res) => {
  const SHOP = process.env.SHOPIFY_SHOP;
  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const APP_URL = process.env.APP_URL;

  const redirectUri = `${APP_URL}/api/auth-callback`;
  const scopes = 'read_orders';
  const nonce = Math.random().toString(36).substring(2, 18);

  const authUrl = `https://${SHOP}/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;

  res.redirect(302, authUrl);
};
