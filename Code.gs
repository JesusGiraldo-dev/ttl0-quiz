const S = 'Resultados';
function sh() {
  const b = SpreadsheetApp.getActiveSpreadsheet();
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
  } finally { l.releaseLock(); }
}
const C = 'Control';
function ctl() {
  const b = SpreadsheetApp.getActiveSpreadsheet();
  let s = b.getSheetByName(C);
  if (!s) { s = b.insertSheet(C); s.getRange('A1:B2').setValues([['estado', 's0'], ['marca', 0]]); }
  return s;
}
function clave() { return PropertiesService.getScriptProperties().getProperty('CLAVE'); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
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
  const p = (e && e.parameter) || {}, k = clave();
  if (p.a === 'get') return json({ v: estado() });
  if (p.a === 'chk') return json({ ok: !!k && p.k === k });
  if (p.a === 'set') {
    const v = String(p.v || '');
    if (!k || p.k !== k || !/^(s\d{1,2}|quiz|play|ranking)$/.test(v)) return json({ ok: false });
    fijar(v, Number(p.t) || Date.now());
    return json({ ok: true });
  }
  const v = sh().getDataRange().getValues().slice(1).map(r => ({ n: r[0], s: r[1], c: r[2], t: r[3] })).sort((a, b) => b.s - a.s || a.t - b.t);
  return json(v);
}
