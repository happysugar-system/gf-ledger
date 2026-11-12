/**
 * 194_返却受付移行.gs / 車両管理GASに追加
 * 顧客管理の LINE受付スプレッドシートID を使用。
 * 元の車両管理シートは削除しない。
 * ① GF194_移行コピーと照合 → ② GF194_保存先をLINE受付へ切替
 */
function GF194_LINE受付ブックを開く_(){
  const contract=現在の契約情報を取得する_();
  const id=String(contract.LINE受付スプレッドシートID||'').trim();
  if(!id)throw new Error('顧客管理のLINE受付スプレッドシートIDが空です');
  if(id===String(contract.対象スプレッドシートID||''))throw new Error('LINE受付と車両管理が同じブックです。設定を確認してください');
  return SpreadsheetApp.openById(id);
}
function GF194_移行同期_(){
  const oldBook=対象スプレッドシートを開く_();
  const src=oldBook.getSheetByName('LINE返却受付_DEMO');
  if(!src)throw new Error('元のLINE返却受付_DEMOが見つかりません');
  const destBook=GF194_LINE受付ブックを開く_();
  if(!destBook.getSheetByName('LINE受付管理'))throw new Error('接続先にLINE受付管理がありません');
  const source=src.getDataRange().getValues();
  if(source[0].length<16||source[0][0]!=='受付キー')throw new Error('元シートの列構成が想定と違います');
  let dest=destBook.getSheetByName('LINE返却受付_DEMO');
  if(!dest){dest=destBook.insertSheet('LINE返却受付_DEMO');}
  const existing=dest.getLastRow()?dest.getDataRange().getValues():[];
  if(existing.length && JSON.stringify(existing[0].slice(0,16))!==JSON.stringify(source[0].slice(0,16)))throw new Error('移行先の見出しが違います。自動上書きしません');
  const byKey=new Map();
  for(let i=1;i<existing.length;i++){
    const k=String(existing[i][0]);if(!k||byKey.has(k))throw new Error('移行先に空欄・重複キーがあります');
    byKey.set(k,existing[i]);
  }
  const norm=r=>JSON.stringify(r.slice(0,16).map(v=>v instanceof Date?v.getTime():v));
  const additions=[];const seen=new Set();
  for(let i=1;i<source.length;i++){
    const r=source[i],key=String(r[0]);
    if(!key||seen.has(key))throw new Error('移行元の受付キーが空欄または重複しています：行'+(i+1));
    seen.add(key);
    if(byKey.has(key)){
      if(norm(byKey.get(key))!==norm(r))throw new Error('移行先と移行元でデータが異なります：受付キー='+key+'。自動上書きしません');
    }else additions.push(r);
  }
  if(!existing.length){dest.getRange(1,1,1,source[0].length).setValues([source[0]]);}
  if(additions.length){
    const start=dest.getLastRow()+1;
    dest.getRange(start,1,additions.length,source[0].length).setValues(additions);
  }
  SpreadsheetApp.flush();
  const check=dest.getDataRange().getValues();
  const checkMap=new Map(check.slice(1).map(r=>[String(r[0]),r]));
  for(let i=1;i<source.length;i++){
    const key=String(source[i][0]);
    if(!checkMap.has(key)||norm(checkMap.get(key))!==norm(source[i]))throw new Error('コピー後の照合に失敗：'+key);
  }
  console.log('移行照合OK / 元='+Math.max(0,source.length-1)+'件 / 追加='+additions.length+'件 / 移行先='+destBook.getName());
  return {元件数:source.length-1,追加件数:additions.length,移行先:destBook.getName()};
}
function GF194_移行コピーと照合(){
  if(PropertiesService.getScriptProperties().getProperty('GF190_STORAGE_LINE')==='ON')throw new Error('すでに切替済みです');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{return GF194_移行同期_();}finally{lock.releaseLock();}
}
function GF194_保存先をLINE受付へ切替(){
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('GF190_STORAGE_LINE')==='ON'){console.log('すでに切替済み');return;}
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const old=対象スプレッドシートを開く_().getSheetByName('LINE返却受付_DEMO');
    if(!old)throw new Error('元シートがありません');
    const rows=old.getDataRange().getValues();
    const unfinished=rows.slice(1).filter(r=>String(r[8])!=='完了');
    if(unfinished.length)throw new Error('写真保存中など未完了の受付が'+unfinished.length+'件あります。完了または対応確認後に切替してください');
    GF194_移行同期_();
    props.setProperty('GF190_STORAGE_LINE','ON');
    console.log('切替成功：以後の返却受付詳細はLINE受付スプレッドシートに保存します。元シートは保持');
  }finally{lock.releaseLock();}
}
function GF194_保存先を確認(){
  const on=PropertiesService.getScriptProperties().getProperty('GF190_STORAGE_LINE')==='ON';
  const sh=GF190_sheet_();
  console.log('保存先='+sh.getParent().getName()+' / 切替='+ (on?'ON':'OFF') +' / シート='+sh.getName()+' / 件数='+Math.max(0,sh.getLastRow()-1));
}