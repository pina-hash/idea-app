/**
 * THE PROFILE PICTURE MODERATION PAGE (ledger 0392, migration 0267), as
 * `/admin/avatars` mounts it, over an in-memory stand-in with Ben already
 * held. The steps turn Ana's picture off by address (two presses, a reason)
 * and the list then holds both; Turn back on for Ben is measured below.
 */
export default {
	path: '/dev/avatar-holds',
	label: 'Profile pictures (admin): turn one off by address, see the list, turn one back on',
	prepare: [
		{ waitFor: `() => document.querySelectorAll('[data-testid="avatar-holds-row"]').length === 1`, timeoutMs: 15000, label: 'Ben is listed' },
		{
			evaluate: `() => { const set = (sel, v) => { const i = document.querySelector(sel); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }; set('[data-testid="avatar-holds-email"]', 'Ana@boscotech.net'); set('[data-testid="avatar-holds-reason"]', 'Shared by a classmate.'); return 'typed'; }`,
			label: 'type an address and a reason'
		},
		{ click: '[data-testid="avatar-holds-arm"]', until: `() => !!document.querySelector('[data-testid="avatar-holds-go"]')`, label: 'press Turn off picture' },
		{
			click: '[data-testid="avatar-holds-go"]',
			until: `() => document.querySelectorAll('[data-testid="avatar-holds-row"]').length === 2`,
			label: 'confirm'
		}
	],
	presence: [
		{ selector: '[data-testid="avatar-holds-row"]', label: 'both held pictures listed', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="avatar-holds-restore"]', label: 'a Turn back on per row', expectPresent: 2, maxPresent: 2, expectVisible: 2 }
	],
	textContains: [
		{ selector: '[data-testid="avatar-holds-notice"]', label: 'the change is said, address normalized', must: ['Turned off the profile picture for ana@boscotech.net'] },
		{ selector: '[data-testid="avatar-holds"]', label: 'the reasons are listed', must: ['Reason: Shared by a classmate.', 'Reason: Not school appropriate.'] }
	],
	contrast: [
		{ selector: '.ahx-name', label: 'a name in the list', min: 4.5 },
		{ selector: '.ahx-meta', label: 'an address and when', min: 4.5 },
		{ selector: '[data-testid="avatar-holds-notice"]', label: 'the notice', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="avatar-holds-restore"]', label: 'Turn back on', min: 44 },
		{ selector: '[data-testid="avatar-holds-email"], [data-testid="avatar-holds-reason"]', label: 'the fields', min: 44 }
	],
	orderResult: [
		{
			label: 'Turn back on removes that row and says so',
			evaluate: `async () => {
				const row = [...document.querySelectorAll('[data-testid="avatar-holds-row"]')].find((r) => r.textContent.includes('ben@boscotech.net'));
				row.querySelector('[data-testid="avatar-holds-restore"]').click();
				for (let i = 0; i < 40 && document.querySelectorAll('[data-testid="avatar-holds-row"]').length !== 1; i++) await new Promise((r) => setTimeout(r, 100));
				return [
					'rows=' + document.querySelectorAll('[data-testid="avatar-holds-row"]').length,
					'ben listed=' + document.querySelector('[data-testid="avatar-holds"]').textContent.includes('ben@boscotech.net'),
					'notice=' + document.querySelector('[data-testid="avatar-holds-notice"]').textContent.includes('back on')
				];
			}`,
			expected: ['rows=1', 'ben listed=false', 'notice=true']
		}
	]
};
