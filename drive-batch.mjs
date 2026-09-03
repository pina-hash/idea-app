import { chromium } from 'playwright-core';
const W = Number(process.argv[3] ?? 1440), H = W === 375 ? 812 : 900;
const b = await chromium.launch({ executablePath: process.env.PW });
const ctx = await b.newContext({ viewport: { width: W, height: H } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
await p.addStyleTag({ content: '*{transition:none !important}' });

// STEP 1: open a student. Retry against the effect, not a timer.
async function attempt(fn, label) {
  let n = 0, t0 = Date.now();
  while (n < 40) { n++; if (await fn()) return console.log(`${label}: ok in ${n} attempts, ${Date.now()-t0}ms`);
    await p.waitForTimeout(120); }
  throw new Error(`${label} FAILED after ${n} attempts`);
}
await attempt(async () => {
  const el = await p.$('.roster-row');
  if (!el) return false;
  await el.click().catch(()=>{});
  return await p.evaluate(() => !!document.querySelector('.work-name'));
}, 'open first student');

await attempt(async () => {
  const el = await p.$('[data-preset="ungraded"]');
  if (!el) return false;
  await el.click().catch(()=>{});
  return await p.evaluate(() => (document.querySelector('[data-testid="batch-count"]')?.textContent||'').includes('students selected'));
}, 'preset: not graded yet');

console.log('selection:', await p.evaluate(() => document.querySelector('[data-testid="batch-count"]')?.textContent.trim()));

// STEP 2: score the rubric (pick the first level of each criterion)
await attempt(async () => {
  // RE-QUERIED EACH TIME: picking a level re-renders the group, so a handle
  // taken before the first click is stale for the second.
  const n = await p.evaluate(() => document.querySelectorAll('.level-picker').length);
  for (let i = 0; i < n; i++) {
    await p.evaluate((i) => {
      const grp = document.querySelectorAll('.level-picker')[i];
      grp?.querySelector('.level-btn')?.click();
    }, i);
    await p.waitForTimeout(80);
  }
  return await p.evaluate(() => (document.querySelector('.score-total')?.textContent||'').includes('20 / 20'));
}, 'score every criterion');

// STEP 3: arm the return
await attempt(async () => {
  const el = await p.$('[data-testid="batch-arm-return"]');
  if (!el) return false;
  await el.click().catch(()=>{});
  return await p.evaluate(() => !!document.querySelector('[data-testid="batch-plan"]'));
}, 'arm return');

console.log(JSON.stringify(await p.evaluate(() => {
  const q = s => [...document.querySelectorAll(s)];
  return {
    planHead: document.querySelector('.batch-plan-head')?.textContent.replace(/\s+/g,' ').trim(),
    planRows: q('[data-plan-row]').map(r => [...r.querySelectorAll('td')].map(td=>td.textContent.replace(/\s+/g,' ').trim())),
    hasClassCol: [...document.querySelectorAll('.plan-table th')].map(t=>t.textContent.trim()),
    regrade: document.querySelector('[data-testid="batch-regrade"]')?.textContent.replace(/\s+/g,' ').trim() ?? null,
    problems: q('[data-testid="batch-problems"] li').map(l=>l.textContent.replace(/\s+/g,' ').trim()),
    commit: document.querySelector('[data-testid="batch-commit"]')?.textContent.trim(),
    commitAria: document.querySelector('[data-testid="batch-commit"]')?.getAttribute('aria-disabled'),
  };
}, null), null, 1));

// STEP 4: commit
await attempt(async () => {
  const el = await p.$('[data-testid="batch-commit"]');
  if (!el) return false;
  await el.click().catch(()=>{});
  return await p.evaluate(() => !!document.querySelector('[data-testid="batch-outcome"]'));
}, 'commit batch');

console.log(JSON.stringify(await p.evaluate(() => {
  const q = s => [...document.querySelectorAll(s)];
  return {
    headline: document.querySelector('[data-testid="batch-headline"]')?.textContent.replace(/\s+/g,' ').trim(),
    outcome: q('[data-outcome-row]').map(r => r.textContent.replace(/\s+/g,' ').trim()),
    stillPicked: document.querySelector('[data-testid="batch-count"]')?.textContent.replace(/\s+/g,' ').trim(),
    checked: q('[data-testid="roster-pick"] input').filter(i=>i.checked).length,
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    docW: document.documentElement.scrollWidth,
  };
}), null, 1));
console.log('console errors:', JSON.stringify(errs.slice(0,5)));
await b.close();
