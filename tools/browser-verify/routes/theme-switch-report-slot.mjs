/**
 * REPORT IS ON SCREEN IN THE CLASSROOM HEADER AT EVERY WIDTH (report 30,
 * 2026-09-25), measured in the REAL `ClassroomShell` masthead beside the REAL
 * profile menu -- /dev/theme-switch is the one classroom harness that carries a
 * session, so it is the only place the row has been measured at its real
 * width, with the avatar and the pathway chip in it (100.6px).
 *
 * WHAT CHANGED. Below 1180px the header's tools fold behind one Menu button,
 * and Report used to fold with them: on a narrow window it was one press
 * inside Menu, which is where Mr. Pina found it ("I found the report button
 * under the menu ... the report button has to be immediately accessible") and
 * why the evening's other reports say it was missing. It has its own slot now,
 * OUTSIDE `.shell-tools`, before the profile menu.
 *
 * WHAT IS MEASURED, AND AT WHICH WIDTHS. Run it at 375, 871 (the width the
 * report was filed at) and 1440:
 *   - exactly one report control on the page, in the header's own slot and
 *     visible WITHOUT opening anything (no prepare step opens the Menu -- the
 *     absence of that step is the claim);
 *   - none inside the fold, with the slot's own control as the positive
 *     control beside the zero;
 *   - it is 44px and it HIT-TESTS TO ITSELF at its own centre, and the class
 *     row keeps at least one whole class icon beside it (the probe below);
 *   - its word, not only its glyph, and that word's contrast.
 *
 * AT 375 BOTH MENU AND REPORT STACK THEIR WORD UNDER THEIR GLYPH, because in
 * their row form (75.8px and 94.8px) the class row would have gone to nothing
 * beside the profile menu. The probe reads that the word is still on screen.
 */
export default {
	path: '/dev/theme-switch?report=slot',
	label: 'Classroom header: Report in its own slot at every width, never folded into Menu',
	prepare: [
		{
			waitFor: '() => { const t = document.querySelector(".shell-report .sfb-trigger"); return !!t && t.getBoundingClientRect().height > 0 && !!document.querySelector(".pm-trigger"); }',
			timeoutMs: 20000,
			label: 'the header and its profile menu have painted'
		}
	],
	presence: [
		{ selector: '.cr-header .shell-report .sfb-trigger', label: 'Report, in its own header slot, visible with nothing opened', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.sfb-trigger', label: 'exactly one report control on the page (no floating pill besides)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.shell-tools .sfb-trigger', label: 'none inside the tools the Menu folds (the slot above is the positive control)', expectPresent: 0 },
		{ selector: '.pm-trigger', label: 'the profile menu beside it (the row is measured at its real width)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '.shell-report .sfb-trigger', label: 'the control carries its word, not only its glyph', must: ['Report'] }
	],
	contrast: [
		{ selector: '.shell-report .sfb-word', label: 'the Report word in the header', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.shell-report .sfb-trigger', label: 'the Report control', min: 44 }
	],
	orderResult: [
		{
			/* THREE FACTS, EACH READ OFF THE PAGE AT THIS WIDTH, never a flag the
			   page exposes: Report answers a tap at its own centre (a hit test, the
			   only read that tells a covered control from a clickable one), its word
			   is painted inside its own box rather than clipped, and at least one
			   class icon sits wholly inside the class row's visible box. */
			label: 'Report hit-tests to itself, its word is inside its box, and a whole class icon is still on screen',
			evaluate: `() => {
				const t = document.querySelector('.shell-report .sfb-trigger');
				if (!t) return ['NO REPORT CONTROL'];
				const r = t.getBoundingClientRect();
				const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				const w = t.querySelector('.sfb-word').getBoundingClientRect();
				const wordInside = w.width > 0 && w.left >= r.left - 0.5 && w.right <= r.right + 0.5 && w.top >= r.top - 0.5 && w.bottom <= r.bottom + 0.5;
				const strip = document.querySelector('[data-testid="class-strip"]').getBoundingClientRect();
				const whole = [...document.querySelectorAll('[data-testid="class-icon"]')].filter((i) => {
					const b = i.getBoundingClientRect();
					return b.width > 0 && b.left >= strip.left - 0.5 && b.right <= strip.right + 0.5;
				}).length;
				return [
					hit && t.contains(hit) ? 'report answers at its centre' : 'COVERED at its centre',
					wordInside ? 'word inside the control' : 'WORD CLIPPED',
					whole >= 1 ? 'a whole class icon on screen' : 'NO WHOLE CLASS ICON'
				];
			}`,
			expected: ['report answers at its centre', 'word inside the control', 'a whole class icon on screen']
		}
	]
};
