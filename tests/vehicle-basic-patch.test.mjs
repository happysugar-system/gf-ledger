import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBasicPatch,editableBasicFields} from '../mobile-management/vehicle-basic-patch.mjs';
const m={kind:'text',formula:false,protected:false,merged:false,allowBlank:true};
test('multi-field patch preserves unchanged fields',()=>assert.deepEqual(buildBasicPatch('V999999',{'車種':'A','カラー':'白','所在地':'千葉'},{'車種':'B','カラー':'黒','所在地':'千葉'},{'車種':m,'カラー':m}),{vehicleId:'V999999',expected:{'車種':'A','カラー':'白'},changes:{'車種':'B','カラー':'黒'}}));
test('workflow rejected',()=>assert.throws(()=>buildBasicPatch('V999999',{'納車予定日':''},{'納車予定日':'2026-12-03'},{'納車予定日':m})));
test('mixed date field excluded',()=>assert.deepEqual(editableBasicFields({'仕入れ日/会場':m,'車種':m,'免責':m}),['車種']));
test('unknown metadata rejected',()=>assert.throws(()=>buildBasicPatch('V999999',{'車種':'A'},{'車種':'B'},{})));
