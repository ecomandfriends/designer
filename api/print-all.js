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
      if (!response.ok) return res.status(500).send('Shopify error: ' + response.status);
      const data = await response.json();
      allOrders = allOrders.concat(data.orders || []);
      if (allOrders.length >= 500) break;
      const linkHeader = response.headers.get('link');
      url = null;
      if (linkHeader) { const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/); if (m) url = m[1]; }
    }

    // Flag helpers
    function flagToCode(emoji) {
      if (!emoji) return null;
      // Regional indicators (🇪🇸 format)
      const ris = [];
      for (const ch of emoji) {
        const cp = ch.codePointAt(0);
        if (cp >= 0x1F1E6 && cp <= 0x1F1FF) ris.push(cp);
      }
      if (ris.length === 2) {
        return String.fromCharCode(ris[0] - 0x1F1E6 + 65, ris[1] - 0x1F1E6 + 65).toLowerCase();
      }
      // Tag sequences (🏴󠁧󠁢󠁳󠁣󠁴󠁿 format - England, Scotland, Wales)
      const tags = [];
      for (const ch of emoji) {
        const cp = ch.codePointAt(0);
        if (cp >= 0xE0061 && cp <= 0xE007A) tags.push(String.fromCharCode(cp - 0xE0061 + 97));
      }
      if (tags.length >= 4) {
        const code = tags.join('');
        return code.substring(0, 2) + '-' + code.substring(2);
      }
      return null;
    }

    // Text name to flag code mapping (fallback)
    const nameToCode = {
      'spain':'es','españa':'es','italy':'it','italia':'it','england':'gb-eng','scotland':'gb-sct',
      'wales':'gb-wls','uk':'gb','united kingdom':'gb','germany':'de','alemania':'de','france':'fr',
      'francia':'fr','portugal':'pt','belgium':'be','bélgica':'be','netherlands':'nl','holanda':'nl',
      'poland':'pl','polonia':'pl','croatia':'hr','croacia':'hr','austria':'at','switzerland':'ch',
      'suiza':'ch','sweden':'se','suecia':'se','norway':'no','noruega':'no','denmark':'dk',
      'dinamarca':'dk','finland':'fi','finlandia':'fi','greece':'gr','grecia':'gr','ireland':'ie',
      'irlanda':'ie','czech republic':'cz','chequia':'cz','romania':'ro','rumanía':'ro',
      'ukraine':'ua','ucrania':'ua','russia':'ru','rusia':'ru','serbia':'rs','slovakia':'sk',
      'eslovaquia':'sk','usa':'us','united states':'us','estados unidos':'us','brazil':'br',
      'brasil':'br','argentina':'ar','mexico':'mx','méxico':'mx','colombia':'co','chile':'cl',
      'peru':'pe','perú':'pe','venezuela':'ve','ecuador':'ec','uruguay':'uy','paraguay':'py',
      'bolivia':'bo','canada':'ca','canadá':'ca','costa rica':'cr','panama':'pa','panamá':'pa',
      'cuba':'cu','dominican republic':'do','puerto rico':'pr','honduras':'hn','guatemala':'gt',
      'morocco':'ma','marruecos':'ma','senegal':'sn','nigeria':'ng','south africa':'za',
      'sudáfrica':'za','egypt':'eg','egipto':'eg','algeria':'dz','argelia':'dz','tunisia':'tn',
      'túnez':'tn','cameroon':'cm','camerún':'cm','ivory coast':'ci','ghana':'gh','kenya':'ke',
      'ethiopia':'et','etiopía':'et','tanzania':'tz','uganda':'ug','zimbabwe':'zw','angola':'ao',
      'japan':'jp','japón':'jp','south korea':'kr','corea':'kr','china':'cn','india':'in',
      'turkey':'tr','turquía':'tr','saudi arabia':'sa','arabia saudí':'sa','uae':'ae',
      'emiratos':'ae','israel':'il','indonesia':'id','philippines':'ph','filipinas':'ph',
      'thailand':'th','tailandia':'th','vietnam':'vn','malaysia':'my','malasia':'my',
      'australia':'au','new zealand':'nz','nueva zelanda':'nz','pakistan':'pk','paquistán':'pk'
    };

    function getFlagCode(value) {
      // Try emoji first
      const emojiCode = flagToCode(value);
      if (emojiCode) return emojiCode;
      // Try text name
      const clean = value.replace(/[^\w\sáéíóúñü]/g, '').trim().toLowerCase();
      if (nameToCode[clean]) return nameToCode[clean];
      // Try partial match
      for (const [name, code] of Object.entries(nameToCode)) {
        if (clean.includes(name) || name.includes(clean)) return code;
      }
      return null;
    }

    function getFlagImg(value) {
      const code = getFlagCode(value);
      if (!code) return null;
      return `https://flagcdn.com/w160/${code}.png`;
    }

    // Parse stickers
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
        for (let i = 0; i < (li.quantity || 1); i++) items.push({ type, value: diseno, isWhite });
        return items;
      }).flat();
      return { order, stickers };
    }).filter(o => o.stickers.length > 0);

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stickers — ${shop.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Teko:wght@700&family=Poppins:wght@400;600&display=swap" rel="stylesheet">
<style>
  @page{margin:5mm}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Poppins',sans-serif;background:#fff;color:#1a1a1a;padding:16px}

  .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #eee}
  .header h1{font-family:'Teko',sans-serif;font-size:20px;font-weight:700}
  .header-info{font-size:11px;color:#999}
  .header-actions{display:flex;gap:6px}
  .btn{font-family:'Poppins',sans-serif;font-size:11px;font-weight:600;padding:7px 14px;border-radius:6px;border:1px solid #ddd;background:#fff;color:#333;cursor:pointer;text-decoration:none}
  .btn:hover{border-color:#999}
  .btn-dark{background:#1a1a1a;color:#fff;border-color:#1a1a1a}

  .grid{display:flex;flex-wrap:wrap;gap:12px}

  .sheet{border:1.5px solid #ccc;border-radius:6px;padding:10px;page-break-inside:avoid;break-inside:avoid}
  .sheet-label{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #eee}
  .sheet-name{font-family:'Teko',sans-serif;font-size:14px;font-weight:700;color:#666}
  .sheet-date{font-size:8px;color:#bbb}

  .stickers{display:flex;flex-wrap:wrap;gap:4px}

  .s{border:1.5px solid #1a1a1a;border-radius:3px;display:flex;align-items:center;justify-content:center;overflow:hidden}

  .s-text{font-family:'Teko',sans-serif;font-size:28px;font-weight:700;line-height:1;padding:3px 10px;white-space:nowrap;color:#1a1a1a}
  .s-text.wh{color:#fff;background:#1a1a1a}

  .s-num{font-family:'Teko',sans-serif;font-size:28px;font-weight:700;line-height:1;padding:3px 10px;min-width:38px;text-align:center;color:#1a1a1a}
  .s-num.wh{color:#fff;background:#1a1a1a}

  .s-flag{width:44px;height:38px;padding:4px;display:flex;align-items:center;justify-content:center}
  .s-flag img{max-width:100%;max-height:100%;object-fit:contain;display:block}

  .s-icon{width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:22px}

  .s-custom{font-family:'Poppins',sans-serif;font-size:8px;padding:4px 8px;max-width:100px;text-align:center;color:#888;font-style:italic}

  .s-flag-fallback{font-size:9px;color:#999;padding:4px 8px;font-style:italic}

  .footer{margin-top:16px;padding-top:10px;border-top:2px solid #eee;font-size:11px;color:#999;display:flex;justify-content:space-between}

  @media print{
    .header-actions{display:none!important}
    body{padding:0}
    .sheet{border:1px solid #999}
  }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>${shop.name} — Stickers</h1>
    <div class="header-info">${ordersWithStickers.length} pedidos · ${ordersWithStickers.reduce((s,o)=>s+o.stickers.length,0)} stickers · ${new Date().toLocaleDateString()}</div>
  </div>
  <div class="header-actions">
    ${!showAll?`<a class="btn" href="/api/print-all?token=${token}&shop=${shopId}&all=1">Incluir archivados</a>`:`<a class="btn" href="/api/print-all?token=${token}&shop=${shopId}">Solo abiertos</a>`}
    <button class="btn btn-dark" onclick="window.print()">🖨 Imprimir / PDF</button>
  </div>
</div>
<div class="grid">
${ordersWithStickers.map(({order,stickers})=>`<div class="sheet">
  <div class="sheet-label"><span class="sheet-name">${order.name}</span><span class="sheet-date">${new Date(order.created_at).toLocaleDateString()}</span></div>
  <div class="stickers">
    ${stickers.map(s=>{
      if(s.type==='flag'){
        const flagUrl=getFlagImg(s.value);
        if(flagUrl){
          return`<div class="s s-flag"><img src="${flagUrl}" alt="flag" crossorigin="anonymous"></div>`;
        }
        return`<div class="s"><span class="s-flag-fallback">${s.value}</span></div>`;
      }
      if(s.type==='icon'){
        return`<div class="s s-icon">${s.value}</div>`;
      }
      if(s.type==='number'){
        return`<div class="s"><span class="s-num${s.isWhite?' wh':''}">${s.value}</span></div>`;
      }
      if(s.type==='custom'){
        return`<div class="s"><span class="s-custom">✨ ${s.value.length>30?s.value.substring(0,30)+'...':s.value}</span></div>`;
      }
      return`<div class="s"><span class="s-text${s.isWhite?' wh':''}">${s.value}</span></div>`;
    }).join('')}
  </div>
</div>`).join('')}
</div>
<div class="footer">
  <span>${ordersWithStickers.length} pedidos · ${ordersWithStickers.reduce((s,o)=>s+o.stickers.length,0)} stickers</span>
  <span>${new Date().toLocaleString()}</span>
</div>
</body>
</html>`);
  } catch (err) {
    console.error('Print-all error:', err);
    res.status(500).send('Error: ' + err.message);
  }
};
