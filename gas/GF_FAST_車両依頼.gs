/**
 * Add this file to the isolated LINE entrance and document receiver GAS projects.
 * The existing router, GF145, GF146 and GF115 continue to own their writes.
 */
const GF_FAST_PENDING = '一時保存完了・Drive転送待ち';
const GF_FAST_CLEANUP = 'Drive保存完了・一時ファイル削除待ち';
const GF_FAST_URL = 'https://tgxrnrqxafytyqfwwsag.supabase.co/functions/v1/';

function GF_FAST_property_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || '');
}

function GF_FAST_http_(url, options) {
  const result = UrlFetchApp.fetch(url, Object.assign({method:'post', muteHttpExceptions:true}, options));
  if (result.getResponseCode() < 200 || result.getResponseCode() >= 300) throw Error('FAST_HTTP_' + result.getResponseCode());
  return result;
}

function GF_FAST_json_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function GF_FAST_receiver_(e) {
  const p = (e && e.parameter) || {};
  const started = Date.now();
  try {
    const secret = GF_FAST_property_('GF_VEHICLE_BRIDGE_SECRET');
    if (GF_FAST_property_('GF_FAST_TEST_ENABLED') !== 'true' || secret.length < 40 ||
        p.bridge_secret !== secret) throw Error('FAST_BRIDGE_DISABLED');
    const testBook = GF_FAST_property_('GF_FAST_RECEIVER_TEST_BOOK_ID');
    if (!testBook || GF_FAST_property_('GF144_TEST_SHEET_ID').trim() !== testBook ||
        !GF_FAST_property_('GF_FAST_RECEIVER_TEST_FOLDER_ID') ||
        GF_FAST_property_('GF146_TEST_FOLDER_ID') !== GF_FAST_property_('GF_FAST_RECEIVER_TEST_FOLDER_ID')) {
      throw Error('FAST_WRONG_DESTINATION');
    }
    const mode = String(p.demo_action || '');
    const user = String(p.bridge_line_user_id || '');
    const request = String(p.bridge_request_id || '');
    if (!/^U[0-9a-f]{32}$/i.test(user) || !/^[a-f0-9]{64}$/i.test(request)) throw Error('FAST_ID');
    if (mode === 'gf_fast_stage_v1') return GF_FAST_json_(GF_FAST_stage_(p, user, request));
    const receipt = String(p.receipt || '');
    if (!/^TEST145-\d{14}-[a-f0-9]{8}$/i.test(receipt)) throw Error('FAST_RECEIPT');
    const sh = GF145_テストシート取得_();
    if (sh.getLastRow() < 2) throw Error('FAST_RECEIPT');
    const matches = sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(receipt).matchEntireCell(true).findAll();
    if (matches.length !== 1) throw Error('FAST_RECEIPT');
    const row = matches[0].getRow();
    if (sh.getRange(row,17).getDisplayValue() !== GF146_照合キー_(user) ||
        sh.getRange(row,22).getDisplayValue() !== request) throw Error('FAST_OWNER');
    if (mode === 'gf_fast_transfer_v1') {
      const lock = LockService.getUserLock();
      if (!lock.tryLock(1000)) throw Error('FAST_TRANSFER_BUSY');
      try { return GF_FAST_json_(GF_FAST_transfer_(p, user, request, receipt, sh, row)); }
      finally { lock.releaseLock(); }
    }
    if (mode !== 'gf_fast_cleanup_v1') throw Error('FAST_ACTION');
    const verified = GF_FAST_verifyDrive_(sh, row);
    if (!verified.ok) throw Error('FAST_DRIVE_PENDING');
    GF_FAST_workerCall_('cleanup', request, receipt, '');
    return GF_FAST_json_({ok:true});
  } catch (error) {
    console.warn(JSON.stringify({event:'gf_fast_receiver_error', ms:Date.now()-started}));
    return GF_FAST_json_({ok:false,error:'FAST_RECEIVER_FAILED'});
  }
}

function GF_FAST_stage_(p, user, request) {
  const started = Date.now();
  const method = String(p.residentMethod || '');
  if (!['mail','upload'].includes(method)) throw Error('FAST_METHOD');
  // Reuse the same validators as the Drive path.
  const files = [
    ['license_front', GF146_画像_(p.front,'免許証・表').blob],
    ['license_back', GF146_画像_(p.back,'免許証・裏').blob]
  ];
  if (method === 'upload') files.push(['resident_pdf', GF146_PDF_(p.resident)]);
  const saved = GF145_フォーム受付保存_(user, p);
  const receipt = saved.receipt;
  const timestamp = Math.floor(Date.now()/1000);
  const nonce = Utilities.getUuid();
  const secret = GF_FAST_property_('GF_FAST_INTAKE_SECRET');
  if (secret.length < 48) throw Error('FAST_CONFIGURATION');
  const envelope = {timestamp,nonce,requestId:request,receipt,lineUserId:user,residentMethod:method};
  envelope.signature = Utilities.computeHmacSha256Signature(
    [timestamp,nonce,request,receipt,user,method].join('\n'), secret
  ).map(byte => (byte & 255).toString(16).padStart(2,'0')).join('');
  const url = GF_FAST_URL + 'gf-fast-upload-test?action=';
  const issued = JSON.parse(GF_FAST_http_(url + 'issue', {
    contentType:'application/json',payload:JSON.stringify(envelope)
  }).getContentText());
  if (!/^[a-f0-9]{64}$/.test(issued.upload_token || '')) throw Error('FAST_SESSION');
  const authorization = 'Bearer ' + issued.upload_token;
  const responses = UrlFetchApp.fetchAll(files.map(([kind,blob]) => ({
    url:url+'upload',method:'post',muteHttpExceptions:true,contentType:blob.getContentType(),
    headers:{Authorization:authorization,'x-document-type':kind},payload:blob.getBytes()
  })));
  responses.forEach((response, i) => {
    if (![200,201].includes(response.getResponseCode())) throw Error('FAST_UPLOAD');
    const body = JSON.parse(response.getContentText());
    if (body.verified !== true || body.document_type !== files[i][0]) throw Error('FAST_VERIFY');
  });
  console.log(JSON.stringify({event:'gf_fast_stage_verified', ms:Date.now()-started, documents:files.length}));
  return {ok:true,receipt,match:saved.match,documentStatus:GF_FAST_PENDING};
}

function GF_FAST_workerCall_(action, request, receipt, kind) {
  return GF_FAST_http_(GF_FAST_URL + 'gf-fast-drive-worker-test',{
    headers:{Authorization:'Bearer '+GF_FAST_property_('GF_FAST_INTAKE_SECRET')},
    contentType:'application/json',payload:JSON.stringify({action,requestId:request,receipt,kind})
  });
}

function GF_FAST_transfer_(p,user,request,receipt,sh,row) {
  const started = Date.now();
  let verified = GF_FAST_verifyDrive_(sh,row);
  if (verified.ok) return verified;
  const state = sh.getRange(row,21).getDisplayValue();
  // Recover a stranded conversion claim after its original execution can no longer be active.
  if (state === 'PDF変換中') {
    const key = 'GF_FAST_PDF_' + receipt;
    const props = PropertiesService.getScriptProperties();
    const since = Number(props.getProperty(key));
    if (!since) props.setProperty(key,String(Date.now()));
    if (!since || Date.now()-since < 7*60*1000) return {ok:true,pending:true};
    sh.getRange(row,21).setValue('PDF変換待ち');
    props.deleteProperty(key);
  }
  if (!['PDF変換待ち','PDF変換中'].includes(state)) {
    const method = p.residentMethod;
    if (!['mail','upload'].includes(method)) throw Error('FAST_METHOD');
    const read = kind => {
      const blob = GF_FAST_workerCall_('read',request,receipt,kind).getBlob();
      return 'data:' + blob.getContentType().split(';')[0] + ';base64,' + Utilities.base64Encode(blob.getBytes());
    };
    GF146_書類保存_(user,{receipt,residentMethod:method,
      front:read('license_front'),back:read('license_back'),
      resident:method==='upload'?read('resident_pdf'):''});
  }
  verified = GF_FAST_verifyDrive_(sh,row);
  console.log(JSON.stringify({event:'gf_fast_drive', ms:Date.now()-started, verified:verified.ok}));
  return verified.ok ? verified : {ok:true,pending:true};
}

function GF_FAST_verifyDrive_(sh,row) {
  if (sh.getRange(row,21).getDisplayValue() !== '保存完了') return {ok:false};
  const folderUrl = sh.getRange(row,20).getDisplayValue();
  const folderId = /^https:\/\/drive\.google\.com\/drive\/folders\/([\w-]+)(?:\?.*)?$/.exec(folderUrl);
  if (!folderId) throw Error('FAST_FOLDER');
  const root = DriveApp.getFolderById(GF_FAST_property_('GF146_TEST_FOLDER_ID'));
  const folder = DriveApp.getFolderById(folderId[1]);
  if (!GF146_直下確認_(root,folder)) throw Error('FAST_FOLDER');
  function fileUrl(column,dirName,fileName) {
    const formula = sh.getRange(row,column).getFormula();
    const match = /https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/.exec(formula);
    const dirs = folder.getFoldersByName(dirName);
    if (!match || !dirs.hasNext()) throw Error('FAST_FILE');
    const dir = dirs.next();
    if (dirs.hasNext()) throw Error('FAST_FOLDER_DUPLICATE');
    const files = dir.getFilesByName(fileName);
    if (!files.hasNext()) throw Error('FAST_FILE');
    const file = files.next();
    if (files.hasNext() || file.getId() !== match[1] || file.isTrashed() ||
        file.getSize() <= 0 || file.getMimeType() !== 'application/pdf') throw Error('FAST_FILE');
    return file.getUrl();
  }
  const licenseUrl = fileUrl(18,'免許証','免許証.pdf');
  const mailed = sh.getRange(row,19).getDisplayValue() === '原本郵送予定';
  const residentUrl = mailed ? '' : fileUrl(19,'住民票','住民票.pdf');
  return {ok:true,licenseUrl,residentUrl,folderUrl,documentStatus:'保存完了'};
}

function GF_FAST_bridgeCall_(payload) {
  const receiver = GF_FAST_property_('GF_VEHICLE_TEST_RECEIVER_URL');
  const secret = GF_FAST_property_('GF_VEHICLE_BRIDGE_SECRET');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(receiver) ||
      secret.length < 40) throw Error('FAST_BRIDGE_CONFIGURATION');
  const response = GF_FAST_http_(receiver,{payload:Object.assign({},payload,{bridge_secret:secret})});
  const result = JSON.parse(response.getContentText());
  if (result.ok !== true) throw Error('FAST_BRIDGE_FAILED');
  return result;
}

function GF_FAST_masterSync_(request) {
  const url = GF_FAST_property_('GF_FAST_DRIVER_TEST_URL');
  const secret = GF_FAST_property_('GF_FAST_DRIVER_SECRET');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url) ||
      secret.length < 48) throw Error('FAST_DRIVER_CONFIGURATION');
  const result = JSON.parse(GF_FAST_http_(url,{payload:{
    action:'gf_fast_driver_sync_test_v1',request,secret
  }}).getContentText());
  if (result.ok !== true) throw Error('FAST_DRIVER_SYNC');
}

function GF_FAST_workerInstall() {
  if (GF_FAST_property_('GF_FAST_TEST_ENABLED') !== 'true') throw Error('FAST_TEST_DISABLED');
  if (!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='GF_FAST_runWorker')) {
    ScriptApp.newTrigger('GF_FAST_runWorker').timeBased().everyMinutes(1).create();
  }
}

function GF_FAST_runWorker() {
  if (GF_FAST_property_('GF_FAST_TEST_ENABLED') !== 'true') return;
  // Worker-only lock, separate from the short GF115 reception lock.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return;
  try {
    const ss = GF_FAST_lineTestBook_();
    if (ss.getId() !== GF_FAST_property_('GF_FAST_LINE_TEST_BOOK_ID')) throw Error('FAST_WRONG_SHEET');
    const detail = ss.getSheetByName('車両依頼受付');
    if (!detail || detail.getLastRow()<2) return;
    const master = ss.getSheetByName('LINE受付管理');
    const headings = master.getRange(1,1,1,master.getLastColumn()).getDisplayValues()[0];
    const index = key => {
      const i = headings.indexOf(key);
      if (i < 0 || i !== headings.lastIndexOf(key)) throw Error('FAST_HEADER');
      return i;
    };
    const masterId = index('受付ID');
    const masterUser = index('LINEユーザーID');
    const masterFolder = index('写真フォルダURL');
    const rows = detail.getRange(1,1,detail.getLastRow(),22).getDisplayValues();
    const expected = {0:'受付番号',15:'受付状態',16:'免許証PDF',17:'住民票PDF',
      18:'書類フォルダ',19:'書類状態',20:'LINE受付ID',21:'受付識別子'};
    if (Object.keys(expected).some(i=>rows[0][i]!==expected[i])) throw Error('FAST_HEADER');
    const started = Date.now();
    const pending = rows.slice(1).filter(row=>[GF_FAST_PENDING,GF_FAST_CLEANUP].includes(row[19]));
    const props = PropertiesService.getScriptProperties();
    for (const row of pending) {
      if (Date.now()-started>120000) break;
      const [receipt] = row;
      if (!/^TEST145-\d{14}-[a-f0-9]{8}$/i.test(receipt) || !/^[a-f0-9]{64}$/i.test(row[21])) continue;
      const key = 'GF_FAST_RETRY_' + receipt;
      const retry = JSON.parse(props.getProperty(key)||'{}');
      try {
        const mr = GF115_受付行_(master,masterId+1,row[20]);
        if (!mr || !row[20]) throw Error('FAST_LINE_RECEIPT');
        const user = master.getRange(mr,masterUser+1).getDisplayValue();
        const request = row[21];
        const payload = {receipt,bridge_line_user_id:user,bridge_request_id:request,
          residentMethod:row[17]==='原本郵送予定'?'mail':'upload'};
        // Register the driver independently of Drive availability.
        // A failed attempt must not prevent document transfer.
        try { GF_FAST_masterSync_(request); }
        catch (_) { console.warn(JSON.stringify({event:'gf_fast_driver_sync_deferred'})); }
        if (retry.next > Date.now()) continue;
        if (row[19]===GF_FAST_PENDING) {
          const result = GF_FAST_bridgeCall_(Object.assign({},payload,{demo_action:'gf_fast_transfer_v1'}));
          if (result.pending) {
            props.setProperty(key,JSON.stringify({attempt:0,next:Date.now()+45000}));
            continue;
          }
          const dr = GF115_受付行_(detail,22,request);
          if (!dr || detail.getRange(dr,1).getDisplayValue()!==receipt ||
              detail.getRange(dr,21).getDisplayValue()!==row[20]) throw Error('FAST_LINE_RECEIPT');
          master.getRange(mr,masterFolder+1).setValue(result.folderUrl);
          detail.getRange(dr,17,1,4).setValues([[
            result.licenseUrl,result.residentUrl || '原本郵送予定',result.folderUrl,GF_FAST_CLEANUP
          ]]);
          SpreadsheetApp.flush();
        }
        GF_FAST_masterSync_(request);
        GF_FAST_bridgeCall_(Object.assign({},payload,{demo_action:'gf_fast_cleanup_v1'}));
        const dr = GF115_受付行_(detail,22,request);
        if (!dr || detail.getRange(dr,1).getDisplayValue()!==receipt) throw Error('FAST_LINE_RECEIPT');
        detail.getRange(dr,16).setValue('受付済・書類保存完了');
        detail.getRange(dr,20).setValue('保存完了');
        SpreadsheetApp.flush();
        props.deleteProperty(key);
      } catch (error) {
        const attempt = Math.min((retry.attempt || 0)+1,10);
        props.setProperty(key,JSON.stringify({attempt,next:Date.now()+Math.min(3600000,60000*2**(attempt-1))}));
        console.warn(JSON.stringify({event:'gf_fast_retry',attempt}));
      }
    }
  } finally { lock.releaseLock(); }
}

/** Called only after the existing GAS100 LINE entry token has been verified. */
function GF_FAST_existingIntake_(request) {
  const ss = GF_FAST_lineTestBook_();
  if (ss.getId() !== GF_FAST_property_('GF_FAST_LINE_TEST_BOOK_ID')) throw Error('FAST_WRONG_SHEET');
  const sh = ss.getSheetByName('車両依頼受付');
  if (!sh || sh.getLastRow()<2) return null;
  if (sh.getRange(1,22).getDisplayValue() !== '受付識別子') throw Error('FAST_HEADER');
  const row = GF115_受付行_(sh,22,request);
  if (!row) return null;
  const [state,lineId] = sh.getRange(row,20,1,2).getDisplayValues()[0];
  const receipt = sh.getRange(row,1).getDisplayValue();
  if (!lineId || !/^TEST145-\d{14}-[a-f0-9]{8}$/i.test(receipt) ||
      ![GF_FAST_PENDING,GF_FAST_CLEANUP,'保存完了'].includes(state)) throw Error('FAST_EXISTING_STATE');
  return {ok:true,receipt,documentStatus:state};
}

function GF_FAST_lineTestBook_() {
  const id = GF_FAST_property_('GF_FAST_LINE_TEST_BOOK_ID');
  if (GF_FAST_property_('GF_FAST_TEST_ENABLED') !== 'true' ||
      id !== '1cyoGorl67jbSkdgSE3m2ofZF8TWh3-MhPaRNW2OyRcA') throw Error('FAST_WRONG_SHEET');
  const ss = SpreadsheetApp.openById(id);
  if (!ss.getSheetByName('車両依頼受付') || !ss.getSheetByName('LINE受付管理')) throw Error('FAST_HEADER');
  return ss;
}
