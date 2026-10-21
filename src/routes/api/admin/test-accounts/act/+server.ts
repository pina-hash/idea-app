import { json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { actAsTestAccount, studentAction, TestAccountRefused } from '$lib/server/view-as/test-accounts';
import type { RequestHandler } from './$types';

/**
 * ACT AS A TEST STUDENT, FROM THE CONNECTOR (ledger 0422). Runs one of the
 * site's functions as the named test student, in an act session: the
 * function's own gates decide exactly as they would for that student, and
 * every write is logged under the admin in the view-as record. Only test
 * accounts; a real student is acted as on the site. Admin only.
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims || !(await isAdmin(supabase, claims.sub))) return json({ error: 'Not found' }, { status: 404 });
	const body = (await request.json().catch(() => ({}))) as { student?: unknown; action?: unknown; post?: unknown; question?: unknown; answer?: unknown; args?: unknown };
	const args = body.args && typeof body.args === 'object' && !Array.isArray(body.args) ? (body.args as Record<string, unknown>) : {};
	try {
		const { fn, args: fnArgs } = studentAction(String(body.action ?? ''), {
			post: typeof body.post === 'string' ? body.post : undefined,
			question: typeof body.question === 'string' ? body.question : undefined,
			answer: body.answer,
			args
		});
		const out = await actAsTestAccount(supabase, String(body.student ?? ''), fn, fnArgs);
		return json({ ok: true, ...out });
	} catch (e) {
		return json({ error: e instanceof TestAccountRefused ? e.message : 'That could not be run as the test student.' }, { status: 400 });
	}
};
