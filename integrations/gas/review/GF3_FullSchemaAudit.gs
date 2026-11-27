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

/** Pure fixture tests; no spreadsheet access. */
function GF3_全列照合自己テスト(){
 const source={'車両台帳':['VehicleID','車番'],'名変待ち管理':['受付ID'],'ドライバーマスター':['DriverID']};
 const clone=()=>JSON.parse(JSON.stringify(source));
 const cases=[
 ['same',()=>clone(),true],
 ['append approved candidate',()=>{const t=clone();t['車両台帳'].push('車両フォルダ');return t;},true],
 ['missing',()=>{const t=clone();t['車両台帳'].pop();return t;},false],
 ['reorder',()=>{const t=clone();t['車両台帳'].reverse();return t;},false],
 ['duplicate',()=>{const t=clone();t['車両台帳'].push('VehicleID');return t;},false],
 ['blank',()=>{const t=clone();t['車両台帳'].push('');return t;},false],
 ['extra sheet',()=>Object.assign(clone(),{'旧台帳':['ID']}),false],
 ['missing sheet',()=>{const t=clone();delete t['名変待ち管理'];return t;},false]
 ];
 for(const [name,fixture,expected] of cases)if(GF3_FullSchemaAudit_(source,fixture()).ready!==expected)throw Error('gf3_fixture_failed:'+name);
 const result={passed:cases.length};console.log(JSON.stringify(result));return result;
}

/** Compare retained records by immutable ID; logs counts only, never personal data.
 * Dummy-only target is expected to differ from production. Never copies records. */
function GF3_保持照合読み取り(){
 const p=PropertiesService.getScriptProperties();
 const source='17IzIUJeYQw3nO8GZsUSCgLfHVECNINZNkQdg38GW57o';
 if(p.getProperty('GF3_REVIEWED_SOURCE_BOOK_ID')!==source)throw Error('source_denied');
 const target=GF3_Open_(),original=SpreadsheetApp.openById(source);
 const canonical=v=>{
 if(v instanceof Date)return ['date',v.getTime()];
 if(Array.isArray(v))return v.map(canonical);
 if(v&&typeof v.getA1Notation==='function')return ['range',v.getSheet().getName(),v.getA1Notation()];
 return v;
 };
 const read=(book,name,key)=>{
 const s=book.getSheetByName(name),range=s.getDataRange(),values=range.getValues(),formulas=range.getFormulasR1C1(),rules=range.getDataValidations(),formats=range.getNumberFormats(),rich=range.getRichTextValues();
 const headers=values[0].map(v=>String(v).trim()),idx=headers.indexOf(key),records=new Map();let duplicate=0,unkeyed=0;
 if(idx<0||headers.filter(x=>x===key).length!==1)throw Error('key_header_invalid');
 for(let i=1;i<values.length;i++){
 const id=String(values[i][idx]??'').trim();
 if(!id){if(values[i].some(v=>v!==''&&v!==false&&v!=null)||formulas[i].some(Boolean))unkeyed++;continue;}
 if(records.has(id)){duplicate++;continue;}
 records.set(id,headers.map((k,j)=>{
 const rule=rules[i][j],rt=rich[i][j];
 return {value:canonical(values[i][j]),formula:formulas[i][j],format:formats[i][j],rule:rule?[String(rule.getCriteriaType()),canonical(rule.getCriteriaValues()),rule.getAllowInvalid(),rule.getHelpText()]:null,links:rt?rt.getRuns().map(run=>[run.getStartIndex(),run.getEndIndex(),run.getLinkUrl()]).filter(x=>x[2]):[]};
 }));
 }
 return {headers,records,duplicate,unkeyed};
 };
 const result={sheets:{},ready:false};
 for(const [name,key] of [['車両台帳','VehicleID'],['名変待ち管理','受付ID'],['ドライバーマスター','DriverID']]){
 const a=read(original,name,key),b=read(target,name,key);
 const counts={sourceRows:a.records.size,targetRows:b.records.size,missingRows:0,extraRows:0,matchedRows:0,duplicateSource:a.duplicate,duplicateTarget:b.duplicate,unkeyedSource:a.unkeyed,unkeyedTarget:b.unkeyed,missingColumns:0,value:0,formula:0,format:0,rule:0,links:0};
 const pairs=a.headers.flatMap((h,i)=>{if(!h)return [];const j=b.headers.indexOf(h);if(j<0){counts.missingColumns++;return [];}return [[i,j]];});
 for(const [id,row] of a.records){const other=b.records.get(id);if(!other){counts.missingRows++;continue;}counts.matchedRows++;for(const [i,j] of pairs)for(const k of ['value','formula','format','rule','links'])if(JSON.stringify(row[i][k])!==JSON.stringify(other[j][k]))counts[k]++;}
 for(const id of b.records.keys())if(!a.records.has(id))counts.extraRows++;
 result.sheets[name]=counts;
 }
 result.ready=Object.values(result.sheets).every(x=>Object.keys(x).filter(k=>!['sourceRows','targetRows','matchedRows'].includes(k)).every(k=>x[k]===0));
 console.log(JSON.stringify(result));return result;
}
