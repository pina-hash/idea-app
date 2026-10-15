import { error } from '@sveltejs/kit';
import { requireCertAdmin, requireCertifier } from '$lib/server/certifications/gate';
import { isRefusal, type CertAwardJson } from '$lib/certifications/types';
import { isUuid, loadRpc, refuseAction, runAction, str } from '../../desk-server';
import type { Actions, PageServerLoad } from './$types';

/**
 * ONE AWARD'S RECORD (`cert_award_get`): the facts, the status and the
 * history. The actions (suspend, reinstate, revoke) are an admin's, each with
 * a required reason, through `cert_award_action`; the holder is notified and
 * the mirror refreshed. A correction posts to `/api/certifications/correct`
 * from the page, because it re-signs the record.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	await requireCertifier(locals);
	if (!isUuid(params.awardId)) error(404, 'Not found');
	const award = await loadRpc<CertAwardJson>(locals.supabase, 'cert_award_get', { p_id: params.awardId });
	if (!award.ok) return { title: 'Record', unavailable: true as const, award: null };
	if (!award.data || isRefusal(award.data)) error(404, 'Not found');
	return { title: `Record ${award.data.serial}`, unavailable: false as const, award: award.data };
};

const ACTIONS = new Set(['suspend', 'reinstate', 'revoke']);

export const actions: Actions = {
	action: async ({ request, locals, url, params }) => {
		await requireCertAdmin(locals);
		const form = await request.formData();
		const action = str(form, 'action');
		const reason = str(form, 'reason');
		if (!isUuid(params.awardId)) return refuseAction('action', 'The award was not named.');
		if (!ACTIONS.has(action)) return refuseAction('action', 'Choose Suspend, Reinstate or Revoke.');
		if (!reason) return refuseAction('action', 'Every action on a record needs a written reason.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'action',
			fn: 'cert_award_action',
			args: { p_award: params.awardId, p_action: action, p_reason: reason },
			mirror: 'award',
			okMessage: () =>
				action === 'suspend'
					? 'The award is suspended. The holder was told and the verify page says Suspended.'
					: action === 'reinstate'
						? 'The award is reinstated. The holder was told and the verify page says Valid.'
						: 'The award is revoked, for good. The holder was told and the verify page says Revoked.'
		});
	}
};
