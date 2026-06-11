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
        const items = [];
        for (let i = 0; i < (li.quantity || 1); i++) items.push({ type, value: diseno || li.variant_title || '', isWhite });
        return items;
      }).flat();
      return { name: order.name, date: order.created_at, stickers };
    }).filter(o => o.stickers.length > 0);

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stickers — ${shop.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Teko:wght@700&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Poppins',sans-serif;background:#f0f0f0;color:#1a1a1a}

.toolbar{position:sticky;top:0;z-index:100;background:#fff;border-bottom:1px solid #ddd;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.toolbar-left{display:flex;align-items:center;gap:12px}
.toolbar-title{font-family:'Teko',sans-serif;font-size:18px;font-weight:700}
.toolbar-info{font-size:10px;color:#999}
.toolbar-right{display:flex;gap:6px;align-items:center}
.tbtn{font-family:'Poppins',sans-serif;font-size:11px;font-weight:600;padding:6px 14px;border-radius:5px;border:1px solid #ddd;background:#fff;color:#333;cursor:pointer;text-decoration:none}
.tbtn:hover{border-color:#999}
.tbtn-dk{background:#1a1a1a;color:#fff;border-color:#1a1a1a}

/* CONTROL PANEL */
.panel{background:#fff;border-bottom:1px solid #ddd;padding:10px 20px;display:none;flex-wrap:wrap;gap:16px;align-items:center}
.panel.open{display:flex}
.ctrl{display:flex;flex-direction:column;gap:3px}
.ctrl label{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#999;font-weight:600}
.ctrl input[type=range]{width:120px;accent-color:#1a1a1a}
.ctrl-val{font-size:10px;color:#666;font-family:'Teko',sans-serif;font-weight:700}
.ctrl select{font-size:11px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;background:#fff}

/* CANVAS AREA */
.canvas-area{padding:20px;display:flex;justify-content:center}
.canvas-wrap{background:repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 14px 14px;padding:16px;border-radius:8px;border:1px solid #ccc;display:inline-block}
#render-area{background:transparent}

/* GRID for sticker sheets */
.sheets{display:flex;flex-wrap:wrap;gap:var(--sheet-gap,12px);padding:8px}
.sheet{page-break-inside:avoid}
.sheet-label{font-family:'Teko',sans-serif;font-size:var(--label-size,12px);font-weight:700;color:#aaa;margin-bottom:3px;display:flex;justify-content:space-between}
.sheet-date{font-family:'Poppins',sans-serif;font-size:7px;color:#ccc;font-weight:400}
.stickers{display:grid;grid-template-columns:repeat(var(--cols,4),auto);gap:var(--sticker-gap,4px);width:fit-content}
.s{border:var(--border-w,1.5px) solid var(--border-color,#1a1a1a);border-radius:var(--border-r,2px);display:flex;align-items:center;justify-content:center;overflow:hidden}
.s-txt{font-family:'Teko',sans-serif;font-size:var(--font-size,28px);font-weight:700;line-height:1.15;padding:var(--txt-pad-v,5px) var(--txt-pad-h,10px);white-space:nowrap}
.s-txt.black{color:#1a1a1a}
.s-txt.white{color:#ffffff}
.s-flag{width:var(--flag-size,44px);height:var(--flag-size,44px);padding:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
.s-flag img{max-width:80%;max-height:80%;object-fit:contain}
.s-icon{width:var(--flag-size,44px);height:var(--flag-size,44px);display:flex;align-items:center;justify-content:center;font-size:calc(var(--flag-size,44px) * 0.55)}
.s-custom{font-family:'Poppins',sans-serif;font-size:7px;padding:4px 6px;max-width:80px;text-align:center;color:#888;font-style:italic}
.flag-css{width:100%;height:100%;position:relative}
.flag-eng{background:#fff}
.flag-eng-h{position:absolute;top:50%;left:0;right:0;height:20%;background:#CE1124;transform:translateY(-50%)}
.flag-eng-v{position:absolute;left:50%;top:0;bottom:0;width:20%;background:#CE1124;transform:translateX(-50%)}
.flag-sct{background:#005EB8;overflow:hidden}
.flag-sct-x{position:absolute;inset:0;background:linear-gradient(to top right,transparent 42%,#fff 42%,#fff 58%,transparent 58%),linear-gradient(to bottom right,transparent 42%,#fff 42%,#fff 58%,transparent 58%)}
.flag-wls{display:flex;flex-direction:column;height:100%}
.flag-wls-top{flex:1;background:#fff}
.flag-wls-bot{flex:1;background:#00AB39}
.flag-ire{display:flex;height:100%}
.flag-ire>div{flex:1}
.flag-ire-g{background:#169B62}
.flag-ire-w{background:#fff}
.flag-ire-o{background:#FF883E}

@media print{.toolbar,.panel{display:none!important}.canvas-area{padding:0}.canvas-wrap{background:none;border:none;padding:0}}
</style>
</head><body>

<div class="toolbar">
  <div class="toolbar-left">
    <span class="toolbar-title">⬡ ${shop.name} — Stickers</span>
    <span class="toolbar-info">${ordersData.length} pedidos · ${ordersData.reduce((s,o)=>s+o.stickers.length,0)} stickers</span>
  </div>
  <div class="toolbar-right">
    <button class="tbtn" id="togglePanel">⚙ Editar</button>
    ${!showAll?`<a class="tbtn" href="/api/print-all?token=${token}&shop=${shopId}&all=1">Incluir archivados</a>`:`<a class="tbtn" href="/api/print-all?token=${token}&shop=${shopId}">Solo abiertos</a>`}
    <button class="tbtn" id="dlPng">⬇ PNG</button>
    <button class="tbtn" id="dlSvg">⬇ SVG</button>
    <button class="tbtn tbtn-dk" onclick="window.print()">🖨 Imprimir</button>
  </div>
</div>

<div class="panel" id="panel">
  <div class="ctrl"><label>Font size</label><input type="range" id="c-font" min="16" max="48" value="28"><span class="ctrl-val" id="v-font">28px</span></div>
  <div class="ctrl"><label>Border</label><input type="range" id="c-border" min="0" max="5" value="1.5" step="0.5"><span class="ctrl-val" id="v-border">1.5px</span></div>
  <div class="ctrl"><label>Border radius</label><input type="range" id="c-radius" min="0" max="10" value="2"><span class="ctrl-val" id="v-radius">2px</span></div>
  <div class="ctrl"><label>Flag size</label><input type="range" id="c-flag" min="28" max="70" value="44"><span class="ctrl-val" id="v-flag">44px</span></div>
  <div class="ctrl"><label>Sticker gap</label><input type="range" id="c-gap" min="0" max="12" value="4"><span class="ctrl-val" id="v-gap">4px</span></div>
  <div class="ctrl"><label>Sheet gap</label><input type="range" id="c-sgap" min="4" max="30" value="12"><span class="ctrl-val" id="v-sgap">12px</span></div>
  <div class="ctrl"><label>Text pad H</label><input type="range" id="c-padh" min="4" max="24" value="10"><span class="ctrl-val" id="v-padh">10px</span></div>
  <div class="ctrl"><label>Text pad V</label><input type="range" id="c-padv" min="2" max="16" value="5"><span class="ctrl-val" id="v-padv">5px</span></div>
  <div class="ctrl"><label>Cols per row</label><input type="range" id="c-cols" min="2" max="8" value="4"><span class="ctrl-val" id="v-cols">4</span></div>
  <div class="ctrl"><label>Label size</label><input type="range" id="c-label" min="8" max="18" value="12"><span class="ctrl-val" id="v-label">12px</span></div>
  <div class="ctrl"><label>Border color</label><input type="color" id="c-bcolor" value="#1a1a1a"></div>
</div>

<div class="canvas-area">
  <div class="canvas-wrap">
    <div id="render-area" class="sheets"></div>
  </div>
</div>

<script>
const DATA = ${JSON.stringify(ordersData)};

// Flag helpers
function flagToCode(val){
  if(!val)return null;
  const ris=[];for(const ch of val){const cp=ch.codePointAt(0);if(cp>=0x1F1E6&&cp<=0x1F1FF)ris.push(cp)}
  if(ris.length===2)return String.fromCharCode(ris[0]-0x1F1E6+65,ris[1]-0x1F1E6+65).toLowerCase();
  const tags=[];for(const ch of val){const cp=ch.codePointAt(0);if(cp>=0xE0061&&cp<=0xE007A)tags.push(String.fromCharCode(cp-0xE0061+97))}
  if(tags.length>=4){const c=tags.join('');return c.substring(0,2)+'-'+c.substring(2)}
  const clean=val.replace(/[^\\w\\s]/g,'').trim().toLowerCase();
  const map={'spain':'es','españa':'es','italy':'it','england':'gb-eng','scotland':'gb-sct','wales':'gb-wls','uk':'gb','united kingdom':'gb','great britain':'gb','germany':'de','france':'fr','portugal':'pt','belgium':'be','netherlands':'nl','holland':'nl','poland':'pl','croatia':'hr','austria':'at','switzerland':'ch','sweden':'se','norway':'no','denmark':'dk','finland':'fi','greece':'gr','ireland':'ie','czech republic':'cz','romania':'ro','ukraine':'ua','russia':'ru','serbia':'rs','usa':'us','united states':'us','brazil':'br','brasil':'br','argentina':'ar','mexico':'mx','colombia':'co','chile':'cl','peru':'pe','venezuela':'ve','ecuador':'ec','uruguay':'uy','canada':'ca','morocco':'ma','nigeria':'ng','south africa':'za','egypt':'eg','japan':'jp','south korea':'kr','china':'cn','india':'in','turkey':'tr','australia':'au','new zealand':'nz','jamaica':'jm','ghana':'gh','kenya':'ke','angola':'ao','cameroon':'cm','senegal':'sn','albania':'al','bosnia':'ba','slovenia':'si','hungary':'hu','bulgaria':'bg','slovakia':'sk','latvia':'lv','lithuania':'lt','estonia':'ee'};
  if(map[clean])return map[clean];
  for(const[n,c]of Object.entries(map)){if(clean.includes(n)||n.includes(clean))return c}
  return null;
}

const cssFlags={
  'gb-eng':'<div class="flag-css flag-eng"><div class="flag-eng-h"></div><div class="flag-eng-v"></div></div>',
  'gb-sct':'<div class="flag-css flag-sct"><div class="flag-sct-x"></div></div>',
  'gb-wls':'<div class="flag-css flag-wls"><div class="flag-wls-top"></div><div class="flag-wls-bot"></div></div>',
  'ie':'<div class="flag-css flag-ire"><div class="flag-ire-g"></div><div class="flag-ire-w"></div><div class="flag-ire-o"></div></div>',
};

function renderFlag(val){
  const code=flagToCode(val);
  if(!code)return'<div class="s s-icon">🏳️</div>';
  if(cssFlags[code])return'<div class="s s-flag">'+cssFlags[code]+'</div>';
  return'<div class="s s-flag"><img src="https://flagcdn.com/w160/'+code+'.png" onerror="this.style.display=\\'none\\'" alt=""></div>';
}

function renderSticker(s){
  if(s.type==='flag')return renderFlag(s.value);
  if(s.type==='icon')return'<div class="s s-icon">'+s.value+'</div>';
  const colorClass=s.isWhite?'white':'black';
  if(s.type==='custom')return'<div class="s"><span class="s-custom">✨ '+(s.value.length>25?s.value.substring(0,25)+'…':s.value)+'</span></div>';
  return'<div class="s"><span class="s-txt '+colorClass+'">'+s.value+'</span></div>';
}

function renderAll(){
  const area=document.getElementById('render-area');
  area.innerHTML=DATA.map(order=>'<div class="sheet"><div class="sheet-label"><span>'+order.name+'</span><span class="sheet-date">'+new Date(order.date).toLocaleDateString()+'</span></div><div class="stickers">'+order.stickers.map(renderSticker).join('')+'</div></div>').join('');
}

// Controls
const controls=[
  {id:'c-font',css:'--font-size',unit:'px',vid:'v-font'},
  {id:'c-border',css:'--border-w',unit:'px',vid:'v-border'},
  {id:'c-radius',css:'--border-r',unit:'px',vid:'v-radius'},
  {id:'c-flag',css:'--flag-size',unit:'px',vid:'v-flag'},
  {id:'c-gap',css:'--sticker-gap',unit:'px',vid:'v-gap'},
  {id:'c-sgap',css:'--sheet-gap',unit:'px',vid:'v-sgap'},
  {id:'c-padh',css:'--txt-pad-h',unit:'px',vid:'v-padh'},
  {id:'c-padv',css:'--txt-pad-v',unit:'px',vid:'v-padv'},
  {id:'c-cols',css:'--cols',unit:'',vid:'v-cols'},
  {id:'c-label',css:'--label-size',unit:'px',vid:'v-label'},
];

controls.forEach(c=>{
  const el=document.getElementById(c.id);
  if(!el)return;
  el.addEventListener('input',()=>{
    document.getElementById('render-area').style.setProperty(c.css,el.value+c.unit);
    document.getElementById(c.vid).textContent=el.value+c.unit;
  });
});

document.getElementById('c-bcolor')?.addEventListener('input',(e)=>{
  document.getElementById('render-area').style.setProperty('--border-color',e.target.value);
});

document.getElementById('togglePanel')?.addEventListener('click',()=>{
  document.getElementById('panel').classList.toggle('open');
});

// Download PNG
document.getElementById('dlPng')?.addEventListener('click',async()=>{
  const el=document.getElementById('render-area');
  const btn=document.getElementById('dlPng');
  btn.textContent='Generando...';
  
  // Use html2canvas approach via canvas
  try{
    const {default:h2c}=await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm');
    const canvas=await h2c(el,{backgroundColor:null,scale:3,useCORS:true});
    const link=document.createElement('a');
    link.download='stickers_${shop.name.replace(/[^a-zA-Z0-9]/g,'_')}.png';
    link.href=canvas.toDataURL('image/png');
    link.click();
  }catch(e){
    console.error(e);
    alert('Error generating PNG. Try Print > Save as PDF instead.');
  }
  btn.textContent='⬇ PNG';
});

// Download SVG
document.getElementById('dlSvg')?.addEventListener('click',()=>{
  const el=document.getElementById('render-area');
  const styles=document.querySelector('style').textContent;
  const svgContent='<svg xmlns="http://www.w3.org/2000/svg" width="'+el.scrollWidth+'" height="'+el.scrollHeight+'"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>'+styles+'</style>'+el.outerHTML+'</div></foreignObject></svg>';
  const blob=new Blob([svgContent],{type:'image/svg+xml'});
  const link=document.createElement('a');
  link.download='stickers_${shop.name.replace(/[^a-zA-Z0-9]/g,'_')}.svg';
  link.href=URL.createObjectURL(blob);
  link.click();
});

renderAll();
</script>
</body></html>`);
  } catch(err){
    console.error(err);
    res.status(500).send('Error: '+err.message);
  }
};
