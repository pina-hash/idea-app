/**
 * THE ENTRY'S OWN PANEL ONCE THE BRACKET IS GENERATED (prompt 0110, item 6).
 *
 * Same panel, same entry, same captain as the open spec; the tournament is
 * `live`. Item 6 is "a contender renames their entry while the tournament
 * has not started, never after", and 0192 spells "started" as the bracket
 * being generated, with no host carve-out. So EVERY transport is still
 * supplied here and the panel renders NO control at all: the rename
 * control is replaced by the one sentence the server would answer with
 * (the absent-control-says-why rule), the row renames go with it, and
 * Remove / add-teammate are gone because the registration window has
 * closed. The roster itself still renders, which is the positive control
 * for the five absences.
 */
export default {
	path: '/dev/tournaments?view=team&state=live',
	label: 'Entry team panel, bracket generated: no control at all, and the lock sentence where Rename was',
	settleMs: 700,
	presence: [
		{ selector: '[data-testid="entry-team"]', label: 'the panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="entry-team"][data-locked="true"][data-window="false"]', label: 'the panel reports locked, outside the window', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="entry-lock"]', label: 'the lock sentence where Rename was', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.team .roster .row', label: 'two registrant rows still render (positive control)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '.team .m-name', label: 'both names', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-action="rename-entry"]', label: 'no Rename on the entry once live', expectPresent: 0 },
		{ selector: '[data-action="rename-member"]', label: 'no Rename on any row once live', expectPresent: 0 },
		{ selector: '[data-action="remove-member"]', label: 'no Remove outside the window', expectPresent: 0 },
		{ selector: '[data-form="add-member"]', label: 'no add-teammate form outside the window', expectPresent: 0 },
		{ selector: '[data-testid="entry-full"]', label: 'no full sentence either: the add row is gone, not full', expectPresent: 0 },
		{ selector: '.team button, .team input, .team a', label: 'controls on the locked panel (none: every transport is supplied and every gate is shut)', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="entry-lock"]', label: 'the one sentence, in the server\'s words', must: ['Entry names lock once the bracket is generated.'] },
		{ selector: '.team .roster', label: 'the roster still names both registrants', must: ['Azad', 'Diego'] },
		{ selector: '[data-testid="entry-team"]', label: 'no control word on the locked panel', mustNot: ['Rename', 'Remove', 'Leave', 'Add a teammate'], must: ['Registrants'] }
	],
	orderResult: [
		{
			/* The two flags the panel derives are the two rules 0192 states,
			   read off the element rather than inferred from what rendered. */
			evaluate: () => {
				const p = document.querySelector('[data-testid="entry-team"]');
				if (!p) return ['panel:MISSING'];
				return ['locked:' + p.dataset.locked, 'window:' + p.dataset.window, 'controls:' + p.querySelectorAll('button, input, a').length];
			},
			expected: ['locked:true', 'window:false', 'controls:0'],
			label: 'locked and out of the window, with zero controls'
		}
	],
	contrast: [
		{ selector: '.team .head .name', label: 'the entry name', min: 4.5 },
		{ selector: '[data-testid="entry-lock"]', label: 'the lock sentence', min: 4.5 },
		{ selector: '.team .roster-label', label: 'the roster label (mono, dim)', min: 4.5 },
		{ selector: '.team .m-name', label: 'registrant names', min: 4.5 },
		{ selector: '.team .tag', label: 'row tags', min: 4.5 }
	]
};
