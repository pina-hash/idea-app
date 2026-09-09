export default {
	path: '/dev/grading-rubric?state=edited',
	label: 'Rubric editor open, one description rewritten, short line left alone (0106)',
	aliasOf: '/dev/grading-rubric',
	/* THE REPORTED SEQUENCE, DRIVEN. Open the editor, rewrite one level's
	   description, and stop there -- which is exactly what Mr. Cosso did on
	   2026-09-08, twice. Before this bundle there was no short-line input to
	   find and no flag to raise: the description changed, the save landed, and
	   the grading console went on showing a sentence about sourcing over a
	   description about selection reasoning, with nothing anywhere saying so.

	   The first click's `until` is the short-line input arriving, which is
	   something ONLY the click can produce (the resting spec asserts zero of
	   them), so the step cannot short-circuit on a state the page already had. */
	prepare: [
		{
			click: '[data-testid="builder-pane"] .rubric-builder .actions .btn:has-text("Edit rubric")',
			until:
				"() => document.querySelectorAll('[data-testid=\"builder-pane\"] input.level-short').length === 10"
		},
		{
			/* Index 4 is the top level of the SECOND criterion -- the one the
			   real diff rewrote. Set-then-dispatch is what a person typing
			   produces as far as the binding is concerned. */
			evaluate:
				"() => { const el = document.querySelectorAll('[data-testid=\"builder-pane\"] input.level-desc')[4]; el.value = 'Every component given a solid logical selection basis'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; }",
			until:
				"() => document.querySelectorAll('[data-testid=\"level-short-stale\"]').length === 1"
		}
	],
	presence: [
		{ selector: '[data-testid="builder-pane"] input.level-short', label: 'a short-line input per level, seeded from the store', expectPresent: 10, maxPresent: 10 },
		{ selector: '[data-testid="builder-pane"] input.level-desc', label: 'a description input per level', expectPresent: 10, maxPresent: 10 },
		/* EXACTLY ONE, on the level whose description moved. A flag on every
		   level would be noise nobody reads, and a flag on the wrong level is
		   worse than none. */
		{ selector: '[data-testid="level-short-stale"]', label: 'stale-short flag on the edited level only', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{
			selector: '[data-testid="builder-pane"] .rubric-builder .editor',
			label: 'the editor says which line a grader reads and which one settles it',
			must: ['grading console', 'students read', 'settles a disagreement'],
			mustNot: ['undefined']
		},
		{
			selector: '[data-testid="level-short-stale"]',
			label: 'the flag names the level and both ways out of it',
			must: ['Level 1', 'Rewrite the short line', 'clear it']
		}
	],
	contrast: [
		{ selector: '[data-testid="level-short-stale"]', label: 'stale-short warning copy', min: 4.5 },
		{ selector: '[data-testid="builder-pane"] .rubric-builder .rule', label: 'the editor rule copy', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="builder-pane"] .rubric-builder .editor .actions .btn', label: 'editor controls (Add criterion / Save rubric / Cancel)', min: 24 }
	],
	ignoreConsole: ['ERR_CONNECTION_RESET', 'ERR_BLOCKED_BY_CLIENT']
};
