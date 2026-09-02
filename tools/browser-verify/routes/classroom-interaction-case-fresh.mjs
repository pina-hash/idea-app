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
 * on the tree that shipped it, and it stays green through the four-line
 * `Disclosure.svelte` fix the typing case is waiting on -- measured both ways,
 * see this bundle's history entry.
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
