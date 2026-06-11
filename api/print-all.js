const { getShops, authCheck } = require('./_helpers');

module.exports = async (req, res) => {
  const token = req.headers['x-auth-token'] || req.query.token;
  const auth = authCheck(token);
  if (!auth) return res.status(401).send('Add ?token=YOUR_PASSWORD');
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
      const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': shop.token, 'Content-Type': 'application/json' } });
      if (!r.ok) return res.status(500).send('Shopify error');
      const d = await r.json();
      allOrders = allOrders.concat(d.orders || []);
      if (allOrders.length >= 500) break;
      const lh = r.headers.get('link');
      url = null;
      if (lh) { const m = lh.match(/<([^>]+)>;\s*rel="next"/); if (m) url = m[1]; }
    }

    // ─── HELPERS: get property by multiple possible names ───
    function getProp(ps, ...names) {
      for (const n of names) {
        const p = ps.find(p => p.name.toLowerCase() === n.toLowerCase());
        if (p) return p.value;
      }
      return '';
    }

    // ─── FLAG DETECTION ───
    function flagToCode(val) {
      if (!val) return null;
      // 1) Regional indicators (🇪🇸)
      const ris = [];
      for (const ch of val) { const cp = ch.codePointAt(0); if (cp >= 0x1F1E6 && cp <= 0x1F1FF) ris.push(cp); }
      if (ris.length === 2) return String.fromCharCode(ris[0] - 0x1F1E6 + 65, ris[1] - 0x1F1E6 + 65).toLowerCase();
      // 2) Tag sequences (🏴󠁧󠁢󠁥󠁮󠁧󠁿)
      const tags = [];
      for (const ch of val) { const cp = ch.codePointAt(0); if (cp >= 0xE0061 && cp <= 0xE007A) tags.push(String.fromCharCode(cp - 0xE0061 + 97)); }
      if (tags.length >= 4) { const c = tags.join(''); return c.substring(0, 2) + '-' + c.substring(2); }
      // 3) Text name (strip emoji first)
      const clean = val.replace(/[^\w\sáéíóúñü]/g, '').trim().toLowerCase();
      const map = {
        'spain':'es','españa':'es','italy':'it','italia':'it','england':'gb-eng','scotland':'gb-sct',
        'wales':'gb-wls','uk':'gb','united kingdom':'gb','great britain':'gb','germany':'de','alemania':'de',
        'france':'fr','francia':'fr','portugal':'pt','belgium':'be','bélgica':'be','netherlands':'nl',
        'holanda':'nl','holland':'nl','poland':'pl','polonia':'pl','croatia':'hr','croacia':'hr',
        'austria':'at','switzerland':'ch','suiza':'ch','sweden':'se','suecia':'se','norway':'no',
        'noruega':'no','denmark':'dk','dinamarca':'dk','finland':'fi','finlandia':'fi','greece':'gr',
        'grecia':'gr','ireland':'ie','irlanda':'ie','czech republic':'cz','chequia':'cz','romania':'ro',
        'rumanía':'ro','rumania':'ro','ukraine':'ua','ucrania':'ua','russia':'ru','rusia':'ru',
        'serbia':'rs','slovakia':'sk','hungary':'hu','hungría':'hu','bulgaria':'bg',
        'usa':'us','united states':'us','estados unidos':'us','brazil':'br','brasil':'br',
        'argentina':'ar','mexico':'mx','méxico':'mx','colombia':'co','chile':'cl','peru':'pe',
        'perú':'pe','venezuela':'ve','ecuador':'ec','uruguay':'uy','paraguay':'py','bolivia':'bo',
        'canada':'ca','canadá':'ca','costa rica':'cr','panama':'pa','cuba':'cu','jamaica':'jm',
        'dominican republic':'do','puerto rico':'pr','honduras':'hn','guatemala':'gt',
        'morocco':'ma','marruecos':'ma','senegal':'sn','nigeria':'ng','south africa':'za',
        'egypt':'eg','egipto':'eg','algeria':'dz','tunisia':'tn','cameroon':'cm','ivory coast':'ci',
        'ghana':'gh','kenya':'ke','ethiopia':'et','tanzania':'tz','uganda':'ug','angola':'ao',
        'japan':'jp','japón':'jp','south korea':'kr','corea':'kr','china':'cn','india':'in',
        'turkey':'tr','turquía':'tr','turquia':'tr','saudi arabia':'sa','uae':'ae',
        'israel':'il','indonesia':'id','philippines':'ph','filipinas':'ph',
        'thailand':'th','tailandia':'th','vietnam':'vn','malaysia':'my',
        'australia':'au','new zealand':'nz','pakistan':'pk',
        'albania':'al','kosovo':'xk','north macedonia':'mk','montenegro':'me',
        'bosnia':'ba','slovenia':'si','latvia':'lv','lithuania':'lt','estonia':'ee'
      };
      if (map[clean]) return map[clean];
      for (const [name, code] of Object.entries(map)) { if (clean.includes(name) || name.includes(clean)) return code; }
      return null;
    }

    const cssFlags = {
      'gb-eng': '<div class="flag-css flag-eng"><div class="flag-eng-h"></div><div class="flag-eng-v"></div></div>',
      'gb-sct': '<div class="flag-css flag-sct"><div class="flag-sct-x"></div></div>',
      'gb-wls': '<div class="flag-css flag-wls"><div class="flag-wls-top"></div><div class="flag-wls-bot"></div></div>',
    };

    function renderFlag(val) {
      const code = flagToCode(val);
      if (!code) return `<div class="s s-icon">🏳️</div>`;
      if (cssFlags[code]) return `<div class="s s-flag">${cssFlags[code]}</div>`;
      return `<div class="s s-flag"><img src="https://flagcdn.com/w160/${code}.png" onerror="this.parentElement.innerHTML='🏳️'" alt=""></div>`;
    }

    // ─── PARSE STICKERS ───
    const ordersWithStickers = allOrders.map(order => {
      const stickers = (order.line_items || []).filter(li =>
        (li.properties || []).some(p => p.name === '_sticker' && p.value === 'true')
      ).map(li => {
        const ps = li.properties || [];
        // Support both EN and ES property names
        const tipo = getProp(ps, 'Tipo', 'Type');
        const diseno = getProp(ps, 'Diseño', 'Design');
        const color = getProp(ps, 'Color', 'Colour');

        let type = 'text';
        if (/bandera|flag/i.test(tipo)) type = 'flag';
        else if (/n[uú]mero|number|fecha|date|dorsal/i.test(tipo)) type = 'number';
        else if (/icon/i.test(tipo)) type = 'icon';
        else if (/initial/i.test(tipo)) type = 'text';
        else if (/personal|custom/i.test(tipo)) type = 'custom';

        const isWhite = /blanco|white/i.test(color);
        const value = diseno || li.variant_title || '';
        const items = [];
        for (let i = 0; i < (li.quantity || 1); i++) items.push({ type, value, isWhite });
        return items;
      }).flat();
      return { order, stickers };
    }).filter(o => o.stickers.length > 0);

    function renderSticker(s) {
      if (s.type === 'flag') return renderFlag(s.value);
      if (s.type === 'icon') return `<div class="s s-icon">${s.value}</div>`;
      if (s.type === 'number') return `<div class="s"><span class="s-txt${s.isWhite ? ' wh' : ''}">${s.value}</span></div>`;
      if (s.type === 'custom') return `<div class="s"><span class="s-custom">✨ ${s.value.length > 25 ? s.value.substring(0, 25) + '…' : s.value}</span></div>`;
      return `<div class="s"><span class="s-txt${s.isWhite ? ' wh' : ''}">${s.value}</span></div>`;
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stickers — ${shop.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Teko:wght@700&family=Poppins:wght@400;600&display=swap" rel="stylesheet">
<style>
@page{margin:5mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Poppins',sans-serif;background:#fff;color:#1a1a1a;padding:16px}
.hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #eee}
.hdr h1{font-family:'Teko',sans-serif;font-size:20px}
.hdr-info{font-size:10px;color:#999}
.hdr-btns{display:flex;gap:6px}
.btn{font-family:'Poppins',sans-serif;font-size:11px;font-weight:600;padding:6px 12px;border-radius:5px;border:1px solid #ddd;background:#fff;color:#333;cursor:pointer;text-decoration:none}
.btn:hover{border-color:#999}
.btn-dk{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
.grid{display:flex;flex-wrap:wrap;gap:10px}
.sheet{border:1.5px solid #ccc;border-radius:5px;padding:8px;page-break-inside:avoid;break-inside:avoid}
.sheet-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.sheet-name{font-family:'Teko',sans-serif;font-size:13px;font-weight:700;color:#666}
.sheet-date{font-size:7px;color:#bbb}
.stickers{display:grid;grid-template-columns:repeat(4,auto);gap:4px;width:fit-content}
.s{border:1.5px solid #1a1a1a;border-radius:3px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.s-txt{font-family:'Teko',sans-serif;font-size:28px;font-weight:700;line-height:1.2;padding:6px 12px;white-space:nowrap;color:#1a1a1a}
.s-txt.wh{color:#fff;background:#1a1a1a}
.s-flag{width:48px;height:40px;padding:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
.s-flag img{width:100%;height:100%;object-fit:contain;display:block;padding:4px}
.s-icon{width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:22px}
.s-custom{font-family:'Poppins',sans-serif;font-size:7px;padding:4px 6px;max-width:90px;text-align:center;color:#888;font-style:italic}
.flag-css{width:100%;height:100%;position:relative}
.flag-eng{background:#fff}
.flag-eng-h{position:absolute;top:50%;left:0;right:0;height:20%;background:#CE1124;transform:translateY(-50%)}
.flag-eng-v{position:absolute;left:50%;top:0;bottom:0;width:20%;background:#CE1124;transform:translateX(-50%)}
.flag-sct{background:#005EB8;overflow:hidden}
.flag-sct-x{position:absolute;inset:0;background:linear-gradient(to top right,transparent 42%,#fff 42%,#fff 58%,transparent 58%),linear-gradient(to bottom right,transparent 42%,#fff 42%,#fff 58%,transparent 58%)}
.flag-wls{display:flex;flex-direction:column;height:100%}
.flag-wls-top{flex:1;background:#fff}
.flag-wls-bot{flex:1;background:#00AB39}
.ft{margin-top:14px;padding-top:8px;border-top:2px solid #eee;font-size:10px;color:#999;display:flex;justify-content:space-between}
@media print{.hdr-btns{display:none!important}body{padding:0}.sheet{border:1px solid #aaa}}
</style>
</head><body>
<div class="hdr">
  <div><h1>${shop.name} — Stickers</h1><div class="hdr-info">${ordersWithStickers.length} pedidos · ${ordersWithStickers.reduce((s, o) => s + o.stickers.length, 0)} stickers</div></div>
  <div class="hdr-btns">
    ${!showAll ? `<a class="btn" href="/api/print-all?token=${token}&shop=${shopId}&all=1">Incluir archivados</a>` : `<a class="btn" href="/api/print-all?token=${token}&shop=${shopId}">Solo abiertos</a>`}
    <button class="btn btn-dk" onclick="window.print()">🖨 Imprimir / PDF</button>
  </div>
</div>
<div class="grid">
${ordersWithStickers.map(({ order, stickers }) => `<div class="sheet">
  <div class="sheet-top"><span class="sheet-name">${order.name}</span><span class="sheet-date">${new Date(order.created_at).toLocaleDateString()}</span></div>
  <div class="stickers">${stickers.map(renderSticker).join('')}</div>
</div>`).join('')}
</div>
<div class="ft"><span>${ordersWithStickers.length} pedidos · ${ordersWithStickers.reduce((s, o) => s + o.stickers.length, 0)} stickers</span><span>${new Date().toLocaleString()}</span></div>
</body></html>`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error: ' + err.message);
  }
};
