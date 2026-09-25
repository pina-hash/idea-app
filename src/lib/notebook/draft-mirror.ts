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
 * THE QUICK NOTE'S OWN SLOT (ledger 0298, R33): `notebook_draft_mirror:<viewer>:quick`.
 *
 * The header's quick note is a notebook note, so it is mirrored through THIS
 * module -- the same eight properties, the same vocabulary check -- rather
 * than a third mirror of its own. But it is a DIFFERENT SURFACE from the
 * composer, and `latestMirror` below answers "the newest slot for this
 * viewer", which without an exclusion would hand the quick note's writing to
 * the notebook composer the next time it mounted: the composer would put it in
 * its own box and adopt the quick note's draft, and two editors would then be
 * writing one note chain. So the composer's read skips this record, and the
 * quick note reads its own key directly (`readMirror`).
 */
export const QUICK_NOTE_RECORD = 'quick';

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
 * THE NODE AND MARK NAMES THIS BUILD'S NOTE EDITOR CAN ACTUALLY RENDER.
 *
 * WHY THIS EXISTS, AND IT IS THE HALF THE SHAPE VERSION NEVER COVERED. `v`
 * below versions the MIRROR'S OWN FIELD SET; `doc` is stored and handed back
 * OPAQUELY, so a document naming a node this build has never heard of passes
 * every check in `readMirrorAt` and is handed to Tiptap intact.
 *
 * MEASURED, in `tests/dom/notebook-draft-mirror-vocabulary.test.ts`, against a
 * real editor configured exactly as `NoteEditor.svelte` configures one: Tiptap
 * does NOT throw on an unknown type. It catches the `RangeError` internally,
 * logs a warning, and DISCARDS THE WHOLE DOCUMENT -- a paragraph sitting before
 * the offending block comes back gone and the editor is seeded with one empty
 * paragraph. So the failure mode of restoring such a mirror is a student's
 * draft silently blank, which is worse than the throw everybody expects.
 *
 * AND IT IS WIDER THAN BLOCKS, which is why there are two lists rather than
 * one. The same total discard was measured for an unknown INLINE node and for
 * an unknown MARK; only an unrecognised ATTR on a known node is dropped
 * harmlessly. `underline`, `strike` and `code` are all switched off in
 * `NOTE_SCHEMA_OPTIONS` today, so a build that turns one on reproduces this
 * through the mark list and not the node list.
 *
 * PINNED AGAINST THE REAL SCHEMA RATHER THAN TYPED OUT AND TRUSTED. The test
 * builds `getSchema([StarterKit.configure(NOTE_SCHEMA_OPTIONS)])` and reconciles
 * both lists against it in both directions, which is `rich-text-schema.ts`'s own
 * argument for existing: one declaration, read by the editor AND by the test, is
 * what makes this class of drift impossible. A node added to the editor without
 * being added here reddens.
 */
export interface MirrorVocabulary {
	readonly nodes: readonly string[];
	readonly marks: readonly string[];
}

export const NOTE_MIRROR_VOCABULARY: MirrorVocabulary = {
	nodes: ['bulletList', 'doc', 'listItem', 'orderedList', 'paragraph', 'text'],
	marks: ['bold', 'italic', 'link']
};

/**
 * WHAT A `v: 1` BUILD COULD RENDER, FROZEN, and it is a different question from
 * the one above even though the two are equal today.
 *
 * This is the only lever there is over builds ALREADY DEPLOYED: they cannot be
 * taught to look inside `doc`, and the one field they do check is `v`. So a
 * mirror whose document carries anything outside THIS list is written `v: 2`,
 * which such a build drops cleanly instead of blanking.
 *
 * IT IS EQUAL TO `NOTE_MIRROR_VOCABULARY` TODAY AND MUST NOT BE UPDATED WITH
 * IT. The two diverge the moment a node or mark is added to the editor, and
 * that divergence is what arms the version bump with no second edit: a bundle
 * that wires `notebookGrid` into `NoteEditor.svelte` adds the name to the
 * vocabulary above, `mirrorVersionFor` starts answering 2 for documents that
 * use it, and nothing else has to remember.
 */
export const V1_MIRROR_VOCABULARY: MirrorVocabulary = {
	nodes: ['bulletList', 'doc', 'listItem', 'orderedList', 'paragraph', 'text'],
	marks: ['bold', 'italic', 'link']
};

/** The newest shape version this build writes. */
export const DRAFT_MIRROR_VERSION = 2;

/** Every shape version this build can read. An older one is still somebody's writing. */
export const KNOWN_MIRROR_VERSIONS = [1, 2] as const;

export type MirrorVersion = (typeof KNOWN_MIRROR_VERSIONS)[number];

/**
 * A depth cap, carried down the walk, for the same reason every other walk over
 * a stored document in this repo carries one: the gate is not the only door a
 * value can arrive through, and a renderer that trusts it hangs the day one
 * does. `localStorage` is a door anything on this origin can write to.
 */
const MAX_MIRROR_DEPTH = 40;

/**
 * EVERY NODE AND MARK TYPE IN `doc` THAT `vocab` DOES NOT NAME, sorted and
 * deduped, or an empty array.
 *
 * Pure, and it reads nothing but the document it is handed. Depth beyond the cap
 * reports `'(too deeply nested)'` rather than answering empty: "I could not
 * finish looking" must never read as "I looked and found nothing", which is the
 * shape of every vacuous sweep this repo has had to un-write.
 */
export function unknownTypes(doc: unknown, vocab: MirrorVocabulary = NOTE_MIRROR_VOCABULARY): string[] {
	const found = new Set<string>();
	const nodes = new Set(vocab.nodes);
	const marks = new Set(vocab.marks);
	const walk = (node: unknown, depth: number): void => {
		if (!node || typeof node !== 'object') return;
		if (depth > MAX_MIRROR_DEPTH) {
			found.add('(too deeply nested)');
			return;
		}
		const n = node as Partial<TiptapNode>;
		if (typeof n.type === 'string' && !nodes.has(n.type)) found.add(n.type);
		if (Array.isArray(n.marks)) {
			for (const mark of n.marks) {
				const type = (mark as { type?: unknown })?.type;
				if (typeof type === 'string' && !marks.has(type)) found.add(type);
			}
		}
		if (Array.isArray(n.content)) for (const child of n.content) walk(child, depth + 1);
	};
	walk(doc, 0);
	return [...found].sort();
}

/**
 * THE SHAPE VERSION TO WRITE FOR THIS DOCUMENT.
 *
 * `1` whenever a deployed `v: 1` build could render every type in it, which is
 * the ordinary prose note and is most of them. Bumping unconditionally would
 * make every draft written from now on unreadable to the build currently
 * running -- which is the loss this whole bundle exists to prevent, inverted.
 */
export function mirrorVersionFor(doc: unknown): MirrorVersion {
	return unknownTypes(doc, V1_MIRROR_VOCABULARY).length > 0 ? 2 : 1;
}

/**
 * WHAT ONE SLOT HOLDS. Everything the composer would otherwise lose, which is
 * deliberately wider than the note: `notebook_pending_capture` already proved
 * that putting a student back in front of their title and their check-in is
 * most of the recovery, and it explicitly does NOT carry the note body -- this
 * is the half that was missing.
 */
export interface DraftMirror {
	/**
	 * Shape version. An UNKNOWN one is DROPPED, never guessed at; a KNOWN older
	 * one is read, because a slot written twenty minutes before this deploy is
	 * still a student's unsaved writing. `mirrorVersionFor` picks which to write.
	 */
	v: MirrorVersion;
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
export function sweepMirrors(
	keepKey: string,
	now: number,
	all = false,
	protect: readonly string[] = []
): number {
	const store = storage();
	if (!store) return 0;
	let removed = 0;
	for (const key of mirrorKeys(store)) {
		if (key === keepKey) continue;
		/**
		 * A HELD SLOT IS NOT LITTER AND THE QUOTA SWEEP MUST NOT EAT IT. `all` is
		 * the quota path, which drops every other slot regardless of age -- and a
		 * slot this build has refused to open is the one copy of writing nobody
		 * can get back once it goes. Protecting it means a genuinely full storage
		 * reports `'full'` and the composer says the net is not there, which is
		 * loud, against silently destroying a backup, which is not.
		 */
		if (protect.includes(key)) continue;
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
		if (!KNOWN_MIRROR_VERSIONS.includes(parsed?.v as MirrorVersion)) return null;
		if (typeof parsed.at !== 'number') return null;
		if (typeof parsed.baseline !== 'string') return null;
		if (!parsed.doc || typeof parsed.doc !== 'object') return null;
		return {
			v: parsed.v as MirrorVersion,
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
	// The quick note's slot belongs to another surface (see QUICK_NOTE_RECORD).
	const quick = `${mine}${QUICK_NOTE_RECORD}`;
	let best: { key: string; mirror: DraftMirror } | null = null;
	for (const key of mirrorKeys(store)) {
		if (!key.startsWith(mine) || key === quick) continue;
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
export function writeMirror(
	key: string,
	mirror: DraftMirror,
	protect: readonly string[] = []
): MirrorWrite {
	const store = storage();
	if (!store) return 'blocked';
	const payload = JSON.stringify(mirror);
	try {
		store.setItem(key, payload);
		return 'ok';
	} catch {
		// Fall through to the sweep.
	}
	if (sweepMirrors(key, mirror.at, true, protect) > 0) {
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
	/**
	 * FOUND, KEPT, AND NOT OPENED -- the answer for a document naming something
	 * this build cannot render, and the one branch that must never quietly become
	 * one of the other two.
	 *
	 * WHAT WAS REJECTED, because both alternatives look reasonable and both lose
	 * the writing:
	 *
	 *   DROP THE SLOT AND SAY SO. Loud, and still total loss: the slot is the
	 *   ONLY copy -- the tab that was typing into it is gone and nothing was
	 *   dispatched -- so deleting it turns a recoverable state into an
	 *   unrecoverable one for the sake of tidiness.
	 *
	 *   RESTORE THE BLOCKS IT DOES UNDERSTAND. This is the tempting one, and it
	 *   destroys the part it could not show, about four hundred milliseconds
	 *   later: the restored box IS what the composer mirrors next, so the very
	 *   next debounce writes the stripped document back over the slot and the
	 *   unknown block is gone from the only place it existed. It also restates
	 *   `$lib/server/rich-text-normalize`'s whitelist drop on the READ path,
	 *   which is the "content disappears" failure that module's own header
	 *   describes.
	 *
	 * HOLDING KEEPS EVERY BYTE WHERE IT IS. The writing sits in `localStorage`
	 * untouched for the rest of its ordinary 24-hour life, so the overwhelmingly
	 * likely resolution of this situation -- a rollback rolled forward again, a
	 * stale tab reloaded -- restores it WHOLE. Nothing is handed to the editor,
	 * so nothing overwrites it. The student is told a backup exists, that this
	 * version of the page cannot open it, and what to do.
	 *
	 * IT IS STILL BOUNDED BY THE AGE CAP, deliberately: the exposure window that
	 * cap exists for outranks holding somebody's writing on a shared lab machine
	 * indefinitely.
	 */
	| { action: 'hold'; unknown: string[] }
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
	entry: NotebookEntry | undefined,
	vocab: MirrorVocabulary = NOTE_MIRROR_VOCABULARY
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

	/**
	 * THE VOCABULARY CHECK RUNS SECOND, AND THE ORDER IS LOAD-BEARING. A mirror
	 * matching its own baseline holds nothing the server has not already
	 * acknowledged, so there is no lost writing to hold onto and dropping it
	 * costs nothing even when it names a type this build cannot draw. Asking
	 * this first would strand a slot forever over a document that was never at
	 * risk, and put a message on screen about it.
	 */
	const unknown = unknownTypes(mirror.doc, vocab);
	if (unknown.length > 0) return { action: 'hold', unknown };

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
 * THE SENTENCE FOR A HELD MIRROR, and it is the loud half of the fix: without
 * it, holding is indistinguishable from having found nothing.
 *
 * IT NEVER SAYS THE WRITING WAS PUT BACK, because it was not, and it never says
 * the writing is lost, because it is not either. What it says is where the
 * writing is, why it is not on screen, and the one action that actually gets it
 * back -- reloading, which is what a student does when a deploy is what put
 * them on a stale tab, and which is free.
 *
 * NO TYPE NAMES REACH THE STUDENT. `notebookGrid` means nothing to anybody
 * reading it and turns a clear sentence into a bug report; the names are in
 * `MirrorPlan.unknown` for a console, a report and a test.
 */
export function mirrorHeldMessage(): string {
	return (
		'This browser has a backup copy of writing you had not saved, but this version of the page ' +
		'cannot open it -- it was written using something a newer version of the notebook added. ' +
		'Nothing has been deleted and the copy is being kept. Reload this page, and if it still ' +
		'says this, tell Mr. Pina before you type over it.'
	);
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
