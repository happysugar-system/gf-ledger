/**
 * GF3 isolated DOCUMENT-ONLY Web App adapter.
 * Install ONLY in the dedicated GF3 validation GAS; never in production GAS.
 * Deployment is deliberately separate: connect an existing doGet dispatcher only
 * after verifying the validation script has no duplicate doGet definitions.
 *
 * Web App settings: execute as "User accessing the web app", restricted to
 * authorized Google users. Active and effective Google account must both match
 * the allowlisted owner. No OAuth tokens or Supabase keys reach the browser.
 */
function GF3_DocumentUiOwner_(){
  const book=SpreadsheetApp.openById('1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0');
  GF3_AssertBook_(book);
  const expected=String(PropertiesService.getScriptProperties()
    .getProperty('GF3_DOCUMENT_UI_OWNER_EMAIL')||'').trim().toLowerCase();
  const active=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  const effective=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  if(!expected||!active||!effective||active!==expected||effective!==expected)
    throw Error('gf3_ui_owner_denied');
  return book;
}
/** Call from doGet only after the test-only entrypoint review. */
function GF3_DocumentUiDoGet_(){
  GF3_DocumentUiOwner_();
  return HtmlService.createHtmlOutputFromFile('GF3_DocumentIsolatedUI')
    .setTitle('GF3 検証用・車両書類');
}
function GF3_DocumentUiStatus_(){
  const book=GF3_DocumentUiOwner_();
  return {vehicleId:'V900005',testOnly:true,saveEnabled:GF3_DocumentWriteEnabled_(book)};
}
function GF3_DocumentUiSave_(images,receiptId){
  const book=GF3_DocumentUiOwner_();
  if(!GF3_DocumentWriteEnabled_(book))throw Error('gf3_document_disabled');
  if(!Array.isArray(images)||images.length!==3)throw Error('gf3_ui_image_count');
  if(!/^TEST-GF3-[A-Z0-9-]{1,60}$/.test(String(receiptId||'')))throw Error('gf3_ui_receipt');
  const blobs=images.map((img,i)=>{
    if(typeof img!=='string')throw Error('gf3_ui_image_type:'+(i+1));
    const m=/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(img);
    if(!m||m[1].length>3700000)throw Error('gf3_ui_image_format_or_size:'+(i+1));
    const bytes=Utilities.base64Decode(m[1]);
    if(bytes.length>2750000||bytes.length<16)throw Error('gf3_ui_image_size:'+(i+1));
    const blob=Utilities.newBlob(bytes,'image/jpeg','GF3_dummy_'+(i+1)+'.jpg');
    if(!GF_JPEG情報を読む_60(blob))throw Error('gf3_ui_image_unsupported:'+(i+1));
    return blob;
  });
  return GF3_VehicleDocumentSave_('V900005',blobs,receiptId);
}
function GF3_DocumentUiCancel_(receiptId){
  const book=GF3_DocumentUiOwner_();
  if(!GF3_DocumentWriteEnabled_(book))throw Error('gf3_document_disabled');
  if(!/^TEST-GF3-[A-Z0-9-]{1,60}$/.test(String(receiptId||'')))throw Error('gf3_ui_receipt');
  const row=GF3_DocumentStorage_(book,'read',receiptId)[0];
  if(!row||row.vehicle_id!=='V900005'||row.kind!=='車両書類')
    throw Error('gf3_ui_receipt_vehicle_denied');
  return GF3_VehicleDocumentCancel_(receiptId);
}
