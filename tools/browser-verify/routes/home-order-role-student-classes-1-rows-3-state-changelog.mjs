import { SETTLE_ENTRANCE } from './_shared.mjs';
import { reach } from './_home-theme.mjs';

/**
 * THE PORTAL UPDATES PANEL, OPENED (ledger 0360, report R24).
 *
 * The panel rendered the WHOLE commit log the moment it opened -- 2,507 rows on
 * the day it was reported, about seven nodes each -- and opening it lagged. It
 * now renders a first page (`CHANGELOG_PAGE_SIZE` in `$lib/site-versions`) with
 * a "Show more" key under it and a readout of how many it is showing.
 *
 * WHAT IS GATED: exactly one page of rows on open (the ceiling is the row that
 * fails on the old panel, which rendered every entry), the Show more key there
 * once, 44px, carrying its word, and readable, and the readout saying "Showing
 * <page> of". WHAT IS PRINTED, NEVER PINNED: the total (it grows with every
 * commit), the node count under the panel and the longest main-thread task
 * observed while it opened -- a timing is the machine's, not the page's.
 *
 * The log is the REAL lazy `virtual:site-changelog` module the dev server
 * builds from this checkout's git history (the first build walks numstat, a
 * few seconds), so the wait is long.
 *
 * AND THE PANEL IN THE PLATE'S LANGUAGE (round 2026-10-07, the "change log is
 * not consistent with the visual design" report). The screenshot showed a
 * horizontal scrollbar at the panel's foot and tag rows running past its edge:
 * the tag group was an unshrinkable max-content flex item beside a 200px note
 * floor. The panel now gates, at every width it is measured at: no horizontal
 * overflow in the panel or the page and no tag past the panel's content edge
 * (wrapped, never clipped -- `overflow-x: hidden` would pass this by hiding the
 * tags, and a region may not hide its scrollbar); every word in the panel at
 * the plate's 11px label floor or larger; the toggle, both selects and both
 * date fields at 44px; and Clear, which renders only while a filter is set,
 * measured in the last row by setting one, reading its box and its centre,
 * pressing it, and waiting for the first page to come back.
 */
export const PAGE = 150;

/* Horizontal overflow in the panel and in the page, and every tag's right edge
   against the panel's CONTENT edge (its client box less its padding). */
const OVERFLOW = `() => {
	const b = document.querySelector('#changelog-body');
	if (!b) return ['NO PANEL'];
	const cs = getComputedStyle(b);
	const box = b.getBoundingClientRect();
	const contentRight = box.left + b.clientLeft + b.clientWidth - parseFloat(cs.paddingRight);
	const past = [...b.querySelectorAll('.cl-tag')].filter((t) => t.getBoundingClientRect().right > contentRight + 0.5).length;
	const page = document.documentElement;
	return [
		'panel overflow ' + Math.max(0, b.scrollWidth - b.clientWidth) + 'px',
		'tags past the panel edge ' + past,
		'page overflow ' + Math.max(0, page.scrollWidth - page.clientWidth) + 'px'
	];
}`;

/* Every word the panel prints, at the plate's 11px label floor or larger. */
const SIZES = `() => {
	const px = (e) => parseFloat(getComputedStyle(e).fontSize);
	const tags = [...document.querySelectorAll('#changelog-body .cl-tag')];
	const labels = [...document.querySelectorAll('#changelog-btn, .cl-head, #changelog-body :is(.changelog-date, .cl-month, .cl-count, .cl-date, .cl-select, .cl-date input, .cl-shown, .cl-more)')];
	return [
		'tags measured ' + (tags.length ? 'yes' : 'NONE'),
		'tags under 11px ' + tags.filter((t) => px(t) < 10.99).length,
		'labels under 11px ' + labels.filter((t) => px(t) < 10.99).length
	];
}`;

/* Clear renders only while a filter is set, so a tapTargets row would match
   nothing in the opened state. Set one, measure Clear and hit-test its centre,
   press it, and wait for the first page to come back. LAST, because it moves
   the panel's state. */
const CLEAR = `async () => {
	const body = document.querySelector('#changelog-body');
	const type = body?.querySelectorAll('select.cl-select')[1];
	if (!type) return ['NO TYPE FILTER'];
	type.value = 'fix';
	type.dispatchEvent(new Event('change', { bubbles: true }));
	await new Promise((r) => setTimeout(r, 300));
	const clear = body.querySelector('.cl-clear');
	if (!clear) return ['NO CLEAR KEY'];
	clear.scrollIntoView({ block: 'center', behavior: 'instant' });
	await new Promise((r) => setTimeout(r, 150));
	const r = clear.getBoundingClientRect();
	const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
	const answers = !!hit && (hit === clear || clear.contains(hit));
	clear.click();
	let rows = 0;
	for (let i = 0; i < 40; i++) {
		await new Promise((res) => setTimeout(res, 100));
		rows = body.querySelectorAll('.changelog-entry').length;
		if (rows === ${PAGE} && !body.querySelector('.cl-clear')) break;
	}
	return [
		r.height >= 43.99 ? 'Clear at least 44px tall' : 'Clear only ' + r.height.toFixed(1) + 'px tall',
		answers ? 'Clear answers at its centre' : 'Clear covered at its centre by ' + (hit ? hit.tagName + '.' + hit.className : 'nothing'),
		'rows back to ' + rows,
		'Clear gone ' + (body.querySelector('.cl-clear') ? 'no' : 'yes')
	];
}`;

const HIDE_STRIP = `() => { const s = document.querySelector('.harness-strip'); if (s) s.style.display = 'none'; return s ? 'harness strip hidden' : 'no harness strip'; }`;

/** Open the panel and wait for the lazy log, under `theme` (reached through the shipping profile-menu control). */
export const openChangelog = (theme = 'idea') => [
	{ evaluate: SETTLE_ENTRANCE, label: 'settle the entrance' },
	...(theme === 'idea' ? [] : reach(theme)),
	{ evaluate: HIDE_STRIP, label: 'the harness strip is not the page' },
	{
		evaluate: `() => {
			window.__lt = [];
			try {
				new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__lt.push(e.duration); })
					.observe({ type: 'longtask', buffered: true });
				return 'long-task observer installed';
			} catch (e) { return 'no long-task observer here: ' + e.message; }
		}`,
		label: 'watch for long tasks'
	},
	{
		click: '#changelog-btn',
		until: '() => !!document.querySelector("#changelog-body.open")',
		attempts: 12,
		waitMs: 250,
		label: 'open the panel'
	},
	{
		waitFor: '() => document.querySelectorAll("#changelog-body .changelog-entry").length > 0',
		timeoutMs: 90000,
		label: 'the lazy log has arrived and rendered'
	},
	{
		evaluate: `async () => {
			await new Promise((r) => setTimeout(r, 400));
			const body = document.querySelector('#changelog-body');
			const rows = body.querySelectorAll('.changelog-entry').length;
			const nodes = body.querySelectorAll('*').length;
			const longest = Math.round(Math.max(0, ...(window.__lt || [])));
			const shown = body.querySelector('.cl-shown')?.textContent?.trim() ?? '(no readout)';
			return rows + ' rows rendered, ' + nodes + ' nodes under the panel, longest task ' + longest + 'ms, readout: ' + shown;
		}`,
		label: 'what the open panel cost (printed, never pinned)'
	},
	{
		evaluate: `() => {
			const rows = [...document.querySelectorAll('#changelog-body .changelog-entry')];
			const most = Math.max(0, ...rows.map((r) => r.querySelectorAll('.cl-tag').length));
			const b = document.querySelector('#changelog-body');
			return 'most tags in one row ' + most + '; panel ' + b.clientWidth + 'px inside, row columns ' + (rows[0] ? getComputedStyle(rows[0]).gridTemplateColumns : '(none)');
		}`,
		label: 'the widest row and the row grid at this width (printed, never pinned)'
	}
];

export const OPEN_CHANGELOG = openChangelog('idea');

/**
 * The open panel's spec under one theme. IDEA is this file's own; Space White
 * and Matrix are siblings that call this, so the three tables measure one set
 * of rows. Under Space White (the theme the home page has for the projector)
 * the copy is also gated on the wall, the way ./_home-theme.mjs gates it.
 */
export const changelogSpec = (theme) => ({
	path: `/dev/home-order?role=student&classes=1&rows=3&state=changelog${theme === 'idea' ? '' : '-' + theme}`,
	label: `Portal Updates opened${theme === 'idea' ? '' : ' under ' + theme}: one page of the log, a Show more key, and a readout`,
	prepare: openChangelog(theme),
	presence: [
		...(theme === 'idea' ? [] : [{ selector: `html[data-theme="${theme}"]`, label: `the ${theme} attribute is on <html>`, expectPresent: 1, maxPresent: 1 }]),
		{ selector: '#changelog-body.open', label: 'the panel is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#changelog-body .changelog-entry', label: `one page of rows (${PAGE}), never the whole log`, expectPresent: PAGE, maxPresent: PAGE },
		{ selector: '#changelog-body .cl-more', label: 'the Show more key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#changelog-body .cl-shown', label: 'the Showing N of M readout', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '#changelog-body .cl-shown', label: 'the readout names the page', must: [`Showing ${PAGE} of`] },
		{ selector: '#changelog-body .cl-more', label: 'the key carries its word', must: ['Show', 'more'] }
	],
	contrast: [
		{ selector: '#changelog-body .cl-more', label: 'Show more key', min: 4.5 },
		{ selector: '#changelog-body .cl-more .cl-more-left', label: 'Show more key: how many are not shown', min: 4.5 },
		{ selector: '#changelog-body .cl-shown', label: 'the readout', min: 4.5 },
		{ selector: '#changelog-body .changelog-note', label: 'a changelog line', min: 4.5 },
		{ selector: '#changelog-btn', label: 'the Changelog toggle', min: 4.5 },
		{ selector: '#changelog-body .changelog-date', label: 'a row date', min: 4.5 },
		{ selector: '#changelog-body .cl-tag', label: 'every tag on its ground', min: 4.5 },
		{ selector: '#changelog-body .cl-month', label: 'the month heading', min: 4.5 },
		{ selector: '#changelog-body .cl-count', label: 'the filtered / total count', min: 4.5 },
		...(theme === 'space-white'
			? [
					{ selector: '#changelog-body .cl-more, #changelog-body .cl-shown', label: 'on the wall: the key and the readout (3.0 washed)', min: 3, projector: true },
					{
						selector: '#changelog-body .changelog-note, #changelog-body .changelog-date, #changelog-body .cl-tag, #changelog-body .cl-month, #changelog-body .cl-count',
						label: 'on the wall: rows, tags, months and the count (3.0 washed)',
						min: 3,
						projector: true
					}
				]
			: [])
	],
	tapTargets: [
		{ selector: '#changelog-body .cl-more', label: 'Show more key', min: 44 },
		{ selector: '#changelog-btn', label: 'the Changelog toggle', min: 44 },
		{ selector: '#changelog-body .cl-select', label: 'the two filter selects', min: 44 },
		{ selector: '#changelog-body .cl-date input', label: 'the two date fields (measured at their label)', min: 44 }
	],
	orderResult: [
		{
			label: 'the toggle says it is open',
			evaluate: `() => [document.querySelector('#changelog-btn')?.getAttribute('aria-expanded') ?? 'no aria-expanded']`,
			expected: ['true']
		},
		{
			label: 'nothing runs past the panel: no horizontal scroll in it or the page, and every tag inside its content edge',
			evaluate: OVERFLOW,
			expected: ['panel overflow 0px', 'tags past the panel edge 0', 'page overflow 0px']
		},
		{
			label: 'every tag and every label in the panel at 11px or larger',
			evaluate: SIZES,
			expected: ['tags measured yes', 'tags under 11px 0', 'labels under 11px 0']
		},
		{
			label: 'Clear (shown only while a filter is set): 44px, answers at its centre, and puts the first page back',
			evaluate: CLEAR,
			expected: ['Clear at least 44px tall', 'Clear answers at its centre', `rows back to ${PAGE}`, 'Clear gone yes']
		}
	]
});

export default changelogSpec('idea');
