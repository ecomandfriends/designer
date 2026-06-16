const { getShops, authCheck } = require('./_helpers');

module.exports = async (req, res) => {
  const token = req.headers['x-auth-token'] || req.query.token;
  const auth = authCheck(token);
  if (!auth) return res.status(401).send('Add ?token=YOUR_PASSWORD');
  const shops = getShops();
  const shopId = req.query.shop;
  if (!shopId) {
    const links = shops.map(s => `<a href="/api/print-all?token=${token}&shop=${s.id}">${s.name}</a>`).join(' | ');
    return res.setHeader('Content-Type', 'text/html').send(`<h2>Select shop:</h2>${links}<br><br><a href="/api/print-all?token=${token}&shop=all"><strong>ALL SHOPS</strong></a>`);
  }

  const showAll = req.query.all === '1';
  const isAllShops = shopId === 'all';
  const targetShops = isAllShops ? shops : [shops.find(s => s.id === shopId)].filter(Boolean);
  if (!targetShops.length) return res.status(404).send('Shop not found');

  try {
    let allOrdersData = [];

    for (const shop of targetShops) {
      let shopOrders = [];
      let url = `https://${shop.shop}/admin/api/2024-01/orders.json?status=any&limit=250`;
      if (!showAll) url += '&fulfillment_status=unfulfilled';
      while (url) {
        const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': shop.token, 'Content-Type': 'application/json' } });
        if (!r.ok) break;
        const d = await r.json();
        shopOrders = shopOrders.concat(d.orders || []);
        if (shopOrders.length >= 500) break;
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
          'spain':'es','españa':'es','italy':'it','england':'gb-eng','scotland':'gb-sct',
          'wales':'gb-wls','uk':'gb','united kingdom':'gb','great britain':'gb','germany':'de',
          'france':'fr','portugal':'pt','belgium':'be','netherlands':'nl','poland':'pl','croatia':'hr',
          'austria':'at','switzerland':'ch','sweden':'se','norway':'no','denmark':'dk','finland':'fi',
          'greece':'gr','ireland':'ie','czech republic':'cz','romania':'ro','ukraine':'ua','russia':'ru',
          'serbia':'rs','slovakia':'sk','hungary':'hu','bulgaria':'bg',
          'usa':'us','united states':'us','brazil':'br','brasil':'br',
          'argentina':'ar','mexico':'mx','colombia':'co','chile':'cl','peru':'pe',
          'venezuela':'ve','ecuador':'ec','uruguay':'uy','paraguay':'py','bolivia':'bo',
          'canada':'ca','costa rica':'cr','panama':'pa','cuba':'cu','jamaica':'jm',
          'morocco':'ma','senegal':'sn','nigeria':'ng','south africa':'za',
          'egypt':'eg','algeria':'dz','cameroon':'cm','ghana':'gh','kenya':'ke','angola':'ao',
          'japan':'jp','south korea':'kr','china':'cn','india':'in',
          'turkey':'tr','saudi arabia':'sa','uae':'ae','israel':'il','indonesia':'id',
          'philippines':'ph','thailand':'th','vietnam':'vn','malaysia':'my',
          'australia':'au','new zealand':'nz','pakistan':'pk',
          'albania':'al','bosnia':'ba','slovenia':'si','latvia':'lv','lithuania':'lt','estonia':'ee'
        };
        if (map[clean]) return map[clean];
        for (const [name, code] of Object.entries(map)) { if (clean.includes(name) || name.includes(clean)) return code; }
        return null;
      }

      shopOrders.forEach(order => {
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

        if (stickers.length > 0) {
          const hasPrintedTag = (order.tags || '').split(',').map(t => t.trim()).includes('printed');
          allOrdersData.push({
            id: order.id,
            name: order.name,
            date: order.created_at,
            fulfillment: order.fulfillment_status || 'unfulfilled',
            shopId: shop.id,
            shopName: shop.name,
            printed: hasPrintedTag,
            stickers
          });
        }
      });
    }

    const title = isAllShops ? 'All Shops' : targetShops[0].name;

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stickers — ${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Teko:wght@400;700&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Poppins',sans-serif;background:#e8e8e8;color:#1a1a1a;height:100vh;overflow:hidden;display:flex;flex-direction:column}
.toolbar{background:#fff;border-bottom:1px solid #ddd;padding:8px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;flex-shrink:0}
.toolbar-left{display:flex;align-items:center;gap:10px}
.toolbar-title{font-family:'Teko',sans-serif;font-size:18px;font-weight:700}
.toolbar-info{font-size:10px;color:#999}
.toolbar-right{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
.tbtn{font-family:'Poppins',sans-serif;font-size:10px;font-weight:600;padding:5px 12px;border-radius:4px;border:1px solid #ddd;background:#fff;color:#333;cursor:pointer;text-decoration:none;white-space:nowrap}
.tbtn:hover{border-color:#999}
.tbtn-dk{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
.tbtn-green{background:#16a34a;color:#fff;border-color:#16a34a}
.tbtn-green:hover{background:#15803d}
.tbtn:disabled{opacity:.5;cursor:not-allowed}
.panel{background:#fff;border-bottom:1px solid #ddd;padding:8px 16px;display:none;flex-wrap:wrap;gap:12px;align-items:center;flex-shrink:0}
.panel.open{display:flex}
.ctrl{display:flex;flex-direction:column;gap:2px}
.ctrl label{font-size:8px;text-transform:uppercase;letter-spacing:.8px;color:#999;font-weight:600}
.ctrl input[type=range]{width:90px;accent-color:#1a1a1a}
.ctrl-val{font-size:9px;color:#666;font-family:'Teko',sans-serif;font-weight:700}
.main{flex:1;display:flex;overflow:hidden}
.sidebar{width:250px;background:#fff;border-right:1px solid #ddd;display:flex;flex-direction:column;flex-shrink:0}
.sidebar-head{padding:8px 12px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.sidebar-title{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;font-weight:600}
.sidebar-btns{display:flex;gap:4px}
.sidebar-btn{font-size:9px;padding:3px 8px;border-radius:3px;border:1px solid #ddd;background:#fff;color:#666;cursor:pointer}
.sidebar-btn:hover{border-color:#999}
.sidebar-filter{padding:6px 12px;border-bottom:1px solid #eee;display:flex;gap:4px;flex-shrink:0}
.sidebar-fbtn{font-size:8px;padding:2px 7px;border-radius:3px;border:1px solid #ddd;background:#fff;color:#888;cursor:pointer}
.sidebar-fbtn.active{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
.sidebar-list{flex:1;overflow-y:auto}
.sidebar-item{display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid #f5f5f5;cursor:pointer;transition:background .1s}
.sidebar-item:hover{background:#fafafa}
.sidebar-item.selected{background:#f0f0f0}
.sidebar-chk{width:16px;height:16px;border-radius:3px;border:2px solid #ddd;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;font-weight:700;transition:all .15s}
.sidebar-chk.on{border-color:#1a1a1a;background:#1a1a1a;color:#fff}
.sidebar-info{flex:1;min-width:0}
.sidebar-name{font-family:'Teko',sans-serif;font-size:13px;font-weight:700;line-height:1.2;display:flex;align-items:center;gap:4px}
.sidebar-shop{font-size:7px;padding:1px 4px;border-radius:2px;background:#e8e8e8;color:#888;font-weight:500;font-family:'Poppins',sans-serif}
.sidebar-meta{font-size:8px;color:#999;display:flex;gap:6px;align-items:center}
.sidebar-badge{font-size:7px;padding:1px 5px;border-radius:3px;font-weight:600;text-transform:uppercase}
.badge-unfulfilled{background:#fff3cd;color:#856404}
.badge-fulfilled{background:#d4edda;color:#155724}
.badge-printed{background:#e0e7ff;color:#3730a3}
.sidebar-count{font-size:9px;color:#bbb;flex-shrink:0}
.canvas-area{flex:1;overflow:auto;padding:20px;display:flex;justify-content:center;align-items:flex-start}
.canvas-wrap{background:var(--preview-bg,repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 50% / 14px 14px);padding:12px;border-radius:8px;border:1px solid #ccc;display:inline-block;min-height:100px}
#render-area{display:flex;flex-wrap:wrap;gap:var(--sheet-gap,10px);align-items:flex-start}
.sheet{border:var(--sheet-border,1.5px) solid #1a1a1a;border-radius:4px;padding:6px;display:inline-block}
.sheet-label{margin-bottom:4px;font-family:'Poppins',sans-serif;font-size:var(--label-size,11px);font-weight:400;color:#1a1a1a;display:flex;justify-content:space-between;gap:8px}
.sheet-date{font-size:7px;color:#999}
.stickers{display:grid;grid-template-columns:repeat(var(--cols,4),auto);gap:var(--sticker-gap,4px)}
.s{border:var(--border-w,0px) solid var(--border-color,#1a1a1a);border-radius:var(--border-r,2px);display:flex;align-items:center;justify-content:center;overflow:hidden}
.s-txt{font-family:'Teko',sans-serif;font-size:var(--font-size,28px);font-weight:700;line-height:var(--line-h,1.15);padding:var(--txt-pad-v,5px) var(--txt-pad-h,10px);white-space:nowrap}
.s-txt.black{color:#1a1a1a}.s-txt.white{color:#fff}
.s-flag{width:var(--flag-w,52px);height:var(--flag-h,36px);padding:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
.s-flag img{width:calc(100% - 8px);height:calc(100% - 8px);object-fit:contain;display:block;margin:auto}
.s-icon{width:var(--flag-w,52px);height:var(--flag-h,36px);display:flex;align-items:center;justify-content:center;font-size:calc(var(--flag-h,36px)*0.55)}
.s-custom{font-family:'Poppins',sans-serif;font-size:7px;padding:4px 6px;max-width:80px;text-align:center;color:#888;font-style:italic}
.css-flag{width:calc(100% - 8px);height:calc(100% - 8px);position:relative;margin:auto;border-radius:1px}
.eng{background:#fff}.eng-h{position:absolute;top:50%;left:0;right:0;height:22%;background:#CE1124;transform:translateY(-50%)}.eng-v{position:absolute;left:50%;top:0;bottom:0;width:18%;background:#CE1124;transform:translateX(-50%)}
.sct{background:linear-gradient(to top left,#005EB8 43%,#fff 43%,#fff 57%,#005EB8 57%),linear-gradient(to top right,#005EB8 43%,#fff 43%,#fff 57%,#005EB8 57%);background-size:100% 100%}
.wls{display:flex;flex-direction:column;height:100%}.wls-t{flex:1;background:#fff}.wls-b{flex:1;background:#00AB39}
.empty-msg{padding:40px;color:#ccc;font-size:13px;text-align:center}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:10px 20px;border-radius:8px;font-size:12px;font-weight:600;z-index:999;display:none}
.toast.show{display:block;animation:fadeIn .3s ease}
@keyframes fadeIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@media print{.toolbar,.panel,.sidebar,.toast{display:none!important}.main{display:block}.canvas-area{padding:0}.canvas-wrap{background:none!important;border:none;padding:0}}
</style>
</head><body>
<div class="toolbar">
  <div class="toolbar-left">
    <span class="toolbar-title">⬡ ${title}</span>
    <span class="toolbar-info" id="sel-info"></span>
  </div>
  <div class="toolbar-right">
    <button class="tbtn" id="togglePanel">⚙ Editar</button>
    ${!showAll?`<a class="tbtn" href="/api/print-all?token=${token}&shop=${shopId}&all=1">+ Archivados</a>`:`<a class="tbtn" href="/api/print-all?token=${token}&shop=${shopId}">Solo abiertos</a>`}
    ${!isAllShops?`<a class="tbtn" href="/api/print-all?token=${token}&shop=all${showAll?'&all=1':''}">Todas las tiendas</a>`:''}
    <button class="tbtn tbtn-green" id="tagBtn">🏷 Marcar impresos</button>
    <button class="tbtn" id="dlPng">⬇ PNG (58cm)</button>
    <button class="tbtn" id="dlSvg">⬇ SVG</button>
    <button class="tbtn tbtn-dk" onclick="window.print()">🖨 Imprimir</button>
  </div>
</div>
<div class="panel" id="panel">
  <div class="ctrl"><label>Font</label><input type="range" id="c-font" min="16" max="48" value="28"><span class="ctrl-val" id="v-font">28</span></div>
  <div class="ctrl"><label>Line H</label><input type="range" id="c-lh" min="0.8" max="1.8" value="1.15" step="0.05"><span class="ctrl-val" id="v-lh">1.15</span></div>
  <div class="ctrl"><label>Border</label><input type="range" id="c-border" min="0" max="5" value="0" step="0.5"><span class="ctrl-val" id="v-border">0</span></div>
  <div class="ctrl"><label>Radius</label><input type="range" id="c-radius" min="0" max="10" value="2"><span class="ctrl-val" id="v-radius">2</span></div>
  <div class="ctrl"><label>Sheet</label><input type="range" id="c-sborder" min="0" max="4" value="1.5" step="0.5"><span class="ctrl-val" id="v-sborder">1.5</span></div>
  <div class="ctrl"><label>Flag W</label><input type="range" id="c-flagw" min="30" max="80" value="52"><span class="ctrl-val" id="v-flagw">52</span></div>
  <div class="ctrl"><label>Flag H</label><input type="range" id="c-flagh" min="20" max="60" value="36"><span class="ctrl-val" id="v-flagh">36</span></div>
  <div class="ctrl"><label>Gap</label><input type="range" id="c-gap" min="0" max="12" value="4"><span class="ctrl-val" id="v-gap">4</span></div>
  <div class="ctrl"><label>Sheet gap</label><input type="range" id="c-sgap" min="4" max="30" value="10"><span class="ctrl-val" id="v-sgap">10</span></div>
  <div class="ctrl"><label>Pad H</label><input type="range" id="c-padh" min="4" max="24" value="10"><span class="ctrl-val" id="v-padh">10</span></div>
  <div class="ctrl"><label>Pad V</label><input type="range" id="c-padv" min="2" max="16" value="5"><span class="ctrl-val" id="v-padv">5</span></div>
  <div class="ctrl"><label>Cols</label><input type="range" id="c-cols" min="2" max="8" value="4"><span class="ctrl-val" id="v-cols">4</span></div>
  <div class="ctrl"><label>Label</label><input type="range" id="c-label" min="8" max="18" value="11"><span class="ctrl-val" id="v-label">11</span></div>
  <div class="ctrl"><label>Border color</label><input type="color" id="c-bcolor" value="#1a1a1a"></div>
  <div class="ctrl"><label>Preview bg</label><select id="c-bg"><option value="check">Transparente</option><option value="#ffffff">Blanco</option><option value="#4a90d9">Azul</option><option value="#1a1a1a">Negro</option><option value="#e8e8e8">Gris</option></select></div>
</div>

<div class="main">
  <div class="sidebar">
    <div class="sidebar-head">
      <span class="sidebar-title">Pedidos (${allOrdersData.length})</span>
      <div class="sidebar-btns">
        <button class="sidebar-btn" id="selAll">Todo</button>
        <button class="sidebar-btn" id="selNone">Nada</button>
      </div>
    </div>
    <div class="sidebar-filter">
      <button class="sidebar-fbtn active" data-filter="all">Todos</button>
      <button class="sidebar-fbtn" data-filter="not-printed">Sin imprimir</button>
      <button class="sidebar-fbtn" data-filter="printed">Impresos</button>
      ${isAllShops ? targetShops.map(s => `<button class="sidebar-fbtn" data-filter="shop-${s.id}">${s.name.substring(0,8)}</button>`).join('') : ''}
    </div>
    <div class="sidebar-list" id="sidebar-list"></div>
  </div>
  <div class="canvas-area">
    <div class="canvas-wrap" id="canvas-wrap">
      <div id="render-area"></div>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
const DATA=${JSON.stringify(allOrdersData)};
const TOKEN='${token}';
const selected=new Set(DATA.map((_,i)=>i));
let filter='all';
const area=document.getElementById('render-area');
const wrap=document.getElementById('canvas-wrap');
const list=document.getElementById('sidebar-list');
const PRINT_W_PX=Math.round(580*300/25.4);

function toast(msg,ms=3000){const t=document.getElementById('toast');t.textContent=msg;t.className='toast show';setTimeout(()=>{t.className='toast'},ms)}

function flagHTML(code){
  if(!code)return'<div class="s s-icon">🏳️</div>';
  if(code==='gb-eng')return'<div class="s s-flag"><div class="css-flag eng"><div class="eng-h"></div><div class="eng-v"></div></div></div>';
  if(code==='gb-sct')return'<div class="s s-flag"><div class="css-flag sct"></div></div>';
  if(code==='gb-wls')return'<div class="s s-flag"><div class="css-flag wls"><div class="wls-t"></div><div class="wls-b"></div></div></div>';
  return'<div class="s s-flag"><img src="https://flagcdn.com/w320/'+code+'.png" crossorigin="anonymous" alt=""></div>';
}
function stickerHTML(s){
  if(s.type==='flag')return flagHTML(s.flagCode);
  if(s.type==='icon')return'<div class="s s-icon">'+s.value+'</div>';
  if(s.type==='custom')return'<div class="s"><span class="s-custom">✨ '+(s.value.length>25?s.value.substring(0,25)+'…':s.value)+'</span></div>';
  return'<div class="s"><span class="s-txt '+(s.isWhite?'white':'black')+'">'+s.value+'</span></div>';
}

function filteredIndices(){
  return DATA.map((_,i)=>i).filter(i=>{
    const o=DATA[i];
    if(filter==='not-printed'&&o.printed)return false;
    if(filter==='printed'&&!o.printed)return false;
    if(filter.startsWith('shop-')&&o.shopId!==filter.replace('shop-',''))return false;
    return true;
  });
}

function renderSidebar(){
  const visible=filteredIndices();
  list.innerHTML=visible.map(i=>{
    const o=DATA[i];const on=selected.has(i);
    return'<div class="sidebar-item'+(on?' selected':'')+'" data-i="'+i+'">'+
      '<div class="sidebar-chk'+(on?' on':'')+'">'+(on?'✓':'')+'</div>'+
      '<div class="sidebar-info">'+
        '<div class="sidebar-name">'+o.name+(DATA.some(d=>d.shopId!==DATA[0]?.shopId)?'<span class="sidebar-shop">'+o.shopName.substring(0,6)+'</span>':'')+'</div>'+
        '<div class="sidebar-meta">'+
          '<span>'+new Date(o.date).toLocaleDateString()+'</span>'+
          (o.printed?'<span class="sidebar-badge badge-printed">Impreso</span>':
           o.fulfillment==='fulfilled'?'<span class="sidebar-badge badge-fulfilled">Enviado</span>':
           '<span class="sidebar-badge badge-unfulfilled">Pendiente</span>')+
        '</div>'+
      '</div>'+
      '<span class="sidebar-count">'+o.stickers.length+'</span>'+
    '</div>';
  }).join('');
  list.querySelectorAll('.sidebar-item').forEach(el=>{
    el.addEventListener('click',()=>{const i=+el.dataset.i;selected.has(i)?selected.delete(i):selected.add(i);renderSidebar();renderSheets()});
  });
}

function renderSheets(){
  const sel=[...selected].sort().filter(i=>filteredIndices().includes(i));
  document.getElementById('sel-info').textContent=sel.length+' seleccionados · '+sel.reduce((s,i)=>s+DATA[i].stickers.length,0)+' stickers';
  if(!sel.length){area.innerHTML='<div class="empty-msg">Selecciona pedidos del panel izquierdo</div>';return}
  area.innerHTML=sel.map(i=>{
    const o=DATA[i];
    return'<div class="sheet"><div class="sheet-label"><span>'+o.name+'</span><span class="sheet-date">'+new Date(o.date).toLocaleDateString()+'</span></div><div class="stickers">'+o.stickers.map(stickerHTML).join('')+'</div></div>';
  }).join('');
}

// Filter buttons
document.querySelectorAll('.sidebar-fbtn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.sidebar-fbtn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    filter=btn.dataset.filter;
    renderSidebar();renderSheets();
  });
});

// Controls
const ctrls=[
  {id:'c-font',css:'--font-size',u:'px',v:'v-font'},{id:'c-lh',css:'--line-h',u:'',v:'v-lh'},
  {id:'c-border',css:'--border-w',u:'px',v:'v-border'},{id:'c-radius',css:'--border-r',u:'px',v:'v-radius'},
  {id:'c-sborder',css:'--sheet-border',u:'px',v:'v-sborder'},
  {id:'c-flagw',css:'--flag-w',u:'px',v:'v-flagw'},{id:'c-flagh',css:'--flag-h',u:'px',v:'v-flagh'},
  {id:'c-gap',css:'--sticker-gap',u:'px',v:'v-gap'},{id:'c-sgap',css:'--sheet-gap',u:'px',v:'v-sgap'},
  {id:'c-padh',css:'--txt-pad-h',u:'px',v:'v-padh'},{id:'c-padv',css:'--txt-pad-v',u:'px',v:'v-padv'},
  {id:'c-cols',css:'--cols',u:'',v:'v-cols'},{id:'c-label',css:'--label-size',u:'px',v:'v-label'},
];
ctrls.forEach(c=>{const el=document.getElementById(c.id);if(!el)return;el.addEventListener('input',()=>{area.style.setProperty(c.css,el.value+c.u);document.getElementById(c.v).textContent=el.value})});
document.getElementById('c-bcolor')?.addEventListener('input',e=>{area.style.setProperty('--border-color',e.target.value)});
document.getElementById('c-bg')?.addEventListener('change',e=>{wrap.style.background=e.target.value==='check'?'repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 50% / 14px 14px':e.target.value});
document.getElementById('togglePanel')?.addEventListener('click',()=>{document.getElementById('panel').classList.toggle('open')});
document.getElementById('selAll')?.addEventListener('click',()=>{filteredIndices().forEach(i=>selected.add(i));renderSidebar();renderSheets()});
document.getElementById('selNone')?.addEventListener('click',()=>{selected.clear();renderSidebar();renderSheets()});

// Tag as printed
document.getElementById('tagBtn')?.addEventListener('click',async()=>{
  const sel=[...selected].filter(i=>!DATA[i].printed);
  if(!sel.length){toast('No hay pedidos nuevos para marcar');return}
  const btn=document.getElementById('tagBtn');btn.textContent='Marcando...';btn.disabled=true;
  // Group by shop
  const byShop={};
  sel.forEach(i=>{const o=DATA[i];if(!byShop[o.shopId])byShop[o.shopId]=[];byShop[o.shopId].push(o.id)});
  let ok=0,fail=0;
  for(const[sid,ids]of Object.entries(byShop)){
    try{
      const r=await fetch('/api/tag-orders?token='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json','X-Auth-Token':TOKEN},body:JSON.stringify({orderIds:ids,shopId:sid,tag:'printed'})});
      if(r.ok){const d=await r.json();ok+=d.results.success.length;fail+=d.results.failed.length;d.results.success.forEach(id=>{const idx=DATA.findIndex(o=>o.id===id);if(idx>=0)DATA[idx].printed=true})}
      else fail+=ids.length;
    }catch{fail+=ids.length}
  }
  toast(ok+' pedidos marcados como impresos'+(fail?' ('+fail+' fallaron)':''));
  btn.textContent='🏷 Marcar impresos';btn.disabled=false;
  renderSidebar();renderSheets();
});

function waitImages(){
  return Promise.all([...area.querySelectorAll('img')].map(img=>{
    if(img.complete&&img.naturalWidth>0)return Promise.resolve();
    return new Promise(r=>{img.onload=r;img.onerror=()=>{img.style.display='none';r()}});
  }));
}
document.getElementById('dlPng')?.addEventListener('click',async()=>{
  const btn=document.getElementById('dlPng');btn.textContent='Espera...';btn.disabled=true;
  try{await waitImages();const m=await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm');const scale=Math.ceil(PRINT_W_PX/area.scrollWidth);const canvas=await m.default(area,{backgroundColor:null,scale,useCORS:true,allowTaint:false,logging:false,imageTimeout:30000});const final=document.createElement('canvas');final.width=PRINT_W_PX;final.height=Math.round(canvas.height*(PRINT_W_PX/canvas.width));const ctx=final.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(canvas,0,0,final.width,final.height);const a=document.createElement('a');a.download='stickers_58cm.png';a.href=final.toDataURL('image/png');a.click()}catch(e){console.error(e);alert('Error: '+e.message)}
  btn.textContent='⬇ PNG (58cm)';btn.disabled=false;
});
document.getElementById('dlSvg')?.addEventListener('click',()=>{
  const css=[...document.styleSheets].map(s=>{try{return[...s.cssRules].map(r=>r.cssText).join('')}catch{return''}}).join('');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+area.scrollWidth+'" height="'+area.scrollHeight+'"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>'+css+'</style>'+area.outerHTML+'</div></foreignObject></svg>';
  const a=document.createElement('a');a.download='stickers.svg';a.href=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));a.click();
});

renderSidebar();renderSheets();
</script>
</body></html>`);
  } catch(err){console.error(err);res.status(500).send('Error: '+err.message)}
};
