/**
 * A STUDENT RENAMES THEIR TEAM, SWITCHES ITS GRADIENT TO A SOLID, ADDS A BADGE
 * AND SAVES (ledger 0360,
 * report R17). One Save is ONE write (the harness's transport counts them on
 * the root), the card carries the typed name and the chosen background and badge at once
 * (the overlay) and after the re-read the poller is asked for, the editor
 * closes, and the live region says so. The background is the students' own
 * colour as a 0.22 wash, so the words on it are scored by compositing the wash
 * (WASH_PROBE) rather than by the contrast check, which cannot see a `::before`.
 */
import { CLASS_LIST, IGNORE, READY } from './_classroom-teams.mjs';
import { OPEN_EDITOR } from './classroom-teams-style-1.mjs';
import { WASH_PROBE } from './classroom-teams-styled-extremes.mjs';

export const SAVE_STEPS = [
	{ waitFor: READY, timeoutMs: 20000 },
	OPEN_EDITOR,
	{
		evaluate:
			'() => { const i = document.querySelector(\'[data-testid="team-style-name"]\'); i.value = "Gear Heads"; i.dispatchEvent(new Event("input", { bubbles: true })); return i.value; }',
		until: '() => document.querySelector(\'[data-testid="class-team-mine"] .ct-name-text\')?.textContent.trim() === "Gear Heads"'
	},
	{
		click: '[data-testid="team-style-bg-solid"]',
		until: '() => document.querySelector(\'[data-testid="team-style-bg-solid"]\')?.getAttribute("aria-pressed") === "true" && !!document.querySelector(\'[data-testid="team-style-solid"]\')'
	},
	{
		click: '[data-testid="team-style-badge"] [data-badge="gear"]',
		until: '() => document.querySelector(\'[data-testid="team-style-badge"] [data-badge="gear"]\')?.getAttribute("aria-pressed") === "true"'
	},
	{
		click: '[data-testid="team-style-save"]',
		until: '() => document.querySelector(\'[data-testid="class-teams-harness"]\')?.dataset.styleCalls === "1" && !document.querySelector(\'[data-testid="team-style-editor"]\')'
	}
];

export default {
	// `state=saved` names this spec's state; the harness ignores it.
	path: '/dev/classroom-teams?style=1&state=saved',
	label: 'Class page as a student: rename the team, pick a solid background and a badge, Save, and the class card shows it',
	prepare: SAVE_STEPS,
	orderResult: [
		{
			label: 'one Save is one write, and the card shows the saved name, its solid wash and its badge',
			evaluate:
				'() => { const card = document.querySelector(\'[data-testid="class-team-mine"]\'); return [document.querySelector(\'[data-testid="class-teams-harness"]\').dataset.styleCalls, card.querySelector(".ct-name-text").textContent.trim(), String(card.classList.contains("has-bg")), /^#[0-9a-f]{6}$/.test(getComputedStyle(card).getPropertyValue("--team-bg").trim()) ? "solid" : "not solid", String(card.querySelectorAll(\'[data-testid="class-team-badge"]\').length), document.querySelector(\'[data-testid="class-team-saved"]\').textContent.trim()]; }',
			expected: ['1', 'Gear Heads', 'true', 'solid', '1', 'Saved. Your class sees the new look.']
		},
		{ label: 'every ink on the washed cards clears 4.5:1, composited', evaluate: WASH_PROBE, expected: ['examined 12 ink/stop pairs across 2 washed cards', 'PASSES 4.5', 'worst 10.44:1'] }
	],
	presence: [
		{ selector: '[data-testid="team-style-editor"]', label: 'the editor closed after the save', expectPresent: 0 },
		{ selector: '[data-testid="class-team-customize"][aria-expanded="false"]', label: 'Customize team, back at rest', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		CLASS_LIST
	],
	contrast: [{ selector: '[data-testid="class-team-saved"]', label: 'the saved sentence', min: 4.5 }],
	ignoreConsole: IGNORE
};
