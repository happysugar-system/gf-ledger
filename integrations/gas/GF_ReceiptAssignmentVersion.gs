/** Read-only snapshot version for the dynamic assignment candidate.
 * Call with fresh server-read tables; never accept tables from the browser.
 * Same input schema as GF_ReceiptAssignmentPlan_. The full snapshot is hashed
 * conservatively: unrelated edits also invalidate the version.
 */
function GF_ReceiptAssignmentVersion_(data,request) {
  const plan=GF_ReceiptAssignmentPlan_(data,request);
  const canonical=value=>{
    if(Array.isArray(value))return value.map(canonical);
    if(value!==null && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
    return value;
  };
  const payload=JSON.stringify(canonical({schema:1,request,data}));
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,payload,Utilities.Charset.UTF_8);
  return {version:digest.map(b=>(b&255).toString(16).padStart(2,'0')).join(''),state:plan.state};
}
function GF_ReceiptAssignmentAssertVersion_(data,request,expected) {
  if(typeof expected!=='string'||!/^[0-9a-f]{64}$/.test(expected))throw Error('invalid_expected_version');
  const current=GF_ReceiptAssignmentVersion_(data,request);
  if(current.version!==expected)throw Error('stale_assignment');
  if(current.state!=='planned')throw Error('assignment_not_planned');
  return true;
}
