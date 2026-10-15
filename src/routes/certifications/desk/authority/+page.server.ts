import { requireCertAdmin } from '$lib/server/certifications/gate';
import type { AdminListRow, AuthorityRow } from '$lib/certifications/desk/desk';
import { dataOrNull, isUuid, loadRpc, refuseAction, runAction, str } from '../desk-server';
import type { Actions, PageServerLoad } from './$types';

/**
 * THE AUTHORITY GRID, admin only (DECISIONS D5): the live grants
 * (`cert_authority_list`) and every certification (`cert_admin_list`), and the
 * two writes, grant and revoke. A grant is one whole power per certification.
 */
export const load: PageServerLoad = async ({ locals }) => {
	await requireCertAdmin(locals);
	const [grants, certifications] = await Promise.all([
		loadRpc<AuthorityRow[]>(locals.supabase, 'cert_authority_list'),
		loadRpc<AdminListRow[]>(locals.supabase, 'cert_admin_list')
	]);
	return {
		title: 'Authority',
		unavailable: !grants.ok || !certifications.ok,
		grants: dataOrNull(grants) ?? [],
		certifications: dataOrNull(certifications) ?? []
	};
};

export const actions: Actions = {
	grant: async ({ request, locals, url }) => {
		await requireCertAdmin(locals);
		const form = await request.formData();
		const certId = str(form, 'certification_id');
		const email = str(form, 'email').toLowerCase();
		const note = str(form, 'note');
		if (!isUuid(certId)) return refuseAction('grant', 'Choose a certification.');
		if (!email.includes('@')) return refuseAction('grant', 'A school email address is required.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'grant',
			fn: 'cert_authority_grant',
			args: { p_cert: certId, p_email: email, p_note: note || null },
			okMessage: () => `${email} now holds authority over that certification.`
		});
	},
	revoke: async ({ request, locals, url }) => {
		await requireCertAdmin(locals);
		const form = await request.formData();
		const certId = str(form, 'certification_id');
		const email = str(form, 'email').toLowerCase();
		if (!isUuid(certId) || !email.includes('@')) return refuseAction('revoke', 'The grant was not named.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'revoke',
			fn: 'cert_authority_revoke',
			args: { p_cert: certId, p_email: email },
			okMessage: () => `${email} no longer holds authority over that certification.`
		});
	}
};
