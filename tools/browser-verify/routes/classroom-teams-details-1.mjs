/**
 * THE CLASS TEAM'S SHARED RECORD ON THE CLASS PAGE (0297, ledger 0433, gap
 * 5f6a37e8). Class teams are the source of truth for tournaments, so the own
 * team's card shows the team's description, its picture and the tournament it
 * plays in, and a member edits the description and picture right there. The
 * editor is opened in `prepare`, so every control, the picture and the link
 * are measured at both widths, and the tournament link is a real link into the
 * bracket.
 */
import { CLASS_LIST, IGNORE, READY } from './_classroom-teams.mjs';

export default {
	path: '/dev/classroom-teams?details=1',
	label: 'Class page as a student on a team: description, picture and tournament on the own card, Edit details opened',
	prepare: [
		{ waitFor: READY, timeoutMs: 20000 },
		/* Centred first: at 375 the button otherwise scrolls to the viewport's
		   bottom edge, under the fixed bottom bar, and the click lands there. */
		{
			evaluate: `() => { document.querySelector('[data-testid="class-team-mine"] [data-testid="class-team-details-edit"]').scrollIntoView({ block: 'center', behavior: 'instant' }); return 'centred'; }`
		},
		{
			click: '[data-testid="class-team-mine"] [data-testid="class-team-details-edit"]',
			until: '() => !!document.querySelector(\'[data-testid="class-team-details-form"]\')'
		}
	],
	presence: [
		{ selector: '[data-testid="class-team-mine"] [data-testid="class-team-description"]', label: 'the description on the own card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-team-mine"] [data-testid="class-team-picture"]', label: 'the picture on the own card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-team-mine"] [data-testid="class-team-tournaments"] a[href="/tournaments/sim"]', label: 'the tournament link', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-team-mine"] [data-testid="class-team-details-form"]', label: 'the details form, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-team-mine"] [data-testid="class-team-details-edit"]', label: 'no Edit details button while the form is open', expectPresent: 0 },
		{ selector: '[data-testid="class-team-edit-look"]', label: 'no teacher control for a student', expectPresent: 0 },
		CLASS_LIST
	],
	textContains: [
		{
			selector: '[data-testid="class-team-mine"] [data-testid="class-team-details"]',
			label: 'the card and form say what they are, with no address',
			must: ['Fastest spinning tops', 'In the bracket', 'IDEA-Blade Rotation 2', 'Description', 'Picture', 'every tournament your team plays in', 'Save details', 'Cancel'],
			mustNot: ['@', 'boscotech', '—']
		}
	],
	tapTargets: [
		{ selector: '[data-testid="class-team-details-form"] button', label: 'Save details and Cancel', min: 44 },
		{ selector: '[data-testid="class-team-details-form"] textarea, [data-testid="class-team-details-form"] input', label: 'the two fields', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="class-team-mine"] [data-testid="class-team-description"]', label: 'the description', min: 4.5 },
		{ selector: '[data-testid="class-team-mine"] .td-label', label: 'the mono labels', min: 4.5 },
		{ selector: '[data-testid="class-team-mine"] .td-link', label: 'the tournament link', min: 4.5 },
		{ selector: '[data-testid="class-team-mine"] .td-hint', label: 'the hint', min: 4.5 }
	],
	ignoreConsole: IGNORE
};
