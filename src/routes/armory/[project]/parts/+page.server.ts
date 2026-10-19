import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { signedInEmail } from '$lib/server/armory/page-loads';
import { armoryNotReady } from '$lib/armory/view';
import type { ProjectPartNumbers } from '$lib/armory/part-numbers';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /armory/<project>/parts: the project's part numbers (ledger 0405, migration
 * 0274), one read. A project the caller may not see answers the same 404 as
 * one that does not exist, as the project page does; a database without 0274
 * says "not switched on yet" rather than failing.
 */
export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('armory:parts');
	const email = signedInEmail(locals.claims);
	if (!email) return { email: null, notReady: false, parts: null, now: Date.now() };
	if (!UUID.test(params.project)) error(404, 'Not found');
	const { data, error: e } = await locals.supabase.rpc('armory_project_part_numbers', { p_project: params.project.toLowerCase() });
	if (e) {
		if (armoryNotReady(e)) return { email, notReady: true, parts: null, now: Date.now() };
		if (e.code === '42501') error(404, 'Not found');
		error(500, 'The part numbers could not be read. Try again.');
	}
	return { email, notReady: false, parts: data as ProjectPartNumbers, now: Date.now() };
};
