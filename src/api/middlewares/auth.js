// super simple header-based admin auth for routes that mutate streams
// export function adminAuth(req, res, next) {
//   const h = req.headers['x-admin'] || '';
//   if (h !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
//   next();
// }

function adminAuth(req, res, next) {
  const h = req.headers['x-admin'] || '';
  if (h !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

module.exports = { adminAuth };
