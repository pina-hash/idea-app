export default {
	path: '/dev/grading-bulk?case=batch',
	label: 'Grading at scale: the plan before the write, and the per-student report after it',
	aliasOf: '/dev/grading-bulk',
	/*
		THE STATE IS REACHED BY PRESSING THE REAL CONTROLS, not by a query
		parameter. A seeded "batch armed" fixture would be a second way into a
		state the controls already produce, and would prove nothing about whether
		the preset, the rubric and the two-step confirm actually work.

		THE FOUR CLAIMS THIS SURFACE HAS TO CARRY, in order:
		  1. NOTHING IS WRITTEN UNTIL IT IS COMMITTED, and what is about to be
		     written is on screen first. `bulkPlan` returns the preview and the
		     payload from one call, so the table below cannot describe a batch
		     other than the one about to be sent.
		  2. THE CLASS IS IN THE PLAN, because the plan is the last thing anybody
		     reads before a grade lands in somebody's gradebook.
		  3. A PARTIAL FAILURE IS REPORTED PER STUDENT, BY NAME. "5 of 6 saved"
		     sends an instructor hunting; the name says what to do. The fixture
		     refuses exactly one row for exactly this.
		  4. WHAT LANDED IS CLEARED AND WHAT DID NOT STAYS SELECTED, so pressing
		     again retries exactly the rest.
	*/
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length === 7' },
		{
			/* Open a student: the rubric form IS the batch, and it only exists
			   beside somebody's work. That is the point rather than a limitation --
			   a bulk surface with the work hidden is a spreadsheet. */
			click: '.roster-list .roster-row',
			until: '() => !!document.querySelector(".work-name")'
		},
		{
			click: '[data-preset="ungraded"]',
			until: '() => (document.querySelector("[data-testid=\'batch-count\']")?.textContent ?? "").includes("6 students")'
		},
		{
			/* Score every criterion, re-querying between clicks: picking a level
			   re-renders the group, so a handle taken before the first click is
			   stale for the second. */
			evaluate: `() => {
				const n = document.querySelectorAll('.level-picker').length;
				for (let i = 0; i < n; i++) document.querySelectorAll('.level-picker')[i].querySelector('.level-btn').click();
				return 'scored ' + n + ' criteria';
			}`
		},
		{
			click: '[data-testid="batch-arm-return"]',
			until: '() => !!document.querySelector("[data-testid=\'batch-plan\']")'
		}
	],
	presence: [
		{ selector: '[data-testid="batch-plan"]', label: 'the plan, before anything is written', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-plan-row]', label: 'a plan row per student about to be graded', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="batch-commit"]', label: 'the second step of the confirm', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="batch-cancel"]', label: 'the way back out of it', expectPresent: 1, expectVisible: 1 },
		/* Not yet: the write has not happened. */
		{ selector: '[data-testid="batch-outcome"]', label: 'the report (nothing committed yet)', expectPresent: 0 },
		{ selector: '[data-testid="batch-problems"]', label: 'refusals (this batch is committable)', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="batch-count"]',
			label: 'the selection names its classes as well as its size',
			must: ['6 students selected', 'across 2 classes', 'Period 1', 'Period 2']
		},
		{
			selector: '.batch-plan-head',
			label: 'the plan says what it will do and out of what',
			must: ['About to return', '6 grades', 'out of 20 pts']
		}
	],
	orderResult: [
		{
			/* THE CLASS IS A COLUMN IN THE PLAN. Read as a header set rather than
			   as pinned cell text, so the row survives a fixture whose names move. */
			/* THE HEADERS ARE JOINED INTO A STRING, not returned as an array:
			   `orderResult` compares element by element with `===`, so a nested
			   array is never equal to itself and the row would be permanently
			   outside threshold while reporting the value it wanted. */
			evaluate: `() => {
				const heads = [...document.querySelectorAll('.plan-table th')].map((t) => t.textContent.trim()).join('|');
				const rows = [...document.querySelectorAll('[data-plan-row]')];
				const withClass = rows.filter((r) => (r.querySelector('.plan-section')?.textContent ?? '').includes('Period')).length;
				return [heads, rows.length, withClass];
			}`,
			expected: ['Student|Class|Was|Becomes', 6, 6],
			label: 'every plan row names the class the grade will land in'
		},
		{
			/* COMMIT, AND READ THE REPORT. One row is refused by the fixture, so
			   the succeeded/refused split is real rather than a shape with nothing
			   in it. The refused row sorts FIRST, because it is the one that needs
			   doing next. */
			evaluate: `() => {
				document.querySelector('[data-testid="batch-commit"]').click();
				return new Promise((res) => setTimeout(() => {
					const rows = [...document.querySelectorAll('[data-outcome-row]')];
					const first = rows[0];
					const stillChecked = [...document.querySelectorAll('[data-testid="roster-pick"] input')].filter((i) => i.checked).length;
					res([
						rows.length,
						first?.classList.contains('refused') ?? null,
						(first?.querySelector('.outcome-name')?.textContent ?? '').trim(),
						(document.querySelector('[data-testid="batch-headline"]')?.textContent ?? '').replace(/\\s+/g, ' ').trim(),
						stillChecked
					]);
				}, 250));
			}`,
			expected: [
				6,
				true,
				'Gus Whitlock',
				'5 of 6 returned. 1 not graded, named below.',
				1
			],
			label: 'the report names all six, the refusal is first and named, and only the failed row stays selected'
		},
		{
			/* THE SENTENCE, NOT A CODE. The server's own message is carried
			   verbatim, because the single-student console shows the same one and a
			   bulk surface that re-toned it would give two accounts of one refusal. */
			evaluate: `() => {
				const row = document.querySelector('[data-outcome-row="gus@boscotech.net"]');
				return [(row?.querySelector('.outcome-sentence')?.textContent ?? '').trim(), (row?.querySelector('.outcome-section')?.textContent ?? '').trim().includes('Period 2')];
			}`,
			expected: [
				'Not graded: That grade was changed by somebody else while this batch was running.',
				true
			],
			label: 'the refused row carries the server sentence verbatim and keeps its class'
		}
	],
	contrast: [
		{ selector: '.batch-count', label: 'the selection summary', min: 4.5 },
		{ selector: '.batch-plan-head', label: 'what is about to be written', min: 4.5 },
		{ selector: '.plan-table th', label: 'the plan headings', min: 4.5 },
		{ selector: '.plan-was', label: 'the previous score', min: 4.5 },
		{ selector: '.plan-becomes', label: 'the score about to be written', min: 4.5 },
		{ selector: '.plan-section', label: 'the class in the plan', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="batch-commit"]', label: 'the commit', min: 44 },
		{ selector: '[data-testid="batch-cancel"]', label: 'the cancel', min: 44 }
	]
};
