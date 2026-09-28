/**
 * THE PLATE VIEW OF /dev/themes-shape, one spec per theme. Written for round 2
 * (ledger 0341); since ledger 0344 it measures ROUND 3, `Plate v3`, which is
 * the page's default view. Round 2's view is one button away (`?view=plate`),
 * and its own figures are the ones recorded in shapes-v2.md.
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
 *    on the dark display, on lit pads, on the selected list row and the current
 *    menu row, on the progress ring. `contrast` walks up to the first opaque
 *    background, which is right for all of those: each paints its own fill.
 *  - 44px targets in both columns, with the centre hit-test.
 *  - The mono label floor (11px), decorations kept out of the accessibility
 *    tree and out of the pointer's way, no grid painted anywhere on the page,
 *    and the proposal being what is on screen -- as `orderResult` rows, both
 *    directions.
 *  - It CANNOT compare one theme with another, which is the proposal's central
 *    claim (every box identical in every theme), and it cannot count focus-ring
 *    pixels or read a border along a cut. Those are
 *    `_themes-shape-plate-pixels.mjs`, reported in
 *    docs/feedback/2026-09-25/overnight/shapes-v3.md.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

const COLS = ['before', 'after'];

/*
 * Every text specimen, per column. `wash` is the projector floor: 4.5 for
 * words a person reads as sentences (a card's title and body, a row name),
 * 3.0 for labels, chips, button words and status, which is the house floor
 * for muted and status text on the wall (space-white.css's table). `cols`
 * limits a row to the after column, for the pieces round 3 added that have no
 * equivalent today (a row that matches nothing is a failure, not a pass).
 */
const TEXT = [
	{ sec: 'buttons', sel: '[data-ts^="btn-"]:not([disabled])', label: 'button labels', wash: 3 },
	{ sec: 'buttons', sel: '[data-ts^="switch-"] .ts-word', label: 'the switch words', wash: 3, cols: ['after'] },
	{ sec: 'buttons', sel: '[data-ts^="chip-"]', label: 'chips', wash: 3 },
	{ sel: '.pl-group-label', label: 'group labels', wash: 3 },
	{ sel: '[data-ts="card-label"]', label: 'card micro-labels', wash: 3 },
	{ sel: '[data-ts="card-title"]', label: 'card titles', wash: 4.5 },
	{ sel: '[data-ts="card-body"]', label: 'card body copy', wash: 4.5 },
	{ sel: '[data-ts="card-btn"]', label: 'card buttons', wash: 3 },
	{ sel: '[data-ts="card-chip"]', label: 'card chips', wash: 3 },
	{ sel: '[data-ts="field-label"]', label: 'field labels', wash: 3 },
	{ sel: '[data-ts="input"]', label: 'text in the input well', wash: 4.5 },
	{ sel: '[data-ts="select"]', label: 'text in the dropdown well', wash: 4.5 },
	{ sel: '.pl-list .row-name', label: 'list row names', wash: 4.5 },
	{ sel: '.pl-list .row-meta', label: 'list row meta', wash: 3 },
	{ sel: '.pl-list .row-wrap.selected .row-name, .pl-list .row-wrap.selected .row-meta', label: 'the SELECTED list row', wash: 3 },
	{ sel: '.pl-list .row-wrap.selected .chip', label: 'the chip inside the selected row', wash: 3 },
	{ sel: '.pl-list .find-input', label: 'the class search field', wash: 4.5 },
	{ sec: 'header', sel: '.cr-header .cls-code, .cr-header .shell-tool-word, .cr-header .sw-name', label: 'header labels', wash: 3 },
	{ sec: 'header', sel: '.cr-header .cls-code, .cr-header .cls-sub', label: 'the period tiles (pads), unlit and lit', wash: 3 },
	{ sec: 'menu', sel: '.sw-item-name, .sw-item-code', label: 'class menu rows', wash: 3 },
	{ sec: 'menu', sel: '.sw-item.current .sw-item-name, .sw-item.current .sw-item-code', label: 'the CURRENT class menu row', wash: 3 },
	{ sec: 'display', sel: '.grade-head', label: 'the returned-grade readout (the display)', wash: 3 },
	{ sec: 'display', sel: '.comment-label, .comment-text', label: 'the teacher comment under the display', wash: 3 },
	{ sec: 'display', sel: '.p3-ring-value', label: 'the progress ring readout', wash: 3, cols: ['after'] },
	{ sec: 'region', sel: '.pl-title, .pl-col-label', label: 'region title and column labels', wash: 3 },
	{ sec: 'region', sel: '.grade-head', label: 'region side-panel readout', wash: 3 }
];

const textRows = (projector) =>
	COLS.flatMap((col) =>
		TEXT.filter((t) => !t.cols || t.cols.includes(col)).map((t) => ({
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
		'after header tool ' + read('[data-pl-sec="header"] [data-col="after"] .cr-header .shell-tool'),
		'after screen ' + read('[data-pl-sec="display"] [data-col="after"] .grade-head')
	];
}`;

/*
 * THE MONO LABEL FLOOR, both directions. Every element under the column with
 * its own text, painted in a mono face (Share Tech Mono, or VT323 with face B
 * on), visible: how many are under 11px. The before column is reported, not
 * asserted (it is today's page); the after column must be zero, and the count
 * of labels examined is part of the answer so an empty sweep cannot pass.
 */
const MONO_FLOOR = `() => {
	const count = (col) => {
		let seen = 0, under = [];
		for (const el of document.querySelectorAll('.p3-view [data-col="' + col + '"] *')) {
			const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
			if (!own) continue;
			const cs = getComputedStyle(el);
			if (!/Share Tech Mono|VT323/i.test(cs.fontFamily)) continue;
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
 * DECORATION IS PAINT ONLY. Every generated box on a host plate-v3.css gives
 * one to, in the after columns: its `content` must be the empty string (a
 * string there is read out), and it must not take the pointer. Counted, so a
 * sweep that found no pseudo-elements at all reads as a failure rather than as
 * a pass. The inline SVG decorations (ring, engravings) are `aria-hidden` and
 * `pointer-events: none` in their own markup and styles.
 */
const DECORATION = `() => {
	const MINE = '.p3-after.pl-col, .p3-after .p3-group, .p3-after .card, .p3-after .btn, .p3-after .cr-header, .p3-after .cls-icon, .p3-after .sw-item.current, .p3-after .row-wrap.selected, .p3-after .p3-titlebar, .p3-after .grade-head, .p3-after .grade-card, .p3-after .theme-switch, .p3-after .draft-chip, .p3-after .kind-chip, .p3-after .p3-main';
	let boxes = 0, text = 0, pointer = 0;
	for (const el of document.querySelectorAll('.p3-view :is(' + MINE + ')')) {
		for (const which of ['::before', '::after']) {
			const cs = getComputedStyle(el, which);
			if (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none') continue;
			boxes++;
			if (cs.content !== '""') text++;
			if (cs.pointerEvents !== 'none') pointer++;
		}
	}
	let svg = 0, svgExposed = 0;
	for (const el of document.querySelectorAll('.p3-view [data-col="after"] svg:is(.p3-engrave, .p3-rail), .p3-view [data-testid="p3-ring"] svg')) {
		svg++;
		if (el.getAttribute('aria-hidden') !== 'true' || getComputedStyle(el).pointerEvents !== 'none') svgExposed++;
	}
	return [boxes >= 10 ? 'at least 10 generated boxes' : 'ONLY ' + boxes + ' generated boxes', 'with a text content: ' + text, 'plate decorations that take the pointer: ' + pointer, svg >= 4 ? 'at least 4 decoration SVGs, exposed to AT or the pointer: ' + svgExposed : 'ONLY ' + svg + ' decoration SVGs'];
}`;

/*
 * NO GRID ANYWHERE ON THE PAGE, both directions (Mr. Pina, 2026-09-27: a grid
 * belongs only on a graph with axes; scan lines and ruled fills count). Every
 * element and both of its pseudo-elements, the root and the body included,
 * layer by layer: a layer is RULED when it is a linear gradient running along
 * an axis (no angle, `to top/right/bottom/left`, or a multiple of 90deg) that
 * either is a `repeating-linear-gradient` or is TILED -- repeated on some axis
 * with a tile under half the box on that axis. That is exactly what a scan-line
 * fill is, and a grid is two of them crossing. A full-box gradient (a face, a
 * vignette) is one tile and does not repeat; the hazard hatch and the hatch
 * stacks are slanted; the screws and the perforation are radial. An element
 * with any ruled layer counts once.
 *
 * THE PLANTED GRID IS THE POSITIVE CONTROL, AND ROUND 3'S FIRST SWEEP FAILED
 * IT. That sweep read the computed `background-image` with one regular
 * expression, whose "two crossing gradients" branch wanted the FIRST gradient
 * to name an angle and stopped at the first `)` -- which in a computed value is
 * the one closing `rgba(`. The control grid (a default-direction gradient plus
 * a 90deg one) never matched, so a page covered in grids would have read zero.
 * It reported "planted control grid detected: NO" on its first real run, which
 * is the only reason it was caught.
 */
const NO_GRID = `() => {
	const layers = (v) => {
		const out = [];
		let depth = 0, cur = '';
		for (const ch of v) {
			if (ch === '(') depth++;
			if (ch === ')') depth--;
			if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
		}
		if (cur.trim()) out.push(cur.trim());
		return out;
	};
	const axisOf = (img) => {
		const m = /^(repeating-)?linear-gradient[(]\\s*(to (top|bottom|left|right)|-?[0-9.]+deg)?/.exec(img);
		if (!m) return null;
		const dir = m[2] || '180deg';
		if (dir.startsWith('to ')) return (dir.endsWith('left') || dir.endsWith('right')) ? 'x' : 'y';
		const deg = ((parseFloat(dir) % 360) + 360) % 360;
		if (deg % 90 !== 0) return null;
		return deg % 180 === 0 ? 'y' : 'x';
	};
	const ruledLayer = (img, size, rep, w, h) => {
		const axis = axisOf(img);
		if (!axis) return false;
		if (img.startsWith('repeating-')) return true;
		const [rx, ry = rx] = rep.split(' ');
		const reps = (r) => r === 'repeat' || r === 'round' || r === 'space';
		const [sx, sy = 'auto'] = size.split(' ');
		const px = (v, full) => (v.endsWith('px') ? parseFloat(v) : v.endsWith('%') ? (parseFloat(v) / 100) * full : full);
		const tw = px(sx, w), th = px(sy, h);
		/* The stripes run across the gradient axis, so it is the tile along that
		   axis that makes them repeat; a tile repeated on the other axis too is a
		   grid cell. Either way, a small repeated tile is a ruled fill. */
		return (reps(rx) && tw < w / 2) || (reps(ry) && th < h / 2);
	};
	const ruled = (el, which) => {
		const cs = getComputedStyle(el, which);
		if (which && (cs.content === 'none' || cs.content === 'normal')) return null;
		if (cs.display === 'none' || cs.visibility === 'hidden') return null;
		let w, h;
		if (which) { w = parseFloat(cs.width); h = parseFloat(cs.height); }
		else { const r = el.getBoundingClientRect(); w = r.width; h = r.height; }
		if (!w || !h || cs.backgroundImage === 'none') return null;
		const imgs = layers(cs.backgroundImage), sizes = layers(cs.backgroundSize), reps = layers(cs.backgroundRepeat);
		return imgs.some((img, i) => ruledLayer(img, sizes[i % sizes.length], reps[i % reps.length], w, h));
	};
	const sweep = () => {
		let layered = 0, hits = 0;
		for (const el of [document.documentElement, document.body, ...document.querySelectorAll('body *')]) {
			for (const which of [null, '::before', '::after']) {
				const r = ruled(el, which);
				if (r === null) continue;
				layered++;
				if (r) hits++;
			}
		}
		return { layered, hits };
	};
	const control = document.createElement('div');
	control.style.cssText = 'position:fixed;left:0;top:0;width:40px;height:40px;background-image:linear-gradient(rgba(0,0,0,.2) 1px, transparent 1px),linear-gradient(90deg, rgba(0,0,0,.2) 1px, transparent 1px);background-size:8px 8px;pointer-events:none';
	document.body.appendChild(control);
	const planted = sweep();
	control.remove();
	const page = sweep();
	return [(page.layered > 50 ? 'over 50' : page.layered) + ' painted background layers examined, grids: ' + page.hits, 'planted control grid detected: ' + (planted.hits === page.hits + 1 ? 'yes' : 'NO')];
}`;

export function plateSpec(theme) {
	const attr = theme === 'idea' ? null : theme;
	return {
		path: `/dev/themes-shape?state=${theme}`,
		label: `Classroom shape language round 3 (Plate v3), ${theme}: before and after, monitor and wall`,
		prepare: [
			{ evaluate: SETTLE_ENTRANCE, label: 'settle any entrance animation' },
			{
				waitFor: `() => document.documentElement.getAttribute('data-theme') === ${JSON.stringify(attr)} && !!document.querySelector('[data-testid="plate-v3-view"]') && document.querySelectorAll('.p3-view .cr-header').length === 6`,
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
				evaluate: `() => 'data-theme=' + document.documentElement.getAttribute('data-theme') + ' corner-shape superellipse supported=' + CSS.supports('corner-shape', 'superellipse(0.25)') + ' --p3-plate-top=' + getComputedStyle(document.querySelector('.p3-after')).getPropertyValue('--p3-plate-top').trim() + ' --p3-accent=' + getComputedStyle(document.querySelector('.p3-after')).getPropertyValue('--p3-accent').trim()`,
				label: 'what the browser supports and what the plate computes'
			}
		],
		presence: [
			{ selector: '[data-testid="plate-v3-view"]', label: 'Plate v3 is the default view', expectPresent: 1, maxPresent: 1 },
			{ selector: '[data-testid="plate-view"]', label: 'round 2 is not mounted by default', expectPresent: 0, maxPresent: 0 },
			{ selector: '.p3-view [data-pl-sec] [data-col]', label: 'eight sections, two columns each', expectPresent: 16, maxPresent: 16, expectVisible: 16 },
			{ selector: '.p3-view .p3-after', label: 'eight after columns, plus the corner study collapsed (present, zero-box)', expectPresent: 9, maxPresent: 9, expectVisible: 8 },
			{ selector: '[data-testid="corner-study"]', label: 'the corner study, present (collapsed by default)', expectPresent: 1, maxPresent: 1 },
			{ selector: '[data-face-set]', label: 'the label-face A/B toggle', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
			{ selector: '[data-face-set="a"][aria-pressed="true"]', label: 'face A (Share Tech Mono) is the default', expectPresent: 1, maxPresent: 1 },
			{ selector: '[data-theme-set]', label: 'the theme switcher, one per theme', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
			{ selector: `[data-theme-set="${theme}"][aria-pressed="true"]`, label: `the ${theme} theme button pressed`, expectPresent: 1, maxPresent: 1 },
			{ selector: '[data-theme-set][aria-pressed="true"]', label: 'exactly one theme pressed', expectPresent: 1, maxPresent: 1 },
			{ selector: '[data-view-set="v3"][aria-pressed="true"]', label: 'the Plate v3 view pressed', expectPresent: 1, maxPresent: 1 },
			{ selector: '[data-view-set]', label: 'round 1 and round 2 still one button away', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
			{ selector: '.p3-view [data-col="after"] [data-testid="p3-ring"]', label: 'the progress ring, after columns only (display and region)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
			{ selector: '.p3-view [data-col="before"] [data-testid="p3-ring"]', label: 'no progress ring in a before column', expectPresent: 0, maxPresent: 0 },
			{ selector: '.p3-view [data-col="after"] .p3-switch-held', label: 'the switch held off and on, after column only', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
			{ selector: '.p3-view .pl-list .row-wrap.selected', label: 'one selected list row per column', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
			{ selector: '[data-testid="menu-stage"] .sw-item.current', label: 'the current class in each open menu', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
			{ selector: '.p3-view .grade-head', label: 'the returned-grade readout, two sections times two columns', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
			{ selector: '.p3-view .cr-header', label: 'six real classroom headers', expectPresent: 6, maxPresent: 6, expectVisible: 6 }
		],
		contrast: [
			...textRows(false),
			...textRows(true),
			{ selector: '.ts-page h1', label: 'page heading', min: 4.5 },
			{ selector: '.ts-page .ts-lead', label: 'lead copy', min: 4.5 },
			{ selector: '.p3-view .pl-note', label: 'section notes', min: 4.5, all: true },
			{ selector: '.p3-view .pl-colh', label: 'column headings', min: 4.5, all: true }
		],
		tapTargets: [
			{ selector: `.p3-view [data-col="before"] ${CONTROLS}:not(.wordmark)`, label: 'before: every control', min: 44 },
			{ selector: `.p3-view [data-col="after"] ${CONTROLS}`, label: 'after: every control, the logo link and the held switches included', min: 44 },
			/* TODAY'S LOGO LINK: 56x26 at 375 (the emblem shrinks with the
			   viewport). The proposal gives it 44 (the after row above); this
			   row reports today's number against the 24px floor so it is on
			   the record rather than a finding against the proposal. */
			{ selector: '.p3-view [data-col="before"] a.wordmark', label: 'before: the logo link (today, 24px floor)', min: 24 },
			/* ClassView's expand control is 30px wide by 44 tall on purpose,
			   and says why in its own stylesheet (a 44px-wide box would hand
			   the drag grip's taps to it). Unchanged by the proposal. */
			{ selector: '.p3-view .pl-list .row-expand', label: 'list expand controls (documented 30x44 exception)', min: 24 },
			{ selector: '[data-theme-set], [data-view-set], [data-face-set]', label: 'the page switchers', min: 44 }
		],
		orderResult: [
			{
				label: 'the proposal is applied in the after column and absent in the before column',
				evaluate: COMPUTED_SHAPE,
				expected: [
					'before btn round 3px',
					'after btn round 11px',
					'before card round 4px',
					'after card round 12px',
					'before chip round 999px',
					'after chip round 5px',
					'after select round 11px',
					'after header tool round 11px',
					'after screen round round superellipse(0.25) superellipse(0.25) 7px'
				]
			},
			{ label: 'every mono label in the after columns is 11px or larger', evaluate: MONO_FLOOR, expected: ['after: over 20 mono labels examined, under 11px: 0'] },
			{
				label: 'decoration is paint only: no generated text, and nothing that takes the pointer',
				evaluate: DECORATION,
				expected: ['at least 10 generated boxes', 'with a text content: 0', 'plate decorations that take the pointer: 0', 'at least 4 decoration SVGs, exposed to AT or the pointer: 0']
			},
			{
				label: 'no grid or ruled-line fill is painted anywhere on the page (a planted grid is detected)',
				evaluate: NO_GRID,
				expected: ['over 50 painted background layers examined, grids: 0', 'planted control grid detected: yes']
			}
		]
	};
}
