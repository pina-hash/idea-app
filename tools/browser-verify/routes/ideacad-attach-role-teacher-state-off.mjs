/**
 * THE ORDINARY ASSIGNMENT: the control that did not exist until ledger 0223.
 *
 * WHAT THIS IS ACTUALLY MEASURING is reachability. `ideacad_set_editor` has
 * been applied since 0201 and no surface outside `src/routes/dev/` called it,
 * so the whole IdeaCAD subsystem was dead code behind a column nothing could
 * set. A spec that finds a labelled, on-screen, correctly-sized control here at
 * both widths is the evidence that it is not any more.
 *
 * AND THE GEOMETRY IS NOT DECORATION. This Chromium paints no scrollbar into a
 * screenshot at any colour, so a control past its container's edge is invisible
 * to the eye AND to every content check -- ledger 0201 found an 873px button
 * that way. The block sits inside an inspector inside a detail pane, which is
 * three nested containers deep, and only a geometric read tells a fitting
 * control from an overflowing one.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-attach?role=teacher&state=off',
	label: 'Blade editor switch: an ordinary assignment offers to turn it on',
	widths: WIDTHS,
	prepare: [{ waitFor: '() => typeof window.__attachControls === "function"' }],
	orderResult: [
		{
			label: 'the On control is offered, the Off control is not, and nothing has been called',
			evaluate:
				'() => { const c = window.__attachControls(); return ["block " + c.block, "on " + c.on, "off " + c.off, "blocked " + c.blocked, "calls " + c.calls]; }',
			expected: ['block 1', 'on 1', 'off 0', 'blocked 0', 'calls 0']
		},
		{
			label: 'pressing it calls setEditor once, with blade, and the teacher is told',
			evaluate:
				'() => window.__attachPressOn().then((c) => ["calls " + c.calls, "last " + c.lastCall, "notice " + c.notice, "error " + c.error, "reloads " + c.reloads])',
			expected: [
				'calls 1',
				'last setEditor(i-crowded, blade)',
				'notice 1',
				'error 0',
				'reloads 1'
			]
		},
		{
			label: 'the block and everything in it fits, and clears the declared floor',
			evaluate: '() => window.__attachVerdicts()',
			expected: [
				'nothing is wider than the window ok',
				'the block has a box ok',
				'the block sits inside the inspector ok',
				'every control and sentence sits inside the block ok',
				'every control clears the declared 24px floor ok',
				'no control stretches the whole block ok',
				'the block never offers both directions at once ok'
			]
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'the room production is in', expectPresent: 1, expectVisible: 1 },
		{
			selector: '[data-testid="insp-ideacad-attach"]',
			label: 'the Blade editor block',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-attach-on"]',
			label: 'the control that makes the subsystem reachable',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-attach-state"]',
			label: 'the sentence saying which state it is in',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-attach-off"]',
			label: 'the Off control, which must NOT be offered on an item that is already off',
			expectPresent: 0
		},
		{
			selector: '[data-testid="ideacad-attach-blocked"]',
			label: 'the schema-3 sentence, which does not belong here',
			expectPresent: 0
		}
	],
	contrast: [
		{ selector: '[data-testid="ideacad-attach-state"]', label: 'the state sentence', min: 4.5 }
	],
	/* 24px AND NOT 44px, AND THE SURFACE DECLARES IT. This is the classroom
	   inspector, which is one `{#if canManage}`; the named class carrying the
	   IDEA_INTERFACE_STANDARDS 10 instructor-density exemption is
	   `.cr-root .btn.tiny` in `classroom.css`, which every control in this
	   block wears. */
	tapTargets: [
		{ selector: '[data-testid="ideacad-attach-on"]', label: 'Turn the Blade editor on', min: 24 }
	],
	ignoreConsole: [
		/* THE FIXTURE'S OWN ATTACHMENT, not this surface's: the split fixture's
		   published assignment carries an attachment row and
		   `/api/classroom/attachment/a-2` answers 401 with no session. The same
		   two patterns are on every `classroom-inspector-*` spec. */
		'Failed to load resource: the server responded with a status of 401',
		'Failed to load resource: net::ERR_FAILED'
	]
};
