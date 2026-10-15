/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * IDEA CERTIFICATIONS, THE EMAIL FAMILY (ledger 0391, surface f): every
 * notification kind rendered by the real `renderCertEmail` on the server and
 * shown on /dev/cert-emails in two sandboxed frames (375 and 600) beside its
 * subject and its plain-text part. What has to be true: twelve kinds, each
 * with both frames; every subject 70 characters or under and no em dash in
 * any subject or text part; every frame's document carries the full IDEA mark
 * and the footer; the award email's text names the serial and the verify URL;
 * the harness's own words clear 4.5 and its keys clear 44px.
 *
 * The frames are `srcdoc` under an empty sandbox (an opaque origin), so their
 * contents are read off the attribute, never through `contentDocument`, and
 * the mark inside them does not load here (the harness blocks every
 * non-loopback request), which is a console line that belongs to the fixture.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_PRESENCE, SHELL_TAP_TARGETS } from './_cert.mjs';

export const SUBJECTS_UNDER_70 = `() => {
	const rows = [...document.querySelectorAll('[data-testid="cert-email-subject"]')];
	if (!rows.length) return ['no subjects'];
	const over = rows.filter((r) => (r.textContent || '').trim().length > 70).map((r) => (r.textContent || '').trim());
	return over.length ? ['over 70: ' + over.join(' | ')] : [rows.length + ' subjects, all 70 or under'];
}`;

export const NO_EM_DASH = `() => {
	const subjects = [...document.querySelectorAll('[data-testid="cert-email-subject"]')];
	const texts = [...document.querySelectorAll('[data-testid="cert-email-text"]')];
	const frames = [...document.querySelectorAll('[data-testid="cert-email-phone"]')];
	const dash = (s) => (s || '').includes('\\u2014');
	const bad = [...subjects, ...texts].filter((el) => dash(el.textContent)).length + frames.filter((f) => dash(f.getAttribute('srcdoc'))).length;
	return [bad === 0 ? 'no em dash in ' + subjects.length + ' subjects, ' + texts.length + ' text parts and ' + frames.length + ' documents' : bad + ' with an em dash'];
}`;

export const FRAMES_CARRY_IDENTITY = `() => {
	const frames = [...document.querySelectorAll('[data-testid="cert-email-phone"], [data-testid="cert-email-desktop"]')];
	if (!frames.length) return ['no frames'];
	const ok = frames.filter((f) => {
		const doc = f.getAttribute('srcdoc') || '';
		return doc.includes('https://ideabosco.com/IDEA/idea-logo-600.png') && doc.includes('IDEA Certifications, Bosco Tech') && doc.includes('role="presentation"') && !doc.includes('<script');
	}).length;
	return [ok + ' of ' + frames.length + ' documents carry the mark, the footer and tables, and no script'];
}`;

export default {
	path: '/dev/cert-emails',
	label: 'IDEA Certifications: the email family, every kind at a phone width and a desktop width',
	prepare: [...certHydrated('emails')],
	ignoreConsole: ['idea-logo-600\\.png', 'ERR_FAILED', 'ERR_BLOCKED_BY_CLIENT'],
	orderResult: [
		{ label: 'every subject is 70 characters or under', evaluate: SUBJECTS_UNDER_70, expected: ['12 subjects, all 70 or under'] },
		{ label: 'no em dash anywhere', evaluate: NO_EM_DASH, expected: ['no em dash in 12 subjects, 12 text parts and 12 documents'] },
		{ label: 'every frame carries the identity', evaluate: FRAMES_CARRY_IDENTITY, expected: ['24 of 24 documents carry the mark, the footer and tables, and no script'] }
	],
	presence: [
		...SHELL_PRESENCE,
		{ selector: '[data-testid="cert-email"]', label: 'twelve kinds', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '[data-testid="cert-email-phone"]', label: 'a phone frame each', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '[data-testid="cert-email-desktop"]', label: 'a desktop frame each', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '[data-testid="cert-email-subject"]', label: 'a subject each', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '[data-testid="cert-email-text"]', label: 'a text part each', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '[data-testid="cert-emails-key"]', label: 'twelve kind keys', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '[data-testid="cert-emails-all"].on', label: 'Show all is lit', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-emails-key"].on', label: 'and no kind key is (the single-kind page lights one)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-email-subject-length"].is-bad', label: 'no subject length reads over', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-email-subject-length"].is-ok', label: 'every one reads under (the control)', expectPresent: 12, maxPresent: 12, expectVisible: 12 }
	],
	textContains: [
		{ selector: '[data-testid="cert-email"][data-kind="awarded"] [data-testid="cert-email-subject"]', label: 'the award subject starts with the code and carries the serial', must: ['MILL-1: awarded, serial IDEA-7K3Q-M9XD-2HTR-W4PB'] },
		{ selector: '[data-testid="cert-email"][data-kind="awarded"] [data-testid="cert-email-text"]', label: 'the award text carries the serial, the verify URL and the call to action', must: ['IDEA-7K3Q-M9XD-2HTR-W4PB', 'https://ideabosco.com/certifications/verify?serial=IDEA-7K3Q-M9XD-2HTR-W4PB', 'Open your certificate: https://ideabosco.com/certifications/certificate/IDEA-7K3Q-M9XD-2HTR-W4PB', 'IDEA Certifications, Bosco Tech'] },
		{ selector: '[data-testid="cert-email"][data-kind="review_returned"] [data-testid="cert-email-text"]', label: 'a returned review quotes the feedback and names the decision', must: ['Feedback:', 'depth mic', 'Decision: Not yet', 'Part: Autonomous project'] },
		{ selector: '[data-testid="cert-email"][data-kind="sitting_approved"] [data-testid="cert-email-text"]', label: 'an approved sitting names the date and time', must: ['Date and time: October 22, 2026 at 3:15 PM'] },
		{ selector: '[data-testid="cert-email"][data-kind="expiring"] [data-testid="cert-email-text"]', label: 'an expiry names the date and how to renew', must: ['Expires: August 16, 2027', 'To renew:'] },
		{ selector: '[data-testid="cert-email"][data-kind="queue_submission"] [data-testid="cert-email-text"]', label: 'a queue mail names the student, the certification and the part, and opens the desk', must: ['Student: Ana Reyes', 'Certification: Manual Mill Level 1 (MILL-1)', 'Part: Guided project', 'Open the desk:'] },
		{ selector: '[data-testid="cert-emails-keys"]', label: 'the keys are words', must: ['Show all', 'awarded', 'review returned', 'queue request'] }
	],
	tapTargets: [
		...SHELL_TAP_TARGETS,
		{ selector: '[data-testid="cert-emails-key"], [data-testid="cert-emails-all"]', label: 'the kind keys', min: 44 }
	],
	contrast: [
		...SHELL_CONTRAST,
		{ selector: '.ce-kind', label: 'the kind headings', min: 4.5 },
		{ selector: '.ce-subject', label: 'the subjects', min: 4.5 },
		{ selector: '.ce-label', label: 'the mono labels', min: 4.5 },
		{ selector: '.ce-to', label: 'the recipients', min: 4.5 },
		{ selector: '.ce-pre', label: 'the text parts', min: 4.5 },
		{ selector: '[data-testid="cert-email-subject-length"]', label: 'the length readouts', min: 4.5 },
		{ selector: '[data-testid="cert-emails-key"]', label: 'the key words', min: 4.5 },
		{ selector: '.ce-iframe', label: 'the frame edges', min: 3 }
	]
};
