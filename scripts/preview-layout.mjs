// Local, fictional transport only. This entry is never part of the Vite build.
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),output=path.join(root,'.wrangler/layout-preview');
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
await mkdir(output,{recursive:true});
const result=await build({absWorkingDir:root,entryPoints:['worker/tests/fixtures/roles-ui.tsx'],bundle:true,write:false,external:['/lan-hall.png'],format:'esm',jsx:'automatic',define:{'import.meta.env.DEV':'true','import.meta.env.VITE_AUTH_MODE':'"hosted-dev"','__LAN_BUILD_SHA__':'"local-layout-review"'},outfile:path.join(output,'after.js')});
for(const file of result.outputFiles)await writeFile(file.path,file.contents);
await writeFile(path.join(output,'after.html'),'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LAN Party layout review</title><link rel="stylesheet" href="/after.css"></head><body><div id="root"></div><script type="module" src="/after.js"></script></body></html>');
if(!process.argv.includes('--build-only')){
 const files={'/after.js':['after.js','text/javascript'],'/after.css':['after.css','text/css'],'/lan-hall.png':[path.join(root,'public/lan-hall.png'),'image/png']};
 const server=createServer(async(request,response)=>{
  const pathname=new URL(request.url,'http://127.0.0.1:5189').pathname;
  response.setHeader('Cache-Control','no-store');
  if(request.method!=='GET'||pathname.startsWith('/api/')){response.writeHead(405);response.end('Fictional layout preview only');return;}
  const [file,type]=files[pathname]??['after.html','text/html'];
  try{const content=await readFile(path.isAbsolute(file)?file:path.join(output,file));response.setHeader('Content-Type',type);response.end(content);}
  catch{response.writeHead(404);response.end('Preview asset unavailable');}
 });
 server.listen(5189,'127.0.0.1',()=>console.log('Local fictional layout review:\nPublic: http://127.0.0.1:5189/after.html?mode=guest&route=/\nMember: http://127.0.0.1:5189/after.html?mode=member&route=/account\nAdministrator: http://127.0.0.1:5189/after.html?mode=admin&route=/manage/roles'));
}
