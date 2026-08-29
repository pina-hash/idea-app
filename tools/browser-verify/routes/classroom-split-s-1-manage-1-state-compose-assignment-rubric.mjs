// original array position 9 of 25 -- see ../README.md for what `order` means
export const order = 9;

export default {
	path: '/dev/classroom-split/s-1?manage=1&state=compose-assignment-rubric',
	label: 'Class stream composer, assignment kind + staged rubric builder (teacher)',
	aliasOf: '/dev/classroom-split/s-1?manage=1',
	/* THE STAGED RUBRIC BUILDER never ran in a browser before this: the
	   composer defaults to 'post' and `canStageRubric` needs kind ===
	   'assignment' AND mode === 'create' AND a teacherTransports, none of
	   which any prior /dev route reached at once. `New post` opens the
	   composer, then the kind toggle -- plain text, no data-testid on the
	   three buttons -- is selected by its own label. `RubricBuilder`
	   mounted with `itemId={null}` (staging mode) is the state: "Build
	   rubric" / "Generate from spec", nothing saved yet, applied the
	   moment the create call returns an id. */
	prepare: [
		{
			click: '[data-testid="new-post"]',
			until: '() => !!document.querySelector(".compose-card .kind-toggle")'
		},
		{
			click: '.compose-card .kind-toggle .kind:has-text("Assignment")',
			until: '() => !!document.querySelector(".compose-card .attach-editor .rubric-builder")'
		}
	],
	presence: [
		{ selector: '.compose-card .kind-toggle .kind.active', label: 'kind tab active (Assignment)', expectPresent: 1 },
		{ selector: '.compose-card .attach-editor .rubric-builder', label: 'staged rubric builder (create, assignment)', expectPresent: 1 }
	],
	contrast: [
		{ selector: '.compose-card .rubric-builder .line', label: 'rubric builder empty-state copy', min: 4.5 }
	],
	/* `.btn.secondary.tiny` here is a chip beside a heading -- it is not
	   phone-touched (manage-only classroom surface) and not the
	   student-facing engine, so IDEA_INTERFACE_STANDARDS 10's 24px floor
	   applies, not the 44px one `.cr-console` and `.engine-host` bump their
	   own `.btn.tiny` controls to. classroom.css:195 now clears 24px for
	   every `.btn.tiny`/`.btn.secondary.tiny`, so this check asserts the
	   floor that actually applies to this control. */
	tapTargets: [
		{ selector: '.compose-card .rubric-builder .actions .btn', label: 'rubric builder controls (Build rubric / Generate from spec)', min: 24 },
		/*
			ANOTHER PLAIN `.btn` NO EXISTING CHECK REACHED: ContentComposer's own
			submit footer (`ContentComposer.svelte`'s `.composer-actions`, "Post
			now"/"Save & publish"/"Save draft"/"Cancel") is `.btn`/`.btn.secondary`
			with no `.tap-44` and is NOT `.btn.tiny` -- so it does not fall under
			`classroom.css`'s 24px chip floor either (that rule is scoped to
			`.btn.tiny`/`.btn.secondary.tiny`, a one-time authoring chip; this is
			the primary, repeated submit action of the whole compose workflow).
			Measured with no `.btn` floor: 112.8x39.4 and 130.1x39.4 (min dim
			39.4px) at BOTH widths, 3 controls -- a real, previously uncaught gap
			in `src/lib/classroom/ContentComposer.svelte`. **`src/app.css`'s `.btn`
			now carries a 44px `min-height` floor, and this control was never
			overriding it** -- re-measured clean at 112.8x44 / 130.1x44, 0/3 under
			floor, both widths. The check stays: it is what would catch the next
			regression on this footer specifically, since `.composer-actions` has
			no height rule of its own to keep it aligned with `.btn`'s floor.
		*/
		{ selector: '.compose-card .composer-actions .btn', label: 'composer submit footer (Post now / Save draft / Cancel -- no .tap-44, not a .tiny chip)', min: 44 }
	]
};
