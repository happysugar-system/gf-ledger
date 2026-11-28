/** Existing admin entrypoints for the dedicated validation project. */
function GOLD_FIRST初期セットアップ(){
 const book=GF3_DocumentUiOwner_();
 const schema=GF3_ReadCanonicalSchemaAudit_(book);
 if(!schema.ready)throw Error('gf3_setup_schema_invalid');
 const monthly=GF3_InstallMonthlyDelivery();
 const sync=車両台帳連携トリガーを設定する();
 return {environment:'gf3',schemaReady:true,monthly,sync};
}

function GOLD_FIRST全シートの表示を整える(){
 return 車両台帳の表示を整える();
}

function 車両台帳の表示を整える(){
 const book=GF3_DocumentUiOwner_();
 if(!GF3_ReadCanonicalSchemaAudit_(book).ready)throw Error('gf3_setup_schema_invalid');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(5000))throw Error('gf3_screen_links_busy');
 try{return {links:GF3_UpdateCanonicalVehicleScreenLinks_(book,'V900005')};}
 finally{lock.releaseLock();}
}

function 車両台帳連携トリガーを設定する(){
 const book=GF3_DocumentUiOwner_();
 if(!GF3_ReadCanonicalSchemaAudit_(book).ready)throw Error('gf3_setup_schema_invalid');
 return GF3_InstallLedgerFixtureSync();
}
