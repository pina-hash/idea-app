/**
 * Fixtures for the email harness and its tests (ledger 0391, surface f): one
 * `CertEmailInput` per notification kind, with the title, body, href and
 * payload shaped exactly as the migrations build them (`_cert_notify` calls in
 * 0261 to 0264), so the rendered email is the one a student or a certifier
 * would get. Pure data: importable by a test and by the server load.
 */
import { NOTIFICATION_KINDS, type NotificationKind } from '$lib/certifications/types';
import type { CertEmailInput } from '$lib/server/email/cert';

export const EMAIL_SITE_ORIGIN = 'https://ideabosco.com';
export const EMAIL_SERIAL = 'IDEA-7K3Q-M9XD-2HTR-W4PB';
export const EMAIL_VERIFY_URL = `${EMAIL_SITE_ORIGIN}/certifications/verify?serial=${EMAIL_SERIAL}`;
export const EMAIL_STUDENT = 'ana.reyes@boscotech.net';
export const EMAIL_CERTIFIER = 'apina@boscotech.edu';

const ATTEMPT = '2f1a9c5e-7b3d-4e2a-8c1f-0d9e8b7a6c02';
const SUBMISSION = '5a4f4a0b-1c01-4b0e-9a40-7d3d4b641a0c';
const SEAT = '6c5b4a39-2817-4f0e-9d8c-7b6a5f4e3d04';
const AWARD = '0f1e2d3c-4b5a-4968-8776-655443322105';

const student = (kind: NotificationKind, title: string, body: string, href: string, payload: Record<string, unknown>): CertEmailInput => ({
	kind,
	to: EMAIL_STUDENT,
	recipientName: 'Ana Reyes',
	title,
	body,
	href,
	payload,
	siteOrigin: EMAIL_SITE_ORIGIN
});
const certifier = (kind: NotificationKind, title: string, body: string, href: string, payload: Record<string, unknown>): CertEmailInput => ({
	kind,
	to: EMAIL_CERTIFIER,
	recipientName: 'Mr. Pina',
	title,
	body,
	href,
	payload,
	siteOrigin: EMAIL_SITE_ORIGIN
});

export const EMAIL_FIXTURES: Record<NotificationKind, CertEmailInput> = {
	part_checked: student(
		'part_checked',
		'Checked off: Guided project',
		'Guided project is checked off for Manual Mill Level 1 (MILL-1). Next up: exam.',
		'/certifications/MILL-1',
		{ attempt_id: ATTEMPT, part: 'guided', code: 'MILL-1', next_part: 'exam' }
	),
	review_returned: student(
		'review_returned',
		'Autonomous project: not yet',
		'Your autonomous project for Manual Mill Level 1 was returned. Read the feedback, revise, and hand it in again; there is no waiting period. Feedback: The step is 0.012 in deep against a drawing that says 0.250 plus or minus 0.005. Re-cut the step with a fresh end mill and measure it with the depth mic before you hand it in. The finish on the face is good.',
		'/certifications/MILL-1',
		{ submission_id: SUBMISSION, attempt_id: ATTEMPT, part: 'autonomous', decision: 'fail', code: 'MILL-1' }
	),
	sitting_approved: student(
		'sitting_approved',
		'Exam sitting approved: MILL-1',
		'Your Manual Mill Level 1 exam is set for October 22, 2026 at 3:15 PM. Your proctor releases it on their own device when you are in the room. Note: Room 12, bring nothing but yourself.',
		'/certifications/MILL-1',
		{ seat_id: SEAT, attempt_id: ATTEMPT, scheduled_at: '2026-10-22T22:15:00Z', code: 'MILL-1' }
	),
	sitting_declined: student(
		'sitting_declined',
		'Exam sitting declined: MILL-1',
		'Your sitting request for Manual Mill Level 1 was declined. Note: Thursday is a tournament day. Ask for Tuesday or Wednesday next week.',
		'/certifications/MILL-1',
		{ seat_id: SEAT, attempt_id: ATTEMPT, code: 'MILL-1' }
	),
	cooldown_ended: student(
		'cooldown_ended',
		'Cooldown over: MILL-1',
		'Your 7-day wait after the Manual Mill Level 1 exam is over. You can request a sitting or sign up for a window again.',
		'/certifications/MILL-1',
		{ attempt_id: ATTEMPT, code: 'MILL-1', cooldown_until: '2026-10-21T20:00:00Z' }
	),
	awarded: student(
		'awarded',
		'Awarded: Manual Mill Level 1',
		`You earned Manual Mill Level 1 (MILL-1). Serial ${EMAIL_SERIAL}. Your certificate is ready to print, and anyone can verify it at ${EMAIL_VERIFY_URL}.`,
		`/certifications/certificate/${EMAIL_SERIAL}`,
		{
			award_id: AWARD,
			serial: EMAIL_SERIAL,
			code: 'MILL-1',
			verify_url: EMAIL_VERIFY_URL,
			certificate_path: `/certifications/certificate/${EMAIL_SERIAL}`,
			expires_at: null
		}
	),
	suspended: student(
		'suspended',
		'Certification suspended: MILL-1',
		`Your Manual Mill Level 1 certification (${EMAIL_SERIAL}) is suspended. Reason: Ran the mill with the guard open on October 14. Come see Mr. Pina before using the mill again.`,
		'/certifications/me',
		{ award_id: AWARD, serial: EMAIL_SERIAL, code: 'MILL-1' }
	),
	reinstated: student(
		'reinstated',
		'Certification reinstated: MILL-1',
		`Your Manual Mill Level 1 certification (${EMAIL_SERIAL}) is in good standing again. Note: Safety talk done on October 16.`,
		'/certifications/me',
		{ award_id: AWARD, serial: EMAIL_SERIAL, code: 'MILL-1' }
	),
	revoked: student(
		'revoked',
		'Certification revoked: MILL-1',
		`Your Manual Mill Level 1 certification (${EMAIL_SERIAL}) was revoked. Reason: The autonomous project was found to have been machined by another student.`,
		'/certifications/me',
		{ award_id: AWARD, serial: EMAIL_SERIAL, code: 'MILL-1' }
	),
	expiring: student(
		'expiring',
		'Expiring soon: SAFE-1',
		'Your Shop Safety Level 1 certification expires on August 16, 2027. Start it again from the catalog to renew it; the same steps apply.',
		'/certifications/SAFE-1',
		{ award_id: AWARD, serial: 'IDEA-0A1B-2C3D-4E5F-6G7H', code: 'SAFE-1', expires_at: '2027-08-16T07:00:00Z' }
	),
	queue_submission: certifier(
		'queue_submission',
		'New guided project to review: MILL-1',
		'Ana Reyes handed in the guided project for Manual Mill Level 1.',
		`/certifications/desk/review/${SUBMISSION}`,
		{ submission_id: SUBMISSION, attempt_id: ATTEMPT, part: 'guided', code: 'MILL-1' }
	),
	queue_request: certifier(
		'queue_request',
		'Exam sitting requested: MILL-1',
		'Ana Reyes asked for an exam sitting for Manual Mill Level 1. Note: Any day after school this week works for me.',
		'/certifications/desk/sittings',
		{ seat_id: SEAT, attempt_id: ATTEMPT, code: 'MILL-1' }
	)
};

export const EMAIL_KINDS: readonly NotificationKind[] = NOTIFICATION_KINDS;

export function isEmailKind(value: string | null): value is NotificationKind {
	return !!value && (NOTIFICATION_KINDS as readonly string[]).includes(value);
}
