module.exports = async (req, res) => {
  const token = req.headers['x-auth-token'];
  const USERS = getUsers();
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  const isAdmin = token === ADMIN_PASSWORD;
  const user = USERS.find(u => u.password === token);

  if (!isAdmin && !user) {
    return res.status(401).json({ error: 'Not authorized' });
  }

  const SHOP = process.env.SHOPIFY_SHOP;
  const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!ACCESS_TOKEN) {
    return res.status(503).json({ error: 'Missing SHOPIFY_ACCESS_TOKEN' });
  }

  try {
    let allOrders = [];
    let url = `https://${SHOP}/admin/api/2024-01/orders.json?status=any&fulfillment_status=unfulfilled&limit=250`;

    // Paginate through all pages
    while (url) {
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Shopify error:', response.status, text);
        return res.status(response.status).json({ error: 'Error connecting to Shopify' });
      }

      const data = await response.json();
      allOrders = allOrders.concat(data.orders || []);

      // Check for next page via Link header
      const linkHeader = response.headers.get('link');
      url = null;
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) url = nextMatch[1];
      }
    }

    // Sanitize
    const orders = allOrders.map(order => ({
      id: order.id,
      name: order.name,
      order_number: order.order_number,
      created_at: order.created_at,
      fulfillment_status: order.fulfillment_status,
      note: order.note,
      line_items: (order.line_items || []).map(item => ({
        id: item.id,
        title: item.title,
        variant_title: item.variant_title,
        quantity: item.quantity,
        sku: item.sku,
        properties: (item.properties || []).map(p => ({
          name: p.name,
          value: p.value
        }))
      }))
    }));

    res.json({ orders });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

function getUsers() {
  try { return JSON.parse(process.env.DESIGNER_USERS || '[]'); }
  catch { return []; }
}
