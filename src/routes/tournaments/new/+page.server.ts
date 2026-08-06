import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Creating a tournament needs a session (any role: tournaments are host-run
 * by whoever creates them; the tournament_create RPC re-checks auth
 * server-side, this gate is convenience). /tournaments stays out of
 * authedPrefixes because viewing is public, so the gate lives here.
 */
export const load: PageServerLoad = async ({ locals: { claims } }) => {
	if (!claims) redirect(303, '/tournaments');
	return {};
};
