/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * IDEA CERTIFICATIONS, THE CATALOG (ledger 0391): three states stacked on
 * /dev/cert-catalog through the real `CatalogGrid` and `CertShell`. What has
 * to be true: an empty catalog says so in one notice; the full one groups by
 * category and gives every card ONE key (Start, Continue, Earned with the
 * serial's tail, or "Withdrawn: start again"); a locked card names the missing
 * prerequisite in words beside a padlock and its Start is `aria-disabled`,
 * never `disabled`; every key and card link clears 44px; the words clear 4.5.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_PRESENCE, SHELL_TAP_TARGETS } from './_cert.mjs';

export default {
	path: '/dev/cert-catalog',
	label: 'IDEA Certifications: the catalog (empty, full, locked)',
	prepare: [...certHydrated('catalog')],
	presence: [
		...SHELL_PRESENCE,
		{ selector: '[data-view="empty"] [data-testid="cert-catalog-empty"]', label: 'an empty catalog says so', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="empty"] [data-testid="cert-catalog-card"]', label: 'and draws no card', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="full"] [data-testid="cert-catalog-group"]', label: 'four categories', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-view="full"] [data-testid="cert-catalog-card"]', label: 'seven certifications', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-view="full"] [data-testid="cert-card-continue"]', label: 'two in progress get Continue (one active, one dormant)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-view="full"] [data-testid="cert-card-dormant"]', label: 'the dormant one says so', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="full"] [data-testid="cert-card-earned"]', label: 'two earned', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-view="full"] [data-testid="cert-card-start"][data-enabled="yes"]', label: 'two Start keys are live (LATHE-1, and PROG-1 to start again)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-view="full"] [data-testid="cert-card-start"][data-enabled="no"]', label: 'one Start is dark (MILL-2 needs MILL-1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="full"] [data-testid="cert-card-start"][aria-disabled="true"]', label: 'the dark Start is aria-disabled', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="full"] [data-testid="cert-card-start"][disabled]', label: 'and never disabled', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="full"] [data-testid="cert-card-needs"]', label: 'one card names a missing prerequisite', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="locked"] [data-testid="cert-card-needs"]', label: 'holding nothing: three cards name what they need', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="locked"] [data-testid="cert-card-start"][data-enabled="no"]', label: 'and their three Starts are dark', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="locked"] [data-testid="cert-card-start"][data-enabled="yes"]', label: 'the four with no prerequisite are live', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-view="locked"] [data-testid="cert-card-continue"], [data-view="locked"] [data-testid="cert-card-earned"]', label: 'holding nothing: no Continue and no Earned (the control)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-desk-key"]', label: 'the Desk key, for a certifier', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-view="full"] [data-testid="cert-catalog-card"][data-code="MILL-2"]', label: 'the locked card says which prerequisite, in words', must: ['Needs MILL-1 first'] },
		{ selector: '[data-view="locked"] [data-testid="cert-catalog-card"][data-code="MILL-1"]', label: 'a card with a held-nothing prerequisite', must: ['Needs SAFE-1 first'] },
		{ selector: '[data-view="full"] [data-testid="cert-catalog-card"][data-code="SAFE-1"]', label: 'Earned carries the serial tail and the renewal', must: ['Earned', 'W4PB', 'Renews each school year', '48 holders', 'About 3 days to earn'] },
		{ selector: '[data-view="full"] [data-testid="cert-catalog-card"][data-code="PROG-1"]', label: 'a withdrawn one says start again', must: ['Withdrawn: start again'] },
		{ selector: '[data-view="full"] [data-testid="cert-catalog-card"][data-code="MILL-2"]', label: 'no completion figure when fewer than three finished (null renders nothing)', mustNot: ['days to earn'] },
		{ selector: '[data-view="full"]', label: 'no address anywhere on the catalog', mustNot: ['@boscotech'] }
	],
	tapTargets: [
		...SHELL_TAP_TARGETS,
		{ selector: '[data-view="full"] [data-testid="cert-card-start"]', label: 'Start keys', min: 44 },
		{ selector: '[data-view="full"] [data-testid="cert-card-continue"]', label: 'Continue keys', min: 44 },
		{ selector: '[data-view="full"] .cert-card-link', label: 'the card name links', min: 44 },
		{ selector: '[data-view="full"] .cert-card-actions .btn', label: 'every card key', min: 44 },
		{ selector: '[data-testid="cert-desk-key"]', label: 'the Desk key', min: 44 }
	],
	contrast: [
		...SHELL_CONTRAST,
		{ selector: '[data-view="full"] .cert-card-name a', label: 'card names', min: 4.5 },
		{ selector: '[data-view="full"] .cert-card-def', label: 'definitions', min: 4.5 },
		{ selector: '[data-view="full"] .cert-readout', label: 'readouts', min: 4.5 },
		{ selector: '[data-view="full"] [data-testid="cert-card-needs"]', label: 'the missing-prerequisite words', min: 4.5 },
		{ selector: '[data-view="full"] .cert-card-why', label: 'why a Start is dark', min: 4.5 },
		{ selector: '[data-view="full"] .cert-catalog-h', label: 'category headings', min: 4.5 },
		{ selector: '[data-view="empty"] .cert-notice', label: 'the empty notice', min: 4.5 },
		{ selector: '[data-view="full"] .cert-card', label: 'card edges', min: 3 }
	]
};
