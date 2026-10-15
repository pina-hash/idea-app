import { requireCertAdmin } from '$lib/server/certifications/gate';
import { deskShell } from '$lib/certifications/student/shell';
import { CERT_PATHS } from '$lib/certifications/nav';
import type { PageServerLoad } from './$types';

/** The import page is an admin's; the work is `POST /api/certifications/package/import`, two steps, from the page. */
export const load: PageServerLoad = async ({ locals }) => {
	await requireCertAdmin(locals);
	return { title: 'Import a package', shell: deskShell('Import a package', null, [{ href: CERT_PATHS.deskEngine, label: 'Engine' }]) };
};
