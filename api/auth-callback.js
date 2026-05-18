module.exports = async (req, res) => {
  const { code, shop } = req.query;
  if (!code || !shop) return res.status(400).send('Missing authorization parameters');

  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code })
    });
    if (!response.ok) { const err = await response.text(); return res.status(500).send('Error: ' + err); }
    const data = await response.json();

    res.setHeader('Content-Type', 'text/html').send(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorized</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;background:#0a0a0a;color:#e8e8e8;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.card{max-width:600px;width:100%;text-align:center}.check{font-size:64px;margin-bottom:16px}h2{margin-bottom:8px}.sub{color:#888;margin-bottom:32px;font-size:14px}.box{text-align:left;background:#141414;border:1px solid #222;border-radius:12px;padding:24px}.token{background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;font-family:monospace;font-size:12px;word-break:break-all;color:#f5c542;margin:12px 0;cursor:pointer}.token:hover{border-color:#f5c542}code{background:#222;padding:2px 6px;border-radius:4px;font-size:12px;color:#f5c542}ol{padding-left:20px}li{margin-bottom:10px;font-size:13px;color:#ccc}</style></head>
      <body><div class="card"><div class="check">✅</div><h2>${shop} authorized</h2><p class="sub">Copy this token into your SHOPS env var</p>
      <div class="box"><ol><li>Copy this access token:</li></ol>
      <div class="token" onclick="navigator.clipboard.writeText(this.textContent.trim())">${data.access_token}</div>
      <ol start="2"><li>Add it to your <code>SHOPS</code> env var in Vercel for this shop's <code>"token"</code> field</li><li>Redeploy</li></ol></div></div></body></html>
    `);
  } catch (err) { console.error('OAuth error:', err); res.status(500).send('Authorization error'); }
};
