// tests/cert-desk-review.test.ts
//
// ONE PREDICATE DRIVES THE SEND KEY AND THE HANDLER (ledger 0391, surface d):
// a fail needs written feedback, a pass does not, nothing chosen sends
// nothing. `reviewCanSend` is that predicate; the real `ReviewPanel` mirrors
// it onto the Send key as `aria-disabled` (never `disabled`, so the key can
// explain itself) and the sentence beside it says why. Both directions are
// counted, and a decided submission renders its result and no form.

import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import ReviewPanel from '../src/lib/certifications/desk/ReviewPanel.svelte';
import { reviewBlockedBecause, reviewCanSend } from '../src/lib/certifications/desk/desk';
import { REVIEW_FEEDBACK_REQUIRED } from '../src/lib/certifications/copy';
import { ANA, BEN, DECIDED_SUBMISSION, GUIDED_SUBMISSION, MILL, PACKAGE_MILL } from '../src/routes/dev/cert-desk/fixtures';

const count = (body: string, re: RegExp) => (body.match(re) ?? []).length;
const sendTag = (body: string) => body.match(/<button[^>]*data-testid="cert-review-send"[^>]*>/)?.[0] ?? '';
type Props = ComponentProps<typeof ReviewPanel>;
const html = (props: Props) => render(ReviewPanel, { props }).body;

describe('reviewCanSend', () => {
	it('a pass sends with or without words; a fail needs feedback; nothing chosen never sends', () => {
		expect(reviewCanSend({ decision: 'pass', feedback: '' })).toBe(true);
		expect(reviewCanSend({ decision: 'pass', feedback: 'Nice work.' })).toBe(true);
		expect(reviewCanSend({ decision: 'fail', feedback: '' })).toBe(false);
		expect(reviewCanSend({ decision: 'fail', feedback: '   \n' })).toBe(false);
		expect(reviewCanSend({ decision: 'fail', feedback: 'The step is 0.030 over.' })).toBe(true);
		expect(reviewCanSend({ decision: null, feedback: 'words with no decision' })).toBe(false);
	});

	it('says why it is held, and nothing when it may go', () => {
		expect(reviewBlockedBecause({ decision: null, feedback: '' })).toBe('Choose Pass or Fail first.');
		expect(reviewBlockedBecause({ decision: 'fail', feedback: '' })).toContain('needs written feedback');
		expect(reviewBlockedBecause({ decision: 'pass', feedback: '' })).toBeNull();
		expect(reviewBlockedBecause({ decision: 'fail', feedback: 'why' })).toBeNull();
	});
});

describe('ReviewPanel', () => {
	const pending: Props = { submission: GUIDED_SUBMISSION, student: ANA, certification: MILL, spec: PACKAGE_MILL.guided_project, checkout: PACKAGE_MILL.checkout };

	it('holds Send before any choice, with the sentence, and offers Pass and Fail unpressed', () => {
		const body = html(pending);
		const send = sendTag(body);
		expect(send).not.toBe('');
		expect(send).toContain('aria-disabled="true"');
		expect(send).not.toContain(' disabled');
		expect(count(body, /data-testid="cert-review-held"/g)).toBe(1);
		expect(body).toContain('Choose Pass or Fail first.');
		expect(count(body, /data-testid="cert-review-(pass|fail)"/g)).toBe(2);
		expect(count(body, /aria-pressed="true"/g)).toBe(0);
		expect(count(body, /aria-pressed="false"/g)).toBe(2);
		expect(body).toContain(REVIEW_FEEDBACK_REQUIRED);
		// The evidence and the spec beside it, both present.
		expect(count(body, /class="dk-thumb"/g)).toBe(2);
		expect(count(body, /data-testid="cert-evidence-files"/g)).toBe(1);
		expect(count(body, /data-testid="cert-review-acceptance"/g)).toBe(1);
		expect(count(body, /data-testid="cert-review-done"/g)).toBe(0);
		expect(count(body, /data-testid="cert-review-form"/g)).toBe(1);
	});

	it('renders a refusal verbatim where the certifier was working', () => {
		const body = html({ ...pending, result: { action: 'decide', ok: false, message: 'The submission is no longer pending.' } });
		expect(count(body, /data-testid="cert-review-refusal"/g)).toBe(1);
		expect(body).toContain('The submission is no longer pending.');
		expect(count(body, /data-testid="cert-review-form"/g)).toBe(1);
	});

	it('a decided submission shows the result and the way back, and no form', () => {
		const body = html({ submission: DECIDED_SUBMISSION, student: BEN, certification: MILL, spec: PACKAGE_MILL.autonomous_project, checkout: null });
		expect(count(body, /data-testid="cert-review-done"/g)).toBe(1);
		expect(count(body, /data-testid="cert-review-back"/g)).toBe(1);
		expect(count(body, /data-testid="cert-review-form"/g)).toBe(0);
		expect(count(body, /data-testid="cert-review-send"/g)).toBe(0);
		expect(body).toContain('The step depth is 0.030 over.');
	});

	it('a checkout embeds the video with the continuous-take note and opens no new tab', () => {
		const body = html({ submission: { ...GUIDED_SUBMISSION, part: 'checkout', evidence: { text: '', links: [], youtube_id: 'dQw4w9WgXcQ', files: [] } }, student: ANA, certification: MILL, spec: null, checkout: PACKAGE_MILL.checkout });
		expect(count(body, /<iframe[^>]*youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/g)).toBe(1);
		expect(count(body, /data-testid="cert-checkout-note"/g)).toBe(1);
		expect(count(body, /target="_blank"/g)).toBe(0);
		expect(body).toContain('Checkout card');
	});
});
