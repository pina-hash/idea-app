export default {
	path: '/dev/classroom?view=class-bulk-student',
	label: 'Class stream, same class read by a STUDENT: the positive control',
	/*
		THE NEGATIVE HALF OF EVERY ASSERTION IN
		`classroom-view-class-bulk.mjs`, on the SAME fixture: every control that
		bundle added is manager-only, and "manager-only" is a claim about
		absence that nothing on screen reports when it stops being true.

		ABSENCE IS THE MECHANISM, not a `readOnly` flag: the student mount hands
		in no transports at all, so `editable` is false and there is no write to
		execute rather than one that is merely hidden (CLAUDE.md). The rows are
		25 rather than 29 because a student's read never receives a draft, and
		the group headers are 3 rather than 4 because an EMPTY unit is a heading
		over nothing for them -- both are the payload doing the work, and both
		are asserted so a passing absence count cannot be a page that failed to
		render.
	*/
	presence: [
		{ selector: '[data-testid="item-row"]', label: 'rows a student receives (4 drafts withheld)', expectPresent: 25, expectVisible: 25 },
		{ selector: '[data-testid="group-head"]', label: 'group headers (the empty unit is not one)', expectPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="bulk-bar"]', label: 'bulk bar', expectPresent: 0 },
		{ selector: '[data-testid="bulk-hint"]', label: 'resting sentence', expectPresent: 0 },
		{ selector: '[data-testid="bulk-select-all"]', label: 'pane select-all', expectPresent: 0 },
		{ selector: '[data-testid^="group-select-"]', label: 'per-group select-all', expectPresent: 0 },
		{ selector: '[data-testid^="row-select-"]', label: 'row checkboxes', expectPresent: 0 },
		{ selector: '.row-select-hit', label: 'row checkbox hit areas', expectPresent: 0 },
		{ selector: '[data-testid="row-menu"]', label: 'row actions menus', expectPresent: 0 },
		{ selector: '.row-grip', label: 'drag grips', expectPresent: 0 },
		{ selector: '[data-testid="units-toggle"]', label: 'Units toolbar control', expectPresent: 0 },
		{ selector: '[data-testid="units-prompt"]', label: 'units onboarding prompt', expectPresent: 0 },
		{ selector: '[data-testid="new-post"]', label: 'New post', expectPresent: 0 }
	],
	contrast: [{ selector: '.row-name', label: 'item title (the row identity)', min: 4.5 }]
};
