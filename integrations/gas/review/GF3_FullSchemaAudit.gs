/** Read-only full header parity audit; no writes or private values in logs.
 * Pass the explicitly reviewed source workbook ID and the isolated target ID.
 * The caller must run in the new validation GAS.
 */
function GF3_FullSchemaAudit_(sourceHeaders,targetHeaders){
 const retained=['車両台帳','名変待ち管理','ドライバーマスター'];
 const result={missingSheets:[],extraSheets:Object.keys(targetHeaders).filter(k=>!retained.includes(k)),sheets:{}};
 for(const name of retained){
  if(!sourceHeaders[name]||!targetHeaders[name]){result.missingSheets.push(name);continue;}
  const clean=a=>a.map(x=>String(x??'').trim());
  const s=clean(sourceHeaders[name]),t=clean(targetHeaders[name]);
  const dup=a=>[...new Set(a.filter((x,i)=>x&&a.indexOf(x)!==i))];
  result.sheets[name]={sourceColumns:s.length,targetColumns:t.length,
   missing:s.filter(x=>x&&!t.includes(x)),extra:t.filter(x=>x&&!s.includes(x)),
   sourceDuplicates:dup(s),targetDuplicates:dup(t),
   sourceBlankPositions:s.flatMap((x,i)=>x?[]:[i+1]),
   targetBlankPositions:t.flatMap((x,i)=>x?[]:[i+1]),
   positionalDifferences:s.flatMap((x,i)=>x&&x!==t[i]?[i+1]:[])};
 }
 result.ready=!result.missingSheets.length&&!result.extraSheets.length&&Object.values(result.sheets).every(x=>!x.missing.length&&!x.sourceDuplicates.length&&!x.targetDuplicates.length&&!x.positionalDifferences.length&&!x.sourceBlankPositions.length&&!x.targetBlankPositions.length);
 return result;
}
function GF3_検証全列照合(){
 const p=PropertiesService.getScriptProperties();
 const target='1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0';
 const source=p.getProperty('GF3_REVIEWED_SOURCE_BOOK_ID');
 const script=ScriptApp.getScriptId();
 if(!source||source===target||source==='1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU'||p.getProperty('GF3_APPROVED_BOOK_ID')!==target||p.getProperty('GF3_EXPECTED_SCRIPT_ID')!==script||p.getProperty('GF3_VALIDATION_ENABLED')!=='true'||['1avsrC0dTZOr84olefKKGrwyqGUUC-MhME5vsqqIO4TZOlsK8BoCLFmJm','1rRpYdmZsCocUtldRJrpKokpX_Km_NPw0F8h3SOaiykHiR3y4kTgBdSt5'].includes(script))throw Error('gf3_audit_configuration_denied');
 const read=id=>Object.fromEntries(SpreadsheetApp.openById(id).getSheets().map(s=>[s.getName(),s.getLastColumn()?s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0]:[]]));
 const result=GF3_FullSchemaAudit_(read(source),read(target));
 console.log(JSON.stringify(result));return result;
}
