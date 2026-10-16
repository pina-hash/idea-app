/**
 * AN ADMIN TURNS A STUDENT'S PROFILE PICTURE OFF, THEN BACK ON (ledger 0392,
 * migration 0267, Mr. Pina: "the ability to turn off a student's profile
 * picture if it, in case it's inappropriate").
 *
 * `moderate=1` hands the page the admin's control over an in-memory stand-in,
 * as the route does for a site admin, and gives Ana a chosen preset. The steps
 * press Turn off, read the cost sentence, press Turn it off, and the picture
 * is her initials; then Turn picture back on, and it is her preset again. The
 * negative control is every other classroom-student spec, which hands in no
 * transport and must show no control (asserted there).
 */
import { STUDENT_READY } from './_classroom-student.mjs';

const AV = '[data-testid="so-identity"] .so-avatar .avatar';

export default {
	path: '/dev/classroom-student?moderate=1',
	label: "One student's page, as a site admin: turn the profile picture off and back on",
	prepare: [
		STUDENT_READY,
		{ waitFor: `() => !!document.querySelector('[data-testid="avatar-hold-arm"]') && !!document.querySelector('${AV} .preset')`, timeoutMs: 10000, label: 'the control and her preset are on screen' },
		{
			click: '[data-testid="avatar-hold-arm"]',
			until: `() => !!document.querySelector('[data-testid="avatar-hold-confirm"]')`,
			label: 'press Turn off profile picture'
		},
		{
			evaluate: `() => { const i = document.querySelector('[data-testid="avatar-hold-reason"]'); i.value = 'Not school appropriate.'; i.dispatchEvent(new Event('input', { bubbles: true })); return i.value; }`,
			label: 'type a reason'
		},
		{
			click: '[data-testid="avatar-hold-go"]',
			until: `() => document.querySelector('[data-testid="avatar-hold"]')?.dataset.hidden === 'true'`,
			label: 'press Turn it off'
		}
	],
	presence: [
		{ selector: `${AV} .initials`, label: 'her picture is now her initials', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${AV} .preset`, label: 'and the preset is gone', expectPresent: 0 },
		{ selector: '[data-testid="avatar-hold-restore"]', label: 'Turn picture back on', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="avatar-hold-state"]', label: 'the state says when, who and why', must: ['Profile picture turned off', 'apina@boscotech.edu', 'Reason: Not school appropriate.'] },
		{ selector: '[data-testid="avatar-hold-notice"]', label: 'the change is announced', must: ["Ana Reyes's profile picture is off"] }
	],
	contrast: [
		{ selector: '[data-testid="avatar-hold-state"]', label: 'the hold sentence', min: 4.5 },
		{ selector: '[data-testid="avatar-hold-notice"]', label: 'the notice', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="avatar-hold-restore"]', label: 'Turn picture back on', min: 44 }],
	orderResult: [
		{
			label: 'Turn picture back on restores her preset exactly',
			evaluate: `async () => {
				document.querySelector('[data-testid="avatar-hold-restore"]').click();
				for (let i = 0; i < 40 && document.querySelector('[data-testid="avatar-hold"]')?.dataset.hidden !== 'false'; i++) await new Promise((r) => setTimeout(r, 100));
				await new Promise((r) => setTimeout(r, 200));
				return [
					'hidden=' + document.querySelector('[data-testid="avatar-hold"]')?.dataset.hidden,
					'preset=' + !!document.querySelector('${AV} .preset'),
					'arm=' + !!document.querySelector('[data-testid="avatar-hold-arm"]')
				];
			}`,
			expected: ['hidden=false', 'preset=true', 'arm=true']
		}
	]
};
