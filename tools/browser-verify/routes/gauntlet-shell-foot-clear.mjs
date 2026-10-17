/**
 * GAUNTLET'S LAST LINES SCROLL CLEAR OF THE FEEDBACK BUTTON (ledger 0396,
 * review polish round).
 *
 * Since this bundle the root layout's own feedback button floats in the
 * bottom-right corner of every GAUNTLET page, and the layout ends every page
 * with the trademark disclaimer and the centred build stamp. With only 1.5rem
 * of foot under the stamp, a phone scrolled to the end of a page drew the
 * button over it: measured at 375x812, the line at [80,771,215,10] and the
 * button at [192,740,167,48], 1029 square px of overlap and 28 of 63 hit-test
 * points across the stamp's text landing on the button (954 square px at 390).
 * The stamp's foot now takes the button's own clearance,
 * `--feedback-clear-block`, the home footer's rule, and stands 15px above the
 * button at every width.
 *
 * `/dev/gauntlet-shell` mounts `GauntletFoot`, the one component the layout
 * mounts there too, so this measures the foot the layout draws. `?foot=clear`
 * makes the page taller than any window; the probe scrolls to the end and
 * HIT-TESTS every line of both texts, which is the read that tells a covered
 * line from a clear one (an overlap of rectangles alone would credit a line
 * whose ink happens to fall either side of the button).
 */
export default {
	path: '/dev/gauntlet-shell?foot=clear',
	label: 'GAUNTLET: the trademark line and the version stamp scroll clear of the feedback button',
	presence: [
		{ selector: '.sfb-shell .sfb-trigger', label: 'the feedback button, floating in the corner', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.gt-tm', label: 'the trademark footer (the layout’s own foot)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.gt-version .version-badge', label: 'the version stamp', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'scrolled to the end, both lines of the foot answer their own hit tests and sit above the button',
			evaluate: `() => {
				window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
				const t = document.querySelector('.sfb-shell .sfb-trigger');
				const v = document.querySelector('.gt-version .version-badge');
				const tm = document.querySelector('.gt-tm p');
				if (!t || !v || !tm) return ['MISSING: button ' + !!t + ', stamp ' + !!v + ', trademark ' + !!tm];
				const b = t.getBoundingClientRect();
				const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); return [...r.getClientRects()].filter((x) => x.width > 0); };
				const covered = (el) => {
					let bad = 0, n = 0;
					for (const r of lines(el)) for (let i = 1; i <= 9; i++) {
						const h = document.elementFromPoint(r.left + (r.width * i) / 10, r.top + r.height / 2);
						n++;
						if (!h || !el.contains(h)) bad++;
					}
					return n === 0 ? 'NO TEXT' : bad === 0 ? 'clear' : bad + ' OF ' + n + ' POINTS COVERED';
				};
				const end = Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) <= 1;
				const vr = v.getBoundingClientRect();
				return [
					end ? 'at the end of the page' : 'NOT AT THE END',
					'version stamp ' + covered(v),
					'trademark line ' + covered(tm),
					vr.bottom <= b.top ? 'the stamp ends above the button' : 'THE STAMP ENDS ' + Math.round(vr.bottom - b.top) + 'PX INTO THE BUTTON'
				];
			}`,
			expected: ['at the end of the page', 'version stamp clear', 'trademark line clear', 'the stamp ends above the button']
		}
	]
};
