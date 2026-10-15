import { requireCertifier } from '$lib/server/certifications/gate';
import { deskShell } from '$lib/certifications/student/shell';
import type { CertAwardJson } from '$lib/certifications/types';
import { dataOrNull, loadRpc } from '../desk-server';
import type { PageServerLoad } from './$types';

/** Every award of the caller's certifications, newest first (`cert_awards_list(null)`). */
export const load: PageServerLoad = async ({ locals }) => {
	await requireCertifier(locals);
	const awards = await loadRpc<CertAwardJson[]>(locals.supabase, 'cert_awards_list', { p_cert: null });
	return { title: 'Records', shell: deskShell('Records'), unavailable: !awards.ok, awards: dataOrNull(awards) ?? [] };
};
