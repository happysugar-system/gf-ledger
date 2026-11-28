import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw Error('Usage: node scripts/gf3-build-legacy-setup-cutover.mjs SOURCE OUTPUT');
const read = name => readFileSync(resolve(source,name+'.js'),'utf8').replace(/\r\n/g,'\n');
function replaceOnce(code, pattern, replacement) {
  if ([...code.matchAll(new RegExp(pattern.source,'gm'))].length !== 1)
    throw Error('Unexpected source shape: '+pattern.source);
  return code.replace(pattern,replacement);
}

const waitingFields="['受付ID','氏名','DriverID','ステータス','LINE受付ID','受付識別子','割当VehicleID','割当車番']";
let initial=replaceOnce(read('01_初期構築'),/^    \{ 名前: シート名\.利用者管理, 列: 利用者管理の列 \},\s*\{ 名前: シート名\.車両状況, 列: 車両状況の列 \},/m,
  "    { 名前: '名変待ち管理', 列: "+waitingFields+" },");
initial=initial.replace(/^[ \t]*(?:利用者管理|車両状況):\[[^\n]*\],?\n/gm,'')
 .replace(/^[ \t]*\[シート名\.(?:利用者管理|車両状況),\[[^\n]*\]\],?\n/gm,'')
 .replace(/シート名\.利用者管理,シート名\.車両状況,/, "'名変待ち管理',")
 .replace('既存4シート＋','基本3シート＋');
initial=replaceOnce(initial,/^    ヘッダーを設定する_\(シート, 設定.列\);/m,
  `    if(シート.getLastRow()===0)ヘッダーを設定する_(シート, 設定.列);
    else{
      const headers=シート.getRange(1,1,1,シート.getLastColumn()).getDisplayValues()[0].map(x=>x.trim());
      if(設定.列.some(name=>!headers.includes(name)))throw Error('既存シートの必須列不足:'+設定.名前);
    }`);

let setup=replaceOnce(read('99_初期セットアップ'),/^  初期シートを準備する_\(\s*ss,\s*シート名\.利用者管理,\s*利用者管理の列\s*\);\s*初期シートを準備する_\(\s*ss,\s*シート名\.車両状況,\s*車両状況の列\s*\);/m,
  "  初期シートを準備する_(ss,'名変待ち管理',"+waitingFields+");");
setup=replaceOnce(setup,/^    シート名\.利用者管理,\s*シート名\.車両状況,/m,"    '名変待ち管理',");

let display=read('37_各シート表示設定');
for(const name of ['車両状況','利用者管理'])
  display=replaceOnce(display,new RegExp('^  const '+name+' =\\s*必須シートを取得する_\\(ss, シート名\\.'+name+'\\);','m'),'');
display=replaceOnce(display,/^  表示共通設定_\(車両状況,[\s\S]*?(?=^  表示共通設定_\(ドライバー,)/m,
  "  表示共通設定_(必須シートを取得する_(ss,'名変待ち管理'),'#E2F0D9');\n");
display=replaceOnce(display,/^  const 車両状況 =\s*ss.getSheetByName\(シート名\.車両状況\);[\s\S]*?(?=^  SpreadsheetApp.flush\(\);)/m,
  `  const ledger=必須シートを取得する_(ss,シート名.車両台帳);
  for(const [field,label] of [
    ['📷車両状態フォルダ','📷 車両状態を見る'],['📁 車両書類フォルダ','📄 車両書類を見る'],
    ['🔧整備書類フォルダ','🔧 整備書類を見る'],['📄 最新車両書類','📄 現在の車両書類を見る'],
    ['前使用者 車両書類','📄 前使用者の車両書類を見る'],['前々使用者 車両書類','📄 前々使用者の車両書類を見る']
  ])フォルダリンク表示名を整える_(ledger,field,label);
`);
display=display.replace('4シートの表示設定','3シートの表示設定');
display=replaceOnce(display,/^    const セル = シート.getRange\(行, 列番号\);/m,
  '    const セル = シート.getRange(行, 列番号);\n    if(セル.getFormula()||セル.getDataValidation())continue;');

const output=new Map([['01_初期構築.gs',initial],['37_各シート表示設定.gs',display],['99_初期セットアップ.gs',setup]]);
mkdirSync(destination,{recursive:true});
for(const [name,code] of output){
  if(/シート名\.(?:車両状況|利用者管理)|getSheetByName\(\s*['"](?:車両状況|利用者管理)['"]/.test(code))
    throw Error('Legacy sheet lookup remains in '+name);
  new vm.Script(code);
  writeFileSync(resolve(destination,name),code);
}
