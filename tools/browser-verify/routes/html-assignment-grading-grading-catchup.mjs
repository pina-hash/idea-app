/**
 * GRADING CATCH-UP IN THE CONSOLE (ledger 0457, items 11 and 15 to 20), on the
 * real `GradingConsole` with its `extras` handed in. Alice's photo was handed
 * in after the due date (the fixture's own late case), and her reflection has
 * an on-time version kept; one class only fills
 * empty grades; the rubric (10) disagrees with the post's points (20); the
 * criterion's wording is only in a tooltip; a posted draw puts Alice and Bruno
 * on one team. Blind mode and Grade as teams are pressed for real.
 */
import { OPEN_ALICE } from './_html-assignment-roster.mjs';

export default {
	path: '/dev/html-assignment-grading?grading=catchup',
	label: 'Grading console: protected class, own due date, late credit, scaling, hidden line, teams, blind',
	prepare: [
		...OPEN_ALICE,
		{ waitFor: `() => !!document.querySelector('[data-testid="student-due"]') && !!document.querySelector('[data-testid="rubric-late"]')`, attempts: 30, gapMs: 200 }
	],
	presence: [
		{ selector: '[data-testid="grading-protected"]', label: 'the fill empty grades only banner', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="student-due"]', label: 'the student\'s own due date line', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="student-mark-absent"]', label: 'the Mark absent key', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="rubric-late"]', label: 'a rubric line marked answered after due', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="rubric-hidden"]', label: 'a rubric line marked only in a tooltip', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="rubric-scale"]', label: 'the rubric vs post points notice', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="late-credit"]', label: 'the late credit panel', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="blind-mode"]', label: 'the Blind key', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="grade-as-teams"]', label: 'the Grade as teams key', expectPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="rubric-late"]', label: 'answered after due chip', min: 4.5 },
		{ selector: '[data-testid="rubric-hidden"]', label: 'only in a tooltip chip', min: 4.5 },
		{ selector: '.gc-protect', label: 'the protection banner', min: 4.5 },
		{ selector: '.scale-note', label: 'the scale notice', min: 4.5 }
	],
	textContains: [
		{ selector: '[data-testid="rubric-scale"]', label: 'it names both totals', must: ['adds up to 10', '20 points'] },
		{ selector: '[data-testid="late-credit"]', label: 'late credit says the rate', must: ['50%'] }
	],
	orderResult: [
		{
			label: 'Scale, Grade as teams and Blind each change what the console shows',
			evaluate: `async () => {
				const wait = (f) => new Promise((ok) => { const t0 = Date.now(); const tick = () => { if (f() || Date.now() - t0 > 4000) ok(f()); else setTimeout(tick, 40); }; tick(); });
				const out = [];
				document.querySelector('[data-testid="rubric-scale-toggle"]').click();
				out.push('scaled ' + await wait(() => (document.querySelector('[data-testid="rubric-scale"]')?.textContent ?? '').includes('scaled to')));
				document.querySelector('[data-testid="grade-as-teams"]').click();
				out.push('team ' + await wait(() => (document.querySelector('[data-testid="team-merge"]')?.textContent ?? '').includes('Team Meridian')));
				document.querySelector('[data-testid="team-pick"]').click();
				out.push('picked ' + await wait(() => (document.querySelector('[data-testid="batch-count"]')?.textContent ?? '').includes('2 student')));
				document.querySelector('[data-testid="blind-mode"]').click();
				out.push('blind ' + await wait(() => document.querySelector('[data-testid="blind-mode"]').getAttribute('aria-pressed') === 'true'));
				// Blind shows no stored total on the roster: no "Returned · N/M" chip text.
				out.push('chips ' + await wait(() => ![...document.querySelectorAll('.roster-row')].some((r) => /Returned · \d/.test(r.textContent ?? ''))));
				document.querySelector('[data-testid="blind-mode"]').click();
				document.querySelector('[data-testid="student-mark-absent"]').click();
				out.push('absent ' + await wait(() => !!document.querySelector('[data-testid="student-absent"]')));
				return out;
			}`,
			expected: ['scaled true', 'team true', 'picked true', 'blind true', 'chips true', 'absent true']
		}
	]
};
