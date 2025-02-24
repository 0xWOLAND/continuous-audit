const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

const baseUrl = process.env.TEST_URL || 'http://localhost:3001';

async function testProxy() {
  try {
    const url = `${baseUrl}/api/v2/awards/150082979`
    console.log("Fetching from:", url);
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'API error');
    console.log('Proxy success:', data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    process.exit(1);
  }
}

async function testHealth() {
  try {
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json();
    console.log('Health:', data);
  } catch (error) {
    console.error('Health error:', error.message);
    process.exit(1);
  }
}

Promise.all([testHealth(), testProxy()]);