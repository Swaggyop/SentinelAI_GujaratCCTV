const express = require('express');
const https = require('https');

const router = express.Router();
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

let cachedCookie = null;
let cookieExpiry = 0;

const HACKATHON_EMAIL = process.env.HACKATHON_EMAIL;
const HACKATHON_PASSWORD = process.env.HACKATHON_PASSWORD;

if (!HACKATHON_EMAIL || !HACKATHON_PASSWORD) {
  console.warn('[stream.js] WARNING: HACKATHON_EMAIL or HACKATHON_PASSWORD environment variable is not set. Live stream authentication will fail.');
}

function invalidateCookie() {
  cachedCookie = null;
  cookieExpiry = 0;
}

async function getAuthCookie(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedCookie && now < cookieExpiry) {
    return cachedCookie;
  }

  const email = process.env.HACKATHON_EMAIL || HACKATHON_EMAIL;
  const password = process.env.HACKATHON_PASSWORD || HACKATHON_PASSWORD;

  if (!email || !password) {
    throw new Error('HACKATHON_EMAIL and HACKATHON_PASSWORD environment variables are required for video streaming.');
  }

  return new Promise((resolve, reject) => {
    const postData = `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
    const req = https.request('https://cctv.corp8.cloud/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      agent
    }, (res) => {
      // Drain body
      res.on('data', () => {});
      res.on('end', () => {});

      const setCookie = res.headers['set-cookie'];
      if (setCookie && setCookie.length > 0) {
        cachedCookie = setCookie[0].split(';')[0];
        cookieExpiry = Date.now() + (10 * 60 * 1000); // 10 min (shorter to avoid stale)
        console.log('Stream proxy: refreshed hackathon session cookie');
        resolve(cachedCookie);
      } else {
        reject(new Error('No set-cookie header from hackathon login'));
      }
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

let cachedKey = null;

// Serve the encryption key
async function proxyEncKey(res) {
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  if (cachedKey) {
    return res.send(cachedKey);
  }

  try {
    const cookie = await getAuthCookie();
    const req = https.request('https://cctv.corp8.cloud/enc.key', {
      method: 'GET',
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      agent
    }, (keyRes) => {
      const chunks = [];
      keyRes.on('data', c => chunks.push(c));
      keyRes.on('end', () => {
        cachedKey = Buffer.concat(chunks);
        res.send(cachedKey);
      });
    });
    req.on('error', (err) => {
      console.error('Failed to proxy enc.key:', err.message);
      res.status(502).end();
    });
    req.end();
  } catch (err) {
    res.status(500).end();
  }
}

router.get('/enc.key', async (req, res) => {
  return proxyEncKey(res);
});

async function proxyFile(camId, file, res, retried = false) {
  try {
    const cookie = await getAuthCookie();
    const targetUrl = `https://cctv.corp8.cloud/${camId}/${file}`;

    const proxyReq = https.request(targetUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      agent
    }, (proxyRes) => {
      // If we get a redirect to /auth/login, our cookie is stale
      if (proxyRes.statusCode === 302 || proxyRes.statusCode === 403) {
        // Drain the response
        proxyRes.on('data', () => {});
        proxyRes.on('end', () => {});

        if (!retried) {
          console.log(`Stream proxy: got ${proxyRes.statusCode} for ${camId}/${file}, refreshing cookie...`);
          invalidateCookie();
          return proxyFile(camId, file, res, true);
        } else {
          return res.status(502).json({ error: 'Upstream auth failed after retry' });
        }
      }

      res.status(proxyRes.statusCode);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      if (file.endsWith('.m3u8')) {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        let m3u8Content = '';
        proxyRes.on('data', (chunk) => {
          m3u8Content += chunk.toString();
        });
        proxyRes.on('end', () => {
          const rewritten = m3u8Content.replace(/URI="\/enc\.key"/g, 'URI="enc.key"');
          res.send(rewritten);
        });
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (proxyRes.headers['content-type']) {
          res.setHeader('Content-Type', proxyRes.headers['content-type']);
        }
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error(`Stream proxy error for ${camId}/${file}:`, err.message);
      res.status(502).json({ error: 'Stream proxy unreachable' });
    });

    proxyReq.end();
  } catch (err) {
    console.error('Failed to get auth cookie for stream proxy:', err.message);
    res.status(500).json({ error: 'Auth failed with upstream stream server' });
  }
}

router.get('/:camId/:file', async (req, res) => {
  const { camId, file } = req.params;

  if (file === 'enc.key') {
    return proxyEncKey(res);
  }

  return proxyFile(camId, file, res);
});

module.exports = router;
