/**
 * THE LIST BESIDE AN OPEN ITEM STAYS READABLE AS IT NARROWS (ledger 0368,
 * report R09, Mr. Pina at 1440: "This kind of squishing ... is unacceptable,
 * it's very messy"). The screenshot showed a unit header broken mid-word
 * ("HOOK COMPETITIO N"), titles two or three words a line and the meta line one
 * field per line, in a teacher's list narrowed beside an item.
 *
 * `?names=long` gives one unit and one assignment the report's kind of name in
 * place (no new rows), and `?nav=18` opens the pane at the store's 18rem floor.
 * The sweep (`_narrow-list.mjs`) then steps the REAL separator from 18rem to
 * 30rem and prints, at each width, the overflow, the broken words, the long
 * title's width and lines, the meta's lines and the row height. The verdict
 * holds every width to: no sideways overflow, no word broken across a line,
 * no meta field split although it would fit on a line of its own.
 *
 * THE CONTROLS THE COMPACT ROW KEEPS ARE HIT-TESTED IN THE NARROWEST PANE: the
 * selection checkbox's label and the row menu's trigger at their own centres,
 * then the menu itself, which is `use:anchored` (position: fixed) and must
 * still open on screen now that the stream is a size container. The other
 * direction, the grip and the expand control DISPLAYED with nothing open, is
 * `classroom-split-s-1-manage-1.mjs`'s twenty visible grips, unchanged.
 */
import { SWEEP, SWEEP_VERDICT } from './_narrow-list.mjs';

const MENU_OPEN = `() => !!document.querySelector('[data-testid="row-menu-open"]')`;

/** At 18rem (where the sweep leaves the pane): the controls a compact row keeps. */
const CONTROLS = `() => {
	const wide = window.matchMedia('(min-width: 1024px)').matches;
	if (!wide) {
		const nav = document.querySelector('[data-testid="class-nav-pane"]');
		const t = !nav || getComputedStyle(nav).display === 'none' || nav.getBoundingClientRect().width === 0 ? 'yes' : 'no-list-on-screen';
		return ['grip and collapsed expand step aside:' + t, 'checkbox hit at its centre:' + t, 'row menu hit at its centre:' + t, 'opened menu on screen and on top:' + t];
	}
	const nav = document.querySelector('[data-testid="class-nav-pane"]');
	const row = [...nav.querySelectorAll('[data-testid="item-row"]')].find((r) => /Solidworks Day/.test(r.textContent));
	if (!row) return ['fixture:missing-long-row'];
	/* The pane is its own scroll region: a row below its fold answers no hit test. */
	row.scrollIntoView({ block: 'center', behavior: 'instant' });
	const hit = (el) => {
		const b = el.getBoundingClientRect();
		const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
		return !!at && (at === el || el.contains(at));
	};
	const grip = row.querySelector('.row-grip');
	const expand = row.querySelector('.row-expand');
	const aside = (!grip || getComputedStyle(grip).display === 'none') && (!expand || expand.getAttribute('aria-expanded') === 'true' || getComputedStyle(expand).display === 'none');
	const box = row.querySelector('.row-select-hit');
	const menuKey = row.querySelector('[data-testid="row-menu"]');
	const menu = document.querySelector('[data-testid="row-menu-open"]');
	let menuOk = 'no-menu-open';
	if (menu) {
		const b = menu.getBoundingClientRect();
		const on = b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5;
		const item = menu.querySelector('button[role="menuitem"]');
		menuOk = on && item && hit(item) ? 'yes' : 'no-' + Math.round(b.left) + ',' + Math.round(b.top) + ',' + Math.round(b.right) + ',' + Math.round(b.bottom);
	}
	return [
		'grip and collapsed expand step aside:' + (aside ? 'yes' : 'no'),
		'checkbox hit at its centre:' + (box && hit(box) ? 'yes' : 'no'),
		'row menu hit at its centre:' + (menuKey && hit(menuKey) ? 'yes' : 'no'),
		'opened menu on screen and on top:' + menuOk
	];
}`;

/**
 * AND A COLLAPSE PRESSED WITH THE FOCUS ON IT KEEPS THE FOCUS. The compact tier
 * hides a collapsed expand arrow; without `:not(:focus)` the arrow a keyboard
 * user just pressed Collapse on became `display: none` under the focus and the
 * focus fell to the body. Both directions, at 18rem: the focused arrow stays
 * displayed and focused after Collapse, and steps aside once focus moves on.
 * Runs last, because it expands and collapses a row.
 */
const FOCUS_KEPT = `async () => {
	const wide = window.matchMedia('(min-width: 1024px)').matches;
	const nav = document.querySelector('[data-testid="class-nav-pane"]');
	if (!wide) {
		const t = !nav || getComputedStyle(nav).display === 'none' || nav.getBoundingClientRect().width === 0 ? 'yes' : 'no-list-on-screen';
		return ['an expanded row keeps its arrow:' + t, 'Collapse with the focus on it keeps the focus and the arrow:' + t, 'the arrow steps aside once the focus leaves:' + t];
	}
	const expand = nav.querySelector('[data-testid="row-expand"]');
	if (!expand) return ['fixture:no-expandable-row'];
	const settle = () => new Promise((r) => setTimeout(r, 350));
	const shown = () => getComputedStyle(expand).display !== 'none';
	expand.closest('[data-testid="item-row"]')?.scrollIntoView({ block: 'center', behavior: 'instant' });
	if (expand.getAttribute('aria-expanded') !== 'true') { expand.click(); await settle(); }
	const opened = expand.getAttribute('aria-expanded') === 'true' && shown();
	expand.focus();
	await settle();
	expand.click();
	await settle();
	const collapsed = expand.getAttribute('aria-expanded') === 'false';
	const kept = collapsed && document.activeElement === expand && shown();
	const keptWhy = 'no-collapsed=' + collapsed + '-active=' + (document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName) + '-shown=' + shown();
	const sep = document.querySelector('[data-testid="split-separator"]');
	sep?.focus();
	await settle();
	const aside = document.activeElement !== expand && !shown();
	return [
		'an expanded row keeps its arrow:' + (opened ? 'yes' : 'no'),
		'Collapse with the focus on it keeps the focus and the arrow:' + (kept ? 'yes' : keptWhy),
		'the arrow steps aside once the focus leaves:' + (aside ? 'yes' : 'no-shown=' + shown())
	];
}`;

export default {
	path: '/dev/classroom-split/s-1/item/i-crowded?manage=1&names=long&nav=18',
	label: 'Class list beside an open item, narrowed from 18rem to 30rem: readable at every width',
	prepare: [
		{ waitFor: `() => document.querySelectorAll('[data-testid="item-row"]').length > 0`, label: 'the list has painted', timeoutMs: 20000 },
		{ evaluate: SWEEP },
		/* Open the long row's menu at 18rem, wide only (below 1024 the list is not on screen). */
		{
			evaluate: `() => {
				if (!window.matchMedia('(min-width: 1024px)').matches) return 'phone: no list beside the item';
				const row = [...document.querySelectorAll('[data-testid="class-nav-pane"] [data-testid="item-row"]')].find((r) => /Solidworks Day/.test(r.textContent));
				row?.scrollIntoView({ block: 'center', behavior: 'instant' });
				if (!document.querySelector('[data-testid="row-menu-open"]')) row?.querySelector('[data-testid="row-menu"]')?.click();
				return 'menu pressed';
			}`,
			until: `() => !window.matchMedia('(min-width: 1024px)').matches || (${MENU_OPEN})()`,
			attempts: 20,
			gapMs: 300
		}
	],
	orderResult: [
		{
			label: 'from 18rem to 30rem: no sideways overflow, no broken word, no meta field split that would fit whole',
			evaluate: SWEEP_VERDICT,
			expected: ['visited every width:yes', 'pane never overflows sideways:yes', 'no word broken across lines:yes', 'no meta field split that would fit whole:yes']
		},
		{
			label: 'at 18rem the compact row keeps a hit-testable checkbox and row menu, and the menu opens on screen',
			evaluate: CONTROLS,
			expected: ['grip and collapsed expand step aside:yes', 'checkbox hit at its centre:yes', 'row menu hit at its centre:yes', 'opened menu on screen and on top:yes']
		},
		{
			label: 'at 18rem a collapse pressed with the focus on the arrow keeps the focus, and the arrow steps aside only once the focus leaves',
			evaluate: FOCUS_KEPT,
			expected: [
				'an expanded row keeps its arrow:yes',
				'Collapse with the focus on it keeps the focus and the arrow:yes',
				'the arrow steps aside once the focus leaves:yes'
			]
		}
	],
	/* The crowded item's own image attachment asks the real proxy, which
	   answers 401 with no session: the same ignore the item's spec carries. */
	ignoreConsole: ['Failed to load resource: the server responded with a status of 401']
};
