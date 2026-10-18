import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
// Exercise the real component's event closure with minimal hook fixtures. Actual
// rendering, focus and disabled controls are checked separately in the browser.
const code=(await build({entryPoints:['src/components/GoogleButton.tsx'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{
 name:'offline-hooks',setup(b){
  b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'fixture'}));
  b.onResolve({filter:/^react\/jsx-runtime$/},()=>({path:'jsx',namespace:'jsx'}));
  b.onLoad({filter:/.*/,namespace:'jsx'},()=>({contents:'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`
   export const useRef=value=>({current:value});
   export const useState=value=>[value,()=>{}];
   export const useEffect=effect=>{const cleanup=effect();if(cleanup)globalThis.fixtureCleanups.push(cleanup);};
   export const useImperativeHandle=(ref,create)=>{if(ref)ref.current=create();};
  `}));
  b.onResolve({filter:/\/lib\/google$/},()=>({path:'request',namespace:'request'}));
  b.onLoad({filter:/.*/,namespace:'request'},()=>({contents:'export const googleRequest=(...args)=>globalThis.fixtureGoogleRequest(...args);'}));
  b.onResolve({filter:/LoginChallenge$/},()=>({path:'challenge',namespace:'challenge'}));
  b.onLoad({filter:/.*/,namespace:'challenge'},()=>({contents:'export default ()=>null;'}));
 }
}]})).outputFiles[0].text;
const {default:GoogleButton}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function fixture(run){return async()=>{
 const previous=globalThis.window;let calls=0,redirects=0;
 globalThis.fixtureCleanups=[];
 globalThis.window={location:{assign(){redirects++;}}};
 try{await run({button:()=>GoogleButton({}).props.children[1],counts:()=>({calls,redirects}),respond(fn){globalThis.fixtureGoogleRequest=()=>{calls++;return fn();};}});}
 finally{globalThis.window=previous;delete globalThis.fixtureGoogleRequest;delete globalThis.fixtureCleanups;}
};}
test('Google start ignores repeated clicks while pending and throughout successful redirect',fixture(async({button,respond,counts})=>{
 let finish;respond(()=>new Promise(resolve=>finish=resolve));const control=button();
 control.props.onClick();control.props.onClick();assert.equal(counts().calls,1);
 finish(Response.json({url:'https://accounts.google.com/o/oauth2/v2/auth?state=fictional'}));
 await new Promise(resolve=>setImmediate(resolve));control.props.onClick();
 assert.deepEqual(counts(),{calls:1,redirects:1});
}));
test('failed Google start permits an explicit retry without an automatic request',fixture(async({button,respond,counts})=>{
 respond(async()=>Response.json({error:'Unavailable'},{status:503}));const control=button();control.props.onClick();
 await new Promise(resolve=>setImmediate(resolve));assert.equal(counts().calls,1);
 control.props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(counts(),{calls:2,redirects:0});
}));
test('leaving the page prevents a delayed Google response from redirecting',fixture(async({button,respond,counts})=>{
 let finish;respond(()=>new Promise(resolve=>finish=resolve));button().props.onClick();
 for(const cleanup of globalThis.fixtureCleanups)cleanup();
 finish(Response.json({url:'https://accounts.google.com/o/oauth2/v2/auth'}));
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(counts(),{calls:1,redirects:0});
}));
