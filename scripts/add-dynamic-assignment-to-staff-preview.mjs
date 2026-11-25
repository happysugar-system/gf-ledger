import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';

const directory=process.argv[2];
if(!directory)throw Error('Specify the existing validation Site dist directory');
const path=join(directory,'index.html');
let html=readFileSync(path,'utf8');
if(!html.includes('const waitingValidationMode=true;'))throw Error('Wrong Site: staff validation mode is not fixed');
const hook=" const gfCheckFields=";
if(html.split(hook).length!==2||html.split('</body>').length!==2)throw Error('Staff UI markup changed');
if(html.includes('window.gfDynamicAssignmentPanel?.'))throw Error('Assignment panel already installed');
html=html.replace(hook,` if(detailReady && waitingValidationMode){
  window.gfDynamicAssignmentPanel?.({
   fields,receiptId:r.受付ID,driverId:rawContract['確認DriverID'],
   session:async()=>(await receptionAuthClient.auth.getSession()).data.session?.access_token,
   isCurrent:()=>selectedReception===r,
  });
 }
`+hook);
html=html.replace('</body>','<script src="./dynamic-assignment.js"></script></body>');
writeFileSync(path,html);
copyFileSync(new URL('../supabase/validation/staff-preview/dynamic-assignment.js',import.meta.url),join(directory,'dynamic-assignment.js'));
