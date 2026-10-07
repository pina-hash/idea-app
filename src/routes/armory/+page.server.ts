import type { PageServerLoad } from './$types';
import { loadMyDevices, loadOrphanCount, loadSummaries, signedInEmail } from '$lib/server/armory/page-loads';

/**
 * /armory: the caller's projects with their counts (0233), and for a site
 * admin every other project too (role null) and the storage cleanup count.
 * The cleanup count is asked only for an admin; anybody else would be refused
 * it anyway. No url read, so nothing here reruns on a query change.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	const email = signedInEmail(locals.claims);
	if (!email) return { email: null, notReady: false, summaryReady: false, projects: [], devices: [], orphans: null, now: Date.now() };
	const [summaries, devices, { isAdmin }] = await Promise.all([loadSummaries(locals.supabase), loadMyDevices(locals.supabase), parent()]);
	const orphans = isAdmin === true && summaries.ready ? await loadOrphanCount(locals.supabase) : null;
	return {
		email,
		notReady: summaries.notReady,
		summaryReady: summaries.ready,
		projects: summaries.projects,
		devices,
		orphans,
		now: Date.now()
	};
};
