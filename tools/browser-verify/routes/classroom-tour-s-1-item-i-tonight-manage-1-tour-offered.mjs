/**
 * THE CLASS LIST'S DEFAULT, BOTH DIRECTIONS, FOR SOMEBODY WHO NEVER CHOSE
 * (ledger 0298, report 25). The student's twin
 * (classroom-tour-s-1-item-i-beam-manage-0-tour-offered.mjs) presses the
 * control and follows the choice; this one never presses anything and walks
 * four items through the list, as a TEACHER, so the manager's own payload key
 * (`spec`, where a student's is `engine.spec`) is the one read:
 *
 *   i-tonight    a ported HTML worksheet   -> the list put away
 *   i-reference  a material                -> the list on screen
 *   i-missing    an assignment with no spec -> the list on screen
 *   i-beam       a spec assignment         -> the list put away
 *
 * Nothing is stored at any point: the default is DERIVED, never written. Below
 * 1024px the control is not on screen and the item shows alone, whatever the
 * item.
 */
import { TOUR_READY } from './_classroom-tour.mjs';

const KEY = 'idea:classnav-collapsed:1:anon';

export default {
	path: '/dev/classroom-tour/s-1/item/i-tonight?manage=1&tour=offered',
	label: 'Class list default for a teacher who never chose: put away on a worksheet and a spec assignment, on screen for a material and a plain assignment',
	prepare: [
		{ ...TOUR_READY, waitFor: `() => !!document.querySelector('[data-testid="class-detail-pane"] h1') && typeof window.__tourProbe === 'function'` },
		{
			label: 'walk four items through the list, pressing nothing',
			evaluate: `async () => {
				const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
				const q = (s) => document.querySelector(s);
				const toggle = () => q('[data-testid="nav-collapse-toggle"]');
				const w = (el) => (el ? el.getBoundingClientRect().width : 0);
				const listShown = () => { const n = q('[data-testid="class-nav-pane"]'); return !!n && getComputedStyle(n).display !== 'none' && w(n) > 0; };
				const wide = innerWidth >= 1024;
				/* The control's own state is read at EVERY width: below 1024px it is
				   in the DOM and hidden by CSS, so aria-pressed still says what the
				   shell decided. What the list does is read separately: above 1024px
				   it is on screen exactly when the state is expanded; below it the
				   item is always alone. */
				const read = (id) => {
					const t = toggle();
					const pressed = t?.getAttribute('aria-pressed');
					const state = pressed === 'true' ? 'put away' : pressed === 'false' ? 'shown' : 'NO CONTROL';
					const consistent = wide ? listShown() === (pressed === 'false') && w(t) > 0 : !listShown() && w(t) === 0;
					if (!consistent) bad.push(id + ': list ' + (listShown() ? 'shown' : 'hidden') + ', control ' + Math.round(w(t)) + 'px wide');
					return id + ' ' + state;
				};
				const open = async (id) => {
					/* A link in the list, hidden or not: a hidden pane still holds
					   its anchors, and a click on one is an ordinary navigation. */
					const a = q('a[href$="/item/' + id + '"]');
					if (!a) return false;
					a.click();
					for (let i = 0; i < 40 && !location.pathname.endsWith('/item/' + id); i++) await sleep(100);
					await sleep(600);
					return location.pathname.endsWith('/item/' + id);
				};
				const bad = [];
				const seen = [read('i-tonight')];
				for (const id of ['i-reference', 'i-missing', 'i-beam']) seen.push((await open(id)) ? read(id) : id + ' NOT OPENED');
				window.__navB = { seen, bad, stored: localStorage.getItem('${KEY}') };
				return seen.join('; ') + '; stored ' + JSON.stringify(localStorage.getItem('${KEY}')) + (bad.length ? ' | FINDINGS: ' + bad.join('; ') : '');
			}`
		}
	],
	orderResult: [
		{
			label: 'worksheet and spec assignment put away, material and plain assignment shown, the list following the state at this width, nothing stored',
			evaluate: `() => {
				const b = window.__navB;
				if (!b) return ['NO WALK'];
				return [...b.seen, b.bad.join('; ') || 'list follows the state', String(b.stored)];
			}`,
			expected: ['i-tonight put away', 'i-reference shown', 'i-missing shown', 'i-beam put away', 'list follows the state', 'null']
		}
	]
};
