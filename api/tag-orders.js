const { getShops, authCheck } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = req.headers['x-auth-token'] || req.query.token;
  const auth = authCheck(token);
  if (!auth) return res.status(401).json({ error: 'Not authorized' });

  const { orderIds, shopId, tag } = JSON.parse(req.body || '{}');
  if (!orderIds || !orderIds.length || !shopId) return res.status(400).json({ error: 'Missing orderIds or shopId' });

  const shops = getShops();
  const shop = shops.find(s => s.id === shopId);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const tagName = tag || 'printed';
  const results = { success: [], failed: [] };

  for (const orderId of orderIds) {
    try {
      // Get current order tags
      const getRes = await fetch(`https://${shop.shop}/admin/api/2024-01/orders/${orderId}.json?fields=id,tags`, {
        headers: { 'X-Shopify-Access-Token': shop.token, 'Content-Type': 'application/json' }
      });
      if (!getRes.ok) { results.failed.push(orderId); continue; }
      const orderData = await getRes.json();
      const currentTags = orderData.order.tags || '';

      // Add tag if not already present
      const tagsArr = currentTags.split(',').map(t => t.trim()).filter(Boolean);
      if (tagsArr.includes(tagName)) { results.success.push(orderId); continue; }
      tagsArr.push(tagName);

      // Update order
      const putRes = await fetch(`https://${shop.shop}/admin/api/2024-01/orders/${orderId}.json`, {
        method: 'PUT',
        headers: { 'X-Shopify-Access-Token': shop.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: { id: orderId, tags: tagsArr.join(', ') } })
      });
      if (putRes.ok) results.success.push(orderId);
      else results.failed.push(orderId);
    } catch (e) {
      results.failed.push(orderId);
    }
  }

  res.json({ results, tag: tagName });
};
