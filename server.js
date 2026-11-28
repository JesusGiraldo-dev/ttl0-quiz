const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || '1708';
const DATA_FILE = path.join(__dirname, 'resultados.json');

// --- Estado en memoria ---
let currentSlide = 's0';
let adminSid = null;
let adminTs = 0;
const LEASE_MS = 120000; // 2 minutos de lease
const sseClients = new Set();

// --- Cargar / Guardar Resultados ---
function loadResults() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Error al cargar resultados.json:', err.message);
  }
  return [];
}

let results = loadResults();

function saveResults() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(results, null, 2), 'utf8');
  } catch (err) {
    console.error('Error al guardar resultados.json:', err.message);
  }
}

// --- Direcciones IP locales ---
function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        list.push({ name, address: net.address });
      }
    }
  }
  return list.length > 0 ? list : [{ name: 'localhost', address: '127.0.0.1' }];
}

// --- Broadcast SSE ---
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// --- Servidor HTTP ---
const server = http.createServer((req, res) => {
  // CORS Headers para cualquier petición local
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // 1. Server-Sent Events (SSE) para sincronización en tiempo real (<2ms)
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`event: init\ndata: ${JSON.stringify({ v: currentSlide, users: sseClients.size + 1 })}\n\n`);
    sseClients.add(res);
    broadcast('users', { count: sseClients.size });

    req.on('close', () => {
      sseClients.delete(res);
      broadcast('users', { count: sseClients.size });
    });
    return;
  }

  // 2. Información del servidor y red
  if (pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      port: PORT,
      ips: getLocalIPs(),
      users: sseClients.size,
      slide: currentSlide
    }));
    return;
  }

  // 3. API principal (/api o /exec para compatibilidad)
  if (pathname === '/api' || pathname === '/exec') {
    const a = url.searchParams.get('a');
    const k = url.searchParams.get('k') || '';
    const sid = url.searchParams.get('sid') || url.searchParams.get('s') || '';

    // Manejo de GET
    if (req.method === 'GET') {
      // a) Estado actual de las slides
      if (a === 'get') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ v: currentSlide }));
        return;
      }

      // b) Autenticación de admin
      if (a === 'adm') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (k !== ADMIN_PASS) {
          res.end(JSON.stringify({ ok: false, r: 'key' }));
          return;
        }
        const now = Date.now();
        if (adminSid && adminSid !== sid && (now - adminTs < LEASE_MS)) {
          res.end(JSON.stringify({ ok: false, r: 'busy', admin: false }));
          return;
        }
        adminSid = sid;
        adminTs = now;
        res.end(JSON.stringify({ ok: true, admin: true }));
        return;
      }

      // c) Salir / soltar admin
      if (a === 'bye' || a === 'rel') {
        if (adminSid === sid) {
          adminSid = null;
          adminTs = 0;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // d) Cambiar diapositiva (admin)
      if (a === 'set') {
        const v = url.searchParams.get('v') || '';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (k !== ADMIN_PASS) {
          res.end(JSON.stringify({ ok: false, r: 'key' }));
          return;
        }
        adminSid = sid;
        adminTs = Date.now();
        currentSlide = v;
        broadcast('slide', { v });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // e) Reiniciar clasificación (admin)
      if (a === 'reset') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (k !== ADMIN_PASS) {
          res.end(JSON.stringify({ ok: false, r: 'key' }));
          return;
        }
        results = [];
        saveResults();
        broadcast('reset', {});
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // f) Obtener ranking de clasificación (sin parámetro 'a')
      const sorted = [...results].sort((x, y) => (y.s - x.s) || (x.t - y.t));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sorted));
      return;
    }

    // Manejo de POST (envío de puntajes del quiz)
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const d = JSON.parse(body);
          const n = String(d.n || '').replace(/^[=+\-@\s]+/, '').slice(0, 14).trim();
          if (!n) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('ok');
            return;
          }
          const s = Math.min(10000, Math.max(0, Number(d.s) || 0));
          const c = Math.min(10, Math.max(0, Number(d.c) || 0));
          const t = Math.min(300, Math.max(0, Number(d.t) || 0));

          const existingIdx = results.findIndex(r => r.n.toLowerCase() === n.toLowerCase());
          if (existingIdx >= 0) {
            if (s > results[existingIdx].s) {
              results[existingIdx] = { n, s, c, t, date: new Date().toISOString() };
            }
          } else {
            results.push({ n, s, c, t, date: new Date().toISOString() });
          }
          saveResults();
          broadcast('ranking_update', { count: results.length });
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid JSON');
        }
      });
      return;
    }
  }

  // 4. Servir archivos estáticos (index.html por defecto)
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error al leer archivo');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('\x1b[36m%s\x1b[0m', '╔══════════════════════════════════════════════════════════════════╗');
  console.log('\x1b[36m║\x1b[1m\x1b[32m         TTL=0 · SERVIDOR LOCAL DE CLASE (REDES)                  \x1b[0m\x1b[36m║');
  console.log('\x1b[36m╠══════════════════════════════════════════════════════════════════╣\x1b[0m');
  console.log('\x1b[36m║\x1b[0m \x1b[1m[Proyector / Este PC]:\x1b[0m                                           \x1b[36m║');
  console.log(`\x1b[36m║\x1b[0m   \x1b[33mhttp://localhost:${PORT}\x1b[0m`.padEnd(68) + '\x1b[36m║\x1b[0m');
  console.log('\x1b[36m║\x1b[0m                                                                  \x1b[36m║');
  console.log('\x1b[36m║\x1b[0m \x1b[1m[Estudiantes / Dispositivos en la misma red Wi-Fi o Hotspot]:\x1b[0m     \x1b[36m║');
  ips.forEach(ip => {
    console.log(`\x1b[36m║\x1b[0m   \x1b[32m\x1b[1mhttp://${ip.address}:${PORT}\x1b[0m (${ip.name})`.padEnd(77) + '\x1b[36m║\x1b[0m');
  });
  console.log('\x1b[36m║\x1b[0m                                                                  \x1b[36m║');
  console.log(`\x1b[36m║\x1b[0m  • Clave de Administrador: \x1b[1m\x1b[33m${ADMIN_PASS}\x1b[0m`.padEnd(72) + '\x1b[36m║\x1b[0m');
  console.log(`\x1b[36m║\x1b[0m  • Resultados guardados en: \x1b[34mresultados.json\x1b[0m`.padEnd(70) + '\x1b[36m║\x1b[0m');
  console.log(`\x1b[36m║\x1b[0m  • Sincronización en tiempo real (SSE): \x1b[32mACTIVADA\x1b[0m`.padEnd(71) + '\x1b[36m║\x1b[0m');
  console.log('\x1b[36m╚══════════════════════════════════════════════════════════════════╝\x1b[0m');
  console.log('\x1b[90mPresiona Ctrl+C para detener el servidor.\x1b[0m\n');
});
