/**
 * A CO-HOST'S RENAME ARRIVING MID-EDIT (ledger 0298, R02 review). The host
 * console refetches on every co-host write, so the stored row can move under
 * a draft somebody is typing into. This host edits the DESCRIPTION; a co-host
 * renames the event (delivered the way the refetch delivers it, a whole new
 * row object); this host saves.
 *
 * What must hold, and what the form did before the fix: the name field takes
 * the co-host's new name (it used to keep the old one, because the draft was
 * kept whole), the half-typed description is still there (a whole re-seed
 * would wipe it), and the save sends the description and NOTHING ELSE -- the
 * old form sent the old name back and quietly undid the rename.
 */
const TYPE = (sel, text) =>
	`() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'NO FIELD'; el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed: ' + el.value; }`;

const RENAMED = 'Spring Rocket League Cup (renamed by a co-host)';
const MINE = 'Two-on-two, best of three. Bring your own controller.';

export default {
	path: '/dev/tournament-settings?status=registration_open&cohost=1',
	label: "Tournament settings: a co-host's rename lands mid-edit and survives this host's save",
	settleMs: 500,
	prepare: [
		{
			evaluate: TYPE('[data-testid="tournament-settings"] [data-field="description"]', MINE),
			until: `() => !!document.querySelector('[data-testid="settings-dirty"]')`,
			attempts: 12,
			waitMs: 200
		},
		{
			click: '[data-action="harness-cohost-rename"]',
			until: `() => document.querySelector('[data-testid="tournament-settings"] [data-field="name"]')?.value === ${JSON.stringify(RENAMED)}`,
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
		{ selector: '[data-action="harness-cohost-rename"]', label: 'the co-host control mounted', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-saved"]', label: 'the save landed and says so', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-error"]', label: 'no refusal', expectPresent: 0 },
		{ selector: '[data-testid="settings-dirty"]', label: 'nothing left unsaved after the save', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'the save sent the description and nothing else',
			evaluate: `() => { const c = JSON.parse(document.querySelector('[data-testid="last-args"]').textContent); return [c.rpc, String(c.args.p_name), c.args.p_description, String(c.args.p_config)]; }`,
			expected: ['tournament_update', 'null', MINE, 'null']
		},
		{
			label: "the fields show the co-host's name and this host's description",
			evaluate: `() => [document.querySelector('[data-testid="tournament-settings"] [data-field="name"]').value, document.querySelector('[data-testid="tournament-settings"] [data-field="description"]').value]`,
			expected: [RENAMED, MINE]
		}
	],
	textContains: [
		{ selector: '.hero h1', label: 'the stored name is still the co-host rename', must: [RENAMED] }
	],
	tapTargets: [
		{ selector: '[data-action="harness-cohost-rename"]', label: 'the harness control', min: 44 }
	]
};
