// fetch() for the main process. Electron 23+ (Node 18+) has it built in; the
// Windows 7/8 build runs on Electron 22 (Node 16), which does not — so there
// we use this small stand-in on Node's http/https. It covers what CorePOS
// needs: method, headers, a string body, an AbortSignal, and res.ok /
// res.status / res.json() / res.text().

const http = require('node:http');
const https = require('node:https');

function nodeFetch(url, { method = 'GET', headers = {}, body, signal } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const data = body == null ? null : Buffer.from(String(body));
    const req = lib.request(u, {
      method,
      headers: { ...headers, ...(data ? { 'Content-Length': data.length } : {}) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: async () => text,
          json: async () => JSON.parse(text),
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (signal) {
      if (signal.aborted) { req.destroy(new Error('Aborted')); return; }
      signal.addEventListener('abort', () => req.destroy(new Error('Aborted')), { once: true });
    }
    if (data) req.write(data);
    req.end();
  });
}

const fetchCompat = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : nodeFetch;

module.exports = { fetchCompat, nodeFetch };
