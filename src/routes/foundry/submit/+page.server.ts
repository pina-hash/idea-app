import type { FoundryAppSummary } from '$lib/foundry/transports';
import type { PageServerLoad } from './$types';

/**
 * The submit surface needs two things from the server: who is calling, so the
 * client can build storage paths under its own prefix, and the apps this
 * student already has, so "a new version of one I already have" is a real
 * choice rather than a second trip.
 *
 * The list runs as the caller with `p_include_unpublished`, the same read
 * /foundry/mine makes, so an app with no approved version -- which is most of
 * them while a student is working -- is still a valid target for a new version.
 */
/**
 * THE CLASS GATE'S SERVER HALF (0173, decision 01). The layout resolved it
 * once; this refuses to build the payload when it says closed, so a student
 * whose class has turned the Foundry off is not sent the data and then asked
 * politely not to look at it. Absence is the mechanism, exactly as it is for
 * every omitted transport in this feature.
 */
export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const { foundryAccess } = await parent();
	if (foundryAccess && foundryAccess.open === false) {
		return { uid: '', apps: [] as FoundryAppSummary[], initialAppId: null };
	}

	const uid = locals.claims?.sub ?? null;
	if (!uid) return { uid: '', apps: [] as FoundryAppSummary[], initialAppId: null };

	const { data } = await locals.supabase.rpc('foundry_list_apps', {
		p_owner: uid,
		p_include_unpublished: true
	});

	return {
		uid,
		apps: (data ?? []) as FoundryAppSummary[],
		/** Deep link from "Upload a new version" on /foundry/mine. */
		initialAppId: url.searchParams.get('app')
	};
};
