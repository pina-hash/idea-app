/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { certHydrated } from './_cert-desk.mjs';

/**
 * THE REVIEW SCREEN, a guided project: the evidence (text, a link opening in
 * a new tab, two pictures as tiles, a CAD file as a download row, the
 * self-inspection) beside the spec and its acceptance criteria, then the
 * decision. Send is held by ONE predicate: nothing chosen holds it, Fail with
 * no feedback holds it, and typed feedback frees it. The spec drives those
 * three states and reads the key after each.
 */
const TYPE_FEEDBACK = `() => { const t = document.querySelector('[data-testid="cert-review-feedback"]'); if (!t) return 'NO FEEDBACK BOX'; t.focus(); t.value = 'The step is 0.030 over. Take a finishing pass.'; t.dispatchEvent(new Event('input', { bubbles: true })); return 'typed ' + t.value.length + ' characters'; }`;

export default {
	path: '/dev/cert-review',
	label: 'IDEA Certifications review: a guided project, evidence beside the spec, Pass or Fail',
	prepare: [
		...certHydrated('review'),
		{ evaluate: `() => document.querySelector('[data-testid="cert-review-send"]').getAttribute('aria-disabled')`, label: 'Send is held before any choice' },
		{ click: '[data-testid="cert-review-fail"]', until: `() => document.querySelector('[data-testid="cert-review-fail"]').getAttribute('aria-pressed') === 'true'` },
		{ evaluate: `() => document.querySelector('[data-testid="cert-review-send"]').getAttribute('aria-disabled')`, label: 'Send is still held: a fail with no feedback' },
		{ evaluate: TYPE_FEEDBACK, until: `() => document.querySelector('[data-testid="cert-review-send"]').getAttribute('aria-disabled') === null` }
	],
	orderResult: [
		{ label: 'after typing feedback, Send is free', evaluate: `() => [(() => document.querySelector('[data-testid="cert-review-send"]').getAttribute('aria-disabled') === null ? 'free' : 'held')()]`, expected: ['free'] },
		{ label: 'external links open in a new tab with noopener', evaluate: `() => [(() => [...document.querySelectorAll('[data-testid="cert-evidence-links"] a')].map((a) => a.target + ' ' + a.rel).join('|'))()]`, expected: ['_blank noopener noreferrer'] }
	],
	presence: [
		{ selector: '[data-testid="cert-evidence-pictures"] .dk-thumb', label: 'two pictures as tiles', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cert-evidence-files"] .dk-file-row', label: 'the CAD file as a download row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-evidence-links"] .dk-file-row', label: 'one link with its Open key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-evidence-video"]', label: 'a guided project has no video', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-self-inspection"] .cert-check-row', label: 'three self-inspection answers', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="cert-review-acceptance"] .cert-check-row', label: 'three acceptance criteria beside it', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="cert-review-pass"], [data-testid="cert-review-fail"]', label: 'Pass and Fail', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cert-review-send"]', label: 'one Send key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-review-done"]', label: 'nothing is decided yet', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="cert-review"]', label: 'who, what and the words', must: ['Ana Reyes', 'MILL-1', 'Guided project', 'Flat to 0.002 in', 'A fail needs written feedback'] },
		{ selector: '[data-testid="cert-evidence-links"] a', label: 'the link key is a word', must: ['Open'] }
	],
	tapTargets: [
		{ selector: '[data-testid="cert-review-pass"], [data-testid="cert-review-fail"], [data-testid="cert-review-send"]', label: 'the decision keys', min: 44 },
		{ selector: '[data-testid="cert-evidence-pictures"] .dk-thumb', label: 'picture tiles', min: 44 },
		{ selector: '[data-testid="cert-evidence-files"] a, [data-testid="cert-evidence-links"] a', label: 'Download and Open keys', min: 44 },
		{ selector: '[data-testid="cert-review-feedback"]', label: 'the feedback box', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="cert-evidence-text"]', label: 'the written answer', min: 4.5 },
		{ selector: '[data-testid="cert-review-acceptance"] .cert-check-row div', label: 'acceptance lines', min: 4.5 },
		{ selector: '[data-testid="cert-review"] .cert-help', label: 'the feedback rule', min: 4.5 },
		{ selector: '[data-testid="cert-review-state"]', label: 'the waiting readout', min: 4.5 },
		{ selector: '[data-testid="cert-review"] .dk-row-meta', label: 'the meta line', min: 4.5 },
		{ selector: '[data-testid="cert-review-pass"], [data-testid="cert-review-fail"], [data-testid="cert-review-send"]', label: 'key words', min: 4.5 }
	]
};
