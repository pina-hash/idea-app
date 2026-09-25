/**
 * TOURNAMENT SETTINGS ONCE THE BRACKET IS LIVE (ledger 0298, R02). The format
 * is shown as TEXT with the reason above it: zero selects and zero toggles
 * here, against 3 and 2 on `tournament-settings-status-draft.mjs`. The name
 * and the description stay editable, and the prepare step proves it end to
 * end: it renames the event and saves, and the call the form built carries
 * the new name and NO config (the RPC would refuse one: 'Format settings are
 * locked once the bracket is generated.').
 */
const TYPE = (sel, text) =>
	`() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'NO FIELD'; el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed: ' + el.value; }`;

export default {
	path: '/dev/tournament-settings?status=live',
	label: 'Tournament settings, live: format read-only with its reason, the name still saves',
	settleMs: 500,
	prepare: [
		{
			evaluate: TYPE('[data-testid="tournament-settings"] [data-field="name"]', 'Spring Rocket League Finals'),
			until: `() => !!document.querySelector('[data-testid="settings-dirty"]')`,
			attempts: 12,
			waitMs: 200
		},
		{
			click: '[data-action="settings-submit"]',
			until: `() => !!document.querySelector('[data-testid="settings-saved"]')`,
			attempts: 12,
			waitMs: 300
		}
	],
	presence: [
		{ selector: '.tnm-root[data-testid="harness-room"]', label: 'the tournaments room mounted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="tournament-settings"][data-format-locked="true"]', label: 'the form reports the format locked', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-format-lock"]', label: 'the reason, in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-format-summary"] > div', label: 'the five format settings as text', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="tournament-settings"] select', label: 'no format select once live', expectPresent: 0 },
		{ selector: '[data-testid="tournament-settings"] input[type="checkbox"]', label: 'no format toggle once live', expectPresent: 0 },
		{ selector: '[data-testid="settings-format-fields"]', label: 'the editable format group is gone', expectPresent: 0 },
		/* The positive control inside the same form: what the RPC still allows
		   is still a live field. */
		{ selector: '[data-testid="tournament-settings"] [data-field="name"]:not(:disabled)', label: 'the name field is still live', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tournament-settings"] [data-field="description"]:not(:disabled)', label: 'the description field is still live', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-saved"]', label: 'the rename landed and says so', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-error"]', label: 'no refusal', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'the call carried the new name and no config',
			evaluate: `() => { const c = JSON.parse(document.querySelector('[data-testid="last-args"]').textContent); return [c.rpc, c.args.p_name, String(c.args.p_config), String(c.args.p_description)]; }`,
			expected: ['tournament_update', 'Spring Rocket League Finals', 'null', 'null']
		}
	],
	textContains: [
		{ selector: '[data-testid="settings-format-lock"]', label: 'the reason names the bracket and what can still change', must: ['The bracket is live, so the format is locked', 'The name and the description can still change.'], mustNot: ['—', '–'] },
		{ selector: '[data-testid="settings-format-summary"]', label: 'the stored format, in words', must: ['Qualifying pools', 'Off', 'Per-game scores', 'Best of 3', 'Teams of up to 2', 'Grand final', 'Best of 5'] },
		{ selector: '.hero h1', label: 'the heading took the new name', must: ['Spring Rocket League Finals'] }
	],
	tapTargets: [
		{ selector: '[data-testid="tournament-settings"] input[type="text"], [data-testid="tournament-settings"] textarea', label: 'name and description', min: 44 },
		{ selector: '[data-testid="tournament-settings"] .btn', label: 'Save', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="settings-format-lock"]', label: 'the lock sentence', min: 4.5 },
		{ selector: '[data-testid="settings-format-summary"] dt', label: 'summary labels (mono, dim)', min: 4.5 },
		{ selector: '[data-testid="settings-format-summary"] dd', label: 'summary values', min: 4.5 },
		{ selector: '[data-testid="settings-saved"]', label: 'the saved acknowledgement', min: 4.5 }
	]
};
