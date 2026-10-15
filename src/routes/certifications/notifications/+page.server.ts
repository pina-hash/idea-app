import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { CertNotification } from '$lib/certifications/types';
import { callCert, formString, readCert, refusalFail } from '$lib/certifications/student/load';
import type { CertShellData } from '$lib/certifications/student/shell';

const SHELL: CertShellData = {
	title: 'Notifications',
	lead: 'What happened on your certifications, newest first. Each one opens the page it is about.'
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `cert_notifications_mine(100)` (ledger 0391). The session is re-checked here. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.claims) return { shell: SHELL, signedOut: true, unavailable: false, rows: [] as CertNotification[] };
	const got = await readCert<CertNotification[] | null>(locals.supabase, 'cert_notifications_mine', { p_limit: 100 });
	if (!got.ok) return { shell: SHELL, signedOut: false, unavailable: true, rows: [] as CertNotification[] };
	return { shell: SHELL, signedOut: false, unavailable: false, rows: Array.isArray(got.data) ? got.data : [] };
};

export const actions: Actions = {
	/** Mark every unread notification read: the ids the page listed, own rows only (the function's rule). */
	read: async ({ request, locals }) => {
		if (!locals.claims) return fail(409, { ok: false as const, section: 'notifications', message: 'Sign in first.', reason: 'signed_out' });
		const form = await request.formData();
		const ids = formString(form, 'ids')
			.split(',')
			.map((s) => s.trim())
			.filter((s) => UUID_RE.test(s));
		if (ids.length === 0) return { ok: true as const, unread: null };
		const outcome = await callCert<{ unread?: number }>(locals.supabase, 'cert_notifications_mark_read', { p_ids: ids }, 'notifications');
		if (!outcome.ok) return refusalFail(outcome.refusal);
		return { ok: true as const, unread: outcome.data.unread ?? null };
	}
};
