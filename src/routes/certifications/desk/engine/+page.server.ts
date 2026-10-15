import { redirect } from '@sveltejs/kit';
import { requireCertAdmin, requireCertifier } from '$lib/server/certifications/gate';
import { deskEngineHref } from '$lib/certifications/nav';
import { emptyPackage, type CertSettings } from '$lib/certifications/types';
import type { AdminListRow } from '$lib/certifications/desk/desk';
import { dataOrNull, loadRpc, refuseAction, runAction, str } from '../desk-server';
import type { Actions, PageServerLoad } from './$types';

/**
 * THE ENGINE'S LIST (a certifier reads, an admin writes): `cert_admin_list`
 * and the four `cert_settings`. `create` makes a draft from `emptyPackage()`
 * plus a code and a name and opens its editor; `settings` writes the four
 * fields through `cert_settings_set`.
 */
export const load: PageServerLoad = async ({ locals }) => {
	await requireCertifier(locals);
	const [rows, settings] = await Promise.all([
		loadRpc<AdminListRow[]>(locals.supabase, 'cert_admin_list'),
		loadRpc<CertSettings>(locals.supabase, 'cert_settings')
	]);
	return { title: 'Engine', unavailable: !rows.ok, rows: dataOrNull(rows) ?? [], settings: dataOrNull(settings) };
};

export const actions: Actions = {
	create: async ({ request, locals, url }) => {
		await requireCertAdmin(locals);
		const form = await request.formData();
		const code = str(form, 'code').toUpperCase();
		const name = str(form, 'name');
		if (!/^[A-Z0-9][A-Z0-9-]{0,31}$/.test(code)) return refuseAction('create', 'A code is uppercase letters, digits and hyphens, 1 to 32 characters, starting with a letter or digit.');
		if (!name) return refuseAction('create', 'A name is required.');
		const answer = await runAction({
			supabase: locals.supabase,
			url,
			action: 'create',
			fn: 'cert_admin_save',
			args: { p_id: null, p_package: { ...emptyPackage(), code, name }, p_note: 'Created in the engine' },
			okMessage: () => `${code} was created as a draft.`,
			extra: (d) => ({ id: d.id })
		});
		if ('ok' in answer && answer.ok && typeof answer.data?.id === 'string') redirect(303, deskEngineHref(answer.data.id));
		return answer;
	},
	settings: async ({ request, locals, url }) => {
		await requireCertAdmin(locals);
		const form = await request.formData();
		const expiry = str(form, 'school_year_expiry');
		if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return refuseAction('settings', 'The expiry is a calendar date.');
		const whole = (key: string) => {
			const n = Number(str(form, key));
			return Number.isInteger(n) ? n : null;
		};
		const dormancy = whole('dormancy_days');
		const checkin = whole('checkin_timeout_seconds');
		const release = whole('release_window_minutes');
		if (dormancy === null || checkin === null || release === null) return refuseAction('settings', 'Each of the three numbers is a whole number.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'settings',
			fn: 'cert_settings_set',
			args: { p: { school_year_expiry: expiry || null, dormancy_days: dormancy, checkin_timeout_seconds: checkin, release_window_minutes: release } },
			okMessage: () => 'Settings saved.'
		});
	}
};
