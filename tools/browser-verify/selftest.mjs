/**
 * NEGATIVE CONTROLS. A check that has never failed has not been tested.
 *
 *   node tools/browser-verify/run.mjs --selftest
 *
 * Every check is put to a pair of fixtures: one built to BREAK it and one built
 * to pass it. Both measured values are printed. A check that comes back green on
 * the broken fixture, or red on the sound one, is a broken instrument -- and
 * this file exits non-zero for it, because unlike the measuring run there IS a
 * right answer here.
 *
 * The fixtures are self-contained documents rather than a mutation of src/. A
 * mutation proves the check once, in a tree that then has to be restored
 * byte-identically; this proves it on every run, for any future session, and
 * touches nothing.
 */
import { launch, openPage, settle } from './browser.mjs';
import { horizontalScroll, contrast, tapTargets, presence, domOrder, orderResult, consoleErrors } from './checks.mjs';

const shell = (body, head = '') =>
	`<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
    html,body{margin:0;padding:0;background:#0a0c0b;color:#eae6d8;font:16px/1.4 sans-serif}
    ${head}</style></head><body>${body}</body></html>`;

/* Each case: what to load, which check to run, and which way it must come out. */
const CASES = [
	{
		group: 'horizontal-scroll',
		bad: {
			name: 'a 1200px-wide nowrap row inside a 375px viewport',
			html: shell('<div id="row" style="white-space:nowrap;width:1200px">overflowing content</div>'),
			run: (p) => horizontalScroll(p),
			expect: 'outside'
		},
		good: {
			name: 'the same row constrained to the viewport',
			html: shell('<div id="row" style="max-width:100%;overflow-x:auto"><div style="white-space:nowrap;width:1200px">x</div></div>'),
			run: (p) => horizontalScroll(p),
			expect: 'within'
		}
	},
	{
		group: 'contrast',
		bad: {
			/* The ground is a color-mix on an ancestor and the text is
			   semi-transparent: a regex over computed styles reads neither. */
			name: 'dim text over a color-mix ground, alpha on the text',
			html: shell(
				'<div style="background:color-mix(in srgb, #ffffff 12%, #0a0c0b)"><p id="t" style="color:rgba(234,230,216,0.28)">barely there</p></div>'
			),
			run: (p) => contrast(p, { selector: '#t', min: 4.5, all: true }),
			expect: 'outside'
		},
		good: {
			name: 'the same ground with the platform ink at full alpha',
			html: shell('<div style="background:color-mix(in srgb, #ffffff 12%, #0a0c0b)"><p id="t" style="color:#eae6d8">readable</p></div>'),
			run: (p) => contrast(p, { selector: '#t', min: 4.5, all: true }),
			expect: 'within'
		}
	},
	{
		group: 'contrast (ground resolution)',
		bad: {
			/* Proves the check composites the REAL ancestor ground rather than
			   assuming the page plate: the text would pass on #0a0c0b. */
			name: 'pale ink on a pale card that sits on a dark page',
			html: shell('<div style="background:#d8d4c6;padding:8px"><p id="t" style="color:#eae6d8">on a light card</p></div>'),
			run: (p) => contrast(p, { selector: '#t', min: 4.5, all: true }),
			expect: 'outside'
		},
		good: {
			name: 'dark ink on that same light card',
			html: shell('<div style="background:#d8d4c6;padding:8px"><p id="t" style="color:#14180f">on a light card</p></div>'),
			run: (p) => contrast(p, { selector: '#t', min: 4.5, all: true }),
			expect: 'within'
		}
	},
	{
		group: 'tap-target',
		bad: {
			name: 'a 20px control',
			html: shell('<button id="b" style="width:20px;height:20px;padding:0">x</button>'),
			run: (p) => tapTargets(p, { selector: '#b', min: 44 }),
			expect: 'outside'
		},
		good: {
			name: 'the same control at the 44px floor',
			html: shell('<button id="b" style="min-width:44px;min-height:44px;padding:0">x</button>'),
			run: (p) => tapTargets(p, { selector: '#b', min: 44 }),
			expect: 'within'
		}
	},
	{
		group: 'tap-target (label measurement)',
		bad: {
			name: 'a 22px input in a 22px label',
			html: shell('<label style="display:inline-block;height:22px"><input id="i" type="checkbox" style="width:22px;height:22px;margin:0"></label>'),
			run: (p) => tapTargets(p, { selector: '#i', min: 44 }),
			expect: 'outside'
		},
		good: {
			/* CLAUDE.md: a control wrapped in a label is measured AT THE LABEL,
			   which is what a finger hits. 22px input, 44px label, passes. */
			name: 'the same 22px input in a 44px label',
			html: shell('<label style="display:inline-flex;align-items:center;min-height:44px;min-width:44px"><input id="i" type="checkbox" style="width:22px;height:22px;margin:0"></label>'),
			run: (p) => tapTargets(p, { selector: '#i', min: 44 }),
			expect: 'within'
		}
	},
	{
		group: 'presence (present but not visible)',
		bad: {
			/* The exact shape the check exists for: the node IS in the DOM, so a
			   querySelector-count assertion passes while nothing is on screen. */
			name: 'the element is in the DOM at opacity 0',
			html: shell('<div id="card" style="opacity:0">the card</div>'),
			run: (p) => presence(p, { selector: '#card', expectPresent: 1, expectVisible: 1 }),
			expect: 'outside'
		},
		good: {
			name: 'the same element painted',
			html: shell('<div id="card">the card</div>'),
			run: (p) => presence(p, { selector: '#card', expectPresent: 1, expectVisible: 1 }),
			expect: 'within'
		}
	},
	{
		group: 'presence (absent entirely)',
		bad: {
			name: 'the element is not rendered at all',
			html: shell('<div>nothing here</div>'),
			run: (p) => presence(p, { selector: '#card', expectPresent: 1, expectVisible: 1 }),
			expect: 'outside'
		},
		good: {
			name: 'the element is rendered',
			html: shell('<div id="card">the card</div>'),
			run: (p) => presence(p, { selector: '#card', expectPresent: 1, expectVisible: 1 }),
			expect: 'within'
		}
	},
	{
		group: 'dom-order',
		bad: {
			name: 'the "after" element rendered ahead of the "before" element',
			html: shell('<div id="second">second</div><div id="first">first</div>'),
			run: (p) => domOrder(p, { before: '#first', after: '#second', label: 'first before second' }),
			expect: 'outside'
		},
		good: {
			name: 'the "before" element genuinely rendered first',
			html: shell('<div id="first">first</div><div id="second">second</div>'),
			run: (p) => domOrder(p, { before: '#first', after: '#second', label: 'first before second' }),
			expect: 'within'
		}
	},
	{
		group: 'order-result',
		bad: {
			/* The write path recorded an id array, but the wrong one -- the same
			   shape a transport that reorders on the wrong axis, or silently
			   no-ops and leaves a stale write behind, would produce. */
			name: 'the recorded write does not match the expected order',
			html: shell('<script>window.__order = ["a", "c", "b"];</' + 'script>'),
			run: (p) => orderResult(p, { evaluate: '() => window.__order', expected: ['a', 'b', 'c'] }),
			expect: 'outside'
		},
		good: {
			name: 'the recorded write matches the expected order',
			html: shell('<script>window.__order = ["a", "b", "c"];</' + 'script>'),
			run: (p) => orderResult(p, { evaluate: '() => window.__order', expected: ['a', 'b', 'c'] }),
			expect: 'within'
		}
	},
	{
		group: 'console-errors (thrown)',
		bad: {
			name: 'a script that throws on load',
			html: shell('<div>ok</div><script>throw new Error("state_unsafe_mutation (simulated)")</' + 'script>'),
			run: (p, errs) => consoleErrors(errs),
			expect: 'outside'
		},
		good: {
			name: 'a script that does not throw',
			html: shell('<div>ok</div><script>void 0</' + 'script>'),
			run: (p, errs) => consoleErrors(errs),
			expect: 'within'
		}
	},
	{
		group: 'console-errors (console.error)',
		bad: {
			name: 'an explicit console.error',
			html: shell('<div>ok</div><script>console.error("a real error line")</' + 'script>'),
			run: (p, errs) => consoleErrors(errs),
			expect: 'outside'
		},
		good: {
			name: 'a console.warn, which is not an error',
			html: shell('<div>ok</div><script>console.warn("a warning line")</' + 'script>'),
			run: (p, errs) => consoleErrors(errs),
			expect: 'within'
		}
	}
];

async function measure(browser, fixture, width) {
	const { context, page, consoleErrors: errs } = await openPage(browser, { width, blockExternal: false });
	try {
		await page.setContent(fixture.html, { waitUntil: 'load' });
		await settle(page, { settleMs: 250 });
		return await fixture.run(page, errs);
	} finally {
		await context.close();
	}
}

export async function runSelfTest({ width = 375 } = {}) {
	const { browser, executablePath } = await launch();
	console.log(`\n=== browser-verify self-test (negative controls) ===`);
	console.log(`chromium ${browser.version()} at ${executablePath}, viewport ${width}px\n`);

	let failures = 0;
	try {
		for (const c of CASES) {
			console.log(`${c.group}`);
			for (const kind of ['bad', 'good']) {
				const f = c[kind];
				const r = await measure(browser, f, width);
				const wanted = f.expect === 'within';
				const got = r.withinThreshold;
				const correct = got === wanted;
				if (!correct) failures++;
				console.log(
					`  ${correct ? 'PROVED  ' : 'BROKEN  '}${kind === 'bad' ? 'negative' : 'positive'}: ${f.name}`
				);
				console.log(`            measured ${r.measured}   (threshold ${r.threshold})`);
				console.log(
					`            check said ${got ? 'WITHIN' : 'OUTSIDE'} threshold; expected ${wanted ? 'WITHIN' : 'OUTSIDE'}${correct ? '' : '   <-- THE INSTRUMENT IS WRONG'}`
				);
			}
			console.log('');
		}
	} finally {
		await browser.close();
	}

	const total = CASES.length * 2;
	console.log('---');
	console.log(`${total} controls run (${CASES.length} negative, ${CASES.length} positive), ${failures} instrument failure(s)`);
	return failures;
}
