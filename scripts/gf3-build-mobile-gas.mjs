import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../mobile-management/' + path, import.meta.url), 'utf8');
const inline = (path) => read(path).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const source = read('index.html')
  .replace(/<html\b/, '<html data-gf3-host="true"')
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/[^"]+"><\/script>/, '')
  .replace(/(<script type="module">)[\s\S]*?const gf3Host=/,
    (_, tag) => tag + '\n' + inline('vehicle-schema.mjs') + inline('vehicle-reader.mjs') + '\nconst gf3Host=');
if (!source.includes('const gf3Host=') || !source.includes('export ') && !source.includes('function filterVehicles'))
  throw new Error('GF3 HTML bundling failed');
process.stdout.write(source);
