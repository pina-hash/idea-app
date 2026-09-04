export default {
	path: '/dev/grading-bulk',
	label: 'Grading at scale: one assignment, every class the caller teaches it in',
	/*
		WHAT THIS ROUTE IS FOR. Grading is one call per student per assignment, so
		a class of thirty is thirty passes through the console and the same
		assignment in three blocks is three consoles. This is the cross-class,
		many-student surface: the roster grouped by class, a tick box per student,
		and one statement (0175) for the batch.

		THE SILENT FAILURE IS GRADING THE WRONG CLASS'S STUDENT. Nothing refuses
		it -- the instructor teaches both -- so the section has to be readable on
		every row at every width, and the absence of a class the caller does NOT
		teach has to be asserted with a positive control beside it. That control is
		`?leak=1` (its own spec), which opens the intersection clause and makes
		Period 4 appear; without it "Period 4 is not here" could equally mean the
		selector was renamed.
	*/
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length === 7' }
	],
	presence: [
		/* TWO CLASSES, NOT THREE. The fixture posts to three; the caller manages
		   two. `?leak=1` is the positive control for this exact row. */
		{ selector: '[data-testid="roster-group"]', label: 'a group per class the caller teaches', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="roster-unplaced"]', label: 'the no-class group (nobody is unplaced here)', expectPresent: 0 },
		/* THE CHIP IS ON EVERY ROW, not only on the heading. A heading scrolls
		   away; the row is what somebody is looking at when they tick it. */
		{ selector: '[data-testid="roster-section"]', label: 'the class, on every roster row', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="roster-pick"]', label: 'a tick box per student', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="pick-presets"]', label: 'the named selections', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="pick-presets"] button', label: 'all / handed in / not graded / nobody', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		/* The export panel scopes to ONE class here, because a gradebook CSV
		   naming Period 1 and carrying Period 2 as well is a wrong import that
		   looks exactly like a right one. */
		{ selector: '[data-testid="export-section"]', label: 'the class the export is scoped to', expectPresent: 1, expectVisible: 1 },
		/* NOT ON THIS SURFACE: this IS the cross-class console, so the link to it
		   would point at the page it is on. The single-section spec is the
		   positive control for that row. */
		{ selector: '[data-testid="cross-class-link"]', label: 'the link across (already here)', expectPresent: 0 },
		/* Nothing is armed and nothing has been written until somebody presses. */
		{ selector: '[data-testid="batch-plan"]', label: 'the plan (nothing armed yet)', expectPresent: 0 },
		{ selector: '[data-testid="batch-outcome"]', label: 'the outcome (nothing written yet)', expectPresent: 0 }
	],
	textContains: [
		{
			/* Across BOTH headings: `textContains` concatenates its matches, so
			   this asserts the pair names both classes and neither names the one
			   the caller does not teach. (`:nth-of-type` does not work here -- the
			   groups are divs among other divs, so it matched nothing.) */
			selector: '[data-testid="roster-group"] .roster-group-head',
			label: 'the groups name their classes and count them',
			must: ['IDEA100', 'Period 1', 'Period 2', '4', '3'],
			mustNot: ['Period 4']
		}
	],
	orderResult: [
		{
			/* THE CLASS ON THE ROW MATCHES THE GROUP IT IS IN. A chip that had come
			   loose from its heading would be worse than no chip: it would name a
			   class with authority and name the wrong one. Read as a relationship,
			   not as pinned text. */
			evaluate: `() => {
				const groups = [...document.querySelectorAll('[data-testid="roster-group"]')];
				const mismatched = [];
				for (const g of groups) {
					const head = g.querySelector('.roster-group-name').textContent.trim();
					for (const chip of g.querySelectorAll('[data-testid="roster-section"]')) {
						if (chip.textContent.trim() !== head) mismatched.push(head);
					}
				}
				const names = groups.map((g) => g.querySelector('.roster-group-name').textContent.trim());
				return [mismatched.length, names.length, names.some((n) => n.includes('Period 4'))];
			}`,
			expected: [0, 2, false],
			label: 'every row chip matches its own group heading, and no unmanaged class is listed'
		},
		{
			/* THE PRESETS ARE DIFFERENT SETS. "Handed in" and "not graded yet" are
			   the same list on a fixture where everybody handed in and nobody was
			   graded, and a preset row would then pass while testing nothing. */
			/* AWAITED BETWEEN PRESSES. Svelte flushes asynchronously, so reading the
			   checkboxes on the same tick as the click reports the state BEFORE it
			   -- measured, all four counts came back 0, which reads exactly like
			   four broken presets. */
			evaluate: `async () => {
				const tick = () => new Promise((r) => setTimeout(r, 60));
				const press = async (p) => { document.querySelector('[data-preset="' + p + '"]').click(); await tick(); };
				const count = () => [...document.querySelectorAll('[data-testid="roster-pick"] input')].filter((i) => i.checked).length;
				await press('all'); const all = count();
				await press('submitted'); const sub = count();
				await press('ungraded'); const un = count();
				await press('none'); const none = count();
				return [all, sub, un, none];
			}`,
			expected: [7, 6, 6, 0],
			label: 'the four presets pick genuinely different sets (7 / 6 handed in / 6 ungraded / 0)'
		}
	],
	contrast: [
		{ selector: '[data-testid="roster-section"]', label: 'the class on a roster row', min: 4.5 },
		{ selector: '.roster-group-name', label: 'a class heading', min: 4.5 },
		{ selector: '.roster-group-count', label: 'the count beside it', min: 4.5 },
		{ selector: '.pick-presets-label', label: 'the "Select" label', min: 4.5 },
		{ selector: '.export-section-label', label: 'the export class label', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="roster-pick"]', label: 'the per-student tick box', min: 44 },
		{ selector: '[data-testid="pick-presets"] button', label: 'a named selection', min: 44 },
		{ selector: '[data-testid="export-section"] select', label: 'the export class picker', min: 44 }
	]
};
