/**
 * PROGRESSIVE FEEDBACK, THE STUDENT'S SIDE, MEASURED (0238, decision 60).
 *
 * The real worksheet frame on the real `/hx/feedback` fixture (which reports
 * its answer boxes with `idea:field-box`), the real `FeedbackPanel` over the
 * in-memory twin of 0238's functions. What this settles that no other
 * instrument can:
 *
 *   - THE PINS ARE BESIDE THE RIGHT ANSWERS. A pin is placed from a rectangle
 *     the DOCUMENT reported, so only a real browser running the real document
 *     can say it landed where the box is. Two open notes have boxes (the
 *     reflection and the photo); the team-name note is resolved and has none.
 *   - THE DRAWING IS OVER THE PICTURE, inside the picture's own box.
 *   - EVERY CONTROL CLEARS 44px (this is a student surface at every width) and
 *     the note's words clear 4.5:1 on the room's ground.
 *   - A STUDENT HAS NO INSTRUCTOR CONTROL, beside the positive control that
 *     the student's own keys are there.
 */
export default {
	path: '/dev/progressive-feedback',
	label: 'Progressive feedback: the notes beside a student\'s worksheet',

	prepare: [
		{
			waitFor: `() => document.querySelectorAll('[data-testid="hx-note-pin"]').length >= 2`,
			attempts: 60,
			gapMs: 250
		}
	],
	settleMs: 400,

	presence: [
		{ selector: '[data-testid="feedback-panel"]', label: 'the notes list', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="feedback-open-list"] [data-testid="feedback-thread"]', label: 'two open notes', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="hx-note-pin"]', label: 'a pin per open note with a box', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="feedback-fixed"]', label: 'Fixed it on each open note', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="feedback-compose"]', label: 'no composer for a student', expectPresent: 0 },
		{ selector: '[data-testid="feedback-resolve"]', label: 'no Resolve for a student', expectPresent: 0 },
		{ selector: '[data-testid="feedback-remove"]', label: 'no Remove note for a student', expectPresent: 0 },
		{ selector: '[data-testid="hx-annotate-over"], [data-testid="hx-annotate-row"]', label: 'no drawing key for a student', expectPresent: 0 }
	],

	tapTargets: [
		{ selector: '[data-testid="hx-note-pin"]', label: 'a pin beside an answer', min: 44 },
		{ selector: '[data-testid="feedback-thread"] .btn', label: 'a note\'s keys', min: 44 }
	],

	contrast: [
		{ selector: '[data-testid="feedback-thread"] .fb-body', label: 'a note\'s words', min: 4.5 },
		{ selector: '[data-testid="feedback-thread"] .fb-place', label: 'where a note is', min: 4.5 },
		{ selector: '[data-testid="feedback-status"]', label: 'a note\'s status word', min: 4.5 },
		{ selector: '[data-testid="hx-note-pin"] span', label: 'a pin\'s word', min: 4.5 }
	],

	orderResult: [
		{
			label: 'each pin sits at the top of its own answer box, beside it, inside the frame',
			evaluate: `() => {
				const frame = document.querySelector('[data-hx-frame]');
				const fr = frame ? frame.getBoundingClientRect() : null;
				return [...document.querySelectorAll('[data-testid="hx-note-pin"]')].map((p) => {
					const r = p.getBoundingClientRect();
					const inside = fr && r.left >= fr.left - 0.5 && r.right <= fr.right + 0.5;
					return p.getAttribute('data-hx-note-field') + ':' + (inside ? 'inside' : 'outside');
				}).sort();
			}`,
			expected: ['photo:inside', 'reflection:inside']
		},
		{
			label: "the drawing is laid over the picture, inside the picture's own box",
			evaluate: `() => {
				const over = document.querySelector('.hx-image-over');
				const layer = over ? over.querySelector('[data-testid="mark-layer"]') : null;
				if (!over || !layer) return ['no drawing over the picture'];
				const a = over.getBoundingClientRect();
				const b = layer.getBoundingClientRect();
				const within = b.left >= a.left - 1 && b.top >= a.top - 1 && b.right <= a.right + 1 && b.bottom <= a.bottom + 1;
				return ['shapes=' + layer.getAttribute('data-shapes'), 'within=' + within];
			}`,
			expected: ['shapes=3', 'within=true']
		}
	]
};
