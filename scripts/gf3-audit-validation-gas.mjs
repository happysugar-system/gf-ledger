import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const directory = process.argv[2];
if (!directory) throw Error('Usage: node scripts/gf3-audit-validation-gas.mjs APPS_SCRIPT_DIRECTORY');
const entries = readdirSync(directory).filter(name=>/\.(gs|js)$/.test(name));
const code = entries.map(name=>readFileSync(resolve(directory,name),'utf8')).join('\n');
new vm.Script(code);
const definitions = new Map();
for (const [,name] of code.matchAll(/^function\s+([^\s(]+)\s*\(/gm)) {
  definitions.set(name,(definitions.get(name)||0)+1);
}
const required = [
  'doGet','GF3_MobileManagementDoGet_','GF3_DocumentUiDoGet_','GF3_DocumentUiOwner_',
  'GF3_ReadFixtureSnapshot','GF3_SaveFixtureAssignment','GF3_SaveFixtureProgress','GF3_SaveActualFixture',
  'GF3_ReadActualDeliveryMonths','GF3_RefreshMonthlyDelivery_','GF3_SaveFixturePhotos',
  'GF3_DocumentUiSave','GF3_OnLedgerFixtureEdit','GF3_RefreshLedgerFixtureSync',
];
for (const name of required) {
  if (definitions.get(name)!==1) throw Error('Missing or duplicate validation entrypoint: '+name);
}
if (/シート名\.(?:車両状況|利用者管理)|getSheetByName\(\s*['"](?:車両状況|利用者管理)['"]/.test(code))
  throw Error('Validation package contains a legacy sheet lookup');
const manifest=JSON.parse(readFileSync(resolve(directory,'appsscript.json'),'utf8'));
if (manifest.webapp?.executeAs!=='USER_ACCESSING'||manifest.webapp?.access!=='MYSELF')
  throw Error('Validation web app owner boundary changed');
if (!manifest.dependencies?.enabledAdvancedServices?.some(service=>service.serviceId==='sheets'))
  throw Error('Sheets advanced service missing');
console.log('Validated '+required.length+' entrypoints and trigger handlers, owner boundary and Sheets service.');
