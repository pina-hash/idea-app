/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * IDEA CERTIFICATIONS, THE HOLDERS BOARD (ledger 0391, DECISIONS D12): three
 * states stacked on /dev/cert-holders through the real `HoldersBoard`. What
 * has to be true: two views switched by lit keys (`aria-pressed`), names only
 * and never an address, every status a glyph AND a word, a search that
 * filters client-side, and an empty board that says so.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_PRESENCE, SHELL_TAP_TARGETS } from './_cert.mjs';

const TYPE = (value) => `() => { const i = document.querySelector('[data-view="by-person"] [data-testid="cert-holders-search"]'); if (!i) return 'NO SEARCH BOX'; i.focus(); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed ' + i.value; }`;

export default {
	path: '/dev/cert-holders',
	label: 'IDEA Certifications: the holders board (by certification, by person, empty)',
	prepare: [
		...certHydrated('holders'),
		{ evaluate: TYPE('reyes'), until: `() => document.querySelectorAll('[data-view="by-person"] [data-testid="cert-holder-person"]').length === 1` }
	],
	presence: [
		...SHELL_PRESENCE,
		{ selector: '[data-view="by-cert"] [data-testid="cert-holders"][data-view="certification"]', label: 'the first board is by certification', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="by-cert"] [data-testid="cert-holders-by-cert"][aria-pressed="true"]', label: 'its By certification key is lit', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="by-cert"] [data-testid="cert-holders-by-person"][aria-pressed="true"]', label: 'and By person is not', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="by-cert"] [data-testid="cert-holders-cert"]', label: 'three certifications with holders', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="by-cert"] [data-testid="cert-holder-row"]', label: 'eight holder rows', expectPresent: 8, maxPresent: 8, expectVisible: 8 },
		{ selector: '[data-view="by-person"] [data-testid="cert-holder-person"]', label: 'by person, searched for reyes: one person', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="by-person"] [data-testid="cert-holders-by-person"][aria-pressed="true"]', label: 'its By person key is lit', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="empty"] [data-testid="cert-holders-empty"]', label: 'an empty board says so', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="empty"] [data-testid="cert-holder-row"], [data-view="empty"] [data-testid="cert-holder-person"]', label: 'and lists nobody', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-view="by-cert"] [data-testid="cert-holders-cert"][data-code="SAFE-1"]', label: 'every status is a word beside its glyph', must: ['Ana Reyes', 'Valid', 'Suspended', 'Expired', 'August 20, 2026'] },
		{ selector: '[data-view="by-cert"] [data-testid="cert-holders-total"]', label: 'the count', must: ['6 holders'] },
		{ selector: '[data-view="by-person"] [data-testid="cert-holder-person"]', label: 'the searched person with her codes', must: ['Ana Reyes', 'SAFE-1', 'SCOUT-1'] },
		{ selector: '[data-testid="cert-root"]', label: 'names only, never an address', mustNot: ['@boscotech', '@gmail'] },
		{ selector: '.cert-root .page-header .ph-meta', label: 'the holders sentence', must: ['Names only; proof is on the verify page.'] }
	],
	tapTargets: [
		...SHELL_TAP_TARGETS,
		{ selector: '[data-view="by-cert"] [data-testid="cert-holders-by-cert"], [data-view="by-cert"] [data-testid="cert-holders-by-person"]', label: 'the two view keys', min: 44 },
		{ selector: '[data-view="by-cert"] [data-testid="cert-holders-search"]', label: 'the search box', min: 44 }
	],
	statePairs: [{ activeSelector: '[data-view="by-cert"] [data-testid="cert-holders-by-cert"]', inactiveSelector: '[data-view="by-cert"] [data-testid="cert-holders-by-person"]', label: 'the lit view key renders differently from the unlit one' }],
	contrast: [
		...SHELL_CONTRAST,
		{ selector: '[data-view="by-cert"] .cert-holders-name', label: 'holder names', min: 4.5 },
		{ selector: '[data-view="by-cert"] .cert-holders-h', label: 'certification names', min: 4.5 },
		{ selector: '[data-view="by-cert"] .cert-readout.is-ok', label: 'Valid readouts', min: 4.5 },
		{ selector: '[data-view="by-cert"] .cert-readout.is-warn', label: 'the Suspended readout', min: 4.5 },
		{ selector: '[data-view="by-cert"] .cert-readout.is-bad', label: 'Expired and Revoked readouts', min: 4.5 },
		{ selector: '[data-view="by-cert"] .cert-holders-row .cert-help', label: 'award dates', min: 4.5 },
		{ selector: '[data-view="by-cert"] .cert-holders-search > span', label: 'the search label', min: 4.5 },
		{ selector: '[data-view="by-cert"] .cert-holders-cert', label: 'panel edges', min: 3 }
	]
};
