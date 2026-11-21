const S = 'Resultados';

function sh() {
  const b = SpreadsheetApp.getActiveSpreadsheet();
  if (!b) throw new Error('No hay hoja de cálculo vinculada');
  let s = b.getSheetByName(S);
  if (!s) { s = b.insertSheet(S); s.appendRow(['Nombre', 'Puntaje', 'Aciertos', 'Segundos', 'Fecha']); }
  return s;
}

function ok() { return ContentService.createTextOutput('ok'); }

function doPost(e) {
  const l = LockService.getScriptLock(); l.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents), n = String(d.n).replace(/^[=+\-@\s]+/, '').slice(0, 14), k = (x, m) => Math.min(m, Math.max(0, Number(x) || 0)), p = [n, k(d.s, 10000), k(d.c, 10), k(d.t, 300), new Date()];
    if (!n) return ok();
    const s = sh(), v = s.getDataRange().getValues();
    for (let i = 1; i < v.length; i++) if (v[i][0] === n) { if (p[1] > v[i][1]) s.getRange(i + 1, 1, 1, 5).setValues([p]); return ok(); }
    s.appendRow(p); return ok();
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally { l.releaseLock(); }
}

const C = 'Control';

function ctl() {
  const b = SpreadsheetApp.getActiveSpreadsheet();
  if (!b) throw new Error('No hay hoja de cálculo vinculada');
  let s = b.getSheetByName(C);
  if (!s) { s = b.insertSheet(C); s.getRange('A1:B2').setValues([['estado', 's0'], ['marca', 0]]); }
  return s;
}

function clave() {
  try {
    const prop = PropertiesService.getScriptProperties().getProperty('CLAVE');
    if (prop) return prop;
  } catch (e) {}
  return '1708';
}

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ---- Puesto único de administrador ----
// El admin renueva su puesto solo (latido automático desde la página cada 5 s),
// así que explicar sin tocar nada NO lo expulsa. El puesto solo se libera si la
// página del admin deja de dar señales de vida durante LEASE ms (pestaña cerrada,
// equipo dormido, sin red) o si el admin sale con "bye" o "rel".
const LEASE = 90000, SIDOK = /^[a-z0-9]{8,40}$/;

// Toma o renueva el puesto. true = es tuyo; false = otro admin lo tiene vivo.
function tomar(sid) {
  const l = LockService.getScriptLock(); l.waitLock(5000);
  try {
    const P = PropertiesService.getScriptProperties(), cur = P.getProperty('ADM_SID'), ts = Number(P.getProperty('ADM_TS')) || 0;
    if (cur && cur !== sid && Date.now() - ts < LEASE) return false;
    P.setProperties({ ADM_SID: sid, ADM_TS: String(Date.now()) });
    return true;
  } finally { l.releaseLock(); }
}

function soltar(sid) {
  const l = LockService.getScriptLock(); l.waitLock(5000);
  try {
    const P = PropertiesService.getScriptProperties();
    if (P.getProperty('ADM_SID') === sid) { P.deleteProperty('ADM_SID'); P.deleteProperty('ADM_TS'); }
  } finally { l.releaseLock(); }
}

function estado() {
  const c = CacheService.getScriptCache(), v = c.get('v');
  if (v) return v;
  const x = String(ctl().getRange('B1').getValue() || 's0');
  c.put('v', x, 2);
  return x;
}

function fijar(v, t) {
  const l = LockService.getScriptLock(); l.waitLock(5000);
  try {
    const s = ctl();
    if (t < Number(s.getRange('B2').getValue())) return;
    s.getRange('B1:B2').setValues([[v], [t]]);
    CacheService.getScriptCache().put('v', v, 2);
  } finally { l.releaseLock(); }
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {}, k = clave(), s = String(p.sid || p.s || ''), auth = !!k && String(p.k) === String(k) && SIDOK.test(s);
    if (p.a === 'get') return json({ v: estado() });
    if (p.a === 'adm') {
      if (!auth) return json({ ok: false, r: 'key' });
      const mine = tomar(s);
      return mine ? json({ ok: true, admin: true }) : json({ ok: false, r: 'busy', admin: false });
    }
    if (p.a === 'bye' || p.a === 'rel') { if (auth) soltar(s); return json({ ok: true }); }
    if (p.a === 'set') {
      const v = String(p.v || '');
      if (!auth || !/^(s\d{1,2}|quiz|play|ranking)$/.test(v) || !tomar(s)) return json({ ok: false });
      fijar(v, Number(p.t) || Date.now());
      return json({ ok: true });
    }
    const v = sh().getDataRange().getValues().slice(1).map(r => ({ n: r[0], s: r[1], c: r[2], t: r[3] })).sort((a, b) => b.s - a.s || a.t - b.t);
    return json(v);
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
