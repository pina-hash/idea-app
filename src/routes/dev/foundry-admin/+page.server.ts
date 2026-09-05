import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { PageServerLoad } from './$types';

/**
 * THE 0173 HARNESS. Dev only: 404 in production, no auth, no Supabase.
 *
 * The three states 0173 introduces are all invisible to a type check and all
 * of them need a real account to reach on a real deployment -- an admin, a
 * section manager and a student in a closed class are three different people,
 * and no cloud session holds any of them. So they are mounted here, with the
 * REAL components and in-memory transports, which is what makes them
 * measurable at 375 and 1440 at all.
 *
 * NO FIXTURE MODULE. Unlike /dev/foundry-gallery, nothing here needs the
 * bundle fixture or the serving route: the surfaces under test render rows,
 * sentences and controls, not a running app. The data is a literal below.
 */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
