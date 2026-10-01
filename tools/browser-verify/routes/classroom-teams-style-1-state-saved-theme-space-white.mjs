/**
 * THE TEAM STYLE EDITOR AND A SAVED LOOK UNDER SPACE WHITE (ledger 0360,
 * report R17). The class page is in the Space White scope, so the editor's
 * labels and keys and the washed card are measured on the light grounds as
 * well: the wash is laid over the card's own ground, so a light theme is the
 * case where a pale student colour has least to work against.
 */
import { CLASS_LIST, IGNORE } from './_classroom-teams.mjs';
import { EDITOR_CONTROLS, OPEN_EDITOR } from './classroom-teams-style-1.mjs';
import { SAVE_STEPS } from './classroom-teams-style-1-state-saved.mjs';
import { WASH_PROBE } from './classroom-teams-styled-extremes.mjs';

export default {
	path: '/dev/classroom-teams?style=1&state=saved&theme=space-white',
	label: 'Class page as a student under Space White: the team style editor, then a saved solid look',
	prepare: [
		...SAVE_STEPS,
		{ waitFor: '() => document.documentElement.getAttribute("data-theme") === "space-white"', timeoutMs: 5000 },
		OPEN_EDITOR
	],
	orderResult: [{ label: 'every ink on the washed card clears 4.5:1 under Space White, composited', evaluate: WASH_PROBE, expected: ['examined 12 ink/stop pairs across 2 washed cards', 'PASSES 4.5', 'worst 11.90:1'] }],
	presence: [
		{ selector: '[data-testid="team-style-editor"]', label: 'the editor, open again over the saved look', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		CLASS_LIST
	],
	contrast: [
		{ selector: '[data-testid="team-style-editor"] .tse-label', label: 'the field and group labels', min: 4.5, all: true },
		{ selector: '[data-testid="team-style-editor"] .tse-note', label: 'who sees the team look', min: 4.5 },
		{ selector: '[data-testid="team-style-editor"] .btn', label: 'every editor key', min: 4.5, all: true }
	],
	tapTargets: [{ selector: EDITOR_CONTROLS, label: 'every editor control, at the 44px student floor', min: 44 }],
	ignoreConsole: IGNORE
};
