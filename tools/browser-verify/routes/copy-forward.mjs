/**
 * COPY POSTS TO ANOTHER CLASS (ledger 0455, report 3a549386). The real
 * `CopyForwardPanel` over the harness's stand-in plan: choose Section 3 and its
 * first class day, Preview, and the table lists all 12 posts with what happens
 * to each and both due dates, then one Copy. The stand-in records each call, so
 * the order-result reads the arguments the panel sent.
 */
export default {
	path: '/dev/copy-forward',
	label: 'Copy posts to another class: preview every post with both due dates, then one copy',
	settleMs: 500,
	prepare: [
		{
			// Svelte's `bind:value` listens for `input` on a text box and `change`
			// on a select; both are sent, so the order of the two never matters.
			evaluate: `() => { const to = document.querySelector('[data-field="to"]'); const day = document.querySelector('[data-field="first-day"]'); if (!to || !day) return 'NO FIELD'; to.value = 's3'; to.dispatchEvent(new Event('change', { bubbles: true })); day.value = '2026-10-29'; day.dispatchEvent(new Event('input', { bubbles: true })); day.dispatchEvent(new Event('change', { bubbles: true })); return 'set ' + to.value + ' ' + day.value; }`,
			until: `() => { const k = document.querySelector('[data-testid="copy-forward-preview"]'); return !!k && !k.disabled; }`,
			attempts: 12,
			waitMs: 250
		},
		{ click: '[data-testid="copy-forward-preview"]', until: `() => !!document.querySelector('[data-testid="copy-forward-plan"]')`, attempts: 12, waitMs: 300 }
	],
	presence: [
		{ selector: '.cr-root [data-testid="copy-forward"]', label: 'the panel mounted', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-field="to"] option:not([disabled])', label: 'one class to copy into (this one and an archived one are not offered)', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '[data-testid="copy-forward-plan"] tbody tr', label: 'every post in the preview', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '[data-testid="copy-forward-plan"] tr[data-action="copy"]', label: 'posts to copy', expectPresent: 10, maxPresent: 10 },
		{ selector: '[data-testid="copy-forward-plan"] tr[data-action="share"]', label: 'a shared post to share', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="copy-forward-confirm"]:not(:disabled)', label: 'one Copy key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="copy-forward-problem"]', label: 'no refusal', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'the preview asked for Section 3 starting Oct 29, the old start taken from its posts',
			evaluate: `() => document.querySelector('[data-testid="harness-calls"]').textContent.trim().split(' | ')`,
			expected: ['preview s3 2026-10-29 null']
		}
	],
	textContains: [
		{ selector: '[data-testid="copy-forward-span"]', label: 'the two first days, in words', must: ['Thu, Sep 24', 'Section 2', 'Thu, Oct 29', 'Section 3'], mustNot: ['—', '–'] },
		{ selector: '[data-testid="copy-forward-summary"]', label: 'what the copy will do', must: ['10 posts copied as drafts', '1 shared', '1 already there'], mustNot: ['—', '–'] },
		{ selector: '[data-testid="copy-forward"] .cf-note', label: 'what is never copied', must: ['Student answers, grades and team draws stay here'] }
	],
	tapTargets: [
		{ selector: '[data-testid="copy-forward"] select, [data-testid="copy-forward"] input[type="date"]', label: 'class and day fields', min: 44 },
		{ selector: '[data-testid="copy-forward"] .btn:not(.tiny)', label: 'Preview and Copy', min: 44 },
		{ selector: '[data-testid="copy-forward"] .cf-toggle', label: 'the schedule toggle row', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="copy-forward"] .cf-note', label: 'the explanation', min: 4.5 },
		{ selector: '[data-testid="copy-forward-plan"] .cf-date', label: 'due dates (mono)', min: 4.5 },
		{ selector: '[data-testid="copy-forward-plan"] .cf-action', label: 'what happens (mono, dim)', min: 4.5 },
		{ selector: '[data-testid="copy-forward-summary"]', label: 'the summary', min: 4.5 }
	]
};
