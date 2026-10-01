/**
 * THE CLASS'S TEACHER, WITH THE TEAM STYLE WRITE HANDED IN (ledger 0360,
 * report R17), as the section layout hands it to everyone. A teacher is on no
 * team, so there is no Customize team (the student's classroom-teams-style-1
 * is the positive control); instead every board card carries Edit look, so a
 * teacher can take a name or a banner down from the class page without
 * retiring the draw (0223's reason a manager may write at all). Opening one
 * puts the same editor under the board, with the teacher's sentence.
 */
import { CLASS_LIST, IGNORE, READY } from './_classroom-teams.mjs';

export default {
	path: '/dev/classroom-teams?role=teacher&style=1',
	label: 'Class page as the teacher with the team style write: Edit look on every board card, opening the editor under the board',
	prepare: [
		{ waitFor: READY, timeoutMs: 20000 },
		{
			click: '[data-testid="class-teams-board"]',
			until: '() => document.querySelector(\'[data-testid="class-teams-board"]\')?.getAttribute("aria-expanded") === "true"'
		},
		{
			click: '[data-testid="class-team-edit-look"]',
			until: '() => !!document.querySelector(\'[data-testid="class-teams-board"] ~ * [data-testid="team-style-editor"], [data-testid="team-style-editor"]\')'
		}
	],
	presence: [
		{ selector: '[data-testid="class-team-customize"]', label: 'no Customize team for a teacher', expectPresent: 0 },
		{ selector: '[data-testid="class-team-edit-look"]', label: 'Edit look on every board card', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="team-style-editor"]', label: 'the editor, open under the board', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		CLASS_LIST
	],
	textContains: [
		{
			selector: '[data-testid="team-style-editor"]',
			label: "the teacher's sentence, and no address",
			must: ["Everyone in this class sees this team's name and look", 'Students on the team can change it too', 'Clear look'],
			mustNot: ['@', 'boscotech']
		}
	],
	contrast: [{ selector: '[data-testid="class-team-edit-look"]', label: 'Edit look', min: 4.5, all: true }],
	tapTargets: [{ selector: '[data-testid="class-team-edit-look"]', label: 'Edit look', min: 44 }],
	ignoreConsole: IGNORE
};
