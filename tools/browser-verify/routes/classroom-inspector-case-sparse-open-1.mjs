export default {
	path: '/dev/classroom-inspector?case=sparse&open=1',
	label: 'Item inspector, every optional transport null (teacher, announcement)',
	/* THE EMPTY-GROUP CONTROL, and the reason the spec above cannot stand
	   alone: a rule that says "a group with nothing in it renders nothing"
	   is only tested where two of the three groups genuinely have nothing in
	   them. Every optional transport is null here, so only "This post"
	   survives -- and it survives holding ONE block, because
	   `revisionTransports` is null too. */
	/* `maxVisible: 0` ON EVERY ABSENCE ROW, AND THE `orderResult` COUNT BELOW
	   IS STILL THE REAL PROOF. `expectPresent` is a FLOOR, so `expectPresent: 0`
	   reads as ">= 0" and holds for any number of nodes -- measured here rather
	   than reasoned: with `{#if groupContent}` mutated to `{#if true}`, the
	   content group rendered EMPTY on this fixture and the presence row came
	   back "ok present 1". Only the count reddened ([2,1] against [1,1]). The
	   ceiling closes the visible half; the count is what closes the rest. */
	presence: [
		{ selector: '[data-testid="insp-group-content"]', label: 'group: content and work (must be absent)', expectPresent: 0, maxVisible: 0 },
		{ selector: '[data-testid="insp-group-private"]', label: 'group: instructor only (must be absent)', expectPresent: 0, maxVisible: 0 },
		{ selector: '[data-testid="insp-group-post"]', label: 'group: this post', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="insp-quick-grade"]', label: 'Grade (no gradeHref, must be absent)', expectPresent: 0, maxVisible: 0 },
		{ selector: '[data-testid="item-edit-toggle"]', label: 'Edit, in the header row', expectPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'groups rendered / blocks in them',
			evaluate: `() => {
				const groups = [...document.querySelectorAll('.insp-group')];
				return [groups.length, groups.reduce((n, g) => n + g.querySelectorAll('.insp-block').length, 0)];
			}`,
			expected: [1, 1]
		}
	],
	tapTargets: [
		{ selector: '[data-testid="item-edit-toggle"]', label: 'Edit (header row)', min: 44 },
		{ selector: '[data-testid="inspector-toggle"]', label: 'Instructor tools disclosure', min: 44 }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
