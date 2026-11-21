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
    const d = JSON.parse(e.postData.contents), n = String(d.n).slice(0, 14), p = [n, Number(d.s) || 0, Number(d.c) || 0, Number(d.t) || 0, new Date()], s = sh(), v = s.getDataRange().getValues();
    for (let i = 1; i < v.length; i++) if (v[i][0] === n) { if (p[1] > v[i][1]) s.getRange(i + 1, 1, 1, 5).setValues([p]); return ok(); }
    s.appendRow(p); return ok();
  } finally { l.releaseLock(); }
}
function doGet() {
  const v = sh().getDataRange().getValues().slice(1).map(r => ({ n: r[0], s: r[1], c: r[2], t: r[3] })).sort((a, b) => b.s - a.s || a.t - b.t);
  return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);
}
