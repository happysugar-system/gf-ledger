import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw Error('Usage: node scripts/gf3-build-legacy-sync-cutover.mjs SOURCE OUTPUT');
const read = name => readFileSync(resolve(source,name+'.js'),'utf8').replace(/\r\n/g,'\n');
function replaceOnce(code, pattern, replacement) {
  if ([...code.matchAll(new RegExp(pattern.source,'gm'))].length !== 1)
    throw Error('Unexpected source shape: '+pattern.source);
  return code.replace(pattern,replacement);
}
function removeFunction(code, name, next, replacement='') {
  return replaceOnce(code,new RegExp('^function '+name+'\\([\\s\\S]*?(?=^function '+next+'\\()','m'),replacement);
}

let sync=read('30_車両同期');
for(const name of ['利用者管理','車両状況']){
  sync=replaceOnce(sync,new RegExp('^    const '+name+' =\\s*必須シートを取得する_\\(スプレッドシート, シート名\\.'+name+'\\);\\n','m'),'');
  sync=replaceOnce(sync,new RegExp('^    '+name+'を更新する_\\([\\s\\S]*?^    \\);\\n','m'),'');
}
sync=removeFunction(sync,'利用者管理を更新する_','車両状況を更新する_');
sync=removeFunction(sync,'車両状況を更新する_','次の予定を判定する_');
sync=removeFunction(sync,'車両台帳編集統合トリガー','車両同期キューへ追加する_');
sync=replaceOnce(sync,/^    現在使用者車両書類リンクを同期する_\([\s\S]*?^    \);/m,
  '    現在使用者車両書類リンクを同期する_(車両台帳,車両データ);');
sync=replaceOnce(sync,/^  セルを書き込む_\(車両台帳, 行番号, '車両フォルダ', 車両URL\);\s*const スプレッドシート = 車両台帳.getParent\(\);[\s\S]*?(?=^  return 車両URL;)/m,
  `  GF3_LegacyMediaStoreFolder_(車両台帳,VehicleID,'車両フォルダ',車両フォルダ);
  GF3_LegacyMediaStoreFolder_(車両台帳,VehicleID,'📷車両状態フォルダ',車両状態フォルダ);
  GF3_LegacyMediaStoreFolder_(車両台帳,VehicleID,'📁 車両書類フォルダ',車両書類フォルダ);
  GF3_LegacyMediaStoreFolder_(車両台帳,VehicleID,'🔧整備書類フォルダ',整備書類フォルダ);
`);
sync=removeFunction(sync,'現在使用者車両書類リンクを同期する_','現在使用者の最新車両書類URLを取得する_',
  `function 現在使用者車両書類リンクを同期する_(sheet,vehicle){
  const id=String(vehicle.VehicleID||'');
  const name=String(vehicle['現在使用者']||'').trim();
  if(!id||!name||!vehicle.DriverID)return;
  const field='📄 最新車両書類';
  const row=GF3_CanonicalRow_(sheet,'VehicleID',id,[field]);
  if(GF3_ReadCanonicalMedia_(row)[field])return;
  const url=GF3_CanonicalDriveUrl_(現在使用者の最新車両書類URLを取得する_(id,vehicle.DriverID,name));
  if(url)GF3_LegacyMediaStoreFolder_(sheet,id,field,{getUrl:()=>url});
}

`);

const screen=read('36_画面リンク');
const tail=screen.slice(screen.indexOf('function シート表示セルURLを作る_('));
if(!tail.startsWith('function '))throw Error('Screen link helper missing');
const links=`function 画面リンクを全部更新する(){
  const book=対象スプレッドシートを開く_();
  const sheet=必須シートを取得する_(book,シート名.車両台帳);
  const col=列番号を取得する_(sheet,'VehicleID');
  if(sheet.getLastRow()<2)return;
  for(const id of sheet.getRange(2,col,sheet.getLastRow()-1,1).getDisplayValues().flat().filter(Boolean))
    GF3_UpdateCanonicalVehicleScreenLinks_(book,id);
}

`+tail;

let calendar=removeFunction(read('40_車両予定カレンダー'),'車両1台の画面リンクを更新する_','リンク付き文字列を書き込む_',
  `function 車両1台の画面リンクを更新する_(id){
  return GF3_UpdateCanonicalVehicleScreenLinks_(対象スプレッドシートを開く_(),id);
}

`);
calendar=replaceOnce(calendar,/^  const cal=予定種類のカレンダーを取得する_\(種類\);\s*if\(!cal\)return '';[^\n]*\s*const p=行データを取得する_\(管理,行\);\s*let e=null, id=String\(p\['CalendarEventID'\]\|\|''\).trim\(\);\s*if\(id\)\{try\{e=cal.getEventById\(id\);\}catch\(_\)\{e=null;\}\}/m,
  `  const p=行データを取得する_(管理,行);
  const id=String(p['CalendarEventID']||'').trim();
  const cal=予定種類のカレンダーを取得する_(種類);
  let e=GF3_ResolveCalendarEvent_(cal,id);
  if(!cal)return '';`);
calendar=replaceOnce(calendar,/^  return e\.getId\(\);/m,'  return id||e.getId();');

const output=new Map([
  ['30_車両同期.gs',sync],['36_画面リンク.gs',links],['40_車両予定カレンダー.gs',calendar],
  ['GF3_CanonicalScreenLinks.gs',readFileSync(new URL('../integrations/gas/review/GF3_CanonicalScreenLinks.gs',import.meta.url),'utf8')],
]);
mkdirSync(destination,{recursive:true});
for(const [name,code] of output){
  if(/シート名\.(?:車両状況|利用者管理)|getSheetByName\(\s*['"](?:車両状況|利用者管理)['"]/.test(code))
    throw Error('Legacy sheet lookup remains in '+name);
  writeFileSync(resolve(destination,name),code);
}
