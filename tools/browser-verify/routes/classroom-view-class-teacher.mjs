// original array position 11 of 25 -- see ../README.md for what `order` means
export const order = 11;

export default {
	path: '/dev/classroom?view=class-teacher',
	label: 'Class stream composer, grading-category datalist (teacher)',
	/* This is the fixture side of a real 0142 gap: the harness mounted the
	   REAL ContentComposer but supplied no `loadCategorySuggestions`
	   transport, so the grading-category datalist never rendered here and
	   the pass measured nothing about it. `New post` opens the composer
	   (kind defaults to `post`, which carries no category field at all),
	   then the Assignment kind tab is what renders the "Grading category"
	   input the datalist attaches to. Both steps mirror
	   /dev/classroom-split's own compose-assignment-rubric route exactly. */
	prepare: [
		{
			click: '[data-testid="new-post"]',
			until: '() => !!document.querySelector(".composer-host .kind-toggle")'
		},
		{
			click: '.composer-host .kind-toggle .kind:has-text("Assignment")',
			until: '() => !!document.querySelector(".composer-host input[list]")'
		}
	],
	presence: [
		{ selector: '.composer-host .kind-toggle .kind.active', label: 'kind tab active (Assignment)', expectPresent: 1 },
		{ selector: '.composer-host input[list]', label: 'grading-category field carries a list attribute', expectPresent: 1 }
	],
	/*
		THE REGRESSION THIS CATCHES: a fixture whose `loadCategorySuggestions`
		returns raw, unranked categories in a different order than the real
		RPC would, or a composer that renders the datalist's `<option>`s out
		of the order `categorySuggestions` (the effect's own state) actually
		holds -- either one a plain "the datalist has N options" presence
		check would miss entirely. `evaluateExpected` calls the SAME transport
		and the SAME `courseCategorySuggestions` the real render path calls
		(exposed at `window.__categorySuggestionsFor`, see
		src/routes/dev/classroom/+page.svelte), so the expected order is never
		retyped here -- it is the function's own output on this fixture's own
		data (i-3 and i-8 are both 'Unit Labs', i-4 is 'Documentation', so the
		ranked order is ['Unit Labs', 'Documentation']).
	*/
	datalistOrder: [
		{
			inputSelector: '.composer-host input[list]',
			evaluateExpected: "() => window.__categorySuggestionsFor(['c-1'])",
			label: 'grading-category datalist matches courseCategorySuggestions'
		}
	]
};
