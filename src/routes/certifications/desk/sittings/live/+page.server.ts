import { requireCertifier } from '$lib/server/certifications/gate';
import type { ExamLiveRow } from '$lib/certifications/types';
import { dataOrNull, isUuid, loadRpc, refuseAction, runAction, str } from '../../desk-server';
import type { Actions, PageServerLoad } from './$types';

/**
 * LIVE PROCTORING: the first read of `cert_exam_live` (every exam released
 * today or in progress for the caller's certifications); the page then
 * refreshes it itself through `startPoller`. `end` ends an in-progress exam
 * from the proctor's side (`cert_exam_end`, submitting it as it stands).
 */
export const load: PageServerLoad = async ({ locals }) => {
	await requireCertifier(locals);
	const live = await loadRpc<ExamLiveRow[]>(locals.supabase, 'cert_exam_live', { p_cert: null });
	return { title: 'Live exam', unavailable: !live.ok, rows: dataOrNull(live) ?? [] };
};

export const actions: Actions = {
	end: async ({ request, locals, url }) => {
		await requireCertifier(locals);
		const form = await request.formData();
		const examId = str(form, 'exam_id');
		const reason = str(form, 'reason') || 'Ended by the proctor.';
		if (!isUuid(examId)) return refuseAction('end', 'The exam was not named.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'end',
			fn: 'cert_exam_end',
			args: { p_exam: examId, p_reason: reason },
			okMessage: (d) => (d.passed === true ? 'Ended and scored: passed.' : d.passed === false ? 'Ended and scored: failed. The cooldown starts now.' : 'Ended.'),
			extra: () => ({ exam_id: examId })
		});
	}
};
