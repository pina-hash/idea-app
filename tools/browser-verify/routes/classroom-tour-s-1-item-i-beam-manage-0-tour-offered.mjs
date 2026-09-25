/**
 * WORK MAKES ITS OWN ROOM (ledger 0298, report 25): "they never really make
 * room for it, they don't hide the left hand classroom browser". On a spec
 * assignment or a ported HTML worksheet the class list now opens PUT AWAY,
 * unless this person has pressed the control before; the control is a labelled
 * button beside the item's title; and what is stored is the person's CHOICE,
 * never the state on screen (the Disclosure rule).
 *
 * Measured on the REAL ClassroomShell, ClassSplit, ClassView and ItemDetail in
 * /dev/classroom-tour, whose item load returns the same keys the real item
 * load does (`spec` / `engine` / `htmlAssignment`), so the default is read the
 * way the shipping route reads it. A STUDENT, the tour already offered so
 * nothing sits under the header, on `i-beam` (a spec assignment, `engine.spec`).
 * The teacher's twin, which never presses anything, is
 * classroom-tour-s-1-item-i-tonight-manage-1-tour-offered.mjs.
 *
 * THE WALK, above 1024px, in order:
 *   1. i-beam, never chose: collapsed, the button says Show class list, the
 *      list pane is not painted and the item spans the split; the button sits
 *      on the title's own line straight after it and answers a tap at its
 *      centre; nothing is stored;
 *   2. pressed: the list comes back, the button says Hide class list, and the
 *      slot holds '0' (an explicit expand is WRITTEN, because "never chose"
 *      is the third answer);
 *   3. i-tonight (a ported HTML worksheet) and i-reference (a material),
 *      reached through the list: both keep the list, because the choice wins.
 * Below 1024px the control is not on screen (the split already shows the item
 * alone), nothing is pressed, and the verdict says so in the same words.
 *
 * AND THE HEADER: Report still answers a tap at its own centre on this page.
 */
import { TOUR_READY } from './_classroom-tour.mjs';

const KEY = 'idea:classnav-collapsed:1:anon';

export default {
	path: '/dev/classroom-tour/s-1/item/i-beam?manage=0&tour=offered',
	label: 'Class list: put away on a spec assignment by default, a labelled button beside the title, the choice stored and winning',
	prepare: [
		{ ...TOUR_READY, waitFor: `() => !!document.querySelector('[data-testid="class-detail-pane"] h1') && typeof window.__tourProbe === 'function'` },
		{
			label: 'read the default, press, and open two more items through the list',
			evaluate: `async () => {
				const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
				const q = (s) => document.querySelector(s);
				const toggle = () => q('[data-testid="nav-collapse-toggle"]');
				const w = (el) => (el ? el.getBoundingClientRect().width : 0);
				const listShown = () => { const n = q('[data-testid="class-nav-pane"]'); return !!n && getComputedStyle(n).display !== 'none' && w(n) > 0; };
				const state = () => (toggle()?.getAttribute('aria-pressed') === 'true' ? 'collapsed' : 'expanded');
				const word = () => (toggle()?.querySelector('.nav-toggle-label')?.textContent ?? '').trim();
				const open = async (id) => {
					const a = q('a[href$="/item/' + id + '"]');
					if (!a) return false;
					a.click();
					for (let i = 0; i < 40 && !location.pathname.endsWith('/item/' + id); i++) await sleep(100);
					await sleep(600);
					return location.pathname.endsWith('/item/' + id);
				};
				const bad = [];
				const log = [];
				const t = toggle();
				const detail = q('[data-testid="class-detail-pane"]');
				if (!t || w(t) === 0) {
					log.push('below 1024px: no control on screen, list ' + (listShown() ? 'shown' : 'hidden') + ', item ' + Math.round(w(detail)) + 'px');
					if (listShown() || w(detail) === 0) bad.push('the item is not alone');
					/* In the DOM, hidden by CSS: its state is still the shell's decision. */
					if (t?.getAttribute('aria-pressed') !== 'true') bad.push('default not put away: ' + t?.getAttribute('aria-pressed'));
					if (localStorage.getItem('${KEY}') !== null) bad.push('stored with no press');
					window.__navA = bad.join('; ') || 'none';
					return log.join('; ');
				}
				/* 1. never chose, on a spec assignment */
				const title = q('.crumbs [aria-current="page"]');
				const tb = t.getBoundingClientRect();
				const hb = title.getBoundingClientRect();
				const gap = tb.left - hb.right;
				const sameLine = tb.top < hb.bottom && tb.bottom > hb.top;
				const hitT = document.elementFromPoint(tb.x + tb.width / 2, tb.y + tb.height / 2);
				const split = q('.cr-split');
				log.push('i-beam: ' + state() + ' "' + word() + '", list ' + (listShown() ? 'shown' : 'hidden') + ', item ' + Math.round(w(detail)) + ' of ' + Math.round(w(split)) + 'px, button ' + Math.round(tb.width) + 'x' + Math.round(tb.height) + ' starting ' + Math.round(gap) + 'px after the title');
				if (state() !== 'collapsed' || word() !== 'Show class list' || listShown()) bad.push('default ' + state() + ' ' + word());
				if (w(detail) < 0.9 * w(split)) bad.push('item ' + w(detail) + ' of ' + w(split));
				if (!(sameLine && gap >= 0 && gap <= 32)) bad.push('not beside the title: gap ' + gap + ', same line ' + sameLine);
				if (!hitT || !t.contains(hitT)) bad.push('button covered at its centre');
				/* The 44px floor, read here rather than as a tap-target row: below
				   1024px the button has no box, and a row over it would read zero. */
				if (tb.height < 44 || tb.width < 44) bad.push('button ' + tb.width + 'x' + tb.height + ', under 44px');
				if (localStorage.getItem('${KEY}') !== null) bad.push('stored before any press');
				/* 2. pressed */
				t.click();
				await sleep(500);
				log.push('pressed: ' + state() + ' "' + word() + '", list ' + (listShown() ? 'shown' : 'hidden') + ', stored ' + JSON.stringify(localStorage.getItem('${KEY}')));
				if (state() !== 'expanded' || word() !== 'Hide class list' || !listShown()) bad.push('press ' + state());
				if (localStorage.getItem('${KEY}') !== '0') bad.push('stored ' + localStorage.getItem('${KEY}'));
				/* 3. the choice wins on a worksheet and on a material */
				for (const id of ['i-tonight', 'i-reference']) {
					if (!(await open(id))) { bad.push('could not open ' + id); continue; }
					log.push(id + ': ' + state() + ', list ' + (listShown() ? 'shown' : 'hidden'));
					if (state() !== 'expanded' || !listShown()) bad.push(id + ' ' + state());
				}
				window.__navA = bad.join('; ') || 'none';
				return log.join('; ');
			}`
		}
	],
	presence: [
		/* In the DOM at every width; on screen only where the split has two panes. */
		{ selector: '[data-testid="nav-collapse-toggle"]', label: 'the class list button (on screen above 1024px)', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 1 },
		{ selector: '.shell-report .sfb-trigger', label: 'Report, in its own header slot', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [{ selector: '[data-testid="nav-collapse-toggle"] .nav-toggle-label', label: 'the class list button word', min: 4.5 }],
	orderResult: [
		{
			label: 'the walk found nothing wrong, and Report answers a tap at its own centre',
			evaluate: `() => {
				const report = document.querySelector('.shell-report .sfb-trigger');
				const r = report ? report.getBoundingClientRect() : null;
				const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
				return [String(window.__navA), hit && report.contains(hit) ? 'report answers' : 'REPORT COVERED'];
			}`,
			expected: ['none', 'report answers']
		}
	]
};
