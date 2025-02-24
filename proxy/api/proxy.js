const fetch = require('node-fetch');

async function forwardRequest(req, res) {
  const url = `https://api.usaspending.gov${req.url}`;
  const options = {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
    ...(req.method === 'POST' && req.body && { body: JSON.stringify(req.body) })
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function parseBody(req) {
  if (req.method !== 'POST') return;
  const data = await new Promise(resolve => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
  req.body = JSON.parse(data || '{}');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.url === '/health') return res.status(200).json({ status: 'ok' });

  await parseBody(req);
  await forwardRequest(req, res);
};