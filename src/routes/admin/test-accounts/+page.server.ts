/**
 * /admin/test-accounts (ledger 0422, feedback d1c9ed15). Test student accounts:
 * students that appear in no roster, grade view, count, leaderboard, stock
 * board or badge, for seeing and trying a class as a student would. Admin
 * tier: a non-admin gets 404. Every write is the admin's own session calling a
 * 0288 function that re-checks `is_admin()`; making the auth user behind one
 * is the only step that needs the service role ($lib/server/view-as/service).
 */
import { error, fail } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { createTestAccount, enrollTestAccount, listTestAccounts, TestAccountRefused } from '$lib/server/view-as/test-accounts';
import type { Actions, PageServerLoad } from './$types';

export interface SectionChoice {
	id: string;
	label: string;
}

async function gate(supabase: App.Locals['supabase'], claims: App.Locals['claims']) {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');
}

export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	await gate(supabase, claims);
	const [accounts, sections] = await Promise.all([
		listTestAccounts(supabase),
		supabase.from('classroom_sections').select('id, label, active, classroom_courses(code)').order('label')
	]);
	const choices: SectionChoice[] = ((sections.data ?? []) as { id: string; label: string; active?: boolean; classroom_courses: { code: string } | { code: string }[] | null }[])
		.filter((s) => s.active !== false)
		.map((s) => {
			const c = Array.isArray(s.classroom_courses) ? s.classroom_courses[0] : s.classroom_courses;
			return { id: s.id, label: `${c?.code ?? ''} ${s.label}`.trim() };
		})
		.sort((a, b) => a.label.localeCompare(b.label));
	return { ready: accounts !== null, accounts: accounts ?? [], sections: choices };
};

const sectionOf = (v: FormDataEntryValue | null) => {
	const s = String(v ?? '');
	return /^[0-9a-f-]{36}$/i.test(s) ? s : null;
};

export const actions: Actions = {
	create: async ({ request, locals: { supabase, claims } }) => {
		await gate(supabase, claims);
		const form = await request.formData();
		try {
			const made = await createTestAccount(supabase, String(form.get('label') ?? ''), sectionOf(form.get('section')));
			return { message: `${made.label} is ready.` };
		} catch (e) {
			return fail(400, { message: e instanceof TestAccountRefused ? e.message : 'The test account could not be created right now.' });
		}
	},
	enroll: async ({ request, locals: { supabase, claims } }) => {
		await gate(supabase, claims);
		const form = await request.formData();
		const section = sectionOf(form.get('section'));
		if (!section) return fail(400, { message: 'Choose a class.' });
		try {
			await enrollTestAccount(supabase, String(form.get('email') ?? ''), section, String(form.get('label') ?? '') || undefined);
			return { message: 'Added to the class.' };
		} catch (e) {
			return fail(400, { message: e instanceof TestAccountRefused ? e.message : 'That did not work.' });
		}
	},
	retire: async ({ request, locals: { supabase, claims } }) => {
		await gate(supabase, claims);
		const form = await request.formData();
		const { error: e } = await supabase.rpc('test_account_retire', { p_email: String(form.get('email') ?? '') });
		if (e) return fail(400, { message: e.message });
		return { message: 'Retired. It is out of every class and stays hidden.' };
	}
};
