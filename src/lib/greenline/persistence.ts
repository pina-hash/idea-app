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
import type { RaceAward } from './economy';
import { normalizeStoredLoadout, partsForStorage, type Loadout } from './loadout';

export const GREENLINE_LOADOUTS_TABLE = 'greenline_loadouts';
export const GREENLINE_SLOTS_TABLE = 'greenline_loadout_slots';
export const GREENLINE_WALLETS_TABLE = 'greenline_wallets';
export const GREENLINE_UNLOCKS_TABLE = 'greenline_unlocks';
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
		// Socket picks ride INSIDE the parts jsonb (partsForStorage) so the 4c
		// field needs no migration: 0049 rows read back as auto-assign, and a
		// pre-4c client reading a 4c row ignores the extra key. The load side
		// (normalizeStoredLoadout) reads the embedded key back out.
		parts: partsForStorage(loadout),
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
			// Same embedded-socket convention as the working build: the named
			// slot's socket picks live inside its parts jsonb, no 0050 change.
			parts: partsForStorage(loadout),
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

/** Validate a stored (archetype, parts) pair into a Loadout, or null. The
 * real logic is loadout.ts's normalizeStoredLoadout (shared with the
 * localStorage path), which also sanitizes the weapon slots' capacity fit and
 * reads the mount-socket picks embedded in the parts jsonb (partsForStorage);
 * a pre-4c row without them resolves to auto-assigned sockets. */
function normalizeLoadout(archetype: unknown, parts: unknown): Loadout | null {
	return normalizeStoredLoadout(archetype, parts);
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
	/** Creative-mode run (Phase 7): the server zeroes the award and stores the
	 * row as mode 'creative' so it never ranks. Client-reported, same trust
	 * model as the rest of the result. */
	creative?: boolean;
}

/** Does this rpc error mean the deployed function predates the given shape? */
const isMissingFunction = (e: { code?: string; message: string }): boolean =>
	e.code === 'PGRST202' || /could not find the function/i.test(e.message);

/**
 * Submit a finished race through the greenline_submit_race_result RPC, which
 * stamps user_id / created_at server-side and (since 0052) computes + credits
 * the Ignition Credits award in the same transaction. Returns the new row id
 * and the award breakdown.
 *
 * Fail-soft on a pre-0052 backend (the old seven-arg function rejects the
 * p_creative call): a NORMAL run retries the legacy shape (no award existed
 * yet, so `award` comes back null); a CREATIVE run is deliberately NOT
 * submitted through the legacy function — that would rank an
 * unlocked-everything run on the real board — and reads as an offline no-op.
 */
export async function submitRaceResult(
	supabase: SupabaseClient,
	result: RaceResult
): Promise<{ id: string | null; award: RaceAward | null; error: string | null }> {
	const params = {
		p_track_id: result.trackId,
		p_mode: result.mode ?? 'race',
		p_finish_position: result.finishPosition ?? null,
		p_total_time_ms: result.totalTimeMs ?? null,
		p_best_lap_ms: result.bestLapMs ?? null,
		p_laps: result.laps ?? null,
		p_archetype: result.archetype ?? null
	};
	const { data, error } = await supabase.rpc('greenline_submit_race_result', {
		...params,
		p_creative: result.creative ?? false
	});
	if (error) {
		if (isMissingFunction(error)) {
			if (result.creative) return { id: null, award: null, error: null };
			const legacy = await supabase.rpc('greenline_submit_race_result', params);
			if (legacy.error) return { id: null, award: null, error: legacy.error.message };
			return { id: (legacy.data as string) ?? null, award: null, error: null };
		}
		return { id: null, award: null, error: error.message };
	}
	// 0052 returns jsonb { id, awarded, placement, pb_bonus, balance, creative }.
	if (data && typeof data === 'object') {
		const d = data as Record<string, unknown>;
		return {
			id: typeof d.id === 'string' ? d.id : null,
			award: {
				awarded: typeof d.awarded === 'number' ? d.awarded : 0,
				placement: typeof d.placement === 'number' ? d.placement : 0,
				pbBonus: typeof d.pb_bonus === 'number' ? d.pb_bonus : 0,
				balance: typeof d.balance === 'number' ? d.balance : null,
				creative: d.creative === true
			},
			error: null
		};
	}
	return { id: typeof data === 'string' ? data : null, award: null, error: null };
}

// ---------------------------------------------------------------------------
// Economy (Phase 7): wallet + unlocks reads, and the atomic purchase RPC. All
// fail soft pre-0052: `ready: false` means "no economy data" and callers must
// then apply NO gating at all (the pre-economy behavior), never lock-everything.
// ---------------------------------------------------------------------------

/**
 * Read the caller's Ignition Credits balance. No wallet row yet is a real,
 * ready state (balance 0 — the row is created by the first credit/purchase).
 */
export async function loadWallet(
	supabase: SupabaseClient,
	userId: string
): Promise<{ balance: number; ready: boolean }> {
	const { data, error } = await supabase
		.from(GREENLINE_WALLETS_TABLE)
		.select('balance')
		.eq('user_id', userId)
		.maybeSingle();
	if (error) return { balance: 0, ready: false };
	const b = data ? (data as { balance: unknown }).balance : 0;
	return { balance: typeof b === 'number' ? b : 0, ready: true };
}

/** Read the caller's unlocked item ids. Fails soft to not-ready (see above). */
export async function loadUnlocks(
	supabase: SupabaseClient,
	userId: string
): Promise<{ items: Set<string>; ready: boolean }> {
	const { data, error } = await supabase
		.from(GREENLINE_UNLOCKS_TABLE)
		.select('item_id')
		.eq('user_id', userId);
	if (error || !Array.isArray(data)) return { items: new Set(), ready: false };
	const items = new Set<string>();
	for (const row of data as Array<{ item_id: unknown }>) {
		if (typeof row.item_id === 'string') items.add(row.item_id);
	}
	return { items, ready: true };
}

export interface PurchaseResult {
	ok: boolean;
	/** Structured server reason on a clean refusal (null on ok / hard error). */
	reason: 'already_unlocked' | 'insufficient_funds' | 'unknown_item' | null;
	/** Wallet balance the server reported, when it did. */
	balance: number | null;
	/** The authoritative price, reported on insufficient_funds. */
	price: number | null;
	error: string | null;
}

/**
 * Buy an unlock through the greenline_purchase_item RPC (0052), which locks
 * the wallet row so a double-submit can never double-charge or double-unlock:
 * balance check, deduction, and the unlock record are one transaction.
 */
export async function purchaseItem(
	supabase: SupabaseClient,
	itemId: string
): Promise<PurchaseResult> {
	const { data, error } = await supabase.rpc('greenline_purchase_item', { p_item_id: itemId });
	if (error) return { ok: false, reason: null, balance: null, price: null, error: error.message };
	const d = (data ?? {}) as Record<string, unknown>;
	const reason = d.reason;
	return {
		ok: d.ok === true,
		reason:
			reason === 'already_unlocked' || reason === 'insufficient_funds' || reason === 'unknown_item'
				? reason
				: null,
		balance: typeof d.balance === 'number' ? d.balance : null,
		price: typeof d.price === 'number' ? d.price : null,
		error: null
	};
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
