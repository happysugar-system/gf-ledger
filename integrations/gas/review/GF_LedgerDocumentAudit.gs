/** Read-only. This function takes a workbook handle from a trusted GAS caller.
 * Never logs VehicleIDs, document titles or links.
 */
function GF_LedgerDocumentAudit_(book) {
  const read = (name, documentColumn) => {
    const sheet = book.getSheetByName(name);
    if (!sheet || sheet.getLastColumn() < documentColumn) throw Error('document_column_missing: ' + name);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(s => s.trim());
    const idColumn = headers.indexOf('VehicleID') + 1;
    if (!idColumn || headers.lastIndexOf('VehicleID') !== idColumn - 1) throw Error('vehicle_id_header_invalid: ' + name);
    if (!/車両書類/.test(headers[documentColumn - 1])) throw Error('document_header_invalid: ' + name);
    const size = sheet.getLastRow() - 1;
    if (size < 1) return [];
    const ids = sheet.getRange(2, idColumn, size, 1).getDisplayValues();
    const cells = sheet.getRange(2, documentColumn, size, 1);
    const display = cells.getDisplayValues();
    const rich = cells.getRichTextValues();
    const formulas = cells.getFormulas();
    return ids.map(([id], i) => {
      const text = display[i][0].trim();
      const formula = formulas[i][0];
      const links = (rich[i][0]?.getRuns() || []).map(run => run.getLinkUrl()).filter(Boolean);
      const literal = formula.match(/^=HYPERLINK\(\s*"(https:\/\/[^"]+)"/i)?.[1];
      if (literal) links.push(literal);
      if (/^https:\/\/\S+$/.test(text)) links.push(text);
      return {id: id.trim(), occupied: Boolean(text || formula || links.length), links: [...new Set(links)].sort()};
    });
  };
  const ledger = read('車両台帳', 62);
  const status = read('車両状況', 18);
  const users = read('利用者管理', 13);
  return GF_LedgerDocumentAuditCompare_(ledger, status, users);
}

function GF_LedgerDocumentAuditCompare_(ledger, status, users) {
  const index = rows => {
    const entries = new Map();
    for (const row of rows) {
      if (!row.id && !row.occupied) continue;
      if (!/^V\d{6}$/.test(row.id) || entries.has(row.id)) throw Error('invalid_or_duplicate_vehicle_id');
      entries.set(row.id, row);
    }
    return entries;
  };
  const dest = index(ledger);
  const sources = [index(status), index(users)];
  const legacyIds = new Set(sources.flatMap(source => [...source.keys()]));
  const compare = source => {
    const counts = {same: 0, different: 0, ledgerBlank: 0, missingLedger: 0, unresolved: 0};
    for (const [id, row] of source) {
      if (!row.occupied) continue;
      const target = dest.get(id);
      if (!target) counts.missingLedger++;
      else if (!row.links.length || (target.occupied && !target.links.length)) counts.unresolved++;
      else if (!target.occupied) counts.ledgerBlank++;
      else if (JSON.stringify(row.links) === JSON.stringify(target.links)) counts.same++;
      else counts.different++;
    }
    return counts;
  };
  return {
    status: compare(sources[0]),
    users: compare(sources[1]),
    legacyOnly: [...legacyIds].filter(id => !dest.has(id)).length,
    ledgerOnly: [...dest.keys()].filter(id => !legacyIds.has(id)).length,
  };
}
