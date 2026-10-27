import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {build}=wr('esbuild'),{experimental_readRawConfig}=require('wrangler');
const target='lan-party:9fbe3402-c26b-45fd-be67-71775e5e6a3e',origin='https://www.lan-party.club';
const env={AUTH_ENVIRONMENT:'prod',AUTH_PUBLIC_ORIGIN:origin,AUTH_EMAIL_TRANSPORT:'resend'};
async function moduleAt(entry,identity){const result=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',define:identity?{__LAN_MFA_TARGET__:JSON.stringify(identity)}:{}});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}
test('PROD requires its trusted build, exact origin and mode; all defaults and cross-environment combinations deny',async()=>{
 for(const identity of [undefined,'lan-party-dev:a3c4cea6-ceb7-43b8-b9b7-b374726b35b4',target]){
  const gate=await moduleAt('worker/auth/environment.ts',identity),req=new Request(origin+'/api/auth/session');
  assert.equal(gate.authRouteEnabled(req,env,'hosted-prod'),identity===target);
  assert.equal(gate.authRouteEnabled(new Request('https://dev.lan-party.club'),{AUTH_ENVIRONMENT:'dev'},'hosted-dev'),identity!==target);
  for(const mode of [undefined,'disabled','hosted-dev','local-only'])assert.equal(gate.authRouteEnabled(req,env,mode),false);
  for(const host of ['https://lan-party.club','https://dev.lan-party.club','http://www.lan-party.club','https://www.lan-party.club:8443','https://lan-party.servok.workers.dev','https://www.lan-party.club.evil.test'])assert.equal(gate.authRouteEnabled(new Request(host),env,'hosted-prod'),false);
  if(identity===target){assert.equal(gate.authOrigin(req,env).origin,origin);assert.throws(()=>gate.authClientIP(req,env));
   for(const invalid of [{AUTH_ENVIRONMENT:'dev'},{AUTH_PUBLIC_ORIGIN:'https://lan-party.club'},{AUTH_PUBLIC_ORIGIN:origin+'/'},{AUTH_EMAIL_TRANSPORT:'local'}])assert.equal(gate.authRouteEnabled(req,{...env,...invalid},'hosted-prod'),false);
  }
 }
});
test('explicit PROD deployment profile retains disabled modes and default/DEV identities remain isolated',async()=>{
 const {rawConfig:c}=await experimental_readRawConfig({config:'wrangler.jsonc'});const p=c.env.prod;
 assert.equal(c.define?.__LAN_MFA_TARGET__,undefined);assert.equal(c.vars?.REGISTRATION_MODE,undefined);
 assert.equal(p.name,'lan-party');assert.equal(p.d1_databases[0].database_id,target.split(':')[1]);assert.equal(JSON.parse(p.define.__LAN_MFA_TARGET__),target);
 assert.equal(p.vars.REGISTRATION_MODE,'disabled');assert.equal(p.vars.AUTH_SESSION_MODE,'disabled');assert.equal(p.vars.AUTH_PUBLIC_ORIGIN,origin);
 for(const name of ['PASSWORD_PEPPER','AUTH_RATE_LIMIT_SECRET','RESEND_API_KEY','TURNSTILE_SECRET_KEY','MFA_ENCRYPTION_KEYS','MFA_ACTIVE_KEY_ID','AUTH_PROD_EMAIL_DAILY_LIMIT','AUTH_PROD_EMAIL_MONTHLY_LIMIT'])assert.equal(p.vars[name],undefined);
 assert.equal(c.env.dev.name,'lan-party-dev');assert.equal(c.env.dev.vars.AUTH_ENVIRONMENT,undefined);assert.notEqual(p.d1_databases[0].database_id,c.env.dev.d1_databases[0].database_id);
});
test('MFA presentation exposes PROD only with its explicit flag and canonical HTTPS origin',async()=>{
 const ui=await moduleAt('src/lib/mfa-mode.ts');
 assert.equal(ui.mfaUiEligible(false,'hosted-prod',origin),true);
 for(const flag of [undefined,'','hosted-dev'])assert.equal(ui.mfaUiEligible(false,flag,origin),false);
 for(const host of ['https://lan-party.club','https://dev.lan-party.club','http://www.lan-party.club','https://lan-party.servok.workers.dev'])assert.equal(ui.mfaUiEligible(false,'hosted-prod',host),false);
});
