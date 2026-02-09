module.exports = (req, res) => {
  res.json({ authorized: !!process.env.SHOPIFY_ACCESS_TOKEN });
};
