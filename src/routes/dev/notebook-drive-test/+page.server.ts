import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Dev harness (404 in production, no auth): mounts the REAL admin
 * notebook-drive-test page component so its form mechanics are
 * browser-verifiable without an admin session. Its submit still hits the
 * real /api/notebook/upload, which answers 401 signed-out -- exercising the
 * error branch end to end. */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return { driveConfigured: true };
};
