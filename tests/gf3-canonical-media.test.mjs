import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const iterate = items => {
  let index = 0;
  return { hasNext: () => index < items.length, next: () => items[index++] };
};

test('photo save preserves PDF and rich Drive links and rolls back files on failure', () => {
  const context = vm.createContext({ Utilities: { getUuid: () => 'test-id' } });
  vm.runInContext(readFileSync(new URL('../integrations/gas/review/GF3_CanonicalMedia.gs', import.meta.url), 'utf8'), context);
  const url = 'https://drive.google.com/drive/folders/test-photo';
  const pdf = 'https://drive.google.com/file/d/test-pdf/view';
  let current = '';
  let writes = 0;
  let protectedByValidation = false;
  const cell = {
    getRichTextValue: () => null, getValue: () => current, getFormula: () => '',
    getDataValidation: () => protectedByValidation ? {} : null,
    setValue: value => { writes++; current = value; }
  };
  const pdfCell = { getRichTextValue: () => ({ getLinkUrl: () => pdf }), getValue: () => '書類' };
  const row = { number: 3, columns: { '📷車両状態フォルダ': 0, '📄 最新車両書類': 1 },
    sheet: { getRange: (_, column) => column === 1 ? cell : pdfCell } };
  const created = [];
  let failNext = false;
  let fileCalls = 0;
  const folder = {
    getUrl: () => url + '-date', getName: () => '2026-12-03', isTrashed: () => false,
    getFiles: () => iterate(created.filter(file => !file.trashed)),
    createFile() {
      if (++fileCalls === 3 && failNext) throw Error('simulated failure');
      const file = { trashed: false, getId:()=>String(fileCalls), setTrashed(value) { this.trashed = value; } };
      created.push(file);
      return file;
    }
  };
  const parent = { getUrl: () => url, getFoldersByName: () => iterate([folder]), getFolders: () => iterate([folder]) };
  const blob = { copyBlob: () => ({ setName: () => blob }) };
  assert.equal(context.GF3_ReadCanonicalMedia_(row)['📄 最新車両書類'], pdf);
  assert.equal(context.GF3_SaveCanonicalPhotos_(row, parent, '2026-12-03', [blob]).saved, 1);
  assert.equal(current, url);
  failNext = true;
  assert.throws(() => context.GF3_SaveCanonicalPhotos_(row, parent, '2026-12-03', [blob, blob]), /simulated failure/);
  assert.equal(created[0].trashed, false);
  assert.equal(created[1].trashed, true);
  assert.equal(writes, 1);
  protectedByValidation = true;
  assert.throws(() => context.GF3_CanonicalPhotoFolderCell_(row), /folder_link_conflict/);
  assert.equal(context.GF3_CanonicalDriveUrl_('https://drive.google.com.example.test/file'), '');
});

test('photo cancellation preflights the entire batch and preserves files from another folder', () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../integrations/gas/review/GF3_CanonicalMedia.gs', import.meta.url), 'utf8'), context);
  const date='2026-12-03';
  const folder={getId:()=> 'authorized-folder'};
  const makeFile=parent=>({
    trashed:false,getName:()=>date+'_1b3ef015-f01c-4b02-a295-6d7fd43fdd09_01.jpg',
    getParents:()=>iterate([{getId:()=>parent}]),isTrashed(){return this.trashed},
    setTrashed(value){this.trashed=value}
  });
  const allowed=makeFile('authorized-folder'),foreign=makeFile('different-folder');
  assert.throws(()=>context.GF3_CancelCanonicalPhotoFiles_(folder,date,[allowed,foreign]),/file_denied/);
  assert.equal(allowed.trashed,false);
  context.GF3_CancelCanonicalPhotoFiles_(folder,date,[allowed]);
  assert.equal(allowed.trashed,true);
  assert.equal(foreign.trashed,false);
});

test('existing mobile photo API returns the original count and a scoped cancellation receipt', () => {
  const context=vm.createContext({GF3_ProgressDate_:value=>value});
  vm.runInContext(readFileSync(new URL('../integrations/gas/review/GF3_FixtureMedia.gs',import.meta.url),'utf8'),context);
  context.GF3_SaveFixturePhotos=(id,date,images)=>{
    assert.equal(id,'V900005');
    assert.equal(date,'2026-12-03');
    assert.equal(images[0],'data:image/jpeg;base64,dummy');
    return {saved:1,folderUrl:'https://example.test/folder',fileIds:['test-photo-id']};
  };
  const result=context.スマホから車両状態写真を登録する('V900005',[{Base64:'dummy'}],'2026-12-03');
  assert.equal(result.保存枚数,1);
  assert.equal(result.取消情報.VehicleID,'V900005');
  assert.equal(result.取消情報.ファイルID一覧[0],'test-photo-id');
});
