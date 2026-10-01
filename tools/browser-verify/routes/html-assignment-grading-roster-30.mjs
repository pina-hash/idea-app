/* NO `order` EXPORT -- see routes.mjs. */

/**
 * THE GRADE PAGE'S ROSTER AT A REAL CLASS'S SIZE (ledger 0360, report 7933566a).
 *
 * Thirty fictional students, presence for twenty-five of them, returned work on
 * every seventh, and one inactive. What Mr. Pina filed was the region ABOVE the
 * names shrunk to a sliver with its own scrollbar, the keys clipped inside it,
 * and a list of two-line rows that showed few names at once. So this spec opens
 * one student (the split the report was taken on), focuses a fourth so its card
 * is up, and measures:
 *
 *   1. THE HEAD IS NEVER A SLIVER: `.roster-tools` holds its content without
 *      scrolling, and the keys inside it answer a hit test at their own centre.
 *   2. A ROW IS ONE LINE: no row taller than 52px, at either width.
 *   3. THE NAMES TAKE THE REST: at 1440 the head stays under its 45% ceiling,
 *      the list has at least half the card and scrolls. How many whole names
 *      that is depends on the chrome above the console, so it is REPORTED by a
 *      prepare step rather than asserted.
 *   4. THE CARD: one, on screen, beside its row at 1440, transparent to the
 *      pointer, and the row is described by it.
 *
 * Geometry is a real browser's claim; `tests/dom/grading-roster-compact-mount.test.ts`
 * holds the structure (one card, one line of words per row, the keys).
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/html-assignment-grading?roster=30',
	label: 'Grading console, thirty students: a one-line roster, a head that is never a sliver, one card',
	widths: WIDTHS,
	prepare: [
		{
			waitFor: `() => document.querySelectorAll('.roster-row').length === 30`,
			label: 'the roster has loaded (30 rows)'
		},
		{
			click: '.roster-row',
			until: `() => !!document.querySelector('.work-head')`,
			label: 'open the first student (the split the report was taken on)'
		},
		{
			/* REPORTS, IT DOES NOT ASSERT: how tall the head is and how many whole
			   names the list shows. Both depend on the chrome above the console,
			   so a fixed number here would be this harness's number. */
			label: 'REPORT: the head and the names in view',
			evaluate: `() => {
				const tools = document.querySelector('.roster-tools');
				const list = document.querySelector('.roster-list');
				const box = list.getBoundingClientRect();
				const whole = Array.from(list.querySelectorAll('.roster-row')).filter((r) => { const b = r.getBoundingClientRect(); return b.top >= Math.max(box.top, 0) - 0.5 && b.bottom <= Math.min(box.bottom, window.innerHeight) + 0.5; }).length;
				return 'head=' + Math.round(tools.getBoundingClientRect().height) + 'px list=' + Math.round(list.clientHeight) + 'px wholeNamesInView=' + whole + ' at ' + window.innerWidth + 'x' + window.innerHeight;
			}`
		},
		{
			evaluate: `() => { const r = document.querySelectorAll('.roster-row')[3]; r.focus({ preventScroll: true }); return document.activeElement === r ? 'focused row 4' : 'focus missed'; }`,
			until: `() => !!document.querySelector('[data-testid="roster-card"]')`,
			label: 'focus the fourth row: its card is up'
		}
	],
	presence: [
		{ selector: '.roster-row', label: 'thirty rows', expectPresent: 30, maxPresent: 30 },
		{ selector: '[data-testid="roster-presence"]', label: 'a glyph on each of the 25 rows with presence', expectPresent: 25, maxPresent: 25 },
		{ selector: '[data-testid="roster-card"]', label: 'exactly one card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.roster-item [data-testid="presence-line"]', label: 'presence lines ON a row (none: the card has them)', expectPresent: 0 },
		{ selector: '[data-testid="roster-filter-all"]', label: 'the All key', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [
		{ selector: '.roster-keys button', label: 'the roster keys (All, To grade, Select)', min: 44 },
		{ selector: '.roster-row', label: 'a roster row (the whole row is one target)', min: 44 }
	],
	contrast: [
		{ selector: '.roster-row .roster-name', label: 'a name on a row', min: 4.5 },
		{ selector: '.roster-row .roster-chip', label: 'a state chip on a row', min: 4.5 },
		{ selector: '[data-testid="roster-presence"]', label: 'a presence glyph (graphical, 3:1)', min: 3 },
		{ selector: '[data-testid="roster-card"] .rc-name', label: 'the name on the card', min: 4.5 },
		{ selector: '[data-testid="roster-card"] .pword', label: 'the presence word on the card', min: 4.5 },
		{ selector: '[data-testid="roster-card"] .rc-hint', label: 'the card’s key hint', min: 4.5 }
	],
	orderResult: [
		{
			label: 'the head holds its content without its own scrollbar, and its keys take their own taps',
			evaluate: `() => {
				const tools = document.querySelector('.roster-tools');
				if (!tools) return ['tools=false'];
				const noScroll = tools.scrollHeight <= tools.clientHeight + 1;
				const keys = Array.from(document.querySelectorAll('.roster-keys button'));
				const hits = keys.every((k) => { const r = k.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && k.contains(h); });
				/* All and To grade always; Select only where a batch transport is
				   handed in, which this harness does not do. */
				return ['headScrolls=' + !noScroll, 'atLeastTwoKeys=' + (keys.length >= 2), 'keysHitThemselves=' + hits];
			}`,
			expected: ['headScrolls=false', 'atLeastTwoKeys=true', 'keysHitThemselves=true']
		},
		{
			label: 'every row is one line (52px at most)',
			evaluate: `() => {
				const rows = Array.from(document.querySelectorAll('.roster-row'));
				const tall = rows.filter((r) => r.getBoundingClientRect().height > 52);
				return ['rows=' + rows.length, 'rowsOver52=' + tall.length];
			}`,
			expected: ['rows=30', 'rowsOver52=0']
		},
		{
			/* AT 1440 THE NAMES ARE THE ONE THING THAT SCROLLS. Below 1024 the
			   document scrolls, which is the console's own rule, so the two
			   readings there are recorded true by construction and the reason is
			   this comment. */
			label: 'at desktop the names take the rest: the head stays under its ceiling and the list has most of the card, and scrolls',
			evaluate: `() => {
				const roster = document.querySelector('.roster');
				const tools = document.querySelector('.roster-tools');
				const list = document.querySelector('.roster-list');
				if (!roster || !tools || !list) return ['regions=false'];
				if (window.innerWidth < 1024) return ['listScrolls=true', 'headWithinCeiling=true', 'listHasMostOfCard=true'];
				const card = roster.clientHeight;
				return [
					'listScrolls=' + (list.scrollHeight > list.clientHeight + 1),
					'headWithinCeiling=' + (tools.getBoundingClientRect().height <= 0.45 * card + 1),
					'listHasMostOfCard=' + (list.clientHeight >= 0.5 * card)
				];
			}`,
			expected: ['listScrolls=true', 'headWithinCeiling=true', 'listHasMostOfCard=true']
		},
		{
			label: 'the card is on screen, beside its row at 1440, takes no click, and describes the row',
			evaluate: `() => {
				const card = document.querySelector('[data-testid="roster-card"]');
				const row = document.querySelectorAll('.roster-row')[3];
				if (!card || !row) return ['card=false'];
				const c = card.getBoundingClientRect();
				const r = row.getBoundingClientRect();
				const inView = c.left >= 0 && c.top >= 0 && c.right <= window.innerWidth + 0.5 && c.bottom <= window.innerHeight + 0.5;
				const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
				const passThrough = !!hit && !card.contains(hit);
				const beside = window.innerWidth < 1024 ? true : c.left >= r.right - 1;
				return ['inViewport=' + inView, 'pointerPassesThrough=' + passThrough, 'besideAtDesktop=' + beside, 'rowDescribedByCard=' + (row.getAttribute('aria-describedby') === card.id)];
			}`,
			expected: ['inViewport=true', 'pointerPassesThrough=true', 'besideAtDesktop=true', 'rowDescribedByCard=true']
		}
	]
};
