const { getShops, authCheck } = require('./_helpers');

module.exports = async (req, res) => {
  const token = req.headers['x-auth-token'] || req.query.token;
  const auth = authCheck(token);
  if (!auth || auth.role !== 'admin') {
    return res.status(401).send('Admin only. Add ?token=YOUR_ADMIN_PASSWORD to the URL');
  }

  const shopId = req.query.shop || 'dhispania';
  const shops = getShops();
  const shop = shops.find(s => s.id === shopId);
  if (!shop) return res.status(404).send('Shop not found');

  // Order numbers to check
  const orderNumbers = [
    'PL1034','PL1035','PL1036','PL1037','PL1038','PL1039','PL1040','PL1041','PL1042','PL1043',
    'PL1044','PL1045','PL1046','PL1047','PL1048','PL1050','PL1051','PL1052','PL1053','PL1054',
    'PL1055','PL1056','PL1057','PL1058','PL1059','PL1060','PL1061','PL1062','PL1063','PL1064',
    'PL1065','PL1066','PL1067','PL1068','PL1069','PL1070','PL1071','PL1072','PL1073','PL1074',
    'PL1075','PL1076','PL1077','PL1078','PL1079','PL1080','PL1081','PL1082','PL1083','PL1084',
    'PL1085','PL1086','PL1087','PL1586','PL2146','PL2148','PL2149','PL2152','PL2153','PL2154',
    'PL2155','PL2156','PL2158','PL2159','PL2160','PL2161','PL2162','PL2163','PL2194','PL2195',
    'PL2197','PL2198','PL2199','PL2200','PL2201','PL2202','PL2203','PL2204','PL2205','PL2206',
    'PL2207','PL2208','PL2209','PL2210','PL2211','PL2212','PL2213','PL2214','PL2215','PL2216',
    'PL2217','PL2218','PL2219','PL2220','PL2221','PL2222','PL2223','PL2224','PL2225','PL2226',
    'PL2227','PL2228','PL2229','PL2230','PL2231','PL2232','PL2233','PL2234','PL2235','PL2236','PL2237'
  ];

  try {
    // Fetch all orders (any status) - paginate through all
    let allOrders = [];
    let url = `https://${shop.shop}/admin/api/2024-01/orders.json?status=any&limit=250`;

    while (url) {
      const response = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': shop.token, 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        return res.status(500).send('Shopify API error: ' + response.status);
      }
      const data = await response.json();
      allOrders = allOrders.concat(data.orders || []);
      const linkHeader = response.headers.get('link');
      url = null;
      if (linkHeader) {
        const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (m) url = m[1];
      }
      // Safety limit
      if (allOrders.length > 2000) break;
    }

    // Build lookup by order name (e.g. #PL1034 or PL1034)
    const orderMap = {};
    allOrders.forEach(o => {
      const name = o.name.replace('#', '');
      orderMap[name] = o;
    });

    // Check each order
    const results = {
      toDesign: [],    // Active, not refunded, needs design
      refunded: [],    // Fully or partially refunded
      cancelled: [],   // Cancelled
      notFound: [],    // Not found in Shopify
      archived: [],    // Closed/archived
    };

    orderNumbers.forEach(num => {
      const order = orderMap[num];
      if (!order) {
        results.notFound.push({ num, reason: 'Not found in Shopify' });
        return;
      }

      const isCancelled = !!order.cancelled_at;
      const totalRefunded = (order.refunds || []).reduce((sum, r) => {
        return sum + (r.refund_line_items || []).reduce((s, li) => s + parseFloat(li.subtotal || 0), 0);
      }, 0);
      const hasRefunds = order.refunds && order.refunds.length > 0;
      const isFullyRefunded = hasRefunds && order.financial_status === 'refunded';
      const isPartiallyRefunded = hasRefunds && order.financial_status === 'partially_refunded';
      const isClosed = order.closed_at && !isCancelled;

      if (isCancelled) {
        results.cancelled.push({
          num, name: order.name, cancelled_at: order.cancelled_at,
          reason: 'Cancelled on ' + new Date(order.cancelled_at).toLocaleDateString()
        });
      } else if (isFullyRefunded) {
        results.refunded.push({
          num, name: order.name, financial_status: order.financial_status,
          reason: 'Fully refunded'
        });
      } else if (isPartiallyRefunded) {
        results.refunded.push({
          num, name: order.name, financial_status: order.financial_status,
          reason: 'Partially refunded - check manually',
          items: order.line_items.map(i => i.title + (i.variant_title ? ' - ' + i.variant_title : '')).join(', ')
        });
      } else {
        results.toDesign.push({
          num, name: order.name,
          fulfillment_status: order.fulfillment_status || 'unfulfilled',
          financial_status: order.financial_status,
          items: order.line_items.length,
          stickers: order.line_items.reduce((s, i) => s + i.quantity, 0),
          details: order.line_items.map(i => {
            const design = (i.properties || []).find(p => ['Diseño','diseño','Design','design'].includes(p.name));
            return (design ? design.value : i.variant_title || i.title) + ' x' + i.quantity;
          }).join(', ')
        });
      }
    });

    // Output HTML
    res.setHeader('Content-Type', 'text/html');
    res.send(`
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order Check - ${shop.name}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e8e8e8;padding:32px;max-width:1200px;margin:0 auto}
  h1{font-size:24px;margin-bottom:8px;color:#f5c542}
  .summary{display:flex;gap:16px;margin:24px 0;flex-wrap:wrap}
  .sum-card{background:#141414;border:1px solid #222;border-radius:10px;padding:20px;flex:1;min-width:150px;text-align:center}
  .sum-num{font-size:32px;font-weight:700;font-family:monospace}
  .sum-label{font-size:12px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:1px}
  .sum-green .sum-num{color:#34d399}
  .sum-red .sum-num{color:#f87171}
  .sum-orange .sum-num{color:#fb923c}
  .sum-gray .sum-num{color:#888}
  h2{font-size:18px;margin:32px 0 12px;padding:8px 0;border-bottom:1px solid #222}
  h2.green{color:#34d399} h2.red{color:#f87171} h2.orange{color:#fb923c} h2.gray{color:#888}
  table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px}
  th{text-align:left;padding:8px 12px;background:#141414;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #333}
  td{padding:8px 12px;border-bottom:1px solid #1a1a1a}
  tr:hover{background:#141414}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
  .badge-green{background:#34d39922;color:#34d399}
  .badge-red{background:#f8717122;color:#f87171}
  .badge-orange{background:#fb923c22;color:#fb923c}
  .badge-purple{background:#a78bfa22;color:#a78bfa}
  .badge-gray{background:#88888822;color:#888}
  .mono{font-family:monospace;font-weight:700;color:#f5c542}
  .dim{color:#555}
  .print-btn{background:#f5c542;color:#0a0a0a;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin:16px 0}
  .print-btn:hover{filter:brightness(1.1)}
  @media print{body{background:#fff;color:#000}.sum-card{border:1px solid #ccc}th{background:#f0f0f0;color:#333}td{border-color:#eee}.badge{border:1px solid}}
</style>
</head><body>
<h1>📋 Order Check — ${shop.name}</h1>
<p style="color:#888;margin-bottom:8px">Checked ${orderNumbers.length} orders • ${new Date().toLocaleString()}</p>
<button class="print-btn" onclick="window.print()">🖨️ Print this report</button>

<div class="summary">
  <div class="sum-card sum-green"><div class="sum-num">${results.toDesign.length}</div><div class="sum-label">✅ To Design</div></div>
  <div class="sum-card sum-red"><div class="sum-num">${results.refunded.length}</div><div class="sum-label">💸 Refunded</div></div>
  <div class="sum-card sum-orange"><div class="sum-num">${results.cancelled.length}</div><div class="sum-label">❌ Cancelled</div></div>
  <div class="sum-card sum-gray"><div class="sum-num">${results.notFound.length}</div><div class="sum-label">❓ Not Found</div></div>
</div>

<h2 class="green">✅ TO DESIGN (${results.toDesign.length})</h2>
${results.toDesign.length > 0 ? `
<table>
  <tr><th>#</th><th>Order</th><th>Fulfillment</th><th>Payment</th><th>Stickers</th><th>Details</th></tr>
  ${results.toDesign.map((o,i) => `
    <tr>
      <td>${i+1}</td>
      <td class="mono">${o.num}</td>
      <td><span class="badge ${o.fulfillment_status==='fulfilled'?'badge-purple':'badge-green'}">${o.fulfillment_status}</span></td>
      <td><span class="badge badge-green">${o.financial_status}</span></td>
      <td>${o.stickers}</td>
      <td style="max-width:300px">${o.details}</td>
    </tr>
  `).join('')}
</table>
` : '<p class="dim">None</p>'}

<h2 class="red">💸 REFUNDED — DO NOT DESIGN (${results.refunded.length})</h2>
${results.refunded.length > 0 ? `
<table>
  <tr><th>Order</th><th>Status</th><th>Reason</th><th>Items</th></tr>
  ${results.refunded.map(o => `
    <tr>
      <td class="mono">${o.num}</td>
      <td><span class="badge badge-red">${o.financial_status}</span></td>
      <td>${o.reason}</td>
      <td style="max-width:300px">${o.items || ''}</td>
    </tr>
  `).join('')}
</table>
` : '<p class="dim">None</p>'}

<h2 class="orange">❌ CANCELLED — DO NOT DESIGN (${results.cancelled.length})</h2>
${results.cancelled.length > 0 ? `
<table>
  <tr><th>Order</th><th>Reason</th></tr>
  ${results.cancelled.map(o => `
    <tr>
      <td class="mono">${o.num}</td>
      <td>${o.reason}</td>
    </tr>
  `).join('')}
</table>
` : '<p class="dim">None</p>'}

<h2 class="gray">❓ NOT FOUND (${results.notFound.length})</h2>
${results.notFound.length > 0 ? `
<table>
  <tr><th>Order</th><th>Note</th></tr>
  ${results.notFound.map(o => `
    <tr>
      <td class="mono">${o.num}</td>
      <td class="dim">${o.reason}</td>
    </tr>
  `).join('')}
</table>
` : '<p class="dim">None</p>'}

</body></html>
    `);
  } catch (err) {
    console.error('Check orders error:', err);
    res.status(500).send('Error: ' + err.message);
  }
};
