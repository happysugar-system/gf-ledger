/** 既存GFI_実行_の完全置換。検証用3シートのみ。取消ガードは同じロック内で実行。 */
function GFI_実行_(assign) {
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const {v,w,d}=GFI_確認_();
    const driverId=w.r.DriverID;
    if(!driverId||driverId!==d.r.DriverID)throw Error('DriverID照合失敗');
    const progress=GFI_進捗台帳読取_(v);
    if(assign) {
      if(progress['納車可能日']||progress['納車確定日'])throw Error('割当前の納車日残存');
    } else {
      GF_LedgerProgressCancelGuard_(progress);
    }
    const edits=[
      [v,{'管理区分':assign?'車両準備中':'通常管理','現在使用者':assign?'テスト運転者A':'',
          DriverID:assign?driverId:'','所属会社名':assign?'テスト法人':'','稼働エリア':assign?'テスト地域':''}],
      [w,{'ステータス':assign?'割当済':'名変待ち','割当VehicleID':assign?'TEST-V01':'','割当車番':assign?'TEST-001':''}],
      [d,{'割当VehicleID':assign?'TEST-V01':'','割当車番':assign?'TEST-001':''}]
    ];
    const changes=[];
    for(const [x,e] of edits)for(const [k,value] of Object.entries(e)){
      const i=x.h.indexOf(k);
      if(i<0)throw Error('列不足 '+k);
      const c=x.s.getRange(2,i+1);
      if(c.getFormula())throw Error('数式セル '+k);
      changes.push({c,value});
    }
    if(GFI_通信_({action:'health'}).ok!==true)throw Error('接続確認失敗');
    const oldV=v.r,oldW=w.r,oldD=d.r;
    const blank=oldV['管理区分']==='通常管理'&&!oldV.DriverID&&!oldV['現在使用者']&&
      !oldV['所属会社名']&&!oldV['稼働エリア']&&oldW['ステータス']==='名変待ち'&&
      !oldW['割当VehicleID']&&!oldW['割当車番']&&!oldD['割当VehicleID']&&!oldD['割当車番'];
    const full=oldV['管理区分']==='車両準備中'&&oldV.DriverID===driverId&&
      oldV['現在使用者']==='テスト運転者A'&&oldV['所属会社名']==='テスト法人'&&
      oldV['稼働エリア']==='テスト地域'&&oldW['ステータス']==='割当済'&&
      oldW['割当VehicleID']==='TEST-V01'&&oldW['割当車番']==='TEST-001'&&
      oldD['割当VehicleID']==='TEST-V01'&&oldD['割当車番']==='TEST-001';
    if(!blank&&!full)throw Error('状態不整合: 手動確認が必要');
    for(const {c,value} of changes)c.setValue(value);
    SpreadsheetApp.flush();
    const after=GFI_確認_();
    for(const [x,e] of [[after.v,edits[0][1]],[after.w,edits[1][1]],[after.d,edits[2][1]]]) {
      for(const [k,value] of Object.entries(e))
        if(x.r[k]!==value)throw Error('台帳照合失敗 '+k);
    }
    try{GFI_反映_(after.v.r);}
    catch(e){throw Error('台帳保存済み・DB未確認。同じ操作で再試行: '+e.message);}
    console.log((assign?'割当':'取消')+'：台帳3シート・Supabase照合完了');
  } finally {lock.releaseLock();}
}