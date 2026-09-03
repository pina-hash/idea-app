/**
 * THE ARRIVAL STATE, which is the half of IDEA_INTERFACE_STANDARDS 1 that is
 * NOT broken and must not become broken while the other half is fixed.
 *
 * `classroom-interaction-case-typing.mjs` is the defect: a panel folding under
 * somebody's hands mid-keystroke. The rule it violates is about arrival --
 * reading is expanded the first time and out of the way once the work has
 * started -- and the cheapest wrong fix for the typing collapse is to stop the
 * signal reaching the panel at all, which would pass that check and silently
 * delete this behaviour with nothing anywhere reporting it.
 *
 * So this case answers NOTHING in the assignment and asserts the opposite
 * state: on a fresh item every panel is open and the work is reachable. Green
 * on the tree that shipped it, and green through the `Disclosure.svelte` fix
 * prompt 0018 landed -- measured both ways.
 *
 * ============================================================================
 * WHAT THIS FILE CANNOT DO, STATED HERE BECAUSE ITS HEADER USED TO CLAIM IT.
 * ============================================================================
 * The paragraph above says the cheapest wrong fix is to stop the signal
 * reaching the panel, and that this case refuses it. IT DOES NOT AND CANNOT.
 * Measured twice -- by prompt 0018 and again by prompt 0023 -- with
 * `Disclosure`'s `collapsed` forced to `false` so `collapseWhen` is ignored
 * outright: both browser cases came back 0 outside threshold, at both widths.
 *
 * The fixture is the reason, not the assertions. `?case=fresh` answers
 * nothing, so every `collapseWhen` on this page is ALREADY false at arrival --
 * and "all three panels are open" is the same reading whether a false signal
 * was honoured or no signal was read at all. No row written against this page
 * can separate them, and none should be added here in the belief that it can.
 *
 * THE GUARD LIVES ON `classroom-interaction-case-typing.mjs`, whose fixture
 * answers one of the two constrained blocks, so two panels arrive with
 * `collapseWhen` genuinely TRUE. Its `arrival:` row measures exactly the three
 * values this file measures, at the one moment they differ, and reddens on the
 * mutation this file is blind to. See that file for the three-state table.
 *
 * WHAT THIS FILE IS STILL FOR, and it is not nothing: the ARRIVAL rule's other
 * direction. A fix that closed a panel on a fresh item -- nothing started,
 * nothing to be out of the way of -- would pass the typing case and redden
 * here. That is a real guarantee and this is the only surface that holds it.
 */
export default {
	path: '/dev/classroom-interaction?case=fresh',
	label: 'Classroom item, nothing started: every reading panel arrives expanded',
	prepare: [
		{
			click: 'textarea#tf-tf1',
			until: '() => document.activeElement === document.querySelector("textarea#tf-tf1")',
			attempts: 12,
			waitMs: 250
		}
	],
	orderResult: [
		{
			evaluate: `() => {
				const at = (id) => {
					const el = document.querySelector('[data-testid="' + id + '"]');
					return id + '=' + (el ? el.getAttribute('aria-expanded') : 'absent');
				};
				return [at('module-body'), at('module-instructions'), at('item-body-disclosure')];
			}`,
			expected: ['module-body=true', 'module-instructions=true', 'item-body-disclosure=true'],
			label: 'nothing entered: the module, its instructions and the item body all arrive open'
		}
	],
	presence: [
		{ selector: 'textarea.answer', label: 'both answer fields, reachable from the first frame', expectPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="module-instructions"]', label: 'the instructions disclosure', expectPresent: 1, expectVisible: 1 }
	],
	/* The trigger is the shared `Disclosure` control, which carries its own
	   44px floor; measured here because this harness is the first place it is
	   driven on a classroom item page. */
	tapTargets: [
		{ selector: '[data-testid="module-instructions"]', label: 'instructions disclosure trigger', min: 44 }
	],
	contrast: [{ selector: '.probes span', label: 'harness probe readout', min: 4.5 }]
};
