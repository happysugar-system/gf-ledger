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
      const file = { trashed: false, setTrashed(value) { this.trashed = value; } };
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
