import { error, redirect } from '@sveltejs/kit';
import { canAuthorGauntlet } from '$lib/server/gauntlet-authoring';
import type { PageServerLoad } from './$types';

/**
 * Edit-challenge form. Open to the AUTHOR TIER since 0155 (server-checked). The
 * full challenge, including the hidden `answer`, is fetched through the
 * SECURITY DEFINER `gauntlet_author_get` RPC, which does its own
 * `gauntlet_can_author()` check -- so answers are readable by an admin or an
 * allowlisted author, and by nobody else.
 *
 * A refused caller goes to `/gauntlet/author`, which speaks the refusal. See
 * the new-challenge route for why the sentence lives in one place.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, params }) => {
	if (!claims) {
		redirect(303, '/');
	}

	if (!(await canAuthorGauntlet(supabase, claims.sub))) {
		redirect(303, '/gauntlet/author');
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
