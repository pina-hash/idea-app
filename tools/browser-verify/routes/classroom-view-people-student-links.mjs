/**
 * THE PEOPLE ROSTER'S NAME IS THE DOOR TO ONE STUDENT'S PAGE (the 2026-10-07
 * round, report 792eb6b1: "From the people page I should be able to click on
 * a student"). Every student row's name is a link, and the row that MANAGES
 * the class (T. Vargas, `manages: true`) is not, because that page answers 404
 * for a manager's own address. Both counts are measured against the rows on
 * screen, and the link is hit-tested at its own centre.
 */
export default {
	path: '/dev/classroom?view=people&student=links',
	aliasOf: '/dev/classroom?view=people',
	label: 'People roster: each student name links to their page, the teacher row does not',
	prepare: [{ waitFor: `() => document.querySelectorAll('[data-testid="roster-row"]').length > 1`, timeoutMs: 30_000 }],
	orderResult: [
		{
			label: 'links = student rows, and the manager row has none',
			evaluate: `() => {
				const rows = [...document.querySelectorAll('[data-testid="roster-row"]')];
				const manager = rows.filter((r) => r.querySelector('[data-tone="manager"]'));
				const students = rows.length - manager.length;
				const links = document.querySelectorAll('[data-testid="roster-student-link"]').length;
				const onManager = manager.reduce((n, r) => n + r.querySelectorAll('[data-testid="roster-student-link"]').length, 0);
				return [links === students && students > 0, onManager, manager.length];
			}`,
			expected: [true, 0, 1]
		},
		{
			label: "a link's centre hit-tests to the link",
			evaluate: `() => {
				const a = document.querySelector('[data-testid="roster-student-link"]');
				a.scrollIntoView({ block: 'center', behavior: 'instant' });
				const r = a.getBoundingClientRect();
				const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
				return [!!hit && (hit === a || a.contains(hit)), a.getAttribute('href').startsWith('/dev/classroom-student?email=')];
			}`,
			expected: [true, true]
		}
	],
	contrast: [{ selector: '[data-testid="roster-student-link"]', label: 'student name links', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="roster-student-link"]', label: 'student name links', min: 44 }]
};
