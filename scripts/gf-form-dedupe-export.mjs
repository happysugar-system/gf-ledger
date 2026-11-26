// Offline transform for the reviewed Apps Script export. No project or Sheets access.
import {readFile, writeFile} from 'node:fs/promises';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: node scripts/gf-form-dedupe-export.mjs INPUT.json OUTPUT.json');

const project = JSON.parse(await readFile(input, 'utf8'));
const form = project.files.filter(file => file.name === 'GF 車両入力フォーム テスト' && file.type === 'server_js');
if (form.length !== 1) throw Error('Expected exactly one form server source');
const [server] = form;
const pattern = /^function GF_車両新規追加\(p\) \{\r?\n[\s\S]*?^\}(?=\r?$)/gm;
const definitions = [...server.source.matchAll(pattern)];
if (definitions.length !== 2 || definitions[0][0] !== definitions[1][0]) {
  throw Error('Expected two identical definitions; review this export before editing');
}
const [{index, 0: duplicate}] = definitions;
server.source = server.source.slice(0, index) + server.source.slice(index + duplicate.length);
await writeFile(output, JSON.stringify(project, null, 2) + '\n', {flag: 'wx', mode: 0o600});
