import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import MemberBillGroup from './src/components/MemberBillGroup';import {filterBillsByPayment} from './src/lib/event-finance';export const filter=filterBillsByPayment;export const render=(bill,finalized=false,editable=false,pending=false)=>renderToStaticMarkup(<MemberBillGroup bill={bill} dailyRateCents={4300} finalized={finalized} onPaymentChange={editable?()=>{}:undefined} paymentPending={pending}/>);`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'}});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(result.outputFiles[0].text,import.meta.filename);const {render,filter}=mod.exports;
const days=['2030-11-01','2030-11-02'];
const example=()=>({owner:'alice',totalCents:17200,lines:[{name:'Pixel Alice',kind:'Member',days,complimentary:false,totalCents:8600},{name:'Guest <Nova>',kind:'Invited guest',days,complimentary:false,totalCents:8600}]});

test('combined bills default to collapsed member groups with visible total and separate guest rows',()=>{
 const html=render(example());assert.ok(html.startsWith('<details class="finance-member-group">'));assert.equal(html.includes('<details open'),false);
 const summary=html.slice(html.indexOf('<summary>'),html.indexOf('</summary>'));assert.ok(summary.includes('Pixel Alice'));assert.ok(summary.includes('€ 172,00'));assert.equal(summary.includes('Guest'),false);
 assert.ok(html.includes('Participant / type'));assert.ok(html.includes('>Days</th>'));assert.ok(html.includes('>Total</th>'));assert.equal(html.includes('Rate / day'),false);
 assert.ok(html.includes('finance-guest-line'));assert.ok(html.includes('>Guest</span>'));assert.ok(html.includes('Guest &lt;Nova&gt;'));assert.equal(html.includes('<Nova>'),false);
 assert.ok(html.includes('<tfoot>'));assert.ok(html.includes('Total calculation'));assert.ok(html.includes('4 payable days × € 43,00'));assert.equal(html.includes('Unpaid'),false);
});

test('complimentary days remain explicit in the calculation and final payment status is read-only',()=>{
 const bill=example();bill.lines[1].complimentary=true;bill.lines[1].totalCents=0;bill.totalCents=8600;
 const html=render(bill,true);assert.ok(html.includes('2 payable days × € 43,00 + 2 complimentary days × € 0,00'));assert.ok(html.includes('Free'));assert.ok(html.includes('Unpaid'));assert.equal(html.includes('<button'),false);
 bill.paid=1;assert.ok(render(bill,true).includes('Paid'));
 bill.lines.forEach(line=>{line.complimentary=true;line.totalCents=0;});bill.totalCents=0;assert.ok(render(bill,true).includes('No payment due'));
});

test('erased bills retain only the anonymous heading and locked amount without inventing a calculation',()=>{
 const html=render({owner:null,lines:[],totalCents:4300,paid:0},true);assert.ok(html.includes('Account no longer exists'));assert.ok(html.includes('€ 43,00'));assert.ok(html.includes('Identifying details removed'));assert.equal(html.includes('<table'),false);assert.equal(html.includes('Total calculation'),false);
});


test('payment switch stays inside the expanded bill content, exposes Paid/Unpaid and disables while saving',()=>{
 const bill=example(),html=render(bill,true,true),summary=html.slice(html.indexOf('<summary>'),html.indexOf('</summary>'));
 assert.equal(summary.includes('role="switch"'),false);assert.ok(html.includes('Payment received for Pixel Alice'));assert.ok(html.includes('role="switch"'));assert.ok(html.includes('Unpaid'));assert.ok(html.includes('Includes this member and their guests.'));
 bill.paid=1;const paid=render(bill,true,true,true);assert.ok(paid.includes('checked=""'));assert.ok(paid.includes('disabled=""'));assert.ok(paid.includes('>Paid<'));
 assert.equal(render(bill,false).includes('role="switch"'),false);
});


test('payment filters select combined positive bills without treating zero-value bills as unpaid',()=>{
 const bills=[{id:'paid-member-and-guest',totalCents:17200,paid:1},{id:'unpaid-member',totalCents:4300,paid:0},{id:'zero-free',totalCents:0,paid:0},{id:'zero-recorded-paid',totalCents:0,paid:1},{id:'default-unpaid',totalCents:8600}];
 const snapshot=structuredClone(bills);
 assert.deepEqual(filter(bills,'all').map(b=>b.id),bills.map(b=>b.id));
 assert.deepEqual(filter(bills,'paid').map(b=>b.id),['paid-member-and-guest']);
 assert.deepEqual(filter(bills,'unpaid').map(b=>b.id),['unpaid-member','default-unpaid']);
 assert.deepEqual(bills,snapshot);
 bills[1].paid=1;assert.deepEqual(filter(bills,'unpaid').map(b=>b.id),['default-unpaid']);assert.equal(filter(bills,'paid').length,2);
 assert.deepEqual(filter([],'unpaid'),[]);
});
