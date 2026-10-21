import { json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { listTestAccounts } from '$lib/server/view-as/test-accounts';
import type { RequestHandler } from './$types';

/**
 * TEST STUDENT ACCOUNTS FOR THE CONNECTOR (ledger 0422). Lists them; `create`
 * beside this route makes one. The admin page at /admin/test-accounts does the same through
 * the same module. Admin only: anyone else gets 404.
 */
export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
	if (!claims || !(await isAdmin(supabase, claims.sub))) return json({ error: 'Not found' }, { status: 404 });
	const accounts = await listTestAccounts(supabase);
	if (!accounts) return json({ error: 'Test accounts are not available yet.' }, { status: 503 });
	return json({ accounts });
};
