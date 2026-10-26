// Ledger 0436, 0305: grading a team assignment by team, one screen per team,
// scored from a phone during a live Design Review. The real TeamGrader over a
// team of three (one double owner), in classroom_team_grading's own shape.
export default {
	path: '/dev/team-grade',
	label: 'Team grading screen (one team, three members, one double owner)',
	prepare: [
		{
			click: '[data-testid="team-grader"] .tg-levels .tg-level',
			until: "() => !!document.querySelector('[data-testid=\"team-grader\"] .tg-level[aria-pressed=\"true\"]')"
		}
	],
	tapTargets: [
		{ selector: '[data-testid="team-grader"] .tg-level', label: 'every level key', min: 44 },
		{ selector: '[data-testid="team-grader-save"]', label: 'Save', min: 44 },
		{ selector: '[data-testid="team-grader-return"]', label: 'Save and return', min: 44 }
	],
	presence: [
		// Two team criteria, four role blocks, one reflection for each of three members: 9 rows of 4 levels.
		{ selector: '[data-testid="team-grader"] .tg-level', label: 'level keys', expectPresent: 36, maxPresent: 36 },
		{ selector: '[data-testid="team-grader-total"]', label: 'one total per member', expectPresent: 3, maxPresent: 3 },
		// Absent: a per-student control for a team criterion. Team rows live only in the team group.
		{ selector: '[data-testid="team-grader"] .tg-person .tg-crit', label: 'team criteria inside a member row', expectPresent: 0 }
	],
	statePairs: [
		{
			activeSelector: '[data-testid="team-grader"] .tg-level[aria-pressed="true"]',
			inactiveSelector: '[data-testid="team-grader"] .tg-level[aria-pressed="false"]',
			label: 'a picked level reads differently from its siblings'
		}
	],
	contrast: [{ selector: '[data-testid="team-grader"] .tg-crit-name', label: 'criterion names', min: 4.5 }]
};
