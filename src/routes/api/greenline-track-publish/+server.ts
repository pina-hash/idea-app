import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { validatePublishTrack } from '$lib/greenline/builder/validate';
import { lapLengthM } from '$lib/greenline/tracks';
import { TRACK_NAME_MAX } from '$lib/greenline/community';
import type { RequestHandler } from './$types';

/**
 * GREENLINE community-track publish endpoint (Bundle 4a).
 *
 * This is the ONLY write path into greenline_tracks, and it is a SvelteKit
 * server endpoint rather than a client-callable RPC for one load-bearing
 * reason: authoritative validation is the game's REAL parseTrack /
 * buildRuntime / surfaceState / LapTracker code paths
 * (validatePublishTrack in src/lib/greenline/builder/validate.ts) — TypeScript
 * that cannot run inside Postgres and must not be re-implemented in SQL. A
 * submission that fails validation is rejected outright (400), never stored.
 *
 * Auth: the cookie session via locals (the vanguard-save endpoint idiom); the
 * author id comes from the validated claims, and the author display name is
 * read server-side from profiles — neither is client-submitted. The insert
 * itself uses the server-only service-role key (SUPABASE_SERVICE_ROLE_KEY,
 * $env/dynamic/private so it never reaches the client bundle and a missing
 * value degrades to a clear "publishing not configured" response instead of a
 * build break). There is deliberately NO authenticated-role insert grant or
 * publish RPC — either would let a client bypass this validation.
 */

/** Request bodies past this size are rejected before any JSON parse: the
 * committed track files are under 100 KB, so this is purely a hostile-payload
 * ceiling for the serverless function. */
const MAX_BODY_BYTES = 1_500_000;

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ ok: false, error: 'unauthorized' }, { status: 401 });
	}

	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) {
		return json({ ok: false, error: 'payload too large' }, { status: 413 });
	}

	let body: { name?: unknown; track?: unknown };
	try {
		body = JSON.parse(text);
	} catch {
		return json({ ok: false, error: 'invalid json' }, { status: 400 });
	}

	const name = typeof body?.name === 'string' ? body.name.trim() : '';
	if (!name || name.length > TRACK_NAME_MAX) {
		return json(
			{ ok: false, error: `a track name is required (1-${TRACK_NAME_MAX} characters)` },
			{ status: 400 }
		);
	}

	// The authoritative gate: the same real code paths the builder's own
	// validation panel gates on, run here on the submitted payload regardless
	// of what any client claimed about it.
	const v = validatePublishTrack(body?.track);
	if (!v.ok || !v.track) {
		return json(
			{ ok: false, error: 'track failed validation', details: v.errors.slice(0, 8) },
			{ status: 400 }
		);
	}

	const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceKey) {
		return json(
			{ ok: false, error: 'publishing is not configured on this deployment' },
			{ status: 503 }
		);
	}

	// Author display name: the same profile source the rest of the app shows
	// (leaderboards, ProfileMenu), read server-side under the caller's own
	// session — never taken from the request body.
	const { data: profile } = await supabase
		.from('profiles')
		.select('display_name, full_name')
		.eq('id', claims.sub)
		.maybeSingle();
	const authorName =
		(profile?.display_name as string | null)?.trim() ||
		(profile?.full_name as string | null)?.trim() ||
		(typeof claims.email === 'string' ? claims.email.split('@')[0] : '') ||
		'Pilot';

	const admin = createClient(PUBLIC_SUPABASE_URL, serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const { data: row, error } = await admin
		.from('greenline_tracks')
		.insert({
			author_id: claims.sub,
			author_name: authorName,
			name,
			data: v.track,
			length_m: Math.round(lapLengthM(v.track)),
			// EXPLICIT, not relying on the column default (0059). This insert runs
			// with the service-role key, which bypasses RLS entirely, so this is
			// the one write path that could put a row straight into public
			// visibility. Stating 'pending' here means a future change to the
			// column default cannot silently open that door.
			status: 'pending'
		})
		.select('id')
		.single();

	if (error || !row) {
		// A backend without 0059 has no `status` column, so this insert fails
		// rather than silently storing a row that would be visible to everyone
		// the moment it landed. Failing CLOSED is the point; the message says
		// what to apply instead of surfacing a raw PostgREST error.
		const missingStatus =
			error?.code === 'PGRST204' || /status/i.test(error?.message ?? '');
		if (missingStatus) {
			return json(
				{
					ok: false,
					error:
						'track review is not configured on this deployment (apply migration 0059) — nothing was stored'
				},
				{ status: 503 }
			);
		}
		return json({ ok: false, error: error?.message ?? 'insert failed' }, { status: 500 });
	}

	// Pending by default: the author and teachers can see and test-race it, and
	// nobody else can, until the moderation panel approves it.
	return json({ ok: true, id: row.id, trackId: `community:${row.id}`, status: 'pending' });
};
