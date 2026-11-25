import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../integrations/gas/GF_LedgerProgress_ProductionCandidate.gs', import.meta.url), 'utf8');

function setup() {
  const grid = [
    ['VehicleID','区分/ステータス','管理区分','DriverID','GPS有無','納車確定日','納車可能日'],
    ['V000001','空車','車両準備中','D000001',true,'',''],
    ['V000002','空車','車両準備中','D000002',false,'',''],
  ];
  const state = {grid, writes: 0, locks: 0, formula: false};
  const asValue = value => ({[typeof value === 'number' ? 'numberValue' :
    typeof value === 'boolean' ? 'boolValue' : 'stringValue']: value});
  const api = {
    Values: {get() {return {values: structuredClone(grid)};}},
    get(_book, {ranges}) {
      state.beforeRead?.();
      const row = grid[Number(ranges[0].match(/!(\d+):/)[1]) - 1];
      const values = row.map(value => ({effectiveValue: asValue(value)}));
      if (state.formula) values[2].userEnteredValue = {formulaValue: '=A1'};
      return {sheets: [{properties: {sheetId: 7}, data: [{rowData: [{values}]}]}]};
    },
    batchUpdate({requests}) {
      state.writes++;
      for (const {updateCells: update} of requests) {
        assert.equal(update.fields, 'userEnteredValue');
        const value = update.rows[0].values[0].userEnteredValue;
        grid[update.start.rowIndex][update.start.columnIndex] = value?.stringValue ?? value?.numberValue ?? '';
      }
      state.afterWrite?.();
    },
  };
  const context = {
    Sheets: {Spreadsheets: api},
    LockService: {getScriptLock: () => ({
      waitLock() {assert.equal(state.locks++, 0);},
      releaseLock() {assert.equal(state.locks--, 1);},
    })},
    GF_SB_対象ID_: () => 'book',
    GF_SB_ENV: {SUPABASE_TABLE: 'gf_vehicles'},
    GF_SB_v4API_: (...args) => {
      assert.equal(args[2], 'get');
      state.onReplicaRead?.();
      return state.replica || [];
    },
  };
  const f = runInNewContext(source + '\n({read: GF_LedgerProdProgressRead_, save: GF_LedgerProdProgressSave_, guard: GF_LedgerProdProgressAssertCancelable_, verify: GF_LedgerProdProgressVerifyReplica_})', context);
  return {...f, state};
}

const patch = {'管理区分':'名義変更前','納車可能日':'2026-12-02','納車確定日':'2026-12-07'};

test('複数車両からIDで選択し、対象3セルだけを1回で保存して再読取する', () => {
  const {read, save, state} = setup();
  const before = structuredClone(state.grid[1]);
  const expected = read('book', 'V000002').snapshot;
  const result = save('book', expected, patch);
  assert.equal(result.status, 'saved');
  assert.deepEqual([...result.snapshot.values], Object.values(patch));
  assert.deepEqual(state.grid[1], before);
  assert.deepEqual(state.grid[2].slice(0, 5), ['V000002','空車','名義変更前','D000002',false]);
  assert.equal(save('book', expected, patch).status, 'unchanged');
  assert.equal(state.writes, 1);
  assert.equal(state.locks, 0);
});

test('直編集、行の移動、再割当を検知して保存を拒否する', () => {
  for (const edit of [
    grid => {grid[2][5] = '2026-12-09';},
    grid => {[grid[1], grid[2]] = [grid[2], grid[1]];},
    grid => {grid[2][3] = 'D000003';},
  ]) {
    const {read, save, state} = setup();
    const expected = read('book', 'V000002').snapshot;
    state.beforeRead = () => edit(state.grid);
    assert.throws(() => save('book', expected, patch), /再読み込み/);
    assert.equal(state.writes, 0);
    assert.equal(state.locks, 0);
  }
});

test('重複ID、必須列の欠落、数式、日付逆転を拒否する', () => {
  const {read, save, state} = setup();
  const expected = read('book', 'V000002').snapshot;
  state.formula = true;
  assert.throws(() => save('book', expected, patch), /数式セル/);
  assert.throws(() => save('book', expected, {...patch, '納車確定日':'2026-12-01'}), /以降/);
  state.grid[1][0] = 'V000002';
  assert.throws(() => read('book', 'V000002'), /件数/);
  state.grid[0][6] = '納車予定日';
  assert.throws(() => read('book', 'V000002'), /見出し/);
  assert.equal(state.writes, 0);
});

test('保存応答が不一致なら成功を返さずロックを解放する', () => {
  const {read, save, state} = setup();
  state.afterWrite = () => {state.grid[1][3] = 'D000003';};
  assert.throws(() => save('book', read('book', 'V000001').snapshot, patch), /保存結果/);
  assert.equal(state.locks, 0);
});

test('取消条件と、同期中に台帳が変わった場合の照合を確認する', () => {
  const {read, save, guard, verify, state} = setup();
  assert.doesNotThrow(() => guard('book', 'V000001', 'D000001'));
  save('book', read('book', 'V000001').snapshot, patch);
  assert.throws(() => guard('book', 'V000001', 'D000001'), /取消できません/);
  assert.equal(verify('book', 'V000001').status, 'pending');
  state.replica = [{vehicle_id:'V000001', vehicle_data:{DriverID:'D000001',...patch}}];
  assert.equal(verify('book', 'V000001').status, 'synced');
  state.onReplicaRead = () => {state.grid[1][5] = '2026-12-08';};
  assert.equal(verify('book', 'V000001').status, 'pending');
});
