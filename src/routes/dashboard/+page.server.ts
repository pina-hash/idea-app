import { redirect } from '@sveltejs/kit';
import { loadProgressForUsers } from '$lib/frc/progression';
import { loadPendingSubmissions } from '$lib/frc/gate-submissions';
import { GREENLINE_DECALS_BUCKET, loadPendingDecals } from '$lib/greenline/decals';
import { loadGreenlinePending } from '$lib/greenline/moderation';
import { isAdmin } from '$lib/server/admin';
import type { Actions, PageServerLoad } from './$types';

/**
 * The dashboard is the ADMIN area (0067), not merely a staff one: it carries
 * the role editor, student contact data and three moderation queues. An
 * ordinary @boscotech.edu teacher is redirected to `/` like anyone else.
 * (hooks.server.ts already redirects anonymous users off `/dashboard`.)
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	if (!(await isAdmin(supabase, claims.sub))) {
		redirect(303, '/');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, email, avatar_url, role')
		.eq('id', claims.sub)
		.single();

	// Student roster for the pathway admin view. Admins read every profile via
	// the "teachers select all profiles" RLS policy (whose is_teacher() now
	// resolves to the admin check); pathway edits go through "teachers update
	// any profile" the same way. Fails soft to an empty roster until migration
	// 0038 adds the pathway column.
	const { data: students, error: rosterError } = await supabase
		.from('profiles')
		.select('id, email, full_name, display_name, avatar, avatar_url, pathway')
		.eq('role', 'student')
		.order('full_name', { ascending: true });

	// FRC unit completions for the roster (teacher override). Fails soft to an
	// empty map with frcProgressReady=false until migration 0039 is applied.
	const { ready: frcProgressReady, byUser: frcProgress } = await loadProgressForUsers(
		supabase,
		(students ?? []).map((s) => s.id)
	);

	// FRC modeling-gate submissions awaiting review (the teacher queue). Fails
	// soft to an empty queue with frcReviewReady=false until migration 0042 is
	// applied. Student display data is joined client-side from the roster above.
	const { ready: frcReviewReady, rows: frcReviewQueue } = await loadPendingSubmissions(supabase);

	// GREENLINE decal uploads awaiting review (the teacher queue). Fails soft to
	// an empty queue with greenlineDecalReady=false until migration 0051 is
	// applied. The images live in the private greenline-decals bucket; signed
	// URLs are minted here under the teacher's own storage read policy so the
	// queue can show exactly what was submitted.
	const { ready: greenlineDecalReady, rows: decalRows } = await loadPendingDecals(supabase);
	let greenlineDecalQueue: {
		userId: string;
		path: string;
		imageUrl: string | null;
		submittedAt: string | null;
	}[] = [];
	if (decalRows.length) {
		const { data: signed } = await supabase.storage
			.from(GREENLINE_DECALS_BUCKET)
			.createSignedUrls(
				decalRows.map((r) => r.path),
				3600
			);
		greenlineDecalQueue = decalRows.map((r, i) => ({
			...r,
			imageUrl: signed?.[i]?.signedUrl ?? null
		}));
	}

	/**
	 * WHAT IS WAITING IN THE TWO GREENLINE QUEUES, for the moderation card's
	 * count. Read through `loadGreenlinePending`, which is the ONE reader of
	 * that question and already backs GREENLINE's own title screen -- a second
	 * count computed on this page is how a badge comes to disagree with the
	 * page it links to. Safe to call unconditionally HERE and only here: the
	 * load has already redirected every non-admin above, so the `isAdmin` gate
	 * every other call site states is the redirect on line 19.
	 *
	 * Fails soft to `ready: false` on a pre-0051/0059 deployment, which the
	 * card renders as "count unavailable" rather than as zero.
	 */
	const greenlinePending = await loadGreenlinePending(supabase);

	// New-report count for the Feedback entry point card. Same RPC the console
	// itself reads (app_feedback_admin_list); fails soft to 0 pending a
	// migration rather than blocking the rest of the dashboard.
	const { data: feedbackRows } = await supabase.rpc('app_feedback_admin_list');
	const feedbackNewCount = ((feedbackRows ?? []) as { status: string }[]).filter(
		(r) => r.status === 'new'
	).length;

	return {
		profile,
		email: claims.email ?? profile?.email ?? null,
		students: students ?? [],
		rosterReady: !rosterError,
		frcProgress,
		frcProgressReady,
		frcReviewQueue,
		frcReviewReady,
		greenlineDecalQueue,
		greenlineDecalReady,
		greenlinePending,
		feedbackNewCount
	};
};

export const actions: Actions = {
	signout: async ({ locals: { supabase } }) => {
		await supabase.auth.signOut();
		redirect(303, '/');
	}
};
