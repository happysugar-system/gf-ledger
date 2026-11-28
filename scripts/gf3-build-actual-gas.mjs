import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const destination = process.argv[2];
if (!destination) throw Error('Usage: node scripts/gf3-build-actual-gas.mjs OUTPUT_DIRECTORY');
const review = new URL('../integrations/gas/review/', import.meta.url);
const sources = ['GF3_CanonicalRows', 'GF3_ReturnHistoryPlan', 'GF3_ActualPlan', 'GF3_ActualStorageClient', 'GF3_ActualFixtureWorker', 'GF3_LedgerFixtureSync', 'GF3_MonthlyDelivery', 'GF3_CanonicalMedia', 'GF3_FixtureMedia'];
const code = sources.map(name => readFileSync(new URL(name + '.gs', review), 'utf8')).join('\n');
const html = execFileSync(process.execPath, [fileURLToPath(new URL('./gf3-build-mobile-gas.mjs', import.meta.url))]);
mkdirSync(destination, { recursive: true });
writeFileSync(resolve(destination, 'GF3_ActualValidation.gs'), code);
writeFileSync(resolve(destination, 'GF3_FixtureSnapshot.gs'), readFileSync(new URL('GF3_FixtureSnapshot.gs', review)));
writeFileSync(resolve(destination, 'GF3_MobileManagement.html'), html);
