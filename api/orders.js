const { getShops, authCheck } = require('./_helpers');

module.exports = async (req, res) => {
  const token = req.headers['x-auth-token'];
  const auth = authCheck(token);
  if (!auth) return res.status(401).json({ error: 'Not authorized' });

  const shopId = req.query.shop;
  if (!shopId) return res.status(400).json({ error: 'Missing shop parameter' });

  const shops = getShops();
  const shop = shops.find(s => s.id === shopId);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const showAll = req.query.show === 'all';

  try {
    let allOrders = [];
    let baseUrl = `https://${shop.shop}/admin/api/2024-01/orders.json?status=any&limit=250`;
    if (!showAll) baseUrl += '&fulfillment_status=unfulfilled';
    let url = baseUrl;

    while (url) {
      const response = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': shop.token, 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        const text = await response.text();
        console.error(`Shopify error [${shop.id}]:`, response.status, text);
        return res.status(response.status).json({ error: 'Error connecting to Shopify' });
      }
      const data = await response.json();
      allOrders = allOrders.concat(data.orders || []);

      // For "all" mode, limit to 250 most recent to avoid timeout
      if (showAll && allOrders.length >= 250) break;

      const linkHeader = response.headers.get('link');
      url = null;
      if (linkHeader) { const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/); if (m) url = m[1]; }
    }

    const orders = allOrders.map(order => ({
      id: order.id, name: order.name, order_number: order.order_number, created_at: order.created_at,
      fulfillment_status: order.fulfillment_status, note: order.note,
      line_items: (order.line_items || []).map(item => ({
        id: item.id, title: item.title, variant_title: item.variant_title, quantity: item.quantity, sku: item.sku,
        properties: (item.properties || []).map(p => ({ name: p.name, value: p.value }))
      }))
    }));

    res.json({ orders });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
