/**
 * THE SHELF CARD, MIRRORED INTO THIS BROWSER, so a phone that loses signal --
 * or the tab -- in the middle of an entry takes nothing typed with it.
 *
 * WHY THIS EXISTS HERE. The surface it protects is used STANDING AT A TOOLBOX
 * ON A PHONE, which is the worst connection and the most fragile tab in the
 * building: school wifi at the back of a shop, a browser that discards a
 * backgrounded tab the moment the camera app takes the foreground. A tab
 * discarded that way dispatches nothing, so there is no failed write to
 * report and no save state to show -- which is precisely the failure the
 * notebook composer paid for once already (IDEA_INTERFACE_STANDARDS 2.11).
 *
 * IT IS THE SAME PATTERN AS `$lib/notebook/draft-mirror.ts` AND NOT A REUSE OF
 * IT, deliberately. Every RULE is that module's, followed here: one namespaced
 * prefix, a key per viewer and per record, a shape version that is DROPPED
 * rather than coerced when unknown, an age cap, a quota answer that sweeps
 * OTHER slots and retries, and a refusal reported rather than thrown. What
 * differs is the PAYLOAD: that one holds a ProseMirror document, an entry id
 * and a note chain, and there is no shelf draft inside it to hold. Generalising
 * it would mean editing a notebook module from a maps bundle to make its type
 * parameter-shaped, which is a bigger change to somebody else's surface than
 * the duplication it would remove.
 *
 * IT IS A MIRROR, NEVER A SOURCE OF TRUTH. Nothing reads it but a fresh mount
 * that finds one, and all it can do is put typing back in the box for the
 * ordinary save path to send.
 *
 * WHAT IT CANNOT HOLD, AND THE SURFACE SAYS SO OUT LOUD: the PHOTO. A picked
 * or captured `File` is a handle into that tab's own memory and there is
 * nothing to serialise -- the same reason a staged classroom upload lives in
 * the layout rather than in storage. So the words come back and the picture
 * does not, and a person is told that while the picture is staged rather than
 * after it is gone.
 *
 * Pure and client-safe: no Svelte, no Supabase, no transports.
 */

import type { MapsShelfDraft, MapsShelfKind } from './shelf';

/**
 * Namespaced beside the conventions already in this browser --
 * `notebook_draft_mirror:`, `notebook_pending_capture`, VANGUARD's
 * `vanguard_*` -- so a sweep of this feature's storage is one prefix match and
 * cannot catch any of them.
 *
 * The full key is `maps_shelf_draft:<viewer>:<container>`:
 *
 *   viewer     the signed-in caller's own id, so a shared school device cannot
 *              hand one person's half-typed entry to the next.
 *   container  the node being catalogued. KEYED rather than one slot, because
 *              somebody who walks from one drawer to the next and back should
 *              find what they left in each, and a single slot would make the
 *              second drawer silently eat the first.
 */
export const SHELF_MIRROR_PREFIX = 'maps_shelf_draft:';

/**
 * Past this a mirror is abandoned rather than lost work. Twenty-four hours,
 * the same figure and the same reasoning as the notebook's: these are shared
 * school devices, the slot holds unsaved typing in plain `localStorage`, and
 * the window it bounds is the exposure rather than how long somebody might
 * want their draft back.
 */
export const SHELF_MIRROR_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** How long after a keystroke the card waits before mirroring. */
export const SHELF_MIRROR_DEBOUNCE_MS = 400;

export interface ShelfMirror {
	/** Shape version. An older or unknown one is DROPPED, never guessed at. */
	v: 1;
	/** Client clock, for the age cap only. Nothing authorises on it. */
	at: number;
	containerId: string;
	draft: MapsShelfDraft;
	/** True when a photo was staged that this slot could not carry. */
	hadPhoto: boolean;
}

export type MirrorWrite = 'ok' | 'full' | 'blocked';

export function shelfMirrorKey(viewerId: string | undefined, containerId: string | null): string {
	return `${SHELF_MIRROR_PREFIX}${viewerId || 'anon'}:${containerId ?? 'none'}`;
}

function storage(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		// The property access itself throws where site data is blocked.
		return null;
	}
}

function mirrorKeys(store: Storage): string[] {
	const keys: string[] = [];
	try {
		for (let i = 0; i < store.length; i++) {
			const key = store.key(i);
			if (key?.startsWith(SHELF_MIRROR_PREFIX)) keys.push(key);
		}
	} catch {
		return keys;
	}
	return keys;
}

function drop(store: Storage, key: string): void {
	try {
		store.removeItem(key);
	} catch {
		// Nothing depends on it having worked.
	}
}

function parse(raw: string | null): ShelfMirror | null {
	if (!raw) return null;
	try {
		const p = JSON.parse(raw) as Partial<ShelfMirror>;
		if (p?.v !== 1) return null;
		if (typeof p.at !== 'number') return null;
		if (typeof p.containerId !== 'string') return null;
		const d = p.draft as Partial<MapsShelfDraft> | undefined;
		if (!d || typeof d !== 'object') return null;
		const strings = (v: unknown): string[] =>
			Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
		const kind: MapsShelfKind = d.kind === 'several' ? 'several' : 'one';
		return {
			v: 1,
			at: p.at,
			containerId: p.containerId,
			hadPhoto: p.hadPhoto === true,
			draft: {
				name: typeof d.name === 'string' ? d.name : '',
				aliases: strings(d.aliases),
				tags: strings(d.tags),
				typeId: typeof d.typeId === 'string' ? d.typeId : null,
				kind,
				qty: Number.isInteger(d.qty) && (d.qty as number) > 0 ? (d.qty as number) : 1,
				serial: typeof d.serial === 'string' ? d.serial : '',
				notes: typeof d.notes === 'string' ? d.notes : ''
			}
		};
	} catch {
		return null;
	}
}

/**
 * Drop every mirror that is not `keepKey` and is expired (or every one of them
 * when `all`). Returns how many went, so a caller can say whether a retry is
 * worth making -- this is the quota answer as well as the housekeeping one,
 * and it never removes the slot the caller is trying to write.
 */
export function sweepShelfMirrors(keepKey: string, now: number, all = false): number {
	const store = storage();
	if (!store) return 0;
	let removed = 0;
	for (const key of mirrorKeys(store)) {
		if (key === keepKey) continue;
		if (!all) {
			const mirror = parse(store.getItem(key));
			if (mirror && now - mirror.at <= SHELF_MIRROR_MAX_AGE_MS) continue;
		}
		drop(store, key);
		removed++;
	}
	return removed;
}

/**
 * WHY A WRITE DID NOT LAND, because "it silently did not" is the failure this
 * module exists to remove and reproducing it one level down would be its own
 * joke. `blocked` is storage refusing outright; `full` is the quota, after a
 * sweep and a retry have both failed.
 */
export function writeShelfMirror(key: string, mirror: ShelfMirror): MirrorWrite {
	const store = storage();
	if (!store) return 'blocked';
	const body = JSON.stringify(mirror);
	try {
		store.setItem(key, body);
		return 'ok';
	} catch {
		sweepShelfMirrors(key, mirror.at);
		try {
			store.setItem(key, body);
			return 'ok';
		} catch {
			// A slot claiming to be what is on screen, and not being it, is
			// worse than no slot: drop the stale value under this key.
			drop(store, key);
			return 'full';
		}
	}
}

export function readShelfMirror(key: string, now: number): ShelfMirror | null {
	const store = storage();
	if (!store) return null;
	let raw: string | null = null;
	try {
		raw = store.getItem(key);
	} catch {
		return null;
	}
	const mirror = parse(raw);
	if (!mirror) return null;
	if (now - mirror.at > SHELF_MIRROR_MAX_AGE_MS) {
		drop(store, key);
		return null;
	}
	return mirror;
}

export function clearShelfMirror(key: string): void {
	const store = storage();
	if (store) drop(store, key);
}
