import { redirect } from '@sveltejs/kit';
import { exitViewAs } from '$lib/server/view-as/flow';
import type { RequestHandler } from './$types';

/**
 * LEAVING VIEW AS OR ACT AS (ledger 0422). The floating panel's one button posts
 * here. It needs no admin check, because the session it ends is the target's
 * and the one it restores is whatever the admin's own refresh token opens.
 * A plain form post, so the browser does a full page load and its Supabase
 * client starts over with the admin's cookies.
 */
export const POST: RequestHandler = async ({ locals, cookies, url }) => {
	const { restored } = await exitViewAs(locals.supabase, cookies);
	const back = url.searchParams.get('to');
	const safe = back && back.startsWith('/') && !back.startsWith('//') ? back : '/admin/view-as';
	redirect(303, restored ? safe : '/');
};
