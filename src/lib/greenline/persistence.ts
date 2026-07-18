/**
 * GREENLINE persistence: the client-side seam onto the Supabase tables added in
 * 0049_greenline_accounts.sql. Pure data-layer (no three.js, no cannon-es, no
 * Svelte), the frc/progression.ts + fsp/item-opens.ts convention: each function
 * takes a Supabase client, does one thing, and fails soft if the migration is
 * unapplied or a read/write is blocked.
 *
 * Two concerns:
 *   - Loadouts: an owner-scoped self-write (like vanguard_saves). loadUserLoadout
 *     / saveUserLoadout read and upsert the caller's single row. The garage's
 *     localStorage save stays as the offline fallback; these give it a real sync
 *     target. The stored shape maps 1:1 to the Loadout type in loadout.ts, and
 *     the load path runs it back through parseLoadout so unknown archetype/part
 *     ids fail soft to null exactly as they do from localStorage.
 *   - Race results / leaderboard: the write goes through the
 *     greenline_submit_race_result RPC (attribution stamped server-side); the
 *     board read goes through the greenline_leaderboard RPC (board-safe columns,
 *     visible to any signed-in user), mirroring GAUNTLET's scoping.
 *
 * No UI here. The dev harness keeps its localStorage-only garage for now; the
 * signed-in portal route wired to these seams comes in the next stage.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { archetypeById, partById, type Loadout, type PartSlot } from './loadout';

export const GREENLINE_LOADOUTS_TABLE = 'greenline_loadouts';
export const GREENLINE_SLOTS_TABLE = 'greenline_loadout_slots';
/** Hard cap on named build slots per user (mirrors the 0050 CHECK). */
export const GREENLINE_MAX_SLOTS = 5;

/**
 * Load a user's saved loadout, or null if none exists / the table is absent /
 * the stored shape is invalid. Reuses the same validation as parseLoadout so a
 * loadout from the DB is held to the identical contract as one from
 * localStorage (unknown ids drop to stock, an unknown archetype fails soft).
 */
export async function loadUserLoadout(
	supabase: SupabaseClient,
	userId: string
): Promise<Loadout | null> {
	const { data, error } = await supabase
		.from(GREENLINE_LOADOUTS_TABLE)
		.select('archetype, parts')
		.eq('user_id', userId)
		.maybeSingle();
	if (error || !data) return null;
	return normalizeLoadout(data.archetype, data.parts);
}

/**
 * Upsert a user's active/working loadout (owner-scoped, one row per user).
 * Direct write under the owner RLS policy, no RPC: a build only affects its own
 * owner, nothing is forgeable. Fire-and-forget friendly; a failure is surfaced
 * but never thrown.
 *
 * `activeSlot` designates which named slot this working build corresponds to
 * (see loadUserSlots). Pass a slot index when loading/saving a named slot, or
 * `null` to mark the build as a custom, unsaved one. Omit it entirely to leave
 * the stored pointer untouched (upsert only writes the columns provided, so an
 * existing row's active_slot survives; a brand-new row defaults to null).
 */
export async function saveUserLoadout(
	supabase: SupabaseClient,
	userId: string,
	loadout: Loadout,
	activeSlot?: number | null
): Promise<{ error: string | null }> {
	const row: Record<string, unknown> = {
		user_id: userId,
		archetype: loadout.archetype,
		parts: loadout.parts,
		updated_at: new Date().toISOString()
	};
	if (activeSlot !== undefined) row.active_slot = activeSlot;
	const { error } = await supabase
		.from(GREENLINE_LOADOUTS_TABLE)
		.upsert(row, { onConflict: 'user_id' });
	return { error: error ? error.message : null };
}

/**
 * Which named slot the working build is currently tied to, or null (custom /
 * unsaved / no build yet / table missing the column pre-0050). Fails soft: any
 * error or absent row reads as null.
 */
export async function loadActiveSlot(
	supabase: SupabaseClient,
	userId: string
): Promise<number | null> {
	const { data, error } = await supabase
		.from(GREENLINE_LOADOUTS_TABLE)
		.select('active_slot')
		.eq('user_id', userId)
		.maybeSingle();
	if (error || !data) return null;
	const s = (data as { active_slot: unknown }).active_slot;
	return typeof s === 'number' ? s : null;
}

/** One named build slot (0..GREENLINE_MAX_SLOTS-1). */
export interface LoadoutSlot {
	slot: number;
	name: string;
	loadout: Loadout;
	updatedAt: string | null;
}

/**
 * Load all of a user's named build slots, validated (invalid rows dropped) and
 * sorted by slot. Fails soft to `[]` if 0050 is unapplied or the read is
 * blocked, exactly like loadUserLoadout.
 */
export async function loadUserSlots(
	supabase: SupabaseClient,
	userId: string
): Promise<LoadoutSlot[]> {
	const { data, error } = await supabase
		.from(GREENLINE_SLOTS_TABLE)
		.select('slot, name, archetype, parts, updated_at')
		.eq('user_id', userId)
		.order('slot', { ascending: true });
	if (error || !Array.isArray(data)) return [];
	const out: LoadoutSlot[] = [];
	for (const row of data as Array<Record<string, unknown>>) {
		const slot = row.slot;
		if (typeof slot !== 'number' || slot < 0 || slot >= GREENLINE_MAX_SLOTS) continue;
		const loadout = normalizeLoadout(row.archetype, row.parts);
		if (!loadout) continue;
		out.push({
			slot,
			name: typeof row.name === 'string' && row.name.trim() ? row.name : `Build ${slot + 1}`,
			loadout,
			updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null
		});
	}
	return out;
}

/**
 * Save (create or overwrite) a named build into a slot. Owner-scoped upsert on
 * (user_id, slot), the greenline_loadouts pattern. Surfaces an error string but
 * never throws, so a caller can fail soft (keep the build for the session even
 * when the write is blocked / 0050 is unapplied).
 */
export async function saveSlot(
	supabase: SupabaseClient,
	userId: string,
	slot: number,
	name: string,
	loadout: Loadout
): Promise<{ error: string | null }> {
	const { error } = await supabase.from(GREENLINE_SLOTS_TABLE).upsert(
		{
			user_id: userId,
			slot,
			name,
			archetype: loadout.archetype,
			parts: loadout.parts,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'user_id,slot' }
	);
	return { error: error ? error.message : null };
}

/** Delete a named build slot (owner-scoped). Fails soft. */
export async function deleteSlot(
	supabase: SupabaseClient,
	userId: string,
	slot: number
): Promise<{ error: string | null }> {
	const { error } = await supabase
		.from(GREENLINE_SLOTS_TABLE)
		.delete()
		.eq('user_id', userId)
		.eq('slot', slot);
	return { error: error ? error.message : null };
}

/** Validate a stored (archetype, parts) pair into a Loadout, or null. */
function normalizeLoadout(archetype: unknown, parts: unknown): Loadout | null {
	if (typeof archetype !== 'string' || !archetypeById(archetype)) return null;
	const stock: Record<PartSlot, string> = {
		plating: 'plating-stock',
		drivetrain: 'drive-stock',
		tires: 'tires-stock',
		systems: 'sys-stock'
	};
	const out = { ...stock };
	if (parts && typeof parts === 'object') {
		for (const slot of Object.keys(out) as PartSlot[]) {
			const id = (parts as Record<string, unknown>)[slot];
			const part = typeof id === 'string' ? partById(id) : undefined;
			if (part && part.slot === slot) out[slot] = part.id;
		}
	}
	return { archetype: archetype as Loadout['archetype'], parts: out };
}

/** One player's line on a track leaderboard (board-safe fields only). */
export interface LeaderboardEntry {
	user_id: string;
	display_name: string | null;
	full_name: string | null;
	avatar: string | null;
	avatar_url: string | null;
	archetype: string | null;
	finish_position: number | null;
	total_time_ms: number | null;
	best_lap_ms: number | null;
	laps: number | null;
	rank: number;
}

/** A finished race to submit. All metrics optional beyond the track. */
export interface RaceResult {
	trackId: string;
	mode?: string;
	finishPosition?: number | null;
	totalTimeMs?: number | null;
	bestLapMs?: number | null;
	laps?: number | null;
	archetype?: string | null;
}

/**
 * Submit a finished race through the greenline_submit_race_result RPC, which
 * stamps user_id / created_at server-side. Returns the new row id, or an error.
 */
export async function submitRaceResult(
	supabase: SupabaseClient,
	result: RaceResult
): Promise<{ id: string | null; error: string | null }> {
	const { data, error } = await supabase.rpc('greenline_submit_race_result', {
		p_track_id: result.trackId,
		p_mode: result.mode ?? 'race',
		p_finish_position: result.finishPosition ?? null,
		p_total_time_ms: result.totalTimeMs ?? null,
		p_best_lap_ms: result.bestLapMs ?? null,
		p_laps: result.laps ?? null,
		p_archetype: result.archetype ?? null
	});
	if (error) return { id: null, error: error.message };
	return { id: (data as string) ?? null, error: null };
}

/**
 * Read a track's leaderboard through the greenline_leaderboard RPC (best time
 * per player, board-safe, visible to any signed-in user). Fails soft to `[]` if
 * the migration is unapplied or the read is blocked.
 */
export async function loadLeaderboard(
	supabase: SupabaseClient,
	trackId: string,
	opts: { mode?: string; limit?: number } = {}
): Promise<LeaderboardEntry[]> {
	const { data, error } = await supabase.rpc('greenline_leaderboard', {
		p_track_id: trackId,
		p_mode: opts.mode ?? 'race',
		p_limit: opts.limit ?? 100
	});
	if (error || !Array.isArray(data)) return [];
	return data as LeaderboardEntry[];
}
