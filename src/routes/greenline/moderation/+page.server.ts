import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import {
	GREENLINE_DECALS_BUCKET,
	loadPendingDecals,
	type PendingDecal
} from '$lib/greenline/decals';
import { displayName } from '$lib/profile';
import type { PageServerLoad } from './$types';

/**
 * GREENLINE moderation: ADMIN-ONLY (0067; was teacher-only in Bundle 4b).
 *
 * Anyone signed in who is not an admin gets a 404 rather than a redirect (it
 * tells a probing student nothing); anonymous visitors never reach this load
 * at all, because `/greenline` is in hooks.server.ts's authedPrefixes and they
 * are redirected to `/` first (the portal's standard signed-out handling).
 *
 * This gate is convenience/discoverability only — the real boundary is
 * `is_teacher()` INSIDE greenline_track_set_featured, greenline_track_remove,
 * greenline_track_review and greenline_decal_review, and since 0067 that
 * function resolves to the admin check, so a non-admin cannot call them
 * successfully no matter what they reach.
 *
 * THIS PAGE CARRIES BOTH GREENLINE QUEUES, AND THAT IS THE POINT OF THE LOAD
 * BELOW. GREENLINE has two things a student submits and waits on — a community
 * track (0057/0059) and a custom decal (0051) — and until now the two queues
 * lived on two different pages in two different subsystems: tracks here, decals
 * on `/dashboard`. A teacher who opened the page called "GREENLINE track
 * moderation" saw exactly half of what was waiting on them, with nothing
 * anywhere saying the other half existed. The decal queue on `/dashboard` is
 * unchanged and stays where it is; this is the same queue reachable from
 * GREENLINE's own moderation surface, wired to the same RPC.
 *
 * THE IMAGES ARE SIGNED SERVER-SIDE, exactly as the dashboard does it. The
 * `greenline-decals` bucket is private and its read policy admits a teacher, so
 * the signing runs on `locals.supabase` — the CALLER's own client, never a
 * service-role one. The route is not the authorization boundary: storage RLS is.
 */
export const prerender = false;

/** One row of the decal queue, with its image already resolved. */
export interface DecalQueueRow extends PendingDecal {
	/** Display name from profiles, falling back to the address's local part. */
	studentName: string;
	studentEmail: string | null;
	/** Short-lived signed URL, or null when the object is gone / unreadable. */
	imageUrl: string | null;
}

export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');

	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

	// Fails soft to an apply-migration note rather than a broken panel: 0051
	// unapplied is a real deployment state, not an error.
	const { ready: decalsReady, rows } = await loadPendingDecals(supabase);

	let decalQueue: DecalQueueRow[] = [];
	if (rows.length) {
		// Names come from profiles for the ids the queue actually holds, through
		// the SHARED `displayName` ladder rather than a fourth spelling of it.
		// (Foundry forbids that helper on ITS surfaces because its third rung is
		// the email address and the gallery is readable by every student; this
		// page is admin-only and the queue prints the address beside the name
		// anyway, so the rung discloses nothing new here.)
		//
		// A row with NO profile keeps its uuid rather than inventing a person:
		// the roster-shaped-list rule — never create somebody because an id
		// turned up in the data.
		const ids = rows.map((r) => r.userId);
		const [{ data: people }, signed] = await Promise.all([
			supabase.from('profiles').select('id, display_name, full_name, email').in('id', ids),
			supabase.storage
				.from(GREENLINE_DECALS_BUCKET)
				.createSignedUrls(
					rows.map((r) => r.path),
					3600
				)
		]);
		const byId = new Map(
			(people ?? []).map((p) => [
				(p as { id: string }).id,
				p as { id: string; display_name: string | null; full_name: string | null; email: string | null }
			])
		);
		decalQueue = rows.map((r, i) => {
			const p = byId.get(r.userId);
			return {
				...r,
				studentName: p
					? displayName({
							display_name: p.display_name,
							full_name: p.full_name,
							email: p.email
						} as Parameters<typeof displayName>[0])
					: r.userId,
				studentEmail: p?.email ?? null,
				imageUrl: signed.data?.[i]?.signedUrl ?? null
			};
		});
	}

	return { decalsReady, decalQueue };
};
