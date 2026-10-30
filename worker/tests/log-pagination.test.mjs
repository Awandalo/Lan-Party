import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import {renderToStaticMarkup} from 'react-dom/server';import LogPagination from './src/components/LogPagination';export const page=(props)=>renderToStaticMarkup(<LogPagination {...props}/>);`},bundle:true,write:false,packages:'external',platform:'node',format:'cjs',jsx:'automatic',loader:{'.js':'jsx'}});
const m=new Module(import.meta.filename);m.paths=Module._nodeModulePaths(process.cwd());m._compile(result.outputFiles[0].text,import.meta.filename);const {page}=m.exports;
const props={label:'User Log',page:1,hasNewer:false,hasOlder:false,loading:false,onNewer(){},onOlder(){}};
test('single and empty cursor pages render no inactive pagination or redundant page label',()=>{assert.equal(page(props),'');assert.equal(page({...props,loading:true}),'');});
test('cursor paging remains visible on older and final pages, with loading controls disabled',()=>{
 assert.match(page({...props,hasOlder:true}),/Page 1/);
 const last=page({...props,page:2,hasNewer:true});assert.match(last,/Page 2/);assert.match(last,/Newer activity/);assert.match(last,/disabled="">Older activity/);
 assert.equal((page({...props,hasNewer:true,hasOlder:true,loading:true}).match(/disabled=""/g)??[]).length,2);
});
