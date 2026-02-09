module.exports = async (req, res) => {
  const { code, shop } = req.query;

  if (!code || !shop) {
    return res.status(400).send('Missing authorization parameters');
  }

  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

  try {
    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Token exchange error:', err);
      return res.status(500).send('Error getting token: ' + err);
    }

    const data = await response.json();
    const accessToken = data.access_token;

    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>App Authorized</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #e8e8e8; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .card { max-width: 600px; width: 100%; text-align: center; }
        .check { font-size: 64px; margin-bottom: 16px; }
        h2 { margin-bottom: 8px; font-size: 24px; }
        .subtitle { color: #888; margin-bottom: 32px; font-size: 14px; }
        .steps { text-align: left; background: #141414; border: 1px solid #222; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
        .steps h3 { font-size: 14px; color: #f5c542; margin-bottom: 16px; }
        .steps ol { padding-left: 20px; }
        .steps li { margin-bottom: 12px; font-size: 13px; line-height: 1.5; color: #ccc; }
        .token-box { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 16px; font-family: monospace; font-size: 12px; word-break: break-all; color: #f5c542; margin: 12px 0; text-align: left; cursor: pointer; position: relative; }
        .token-box:hover { border-color: #f5c542; }
        .token-box::after { content: 'Click to copy'; position: absolute; top: -8px; right: 8px; background: #0a0a0a; padding: 0 6px; font-size: 10px; color: #888; font-family: system-ui; }
        .copied { color: #34d399 !important; border-color: #34d399 !important; }
        .copied::after { content: 'Copied!' !important; color: #34d399 !important; }
        code { background: #222; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #f5c542; }
      </style>
      </head>
      <body>
        <div class="card">
          <div class="check">✅</div>
          <h2>App authorized successfully</h2>
          <p class="subtitle">Now save the token in Vercel</p>
          <div class="steps">
            <h3>Final steps:</h3>
            <ol>
              <li>Copy this token (click the box):</li>
            </ol>
            <div class="token-box" id="token" onclick="copyToken()">${accessToken}</div>
            <ol start="2">
              <li>Go to your Vercel project → <strong>Settings → Environment Variables</strong></li>
              <li>Add: <code>SHOPIFY_ACCESS_TOKEN</code> with the copied token</li>
              <li><strong>Redeploy</strong> the project</li>
              <li>Done! The portal is ready</li>
            </ol>
          </div>
        </div>
        <script>
          function copyToken() {
            const el = document.getElementById('token');
            navigator.clipboard.writeText(el.textContent.trim());
            el.classList.add('copied');
            setTimeout(() => el.classList.remove('copied'), 2000);
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('OAuth error:', err);
    res.status(500).send('Authorization error');
  }
};
