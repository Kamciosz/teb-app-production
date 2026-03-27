#!/usr/bin/env node
// CommonJS variant of dev-server to run in projects with "type": "module"
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { randomUUID } = require('crypto');

const HOST = '0.0.0.0';
const PORT = process.env.PORT ? Number(process.env.PORT) : 4173;
const ROOT = path.resolve(__dirname);
const DIST = path.join(ROOT, 'dist');
const PUBLIC = path.join(ROOT, 'public');
const UPLOADS = path.join(PUBLIC, 'uploads');

if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

function sendJSON(res, obj, status = 200) {
  const s = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(s),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*'
  });
  res.end(s);
}

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // fallback to index.html
      const index = path.join(DIST, 'index.html');
      if (fs.existsSync(index)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(index).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json'
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
    // API: presign
    if (u.pathname === '/api/generate-upload' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let json = {};
      try { json = JSON.parse(body || '{}'); } catch (e) { json = {}; }

      // generate key and return local upload URL and public URL
      const key = `${randomUUID()}-${Date.now()}.webp`;
      const host = `http://${req.headers.host}`;
      const uploadUrl = `${host}/api/local-upload/${encodeURIComponent(key)}`;
      const publicUrl = `${host}/uploads/${encodeURIComponent(key)}`;

      // Return structure compatible with real presigner
      return sendJSON(res, { uploadUrl, publicUrl, key, expiresIn: 60 });
    }

    // Local upload receiver (PUT)
    if (u.pathname.startsWith('/api/local-upload/') && req.method === 'PUT') {
      const key = decodeURIComponent(u.pathname.replace('/api/local-upload/', ''));
      const outPath = path.join(UPLOADS, key);
      const writeStream = fs.createWriteStream(outPath);
      req.pipe(writeStream);
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end('OK');
      });
      req.on('error', (e) => { console.error('Upload stream error', e); res.writeHead(500); res.end('upload error'); });
      return;
    }

    // Serve uploaded files
    if (u.pathname.startsWith('/uploads/')) {
      const rel = decodeURIComponent(u.pathname.replace('/uploads/', ''));
      const filePath = path.join(UPLOADS, rel);
      return serveFile(req, res, filePath);
    }

    // Static assets from dist (production build)
    const possible = path.join(DIST, u.pathname === '/' ? '/index.html' : u.pathname);
    if (fs.existsSync(possible) && fs.statSync(possible).isFile()) {
      return serveFile(req, res, possible);
    }

    // Fallback to index.html
    const index = path.join(DIST, 'index.html');
    if (fs.existsSync(index)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(index).pipe(res);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (e) {
    console.error('Server error', e);
    res.writeHead(500);
    res.end('Internal server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Dev server running: http://localhost:${PORT}`);
  console.log('Serves dist/ and mocks /api/generate-upload and /api/local-upload/:key');
});
