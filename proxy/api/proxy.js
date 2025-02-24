const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

// Create proxy instance outside handler for reuse
const proxy = createProxyMiddleware({
  target: 'https://api.usaspending.gov',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '', // Remove /api prefix when forwarding
  },
  onProxyRes: (proxyRes, req, res) => {
    proxyRes.headers['x-proxy-secured'] = 'true';
  },
});

// Convert Express middleware to Vercel serverless function
const handler = (req, res) => {
  // Remove the /api prefix from the path
  req.url = req.url.replace(/^\/api/, '');
  
  return new Promise((resolve, reject) => {
    proxy(req, res, (result) => {
      if (result instanceof Error) {
        reject(result);
      }
      resolve(result);
    });
  });
};

module.exports = handler; 