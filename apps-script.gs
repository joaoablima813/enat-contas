// Cole isto em Extensões > Apps Script de uma folha Google nova. Troque o código pelo seu APP_CODE.
const CODE = 'O_SEU_CODIGO';
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  if (d.code !== CODE) return ContentService.createTextOutput('no');
  const ss = SpreadsheetApp.getActive();
  Object.keys(d.sheets).forEach(n => {
    const rows = d.sheets[n], sh = ss.getSheetByName(n) || ss.insertSheet(n);
    if (sh.getFilter()) sh.getFilter().remove();
    sh.clear();
    if (!rows.length) return;
    sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sh.setFrozenRows(1);
    sh.getDataRange().createFilter();
  });
  return ContentService.createTextOutput('ok');
}
