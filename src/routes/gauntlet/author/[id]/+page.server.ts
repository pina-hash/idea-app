import { error, redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

/**
 * Edit-challenge form. Admin-only since 0067 (server-checked). The full
 * challenge, including the hidden `answer`, is fetched through the SECURITY
 * DEFINER `gauntlet_author_get` RPC, which does its own is_teacher() check --
 * and that now resolves to the admin check, so answers are admin-readable
 * only.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, params }) => {
	if (!claims) {
		redirect(303, '/');
	}

	if (!(await isAdmin(supabase, claims.sub))) {
		redirect(303, '/gauntlet');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', claims.sub)
		.single();

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
