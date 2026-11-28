import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const destination = process.argv[2];
if (!destination) throw Error('Usage: node scripts/gf3-build-canonical-actual.mjs OUTPUT_DIRECTORY');
const review = new URL('../integrations/gas/review/', import.meta.url);
const source = name => readFileSync(new URL(name + '.gs', review), 'utf8');
function from(name, marker) {
  const file = source(name);
  const start = file.indexOf('function ' + marker + '(');
  if (start < 0) throw Error('Missing shared function: ' + marker);
  return file.slice(start);
}

const bundle = [
  source('GF3_CanonicalRows'),
  from('GF3_FixtureProgress', 'GF3_ProgressDate_').split('function GF3_ProgressFields_(')[0],
  from('GF3_ReturnHistoryPlan', 'GF3_CanonicalReturnHistoryPlan_'),
  from('GF3_ActualPlan', 'GF3_CanonicalActualPlan_'),
  from('GF3_ActualFixtureWorker', 'GF3_ActualCell_'),
].join('\n');
if (/V900005|D999902|TEST-GF3-|tgxrnrqxafytyqfwwsag|車両状況|利用者管理/.test(bundle))
  throw Error('Canonical worker contains a validation or legacy dependency');
mkdirSync(destination, { recursive: true });
writeFileSync(resolve(destination, 'GF3_CanonicalActual.gs'), bundle);
