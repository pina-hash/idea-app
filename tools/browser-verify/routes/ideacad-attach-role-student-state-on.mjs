/**
 * THE STUDENT: none of it, and the counts that prove the selectors work.
 *
 * The whole block is inside the item inspector's one `{#if canManage}` and
 * carries a second gate of its own, and the page hands `ideacadAttach` down
 * only for a manager -- three independent reasons a student sees nothing, which
 * is the point rather than belt-and-braces. What this spec adds over the
 * server-render test beside it is that the absence holds in a REAL browser at
 * both widths, where a rule could have positioned a control off-screen rather
 * than removed it.
 *
 * THE POSITIVE CONTROL IS THE INSPECTOR ITSELF: zero, here, and one on the
 * teacher specs against the same fixture -- so a zero below cannot be a
 * harness that failed to render at all.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-attach?role=student&state=on',
	label: 'Blade editor switch: a student gets no part of it, on a schema-4 assignment',
	widths: WIDTHS,
	prepare: [{ waitFor: '() => typeof window.__attachControls === "function"' }],
	orderResult: [
		{
			label: 'every instructor affordance is absent, including the inspector that holds it',
			evaluate:
				'() => { const c = window.__attachControls(); return ["inspector " + c.inspector, "block " + c.block, "on " + c.on, "off " + c.off, "blocked " + c.blocked, "calls " + c.calls]; }',
			expected: ['inspector 0', 'block 0', 'on 0', 'off 0', 'blocked 0', 'calls 0']
		},
		{
			label: 'and the page itself is fine -- the room rendered, nothing overflows',
			evaluate: '() => window.__attachVerdicts()',
			expected: [
				'nothing is wider than the window ok',
				'the block never offers both directions at once ok'
			]
		}
	],
	presence: [
		{
			selector: '.cr-root',
			label: 'the room, which IS here -- the control for every zero above',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-attach-room"]',
			label: 'the harness itself rendered',
			expectPresent: 1,
			expectVisible: 1
		},
		{ selector: '[data-testid="item-inspector"]', label: 'the instructor inspector', expectPresent: 0 },
		{ selector: '[data-testid="insp-ideacad-attach"]', label: 'the Blade editor block', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-attach-on"]', label: 'the On control', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-attach-off"]', label: 'the Off control', expectPresent: 0 }
	],
	ignoreConsole: [
		'Failed to load resource: the server responded with a status of 401',
		'Failed to load resource: net::ERR_FAILED'
	]
};
