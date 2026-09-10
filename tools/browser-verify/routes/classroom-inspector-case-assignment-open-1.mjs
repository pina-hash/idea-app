export default {
	path: '/dev/classroom-inspector?case=assignment&open=1',
	label: 'Item inspector, grouped body (teacher, assignment with a spec, a rubric, a check-in and instructor-only material)',
	/* THE FULLEST INSPECTOR THERE IS: all three groups present, which is the
	   only state where "no group renders as an empty heading" and "every block
	   carries a label" can both be measured at once. `?open=1` is read by the
	   page and written to the module flag in `inspector.svelte.ts` -- the flag
	   deliberately starts collapsed, so a spec that clicked and hoped would be
	   measuring a race instead of a layout. */
	presence: [
		{ selector: '[data-testid="insp-group-content"]', label: 'group: content and work', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="insp-group-private"]', label: 'group: instructor only', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="insp-group-post"]', label: 'group: this post', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="item-edit-toggle"]', label: 'Edit, in the header row', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="insp-quick-grade"]', label: 'Grade, in the header row', expectPresent: 1, expectVisible: 1 },
		/* THE EDITOR LAYER IS ABSENT AT REST (prompt 0118, item EIGHT). The two
		   `...-layout-*` specs press Edit post and assert it present; this row
		   is the other direction, beside the Edit control itself as the positive
		   control that the strip rendered at all. */
		{ selector: '[role="dialog"].composer-screen', label: 'the editor layer, ABSENT until Edit post is pressed', expectPresent: 0 },
		/* THE DEFAULT PLACEMENT (0193): no `layout` attached, so the Links and
		   Files cards sit BELOW the body, which is what every pre-0193 item
		   renders. The `...-placement-top` spec is the other direction on the
		   same fixture. */
		{ selector: '[data-testid="item-links-card"][data-placement="bottom"]', label: 'Links card, placed below (the default)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="item-files-card"][data-placement="bottom"]', label: 'Files card, placed below (the default)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="item-links-card"][data-placement="top"]', label: 'Links card above, ABSENT by default', expectPresent: 0 },
		{ selector: '[data-testid="item-files-card"][data-placement="top"]', label: 'Files card above, ABSENT by default', expectPresent: 0 }
	],
	/* NO GROUP MAY BE EMPTY, and a count is the only honest way to say it: a
	   presence assertion of 0 on a selector nothing matches passes whether the
	   rule holds or the markup vanished. This counts `.insp-group` elements
	   holding no `.insp-block` and expects 0 alongside a positive control -- the
	   total number of groups, which must be 3. */
	orderResult: [
		{
			label: 'empty groups / total groups',
			evaluate: `() => {
				const groups = [...document.querySelectorAll('.insp-group')];
				return [groups.filter((g) => g.querySelectorAll('.insp-block').length === 0).length, groups.length];
			}`,
			expected: [0, 3]
		},
		{
			label: 'every block carries a label (heading or disclosure trigger)',
			evaluate: `() => {
				const blocks = [...document.querySelectorAll('.insp-group > .insp-block')];
				const unlabelled = blocks.filter((b) => {
					if (b.querySelector('h2, h3')) return false;
					if (b.querySelector('button[aria-expanded]')) return false;
					/* The instructor-only block is the one whose label IS its group's
					   heading -- hoisted rather than repeated. */
					return b.parentElement.getAttribute('data-testid') !== 'insp-group-private';
				});
				return [unlabelled.length, blocks.length];
			}`,
			expected: [0, 6]
		},
		{
			label: 'document order by default: body, then Links, then Files',
			evaluate: `() => {
				const q = (s) => document.querySelector(s);
				const nodes = [
					['body', q('[data-testid="item-body-disclosure"]')],
					['links', q('[data-testid="item-links-card"]')],
					['files', q('[data-testid="item-files-card"]')]
				];
				if (nodes.some(([, n]) => !n)) return ['missing ' + nodes.filter(([, n]) => !n).map(([k]) => k).join(',')];
				const ok = nodes.every(([, n], i) => i === 0 || (nodes[i - 1][1].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
				return [ok ? 'body < links < files' : 'out of order'];
			}`,
			expected: ['body < links < files']
		}
	],
	contrast: [
		{ selector: '[data-testid="insp-group-content"] > h2', label: 'group heading, content and work', min: 4.5 },
		{ selector: '[data-testid="insp-group-post"] > h2', label: 'group heading, this post', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="item-edit-toggle"]', label: 'Edit (header row)', min: 44 },
		{ selector: '[data-testid="insp-quick-grade"]', label: 'Grade (header row)', min: 44 },
		{ selector: '[data-testid="inspector-toggle"]', label: 'Instructor tools disclosure', min: 44 }
	],
	/* The fixture's instructor-only attachment resolves through
	   `/api/classroom/attachment/<id>`, a real server route needing a session
	   this placeholder-.env dev server cannot provide; and the harness blocks
	   every non-loopback request, which is what the ERR_FAILED is. Both belong
	   to the instrument and the fixture, not to this surface. */
	ignoreConsole: [
		'Failed to load resource: the server responded with a status of 401',
		'Failed to load resource: net::ERR_FAILED'
	]
};
