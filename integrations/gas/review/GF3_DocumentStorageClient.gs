/** Isolated document receipt client. No Drive or production writes. */
function GF3_DocumentStorage_(book,action,id,args){
 GF3_AssertBook_(book);
 if(!['health','read','insert','transition','attach'].includes(action))throw new Error('gf3_document_action');
 if(action!=='health'&&!/^TEST-GF3-[A-Z0-9-]{1,60}$/.test(id||''))throw new Error('gf3_document_id');
 if(['insert','transition','attach'].includes(action)&&!GF3_WriteEnabled_(book))throw new Error('gf3_document_disabled');
 const token=PropertiesService.getScriptProperties().getProperty('GF3_SYNC_TEST_TOKEN')||'';
 if(token.length<32)throw new Error('gf3_document_token');
 const payload={action:action,id:id};
 if(action==='insert')payload.row=args;
 if(action==='attach')payload.fileId=args.fileId;
 if(action==='transition'){payload.expected=args.expected;payload.next=args.next;}
 const res=UrlFetchApp.fetch('https://tgxrnrqxafytyqfwwsag.supabase.co/functions/v1/gf3-document-storage-test',{method:'post',contentType:'application/json',headers:{'x-gf3-sync-token':token},payload:JSON.stringify(payload),muteHttpExceptions:true,followRedirects:false});
 if(res.getResponseCode()!==200)throw new Error('gf3_document_http_'+res.getResponseCode());
 const result=JSON.parse(res.getContentText());
 if(result.ok!==true)throw new Error('gf3_document_response');
 if(['transition','attach'].includes(action)&&result.data!==true)throw new Error('gf3_document_state_conflict');
 if(action==='read'&&(!Array.isArray(result.data)||result.data.length!==1||result.data[0].receipt_id!==id))throw new Error('gf3_document_receipt_missing');
 return result.data;
}
function GF3_書類履歴接続確認(){
 const book=SpreadsheetApp.openById('1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0');
 GF3_DocumentStorage_(book,'health');
 console.log(JSON.stringify({connected:true,document:true}));
}
