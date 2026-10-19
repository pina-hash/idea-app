import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { signedInEmail } from '$lib/server/armory/page-loads';
import { armoryNotReady } from '$lib/armory/view';
import type { CotsLibrary, PartSubsystem } from '$lib/armory/part-numbers';

/**
 * /armory/cots: the shared COTS library (ledger 0405, migration 0274). Every
 * Armory project reads it; somebody on no project is told so in words (the
 * page's existence is no secret, so this is not a 404). A database without
 * 0274 says "not switched on yet".
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('armory:cots');
	const email = signedInEmail(locals.claims);
	if (!email) return { email: null, notReady: false, onNoProject: false, library: null, subsystems: [] as PartSubsystem[] };
	const { data, error: e } = await locals.supabase.rpc('armory_cots_list');
	if (e) {
		if (armoryNotReady(e)) return { email, notReady: true, onNoProject: false, library: null, subsystems: [] as PartSubsystem[] };
		if (e.code === '42501') return { email, notReady: false, onNoProject: true, library: null, subsystems: [] as PartSubsystem[] };
		error(500, 'The COTS library could not be read. Try again.');
	}
	// The subsystem codes sit on this page too: the same readers, the same curators.
	const subs = await locals.supabase.from('armory_part_subsystems').select('code, name, retired_at').order('sort_order').order('code');
	const subsystems: PartSubsystem[] = (subs.data ?? []).map((r: { code: string; name: string; retired_at: string | null }) => ({
		code: r.code,
		name: r.name,
		retired: r.retired_at !== null
	}));
	return { email, notReady: false, onNoProject: false, library: data as CotsLibrary, subsystems };
};
