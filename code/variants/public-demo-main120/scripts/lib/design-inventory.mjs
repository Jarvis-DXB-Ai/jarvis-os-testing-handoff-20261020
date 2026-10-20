import postcss from 'postcss';
import {createHash} from 'node:crypto';
export function createDesignInventory(sources) {
  const definitions=[];
  const files=sources.map(({path,css})=>{
    const root=postcss.parse(css,{from:path});let declarationCount=0;
    root.walkDecls(decl=>{
      if(!decl.prop.startsWith('--')) return;
      declarationCount++;
      const contexts=[];let parent=decl.parent;
      while(parent && parent.type!=='root') {contexts.unshift(parent.type==='rule'?parent.selector:`@${parent.name} ${parent.params}`);parent=parent.parent;}
      definitions.push({name:decl.prop,value:decl.value,important:!!decl.important,file:path,line:decl.source.start.line,scope:contexts.join(' → ') || 'stylesheet',module:path.endsWith('.module.css')});
    });
    return {path,lines:css.split('\n').length,customProperties:declarationCount,hash:createHash('sha256').update(css).digest('hex').slice(0,12)};
  });
  const names=[...new Set(definitions.map(item=>item.name))].sort();
  const repeated=names.flatMap(name=>{const rows=definitions.filter(item=>item.name===name);return rows.length>1?[{name,definitions:rows}]:[];});
  const variants=names.flatMap(name=>{const rows=definitions.filter(item=>item.name===name);return new Set(rows.map(item=>item.value)).size>1?[{name,definitions:rows}]:[];});
  return {sourceHash:createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,16),files,definitions,names,variants,repeated};
}
