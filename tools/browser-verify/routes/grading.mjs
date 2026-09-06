export default {
	path: '/dev/grading',
	label: 'Grades tab: the order, the sentence that states it, and the undated group',
	/*
		THE RESTING STATE. Seven assignments handed to the real `GradesPanel` in an
		order that is neither answer, with the harness's own oracle printing what
		`orderStandings` returns beside it.

		WHY THIS NEEDS A BROWSER AT ALL. The unit test proves the comparator and
		proves the server-rendered markup; what it cannot prove is that the CONTROL
		works -- the key is client state, so switching it and re-reading the list is
		a hydration-and-effect question, and a `$derived` that stopped re-running
		type-checks perfectly and renders the first order forever.

		THE ORDER IS READ OFF THE LIST AND COMPARED AGAINST THE ORACLE, never
		against a sequence typed here. Break the comparator and BOTH move, which is
		the tell that a mutation landed rather than the panel merely hiding rows.

		THE CLICK RETRIES AGAINST ITS OWN EFFECT rather than waiting on a timer or a
		hydration marker: paint is not interactivity and no global separates them.
	*/
	prepare: [
		{
			waitFor: '() => document.querySelectorAll(\'[data-testid="grade-row"]\').length === 7'
		}
	],
	presence: [
		{ selector: '[data-testid="grade-row"]', label: 'the assignment rows', expectPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="grades-order-says"]', label: 'the sentence stating the order', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="grades-order-due"]', label: 'the by-due-date control', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="grades-order-queue"]', label: 'the needs-marking-first control', expectPresent: 1, expectVisible: 1 },
		/* ONE heading, not one per undated row and not one over the whole list.
		   `maxPresent` is what makes that a claim rather than a minimum. */
		{ selector: '[data-testid="grades-undated-head"]', label: 'the No due date heading', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="grades-order-says"]', label: 'the order sentence', min: 4.5 },
		{ selector: '[data-testid="grades-undated-head"]', label: 'the No due date heading', min: 4.5 }
	],
	textContains: [
		{
			selector: '[data-testid="grades-order-says"]',
			label: 'the page says what it is sorted by, in words',
			must: ['Newest due date first']
		},
		{
			selector: '.order-controls',
			label: 'every option carries a visible word, never a glyph or a bare arrow',
			must: ['By due date', 'Needs marking first']
		}
	],
	orderResult: [
		{
			/* THE RENDERED LIST AGAINST THE PURE FUNCTION. The left is scraped off
			   the panel's own rows; the right is the oracle, which calls
			   `orderStandings` directly on the same fixture. */
			evaluate: `() => {
				const rows = [...document.querySelectorAll('[data-testid="grade-row"] .grade-title')]
					.map((el) => el.textContent.trim().split('\\n')[0].trim());
				const oracle = [...document.querySelectorAll('[data-testid="oracle-list"] li strong')]
					.map((el) => el.textContent.trim());
				return [rows.join(' > '), oracle.join(' > ')];
			}`,
			expected: [
				'Assembly mates lab > Section view drawing > Fillet study > Chassis teardown > Aluminium stock audit > Bearing press writeup > Shop safety sign-off',
				'Assembly mates lab > Section view drawing > Fillet study > Chassis teardown > Aluminium stock audit > Bearing press writeup > Shop safety sign-off'
			],
			label: 'the default order is by due date, newest first, undated last, and it matches the pure function'
		},
		{
			/* THE HEADING SITS AT THE BOUNDARY, not at the top. A heading rendered
			   at index 0 would satisfy the presence check above while labelling
			   every row on the page. Read as DOM position, so it cannot be
			   satisfied by a heading that is present but elsewhere. */
			evaluate: `() => {
				const list = document.querySelector('.grade-rows');
				const kids = [...list.children];
				const head = kids.findIndex((n) => n.matches('[data-testid="grades-undated-head"]'));
				const rows = kids.filter((n) => n.matches('[data-testid="grade-row"]')).length;
				const dated = kids.slice(0, head).filter((n) => n.matches('[data-testid="grade-row"]')).length;
				return [head, rows, dated];
			}`,
			expected: [4, 7, 4],
			label: 'the heading falls after the four dated rows and before the three undated ones'
		},
		{
			/* THE CONTROL ACTUALLY REORDERS. Clicking is retried against its own
			   effect -- the list changing -- and the attempt count is reported, so
			   a step that "failed" through a dozen working clicks is
			   distinguishable from one whose handler never attached. */
			evaluate: `async () => {
				const read = () => [...document.querySelectorAll('[data-testid="grade-row"] .grade-title')]
					.map((el) => el.textContent.trim().split('\\n')[0].trim()).join(' > ');
				const before = read();
				const btn = document.querySelector('[data-testid="grades-order-queue"]');
				let tries = 0;
				while (tries < 40 && read() === before) {
					tries += 1;
					btn.click();
					await new Promise((r) => setTimeout(r, 50));
				}
				return [before !== read(), read(), document.querySelector('[data-testid="grades-order-says"]').textContent.trim(), tries <= 40];
			}`,
			expected: [
				true,
				'Chassis teardown > Fillet study > Bearing press writeup > Assembly mates lab > Section view drawing > Aluminium stock audit > Shop safety sign-off',
				'Waiting to be marked first',
				true
			],
			label: 'picking Needs marking first reorders the list and restates the order in words'
		},
		{
			/* AND THE HEADING GOES WITH IT. Under `queue` the list is not in date
			   groups, so a "No due date" heading would be labelling a boundary
			   that no longer exists. This runs after the click above. */
			evaluate: `() => [document.querySelectorAll('[data-testid="grades-undated-head"]').length]`,
			expected: [0],
			label: 'the No due date heading is withdrawn under the queue order, because there is no boundary to draw'
		}
	],
	tapTargets: [
		{ selector: '.order-btn', label: 'a sort control', min: 44 },
		{ selector: '.grade-open', label: 'the Grade button', min: 44 }
	]
};
