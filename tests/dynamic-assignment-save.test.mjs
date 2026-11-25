import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root=new URL('../integrations/gas/',import.meta.url);
const source=['Plan','Save','Replica'].map(p=>readFileSync(new URL('GF_ReceiptAssignment'+p+'.gs',root),'utf8')).join('\n');
const req={receiptId:'R04',driverId:'D999904',vehicleId:'V900004',action:'assign'};
const key='d'.repeat(64);

function setup() {
  const state={batches:0,locked:false,replica:null,transport:'ok'};
  const names=['GF_LINEドライバー同期履歴','名変待ち管理','ドライバーマスター','車両台帳'];
  const tables=[
    [['LINE受付ID','受付識別子','DriverID','処理状態'],['R04',key,req.driverId,'登録済']],
    [['LINE受付ID','受付識別子','DriverID','ステータス','割当VehicleID','割当車番'],['R04',key,req.driverId,'名変待ち','','']],
    [['DriverID','氏名','ステータス','所属会社名','稼働エリア','割当VehicleID','割当車番'],[req.driverId,'検証D','有効','会社','地域','','']],
    [['VehicleID','DriverID','車番','区分/ステータス','管理区分','現在使用者','所属会社名','稼働エリア','納車可能日','納車確定日'],
      [req.vehicleId,'','ダミー004','空車','通常管理','','','','','']],
  ];
  const current=()=>({vehicle_id:req.vehicleId,vehicle_number:tables[3][1][2],
    vehicle_data:Object.fromEntries(tables[3][0].slice(1).map((k,i)=>[k,tables[3][1][i+1]]))});
  const api={
    Values:{batchGet:()=>({valueRanges:tables.map(values=>({values:structuredClone(values)}))})},
    get(_book,{ranges}){
      if(!ranges)return {sheets:names.map((title,sheetId)=>({properties:{title,sheetId}}))};
      const [,sheet,row]=/^'(.*)'!(\d+):/.exec(ranges[0]);
      const values=tables[names.indexOf(sheet)][Number(row)-1].map(v=>({effectiveValue:{stringValue:v}}));
      return {sheets:[{data:[{rowData:[{values}]}]}]};
    },
    batchUpdate({requests}){
      assert.equal(state.locked,true);
      if(state.transport==='before')throw Error('failed before commit');
      state.batches++;
      for(const {updateCells:{start,rows,fields}} of requests){
        assert.equal(fields,'userEnteredValue');
        tables[start.sheetId][start.rowIndex][start.columnIndex]=rows[0].values[0].userEnteredValue?.stringValue??'';
      }
      if(state.transport==='after')throw Error('response lost');
    },
  };
  const context={
    Sheets:{Spreadsheets:api},GF_SB_対象ID_:()=> 'test-book',
    GF_SB_ENV:{VEHICLE_SHEET:'車両台帳',SUPABASE_TABLE:'gf_vehicles'},
    GF_SB_1台同期事前確認_読取専用:vehicleId=>{
      assert.equal(state.locked,false);
      if(state.replica==='offline')throw Error('service unavailable');
      return {result:{vehicleId,action:state.replica?'UNCHANGED':'UPDATE'},payload:current(),old:state.replica};
    },
    LockService:{getScriptLock:()=>({
      waitLock(){if(state.locked)throw Error('busy');state.locked=true;},
      releaseLock(){state.locked=false;},
    })},
  };
  const save=runInNewContext(source+'\nGF_ReceiptAssignmentSaveAndCheck_',context);
  return {state,tables,current,run:(request=req)=>save('test-book',request)};
}

test('三シート保存、同期遅延・障害・不一致と再試行を区別し、区分/ステータスを保持する',()=>{
  const f=setup();
  assert.equal(f.run().status,'reconciliation_required');
  assert.equal(f.tables[1][1][4],req.vehicleId);
  assert.equal(f.tables[2][1][5],req.vehicleId);
  assert.equal(f.tables[3][1][3],'空車');
  f.state.replica='offline';
  assert.equal(f.run().status,'reconciliation_required');
  f.state.replica=f.current();
  delete f.state.replica.vehicle_data['納車確定日'];
  assert.equal(f.run().status,'reconciliation_required');
  f.state.replica=f.current();
  assert.equal(f.run().status,'verified');
  assert.equal(f.state.batches,1);
});

test('誤ID、同時保存、他車両との重複を変更前に止める',()=>{
  const f=setup();
  assert.throws(()=>f.run({...req,driverId:'D999999'}),/receipt_driver_mismatch/);
  f.state.locked=true;
  assert.throws(()=>f.run(),/busy/);
  f.state.locked=false;
  f.tables[3].push(['V900005',req.driverId]);
  assert.throws(()=>f.run(),/multiple_vehicle_review/);
  assert.equal(f.state.batches,0);
});

test('取消と再割当は成功し、進捗や納車日を保存した後は取消を拒否する',()=>{
  const f=setup();
  f.run();
  const cancel={...req,action:'cancel'};
  f.run(cancel);
  assert.equal(f.tables[3][1][1],'');
  f.run();
  f.tables[3][1][8]='2026-12-02';
  assert.throws(()=>f.run(cancel),/delivery_dates_present/);
  f.tables[3][1][8]='';
  f.tables[3][1][4]='名義変更前';
  assert.throws(()=>f.run(cancel),/assignment_state_conflict/);
  assert.equal(f.state.batches,3);
});

test('一括保存の失敗と応答消失をSheets再読取で判別する',()=>{
  const f=setup();
  f.state.transport='before';
  assert.throws(()=>f.run(),/ledger_write_unconfirmed/);
  assert.equal(f.state.batches,0);
  f.state.transport='after';
  assert.equal(f.run().status,'reconciliation_required');
  assert.equal(f.state.batches,1);
  assert.equal(f.state.locked,false);
});
