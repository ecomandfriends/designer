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

    function getProp(ps, ...names) {
      for (const n of names) { const p = ps.find(p => p.name.toLowerCase() === n.toLowerCase()); if (p) return p.value; }
      return '';
    }

    function flagToCode(val) {
      if (!val) return null;
      const ris = [];
      for (const ch of val) { const cp = ch.codePointAt(0); if (cp >= 0x1F1E6 && cp <= 0x1F1FF) ris.push(cp); }
      if (ris.length === 2) return String.fromCharCode(ris[0] - 0x1F1E6 + 65, ris[1] - 0x1F1E6 + 65).toLowerCase();
      const tags = [];
      for (const ch of val) { const cp = ch.codePointAt(0); if (cp >= 0xE0061 && cp <= 0xE007A) tags.push(String.fromCharCode(cp - 0xE0061 + 97)); }
      if (tags.length >= 4) { const c = tags.join(''); return c.substring(0, 2) + '-' + c.substring(2); }
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
        'serbia':'rs','slovakia':'sk','hungary':'hu','bulgaria':'bg',
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

    const ordersData = allOrders.map(order => {
      const stickers = (order.line_items || []).filter(li =>
        (li.properties || []).some(p => p.name === '_sticker' && p.value === 'true')
      ).map(li => {
        const ps = li.properties || [];
        const tipo = getProp(ps, 'Tipo', 'Type');
        const diseno = getProp(ps, 'Diseño', 'Design');
        const color = getProp(ps, 'Color', 'Colour');
        let type = 'text';
        if (/bandera|flag/i.test(tipo)) type = 'flag';
        else if (/n[uú]mero|number|fecha|date|dorsal/i.test(tipo)) type = 'number';
        else if (/icon/i.test(tipo)) type = 'icon';
        else if (/personal|custom/i.test(tipo)) type = 'custom';
        const isWhite = /blanco|white/i.test(color);
        const value = diseno || li.variant_title || '';
        const flagCode = type === 'flag' ? flagToCode(value) : null;
        const items = [];
        for (let i = 0; i < (li.quantity || 1); i++) items.push({ type, value, isWhite, flagCode });
        return items;
      }).flat();
      return { name: order.name, date: order.created_at, stickers };
    }).filter(o => o.stickers.length > 0);

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stickers — ${shop.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Teko:wght@400;700&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.3.2/css/flag-icons.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Poppins',sans-serif;background:#e8e8e8;color:#1a1a1a}

.toolbar{position:sticky;top:0;z-index:100;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}
.toolbar-left{display:flex;align-items:center;gap:10px}
.toolbar-title{font-family:'Teko',sans-serif;font-size:18px;font-weight:700}
.toolbar-info{font-size:10px;color:#999}
.toolbar-right{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
.tbtn{font-family:'Poppins',sans-serif;font-size:10px;font-weight:600;padding:5px 12px;border-radius:4px;border:1px solid #ddd;background:#fff;color:#333;cursor:pointer;text-decoration:none;white-space:nowrap}
.tbtn:hover{border-color:#999}
.tbtn-dk{background:#1a1a1a;color:#fff;border-color:#1a1a1a}

.panel{background:#fff;border-bottom:1px solid #ddd;padding:8px 16px;display:none;flex-wrap:wrap;gap:12px;align-items:center}
.panel.open{display:flex}
.ctrl{display:flex;flex-direction:column;gap:2px}
.ctrl label{font-size:8px;text-transform:uppercase;letter-spacing:.8px;color:#999;font-weight:600}
.ctrl input[type=range]{width:100px;accent-color:#1a1a1a}
.ctrl-val{font-size:9px;color:#666;font-family:'Teko',sans-serif;font-weight:700}

.canvas-area{padding:20px;display:flex;justify-content:center}
.canvas-wrap{background:var(--preview-bg,repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 50% / 14px 14px);padding:12px;border-radius:8px;border:1px solid #ccc;display:inline-block}

#render-area{display:flex;flex-wrap:wrap;gap:var(--sheet-gap,10px);align-items:flex-start}

.sheet{border:var(--sheet-border,1.5px) solid #1a1a1a;border-radius:4px;padding:6px;display:inline-block}
.sheet-label{margin-bottom:4px;font-family:'Poppins',sans-serif;font-size:var(--label-size,11px);font-weight:400;color:#1a1a1a;display:flex;justify-content:space-between;gap:12px}
.sheet-date{font-size:7px;color:#999}

.stickers{display:grid;grid-template-columns:repeat(var(--cols,4),auto);gap:var(--sticker-gap,4px)}

.s{border:var(--border-w,1.5px) solid var(--border-color,#1a1a1a);border-radius:var(--border-r,2px);display:flex;align-items:center;justify-content:center;overflow:hidden}

.s-txt{font-family:'Teko',sans-serif;font-size:var(--font-size,28px);font-weight:700;line-height:1.15;padding:var(--txt-pad-v,5px) var(--txt-pad-h,10px);white-space:nowrap}
.s-txt.black{color:#1a1a1a}
.s-txt.white{color:#ffffff}

.s-flag{width:var(--flag-w,52px);height:var(--flag-h,36px);padding:0;display:flex;align-items:center;justify-content:center}
.s-flag .fi{font-size:var(--flag-icon,24px);line-height:1}

.s-icon{width:var(--flag-w,52px);height:var(--flag-h,36px);display:flex;align-items:center;justify-content:center;font-size:calc(var(--flag-h,36px) * 0.55)}

.s-custom{font-family:'Poppins',sans-serif;font-size:7px;padding:4px 6px;max-width:80px;text-align:center;color:#888;font-style:italic}

@media print{.toolbar,.panel{display:none!important}.canvas-area{padding:0}.canvas-wrap{background:none!important;border:none;padding:0}}
</style>
</head><body>

<div class="toolbar">
  <div class="toolbar-left">
    <span class="toolbar-title">⬡ ${shop.name}</span>
    <span class="toolbar-info">${ordersData.length} pedidos · ${ordersData.reduce((s,o)=>s+o.stickers.length,0)} stickers</span>
  </div>
  <div class="toolbar-right">
    <button class="tbtn" id="togglePanel">⚙ Editar</button>
    ${!showAll?`<a class="tbtn" href="/api/print-all?token=${token}&shop=${shopId}&all=1">+ Archivados</a>`:`<a class="tbtn" href="/api/print-all?token=${token}&shop=${shopId}">Solo abiertos</a>`}
    <button class="tbtn" id="dlPng">⬇ PNG</button>
    <button class="tbtn" id="dlSvg">⬇ SVG</button>
    <button class="tbtn tbtn-dk" onclick="window.print()">🖨 Imprimir</button>
  </div>
</div>

<div class="panel" id="panel">
  <div class="ctrl"><label>Font size</label><input type="range" id="c-font" min="16" max="48" value="28"><span class="ctrl-val" id="v-font">28</span></div>
  <div class="ctrl"><label>Sticker border</label><input type="range" id="c-border" min="0" max="5" value="1.5" step="0.5"><span class="ctrl-val" id="v-border">1.5</span></div>
  <div class="ctrl"><label>Border radius</label><input type="range" id="c-radius" min="0" max="10" value="2"><span class="ctrl-val" id="v-radius">2</span></div>
  <div class="ctrl"><label>Sheet border</label><input type="range" id="c-sborder" min="0" max="4" value="1.5" step="0.5"><span class="ctrl-val" id="v-sborder">1.5</span></div>
  <div class="ctrl"><label>Flag width</label><input type="range" id="c-flagw" min="30" max="80" value="52"><span class="ctrl-val" id="v-flagw">52</span></div>
  <div class="ctrl"><label>Flag height</label><input type="range" id="c-flagh" min="20" max="60" value="36"><span class="ctrl-val" id="v-flagh">36</span></div>
  <div class="ctrl"><label>Flag icon</label><input type="range" id="c-flagi" min="14" max="40" value="24"><span class="ctrl-val" id="v-flagi">24</span></div>
  <div class="ctrl"><label>Sticker gap</label><input type="range" id="c-gap" min="0" max="12" value="4"><span class="ctrl-val" id="v-gap">4</span></div>
  <div class="ctrl"><label>Sheet gap</label><input type="range" id="c-sgap" min="4" max="30" value="10"><span class="ctrl-val" id="v-sgap">10</span></div>
  <div class="ctrl"><label>Text pad H</label><input type="range" id="c-padh" min="4" max="24" value="10"><span class="ctrl-val" id="v-padh">10</span></div>
  <div class="ctrl"><label>Text pad V</label><input type="range" id="c-padv" min="2" max="16" value="5"><span class="ctrl-val" id="v-padv">5</span></div>
  <div class="ctrl"><label>Cols</label><input type="range" id="c-cols" min="2" max="8" value="4"><span class="ctrl-val" id="v-cols">4</span></div>
  <div class="ctrl"><label>Label size</label><input type="range" id="c-label" min="8" max="18" value="11"><span class="ctrl-val" id="v-label">11</span></div>
  <div class="ctrl"><label>Border color</label><input type="color" id="c-bcolor" value="#1a1a1a"></div>
  <div class="ctrl"><label>Preview bg</label>
    <select id="c-bg">
      <option value="check">Transparente</option>
      <option value="#ffffff">Blanco</option>
      <option value="#4a90d9">Azul</option>
      <option value="#1a1a1a">Negro</option>
      <option value="#e8e8e8">Gris claro</option>
      <option value="#f5c542">Amarillo</option>
    </select>
  </div>
</div>

<div class="canvas-area">
  <div class="canvas-wrap" id="canvas-wrap">
    <div id="render-area">
    ${ordersData.map(order => `<div class="sheet">
      <div class="sheet-label"><span>${order.name}</span><span class="sheet-date">${new Date(order.date).toLocaleDateString()}</span></div>
      <div class="stickers">${order.stickers.map(s => {
        if (s.type === 'flag') {
          if (s.flagCode) return `<div class="s s-flag"><span class="fi fi-${s.flagCode}"></span></div>`;
          return `<div class="s s-icon">🏳️</div>`;
        }
        if (s.type === 'icon') return `<div class="s s-icon">${s.value}</div>`;
        if (s.type === 'custom') return `<div class="s"><span class="s-custom">✨ ${s.value.length > 25 ? s.value.substring(0, 25) + '…' : s.value}</span></div>`;
        return `<div class="s"><span class="s-txt ${s.isWhite ? 'white' : 'black'}">${s.value}</span></div>`;
      }).join('')}</div>
    </div>`).join('')}
    </div>
  </div>
</div>

<script>
const area=document.getElementById('render-area');
const wrap=document.getElementById('canvas-wrap');

const ctrls=[
  {id:'c-font',css:'--font-size',u:'px',v:'v-font'},
  {id:'c-border',css:'--border-w',u:'px',v:'v-border'},
  {id:'c-radius',css:'--border-r',u:'px',v:'v-radius'},
  {id:'c-sborder',css:'--sheet-border',u:'px',v:'v-sborder'},
  {id:'c-flagw',css:'--flag-w',u:'px',v:'v-flagw'},
  {id:'c-flagh',css:'--flag-h',u:'px',v:'v-flagh'},
  {id:'c-flagi',css:'--flag-icon',u:'px',v:'v-flagi'},
  {id:'c-gap',css:'--sticker-gap',u:'px',v:'v-gap'},
  {id:'c-sgap',css:'--sheet-gap',u:'px',v:'v-sgap'},
  {id:'c-padh',css:'--txt-pad-h',u:'px',v:'v-padh'},
  {id:'c-padv',css:'--txt-pad-v',u:'px',v:'v-padv'},
  {id:'c-cols',css:'--cols',u:'',v:'v-cols'},
  {id:'c-label',css:'--label-size',u:'px',v:'v-label'},
];
ctrls.forEach(c=>{
  const el=document.getElementById(c.id);if(!el)return;
  el.addEventListener('input',()=>{
    area.style.setProperty(c.css,el.value+c.u);
    document.getElementById(c.v).textContent=el.value;
  });
});
document.getElementById('c-bcolor')?.addEventListener('input',e=>{area.style.setProperty('--border-color',e.target.value)});
document.getElementById('c-bg')?.addEventListener('change',e=>{
  const v=e.target.value;
  wrap.style.background=v==='check'?'repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 50% / 14px 14px':v;
});
document.getElementById('togglePanel')?.addEventListener('click',()=>{document.getElementById('panel').classList.toggle('open')});

document.getElementById('dlPng')?.addEventListener('click',async()=>{
  const btn=document.getElementById('dlPng');btn.textContent='...';
  try{
    const m=await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm');
    const canvas=await m.default(area,{backgroundColor:null,scale:3,useCORS:true,allowTaint:true});
    const a=document.createElement('a');a.download='stickers.png';a.href=canvas.toDataURL('image/png');a.click();
  }catch(e){console.error(e);alert('Error. Use Print > Save as PDF.')}
  btn.textContent='⬇ PNG';
});

document.getElementById('dlSvg')?.addEventListener('click',()=>{
  const css=[...document.styleSheets].map(s=>{try{return[...s.cssRules].map(r=>r.cssText).join('')}catch{return''}}).join('');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+area.scrollWidth+'" height="'+area.scrollHeight+'"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>'+css+'</style>'+area.outerHTML+'</div></foreignObject></svg>';
  const a=document.createElement('a');a.download='stickers.svg';a.href=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));a.click();
});
</script>
</body></html>`);
  } catch(err){console.error(err);res.status(500).send('Error: '+err.message)}
};
