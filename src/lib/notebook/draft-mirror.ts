/**
 * THE COMPOSER'S WRITING, MIRRORED INTO THIS BROWSER, so a tab that dies takes
 * nothing with it.
 *
 * WHAT THIS EXISTS FOR, and it was found by reading rather than by a stack
 * trace: no composer content was persisted locally at ANY point. A note lived
 * in one `$state` variable and in ProseMirror's in-memory document, so a tab
 * discarded under memory pressure -- the ordinary iOS Safari behaviour on a
 * phone with a camera app open -- took a long entry with it silently. There
 * was no failed write to report, because nothing had been dispatched.
 *
 * THE KEEPALIVE BEACON DOES NOT CLOSE THIS, AND THE MEASUREMENT IS THE REASON.
 * A `keepalive` request is capped at 64KB of body across every in-flight one,
 * and the composer's wire body is the editor's ProseMirror JSON: 58 characters
 * of scaffolding per block, so 2000 blocks is 113KB of scaffolding alone and a
 * measured 134.9KB body for 2000 short lines. The beacon is refused whole,
 * which means THE LARGEST NOTES ARE EXACTLY THE ONES IT CANNOT SAVE -- and "a
 * large amount of writing" is what the student who lost one reported.
 * `localStorage` has no such ceiling. The two are not alternatives: the beacon
 * is the write that reaches the server, this is the copy that survives when it
 * cannot (IDEA_INTERFACE_STANDARDS 2.11).
 *
 * IT IS A MIRROR, NEVER A SOURCE OF TRUTH. Nothing reads it except a fresh
 * mount that finds one, and the only thing it can do is put unsaved writing
 * back into the box for the ordinary save path to send. It carries no
 * authorization, decides nothing about who may write, and a browser that
 * refuses storage entirely costs the recovery and nothing else.
 *
 * Pure and client-safe: no Svelte, no Supabase, no transports.
 */

import { serializeForBaseline } from '$lib/edit-baseline.svelte';
import { noteThreads, type TiptapNode } from '$lib/notebook-notes';
import type { NotebookEntry } from '$lib/notebook';

/**
 * NAMESPACED ALONGSIDE THE CONVENTIONS ALREADY IN THIS BROWSER --
 * `notebook_pending_capture` (camera.ts) and VANGUARD's `vanguard_*` -- so a
 * sweep of this feature's storage is one prefix match and cannot catch either.
 *
 * The full key is `notebook_draft_mirror:<viewer>:<record>`:
 *
 *   viewer  the signed-in caller's own id, so a shared school desktop can hold
 *           two students' mirrors without either restoring the other's writing.
 *   record  the draft entry this composer session is continuing, or `new` when
 *           it has not created one yet. KEYED, rather than one slot, because
 *           two entries composed in two tabs would otherwise overwrite each
 *           other and the loser would be a paragraph nobody can get back.
 */
export const DRAFT_MIRROR_PREFIX = 'notebook_draft_mirror:';

/** The record id used before a composer session has created an entry. */
export const NEW_RECORD = 'new';

/**
 * Past this a mirror is treated as abandoned rather than as lost work.
 *
 * Twenty-four hours, not seven days. These are shared school lab machines, the
 * slot holds unsaved writing in plain, unencrypted `localStorage`, and it is
 * not swept on sign-out -- so the exposure window is the thing this bounds,
 * not how long a student might plausibly want their draft back. A day is long
 * enough to survive a phone put down mid-class; it is short enough that the
 * next student at that machine is not sitting in front of a stranger's
 * writing for the rest of the week.
 */
export const DRAFT_MIRROR_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** How long the composer waits after a keystroke before mirroring. */
export const DRAFT_MIRROR_DEBOUNCE_MS = 400;

/**
 * WHAT ONE SLOT HOLDS. Everything the composer would otherwise lose, which is
 * deliberately wider than the note: `notebook_pending_capture` already proved
 * that putting a student back in front of their title and their check-in is
 * most of the recovery, and it explicitly does NOT carry the note body -- this
 * is the half that was missing.
 */
export interface DraftMirror {
	/** Shape version. An older or unknown one is DROPPED, never guessed at. */
	v: 1;
	/** Client clock, for the age cap only. Nothing authorizes on it. */
	at: number;
	/** The draft entry this session is continuing, or null for a fresh one. */
	entryId: string | null;
	/** The note chain inside it, or null when the entry has no note yet. */
	noteId: string | null;
	/** The document exactly as the editor emitted it. */
	doc: TiptapNode;
	/**
	 * THE `EditBaseline` SERIAL OF WHAT THE SERVER HAD ACKNOWLEDGED when this
	 * was written -- the same string `autosaveBaseline` holds, taken through the
	 * same serializer, so the read side can re-run the composer's own
	 * seeded-versus-edited comparison rather than inventing a second one.
	 */
	baseline: string;
	title: string;
	sessionId: string | null;
	sectionId: string | null;
	folderId: string | null;
}

export function draftMirrorKey(viewerId: string | undefined, recordId: string | null): string {
	return `${DRAFT_MIRROR_PREFIX}${viewerId || 'anon'}:${recordId ?? NEW_RECORD}`;
}

/**
 * WHY A WRITE DID NOT LAND, because "it silently did not" is the failure mode
 * this whole module exists to remove and reproducing it one level down would
 * be its own joke.
 *
 * `blocked` is storage refusing outright (Safari private browsing, cookies
 * blocked, an embedded context); `full` is the quota, after a sweep and a
 * retry have already failed.
 */
export type MirrorWrite = 'ok' | 'full' | 'blocked';

function storage(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		// Accessing the property itself throws where site data is blocked.
		return null;
	}
}

/**
 * Every mirror key currently in storage. Enumerating throws in the same places
 * `storage()` does, so it answers empty rather than propagating.
 */
function mirrorKeys(store: Storage): string[] {
	const keys: string[] = [];
	try {
		for (let i = 0; i < store.length; i++) {
			const key = store.key(i);
			if (key?.startsWith(DRAFT_MIRROR_PREFIX)) keys.push(key);
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
		// Nothing to do, and nothing depends on it having worked.
	}
}

/**
 * Drop every mirror that is not `keepKey` and is either expired or foreign.
 * Returns how many went, so a caller can say whether a retry is worth making.
 *
 * IT IS THE QUOTA ANSWER AS WELL AS THE HOUSEKEEPING ONE. `localStorage` is a
 * few megabytes shared with everything else this origin stores, and the one
 * value that can plausibly fill it is a very long note -- which is precisely
 * the value that must not be the one dropped. So the sweep only ever removes
 * OTHER slots, and the current one is what the retry is for.
 */
export function sweepMirrors(keepKey: string, now: number, all = false): number {
	const store = storage();
	if (!store) return 0;
	let removed = 0;
	for (const key of mirrorKeys(store)) {
		if (key === keepKey) continue;
		if (!all) {
			const mirror = readMirrorAt(store, key);
			if (mirror && now - mirror.at <= DRAFT_MIRROR_MAX_AGE_MS) continue;
		}
		drop(store, key);
		removed++;
	}
	return removed;
}

function readMirrorAt(store: Storage, key: string): DraftMirror | null {
	let raw: string | null = null;
	try {
		raw = store.getItem(key);
	} catch {
		return null;
	}
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<DraftMirror>;
		// A SHAPE THIS VERSION DOES NOT KNOW IS DROPPED, not coerced: a mirror is
		// only ever worth restoring if every field means what this code thinks it
		// means, and half-reading one is how a note lands on the wrong entry.
		if (parsed?.v !== 1) return null;
		if (typeof parsed.at !== 'number') return null;
		if (typeof parsed.baseline !== 'string') return null;
		if (!parsed.doc || typeof parsed.doc !== 'object') return null;
		return {
			v: 1,
			at: parsed.at,
			entryId: typeof parsed.entryId === 'string' ? parsed.entryId : null,
			noteId: typeof parsed.noteId === 'string' ? parsed.noteId : null,
			doc: parsed.doc as TiptapNode,
			baseline: parsed.baseline,
			title: typeof parsed.title === 'string' ? parsed.title : '',
			sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
			sectionId: typeof parsed.sectionId === 'string' ? parsed.sectionId : null,
			folderId: typeof parsed.folderId === 'string' ? parsed.folderId : null
		};
	} catch {
		return null;
	}
}

export function readMirror(key: string, now: number): DraftMirror | null {
	const store = storage();
	if (!store) return null;
	const mirror = readMirrorAt(store, key);
	if (!mirror) return null;
	if (now - mirror.at > DRAFT_MIRROR_MAX_AGE_MS) {
		drop(store, key);
		return null;
	}
	return mirror;
}

/**
 * THE MOST RECENTLY WRITTEN SLOT FOR THIS VIEWER, with the key it was found
 * under, or null.
 *
 * A composer that is mounting is always in the `new` slot, and the writing
 * worth putting back is frequently NOT: it belongs to the draft entry the last
 * session had already created. So the read is over this viewer's slots rather
 * than the one key the composer currently occupies, newest first -- there is
 * only ever one composer on a page, so "the newest" is "the one that was being
 * typed into when the tab died".
 *
 * SCOPED TO THE VIEWER BY THE KEY PREFIX, so a shared school desktop holding
 * two students' mirrors can never hand one of them the other's writing.
 */
export function latestMirror(
	viewerId: string | undefined,
	now: number
): { key: string; mirror: DraftMirror } | null {
	const store = storage();
	if (!store) return null;
	const mine = `${DRAFT_MIRROR_PREFIX}${viewerId || 'anon'}:`;
	let best: { key: string; mirror: DraftMirror } | null = null;
	for (const key of mirrorKeys(store)) {
		if (!key.startsWith(mine)) continue;
		const mirror = readMirror(key, now);
		if (!mirror) continue;
		if (!best || mirror.at > best.mirror.at) best = { key, mirror };
	}
	return best;
}

/**
 * THE ACKNOWLEDGED DOCUMENT BEHIND A MIRROR'S BASELINE, so a restore can hand
 * it straight to `EditBaseline.seed()` and the composer's comparison carries on
 * from exactly where it stopped.
 *
 * `serializeForBaseline` is `JSON.stringify(value ?? null)`, so parsing the
 * stored serial and re-serializing it reproduces the same string -- which is
 * what makes seeding with this EXACT rather than approximate. Restoring with a
 * null baseline instead would work, and would cost one redundant write in the
 * one case that matters: a student who edits their restored writing back to
 * what the server already had.
 */
export function baselineValue(mirror: DraftMirror): unknown {
	try {
		return JSON.parse(mirror.baseline) as unknown;
	} catch {
		return null;
	}
}

/**
 * WRITE ONE SLOT, AND NEVER THROW OUT OF IT.
 *
 * A full or blocked `localStorage` is an ordinary state -- Safari private
 * browsing refuses every write, and a shared machine can genuinely be at quota
 * -- and an exception escaping here would land inside the composer's own
 * reactive effect, which is a dead editor over a lost note: the exact outcome
 * this module was written to prevent.
 *
 * ON QUOTA IT SWEEPS AND RETRIES ONCE. The sweep drops other records' slots,
 * never this one, so the value competing for the space is the only one kept.
 */
export function writeMirror(key: string, mirror: DraftMirror): MirrorWrite {
	const store = storage();
	if (!store) return 'blocked';
	const payload = JSON.stringify(mirror);
	try {
		store.setItem(key, payload);
		return 'ok';
	} catch {
		// Fall through to the sweep.
	}
	if (sweepMirrors(key, mirror.at, true) > 0) {
		try {
			store.setItem(key, payload);
			return 'ok';
		} catch {
			// Still no room.
		}
	}
	// The stale value under this key is now WORSE than nothing: it claims to be
	// the writing on screen and is not. Drop it and report.
	drop(store, key);
	return 'full';
}

export function clearMirror(key: string): void {
	const store = storage();
	if (store) drop(store, key);
}

/**
 * WHAT A FOUND MIRROR MEANS, decided in one pure function so the composer's
 * effect is a call rather than a second copy of the rule.
 *
 * `entry` is the row the mirror names, as the feed currently holds it, or
 * undefined when the mirror names no entry or the feed does not have it.
 */
export type MirrorPlan =
	| { action: 'drop' }
	| {
			action: 'restore';
			/** The draft to go on adding to, or null to start a new entry. */
			entryId: string | null;
			/** The chain inside it to edit, or null to add the entry's first note. */
			noteId: string | null;
			/** That entry already has writing saved on it. */
			entryHasNote: boolean;
			/** The entry is no longer a live draft, so this saves as a new entry. */
			orphaned: boolean;
	  };

export function planMirrorRestore(
	mirror: DraftMirror,
	entry: NotebookEntry | undefined
): MirrorPlan {
	/**
	 * THE ONE COMPARISON, AND IT IS THE COMPOSER'S OWN. `autosaveBaseline` holds
	 * what the server has acknowledged and answers whether the box has moved off
	 * it; the mirror carries that same serial, so this is that question re-asked
	 * at read time rather than a second notion of "edited". A mirror holding
	 * nothing the server had not already acknowledged is not lost work -- it is a
	 * slot that outlived its own acknowledgement -- and restoring it would put a
	 * recovery message on screen about writing that was never at risk.
	 */
	if (serializeForBaseline(mirror.doc) === mirror.baseline) return { action: 'drop' };

	// A mirror with no entry behind it is the fresh-composer case: the writing
	// goes back and the next save creates the entry, exactly as it would have.
	if (!mirror.entryId) {
		return { action: 'restore', entryId: null, noteId: null, entryHasNote: false, orphaned: false };
	}

	/**
	 * THE ENTRY HAS TO STILL BE A LIVE DRAFT TO BE ADOPTED, and where it is not
	 * the composer must NOT keep naming it. A turned-in entry is not this
	 * session's to go on adding to, and an id the feed no longer holds is one
	 * every RPC will refuse -- so in both cases the writing is kept and the
	 * HANDLE is dropped, which turns the next save into a new entry rather than
	 * a refusal the student can do nothing about.
	 */
	const live = entry && !entry.submitted_at;
	if (!live) {
		return { action: 'restore', entryId: null, noteId: null, entryHasNote: false, orphaned: true };
	}

	/**
	 * WHICH CHAIN THE NEXT WRITE EDITS. The mirror's own id when that chain is
	 * still live; otherwise the entry's single live note, which is the chain
	 * this composer session would have been writing into; and null when there is
	 * ambiguity, because adding a note is recoverable and writing into the wrong
	 * chain is not.
	 */
	const threads = noteThreads(entry.notes);
	const named = mirror.noteId && threads.some((t) => t.noteId === mirror.noteId);
	const noteId = named ? mirror.noteId : threads.length === 1 ? threads[0].noteId : null;
	return {
		action: 'restore',
		entryId: entry.id,
		noteId,
		entryHasNote: threads.length > 0,
		orphaned: false
	};
}

/**
 * THE SENTENCE THE STUDENT READS, and it says what actually happened rather
 * than a reassurance.
 *
 * IT NEVER CLAIMS THE WRITING IS SAVED, in any branch. The mirror is a copy
 * this browser kept; whether the server has the same words is the save
 * indicator's question and it answers it a few pixels away. A message that
 * said "recovered and saved" would be the false negative that costs the one
 * case this exists for.
 */
export function mirrorRestoreMessage(plan: Extract<MirrorPlan, { action: 'restore' }>): string {
	const opening = 'Your writing was put back from this browser, where it was kept while you typed.';
	if (plan.orphaned) {
		return (
			`${opening} It was never saved, and the entry it was being written into is not a draft ` +
			'any more, so saving now makes a new entry out of it.'
		);
	}
	if (plan.entryHasNote) {
		return (
			`${opening} It has not been saved yet. The draft it belongs to already has writing saved ` +
			'on it, so open that draft below if you want to read the saved version before you save ' +
			'this one over the top.'
		);
	}
	return `${opening} It has not been saved yet, so save or turn it in when you are ready.`;
}

/**
 * WHAT THE COMPOSER SAYS WHEN THE MIRROR CANNOT BE WRITTEN AT ALL.
 *
 * A safety net nobody knows is missing is worse than no safety net, because
 * the student carries on typing a long entry under an assumption that stopped
 * being true. It is deliberately not an error: nothing has failed, the ordinary
 * save still works, and the instruction is the one that actually helps.
 */
export const MIRROR_UNAVAILABLE_NOTE =
	'This browser will not keep a backup copy of your writing while you type -- its storage is ' +
	'full or turned off. Your writing still saves to the server as usual, but press Save draft ' +
	'more often than you otherwise would.';
