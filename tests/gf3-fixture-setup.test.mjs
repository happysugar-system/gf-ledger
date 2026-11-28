import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = name => readFileSync(new URL('../integrations/gas/review/' + name + '.gs', import.meta.url), 'utf8');

test('schema audit allows a managed monthly projection and never reads an archived sheet', () => {
  const context=vm.createContext({GF3_AssertBook_() {}});
  vm.runInContext(source('GF3_ThreeSheetReadinessAudit'),context);
  const spec=context.GF3_ThreeSheetSchemaAudit_({}).missing;
  const canonical=Object.entries(spec).map(([name,groups])=>{
    const headers=[...new Set(Object.values(groups).flat())];
    return {getName:()=>name,getLastColumn:()=>headers.length,getRange:()=>({getDisplayValues:()=>[headers]})};
  });
  const monthly={getName:()=> '月別納車管理',getDeveloperMetadata:()=>[{getKey:()=> 'GF3_MONTHLY_PROJECTION'}]};
  assert.equal(context.GF3_ReadCanonicalSchemaAudit_({getSheets:()=>[...canonical,monthly]}).ready,true);
  const archive={getName:()=> '車両状況',getRange:()=>assert.fail('archive was read')};
  const audit=context.GF3_ReadCanonicalSchemaAudit_({getSheets:()=>[...canonical,monthly,archive]});
  assert.equal(audit.ready,false);
  assert.deepEqual(Array.from(audit.extraSheets),['車両状況']);
});

test('existing setup and trigger entrypoints reuse the protected validation integrations', () => {
  let ready=true;
  const calls=[];
  const context=vm.createContext({
    GF3_DocumentUiOwner_:()=>({}),GF3_ReadCanonicalSchemaAudit_:()=>({ready}),
    GF3_InstallMonthlyDelivery:()=>{calls.push('monthly');return {};},
    GF3_InstallLedgerFixtureSync:()=>{calls.push('sync');return {};},
  });
  vm.runInContext(source('GF3_FixtureSetupEntrypoints'),context);
  assert.equal(context.GOLD_FIRST初期セットアップ().schemaReady,true);
  assert.deepEqual(calls,['monthly','sync']);
  ready=false;
  assert.throws(()=>context.GOLD_FIRST初期セットアップ(),/schema_invalid/);
  assert.deepEqual(calls,['monthly','sync']);
});

test('canonical link display preserves cells protected by validation', () => {
  const context=vm.createContext({});
  vm.runInContext(source('GF3_CanonicalScreenLinks'),context);
  const cell={getFormula:()=>'',getDataValidation:()=>({}),setRichTextValue:()=>assert.fail('protected write')};
  assert.equal(context.GF3_UpdateCanonicalCellLink_(cell,{},'https://example.test'),false);
});
