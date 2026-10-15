import { error } from '@sveltejs/kit';
import { requireCertifier } from '$lib/server/certifications/gate';
import { isRefusal, type CertGetJson, type CertSubmissionJson } from '$lib/certifications/types';
import type { StudentViewJson } from '$lib/certifications/desk/desk';
import { isUuid, loadRpc, refuseAction, runAction, str } from '../../desk-server';
import type { Actions, PageServerLoad } from './$types';

/**
 * ONE SUBMISSION TO DECIDE (the spec's Review screen). There is no function
 * that answers a submission by its id alone: it is read through the STUDENT'S
 * view (`cert_student_view`), so the student's address rides on the link as
 * `?student=` (the queue and the student page both put it there), and a link
 * without it is resolved by scanning the desk's own queue for the submission.
 * A submission that is not in that view is a 404, the same as one that does
 * not exist. The project spec beside it comes from `cert_get(code)`, the
 * certification's current package.
 */
export const load: PageServerLoad = async ({ locals, params, url, parent }) => {
	await requireCertifier(locals);
	const submissionId = params.submissionId;
	if (!isUuid(submissionId)) error(404, 'Not found');
	const { desk } = await parent();
	let email = (url.searchParams.get('student') ?? '').trim().toLowerCase();
	if (!email) email = desk?.queue.find((q) => q.submission_id === submissionId)?.student.email ?? '';
	if (!email.includes('@')) error(404, 'Not found');

	const view = await loadRpc<StudentViewJson>(locals.supabase, 'cert_student_view', { p_email: email });
	if (!view.ok) return { title: 'Review', unavailable: true as const, submission: null, attempt: null, student: null, spec: null, checkout: null };
	if (!view.data || isRefusal(view.data)) error(404, 'Not found');
	let submission: CertSubmissionJson | null = null;
	let attempt: StudentViewJson['attempts'][number] | null = null;
	for (const a of view.data.attempts) {
		const s = a.submissions.find((x) => x.id === submissionId);
		if (s) {
			submission = s;
			attempt = a;
			break;
		}
	}
	if (!submission || !attempt) error(404, 'Not found');

	const got = await loadRpc<CertGetJson | null>(locals.supabase, 'cert_get', { p_code: attempt.certification.code });
	const pkg = got.ok && got.data && !isRefusal(got.data) ? got.data.package : null;
	const spec = submission.part === 'guided' ? pkg?.guided_project ?? null : submission.part === 'autonomous' ? pkg?.autonomous_project ?? null : null;
	return {
		title: `Review: ${view.data.name ?? email}`,
		unavailable: false as const,
		submission,
		attempt,
		student: { email: view.data.email, name: view.data.name },
		spec,
		checkout: pkg?.checkout ?? null
	};
};

export const actions: Actions = {
	decide: async ({ request, locals, url, params }) => {
		await requireCertifier(locals);
		const form = await request.formData();
		const decision = str(form, 'decision');
		const feedback = str(form, 'feedback');
		if (!isUuid(params.submissionId)) return refuseAction('decide', 'The submission was not named.');
		if (decision !== 'pass' && decision !== 'fail') return refuseAction('decide', 'Choose Pass or Fail first.');
		if (decision === 'fail' && !feedback) return refuseAction('decide', 'A fail needs written feedback so the next attempt is better.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'decide',
			fn: 'cert_review',
			args: { p_submission: params.submissionId, p_decision: decision, p_feedback: feedback },
			okMessage: () => (decision === 'pass' ? 'Passed. The part is checked off and the student was told.' : 'Failed, with your feedback. The student was told and can resubmit.')
		});
	}
};
