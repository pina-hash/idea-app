/**
 * THE SPACE WHITE SHAPE-LANGUAGE MOCKUP (decision 40 item 4, ledger 0298).
 *
 * A PROPOSAL, NOT A SHIPPED SURFACE: /dev/themes-shape applies its tokens to
 * wrappers only it renders. What this spec answers is whether the proposal
 * costs anything a reader or a keyboard user would notice, measured on the
 * real elements under the real theme:
 *
 *  1. THE PROPOSAL IS WHAT IS ON SCREEN. The after column computes
 *     `corner-shape: bevel` and the proposed radii; the before column computes
 *     today's `round` and today's radii. Both directions, so a page on which
 *     the proposal silently failed to apply (an unsupported browser, a dropped
 *     import) reads as a failure rather than as "no difference".
 *  2. NO COLOUR MOVED. Every text specimen, before and after, on a monitor
 *     (WCAG) and on the wall (`PROJECTOR_MODEL` in ../checks.mjs). A shape
 *     change that changed a ratio would be a finding.
 *  3. NO TARGET SHRANK. Every control at 44px in both columns and in the
 *     after header.
 *
 * WHAT THIS SPEC CANNOT SEE, AND WHERE IT IS MEASURED INSTEAD. Whether a
 * focus ring and a diagonal border survive the chamfer is a question about
 * PIXELS, and the frosted header's real ground is whatever is scrolled under
 * it -- `contrast` reads a ground by walking ancestors, which sees neither a
 * `::before` tint nor a sibling behind the glass. Those three are measured by
 * `../_themes-shape-pixels.mjs`, from a screenshot of this same route, and
 * reported in docs/feedback/2026-09-25/overnight/shapes.md. The glass header's
 * text is therefore deliberately NOT a row here: a green number over the
 * wrong ground is worse than no row.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

const COLS = ['before', 'after'];

/* One text row per specimen per column, so a column that lost a specimen
   shows up as a row that matched nothing (and the presence rows say so). */
const TEXT = [
	{ ts: 'btn-primary', label: 'primary button label', min: 4.5, wash: 3 },
	{ ts: 'btn-secondary', label: 'secondary button label', min: 4.5, wash: 4.5 },
	{ ts: 'chip-status', label: 'status chip (Draft)', min: 4.5, wash: 3 },
	{ ts: 'chip-kind', label: 'kind chip (Assignment)', min: 4.5, wash: 3 },
	{ ts: 'card-label', label: 'card micro-label', min: 4.5, wash: 3 },
	{ ts: 'card-title', label: 'card title', min: 4.5, wash: 4.5 },
	{ ts: 'card-body', label: 'card body', min: 4.5, wash: 4.5 },
	{ ts: 'card-btn', label: 'button inside the card', min: 4.5, wash: 4.5 },
	{ ts: 'card-chip', label: 'chip inside the card', min: 4.5, wash: 3 }
];

const textRows = (projector) =>
	COLS.flatMap((col) =>
		TEXT.map((t) => ({
			selector: `[data-col="${col}"] [data-ts="${t.ts}"]`,
			label: `${col}: ${t.label}${projector ? ' (projector)' : ''}`,
			min: projector ? t.wash : t.min,
			all: true,
			...(projector ? { projector: true } : {})
		}))
	);

/* The header's words, before and after. `.cls-code` is the class glyph's
   code, `.shell-tool-word` a tool's label, `.sw-name` the class menu's. */
const HEADER_TEXT = [
	{ sel: '.cr-header .cls-code', label: 'class icon code', wash: 3 },
	{ sel: '.cr-header .shell-tool-word', label: 'header tool labels', wash: 3 },
	{ sel: '.cr-header .sw-name', label: 'class menu trigger', wash: 3 }
];
const headerRows = (projector) =>
	COLS.flatMap((col) =>
		HEADER_TEXT.map((h) => ({
			selector: `[data-col="${col}"] ${h.sel}`,
			label: `${col} header: ${h.label}${projector ? ' (projector)' : ''}`,
			min: projector ? h.wash : 4.5,
			all: true,
			...(projector ? { projector: true } : {})
		}))
	);

/* What the page computes for the proposal, both directions, as an array. */
const COMPUTED_SHAPE = `() => {
	const read = (sel) => {
		const el = document.querySelector(sel);
		if (!el) return sel + ' MISSING';
		const cs = getComputedStyle(el);
		return (cs.getPropertyValue('corner-shape') || cs.cornerShape || '(none)').trim() + ' ' + cs.borderTopLeftRadius + '/' + cs.borderTopRightRadius;
	};
	return [
		'before btn ' + read('[data-col="before"] [data-ts="btn-primary"]'),
		'after btn ' + read('[data-col="after"] [data-ts="btn-primary"]'),
		'before card ' + read('[data-col="before"] [data-ts="card"]'),
		'after card ' + read('[data-col="after"] [data-ts="card"]'),
		'after header tool ' + read('[data-col="after"] .cr-header .shell-tool'),
		'before header tool ' + read('[data-col="before"] .cr-header .shell-tool'),
		'after chip ' + read('[data-col="after"] [data-ts="chip-status"]'),
		'before chip ' + read('[data-col="before"] [data-ts="chip-status"]')
	];
}`;

export default {
	path: '/dev/themes-shape?state=space-white',
	label: 'Space White shape-language mockup: before and after, measured on a monitor and on the wall',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, label: 'settle any entrance animation' },
		{
			waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white' && document.querySelectorAll('.cr-header').length === 3`,
			label: 'the theme is on and the three headers mounted'
		},
		{
			evaluate: `() => { const cs = getComputedStyle(document.documentElement); return 'data-theme=' + document.documentElement.getAttribute('data-theme') + ' corner-shape supported=' + CSS.supports('corner-shape', 'bevel') + ' backdrop-filter supported=' + CSS.supports('backdrop-filter', 'blur(1px)') + ' reduced-transparency=' + matchMedia('(prefers-reduced-transparency: reduce)').matches + ' --surface-1=' + cs.getPropertyValue('--surface-1').trim() + ' --boundary=' + cs.getPropertyValue('--boundary').trim(); }`,
			label: 'what the browser supports and what the theme computes'
		},
		{
			/* A press in a cut corner: which element does it land on? Reported,
			   not asserted -- the answer is a fact about the construction the
			   note weighs, and there is no threshold for it. 2px in from the
			   top-left corner of each after control, and of the clipped one. */
			evaluate: `() => ['[data-col="after"] [data-ts="btn-primary"]', '[data-col="before"] [data-ts="btn-primary"]', '[data-ts="build-clip"]', '[data-ts="build-bevel"]'].map((sel) => { const el = document.querySelector(sel); el.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + 2, r.top + 2); const mid = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return sel + ': corner lands on ' + (hit === el ? 'the control' : (hit ? hit.tagName.toLowerCase() + '.' + [...hit.classList].slice(0, 2).join('.') : 'nothing')) + ', centre lands on ' + (mid === el || el.contains(mid) ? 'the control' : 'something else'); }).join(' | ')`,
			label: 'where a press 2px inside the top-left corner lands'
		}
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'the theme attribute is on <html>', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cr-root.ts-root', label: 'the classroom room wraps the page', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-col="before"] [data-ts^="btn-"]', label: 'before: the two buttons', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-col="after"] [data-ts^="btn-"]', label: 'after: the two buttons', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-col="before"] [data-ts^="chip-"]', label: 'before: the two chips', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-col="after"] [data-ts^="chip-"]', label: 'after: the two chips', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-col="before"] [data-ts="card"]', label: 'before: the card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-col="after"] [data-ts="card"]', label: 'after: the card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.cr-header', label: 'three real classroom headers (before, after, glass)', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-col="glass"] .cr-header', label: 'the glass header', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-ts="build-clip"]', label: 'the clipped construction', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-ts="build-bevel"]', label: 'the corner-shape construction', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-cut-set]', label: 'the two cut-style buttons', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-cut-set][aria-pressed="true"]', label: 'exactly one cut style pressed', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="token-table"] tbody tr', label: 'the token table rows', expectPresent: 6, maxPresent: 6 }
	],
	contrast: [
		...textRows(false),
		...textRows(true),
		...headerRows(false),
		...headerRows(true),
		{ selector: '.ts-page h1', label: 'page heading', min: 4.5 },
		{ selector: '.ts-page .ts-lead', label: 'lead copy', min: 4.5 },
		{ selector: '.ts-page .ts-note', label: 'section notes', min: 4.5, all: true },
		{ selector: '.ts-table td', label: 'token table cells', min: 4.5, all: true }
	],
	tapTargets: [
		{ selector: '[data-col="before"] [data-ts^="btn-"]', label: 'before: buttons', min: 44 },
		{ selector: '[data-col="after"] [data-ts^="btn-"]', label: 'after: buttons', min: 44 },
		{ selector: '[data-col="after"] [data-ts="card-btn"]', label: 'after: the button in the card', min: 44 },
		{ selector: '[data-col="after"] .cr-header :is(button, a.cls-icon, a.shell-tool)', label: 'after header: every control', min: 44 },
		{ selector: '[data-col="before"] .cr-header :is(button, a.cls-icon, a.shell-tool)', label: 'before header: every control', min: 44 },
		{ selector: '[data-cut-set]', label: 'cut-style buttons', min: 44 }
	],
	orderResult: [
		{
			label: 'the proposal is applied in the after column and absent in the before column',
			evaluate: COMPUTED_SHAPE,
			expected: [
				'before btn round 3px/3px',
				'after btn bevel square 8px/8px',
				'before card round 4px/4px',
				'after card bevel square 12px/12px',
				'after header tool bevel square 8px/8px',
				'before header tool round 4px/4px',
				'after chip bevel 999px/999px',
				'before chip round 999px/999px'
			]
		}
	]
};
