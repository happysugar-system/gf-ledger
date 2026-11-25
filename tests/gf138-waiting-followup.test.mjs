import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../integrations/gas/172_GF138_名変待ち連携.gs', import.meta.url), 'utf8');
const key = 'a'.repeat(64);
const headers = ['受付ID','氏名','所属会社名','稼働エリア','希望日','ステータス','割当VehicleID','割当車番','受付日時','割当日時','備考','進捗','旧シート行','LINE受付ID','受付識別子','DriverID'];

function setup() {
  const waiting = [headers.slice(), [1,'旧受付','','','','名変待ち'], [2,'検証氏名','','','','名変待ち','','','','','','','','L-1',key,'']];
  const sourceRows = [['LINE受付ID','受付識別子','書類状態'],['L-1',key,'保存完了']];
  const lineRows = [['受付ID','DriverID'],['L-1','D000001']];
  const history = [['受付識別子','LINE受付ID','DriverID','処理状態'],[key,'L-1','D000001','登録済']];
  const state = {waiting, sourceRows, lineRows, history, writes:0, lock:false, calls:[]};
  const sheet = rows => ({
    getDataRange: () => ({getDisplayValues: () => rows.map(row => row.map(v => String(v ?? '')))}),
    getLastColumn: () => Math.max(...rows.map(row => row.length)),
    getMaxColumns: () => 26,
    getLastRow: () => rows.length,
    appendRow(row) {rows.push(row);state.writes++;},
    getRange(r,c,n=1,m=1) {
      const read = () => Array.from({length:n}, (_,i) =>
        Array.from({length:m}, (_,j) => rows[r+i-1]?.[c+j-1] ?? ''));
      return {
        getDisplayValues: () => read().map(row => row.map(String)),
        getValues: read, getValue: () => read()[0][0],
        getDisplayValue: () => String(read()[0][0]),
        getFormula: () => '', getFormulas: () => read().map(row => row.map(() => '')),
        isPartOfMerge: () => false,
        setValue(v) {rows[r-1][c-1]=v;state.writes++;},
        setValues(values) {
          values.forEach((row,i) => row.forEach((v,j) => {rows[r+i-1][c+j-1]=v;}));
          state.writes++;
        },
      };
    },
  });
  const book = (id, tables) => ({getId: () => id,getSheetByName: name => tables[name] ? sheet(tables[name]) : null});
  const books = {
    vehicle:book('vehicle', {'名変待ち管理':waiting,'GF_LINEドライバー同期履歴':history,
      'ドライバーマスター':[['DriverID','ステータス','氏名','所属会社名','稼働エリア','割当VehicleID'],['D000001','有効','検証氏名','','','']],
      '車両台帳':[['VehicleID','DriverID'],['V000001','']]}),
    line:book('line', {'車両依頼受付':sourceRows,'LINE受付管理':lineRows}),
  };
  state.properties = {GFA_WAITING_LINK_ENABLED:'true',GFA_APPROVED_BOOK_ID:'vehicle',GFA_APPROVED_LINE_BOOK_ID:'line'};
  const context = {
    PropertiesService:{getScriptProperties: () => ({getProperty: name => state.properties[name]})},
    SpreadsheetApp:{openById(id){assert.ok(books[id]);return books[id];},flush(){}},
    LockService:{getScriptLock: () => ({
      waitLock(){assert.equal(state.lock,false);state.lock=true;},
      releaseLock(){assert.equal(state.lock,true);state.lock=false;},
    })},
    console:{log(){},warn(){}},
    GF138_車両依頼を同期_本体_(){state.calls.push('GF138');},
    GF143_本番確認反映_(){state.calls.push('GF143');},
  };
  const api=runInNewContext(source + `
    ({
      run() {GF138_車両依頼を同期_本体_(); GF143_本番確認反映_(); return GFA_GF138後続同期_();},
      prepare: GFA_名変待ち列追加実行, diagnose: GFA_名変待ち列追加診断,
      register: GFA_名変待ち受付登録_
    })
  `, context);
  return {...api,state};
}

test('GF138とGF143の後にDriverIDを補完し、再実行では変更しない', () => {
  const {run,state}=setup();
  assert.equal(run().updated,1);
  assert.deepEqual(state.calls,['GF138','GF143']);
  assert.equal(state.waiting[2][15],'D000001');
  assert.equal(state.waiting[1].length,6);
  assert.equal(run().linked,1);
  assert.equal(state.writes,1);
  assert.equal(state.lock,false);
});

test('受付の二重登録、書類未完了、履歴不一致、割当済、既存IDを保持する', () => {
  const cases = [
    [s => s.waiting.push([3,'','','','', '名変待ち','','','','','','','','L-1','b'.repeat(64),'']), 'review'],
    [s => {s.sourceRows[1][2]='保存中';}, 'pending'],
    [s => {s.history[1][2]='D000002';}, 'review'],
    [s => {s.waiting[2][6]='V000001';}, 'review'],
    [s => {s.waiting[2][15]='D000002';}, 'review'],
  ];
  for (const [change,count] of cases) {
    const {run,state}=setup();
    change(state);
    assert.ok(run()[count]>0);
    assert.equal(state.writes,0);
  }
});

test('書込無効では無変更、列不足は判別でき、診断と列準備後に再試行できる', () => {
  const {run,prepare,diagnose,state}=setup();
  state.properties.GFA_WAITING_LINK_ENABLED='false';
  assert.equal(run(),undefined);
  state.properties.GFA_WAITING_LINK_ENABLED='true';
  state.waiting[0].splice(13);
  state.waiting[2].splice(13);
  assert.throws(run,/列不一致/);
  assert.equal(state.lock,false);
  assert.equal(diagnose().state,'diagnostic_ok');
  assert.equal(state.writes,0);
  assert.equal(prepare().state,'ready');
  assert.deepEqual(state.waiting[0],headers);
  assert.equal(prepare().state,'already_ready');
  assert.equal(state.writes,1);
});

test('明示受付登録は3項目を記録し、同じ受付で新しい行を作らない', () => {
  const {register,state}=setup();
  state.waiting.pop();
  state.waiting[0][12]='旧社長シート行';
  const result=register('L-1',key);
  assert.equal(result.state,'registered');
  assert.deepEqual(Array.from(state.waiting[2].slice(13)),['L-1',key,'D000001']);
  assert.equal(register('L-1',key).state,'already_registered');
  assert.equal(state.writes,1);
});
