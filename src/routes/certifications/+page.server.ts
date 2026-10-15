import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { PORTAL_TAGLINE } from '$lib/certifications/copy';
import { certHref } from '$lib/certifications/nav';
import type { CertAwardMine, CertSummary } from '$lib/certifications/types';
import { callCert, formString, readCert, readCertOrNull, refusalFail } from '$lib/certifications/student/load';
import type { CertShellData } from '$lib/certifications/student/shell';

const SHELL: CertShellData = {
	title: 'Certifications',
	lead: `${PORTAL_TAGLINE} Every published certification, grouped by category. Explore the whole kit before you start; a locked one says which prerequisite it needs.`
};

/**
 * THE CATALOG (ledger 0391): `cert_catalog`, plus this person's own awards
 * from `cert_me` so an Earned card can show its serial's tail (the catalog
 * function answers `held`, never a serial). The session is re-checked here
 * even though the layout does: the two loads run concurrently, and a
 * signed-out visitor must cause no read. `PGRST202` renders the one notice.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.claims) return { shell: SHELL, signedOut: true, unavailable: false, items: [] as CertSummary[], serials: {} as Record<string, string> };
	const catalog = await readCert<CertSummary[] | null>(locals.supabase, 'cert_catalog');
	if (!catalog.ok) return { shell: SHELL, signedOut: false, unavailable: true, items: [] as CertSummary[], serials: {} as Record<string, string> };
	const items = Array.isArray(catalog.data) ? catalog.data : [];
	const me = await readCertOrNull<{ awards?: CertAwardMine[] }>(locals.supabase, 'cert_me');
	const serials: Record<string, string> = {};
	for (const a of me?.awards ?? []) {
		if (a && a.status === 'valid' && typeof a.code === 'string' && typeof a.serial === 'string' && !serials[a.code]) serials[a.code] = a.serial;
	}
	return { shell: SHELL, signedOut: false, unavailable: false, items, serials };
};

export const actions: Actions = {
	/** Start a certification: `cert_start(p_code)`, then the certification page. */
	start: async ({ request, locals }) => {
		if (!locals.claims) return fail(409, { ok: false as const, section: 'catalog', message: 'Sign in to start a certification.', reason: 'signed_out' });
		const form = await request.formData();
		const code = formString(form, 'code').toUpperCase();
		const outcome = await callCert(locals.supabase, 'cert_start', { p_code: code }, 'catalog');
		if (!outcome.ok) return refusalFail(outcome.refusal);
		redirect(303, certHref(code));
	}
};
