import { requireCertAdmin } from '$lib/server/certifications/gate';
import type { PageServerLoad } from './$types';

/** The import page is an admin's; the work is `POST /api/certifications/package/import`, two steps, from the page. */
export const load: PageServerLoad = async ({ locals }) => {
	await requireCertAdmin(locals);
	return { title: 'Import a package' };
};
