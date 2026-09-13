/**
 * A SCHEMA-3 ITEM: no control at all, and the reason standing where it would be.
 *
 * `ideacad_set_editor` raises 'This assignment already uses another work
 * surface. Remove it first.' for one of these, so a button here could only ever
 * produce a refusal -- and a control whose only possible answer is a refusal
 * must not be offered. WHAT MAKES THAT A RULE RATHER THAN A DEFECT is the
 * sentence: a block with a heading and nothing under it reads as a broken page,
 * which is the whole of `A CONTROL THAT IS ABSENT FOR A REASON SAYS THE
 * REASON`.
 *
 * THE ABSENCES RIDE BESIDE A POSITIVE CONTROL. `block 1` and a non-empty
 * `blockedText` are measured in the same read as the three zeroes, so a
 * selector that is simply wrong cannot pass for a control that is correctly
 * gone.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-attach?role=teacher&state=other',
	label: 'Blade editor switch: a ported worksheet gets no control and is told why',
	widths: WIDTHS,
	prepare: [{ waitFor: '() => typeof window.__attachControls === "function"' }],
	orderResult: [
		{
			label: 'the block is there, the controls are not, and a sentence stands in their place',
			evaluate:
				'() => { const c = window.__attachControls(); return ["block " + c.block, "blocked " + c.blocked, "on " + c.on, "off " + c.off, "state " + c.state, "said " + (c.blockedText.length > 20)]; }',
			expected: ['block 1', 'blocked 1', 'on 0', 'off 0', 'state 0', 'said true']
		},
		{
			label: 'and the block still fits where it sits',
			evaluate: '() => window.__attachVerdicts()',
			expected: [
				'nothing is wider than the window ok',
				'the block has a box ok',
				'the block sits inside the inspector ok',
				'every control and sentence sits inside the block ok',
				'every control clears the declared 24px floor ok',
				'no control stretches the whole block ok',
				'the block never offers both directions at once ok',
				'nothing is offered on a schema-3 item ok',
				'a sentence stands where the control would be ok'
			]
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'the room production is in', expectPresent: 1, expectVisible: 1 },
		{
			selector: '[data-testid="ideacad-attach-blocked"]',
			label: 'the reason the control is not here',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{ selector: '[data-testid="ideacad-attach-on"]', label: 'the On control', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-attach-off"]', label: 'the Off control', expectPresent: 0 }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-attach-blocked"]', label: 'the reason', min: 4.5 }
	],
	ignoreConsole: [
		'Failed to load resource: the server responded with a status of 401',
		'Failed to load resource: net::ERR_FAILED'
	]
};
