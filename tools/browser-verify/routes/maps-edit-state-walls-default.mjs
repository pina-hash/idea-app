export default {
	path: '/dev/maps-edit?state=walls-default',
	label:
		'Maps editor, the BUILDING-LEVEL DEFAULT field on its own mount -- the second half of 0224 unsaved-work coverage',
	/* WHY THIS IS A WHOLE SECOND STATE FOR ONE ASSERTION. The save state is
	   one-way: once a form is dirty it stays dirty, so a second field measured
	   on a mount some other probe has already touched reads `dirty` whatever
	   it does. That is a pass that means nothing, and it is exactly the shape
	   of false clean this directory's README warns about -- so the two wall
	   fields get one mount each rather than sharing one and pretending.

	   `?state=walls` and `?state=walls-default` open the SAME node on the SAME
	   fixture. Nothing else differs, which is the point: everything this file
	   asserts about the default field, that one asserts about the other, and
	   the two answers are directly comparable. */
	presence: [
		{
			selector: '[data-testid="maps-node-walls"] input',
			label: 'both wall fields are here, exactly as on ?state=walls',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		}
	],
	orderResult: [
		{
			label:
				'TYPING A BUILDING-LEVEL DEFAULT MARKS THE FORM DIRTY, so the unsaved-work guard can see it too',
			/* The default field is the one more likely to be forgotten in a
			   signature, because it is the unusual one: it is not this node's
			   own wall and it changes nothing about how this node draws. A
			   number that silently fails to save is worse here than on the
			   other field, because its effect is on every descendant and the
			   author would go looking at the descendants for the fault. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const FIELD = 'input[id$="-wall-default"]';
				const ind = () => q('.save-ind');
				const state = () =>
					ind() ? [...ind().classList].find((c) => c !== 'save-ind' && !c.startsWith('svelte-')) : 'absent';
				const set = (v) => {
					const el = q(FIELD);
					el.value = v;
					el.dispatchEvent(new Event('input', { bubbles: true }));
				};
				const atRest = state();
				const was = q(FIELD).value;
				// THE CONTROL, on this same field: an input event that changes
				// nothing must leave the indicator absent. Without it, "it went
				// dirty" is consistent with a form that dirties on any event.
				set(was);
				await new Promise((r) => setTimeout(r, 500));
				const afterNoop = state();
				set('4');
				let went = 'NEVER WENT DIRTY';
				for (let i = 0; i < 40; i += 1) {
					if (state() === 'dirty') { went = 'dirty after ' + (i + 1) + ' poll(s)'; break; }
					await new Promise((r) => setTimeout(r, 50));
				}
				set(was);
				await new Promise((r) => setTimeout(r, 120));
				console.info('[walls-default] rest=' + atRest + ' noop=' + afterNoop + ' changed=' + went);
				return [
					atRest === 'absent' ? 'at rest the indicator is absent' : 'AT REST IT SAID ' + atRest,
					afterNoop === 'absent' ? 'CONTROL: an input event that changes nothing leaves it absent' : 'CONTROL FAILED: a no-op input went ' + afterNoop,
					went.startsWith('dirty') ? 'and a real change to the default field goes dirty' : 'THE DEFAULT FIELD DID NOT: ' + went
				];
			}`,
			expected: [
				'at rest the indicator is absent',
				'CONTROL: an input event that changes nothing leaves it absent',
				'and a real change to the default field goes dirty'
			]
		}
	]
};
