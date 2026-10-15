import { NO_SIDEWAYS, certHydrated } from './_cert-desk.mjs';

/**
 * THE ENGINE EDITOR over a draft with publish problems: the sticky sub-bar
 * (code, state, Save with its indicator, Publish held with the problems
 * listed in words, Delete, Export), fourteen collapsible sections, the parts
 * switches, the training items with Move up and Move down, the pool editor
 * with its rule in words and four question rows. A typed name marks the
 * editor dirty and a press of Save revision hands the package to the
 * transport (`data-saves` counts).
 */
const TYPE_NAME = `() => { const i = document.querySelector('[data-testid="cert-engine-name"]'); if (!i) return 'NO NAME BOX'; i.focus(); i.value = 'Engine Lathe Level 1 (renamed)'; i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed ' + i.value; }`;

export default {
	path: '/dev/cert-engine?state=editor',
	label: 'IDEA Certifications engine: the editor over a draft with publish problems',
	prepare: [
		...certHydrated('engine'),
		{ evaluate: TYPE_NAME, until: `() => document.querySelector('[data-testid="cert-engine-editor"]').getAttribute('data-dirty') === 'yes'` }
	],
	orderResult: [
		NO_SIDEWAYS,
		{ label: 'Publish is held while problems exist and the editor is dirty', evaluate: `() => document.querySelector('[data-testid="cert-engine-publish"]').getAttribute('aria-disabled')`, expected: 'true' }
	],
	presence: [
		{ selector: '[data-testid="cert-engine-subbar"]', label: 'the sticky sub-bar', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-engine-state"]', label: 'the state readout', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-engine-publish"][aria-disabled="true"]', label: 'Publish held', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-engine-problems"] li', label: 'three problems listed in words', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="cert-engine-delete"]', label: 'a draft offers Delete', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-engine-hide"], [data-testid="cert-engine-retire"]', label: 'and neither Hide nor Retire', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-engine-export"]', label: 'Export', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-engine-editor"] .disc-trigger', label: 'fourteen collapsible sections', expectPresent: 14, maxPresent: 14, expectVisible: 14 },
		{ selector: '[data-testid="cert-engine-parts"] input', label: 'four part switches', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="cert-engine-training-items"] > li', label: 'two training items', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="cert-pool-row"]', label: 'four pool questions', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="cert-pool-rule"]', label: 'the pool rule in words', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="cert-engine-readonly"]', label: 'an admin is not told the engine is read-only', expectPresent: 0, maxPresent: 0 },
		{ selector: '.save-ind', label: 'the save indicator', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="cert-engine-subbar"]', label: 'code, state and the Save key', must: ['LATHE-1', 'Draft', 'Save revision', 'Publish', 'Export'] },
		{ selector: '[data-testid="cert-engine-problems"]', label: 'the problems verbatim', must: ['The study guide is empty.', '40 are needed'] },
		{ selector: '[data-testid="cert-pool-rule"]', label: 'the 2x rule', must: ['at least 40 active questions', 'twice the 20'] },
		{ selector: '[data-testid="cert-engine-editor"]', label: 'every section by its word', must: ['Identity', 'Meaning', 'Prerequisites', 'Parts', 'Training', 'Practice quiz', 'Study guide', 'Common mistakes', 'Exam', 'Guided project', 'Autonomous project', 'Checkout', 'Lessons', 'Revisions'] }
	],
	tapTargets: [
		{ selector: '[data-testid="cert-engine-subbar"] .btn', label: 'the sub-bar keys', min: 44 },
		{ selector: '[data-testid="cert-engine-editor"] .disc-trigger', label: 'the section triggers', min: 44 },
		{ selector: '[data-testid="cert-engine-identity"] ~ * input, [data-testid="cert-engine-name"]', label: 'identity fields', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="cert-engine-subbar"] .dk-subbar-code', label: 'the code', min: 4.5 },
		{ selector: '[data-testid="cert-engine-publish-why"]', label: 'why Publish is held', min: 4.5 },
		{ selector: '[data-testid="cert-engine-problems"] li', label: 'the problems', min: 4.5 },
		{ selector: '[data-testid="cert-engine-editor"] .disc-label', label: 'section words', min: 4.5 },
		{ selector: '[data-testid="cert-engine-editor"] .cert-field > span', label: 'field labels', min: 4.5 },
		{ selector: '.save-ind-text', label: 'the save indicator words', min: 4.5 }
	]
};
