/* NO `order` EXPORT -- see routes.mjs. */

/**
 * 0074, B3: SAFE TO OPEN ON A CLEAN DATABASE.
 *
 * The state most classes will actually be in, and the one a surface gets wrong
 * by rendering nothing. A blank pane and a pane that failed to load are
 * indistinguishable to whoever opened it, so the empty state is a SENTENCE and
 * this measures that it is on the page, readable, with no controls beside it.
 *
 * Its own spec rather than a step in the main one: the empty state is a
 * different render, not a later moment of the same one, and a spec that
 * clicked its way there would measure the page after a mutation instead of the
 * page as it arrives.
 */
export default {
	path: '/dev/duplicate-drafts?state=empty',
	label: '0074: a class with nothing to clean up says so, and offers nothing',
	orderResult: [
		{
			evaluate: `() => {
				const empty = document.querySelector('[data-dd-empty]');
				const sum = document.querySelector('[data-dd-summary]');
				return [
					'empty=' + (empty ? 'shown' : 'absent'),
					'words=' + (empty && empty.textContent.trim().length > 20 ? 'yes' : 'no'),
					'summary=' + (sum && /No duplicate drafts/i.test(sum.textContent) ? 'states-zero' : 'silent'),
					'groups ' + document.querySelectorAll('[data-dd-group]').length,
					'arms ' + document.querySelectorAll('[data-dd-arm]').length
				];
			}`,
			expected: ['empty=shown', 'words=yes', 'summary=states-zero', 'groups 0', 'arms 0'],
			label: 'the empty state is a sentence, not a blank pane, and carries no controls'
		}
	],
	presence: [
		{ selector: '[data-dd-empty]', label: 'the deliberate empty state', expectPresent: 1 },
		{ selector: '[data-dd-group]', label: 'groups (none, correctly)', expectPresent: 0 },
		{
			/* The positive control for the two zeros above: the panel itself
			   IS on the page, so nothing here is a failed render. */
			selector: '[data-duplicate-drafts]',
			label: 'the panel itself',
			expectPresent: 1
		}
	],
	contrast: [
		{ selector: '[data-dd-empty]', label: 'the empty-state sentence', min: 4.5 },
		{ selector: '[data-dd-summary]', label: 'the summary line', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-dd-reset]', label: 'Reset the fixture' }]
};
