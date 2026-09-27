/**
 * THE PLATE VIEW OF /dev/themes-shape (ledger 0341), one spec per theme.
 *
 * `_`-prefixed, so `../routes.mjs` does not load it as a route; the three
 * specs beside it (`themes-shape-state-idea.mjs`, `-matrix.mjs`,
 * `-space-white.mjs`) each call `plateSpec(theme)`, so the three themes are
 * measured by ONE set of rows and a row added for one is added for all. That
 * is the proposal's own rule (one geometry, per-theme colour) applied to its
 * instrument.
 *
 * WHAT A SPEC CAN SETTLE, AND WHAT IT CANNOT:
 *  - Text contrast against the real ground, on a monitor and under
 *    `PROJECTOR_MODEL`, for every surface the proposal adds: inside the wells,
 *    on the dark display, on the selected list row and the current menu row.
 *    `contrast` walks up to the first opaque background, which is right for
 *    all of those: each paints its own fill.
 *  - 44px targets in both columns, with the centre hit-test.
 *  - The mono label floor (11px), decorations kept out of the accessibility
 *    tree and out of the pointer's way, and the proposal being what is on
 *    screen -- as `orderResult` rows, both directions.
 *  - It CANNOT compare one theme with another, which is the proposal's central
 *    claim (every control's box identical in every theme), and it cannot count
 *    focus-ring pixels or read a border along a cut. Those are
 *    `_themes-shape-plate-pixels.mjs`, reported in
 *    docs/feedback/2026-09-25/overnight/shapes-v2.md.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

const COLS = ['before', 'after'];

/*
 * Every text specimen, per column. `wash` is the projector floor: 4.5 for
 * words a person reads as sentences (a card's title and body, a row name),
 * 3.0 for labels, chips, button words and status, which is the house floor
 * for muted and status text on the wall (space-white.css's table).
 */
const TEXT = [
	{ sec: 'buttons', sel: '[data-ts^="btn-"]:not([disabled])', label: 'button labels', wash: 3 },
	{ sec: 'buttons', sel: '[data-ts^="chip-"]', label: 'chips', wash: 3 },
	{ sel: '.pl-group-label', label: 'group labels', wash: 3 },
	{ sel: '[data-ts="card-label"]', label: 'card micro-labels', wash: 3 },
	{ sel: '[data-ts="card-title"]', label: 'card titles', wash: 4.5 },
	{ sel: '[data-ts="card-body"]', label: 'card body copy', wash: 4.5 },
	{ sel: '[data-ts="card-btn"]', label: 'card buttons', wash: 3 },
	{ sel: '[data-ts="card-chip"]', label: 'card chips', wash: 3 },
	{ sel: '[data-ts="field-label"]', label: 'field labels', wash: 3 },
	{ sel: '[data-ts="input"]', label: 'text in the input well', wash: 4.5 },
	{ sel: '[data-ts="select"]', label: 'text in the select well', wash: 4.5 },
	{ sel: '.pl-list .row-name', label: 'list row names', wash: 4.5 },
	{ sel: '.pl-list .row-meta', label: 'list row meta', wash: 3 },
	{ sel: '.pl-list .row-wrap.selected .row-name, .pl-list .row-wrap.selected .row-meta', label: 'the SELECTED list row', wash: 3 },
	{ sel: '.pl-list .row-wrap.selected .chip', label: 'the chip inside the selected row', wash: 3 },
	{ sel: '.pl-list .find-input', label: 'the class search field', wash: 4.5 },
	{ sec: 'header', sel: '.cr-header .cls-code, .cr-header .shell-tool-word, .cr-header .sw-name', label: 'header labels', wash: 3 },
	{ sec: 'menu', sel: '.sw-item-name, .sw-item-code', label: 'class menu rows', wash: 3 },
	{ sec: 'menu', sel: '.sw-item.current .sw-item-name, .sw-item.current .sw-item-code', label: 'the CURRENT class menu row', wash: 3 },
	{ sec: 'display', sel: '.grade-head', label: 'the returned-grade readout (the display)', wash: 3 },
	{ sec: 'display', sel: '.comment-label, .comment-text', label: 'the teacher comment under the display', wash: 3 },
	{ sec: 'region', sel: '.pl-title, .pl-col-label', label: 'region title and column labels', wash: 3 },
	{ sec: 'region', sel: '.grade-head', label: 'region side-panel readout', wash: 3 }
];

const textRows = (projector) =>
	COLS.flatMap((col) =>
		TEXT.map((t) => ({
			/* The section is the OUTER ancestor and the column the inner one, so
			   each comma part is prefixed in that order. */
			selector: t.sel
				.split(',')
				.map((s) => `${t.sec ? `[data-pl-sec="${t.sec}"] ` : ''}[data-col="${col}"] ${s.trim()}`)
				.join(', '),
			label: `${col}: ${t.label}${projector ? ' (projector)' : ''}`,
			min: projector ? t.wash : 4.5,
			all: true,
			...(projector ? { projector: true } : {})
		}))
	);

/* Every control, per column, minus the one documented exception. */
const CONTROLS = ':is(button, a[href], input, select):not(.row-expand)';

/* What the page computes for the proposal, both directions. */
const COMPUTED_SHAPE = `() => {
	const read = (sel) => {
		const el = document.querySelector(sel);
		if (!el) return sel + ' MISSING';
		const cs = getComputedStyle(el);
		return (cs.getPropertyValue('corner-shape') || cs.cornerShape || '(none)').trim() + ' ' + cs.borderTopLeftRadius;
	};
	return [
		'before btn ' + read('[data-pl-sec="buttons"] [data-col="before"] [data-ts="btn-primary"]'),
		'after btn ' + read('[data-pl-sec="buttons"] [data-col="after"] [data-ts="btn-primary"]'),
		'before card ' + read('[data-pl-sec="card"] [data-col="before"] [data-ts="card"]'),
		'after card ' + read('[data-pl-sec="card"] [data-col="after"] [data-ts="card"]'),
		'before chip ' + read('[data-pl-sec="buttons"] [data-col="before"] [data-ts="chip-status"]'),
		'after chip ' + read('[data-pl-sec="buttons"] [data-col="after"] [data-ts="chip-status"]'),
		'after select ' + read('[data-pl-sec="fields"] [data-col="after"] [data-ts="select"]'),
		'after header tool ' + read('[data-pl-sec="header"] [data-col="after"] .cr-header .shell-tool')
	];
}`;

/*
 * THE MONO LABEL FLOOR, both directions. Every element under the column with
 * its own text, painted in the mono face, visible: how many are under 11px.
 * The before column is reported, not asserted (it is today's page); the after
 * column must be zero, and the count of labels examined is part of the answer
 * so an empty sweep cannot pass.
 */
const MONO_FLOOR = `() => {
	const count = (col) => {
		let seen = 0, under = [];
		for (const el of document.querySelectorAll('.pl-view [data-col="' + col + '"] *')) {
			const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
			if (!own) continue;
			const cs = getComputedStyle(el);
			if (!/Share Tech Mono/i.test(cs.fontFamily)) continue;
			const r = el.getBoundingClientRect();
			if (!r.width || !r.height || cs.visibility === 'hidden') continue;
			seen++;
			if (parseFloat(cs.fontSize) < 11) under.push(el.className.toString().split(' ').filter((c) => !c.startsWith('svelte'))[0] || el.tagName);
		}
		return { seen, under };
	};
	const a = count('after');
	return ['after: ' + (a.seen > 20 ? 'over 20' : a.seen) + ' mono labels examined, under 11px: ' + a.under.length + (a.under.length ? ' (' + [...new Set(a.under)].join(', ') + ')' : '')];
}`;

/*
 * DECORATION IS PAINT ONLY. Every generated box in the after columns: its
 * `content` must be the empty string (a string there is read out), and it must
 * not take the pointer. Counted, so a sweep that found no pseudo-elements at
 * all reads as a failure rather than as a pass.
 */
const DECORATION = `() => {
	/* THE HOSTS plate.css gives a generated box to, and nothing else: a real
	   component's own pseudo-elements (a checkbox tick, a tap reach) are not
	   the proposal's decoration and are not judged here. */
	const MINE = '.pl-after.pl-col, .pl-after .pl-group, .pl-after .card, .pl-after .btn, .pl-after .cr-header, .pl-after .cls-icon.current, .pl-after .sw-item.current, .pl-after .row-wrap.selected, .pl-after .pl-titlebar, .pl-after .grade-head';
	let boxes = 0, text = 0, pointer = 0;
	for (const el of document.querySelectorAll('.pl-view :is(' + MINE + ')')) {
		for (const which of ['::before', '::after']) {
			const cs = getComputedStyle(el, which);
			if (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none') continue;
			boxes++;
			if (cs.content !== '""') text++;
			if (cs.pointerEvents !== 'none') pointer++;
		}
	}
	return [boxes >= 10 ? 'at least 10 generated boxes' : 'ONLY ' + boxes + ' generated boxes', 'with a text content: ' + text, 'plate decorations that take the pointer: ' + pointer];
}`;

export function plateSpec(theme) {
	const attr = theme === 'idea' ? null : theme;
	return {
		path: `/dev/themes-shape?state=${theme}`,
		label: `Classroom shape language round 2 (Plate), ${theme}: before and after, monitor and wall`,
		prepare: [
			{ evaluate: SETTLE_ENTRANCE, label: 'settle any entrance animation' },
			{
				waitFor: `() => document.documentElement.getAttribute('data-theme') === ${JSON.stringify(attr)} && !!document.querySelector('[data-testid="plate-view"]') && document.querySelectorAll('.pl-view .cr-header').length === 6`,
				label: `the ${theme} theme is on and the six headers mounted`
			},
			{
				/* Both class menus open, by the element's own click (a
				   synthesized click is not a pointerdown, so opening the second
				   does not outside-dismiss the first). Below the header's fold
				   the list opens inside the Menu panel; the same state drives
				   both. */
				evaluate: `() => { document.querySelectorAll('[data-testid="menu-stage"] [data-testid="section-switcher"]').forEach((b) => { if (b.getAttribute('aria-expanded') !== 'true') b.click(); }); return document.querySelectorAll('[data-testid="menu-stage"] [data-testid="section-switcher-menu"]').length + ' class menus open'; }`,
				until: `() => document.querySelectorAll('[data-testid="menu-stage"] [data-testid="section-switcher-menu"]').length === 2`,
				label: 'open both class menus over their content'
			},
			{
				evaluate: `() => 'data-theme=' + document.documentElement.getAttribute('data-theme') + ' corner-shape supported=' + CSS.supports('corner-shape', 'bevel') + ' --pl-plate=' + getComputedStyle(document.querySelector('.pl-after')).getPropertyValue('--pl-plate').trim() + ' --pl-accent=' + getComputedStyle(document.querySelector('.pl-after')).getPropertyValue('--pl-accent').trim()`,
				label: 'what the browser supports and what the plate computes'
			}
		],
		presence: [
			{ selector: '[data-testid="plate-view"]', label: 'the Plate view is the default view', expectPresent: 1, maxPresent: 1 },
			{ selector: '.pl-view [data-pl-sec] [data-col]', label: 'eight sections, two columns each', expectPresent: 16, maxPresent: 16, expectVisible: 16 },
			{ selector: '.pl-view .pl-after', label: 'eight after columns', expectPresent: 8, maxPresent: 8 },
			{ selector: '[data-theme-set]', label: 'the theme switcher, one per theme', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
			{ selector: `[data-theme-set="${theme}"][aria-pressed="true"]`, label: `the ${theme} theme button pressed`, expectPresent: 1, maxPresent: 1 },
			{ selector: '[data-theme-set][aria-pressed="true"]', label: 'exactly one theme pressed', expectPresent: 1, maxPresent: 1 },
			{ selector: '[data-view-set="plate"][aria-pressed="true"]', label: 'the Plate view pressed', expectPresent: 1, maxPresent: 1 },
			{ selector: '.pl-view .pl-list .row-wrap.selected', label: 'one selected list row per column', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
			{ selector: '[data-testid="menu-stage"] .sw-item.current', label: 'the current class in each open menu', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
			{ selector: '.pl-view .grade-head', label: 'the returned-grade readout, two sections times two columns', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
			{ selector: '.pl-view .cr-header', label: 'six real classroom headers', expectPresent: 6, maxPresent: 6, expectVisible: 6 }
		],
		contrast: [
			...textRows(false),
			...textRows(true),
			{ selector: '.ts-page h1', label: 'page heading', min: 4.5 },
			{ selector: '.ts-page .ts-lead', label: 'lead copy', min: 4.5 },
			{ selector: '.pl-view .pl-note', label: 'section notes', min: 4.5, all: true },
			{ selector: '.pl-view .pl-colh', label: 'column headings', min: 4.5, all: true }
		],
		tapTargets: [
			{ selector: `.pl-view [data-col="before"] ${CONTROLS}:not(.wordmark)`, label: 'before: every control', min: 44 },
			{ selector: `.pl-view [data-col="after"] ${CONTROLS}`, label: 'after: every control, the logo link included', min: 44 },
			/* TODAY'S LOGO LINK: 56x26 at 375 (the emblem shrinks with the
			   viewport). The proposal gives it 44 (the after row above); this
			   row reports today's number against the 24px floor so it is on
			   the record rather than a finding against the proposal. */
			{ selector: '.pl-view [data-col="before"] a.wordmark', label: 'before: the logo link (today, 24px floor)', min: 24 },
			/* ClassView's expand control is 30px wide by 44 tall on purpose,
			   and says why in its own stylesheet (a 44px-wide box would hand
			   the drag grip's taps to it). Unchanged by the proposal. */
			{ selector: '.pl-view .pl-list .row-expand', label: 'list expand controls (documented 30x44 exception)', min: 24 },
			{ selector: '[data-theme-set], [data-view-set]', label: 'the page switchers', min: 44 }
		],
		orderResult: [
			{
				label: 'the proposal is applied in the after column and absent in the before column',
				evaluate: COMPUTED_SHAPE,
				expected: [
					'before btn round 3px',
					'after btn bevel 6px',
					'before card round 4px',
					'after card bevel square 14px',
					'before chip round 999px',
					'after chip bevel 999px',
					'after select bevel 6px',
					'after header tool bevel 6px'
				]
			},
			{ label: 'every mono label in the after columns is 11px or larger', evaluate: MONO_FLOOR, expected: ['after: over 20 mono labels examined, under 11px: 0'] },
			{
				label: 'decoration is paint only: no generated text, and nothing that takes the pointer',
				evaluate: DECORATION,
				expected: ['at least 10 generated boxes', 'with a text content: 0', 'plate decorations that take the pointer: 0']
			}
		]
	};
}
