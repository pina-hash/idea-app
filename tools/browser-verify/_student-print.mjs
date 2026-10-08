/**
 * ONE STUDENT'S PAGE, PRINTED (the 2026-10-07 round, report 63fb1c49: "for
 * parent teacher conferences to show the student's activity in the class"),
 * read off print media rather than guessed.
 *
 * IT IS `_`-PREFIXED, so `routes.mjs` does not pick it up as a route spec: a
 * route spec measures the screen at 375 and 1440, and this question is paper.
 *
 *   node tools/browser-verify/_student-print.mjs [--state full|no-account|unavailable|inactive] [--pdf out.pdf]
 *
 * FOR EACH STARTING THEME (IDEA, Matrix, Space White) it loads
 * /dev/classroom-student, puts that theme on the page, dispatches
 * `beforeprint` (Playwright's print emulation does not fire it, and the page's
 * own swap to Space White hangs off it), switches to print media, and
 * measures:
 *   - the theme attribute during the print (expected `space-white`);
 *   - how many boxes OUTSIDE the student page still paint (expected 0: the
 *     masthead, the trail, the tabs, the report control and the background);
 *   - the contrast of the name, a status word, a table cell and the coverage
 *     sentence against white paper, composited (expected 4.5 or more);
 *   - every card's `break-inside` (whole), and the assignments card's (it may
 *     break between rows, which never break);
 *   - whether any classmate's name or address is in the printed text
 *     (expected none), with the student's own name as the positive control;
 *   - the page count of a real PDF of the page;
 *   - with the Coins and Hall passes boxes cleared, whether both cards AND
 *     both At a glance tiles leave the paper (expected 0 printed boxes each),
 *     with the Assignments tile still painted as the positive control;
 *   - with every tile's box cleared, whether the At a glance row itself
 *     leaves the paper;
 * then dispatches `afterprint` and reads the attribute back (expected the
 * starting value exactly, absent included).
 *
 * RUN IT ALONE: it boots its own dev server and browser.
 */
import { writeFileSync } from 'node:fs';
import { launch, waitForApp } from './browser.mjs';
import { startDevServer } from './server.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const state = flag('--state', 'full');
/** `--pdf <file>` keeps the first theme's PDF, to look at or extract text from. */
const pdfOut = flag('--pdf', '');
const THEMES = [
	{ name: 'idea', attr: null },
	{ name: 'matrix', attr: 'matrix' },
	{ name: 'space-white', attr: 'space-white' }
];
const CLASSMATES = ['Ben Cho', 'Cara Diaz', 'Dev Patel', 'ben.cho@', 'cara.diaz@', 'dev.patel@'];

const server = await startDevServer({ cwd: process.cwd() });
const { browser, executablePath } = await launch();
let failures = 0;
const check = (ok, line) => {
	if (!ok) failures++;
	console.log(`${ok ? '  ok  ' : '  FAIL'} ${line}`);
};

try {
	console.log(`chromium ${executablePath}`);
	for (const theme of THEMES) {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
		const page = await context.newPage();
		await page.route(
			(url) => !(url.hostname === '127.0.0.1' || url.hostname === 'localhost'),
			(r) => r.abort()
		);
		await page.goto(`${server.origin}/dev/classroom-student?state=${state}`, { waitUntil: 'domcontentloaded' });
		await waitForApp(page);
		await page.waitForFunction(() => document.querySelector('.cr-root[data-ready="true"]'), null, { timeout: 30_000 });
		await page.evaluate((attr) => {
			const el = document.documentElement;
			if (attr === null) el.removeAttribute('data-theme');
			else el.setAttribute('data-theme', attr);
		}, theme.attr);
		console.log(`\n== starting theme ${theme.name} (data-theme ${theme.attr ?? 'absent'}), state ${state}`);

		await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
		await page.emulateMedia({ media: 'print' });
		await page.waitForTimeout(200);

		const read = await page.evaluate((classmates) => {
			const root = document.querySelector('.so-root');
			const theme = document.documentElement.getAttribute('data-theme');
			const painted = (el) => {
				const cs = getComputedStyle(el);
				if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
				const r = el.getBoundingClientRect();
				return r.width > 0 && r.height > 0;
			};
			/* A visually hidden live region (the router's announcer, 1x1 and
			   empty) paints nothing on paper; anything else that paints counts. */
			const srOnly = (el) => {
				const r = el.getBoundingClientRect();
				return r.width <= 1 && r.height <= 1 && !(el.textContent ?? '').trim();
			};
			const outside = [...document.body.querySelectorAll('*')].filter(
				(el) => !root.contains(el) && !el.contains(root) && painted(el) && ![...el.querySelectorAll('*')].length && !srOnly(el)
			);
			const outsideNames = outside.slice(0, 8).map((el) => {
				const r = el.getBoundingClientRect();
				const up = el.parentElement;
				return `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(r.width)}x${Math.round(r.height)} in ${up?.tagName.toLowerCase()}.${[...(up?.classList ?? [])].join('.')} "${(el.textContent ?? '').trim().slice(0, 30)}" ${el.getAttribute('aria-live') ?? ''}${el.getAttribute('data-nav-progress') !== null ? ' nav-progress' : ''}`;
			});

			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const ctx = canvas.getContext('2d');
			const rgba = (css) => {
				ctx.clearRect(0, 0, 1, 1);
				ctx.fillStyle = '#000';
				ctx.fillStyle = css;
				ctx.fillRect(0, 0, 1, 1);
				const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
				// Composite over white paper.
				const k = a / 255;
				return [r * k + 255 * (1 - k), g * k + 255 * (1 - k), b * k + 255 * (1 - k)];
			};
			const lum = ([r, g, b]) => {
				const f = (c) => {
					c /= 255;
					return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
				};
				return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
			};
			const onPaper = (sel) => {
				const el = document.querySelector(sel);
				if (!el) return null;
				const L = lum(rgba(getComputedStyle(el).color));
				return Math.round(((1.05) / (L + 0.05)) * 100) / 100;
			};
			const text = root.innerText;
			return {
				theme,
				outsideCount: outside.length,
				outsideNames,
				contrast: {
					name: onPaper('.so-name'),
					status: onPaper('[data-testid="so-status"]'),
					cell: onPaper('.so-table td'),
					coverage: onPaper('[data-testid="so-coverage"]'),
					meta: onPaper('.so-meta')
				},
				breaks: [...new Set([...root.querySelectorAll('.so-card:not(.so-assignments-card), .so-identity')].map((c) => getComputedStyle(c).breakInside))],
				tableBreak: getComputedStyle(root.querySelector('.so-assignments-card')).breakInside,
				rowBreak: getComputedStyle(root.querySelector('[data-testid="so-assignment-row"]')).breakInside,
				printLine: painted(document.querySelector('.so-print-line')),
				togglesPainted: [...document.querySelectorAll('.so-print-toggle')].filter(painted).length,
				actionsPainted: [...document.querySelectorAll('.so-actions')].filter(painted).length,
				classmates: classmates.filter((n) => text.includes(n)),
				ownName: text.includes('Ana Reyes')
			};
		}, CLASSMATES);

		check(read.theme === 'space-white', `theme during print: ${read.theme}`);
		check(read.outsideCount === 0, `painted boxes outside the student page: ${read.outsideCount}${read.outsideCount ? ` (${read.outsideNames.join(', ')})` : ''}`);
		for (const [k, v] of Object.entries(read.contrast)) check(v !== null && v >= 4.5, `contrast on paper, ${k}: ${v}:1`);
		check(read.breaks.length === 1 && read.breaks[0] === 'avoid', `card break-inside: ${read.breaks.join(', ')}`);
		check(read.tableBreak === 'auto' && read.rowBreak === 'avoid', `assignments card break-inside ${read.tableBreak}, each row ${read.rowBreak}`);
		check(read.printLine, 'print-only "as of" line painted');
		check(read.togglesPainted === 0 && read.actionsPainted === 0, `screen-only controls painted: ${read.togglesPainted} toggles, ${read.actionsPainted} action rows`);
		check(read.classmates.length === 0 && read.ownName, `classmates in printed text: ${read.classmates.length} (${read.classmates.join(', ') || 'none'}); own name present ${read.ownName}`);

		const pdf = await page.pdf({ format: 'Letter', printBackground: false });
		const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
		console.log(`  pdf: ${pages} page(s), ${pdf.length} bytes (Letter, no background graphics)`);
		if (pdfOut && theme === THEMES[0]) writeFileSync(pdfOut, pdf);

		// A section cleared for this meeting leaves the paper: its card AND its
		// At a glance tile. Counted as boxes that still paint, so a tile hidden
		// by any means reads 0 and one left behind reads its own count.
		const printedBoxes = () =>
			page.evaluate(() => {
				const painted = (el) => {
					if (!el) return false;
					const cs = getComputedStyle(el);
					if (cs.display === 'none' || cs.visibility === 'hidden') return false;
					const r = el.getBoundingClientRect();
					return r.width > 0 && r.height > 0;
				};
				const tiles = (id) => [...document.querySelectorAll(`[data-testid="so-glance"] [data-tile="${id}"]`)];
				return {
					coinsCard: painted(document.querySelector('[data-testid="so-coins"]')) ? 1 : 0,
					passesCard: painted(document.querySelector('[data-testid="so-hall-passes"]')) ? 1 : 0,
					coinsTile: tiles('coins').filter(painted).length,
					passesTile: tiles('hall-passes').filter(painted).length,
					// A tile the selector cannot find reads 0 printed, so the
					// absence check only counts once the tiles are known to exist.
					coinsTileInDom: tiles('coins').length,
					passesTileInDom: tiles('hall-passes').length,
					assignmentsTiles: tiles('assignments').filter(painted).length,
					assignmentsTilesInDom: tiles('assignments').length,
					glance: painted(document.querySelector('[data-testid="so-glance"]')) ? 1 : 0
				};
			});
		await page.emulateMedia({ media: 'screen' });
		await page.locator('[data-testid="so-coins"] .so-print-toggle input').uncheck();
		await page.locator('[data-testid="so-hall-passes"] .so-print-toggle input').uncheck();
		await page.emulateMedia({ media: 'print' });
		const cleared = await printedBoxes();
		check(
			cleared.coinsCard === 0 && cleared.passesCard === 0,
			`Coins and Hall passes cleared, printed cards: coins ${cleared.coinsCard}, hall passes ${cleared.passesCard}`
		);
		check(
			cleared.coinsTileInDom === 1 && cleared.passesTileInDom === 1 && cleared.coinsTile === 0 && cleared.passesTile === 0,
			`Coins and Hall passes cleared, printed At a glance tiles: coins ${cleared.coinsTile} of ${cleared.coinsTileInDom}, hall passes ${cleared.passesTile} of ${cleared.passesTileInDom}`
		);
		check(
			cleared.assignmentsTiles > 0 && cleared.assignmentsTiles === cleared.assignmentsTilesInDom && cleared.glance === 1,
			`POSITIVE CONTROL, Assignments still ticked: ${cleared.assignmentsTiles} of ${cleared.assignmentsTilesInDom} assignments tiles printed, glance row printed ${cleared.glance}`
		);
		const pdf2 = await page.pdf({ format: 'Letter', printBackground: false });
		const pages2 = (pdf2.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
		console.log(`  pdf without coins and hall passes: ${pages2} page(s)`);

		// Every tile's section cleared: the row itself leaves the paper.
		await page.emulateMedia({ media: 'screen' });
		await page.locator('[data-testid="so-assignments"] .so-print-toggle input').uncheck();
		await page.locator('[data-testid="so-notebook"] .so-print-toggle input').uncheck();
		await page.emulateMedia({ media: 'print' });
		const none = await printedBoxes();
		check(none.glance === 0 && none.assignmentsTiles === 0, `every tile's box cleared, glance row printed ${none.glance}, assignments tiles ${none.assignmentsTiles}`);

		await page.emulateMedia({ media: 'screen' });
		await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
		const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
		check(after === theme.attr, `theme after print: ${after ?? 'absent'} (started ${theme.attr ?? 'absent'})`);
		await context.close();
	}
} finally {
	await browser.close();
	await server.stop();
}
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
