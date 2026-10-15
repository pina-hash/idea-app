import { error } from '@sveltejs/kit';
import { requireCertifier } from '$lib/server/certifications/gate';
import { formatCertTime } from '$lib/certifications/status';
import { isRefusal } from '$lib/certifications/types';
import type { StudentViewJson } from '$lib/certifications/desk/desk';
import { isUuid, loadRpc, refuseAction, runAction, str } from '../../desk-server';
import type { Actions, PageServerLoad } from './$types';

/**
 * ONE STUDENT'S EVERY CERTIFICATION (the spec's Student view). The address in
 * the path is the one `cert_student_view` is asked about; a refusal (a
 * non-certifier, a student outside the caller's certifications) is a 404, the
 * same answer as an address that names nobody.
 *
 * TWO WRITES LIVE HERE. `inPerson` records a checkout the certifier watched
 * (`cert_checkout_in_person`). `release` releases an approved or booked seat
 * from the student's own page (`cert_exam_release`), which is where a certifier
 * finds the seat: see the desk report's DEVIATIONS for why the sittings page
 * cannot list seats on its own yet.
 */
const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;

export const load: PageServerLoad = async ({ locals, params }) => {
	await requireCertifier(locals);
	const email = params.email.trim().toLowerCase();
	if (!emailOk(email)) error(404, 'Not found');
	const view = await loadRpc<StudentViewJson>(locals.supabase, 'cert_student_view', { p_email: email });
	if (!view.ok) return { title: 'Student', unavailable: true as const, view: null };
	if (!view.data || isRefusal(view.data)) error(404, 'Not found');
	return { title: view.data.name ?? email, unavailable: false as const, view: view.data };
};

export const actions: Actions = {
	inPerson: async ({ request, locals, url }) => {
		await requireCertifier(locals);
		const form = await request.formData();
		const attemptId = str(form, 'attempt_id');
		const decision = str(form, 'decision');
		const feedback = str(form, 'feedback');
		if (!isUuid(attemptId)) return refuseAction('inPerson', 'The attempt was not named.');
		if (decision !== 'pass' && decision !== 'fail') return refuseAction('inPerson', 'Choose Pass or Fail first.', 400, { attempt_id: attemptId });
		if (decision === 'fail' && !feedback) return refuseAction('inPerson', 'A fail needs written feedback so the next attempt is better.', 400, { attempt_id: attemptId });
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'inPerson',
			fn: 'cert_checkout_in_person',
			args: { p_attempt: attemptId, p_decision: decision, p_feedback: feedback },
			okMessage: () => (decision === 'pass' ? 'The checkout is recorded as passed and the student was told.' : 'The checkout is recorded as failed, with your feedback, and the student was told.'),
			extra: () => ({ attempt_id: attemptId })
		});
	},
	release: async ({ request, locals, url }) => {
		await requireCertifier(locals);
		const form = await request.formData();
		const seatId = str(form, 'seat_id');
		const attemptId = str(form, 'attempt_id');
		if (!isUuid(seatId)) return refuseAction('release', 'The seat was not named.', 400, { attempt_id: attemptId });
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'release',
			fn: 'cert_exam_release',
			args: { p_seat: seatId },
			okMessage: (d) => `Released until ${formatCertTime(String(d.release_expires_at ?? ''))}. The exam opens on the student's own screen; watch it on Live exam.`,
			extra: (d) => ({ attempt_id: attemptId, seat_id: seatId, exam_id: d.exam_id ?? null, release_expires_at: d.release_expires_at ?? null })
		});
	}
};
