/**
 * THE IDEACAD FRONT DOOR WHILE A MODEL IS BEING SHARED. Ledger 0470.
 *
 * A different STATE of `/dev/ideacad-launch` (`aliasOf`): Manage open on
 * "Spur gear 24T", whose share panel lists the one person it is already shared
 * with (Ana Reyes, from `FIXTURE_GRANTS`), and one teammate picked from the
 * suggestions the box shows on focus, waiting in the list with its own access.
 * The panel is where a narrow card can squeeze a name to nothing or push a
 * select past its edge, so its rows and every control in it are measured at
 * both widths, alongside the front door's own claims.
 */
import { LAUNCH_CLAIMS, LAUNCH_VERDICTS, UNFOLDED_INTERACTIVE } from './_ideacad-launch.mjs';

const SPUR = '[data-testid="model-card"][data-id="doc-spur"]';

export default {
	path: '/dev/ideacad-launch?state=sharing',
	aliasOf: '/dev/ideacad-launch',
	label: 'IdeaCAD: the launch page, sharing a model',
	prepare: [
		{ waitFor: '() => document.querySelectorAll(\'[data-testid="model-card"]\').length >= 7' },
		{ click: `${SPUR} [data-testid="manage"]`, until: `() => !!document.querySelector('${SPUR} [data-testid="share-count"]')`, attempts: 10, gapMs: 200 },
		{ click: `${SPUR} [data-testid="share-picker"] input`, until: `() => document.querySelectorAll('${SPUR} [data-testid="person-option"]').length >= 2`, attempts: 10, gapMs: 300 },
		{ click: `${SPUR} [data-testid="person-option"][data-key="p-mateo"]`, until: `() => !!document.querySelector('${SPUR} [data-testid="share-staged-row"]')`, attempts: 10, gapMs: 300 }
	],
	presence: [
		{ selector: '[data-testid="share-panel"]', label: 'the share panel, on the open card only (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="share-access-row"]', label: 'who already has it (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="share-staged-row"]', label: 'the picked teammate, waiting to be shared with (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="share-submit"]', label: 'the one Share button', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* The retired one-address form is gone. */
		{ selector: '.launch input[type="email"]', label: 'a typed-address-only box, retired', expectPresent: 0 }
	],
	orderResult: [{ label: 'the front door while sharing: the band, the words off their borders, the models first', evaluate: LAUNCH_VERDICTS, expected: LAUNCH_CLAIMS }],
	textContains: [
		{ selector: '[data-testid="share-panel"]', label: 'the panel names who has it and who is waiting', must: ['Shared with 1 person', 'Ana Reyes', 'Mateo Ruiz', 'Can view'] }
	],
	contrast: [
		{ selector: '[data-testid="share-count"]', label: 'the shared-with count', min: 4.5 },
		{ selector: '[data-testid="share-access-row"] .name', label: 'a name in the access list', min: 4.5 },
		{ selector: '[data-testid="share-staged-row"] .detail', label: 'the relation line of a picked person', min: 4.5 },
		{ selector: '[data-testid="share-submit"]', label: 'the Share button', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.launch button, .launch a, .launch select, .launch input', label: 'every control on the launch page', min: 44 }
	],
	layoutSanity: [
		{ root: '.launch', label: 'the launch page', reserved: null, interactive: UNFOLDED_INTERACTIVE },
		{ root: '[data-testid="share-panel"]', label: 'the share panel', reserved: null, interactive: 'button, select, input' }
	],
	ignoreConsole: []
};
