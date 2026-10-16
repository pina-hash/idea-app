/* NO `order` EXPORT -- see routes.mjs. */

/**
 * THE GRADING FRAME CANNOT GET STUCK (ledger 0392, report c2a5260e): "when i
 * scroll down a certain way it gets stuck up and the bottom half of the screen
 * is blank and i cant scroll back up. this tends to happen when im scrolling
 * through html assignments."
 *
 * THE CAUSE, MEASURED BEFORE THE FIX on this route at 1920x912: with a ported
 * worksheet open, `.cr-app` (the 100dvh column the console lives in) measured
 * a scrollHeight of 1019 in a clientHeight of 912 and was `overflow: hidden`,
 * which is still a scroll container. A script scroll (a focus, a
 * `scrollIntoView`, find-in-page) moved it to 107, the footer rose under the
 * console with the window blank beneath it, and a wheel over the work did
 * nothing, because `hidden` is not user-scrollable and every pane is
 * `overscroll-behavior: contain`. The fix makes the frame `overflow: clip`,
 * which is not a scroll container at all.
 *
 * THE PROBE ASKS THE SAME QUESTION AT EVERY WIDTH: try to scroll the frame by
 * script, three ways, and read its position back. Below 1024px the frame is an
 * ordinary block (no fixed height), which is also not a scroll container, so
 * the expected words are the same at 375 and 1440.
 */
import { WIDTHS } from './_shared.mjs';

const CANNOT_SCROLL = `() => {
	const app = document.querySelector('.cr-app');
	if (!app) return ['NO .cr-app FRAME ON THE PAGE'];
	const ov = getComputedStyle(app).overflowY;
	const out = [];
	out.push(ov === 'clip' || ov === 'visible' ? 'the frame is not a scroll container' : 'THE FRAME IS A SCROLL CONTAINER (overflow-y ' + ov + ')');
	app.scrollTop = 400;
	document.querySelector('iframe')?.scrollIntoView({ block: 'end', behavior: 'instant' });
	document.querySelector('.grade-actions')?.scrollIntoView({ block: 'start', behavior: 'instant' });
	out.push(app.scrollTop === 0 ? 'three script scrolls left it at the top' : 'THE FRAME MOVED TO ' + app.scrollTop);
	out.push(window.scrollY === 0 || innerWidth < 1024 ? 'the window did not move above the breakpoint' : 'THE WINDOW MOVED TO ' + window.scrollY);
	return out;
}`;

export default {
	path: '/dev/html-assignment-grading?state=frame-clip',
	aliasOf: '/dev/html-assignment-grading',
	label: 'Grading console: the 100dvh frame cannot be scrolled out from under the console',
	widths: WIDTHS,
	prepare: [
		{ waitFor: `() => document.querySelectorAll('.roster-row').length > 0`, label: 'the roster has loaded' },
		{
			click: '.roster-row',
			until: `() => !!document.querySelector('.hx-frame-wrap iframe') && !!document.querySelector('.grade-actions')`,
			label: 'open the first student, so the worksheet frame and the rubric dock are mounted'
		}
	],
	presence: [
		{ selector: '.hx-frame-wrap iframe', label: 'the worksheet frame (the surface the report names)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="grade-return"]', label: 'Return to student, still on screen after the scroll attempts', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'no script scroll can move the console frame',
			evaluate: CANNOT_SCROLL,
			expected: [
				'the frame is not a scroll container',
				'three script scrolls left it at the top',
				'the window did not move above the breakpoint'
			]
		}
	]
};
