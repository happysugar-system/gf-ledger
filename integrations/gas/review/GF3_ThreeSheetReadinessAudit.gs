/** GOLD FIRST: read-only three-sheet acceptance gate. No production fallback.
 * New validation GAS only. Never install over old shared validation entrypoints.
 */
function GF3_ThreeSheetSchemaAudit_(headersBySheet){
 const spec={
  '車両台帳':{
   core:['区分/ステータス','管理区分','VehicleID','車番','現在使用者','DriverID','前DriverID','前使用者','前使用者 車両書類','前々DriverID','前々使用者','前々使用者 車両書類','返却/12点検','📄 最新車両書類'],
   documents:['車両フォルダ','📷車両状態フォルダ','📁 車両書類フォルダ','🔧整備書類フォルダ'],
   driverProjection:['フリガナ','電話番号','紹介元','所属会社名','稼働エリア','契約者メールアドレス','緊急連絡先氏名','緊急連絡先メールアドレス','ドライバーステータス','ドライバー備考']
  },
  '名変待ち管理':{
   core:['受付ID','氏名','割当VehicleID','LINE受付ID','受付識別子','DriverID']
  },
  'ドライバーマスター':{
   core:['DriverID','氏名','ステータス','所属会社名','稼働エリア'],
   driverDetails:['フリガナ','電話番号','紹介元','契約者メールアドレス','緊急連絡先氏名','緊急連絡先メールアドレス','備考']
  }
 };
 const actual=Object.keys(headersBySheet);
 const expected=Object.keys(spec);
 const missingSheets=expected.filter(k=>!actual.includes(k));
 const extraSheets=actual.filter(k=>!expected.includes(k));
 const missing={},duplicate={};
 for(const sheet of expected){
  const names=(headersBySheet[sheet]||[]).map(v=>String(v==null?'':v).trim()).filter(Boolean);
  duplicate[sheet]=[...new Set(names.filter((v,i)=>names.indexOf(v)!==i))];
  missing[sheet]={};
  for(const [category,fields] of Object.entries(spec[sheet])){
   missing[sheet][category]=fields.filter(k=>!names.includes(k));
  }
 }
 const ready=!missingSheets.length&&!extraSheets.length&&
  Object.values(duplicate).every(x=>!x.length)&&
  Object.values(missing).every(x=>Object.values(x).every(v=>!v.length));
 return {ready,missingSheets,extraSheets,missing,duplicate};
}
/** Does not write. Both script ID and workbook ID must be explicitly approved. */
function GF3_検証3シート接続診断(){
 const p=PropertiesService.getScriptProperties();
 const script=ScriptApp.getScriptId();
 const target='1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0';
 const oldScripts=[
  '1avsrC0dTZOr84olefKKGrwyqGUUC-MhME5vsqqIO4TZOlsK8BoCLFmJm',
  '1rRpYdmZsCocUtldRJrpKokpX_Km_NPw0F8h3SOaiykHiR3y4kTgBdSt5'
 ];
 const scriptApproved=!!script&&!oldScripts.includes(script)&&p.getProperty('GF3_EXPECTED_SCRIPT_ID')===script;
 const bookApproved=p.getProperty('GF3_APPROVED_BOOK_ID')===target;
 const enabled=p.getProperty('GF3_VALIDATION_ENABLED')==='true';
 if(!scriptApproved||!bookApproved||!enabled){
  return {ready:false,scriptApproved,bookApproved,enabled,reason:'configuration_denied'};
 }
 const book=SpreadsheetApp.openById(target);
 const headers={};
 for(const s of book.getSheets()){
  headers[s.getName()]=s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0];
 }
 const audit=GF3_ThreeSheetSchemaAudit_(headers);
 return Object.assign({scriptApproved,bookApproved,enabled},audit);
}
/** Call this before wiring any staff write to the three-sheet test workbook. */
function GF3_検証3シート書込前確認(){
 const result=GF3_検証3シート接続診断();
 if(!result.ready)throw Error('three_sheet_cutover_not_ready');
 return true;
}
