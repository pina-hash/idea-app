import { json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { createTestAccount, TestAccountRefused } from '$lib/server/view-as/test-accounts';
import { resolveSectionByName } from '$lib/server/view-as/sections';
import type { RequestHandler } from './$types';

/**
 * MAKE A TEST STUDENT, FROM THE CONNECTOR (ledger 0422), optionally in a class
 * named the way he says it ("IDEA100 Block 2") or by id. The admin page at
 * /admin/test-accounts does the same through the same module. Admin only.
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims || !(await isAdmin(supabase, claims.sub))) return json({ error: 'Not found' }, { status: 404 });
	const body = (await request.json().catch(() => ({}))) as { label?: unknown; class?: unknown };
	let section: string | null = null;
	if (typeof body.class === 'string' && body.class.trim()) {
		const found = await resolveSectionByName(supabase, body.class);
		if (!found.ok) return json({ error: found.message }, { status: 400 });
		section = found.id;
	}
	try {
		const made = await createTestAccount(supabase, String(body.label ?? ''), section);
		return json({ ok: true, ...made, class: section });
	} catch (e) {
		return json({ error: e instanceof TestAccountRefused ? e.message : 'The test account could not be created right now.' }, { status: 400 });
	}
};
