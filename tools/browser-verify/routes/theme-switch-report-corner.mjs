/**
 * THE FEEDBACK BUTTON ON A CLASSROOM PAGE, DEFAULT THEME (ledger 0396): the
 * page's corner button, the same place as on the home page, never folded and
 * never in the header. Run it at 375, 871 (the width report 30 was filed at)
 * and 1440. See `_corner-feedback.mjs` for what is measured and why.
 */
import { CORNER_FEEDBACK_EXPECTED, CORNER_FEEDBACK_PRESENCE, CORNER_FEEDBACK_PROBE } from './_corner-feedback.mjs';

export default {
	path: '/dev/theme-switch?report=corner',
	label: 'Classroom page: the feedback button in the page corner at every width, never in the header',
	prepare: [
		{
			waitFor: '() => { const t = document.querySelector(".sfb-shell .sfb-trigger"); return !!t && t.getBoundingClientRect().height > 0 && !!t.closest(".cr-plate") && !!document.querySelector(".pm-trigger"); }',
			timeoutMs: 20000,
			label: 'the header, its profile menu and the plated corner button have painted'
		}
	],
	presence: CORNER_FEEDBACK_PRESENCE,
	textContains: [{ selector: '.sfb-shell .sfb-trigger', label: 'the button carries its word, not only its glyph', must: ['Send feedback'] }],
	contrast: [{ selector: '.sfb-shell .sfb-word', label: 'the button word', min: 4.5 }],
	tapTargets: [{ selector: '.sfb-shell .sfb-trigger', label: 'the feedback button', min: 44 }],
	orderResult: [
		{
			label: 'the button hit-tests to itself, its word is inside it, it is in the corner in the plate key, and a whole class icon is still on screen',
			evaluate: CORNER_FEEDBACK_PROBE,
			expected: CORNER_FEEDBACK_EXPECTED
		}
	]
};
