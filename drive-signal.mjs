import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.PW });
const p = await (await b.newContext({ viewport:{width:1440,height:900} })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
async function attempt(fn, label) {
  let n=0,t0=Date.now();
  while(n<40){n++; if(await fn()) { console.log(`${label}: ok in ${n} attempts, ${Date.now()-t0}ms`); return; } await p.waitForTimeout(120);}
  throw new Error(`${label} FAILED after ${n}`);
}
const read = () => p.evaluate(() => ({
  chips: [...document.querySelectorAll('.roster-item')].map(li => [
    li.querySelector('.roster-name')?.textContent.trim(),
    !!li.querySelector('[data-testid="roster-changed"]')
  ]),
  oracle: document.querySelector('[data-testid="touch-count"]')?.textContent.replace(/\s+/g,' ').trim()
}));
await attempt(async()=>{const e=await p.$('.roster-row'); if(!e) return false; await e.click().catch(()=>{}); return p.evaluate(()=>!!document.querySelector('.work-name'));}, 'open');
await attempt(async()=>{const e=await p.$('[data-preset="all"]'); if(!e) return false; await e.click().catch(()=>{}); return p.evaluate(()=>(document.querySelector('[data-testid="batch-count"]')?.textContent||'').includes('7 students'));}, 'select all');
await attempt(async()=>{
  const n = await p.evaluate(()=>document.querySelectorAll('.level-picker').length);
  for(let i=0;i<n;i++){ await p.evaluate(i=>document.querySelectorAll('.level-picker')[i]?.querySelector('.level-btn')?.click(), i); await p.waitForTimeout(80);} 
  return p.evaluate(()=>(document.querySelector('.score-total')?.textContent||'').includes('20 / 20'));
}, 'score');
await attempt(async()=>{const e=await p.$('[data-testid="batch-arm-return"]'); if(!e) return false; await e.click().catch(()=>{}); return p.evaluate(()=>!!document.querySelector('[data-testid="batch-plan"]'));}, 'arm');
console.log('regrade warning:', await p.evaluate(()=>document.querySelector('[data-testid="batch-regrade"]')?.textContent.replace(/\s+/g,' ').trim() ?? null));
console.log('plan Ben row:', await p.evaluate(()=>{const r=document.querySelector('[data-plan-row="ben@boscotech.net"]'); return r?[...r.querySelectorAll('td')].map(t=>t.textContent.replace(/\s+/g,' ').trim()):null;}));
await attempt(async()=>{const e=await p.$('[data-testid="batch-commit"]'); if(!e) return false; await e.click().catch(()=>{}); return p.evaluate(()=>!!document.querySelector('[data-testid="batch-outcome"]'));}, 'commit');
console.log('AFTER BULK GRADE:', JSON.stringify(await read()));
await attempt(async()=>{const e=await p.$('[data-testid="touch-alice"]'); if(!e) return false; await e.click().catch(()=>{}); return p.evaluate(()=>!!document.querySelector('[data-testid="roster-changed"]'));}, 'touch Alice');
console.log('AFTER ALICE EDITS:', JSON.stringify(await read()));
console.log('errors:', JSON.stringify(errs.slice(0,3)));
await b.close();
