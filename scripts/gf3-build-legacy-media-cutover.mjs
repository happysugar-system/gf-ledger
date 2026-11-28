import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw Error('Usage: node scripts/gf3-build-legacy-media-cutover.mjs SOURCE OUTPUT');
const read = name => readFileSync(resolve(source, name + '.js'), 'utf8').replace(/\r\n/g, '\n');
const out = new Map();
function replaceOnce(value, pattern, replacement) {
  if ([...value.matchAll(new RegExp(pattern.source, 'gm'))].length !== 1)
    throw Error('Legacy source does not match expected anchor: ' + pattern.source);
  return value.replace(pattern, replacement);
}

const legacySheet = name => new RegExp('^ +const '+name+'\\s*=\\s*必須シートを取得する_\\(\\s*(?:スプレッドシート|ss),\\s*シート名\\.'+name+'\\s*\\);\\n','m');
const photoCall = /^( +)車両状態フォルダリンクを更新する_\(\s*(スプレッドシート|ss),\s*車両状況,\s*(VehicleID|対象VehicleID),\s*車両状態親フォルダ\s*\);/m;
const canonicalCall = '$1車両状態フォルダリンクを更新する_($2,$3,車両状態親フォルダ);';

let drive = replaceOnce(read('50_Drive管理'),legacySheet('車両状況'),'');
drive=replaceOnce(drive,/  セルを書き込む_\(\s*車両台帳,\s*行番号,\s*'車両フォルダ',\s*車両フォルダ\.getUrl\(\)\s*\);/,
  "  GF3_LegacyMediaStoreFolder_(車両台帳,VehicleID,'車両フォルダ',車両フォルダ);");
drive=replaceOnce(drive,/  \/\/ 車両状況\n[\s\S]*?  SpreadsheetApp.flush\(\);/,
  `  GF3_LegacyMediaStoreFolder_(車両台帳,VehicleID,'📷車両状態フォルダ',車両状態フォルダ);
  GF3_LegacyMediaStoreFolder_(車両台帳,VehicleID,'📁 車両書類フォルダ',車両書類フォルダ);
  SpreadsheetApp.flush();`);
out.set('50_Drive管理.gs',drive);

let photo=read('70_車両写真');
for(let i=0;i<2;i++){
  if(!legacySheet('車両状況').test(photo)||!photoCall.test(photo))throw Error('Missing photo save anchor');
  photo=photo.replace(legacySheet('車両状況'),'').replace(photoCall,canonicalCall);
}
photo=replaceOnce(photo,/^function 車両状態フォルダリンクを更新する_\([\s\S]*?(?=^function 正しい日付にする_)/m,
  `function 車両状態フォルダリンクを更新する_(book,id,parent){
  const sheet=必須シートを取得する_(book,シート名.車両台帳);
  GF3_LegacyMediaStoreFolder_(sheet,id,'📷車両状態フォルダ',parent);
  return GF3_CanonicalPhotoDates_(parent);
}

`);
photo=replaceOnce(photo,/^function 車両写真リンク診断テスト\(\)[\s\S]*$/m,
  `function 車両写真リンク診断テスト(){
  const book=対象スプレッドシートを開く_();
  const sheet=必須シートを取得する_(book,シート名.車両台帳);
  const column=列番号を取得する_(sheet,'VehicleID');
  if(sheet.getLastRow()<2)return [];
  return sheet.getRange(2,column,sheet.getLastRow()-1,1).getDisplayValues().flat()
    .filter(Boolean).map(id=>({VehicleID:id,links:GF3_ReadCanonicalMedia_(
      GF3_CanonicalRow_(sheet,'VehicleID',id,GF3_MEDIA_FIELDS_))}));
}
`);
out.set('70_車両写真.gs',photo);

let mobile=replaceOnce(read('80_スマホ画面'),legacySheet('車両状況'),'');
mobile=replaceOnce(mobile,photoCall,canonicalCall);
mobile=replaceOnce(mobile,/^  車両写真リンクを利用者管理へ同期する\(\);\n/m,'');
out.set('80_スマホ画面.gs',mobile);

const review = new URL('../integrations/gas/review/',import.meta.url);
const base=readFileSync(new URL('GF3_CanonicalMedia.gs',review),'utf8');
out.set('GF3_LegacyMediaAdapter.gs',base+`
function GF3_LegacyMediaStoreFolder_(sheet,id,field,folder){
  const row=GF3_CanonicalRow_(sheet,'VehicleID',id,[field]);
  const cell=sheet.getRange(row.number,row.columns[field]+1);
  const url=folder.getUrl(), saved=GF3_ReadCanonicalMedia_(row)[field];
  if(saved===url)return;
  if(cell.getFormula()||cell.getDataValidation()||cell.getValue()!=='')
    throw Error('gf3_media_link_conflict:'+field);
  cell.setValue(url);
}
`);
const legacyLookup=/シート名\.(車両状況|利用者管理)|getSheetByName\(\s*['"](?:車両状況|利用者管理)['"]/;
mkdirSync(destination,{recursive:true});
for(const [name,code] of out){
  if(legacyLookup.test(code))throw Error('Legacy sheet lookup remains in '+name);
  writeFileSync(resolve(destination,name),code);
}
