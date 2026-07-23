/**
 * GREENLINE community tracks: the client-side seam onto the tables + RPCs
 * added in 0057_greenline_community_tracks.sql (the persistence.ts
 * convention: pure data-layer, each function takes a Supabase client, does one
 * thing, and fails soft if the migration is unapplied or a call is blocked).
 *
 * Publishing is NOT here-to-Supabase: it goes through the SvelteKit endpoint
 * /api/greenline-track-publish, because authoritative validation runs the
 * game's real parseTrack / buildRuntime / surfaceState / LapTracker code
 * paths in Node before anything is stored (see the endpoint + the 0057
 * migration header). Everything else (report, rate, remove, attempts, the
 * browse list) is a SECURITY DEFINER RPC per the repo convention.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseTrack, type TrackData } from './track-schema';
import { communityTrackId } from './tracks';

/** Reasonable cap on a published track's display name (mirrors the 0057 CHECK). */
export const TRACK_NAME_MAX = 60;

/**
 * Moderation state (0059). A submitted track is `pending` — visible and
 * playable to its AUTHOR and TEACHERS only — until a teacher approves it.
 * `rejected` carries reviewer feedback and is likewise author+staff only.
 * Only `approved` is listed, playable, rateable, or featurable for everyone
 * else; the authoritative gate is the RLS policy + the RPCs in 0059, never
 * this type.
 */
export type TrackStatus = 'pending' | 'approved' | 'rejected';

const asStatus = (v: unknown): TrackStatus =>
	v === 'approved' || v === 'rejected' ? v : 'pending';

/** One published track in the browse list, with its derived telemetry. */
export interface CommunityTrackSummary {
	/** greenline_tracks row uuid — the stable identity. */
	uuid: string;
	/** The catalog id the game races under: `community:<uuid>`. */
	trackId: string;
	name: string;
	authorName: string;
	createdAt: string | null;
	/** 0059 moderation state; only 'approved' is visible to non-author/staff. */
	status: TrackStatus;
	/** Reviewer's note, set when a track is sent back for revision. */
	reviewFeedback: string | null;
	removed: boolean;
	featured: boolean;
	lengthM: number | null;
	reportCount: number;
	avgRating: number | null;
	ratingCount: number;
	attemptCount: number;
	completedCount: number;
	/** completed / attempts, percent 0-100; null with no attempts. */
	completionPct: number | null;
	uniqueRacers: number;
	avgTimeMs: number | null;
	avgWallViolations: number | null;
	/** Caller-specific fields (from the same RPC, one round trip). */
	mine: boolean;
	myRating: number | null;
	canRate: boolean;
	reported: boolean;
}

/** The per-tile meta the garage's community listing renders (presentation
 * subset of the summary, keyed by catalog id in the host's props). */
export interface CommunityTileMeta {
	author: string;
	avgRating: number | null;
	ratingCount: number;
	completionPct: number | null;
	attempts: number;
	mine: boolean;
	reported: boolean;
	featured: boolean;
	/** 0059: a tile only ever reaches a non-author when this is 'approved'. */
	status: TrackStatus;
	reviewFeedback: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

/**
 * The browse list with derived telemetry, via the greenline_track_list RPC.
 * `ready: false` (0057 unapplied / offline) means "no community data" and the
 * garage simply shows no community section — never an error state.
 */
export async function loadCommunityTracks(
	supabase: SupabaseClient
): Promise<{ ready: boolean; tracks: CommunityTrackSummary[] }> {
	const { data, error } = await supabase.rpc('greenline_track_list');
	if (error || !Array.isArray(data)) return { ready: false, tracks: [] };
	const tracks: CommunityTrackSummary[] = [];
	for (const row of data as Array<Record<string, unknown>>) {
		if (typeof row.id !== 'string') continue;
		const attempts = num(row.attempt_count) ?? 0;
		const completed = num(row.completed_count) ?? 0;
		tracks.push({
			uuid: row.id,
			trackId: communityTrackId(row.id),
			name: typeof row.name === 'string' ? row.name : 'Community track',
			authorName: typeof row.author_name === 'string' ? row.author_name : 'Unknown',
			createdAt: typeof row.created_at === 'string' ? row.created_at : null,
			// Pre-0059 backends return no `status`; treating a missing value as
			// 'pending' would hide every existing track, so an absent field means
			// "this backend has no review gate" and reads as approved. The
			// authoritative gate is server-side either way — a pre-0059 backend
			// genuinely has no gate, and the UI must not pretend otherwise.
			status: row.status === undefined ? 'approved' : asStatus(row.status),
			reviewFeedback:
				typeof row.review_feedback === 'string' && row.review_feedback.trim()
					? row.review_feedback
					: null,
			removed: row.removed === true,
			featured: row.featured === true,
			lengthM: num(row.length_m),
			reportCount: num(row.report_count) ?? 0,
			avgRating: num(row.avg_rating),
			ratingCount: num(row.rating_count) ?? 0,
			attemptCount: attempts,
			completedCount: completed,
			completionPct: attempts > 0 ? Math.round((completed / attempts) * 100) : null,
			uniqueRacers: num(row.unique_racers) ?? 0,
			avgTimeMs: num(row.avg_time_ms),
			avgWallViolations: num(row.avg_wall_violations),
			mine: row.mine === true,
			myRating: num(row.my_rating),
			canRate: row.can_rate === true,
			reported: row.reported === true
		});
	}
	return { ready: true, tracks };
}

/** The presentation meta map the garage's track picker takes, keyed by
 * catalog id (`community:<uuid>`). */
export function communityMetaMap(
	tracks: CommunityTrackSummary[]
): Record<string, CommunityTileMeta> {
	const out: Record<string, CommunityTileMeta> = {};
	for (const t of tracks) {
		out[t.trackId] = {
			author: t.authorName,
			avgRating: t.avgRating,
			ratingCount: t.ratingCount,
			completionPct: t.completionPct,
			attempts: t.attemptCount,
			mine: t.mine,
			reported: t.reported,
			featured: t.featured,
			status: t.status,
			reviewFeedback: t.reviewFeedback
		};
	}
	return out;
}

/**
 * Fetch one published track's full TrackData and validate it through the
 * game's own loader. A row that fails parseTrack (schema drift, hand-edited
 * data) reads as an error, never a crash.
 */
export async function loadCommunityTrackData(
	supabase: SupabaseClient,
	uuid: string
): Promise<{ data: TrackData | null; name: string | null; error: string | null }> {
	const { data, error } = await supabase
		.from('greenline_tracks')
		.select('name, data')
		.eq('id', uuid)
		.maybeSingle();
	if (error || !data) return { data: null, name: null, error: error?.message ?? 'not found' };
	try {
		const parsed = parseTrack((data as { data: unknown }).data);
		const name = typeof (data as { name: unknown }).name === 'string' ? (data as { name: string }).name : null;
		// The row's display name wins over whatever the author's builder document
		// called it internally (display only; the runtime never reads names).
		if (name) parsed.name = name;
		return { data: parsed, name, error: null };
	} catch (e) {
		return { data: null, name: null, error: e instanceof Error ? e.message : 'invalid track data' };
	}
}

/** Publish result from the server endpoint. */
export interface PublishResult {
	ok: boolean;
	/** The new catalog id (`community:<uuid>`) on success. */
	trackId: string | null;
	error: string | null;
}

/**
 * Publish a track through the server endpoint, which authenticates the
 * session cookie, re-runs the real validation, stamps the author from
 * profiles, and inserts with the service-role key. `trackJson` is the
 * builder's export string (the exact serialization its own validation ran
 * against).
 */
export async function publishCommunityTrack(
	name: string,
	trackJson: string
): Promise<PublishResult> {
	try {
		const res = await fetch('/api/greenline-track-publish', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, track: trackJson })
		});
		const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
		if (!res.ok || body.ok !== true) {
			const detail = Array.isArray(body.details) ? `: ${(body.details as string[]).join('; ')}` : '';
			return {
				ok: false,
				trackId: null,
				error: `${typeof body.error === 'string' ? body.error : `publish failed (${res.status})`}${detail}`
			};
		}
		return { ok: true, trackId: typeof body.trackId === 'string' ? body.trackId : null, error: null };
	} catch (e) {
		return { ok: false, trackId: null, error: e instanceof Error ? e.message : 'network error' };
	}
}

/** Report a track (once per user; repeats are a clean server-side no-op). */
export async function reportCommunityTrack(
	supabase: SupabaseClient,
	uuid: string
): Promise<{ ok: boolean; already: boolean; error: string | null }> {
	const { data, error } = await supabase.rpc('greenline_track_report', { p_track_id: uuid });
	if (error) return { ok: false, already: false, error: error.message };
	const d = (data ?? {}) as Record<string, unknown>;
	return { ok: d.ok === true, already: d.already === true, error: null };
}

/**
 * Feature / un-feature a track (Bundle 4b). Teacher-only, enforced INSIDE the
 * greenline_track_set_featured RPC — this wrapper is reachable by anyone, the
 * server is the boundary. Featuring makes the track ranked (real leaderboard
 * + IC payout via the 0058 submit gate); un-featuring demotes it back to
 * unranked without touching the track, its history, or its board rows.
 */
export async function setTrackFeatured(
	supabase: SupabaseClient,
	uuid: string,
	featured: boolean
): Promise<{ ok: boolean; error: string | null }> {
	const { data, error } = await supabase.rpc('greenline_track_set_featured', {
		p_track_id: uuid,
		p_featured: featured
	});
	if (error) return { ok: false, error: error.message };
	return { ok: data === true, error: data === true ? null : 'no change' };
}

/**
 * Approve a submitted track, or send it back with feedback (0059). Teacher-only,
 * enforced INSIDE greenline_track_review — this wrapper is reachable by anyone,
 * the server is the boundary. Approving is what makes a track visible and
 * playable to everyone; rejecting returns it to author+staff visibility with the
 * note attached. Neither deletes anything.
 */
export async function reviewCommunityTrack(
	supabase: SupabaseClient,
	uuid: string,
	action: 'approve' | 'reject',
	feedback?: string
): Promise<{ ok: boolean; error: string | null }> {
	const { data, error } = await supabase.rpc('greenline_track_review', {
		p_track_id: uuid,
		p_action: action,
		p_feedback: feedback ?? null
	});
	if (error) return { ok: false, error: error.message };
	const d = (data ?? {}) as Record<string, unknown>;
	if (d.ok === true) return { ok: true, error: null };
	const reason = typeof d.reason === 'string' ? d.reason : 'review rejected';
	return {
		ok: false,
		error:
			reason === 'feedback_required'
				? 'A note back to the author is required when requesting changes.'
				: reason
	};
}

/** Soft-remove a track (its author, or a teacher). */
export async function removeCommunityTrack(
	supabase: SupabaseClient,
	uuid: string
): Promise<{ ok: boolean; error: string | null }> {
	const { data, error } = await supabase.rpc('greenline_track_remove', { p_track_id: uuid });
	if (error) return { ok: false, error: error.message };
	return { ok: data === true, error: data === true ? null : 'not removable' };
}

/** Rate a track 1-5 (server-gated on a completed attempt; upsert semantics). */
export async function rateCommunityTrack(
	supabase: SupabaseClient,
	uuid: string,
	rating: number
): Promise<{ ok: boolean; reason: 'no_completed_attempt' | null; error: string | null }> {
	const { data, error } = await supabase.rpc('greenline_track_rate', {
		p_track_id: uuid,
		p_rating: rating
	});
	if (error) return { ok: false, reason: null, error: error.message };
	const d = (data ?? {}) as Record<string, unknown>;
	if (d.ok === true) return { ok: true, reason: null, error: null };
	return {
		ok: false,
		reason: d.reason === 'no_completed_attempt' ? 'no_completed_attempt' : null,
		error: typeof d.reason === 'string' ? d.reason : 'rating rejected'
	};
}

/**
 * Open an attempt row at race start. Called by the race flow itself when a
 * community track launches — never by any user-facing "claim a result"
 * surface. Fails soft to null (offline / pre-0057: the race still runs, the
 * attempt just is not recorded).
 */
export async function startTrackAttempt(
	supabase: SupabaseClient,
	uuid: string
): Promise<string | null> {
	const { data, error } = await supabase.rpc('greenline_track_attempt_start', {
		p_track_id: uuid
	});
	if (error || typeof data !== 'string') return null;
	return data;
}

/** Close an attempt (finish = completed true; quit/fail = completed false).
 * Fire-and-forget friendly; fails soft. */
export async function finishTrackAttempt(
	supabase: SupabaseClient,
	attemptId: string,
	completed: boolean,
	timeMs: number | null,
	wallViolations: number | null
): Promise<{ ok: boolean }> {
	const { data, error } = await supabase.rpc('greenline_track_attempt_finish', {
		p_attempt_id: attemptId,
		p_completed: completed,
		p_time_ms: timeMs,
		p_wall_violations: wallViolations
	});
	return { ok: !error && data === true };
}
