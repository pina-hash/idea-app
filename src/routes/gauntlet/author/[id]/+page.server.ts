import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Edit-challenge form. Teacher-only (server-checked). The full challenge,
 * including the hidden `answer`, is fetched through the SECURITY DEFINER
 * `gauntlet_author_get` RPC (a teacher may read answers; students never can).
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, params }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', claims.sub)
		.single();

	if (profile?.role !== 'teacher') {
		redirect(303, '/gauntlet');
	}

	const { data: challenge, error: rpcError } = await supabase.rpc('gauntlet_author_get', {
		p_id: params.id
	});

	if (rpcError || !challenge) {
		error(404, 'Challenge not found.');
	}

	return {
		userName: profile?.full_name ?? claims.email ?? 'Teacher',
		userRole: profile?.role ?? 'teacher',
		challenge
	};
};
