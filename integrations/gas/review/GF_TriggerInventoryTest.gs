/** Read-only inventory before cutover. Never creates or deletes triggers. */
function GF_検証トリガー棚卸し(){
 const book=GF_IsolatedValidationOpen_();
 GF_IsolatedValidationBook_(book);
 const triggers=ScriptApp.getProjectTriggers().map(t=>({
 handler:t.getHandlerFunction(),event:String(t.getEventType()),source:String(t.getTriggerSource()),sourceId:t.getTriggerSourceId()||null
 }));
 const result={spreadsheetId:book.getId(),triggers,sheets:book.getSheets().map(s=>s.getName()),required:['車両台帳','名変待ち管理','ドライバーマスター']};
 console.log(JSON.stringify(result));return result;
}
