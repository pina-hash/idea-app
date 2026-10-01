/* NO `order` EXPORT -- see routes.mjs. */

/**
 * PRESENCE ON THE GRADING CONSOLE: one student per state, plus a fifth who has
 * never opened the assignment.
 *
 * LEDGER 0360 MOVED THE PRESENCE LINE OFF THE ROW (report 7933566a: the detail
 * "can show up when I hover my mouse over their name"). A row is one line now,
 * carrying the state's own GLYPH; the whole line -- the word, when they last
 * worked, how long they have worked -- is in the one card the console draws for
 * the name that is pointed at or focused, and in the work head of the student
 * who is open. So this spec puts both on screen at once: Ana (working) is OPEN,
 * and Ben (viewing) is FOCUSED, so his card is up. Cruz (open elsewhere) and Dee
 * (away) are measured the same way by `presence-state-open-elsewhere.mjs` and
 * `presence-state-away.mjs`, because one card shows at a time.
 *
 * WHAT ONLY A REAL BROWSER CAN SAY HERE. `tests/dom/presence-console-mount.test.ts`
 * mounts the identical component and asserts which words each card prints;
 * happy-dom has no layout engine, so these are the claims that need a page:
 *
 *   1. THE FOUR ROW GLYPHS ARE FOUR DIFFERENT HUES AND FOUR DIFFERENT SHAPES,
 *      each clearing the 3:1 graphical floor on the row it sits in.
 *   2. THE CARD AND THE WORK HEAD ARE LEGIBLE: the state word, the two figures
 *      and the card's own lines at 4.5:1 on the ground they are painted on.
 *   3. THE CARD IS INSIDE THE VIEWPORT, BESIDE THE NAME AT 1440, AND TAKES NO
 *      POINTER: `elementFromPoint` at its centre answers whatever is under it.
 *
 * NO TAP TARGET IS MEASURED inside presence: it is information, not an action,
 * and the `presence: 0` row below says so.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/presence',
	label: 'Presence: four glyphs on the rows, the line in the card and the work head',
	widths: WIDTHS,
	prepare: [
		{
			waitFor: `() => document.querySelectorAll('.roster-row').length === 5`,
			label: 'the roster has loaded (5 rows)'
		},
		{
			click: '.roster-row',
			until: `() => !!document.querySelector('[data-testid="work-presence"] [data-presence-state="working"]')`,
			label: 'open Ana (working): her presence line is in the work head'
		},
		{
			evaluate: `() => { const r = document.querySelectorAll('.roster-row')[1]; r.focus(); return document.activeElement === r ? 'focused Ben' : 'focus missed'; }`,
			until: `() => !!document.querySelector('[data-testid="roster-card"] [data-presence-state="viewing"]')`,
			label: 'focus Ben (viewing): his card is up'
		}
	],
	presence: [
		{
			selector: '[data-testid="roster-presence"]',
			label: 'a presence glyph on the four rows with a presence row (not the fifth)',
			expectPresent: 4,
			maxPresent: 4,
			expectVisible: 4,
			maxVisible: 4
		},
		{
			selector: '.roster-item [data-testid="presence-line"]',
			label: 'presence lines ON a row (none: it moved to the card)',
			expectPresent: 0
		},
		{
			selector: '[data-testid="roster-card"]',
			label: 'exactly one card, for the focused name',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="work-presence"] [data-testid="presence-line"]',
			label: 'the open student’s line in the work head',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="presence-note"]',
			label: 'the coverage sentence, once, above the list',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1,
			maxVisible: 1
		},
		{
			/* INFORMATION, NOT AN ACTION. Nothing inside a presence line or the
			   card is operable, which is why no 44px floor applies to any of it. */
			selector:
				'[data-testid="presence-line"] button, [data-testid="presence-line"] a, [data-testid="presence-line"] input, [data-testid="roster-card"] button, [data-testid="roster-card"] a',
			label: 'controls inside a presence line or the card (none: it is text)',
			expectPresent: 0
		}
	],
	contrast: [
		{ selector: '[data-testid="roster-presence"]', label: 'the four row glyphs (graphical, 3:1)', min: 3 },
		{ selector: '[data-testid="work-presence"] .pword', label: 'WORKING, in the work head', min: 4.5 },
		{ selector: '[data-testid="roster-card"] .pword', label: 'VIEWING, in the card', min: 4.5 },
		{ selector: '[data-testid="presence-worked"]', label: 'when the student last worked (card and head)', min: 4.5 },
		{ selector: '[data-testid="presence-active"]', label: 'how long they have worked (card and head)', min: 4.5 },
		{ selector: '[data-testid="roster-card"] .rc-name', label: 'the name on the card', min: 4.5 },
		{ selector: '[data-testid="roster-card"] .rc-hint', label: 'the card’s key hint', min: 4.5 },
		{ selector: '[data-testid="presence-note"]', label: 'the coverage sentence', min: 4.5 }
	],
	textContains: [
		{
			selector: '[data-testid="presence-note"]',
			label: 'the sentence says what the figure does NOT include',
			must: ['typed in', 'paper'],
			/* IT MUST NOT READ AS A MEASURE OF EFFORT. "Time on task" is the
			   phrase this number is most likely to be mistaken for. */
			mustNot: ['time on task', 'effort']
		},
		{
			selector: '[data-testid="roster-card"]',
			label: 'the card names the student and says how to open them',
			must: ['Ben', 'Enter opens their work']
		}
	],
	orderResult: [
		{
			label: 'focusing "Presence and working time" shows the coverage sentence',
			evaluate: `async () => {
				const note = document.querySelector('[data-testid="presence-note"]');
				const btn = note?.querySelector('button');
				const tip = note?.querySelector('[role="tooltip"]');
				if (!btn || !tip) return ['setup=false'];
				const shown = () => { const r = tip.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(tip).visibility !== 'hidden' && getComputedStyle(tip).opacity !== '0'; };
				const before = shown();
				btn.focus();
				await new Promise((r) => setTimeout(r, 250));
				const during = shown();
				const says = /paper/.test(tip.textContent || '');
				btn.blur();
				await new Promise((r) => setTimeout(r, 250));
				return ['hiddenAtRest=' + !before, 'shownOnFocus=' + during, 'saysPaper=' + says, 'hiddenAfterBlur=' + !shown()];
			}`,
			expected: ['hiddenAtRest=true', 'shownOnFocus=true', 'saysPaper=true', 'hiddenAfterBlur=true']
		},
		{
			/* FOUR DISTINCT HUES AND FOUR DISTINCT SHAPES on the rows. Read off the
			   rendered glyphs: a room that aliased two tone tokens to one value
			   would leave four marks in one colour with nothing to report it, and
			   the shapes are what keep colour from being the only signal. */
			label: 'the four row glyphs resolve to four distinct colours and four distinct shapes',
			evaluate: `() => {
				const marks = Array.from(document.querySelectorAll('[data-testid="roster-presence"]'));
				const colours = marks.map((m) => getComputedStyle(m).color);
				const shapes = marks.map((m) => m.textContent.trim());
				return [new Set(colours).size === 4, new Set(shapes).size === 4, marks.every((m) => m.getAttribute('aria-hidden') === 'true')];
			}`,
			expected: [true, true, true]
		},
		{
			/* THE CARD: inside the viewport, beside the name when there is room,
			   and transparent to the pointer. Ben's card is up from the prepare. */
			label: 'the card is on screen, beside its row at 1440, and takes no click',
			/* RE-FOCUSES BEN FIRST: the coverage-tip check above moves focus to the
			   tip's own button, and the card follows focus, so it is gone by now. */
			evaluate: `async () => {
				const row = document.querySelectorAll('.roster-row')[1];
				row?.focus({ preventScroll: true });
				for (let i = 0; i < 20 && !document.querySelector('[data-testid="roster-card"]'); i++) await new Promise((r) => setTimeout(r, 50));
				const card = document.querySelector('[data-testid="roster-card"]');
				if (!card || !row) return ['card=false'];
				const c = card.getBoundingClientRect();
				const r = row.getBoundingClientRect();
				const inView = c.left >= 0 && c.top >= 0 && c.right <= window.innerWidth + 0.5 && c.bottom <= window.innerHeight + 0.5;
				const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
				const passThrough = !!hit && !card.contains(hit);
				const beside = window.innerWidth < 1024 ? true : c.left >= r.right - 1;
				const described = row.getAttribute('aria-describedby') === card.id;
				return ['inViewport=' + inView, 'pointerPassesThrough=' + passThrough, 'besideAtDesktop=' + beside, 'rowDescribedByCard=' + described];
			}`,
			expected: ['inViewport=true', 'pointerPassesThrough=true', 'besideAtDesktop=true', 'rowDescribedByCard=true']
		}
	]
};
