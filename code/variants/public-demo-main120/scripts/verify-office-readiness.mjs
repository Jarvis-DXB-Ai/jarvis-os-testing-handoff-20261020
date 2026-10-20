// Read-only checks against the current Office, never demo fixtures or seed data.
const origin='http://127.0.0.1:3101';
const [page,response]=await Promise.all(['/office','/api/office/readiness'].map(path=>fetch(origin+path,{signal:AbortSignal.timeout(20000)})));
if(!page.ok||!response.ok)throw new Error('The local Office page or readiness service is unavailable.');
const r=await response.json();
for(const check of r.checks)console.log(`${check.ready?'PASS':'BLOCKED'} ${check.title}: ${check.detail}`);
console.log(r.message);
console.log(`Approved foundations: ${r.knowledge.approvedFoundations}; approved lessons: ${r.knowledge.approvedLessons}`);
console.log(r.verifiedTaskId?`Verified department workflow: ${r.verifiedTaskId}`:'Complete current department workflow: not yet verified');
if(r.blockers.length||r.recoveryRequired||(process.argv.includes('--require-workflow')&&!r.verifiedTaskId))process.exitCode=1;
