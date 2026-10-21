/**
 * /admin/view-as: see the site as anyone, or act on their account (ledger 0422,
 * feedback d1c9ed15). Admin tier: a non-admin gets 404, never a redirect. The
 * search reads profiles through the admin's own "select all profiles" policy;
 * the record is `view_as_history`, which re-checks `is_admin()`.
 *
 * `start` is the one way in, from here, from a student's page in a class, from
 * the admin console's roster and from the test accounts page. It is a plain
 * form post (never enhanced) so the browser does a full page load as the
 * person afterwards.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { startViewAs, ViewAsRefused } from '$lib/server/view-as/flow';
import type { Actions, PageServerLoad } from './$types';

export interface PersonRow {
	id: string;
	email: string | null;
	full_name: string | null;
	display_name: string | null;
	role: string | null;
	avatar_url: string | null;
}

export interface SessionRecord {
	session: string;
	mode: 'view' | 'act';
	admin_email: string;
	admin_name: string | null;
	target_email: string;
	target_name: string | null;
	started_at: string;
	ended_at: string | null;
	expires_at: string;
	changes: { table: string; operation: string; path: string | null; at: string }[];
}

const SAFE_Q = /[^a-zA-Z0-9@._\- ']/g;

export const load: PageServerLoad = async ({ url, locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');
	const q = (url.searchParams.get('q') ?? '').replace(SAFE_Q, '').trim().slice(0, 60);
	let people: PersonRow[] = [];
	if (q.length >= 2) {
		const like = `%${q}%`;
		const { data } = await supabase
			.from('profiles')
			.select('id, email, full_name, display_name, role, avatar_url')
			.or(`full_name.ilike.${like},display_name.ilike.${like},email.ilike.${like}`)
			.order('full_name', { ascending: true })
			.limit(40);
		people = ((data ?? []) as PersonRow[]).filter((p) => p.id !== claims.sub);
	}
	const hist = await supabase.rpc('view_as_history', { p_limit: 30 });
	return {
		q,
		people,
		ready: !hist.error,
		history: (hist.data ?? []) as SessionRecord[]
	};
};

export const actions: Actions = {
	start: async ({ request, locals: { supabase, claims }, cookies }) => {
		if (!claims) error(404, 'Not found');
		if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');
		const form = await request.formData();
		const user = String(form.get('user') ?? '');
		const mode = form.get('mode') === 'act' ? 'act' : 'view';
		const nextRaw = String(form.get('next') ?? '/');
		const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') && !nextRaw.startsWith('/admin') ? nextRaw : '/';
		if (!/^[0-9a-f-]{36}$/i.test(user)) return fail(400, { message: 'Choose a person first.' });
		try {
			await startViewAs(supabase, cookies, user, mode);
		} catch (e) {
			return fail(400, { message: e instanceof ViewAsRefused ? e.message : 'That account could not be opened right now.' });
		}
		redirect(303, next);
	}
};
