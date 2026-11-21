const http = require('http'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const PORT = process.env.PORT || 3000, KEY = process.env.HOST_KEY || '', T = 20000;
const lan = () => { for (const l of Object.values(os.networkInterfaces())) for (const a of l) if (a.family === 'IPv4' && !a.internal) return a.address; return 'localhost'; };
const URL_ = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://${lan()}:${PORT}`;
const HTML = fs.readFileSync(__dirname + '/index.html');
let qr = null;
try { require('qrcode').toString(URL_, { type: 'svg', margin: 1 }, (e, s) => { if (!e) qr = s; }); } catch {}

const Q = [
  [0, 'Tu PC muestra 169.254.x.x. ¿Qué pasó?', ['No hubo DHCP (APIPA)', 'Es tu IP pública', 'Es el loopback', 'Falló el switch'], 0],
  [0, 'Cambias de Wi-Fi. ¿Qué cambia?', ['La MAC', 'La IP', 'Ambas', 'Ninguna'], 1],
  [1, 'ping usa…', ['TCP puerto 80', 'UDP 53', 'ICMP, sin puertos', 'ARP'], 2],
  [1, 'En Cisco el primer ping da .!!!! ¿Por qué?', ['Cable dañado', 'El primer Echo espera el ARP', 'TTL agotado', 'DNS caído'], 1],
  [2, 'Destino en tu LAN y existe 0.0.0.0/0. ¿Cuál ruta gana?', ['La por defecto', 'La local (más específica)', 'La de menor métrica', 'Ninguna'], 1],
  [2, '¿Qué origen tiene menor distancia administrativa?', ['RIP (120)', 'OSPF (110)', 'EIGRP (90)', 'Estática (1)'], 3],
  [3, '¿Qué responde el router cuando el TTL llega a 0?', ['Echo Reply', 'ICMP Time Exceeded', 'Port Unreachable', 'SYN-ACK'], 1],
  [3, 'Un salto muestra * * * pero el destino responde. ¿Hay falla?', ['Sí, ruta cortada', 'No, ese router no responde sondas', 'Hay un bucle', 'Falla el DNS'], 1],
  [4, 'Escribes mal un comando en Cisco y se congela. ¿Por qué?', ['Intenta resolverlo por DNS', 'Pierde el ARP', 'Venció el DHCP', 'La interfaz cayó'], 0],
  [4, 'ping prueba.local funciona (hosts) pero dig no. ¿Por qué?', ['dig usa ICMP', 'dig consulta directo al DNS e ignora hosts', 'hosts está roto', 'Venció el TTL'], 1],
  [5, '¿Qué diferencia a 0.0.0.0:3000 de 127.0.0.1:3000?', ['Son iguales', '0.0.0.0 acepta de toda la red', '127.0.0.1 acepta celulares', '0.0.0.0 es solo UDP'], 1],
  [5, 'Tras cerrar muchas conexiones TCP aparece mucho…', ['LISTEN', 'SYN_SENT', 'TIME_WAIT', 'ESTABLISHED'], 2],
];

const S = { slide: 0, players: new Map(), sc: new Map(), host: null, quiz: null };
const C = new Set();

function send(s, o) {
  if (s.destroyed) return;
  const b = Buffer.from(JSON.stringify(o)), n = b.length;
  let h;
  if (n < 126) h = Buffer.from([129, n]);
  else if (n < 65536) h = Buffer.from([129, 126, n >> 8, n & 255]);
  else { h = Buffer.alloc(10); h[0] = 129; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  s.write(Buffer.concat([h, b]));
}
const bc = o => { for (const s of C) send(s, o); };
const info = () => ({ t: 'info', n: S.players.size, names: [...S.players.values()].map(p => p.name), ips: [...S.players.values()].map(p => p.ip), url: URL_ });

function parse(s, d, cb) {
  s.buf = Buffer.concat([s.buf || Buffer.alloc(0), d]);
  for (;;) {
    const b = s.buf;
    if (b.length < 2) return;
    const op = b[0] & 15, m = b[1] & 128;
    let l = b[1] & 127, o = 2;
    if (l === 126) { if (b.length < 4) return; l = b.readUInt16BE(2); o = 4; }
    else if (l === 127) { if (b.length < 10) return; l = Number(b.readBigUInt64BE(2)); o = 10; }
    const e = o + (m ? 4 : 0) + l;
    if (b.length < e) return;
    let p = b.subarray(o + (m ? 4 : 0), e);
    if (m) { const k = b.subarray(o, o + 4); p = Buffer.from(p.map((x, i) => x ^ k[i & 3])); }
    s.buf = b.subarray(e);
    if (op === 8) return s.end();
    if (op === 9) s.write(Buffer.from([138, 0]));
    else if (op === 1) cb(p.toString());
  }
}

function start() {
  if (S.quiz) { clearTimeout(S.quiz.tm); clearTimeout(S.quiz.nx); }
  const qs = [0, 1, 2, 3, 4, 5].map(t => { const c = Q.filter(q => q[0] === t); return c[Math.random() * c.length | 0]; });
  S.quiz = { qs, i: -1, open: false };
  S.sc.clear(); for (const p of S.players.values()) S.sc.set(p.name, 0);
  next();
}
function next() {
  const z = S.quiz; z.i++;
  if (z.i >= z.qs.length) return end();
  const [, q, o, c] = z.qs[z.i];
  const opts = o.map((x, k) => [x, k === c]).sort(() => Math.random() - 0.5);
  z.ans = new Map(); z.open = true; z.t0 = Date.now(); z.cor = opts.findIndex(x => x[1]);
  z.qm = { t: 'q', i: z.i, n: z.qs.length, q, o: opts.map(x => x[0]), sec: T / 1000 };
  bc(z.qm);
  z.tm = setTimeout(reveal, T);
}
function reveal() {
  const z = S.quiz;
  if (!z || !z.open) return;
  z.open = false; clearTimeout(z.tm);
  const cnt = [0, 0, 0, 0];
  for (const [n, a] of z.ans) {
    cnt[a.k]++;
    if (a.k === z.cor) S.sc.set(n, (S.sc.get(n) || 0) + Math.max(500, Math.round(1000 - 500 * a.ms / T)));
  }
  for (const s of C) {
    const p = S.players.get(s);
    send(s, { t: 'r', cor: z.cor, cnt, score: p ? S.sc.get(p.name) || 0 : 0, ok: p && z.ans.has(p.name) ? z.ans.get(p.name).k === z.cor : null });
  }
  z.nx = setTimeout(next, 5000);
}
function end() {
  const top = [...S.sc].sort((a, b) => b[1] - a[1]).slice(0, 3);
  bc({ t: 'end', top });
}

function on(s, m) {
  if (m.t === 'host') { if (KEY && m.key !== KEY) return; S.host = s; send(s, { t: 'slide', i: S.slide }); send(s, info()); }
  else if (m.t === 'join') {
    const name = String(m.name || '?').slice(0, 14);
    for (const [k, p] of S.players) if (p.name === name && k !== s) S.players.delete(k);
    S.players.set(s, { name, ip: s.ip });
    if (!S.sc.has(name)) S.sc.set(name, 0);
    send(s, { t: 'slide', i: S.slide }); if (S.term) send(s, S.term);
    if (S.quiz && S.quiz.open) send(s, S.quiz.qm);
    bc(info());
  }
  else if (s === S.host && m.t === 'slide') { S.slide = m.i; bc({ t: 'slide', i: m.i }); }
  else if (s === S.host && m.t === 'start') start();
  else if (s === S.host && m.t === 'term') { S.term = m; for (const c of C) if (c !== s) send(c, m); }
  else if (m.t === 'a') {
    const z = S.quiz;
    const p = S.players.get(s);
    if (z && z.open && p && !z.ans.has(p.name) && m.k >= 0 && m.k < 4) {
      z.ans.set(p.name, { k: m.k, ms: Date.now() - z.t0 });
      bc({ t: 'ac', n: z.ans.size });
      if (z.ans.size >= S.players.size) reveal();
    }
  }
}

const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/qr.svg' && qr) { r.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return r.end(qr); }
  if (u.pathname === '/' || u.pathname === '/host') {
    if (u.pathname === '/host' && KEY && u.searchParams.get('key') !== KEY) { r.writeHead(403); return r.end(); }
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return r.end(HTML);
  }
  r.writeHead(404); r.end();
});
srv.on('upgrade', (q, s) => {
  const key = crypto.createHash('sha1').update(q.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  s.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + key + '\r\n\r\n');
  s.ip = String(q.headers['x-forwarded-for'] || '').split(',')[0].trim() || String(s.remoteAddress || '').replace('::ffff:', '');
  C.add(s);
  s.on('data', d => parse(s, d, m => { try { on(s, JSON.parse(m)); } catch {} }));
  s.on('close', () => { C.delete(s); S.players.delete(s); if (S.host === s) S.host = null; bc(info()); });
  s.on('error', () => {});
});
setInterval(() => { for (const s of C) if (!s.destroyed) s.write(Buffer.from([137, 0])); }, 25000);
srv.listen(PORT, '0.0.0.0', () => console.log(`Host:  http://localhost:${PORT}/host${KEY ? '?key=' + KEY : ''}\nJugadores:  ${URL_}${qr ? '' : '\n(sin QR: ejecuta npm i qrcode una vez)'}`));
