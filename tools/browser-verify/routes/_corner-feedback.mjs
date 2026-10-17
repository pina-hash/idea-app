/**
 * THE FEEDBACK BUTTON IS THE PAGE'S CORNER BUTTON ON A CLASSROOM PAGE (ledger
 * 0396, Mr. Pina: "the location of its buttons are identical everywhere"),
 * measured in the REAL `ClassroomShell` masthead beside the REAL profile menu
 * on /dev/theme-switch, the one classroom harness that carries a session.
 *
 * It replaced the header's own Report slot (report 30, 2026-09-25), which
 * these two specs measured until then under the name `report=slot`: a slot
 * outside the Menu's fold, so the control was never one press away. The corner
 * button is never folded either, and it is in the same place on every page.
 *
 * `_`-prefixed: a helper module, not a route spec.
 */
export const CORNER_FEEDBACK_PRESENCE = [
	{ selector: '.sfb-shell .sfb-trigger', label: 'the feedback button, in the page corner, visible with nothing opened', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
	{ selector: '.sfb-trigger', label: 'exactly one feedback control on the page', expectPresent: 1, maxPresent: 1 },
	{ selector: '.cr-header .sfb-trigger', label: 'none in the header (the corner button above is the positive control)', expectPresent: 0 },
	{ selector: '.pm-trigger', label: 'the profile menu in the header (the row is measured at its real width)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
];

/*
 * FOUR FACTS, EACH READ OFF THE PAGE AT THIS WIDTH: the button answers a tap at
 * its own centre (a hit test, the only read that tells a covered control from a
 * clickable one), its word is inside its own box, it sits in the corner the
 * home page's does (12px in at the desktop sizes, 16px and 24px up on a phone),
 * and it wears the classroom's plate key, the home page's shape, rather than the
 * unplated pill. The class row keeps a whole class icon too, now with one
 * control fewer beside it.
 */
export const CORNER_FEEDBACK_PROBE = `() => {
	const t = document.querySelector('.sfb-shell .sfb-trigger');
	if (!t) return ['NO FEEDBACK BUTTON'];
	const r = t.getBoundingClientRect();
	const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
	const w = t.querySelector('.sfb-word').getBoundingClientRect();
	const wordInside = w.width > 0 && w.left >= r.left - 0.5 && w.right <= r.right + 0.5 && w.top >= r.top - 0.5 && w.bottom <= r.bottom + 0.5;
	const phone = window.innerWidth <= 480;
	const right = Math.round(window.innerWidth - r.right);
	const bottom = Math.round(window.innerHeight - r.bottom);
	const corner = phone ? right === 16 && bottom === 24 : right === 12 && bottom === 12;
	const plated = !!t.closest('.cr-plate') && getComputedStyle(t).borderTopLeftRadius === '11px';
	const strip = document.querySelector('[data-testid="class-strip"]').getBoundingClientRect();
	const whole = [...document.querySelectorAll('[data-testid="class-icon"]')].filter((i) => {
		const b = i.getBoundingClientRect();
		return b.width > 0 && b.left >= strip.left - 0.5 && b.right <= strip.right + 0.5;
	}).length;
	return [
		hit && t.contains(hit) ? 'feedback answers at its centre' : 'COVERED at its centre',
		wordInside ? 'word inside the control' : 'WORD CLIPPED',
		corner ? 'in the corner' : 'NOT IN THE CORNER (right ' + right + ', bottom ' + bottom + ')',
		plated ? 'the plate key' : 'NOT THE PLATE KEY',
		whole >= 1 ? 'a whole class icon on screen' : 'NO WHOLE CLASS ICON'
	];
}`;

export const CORNER_FEEDBACK_EXPECTED = [
	'feedback answers at its centre',
	'word inside the control',
	'in the corner',
	'the plate key',
	'a whole class icon on screen'
];
