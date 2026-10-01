/**
 * A STUDENT OPENS CUSTOMIZE TEAM ON THEIR OWN CARD (ledger 0360, report R17).
 * The membership-gated write existed since 0223 and the class page offered no
 * control for it at all; this is the editor the class page now opens under the
 * student's own team: name, motto, colour, background, badge, and a deliberate
 * Save. Every control is a 44px worded key (a student surface), every label
 * clears 4.5:1, and the editor fits a 375px phone without a sideways scroll
 * (the run's own horizontal-scroll check).
 */
import { CLASS_LIST, IGNORE, READY } from './_classroom-teams.mjs';

export const OPEN_EDITOR = {
	click: '[data-testid="class-team-customize"]',
	until: '() => !!document.querySelector(\'[data-testid="team-style-editor"]\')'
};

export const EDITOR_CONTROLS =
	'[data-testid="team-style-editor"] button, [data-testid="team-style-editor"] label.tse-well, [data-testid="team-style-editor"] input[type="text"]';

export default {
	path: '/dev/classroom-teams?style=1',
	label: 'Class page as a student on a team: Customize team opens the team style editor under their own card',
	prepare: [{ waitFor: READY, timeoutMs: 20000 }, OPEN_EDITOR],
	orderResult: [
		{
			/* THE HIT TEST, and it is a measured regression: above 1024px the
			   class pane capped the teams region at its own height, so with the
			   editor open the class page's h1 painted over Save and a click there
			   landed on the heading. Scrolled into view, the centre of Save and of
			   Cancel must answer the control itself. */
			label: 'Save and Cancel answer a hit test at their own centres, at both widths',
			evaluate: `() => ['team-style-save', 'team-style-cancel'].map((id) => { const b = document.querySelector('[data-testid="' + id + '"]'); b.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit && b.contains(hit) ? id + ' hits itself' : id + ' COVERED BY ' + (hit ? hit.tagName + '.' + String(hit.className).split(' ')[0] : 'nothing'); })`,
			expected: ['team-style-save hits itself', 'team-style-cancel hits itself']
		}
	],
	presence: [
		{ selector: '[data-testid="team-style-editor"]', label: 'the editor, open under the own card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-team-customize"][aria-expanded="true"]', label: 'its trigger, lit and expanded', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-team-mine-wrap"] [data-testid="team-style-editor"]', label: 'the editor sits with the own card', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="team-style-editor"] [data-testid="team-style-colour"] button', label: 'colour choices: None and the eight presets', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="team-style-editor"] [data-testid="team-style-badge"] button', label: 'badge choices: None and the eight badges', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="class-team-edit-look"]', label: 'no teacher Edit look for a student', expectPresent: 0 },
		CLASS_LIST
	],
	textContains: [
		{
			selector: '[data-testid="team-style-editor"]',
			label: 'the editor says who sees it and who can change it, with no address',
			must: ["Everyone in this class sees your team's name and look", 'the last save wins', 'Team name', 'Motto', 'Colour', 'Background', 'Badge', 'Save', 'Cancel', 'Clear look'],
			mustNot: ['@', 'boscotech']
		}
	],
	contrast: [
		{ selector: '[data-testid="team-style-editor"] .tse-label', label: 'the field and group labels', min: 4.5, all: true },
		{ selector: '[data-testid="team-style-editor"] .tse-note', label: 'who sees the team look', min: 4.5 },
		{ selector: '[data-testid="team-style-editor"] .btn', label: 'every editor key', min: 4.5, all: true }
	],
	tapTargets: [
		{ selector: EDITOR_CONTROLS, label: 'every editor control, at the 44px student floor', min: 44 },
		{ selector: '[data-testid="class-team-customize"]', label: 'the Customize team key', min: 44 }
	],
	ignoreConsole: IGNORE
};
