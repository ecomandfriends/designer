const { getShops, authCheck } = require('./_helpers');

module.exports = async (req, res) => {
  const token = req.headers['x-auth-token'] || req.query.token;
  const auth = authCheck(token);
  if (!auth) return res.status(401).send('Add ?token=YOUR_PASSWORD to the URL');

  const shopId = req.query.shop;
  const shops = getShops();
  if (!shopId) {
    const links = shops.map(s => `<a href="/api/print-all?token=${token}&shop=${s.id}">${s.name}</a>`).join(' | ');
    return res.setHeader('Content-Type', 'text/html').send(`<h2>Select shop:</h2>${links}`);
  }

  const shop = shops.find(s => s.id === shopId);
  if (!shop) return res.status(404).send('Shop not found');

  const showAll = req.query.all === '1';

  try {
    let allOrders = [];
    let url = `https://${shop.shop}/admin/api/2024-01/orders.json?status=any&limit=250`;
    if (!showAll) url += '&fulfillment_status=unfulfilled';

    while (url) {
      const response = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': shop.token, 'Content-Type': 'application/json' }
      });
      if (!response.ok) return res.status(500).send('Shopify API error: ' + response.status);
      const data = await response.json();
      allOrders = allOrders.concat(data.orders || []);
      if (allOrders.length >= 500) break;
      const linkHeader = response.headers.get('link');
      url = null;
      if (linkHeader) { const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/); if (m) url = m[1]; }
    }

    // Parse stickers from orders
    const ordersWithStickers = allOrders.map(order => {
      const stickers = (order.line_items || []).filter(li => {
        return (li.properties || []).some(p => p.name === '_sticker' && p.value === 'true');
      }).map(li => {
        const ps = li.properties || [];
        const tipo = (ps.find(p => p.name === 'Tipo') || {}).value || '';
        const diseno = (ps.find(p => p.name === 'Diseño' || p.name === 'Design') || {}).value || li.variant_title || '';
        const color = (ps.find(p => p.name === 'Color') || {}).value || 'Negro';
        const isWhite = /blanco|white/i.test(color);
        let type = 'text';
        if (/bandera|flag/i.test(tipo)) type = 'flag';
        else if (/n[uú]mero|number|fecha|date|dorsal/i.test(tipo)) type = 'number';
        else if (/icon/i.test(tipo)) type = 'icon';
        else if (/personal|custom/i.test(tipo)) type = 'custom';
        const items = [];
        for (let i = 0; i < (li.quantity || 1); i++) {
          items.push({ type, value: diseno, isWhite, tipo });
        }
        return items;
      }).flat();
      return { order, stickers };
    }).filter(o => o.stickers.length > 0);

    // Flag emoji to ISO
    function flagToISO(emoji) {
      const pts = [];
      for (const ch of emoji) {
        const cp = ch.codePointAt(0);
        if (cp >= 0x1F1E6 && cp <= 0x1F1FF) pts.push(cp);
      }
      if (pts.length < 2) return null;
      return String.fromCharCode(pts[0] - 0x1F1E6 + 65, pts[1] - 0x1F1E6 + 65).toLowerCase();
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stickers — ${shop.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: landscape; margin: 8mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Poppins', sans-serif; background: #fff; color: #1a1a1a; padding: 20px; }
  
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #eee; }
  .header h1 { font-family: 'Teko', sans-serif; font-size: 24px; font-weight: 700; }
  .header-info { font-size: 12px; color: #999; }
  .header-actions { display: flex; gap: 8px; }
  .btn { font-family: 'Poppins', sans-serif; font-size: 12px; font-weight: 600; padding: 8px 16px; border-radius: 6px; border: 1px solid #ddd; background: #fff; color: #333; cursor: pointer; text-decoration: none; }
  .btn:hover { border-color: #999; }
  .btn-primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
  
  .orders-grid { display: flex; flex-wrap: wrap; gap: 16px; }
  
  .order-sheet { 
    border: 2px solid #ddd; border-radius: 10px; padding: 12px;
    page-break-inside: avoid; break-inside: avoid;
    max-width: 380px; background: #fff;
  }
  .order-label { 
    font-family: 'Teko', sans-serif; font-size: 16px; font-weight: 700; 
    color: #999; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;
  }
  .order-date { font-family: 'Poppins', sans-serif; font-size: 9px; color: #ccc; font-weight: 400; }
  
  .stickers { display: flex; flex-wrap: wrap; gap: 6px; }
  
  .sticker {
    border: 2px solid #1a1a1a; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    min-height: 50px; position: relative;
  }
  .sticker-text {
    font-family: 'Teko', sans-serif; font-size: 32px; font-weight: 700;
    line-height: 1; padding: 4px 14px; white-space: nowrap;
  }
  .sticker-text.white-text { color: #fff; background: #1a1a1a; border-color: #1a1a1a; }
  .sticker-text.black-text { color: #1a1a1a; }
  
  .sticker-number {
    font-family: 'Teko', sans-serif; font-size: 32px; font-weight: 700;
    line-height: 1; padding: 4px 14px; min-width: 50px; text-align: center;
  }
  .sticker-number.white-text { color: #fff; background: #1a1a1a; }
  .sticker-number.black-text { color: #1a1a1a; }
  
  .sticker-flag {
    width: 54px; height: 50px; padding: 6px;
    display: flex; align-items: center; justify-content: center;
  }
  .sticker-flag img { max-width: 100%; max-height: 100%; object-fit: contain; }
  
  .sticker-icon {
    width: 50px; height: 50px;
    display: flex; align-items: center; justify-content: center;
    font-size: 28px;
  }
  
  .sticker-custom {
    font-family: 'Poppins', sans-serif; font-size: 10px; font-weight: 500;
    padding: 6px 10px; max-width: 120px; text-align: center; color: #666;
    font-style: italic;
  }
  
  .summary { margin-top: 20px; padding-top: 12px; border-top: 2px solid #eee; font-size: 12px; color: #999; }
  
  @media print {
    .header-actions { display: none; }
    body { padding: 0; }
    .order-sheet { border: 1px solid #ccc; }
  }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>⬡ ${shop.name} — Sticker Designs</h1>
    <div class="header-info">${ordersWithStickers.length} pedidos · ${ordersWithStickers.reduce((s, o) => s + o.stickers.length, 0)} stickers · ${new Date().toLocaleDateString()}</div>
  </div>
  <div class="header-actions">
    ${!showAll ? `<a class="btn" href="/api/print-all?token=${token}&shop=${shopId}&all=1">Ver todos (incl. archivados)</a>` : `<a class="btn" href="/api/print-all?token=${token}&shop=${shopId}">Solo sin preparar</a>`}
    <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir</button>
  </div>
</div>

<div class="orders-grid">
${ordersWithStickers.map(({ order, stickers }) => `
  <div class="order-sheet">
    <div class="order-label">
      ${order.name}
      <span class="order-date">${new Date(order.created_at).toLocaleDateString()}</span>
    </div>
    <div class="stickers">
      ${stickers.map(s => {
        if (s.type === 'flag') {
          const iso = flagToISO(s.value);
          if (iso) {
            return `<div class="sticker sticker-flag"><img src="https://flagcdn.com/w160/${iso}.png" alt="${s.value}"></div>`;
          }
          return `<div class="sticker sticker-icon">${s.value}</div>`;
        }
        if (s.type === 'icon') {
          return `<div class="sticker sticker-icon">${s.value}</div>`;
        }
        if (s.type === 'number') {
          return `<div class="sticker"><div class="sticker-number ${s.isWhite ? 'white-text' : 'black-text'}">${s.value}</div></div>`;
        }
        if (s.type === 'custom') {
          return `<div class="sticker sticker-custom">✨ ${s.value.length > 40 ? s.value.substring(0, 40) + '...' : s.value}</div>`;
        }
        return `<div class="sticker"><div class="sticker-text ${s.isWhite ? 'white-text' : 'black-text'}">${s.value}</div></div>`;
      }).join('')}
    </div>
  </div>
`).join('')}
</div>

<div class="summary">
  Total: ${ordersWithStickers.length} pedidos · ${ordersWithStickers.reduce((s, o) => s + o.stickers.length, 0)} stickers
</div>

</body>
</html>`);
  } catch (err) {
    console.error('Print all error:', err);
    res.status(500).send('Error: ' + err.message);
  }
};
