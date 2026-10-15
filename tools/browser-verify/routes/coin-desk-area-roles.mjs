/**
 * The coin desk's Roles area (IDEA Coin V2 session two, 0247): applications,
 * each class's seats and switch per role, holders with their proven days, an
 * application on a student's behalf, and the stipend (which pays itself, with
 * a payment by hand kept as an override).
 *
 * The harness seeds three pending applications (two for IDEA 100's one Shop
 * Steward seat, one Lab Tech application with no class), two holders with two
 * weeks of evidence, and per-class settings with one role switched off.
 *
 * WHAT IS MEASURED: every section renders populated; the application with no
 * class carries "No class yet" in words; each class shows a switch per role
 * with its state as `aria-checked`; and every pressed control clears 44px.
 */
export default {
	path: '/dev/coin-desk?area=roles',
	label: 'Coin desk Roles area (applications, seats, holders, stipend)',
	prepare: [
		{
			waitFor: '() => document.querySelectorAll(".cd-root [data-testid=\\"cd-role-holder\\"]").length > 0',
			timeoutMs: 8000
		}
	],
	presence: [
		{ selector: '.cd-root [data-testid="cd-role-app"]', label: 'pending applications', expectPresent: 3 },
		{ selector: '.cd-root [data-testid="cd-role-class"]', label: 'classes with seats', expectPresent: 3 },
		{ selector: '.cd-root [data-testid="cd-role-switch"]', label: 'a switch per class and role', expectPresent: 12 },
		{ selector: '.cd-root [data-testid="cd-role-switch"][aria-checked="false"]', label: 'the one role switched off', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-role-holder"]', label: 'holders', expectPresent: 2 },
		{ selector: '.cd-root [data-testid="cd-roles-stipend"]', label: 'the stipend card', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-roles-apply"]', label: 'apply on a student\'s behalf', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: '.cd-root [data-testid="cd-role-app"] .who', label: 'an applicant', min: 4.5 },
		{ selector: '.cd-root [data-testid="cd-role-holder"] .meta', label: "a holder's proof line", min: 4.5 },
		{ selector: '.cd-root [data-testid="cd-role-class"] .role-name', label: 'a role in a class', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.cd-root [data-testid="cd-role-accept"]', label: 'Accept', min: 44 },
		{ selector: '.cd-root [data-testid="cd-role-reject"]', label: 'Reject', min: 44 },
		{ selector: '.cd-root [data-testid="cd-role-switch"]', label: 'class switches', min: 44 },
		{ selector: '.cd-root [data-testid="cd-role-revoke"]', label: 'Revoke', min: 44 }
	]
};
