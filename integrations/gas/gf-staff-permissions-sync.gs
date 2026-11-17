// GOLD FIRST staff permissions: Google Sheets -> Supabase
// Deploy as a standalone GAS bound to the management spreadsheet.
// Script Properties: GF_STAFF_SYNC_URL, GF_STAFF_SYNC_SECRET
const GF_STAFF_TAB = 'スタッフ権限管理';
function gfStaffSync() {
  const p = PropertiesService.getScriptProperties();
  const url = p.getProperty('GF_STAFF_SYNC_URL');
  const secret = p.getProperty('GF_STAFF_SYNC_SECRET');
  if (!url || !secret) throw new Error('同期URL・シークレットが未設定です');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GF_STAFF_TAB);
  if (!sheet) throw new Error('スタッフ権限管理タブがありません');
  const rows = sheet.getDataRange().getDisplayValues();
  const headers = rows.shift().map(x => x.trim());
  const col = name => {const i = headers.indexOf(name); if(i < 0) throw new Error('列がありません: '+name); return i;};
  const email=col('メールアドレス'),role=col('権限'),status=col('状態'),system=col('対象システム');
  const seen = new Set(), staff = [];
  rows.forEach((r,i)=>{
    const mail=String(r[email]||'').trim().toLowerCase();
    if(!mail) return;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Error('メール形式が不正: '+(i+2));
    if(seen.has(mail)) throw new Error('重複メール: '+mail);
    seen.add(mail);
    const rawRole=String(r[role]||'').trim();
    const mappedRole=rawRole==='最高管理者'?'最高管理者':rawRole==='管理者'?'管理者':rawRole==='一般スタッフ'||rawRole==='スタッフ'?'一般スタッフ':null;
    const rawStatus=String(r[status]||'').trim();
    const mappedStatus=rawStatus==='有効'||rawStatus==='停止'?rawStatus:'登録候補';
    // 未確認ロールは自動で有効にしない
    staff.push({email:mail,role:mappedRole||'一般スタッフ',status:mappedRole?mappedStatus:'登録候補',system_name:String(r[system]||'').trim()});
  });
  const response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',headers:{'x-gf-sync-secret':secret},payload:JSON.stringify({staff}),muteHttpExceptions:true});
  const code=response.getResponseCode();
  if(code!==200)throw new Error('同期失敗 HTTP '+code+': '+response.getContentText().slice(0,300));
  console.log('GFスタッフ権限同期: '+response.getContentText());
}
function gfStaffInstallTrigger() {
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='gfStaffSync').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('gfStaffSync').timeBased().everyMinutes(5).create();
}
