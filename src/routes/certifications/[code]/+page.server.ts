import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { CERT_PATHS } from '$lib/certifications/nav';
import { SUBMISSION_PARTS, type CertGetJson, type CertSettings } from '$lib/certifications/types';
import { callCert, certAction, formJson, formString, readCert, readCertOrNull, refusalFail } from '$lib/certifications/student/load';
import { CERT_EYEBROW, type CertShellData } from '$lib/certifications/student/shell';
import { certSiteOrigin } from '$lib/server/certifications/gate';
import { sendCertNotifications } from '$lib/server/certifications/notify';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const shellFor = (code: string, cert: CertGetJson | null): CertShellData => ({
	title: cert?.name ?? code,
	eyebrow: `${CERT_EYEBROW} · ${code}`,
	lead: cert ? cert.definition : null,
	crumbs: [{ href: CERT_PATHS.catalog, label: 'Certifications' }]
});

/**
 * THE CERTIFICATION PAGE (ledger 0391): `cert_get(code)` (null is a 404: a
 * draft and an unknown code answer identically) and `cert_settings` (read
 * tolerantly: the check-in timeout and the dormancy days are words on the
 * page, never a gate). The session is re-checked here because the layout's
 * load runs concurrently with this one.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const code = (params.code ?? '').toUpperCase();
	if (!locals.claims) return { shell: shellFor(code, null), signedOut: true, unavailable: false, cert: null, settings: null };
	const got = await readCert<CertGetJson | null>(locals.supabase, 'cert_get', { p_code: code });
	if (!got.ok) return { shell: shellFor(code, null), signedOut: false, unavailable: true, cert: null, settings: null };
	if (!got.data || typeof got.data !== 'object') error(404, 'Not found');
	const settings = await readCertOrNull<CertSettings>(locals.supabase, 'cert_settings');
	return { shell: shellFor(code, got.data), signedOut: false, unavailable: false, cert: got.data, settings };
};

const signedOut = (section: string) => fail(409, { ok: false as const, section, message: 'Sign in first.', reason: 'signed_out' });

/**
 * A notification-producing write is followed by the send, and a failure to
 * send NEVER fails the write: the row is already in `cert_notifications`
 * (the badge reads it) and the daily flush delivers whatever was not emailed.
 */
async function notify(url: URL, supabase: App.Locals['supabase'], data: Record<string, unknown> | undefined): Promise<void> {
	try {
		await sendCertNotifications(data?.notify, certSiteOrigin(url), supabase);
	} catch (e) {
		console.error('certifications: notification send failed after a committed write', (e as Error)?.message);
	}
}

export const actions: Actions = {
	start: async ({ request, locals }) => {
		if (!locals.claims) return signedOut('checklist');
		const form = await request.formData();
		return certAction(locals.supabase, 'cert_start', { p_code: formString(form, 'code').toUpperCase() }, 'checklist');
	},

	withdraw: async ({ request, locals }) => {
		if (!locals.claims) return signedOut('checklist');
		const form = await request.formData();
		const attempt = formString(form, 'attempt_id');
		if (!UUID_RE.test(attempt)) return fail(409, { ok: false as const, section: 'checklist', message: 'There is no attempt to withdraw from.', reason: 'not_found' });
		return certAction(locals.supabase, 'cert_withdraw', { p_attempt: attempt }, 'checklist');
	},

	/** A hand-in: the evidence jsonb and the self-inspection, then the certifiers hear of it. */
	submit: async ({ request, locals, url }) => {
		if (!locals.claims) return signedOut('guided');
		const form = await request.formData();
		const part = formString(form, 'part');
		const section = (SUBMISSION_PARTS as readonly string[]).includes(part) ? part : 'guided';
		const attempt = formString(form, 'attempt_id');
		if (!UUID_RE.test(attempt)) return fail(409, { ok: false as const, section, message: 'There is no open attempt to hand this in on.', reason: 'not_found' });
		if (!(SUBMISSION_PARTS as readonly string[]).includes(part)) return fail(409, { ok: false as const, section, message: 'That is not a part that takes a hand-in.', reason: 'invalid' });
		const evidence = formJson(form, 'evidence');
		const selfInspection = formJson(form, 'self_inspection');
		if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
			return fail(409, { ok: false as const, section, message: 'The evidence did not arrive. Fill the form in again and press Submit.', reason: 'invalid' });
		}
		const outcome = await callCert(locals.supabase, 'cert_submit', {
			p_attempt: attempt,
			p_part: part,
			p_evidence: evidence,
			p_self_inspection: Array.isArray(selfInspection) ? selfInspection : []
		}, section);
		if (!outcome.ok) return refusalFail(outcome.refusal);
		await notify(url, locals.supabase, outcome.data);
		return { ok: true as const, submission_id: outcome.data.submission_id ?? null };
	},

	/** A seat: a sign-up for a posted window, or a plain request with a note. */
	requestSeat: async ({ request, locals, url }) => {
		if (!locals.claims) return signedOut('exam');
		const form = await request.formData();
		const attempt = formString(form, 'attempt_id');
		const sitting = formString(form, 'sitting_id');
		const note = formString(form, 'note');
		if (!UUID_RE.test(attempt)) return fail(409, { ok: false as const, section: 'exam', message: 'Start this certification before asking for a seat.', reason: 'not_found' });
		const outcome = await callCert(locals.supabase, 'cert_seat_request', {
			p_attempt: attempt,
			p_sitting: UUID_RE.test(sitting) ? sitting : null,
			p_note: note || null
		}, 'exam');
		if (!outcome.ok) return refusalFail(outcome.refusal);
		await notify(url, locals.supabase, outcome.data);
		return { ok: true as const };
	},

	cancelSeat: async ({ request, locals }) => {
		if (!locals.claims) return signedOut('exam');
		const form = await request.formData();
		const seat = formString(form, 'seat_id');
		if (!UUID_RE.test(seat)) return fail(409, { ok: false as const, section: 'exam', message: 'There is no seat to cancel.', reason: 'not_found' });
		return certAction(locals.supabase, 'cert_seat_cancel', { p_seat: seat }, 'exam');
	},

	/** The no-script path of "Mark lesson complete" (the page calls the RPC directly when it can). */
	lessonComplete: async ({ request, locals }) => {
		if (!locals.claims) return signedOut('training');
		const form = await request.formData();
		const cert = formString(form, 'cert_id');
		const slug = formString(form, 'slug');
		if (!UUID_RE.test(cert) || !slug) return fail(409, { ok: false as const, section: 'training', message: 'That lesson could not be found.', reason: 'not_found' });
		return certAction(locals.supabase, 'cert_lesson_complete', { p_cert: cert, p_slug: slug }, 'training');
	}
};
