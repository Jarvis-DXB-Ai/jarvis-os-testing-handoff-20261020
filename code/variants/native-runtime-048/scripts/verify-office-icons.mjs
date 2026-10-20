import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const {icons}=JSON.parse(await read('public/office-icons/sources.json'));
const plan=JSON.parse(await read('src/lib/office-stack-plan.json'));
const ids=new Set(),files=new Set();
for(const icon of icons){
  assert(icon.id&&!ids.has(icon.id),`Duplicate/missing provider: ${icon.id}`);
  assert(/^[a-z0-9-]+\.(svg|png|ico)$/.test(icon.file)&&!files.has(icon.file),`Invalid/duplicate file: ${icon.file}`);
  assert(new URL(icon.source).protocol==='https:',`Source missing: ${icon.id}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(icon.checkedAt)&&icon.licence,`Review metadata missing: ${icon.id}`);
  const bytes=await readFile(new URL(`public/office-icons/${icon.file}`,root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),icon.sha256,`Reviewed artwork changed: ${icon.id}`);
  ids.add(icon.id);files.add(icon.file);
}
for(const app of plan.apps){
  if(!['assets','review'].includes(app.id))assert(ids.has(app.id),`Verified artwork required for ${app.id}`);
}
const component=await read('src/components/office/office-connection-icons.tsx');
assert(component.includes('iconSources.icons.map'), 'Dock must use the verified registry');
assert(component.includes('Verified logo pending'), 'Unknown providers need an honest text fallback');
const css=await read('src/components/office/office-connection-icons.module.css');
assert(!/filter\s*:/.test(css),'Vendor artwork must not receive visual filters');
assert(!/\[data-state=[^}]+\.mark\{[^}]*opacity\s*:/.test(css),'Connection state must not fade vendor marks');
console.log(`Verified ${icons.length} provider assets, catalogue coverage, hashes and undistorted state styling.`);
