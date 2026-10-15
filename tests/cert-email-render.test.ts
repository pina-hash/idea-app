// tests/cert-email-render.test.ts
//
// THE CERTIFICATION EMAIL FAMILY (ledger 0391, surface f). `renderCertEmail`
// is what `notify.ts` sends; what has to be true of its answer is checkable
// as strings: every notification kind renders without throwing, the HTML
// carries the title, the body, the call to action's href, the full IDEA mark
// and no em dash, the text part carries the URL, the award email carries the
// serial and the verify URL in BOTH parts, every subject is under 70
// characters and starts with the certification code where the payload has
// one, every value is escaped (a payload value carrying `<script>` arrives as
// text), and a kind this module does not know still renders the generic
// layout rather than throwing.

import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KINDS, type NotificationKind } from '../src/lib/certifications/types';
import { renderCertEmail, absoluteHref, type CertEmailInput } from '../src/lib/server/email/cert';
import { EMAIL_MARK_URL } from '../src/lib/certifications/certificate/assets';
import { clampSubject, splitBody, studentFromBody, certFromBody, KIND_RULES, SUBJECT_MAX } from '../src/lib/server/email/templates/kinds';
import { escapeHtml } from '../src/lib/server/email/templates/html';
import { EMAIL_FIXTURES, EMAIL_SERIAL, EMAIL_VERIFY_URL } from '../src/routes/dev/cert-emails/fixtures';

const EM_DASH = '—';

describe('every notification kind renders', () => {
	it('the fixtures cover every kind, and the rules do too', () => {
		expect(Object.keys(EMAIL_FIXTURES).sort()).toEqual([...NOTIFICATION_KINDS].sort());
		expect(Object.keys(KIND_RULES).sort()).toEqual([...NOTIFICATION_KINDS].sort());
		expect(NOTIFICATION_KINDS.length).toBe(12);
	});

	for (const kind of NOTIFICATION_KINDS) {
		it(`${kind}: the title, the body, the CTA href, the mark, no em dash; the text carries the URL`, () => {
			const input = EMAIL_FIXTURES[kind];
			const out = renderCertEmail(input);
			expect(out.subject.length).toBeGreaterThan(0);
			expect(out.subject.length).toBeLessThanOrEqual(SUBJECT_MAX);
			expect(out.subject).not.toContain(EM_DASH);
			expect(out.subject).not.toContain('\n');
			expect(out.html).toContain(escapeHtml(input.title));
			// The body may be split into sentences and a quoted block; every piece is in the HTML.
			const { intro, quote } = splitBody(input.body, KIND_RULES[kind].quoteLabels);
			expect(out.html).toContain(escapeHtml(intro));
			if (quote) expect(out.html).toContain(escapeHtml(quote.text));
			const link = absoluteHref(input.siteOrigin, input.href);
			expect(out.html).toContain(`href="${escapeHtml(link)}"`);
			expect(out.html).toContain(`<img src="${EMAIL_MARK_URL}"`);
			expect(out.html).not.toContain(EM_DASH);
			expect(out.html).toContain('IDEA Certifications, Bosco Tech');
			expect(out.html).toContain('role="presentation"');
			expect(out.html).toContain('height:44px');
			expect(out.html).not.toContain('<script');
			expect(out.html).not.toContain('nsubscribe');
			// One tiny style block for dark-mode hints; everything else inline.
			expect((out.html.match(/<style/g) ?? []).length).toBe(1);
			expect(out.text).toContain(link);
			expect(out.text).toContain(input.title);
			expect(out.text).toContain(intro);
			expect(out.text).not.toContain(EM_DASH);
			expect(out.text).not.toContain('<');
			expect(out.text).toContain(`Hello ${input.recipientName},`);
		});
	}

	it('a subject starts with the certification code where the payload has one', () => {
		for (const kind of NOTIFICATION_KINDS) {
			const input = EMAIL_FIXTURES[kind];
			const code = typeof input.payload.code === 'string' ? input.payload.code : null;
			const out = renderCertEmail(input);
			if (code) expect(out.subject, kind).toMatch(new RegExp(`^${code}: `));
		}
		expect(renderCertEmail(EMAIL_FIXTURES.awarded).subject).toBe(`MILL-1: awarded, serial ${EMAIL_SERIAL}`);
		expect(renderCertEmail(EMAIL_FIXTURES.queue_submission).subject).toBe('MILL-1: Guided project to review');
		expect(renderCertEmail(EMAIL_FIXTURES.expiring).subject).toBe('SAFE-1: expires August 16, 2027');
		// A cancelled window carries no code and says so.
		const cancelled = renderCertEmail({ ...EMAIL_FIXTURES.sitting_declined, title: 'Exam window cancelled', payload: { seat_id: 'x', cancelled: true } });
		expect(cancelled.subject).toBe('Exam window cancelled');
	});
});

describe('the award email', () => {
	it('carries the serial and the verify URL in both parts, and opens the certificate', () => {
		const out = renderCertEmail(EMAIL_FIXTURES.awarded);
		for (const part of [out.html, out.text]) {
			expect(part).toContain(EMAIL_SERIAL);
			expect(part).toContain(EMAIL_VERIFY_URL);
			expect(part).toContain(`https://ideabosco.com/certifications/certificate/${EMAIL_SERIAL}`);
		}
		expect(out.html).toContain(`href="${EMAIL_VERIFY_URL}"`);
		expect(out.html).toContain('Open your certificate');
		expect(out.text).toContain(`Serial: ${EMAIL_SERIAL}`);
		expect(out.text).toContain(`Open your certificate: https://ideabosco.com/certifications/certificate/${EMAIL_SERIAL}`);
		// The fact rows the tree's payload does not carry are left off, never printed empty.
		expect(out.html).not.toContain('Level</td>');
		expect(out.html).not.toContain('Awarded on</td>');
		expect(out.text).not.toContain('Level: ');
		// They appear the day the payload carries them (no change here needed).
		const widened = renderCertEmail({ ...EMAIL_FIXTURES.awarded, payload: { ...EMAIL_FIXTURES.awarded.payload, level: 1, awarded_at: '2026-11-05T21:30:00Z' } });
		expect(widened.text).toContain('Level: 1');
		expect(widened.text).toContain('Awarded on: November 5, 2026');
	});
});

describe('the other kinds say their facts', () => {
	it('a returned review: the decision word, the part, and the feedback quoted', () => {
		const out = renderCertEmail(EMAIL_FIXTURES.review_returned);
		expect(out.text).toContain('Decision: Not yet');
		expect(out.text).toContain('Part: Autonomous project');
		expect(out.text).toContain('Feedback:\n> The step is 0.012 in deep');
		expect(out.html).toContain('Feedback</span>');
		expect(out.html).toContain('depth mic');
		const passed = renderCertEmail({ ...EMAIL_FIXTURES.review_returned, title: 'Guided project: passed', body: 'Your guided project for Manual Mill Level 1 passed. Feedback: Clean work.', payload: { ...EMAIL_FIXTURES.review_returned.payload, part: 'guided', decision: 'pass' } });
		expect(passed.text).toContain('Decision: Passed');
		expect(passed.text).toContain('> Clean work.');
	});
	it('an exam fail names the topics and the date the cooldown ends', () => {
		const out = renderCertEmail({
			...EMAIL_FIXTURES.review_returned,
			title: 'Exam: not yet',
			body: 'Your Manual Mill Level 1 exam scored 17 of 20. Topics to study: Speeds and feeds, Workholding. You can take it again on October 22, 2026.',
			payload: { exam: 'failed', exam_id: 'x', attempt_id: 'y', code: 'MILL-1', missed_topics: ['Speeds and feeds', 'Workholding'], cooldown_until: '2026-10-22T20:00:00Z' }
		});
		expect(out.text).toContain('Decision: Not yet');
		expect(out.text).toContain('Part: Exam');
		expect(out.text).toContain('Topics to study: Speeds and feeds, Workholding');
		expect(out.text).toContain('Exam again on: October 22, 2026');
	});
	it('an approved sitting: the date and time through formatCertDateTime', () => {
		const out = renderCertEmail(EMAIL_FIXTURES.sitting_approved);
		expect(out.text).toContain('Date and time: October 22, 2026 at 3:15 PM');
		expect(out.text).toContain('Note:\n> Room 12');
	});
	it('an expiry: the date and the one sentence on retaking', () => {
		const out = renderCertEmail(EMAIL_FIXTURES.expiring);
		expect(out.text).toContain('Expires: August 16, 2027');
		expect(out.text).toContain('To renew: Start it again from the catalog.');
		expect(out.html).toContain('Renew it');
	});
	it('a cooldown ending: the date', () => {
		const out = renderCertEmail(EMAIL_FIXTURES.cooldown_ended);
		expect(out.text).toContain('Date: October 21, 2026');
	});
	it('the two certifier mails: the student, the certification, the part, and Open the desk', () => {
		const sub = renderCertEmail(EMAIL_FIXTURES.queue_submission);
		expect(sub.text).toContain('Student: Ana Reyes');
		expect(sub.text).toContain('Certification: Manual Mill Level 1 (MILL-1)');
		expect(sub.text).toContain('Part: Guided project');
		expect(sub.text).toContain('Open the desk: https://ideabosco.com/certifications/desk/review/');
		expect(sub.html).toContain('Open the desk');
		const req = renderCertEmail(EMAIL_FIXTURES.queue_request);
		expect(req.text).toContain('Student: Ana Reyes');
		expect(req.text).toContain('Certification: Manual Mill Level 1 (MILL-1)');
		expect(req.text).toContain('Note:\n> Any day after school');
		expect(req.text).toContain('Open the desk: https://ideabosco.com/certifications/desk/sittings');
	});
	it('suspended and revoked quote the reason and move the eyebrow; reinstated does not', () => {
		const suspended = renderCertEmail(EMAIL_FIXTURES.suspended);
		expect(suspended.text).toContain('Reason:\n> Ran the mill with the guard open');
		expect(suspended.html).toContain('color:#b42b2b');
		expect(suspended.html).toContain('✕ Suspended');
		const revoked = renderCertEmail(EMAIL_FIXTURES.revoked);
		expect(revoked.html).toContain('✕ Revoked');
		const reinstated = renderCertEmail(EMAIL_FIXTURES.reinstated);
		expect(reinstated.html).not.toContain('#b42b2b');
		expect(reinstated.text).toContain('Note:\n> Safety talk done');
	});
});

describe('escaping and the unknown kind', () => {
	const hostile: CertEmailInput = {
		kind: 'awarded',
		to: 'ana.reyes@boscotech.net',
		recipientName: '<script>alert(1)</script>',
		title: 'Awarded: <img src=x onerror=alert(1)>',
		body: 'You earned <b>bold</b> & more. Serial IDEA-7K3Q-M9XD-2HTR-W4PB.',
		href: '/certifications/certificate/IDEA-7K3Q-M9XD-2HTR-W4PB',
		payload: { serial: '<svg onload=alert(1)>', code: 'MILL-1', verify_url: 'javascript:alert(1)' },
		siteOrigin: 'https://ideabosco.com'
	};
	it('every payload value is escaped: a <script> arrives as text, a javascript: link is dead', () => {
		const out = renderCertEmail(hostile);
		expect(out.html).not.toContain('<script>');
		expect(out.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(out.html).not.toContain('<img src=x');
		expect(out.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(out.html).not.toContain('<b>bold</b>');
		expect(out.html).toContain('&lt;b&gt;bold&lt;/b&gt; &amp; more');
		expect(out.html).not.toContain('<svg onload');
		expect(out.html).toContain('&lt;svg onload=alert(1)&gt;');
		expect(out.html).not.toContain('href="javascript:');
		expect(out.html).toContain('href="#"');
		// The subject is text, so it keeps its characters but never a newline.
		expect(out.subject).toContain('<svg onload=alert(1)>');
	});
	it('a kind this module does not know renders the generic layout rather than throwing', () => {
		const out = renderCertEmail({ ...EMAIL_FIXTURES.part_checked, kind: 'something_new' as NotificationKind, title: 'Something new: MILL-1', body: 'A sentence.' });
		expect(out.subject).toBe('MILL-1: Something new: MILL-1');
		expect(out.html).toContain('Something new: MILL-1');
		expect(out.html).toContain('IDEA Certifications');
		expect(out.html).toContain('Open it');
		expect(out.text).toContain('Open it: https://ideabosco.com/certifications/MILL-1');
	});
	it('a missing name greets plainly, a missing href opens My certifications, a payload that is not an object is read as empty', () => {
		const out = renderCertEmail({ ...EMAIL_FIXTURES.part_checked, recipientName: null, href: '', payload: null as unknown as Record<string, unknown> });
		expect(out.text).toContain('Hello,');
		expect(out.text).toContain('Keep going: https://ideabosco.com/certifications/me');
		expect(out.subject).toBe('Checked off: Guided project');
	});
});

describe('the pure helpers', () => {
	it('clampSubject holds 70 and cuts at a word, never an em dash', () => {
		expect(clampSubject('MILL-1: awarded')).toBe('MILL-1: awarded');
		const long = clampSubject('MILL-1: ' + 'word '.repeat(30));
		expect(long.length).toBeLessThanOrEqual(SUBJECT_MAX);
		expect(long.endsWith('word')).toBe(true);
		expect(clampSubject(`A ${EM_DASH} B`)).toBe('A , B');
		expect(clampSubject('x'.repeat(100)).length).toBe(SUBJECT_MAX);
	});
	it('splitBody takes the LAST label, keeps a body with none whole, and ignores an empty quote', () => {
		expect(splitBody('Passed. Feedback: Nice work. Note: see me.', ['Feedback', 'Note'])).toEqual({ intro: 'Passed. Feedback: Nice work.', quote: { label: 'Note', text: 'see me.' } });
		expect(splitBody('Passed.', ['Feedback'])).toEqual({ intro: 'Passed.', quote: null });
		expect(splitBody('Passed. Feedback: ', ['Feedback'])).toEqual({ intro: 'Passed. Feedback:', quote: null });
	});
	it('studentFromBody and certFromBody read the two certifier bodies', () => {
		expect(studentFromBody('Ana Reyes handed in the guided project for Manual Mill Level 1.')).toBe('Ana Reyes');
		expect(studentFromBody('A student asked for an exam sitting for Manual Mill Level 1. Note: x')).toBe('A student');
		expect(studentFromBody('Nothing here.')).toBe('');
		expect(certFromBody('Ana Reyes handed in the guided project for Manual Mill Level 1.')).toBe('Manual Mill Level 1');
		expect(certFromBody('No certification named')).toBe('');
	});
	it('absoluteHref joins a path to the origin and keeps an absolute URL', () => {
		expect(absoluteHref('https://ideabosco.com', '/certifications/me')).toBe('https://ideabosco.com/certifications/me');
		expect(absoluteHref('https://ideabosco.com/', 'certifications/me')).toBe('https://ideabosco.com/certifications/me');
		expect(absoluteHref('http://localhost:5173', 'https://ideabosco.com/x')).toBe('https://ideabosco.com/x');
	});
});
