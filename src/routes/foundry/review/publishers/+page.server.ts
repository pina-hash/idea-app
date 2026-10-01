import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import {
	publisherPendingCount,
	publisherRead,
	type FoundryPublisherApplication,
	type FoundryPublisherQuestionAdmin
} from '$lib/foundry/publisher';
import type { FoundryTrustedRow } from '$lib/foundry/transports';
import type { PageServerLoad } from './$types';

/**
 * THE PEOPLE HALF OF THE REVIEW LANE (ledger 0360): publisher applications
 * (report 6d076258), the questions they answer, and the trusted roster that
 * used to sit under the queue (report 647d1201).
 *
 * ADMIN ONLY, 404 OTHERWISE. The area's `+layout.server.ts` is the gate; this
 * check is the same one again, defence in depth, because a page that loads
 * every applicant's answers is the last place to rely on a layout alone.
 *
 * FOUR READS, ALL AS THE CALLER. Each answers nothing but a raise to a
 * non-admin, so none of them is gated twice here. The three 0230 reads go
 * through `publisherRead`, so `PGRST202` (the migration not applied yet)
 * becomes "not switched on yet" rather than a broken page; the roster is
 * 0173's and degrades to empty exactly as it did on the queue page.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.claims?.sub ?? null;
	if (!uid) error(404, 'Not found');
	if (!(await isAdmin(locals.supabase, uid))) error(404, 'Not found');

	const [pending, decided, questions, roster] = await Promise.all([
		locals.supabase.rpc('foundry_publisher_applications', { p_status: 'pending' }),
		locals.supabase.rpc('foundry_publisher_applications', { p_status: 'decided' }),
		locals.supabase.rpc('foundry_publisher_questions_admin'),
		locals.supabase.rpc('foundry_trusted_roster')
	]);

	const pendingRead = publisherRead<FoundryPublisherApplication[]>(pending.data, pending.error);

	return {
		pending: pendingRead,
		decided: publisherRead<FoundryPublisherApplication[]>(decided.data, decided.error),
		questions: publisherRead<FoundryPublisherQuestionAdmin[]>(questions.data, questions.error),
		trusted: (roster.data ?? []) as FoundryTrustedRow[],
		pendingApplications:
			pendingRead.state === 'ready' ? publisherPendingCount(pendingRead.value.length, null) : null
	};
};
