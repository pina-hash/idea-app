/**
 * GREENLINE moderation: the ONE reader of "what is waiting on a teacher".
 *
 * GREENLINE has two independent review queues and, until this module, no
 * surface inside GREENLINE that said either of them had anything in it. The
 * decal queue is on `/dashboard`, the track queue is on `/greenline/moderation`,
 * and a teacher who opened GREENLINE itself was told nothing at all — which is
 * the whole failure this file exists to close: a student's submission sits in a
 * queue that works perfectly and that nobody is prompted to open.
 *
 * The counts are read HERE and nowhere else, so the title-screen badge, the
 * moderation page's own heading and any later surface cannot disagree about how
 * many things are waiting. Two spellings of "is anything pending" is exactly how
 * a badge comes to read zero over a queue with three rows in it.
 *
 * THE COUNTS ARE NOT THE BOUNDARY AND MUST NEVER BE READ AS ONE. Every caller
 * gates on `isAdmin` first; this only decides what a teacher is TOLD. Called by
 * a non-admin the reads still run under RLS and answer about that caller's own
 * rows (a student has at most one decal and their own tracks), which is a
 * meaningless number rather than a leak — but it is also not a number any
 * surface should render, so the gate is the caller's job and is stated at each
 * call site.
 *
 * FAILS SOFT, per the decals.ts / community.ts convention: a pre-0051 or
 * pre-0059 deployment answers `ready: false` and every surface simply says
 * nothing rather than showing a broken badge. `greenline_tracks.status` is a
 * 0059 column and PostgREST rejects a filter naming a column it does not know,
 * so the failure mode here is a rejected select rather than a wrong count.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { GREENLINE_DECALS_TABLE } from './decals';

export const GREENLINE_TRACKS_TABLE = 'greenline_tracks';

/** What is awaiting a review decision right now. */
export interface GreenlinePending {
	/** False when the read failed (migration unapplied / offline): say nothing. */
	ready: boolean;
	/** Community tracks at status 'pending' and not removed (0059). */
	tracks: number;
	/** Custom decals at status 'pending' (0051). */
	decals: number;
	/** tracks + decals, the one number a badge shows. */
	total: number;
}

const EMPTY: GreenlinePending = { ready: false, tracks: 0, decals: 0, total: 0 };

/**
 * Count both queues in one place. `ready` is true only when BOTH reads
 * succeeded: a half-answer rendered as a total is worse than no badge, because
 * "1 awaiting review" over a queue holding four is a number a teacher acts on.
 */
export async function loadGreenlinePending(
	supabase: SupabaseClient
): Promise<GreenlinePending> {
	const [tracks, decals] = await Promise.all([
		supabase
			.from(GREENLINE_TRACKS_TABLE)
			.select('id', { count: 'exact', head: true })
			.eq('status', 'pending')
			.eq('removed', false),
		supabase
			.from(GREENLINE_DECALS_TABLE)
			.select('user_id', { count: 'exact', head: true })
			.eq('status', 'pending')
	]);
	if (tracks.error || decals.error) return EMPTY;
	const t = tracks.count ?? 0;
	const d = decals.count ?? 0;
	return { ready: true, tracks: t, decals: d, total: t + d };
}

/**
 * The one sentence a moderation entry point shows. Written here rather than at
 * each call site for the same reason the counts are: the title screen and the
 * moderation page must not describe the same state in two different ways.
 *
 * ZERO IS A SENTENCE, NOT AN ABSENCE. A queue with nothing in it has to say so
 * and look deliberate — a badge that vanishes at zero is indistinguishable from
 * a badge that broke, which is the state this whole bundle exists because
 * nobody could tell apart.
 */
export function pendingLabel(p: GreenlinePending): string {
	if (!p.ready) return 'REVIEW QUEUE';
	if (p.total === 0) return 'NOTHING AWAITING REVIEW';
	return `${p.total} AWAITING REVIEW`;
}

/**
 * The breakdown, for a surface with room for it. Named parts only: "2 tracks,
 * 1 decal" tells a teacher which queue to open, where a bare 3 does not.
 */
export function pendingBreakdown(p: GreenlinePending): string {
	if (!p.ready) return '';
	const parts: string[] = [];
	if (p.tracks > 0) parts.push(`${p.tracks} track${p.tracks === 1 ? '' : 's'}`);
	if (p.decals > 0) parts.push(`${p.decals} decal${p.decals === 1 ? '' : 's'}`);
	return parts.join(' · ');
}
