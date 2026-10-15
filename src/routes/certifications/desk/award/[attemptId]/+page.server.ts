import { error } from '@sveltejs/kit';
import { deskShell } from '$lib/certifications/student/shell';
import { requireCertifier } from '$lib/server/certifications/gate';
import { isRefusal, type AwardRecordPreview, type CertAttemptJson } from '$lib/certifications/types';
import type { StudentViewJson } from '$lib/certifications/desk/desk';
import { isUuid, loadRpc } from '../../desk-server';
import type { PageServerLoad } from './$types';

/**
 * THE AWARD PAGE (the spec's Award screen). The attempt is read through the
 * student's view (`?student=` on the link, or the desk payload scanned for
 * the attempt), and `cert_award_prepare` is run so the page can say in words
 * why the key is dark: a part still pending, no name on the profile, the
 * school-year expiry unset, or not the caller's certification. The confirm
 * itself posts to `/api/certifications/award`, the one route that holds the
 * signing key.
 */
export const load: PageServerLoad = async ({ locals, params, url, parent }) => {
	await requireCertifier(locals);
	const attemptId = params.attemptId;
	if (!isUuid(attemptId)) error(404, 'Not found');
	const { desk, callerEmail } = await parent();
	let email = (url.searchParams.get('student') ?? '').trim().toLowerCase();
	if (!email) {
		email =
			desk?.queue.find((q) => q.attempt_id === attemptId)?.student.email ??
			desk?.requests.find((r) => r.attempt_id === attemptId)?.student.email ??
			'';
	}
	if (!email.includes('@')) error(404, 'Not found');

	const view = await loadRpc<StudentViewJson>(locals.supabase, 'cert_student_view', { p_email: email });
	if (!view.ok) return { title: 'Award', shell: deskShell('Award'), unavailable: true as const, attempt: null, student: null, record: null, refusal: null, callerEmail };
	if (!view.data || isRefusal(view.data)) error(404, 'Not found');
	const attempt: CertAttemptJson | undefined = view.data.attempts.find((a) => a.id === attemptId);
	if (!attempt) error(404, 'Not found');

	const prepared = await loadRpc<{ ok: true; record: AwardRecordPreview } | { ok: false; reason: string; message: string }>(
		locals.supabase,
		'cert_award_prepare',
		{ p_attempt: attemptId }
	);
	let record: AwardRecordPreview | null = null;
	let refusal: { reason: string; message: string } | null = null;
	if (prepared.ok && prepared.data) {
		const answer = prepared.data;
		if (answer.ok === true) record = answer.record ?? null;
		else refusal = { reason: answer.reason, message: answer.message };
	} else if (!prepared.ok) {
		refusal = { reason: 'unavailable', message: 'The award cannot be prepared yet: this part of IDEA Certifications is not available on this database.' };
	}
	return {
		title: `Award: ${view.data.name ?? email}`, shell: deskShell(`Award: ${view.data.name ?? email}`),
		unavailable: false as const,
		attempt,
		student: { email: view.data.email, name: view.data.name },
		record,
		refusal,
		callerEmail
	};
};
