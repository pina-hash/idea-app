/**
 * THE QUICK NOTE AND THE INBOX (ledger 0298, R33 and R32's entry point): the
 * pure rules behind writing to the notebook from the page header and filing
 * what was written afterwards.
 *
 * WHAT A QUICK NOTE IS. A private DRAFT, written through the notebook's own
 * note path (`notebook_create_note_entry`, 0129, which already takes a null
 * section and a null session) -- never a new table, never a new RPC. 0118 makes
 * a draft invisible to staff, so a quick note is private by construction, not
 * by a flag this module sets.
 *
 * FILING IS DETERMINISTIC, NEVER A GUESS AND NEVER AI (Mr. Pina's decided
 * default, QUEUE.md "Session 4 defaults"). A note taken inside a class is filed
 * to that class; a note taken on an assignment page also carries the
 * assignment's title as its label, which is exactly the class filing
 * `captureFiling` writes for an item with no check-in, so a quick note on an
 * assignment page shows up under that assignment's notebook card. Anywhere else
 * it is filed to nothing and waits in the Inbox.
 *
 * Pure and client-safe: no Svelte, no Supabase, no DOM.
 */

import {
	livePhotos,
	nearestOutstanding,
	type CreateEntryResult,
	type EntryActionResult,
	type NotebookEntry,
	type NotebookSession,
	type NotePayload
} from '$lib/notebook';
import { docToTiptap, noteThreads } from '$lib/notebook-notes';
import { captureLabel } from '$lib/notebook/capture';
import { isProjectorRoute } from '$lib/shell/deploy-safety';
import { CLASSROOM_SHELL_HARNESSES } from '$lib/feedback/context';

// ---------------------------------------------------------------------------
// Where the control is offered
// ---------------------------------------------------------------------------

/**
 * The `/dev` harnesses that render the control, besides the classroom shell's
 * own (which render it because they mount the real shell, and so measure the
 * production header). `/dev/home-order` mounts the real home page.
 */
export const QUICK_NOTE_HARNESSES = ['/dev/quick-note', '/dev/home-order'] as const;

const under = (prefix: string, routeId: string) =>
	routeId === prefix || routeId.startsWith(`${prefix}/`);

/**
 * IS THE QUICK NOTE OFFERED ON THIS ROUTE? The classroom (which is also where
 * the notebook lives) and the portal home, and nowhere projected.
 *
 * STRUCTURALLY IT IS MOUNTED ONLY IN THOSE TWO HEADERS, so a game, IdeaCAD and
 * a Foundry or ported-HTML document (`/a`, `/b`, `/hx`) never render it at all.
 * This predicate is the second half: a route INSIDE the classroom that is on
 * the wall -- the lesson deck, the class projector -- is in `PROJECTOR_ROUTES`,
 * and a private notebook control on a projected page is a student's notebook on
 * the wall. Asking the registry rather than listing the two routes here means a
 * projected route added later is excluded the day it is registered.
 */
export function quickNoteOffered(routeId: string | null | undefined): boolean {
	if (!routeId) return false;
	if (isProjectorRoute(routeId)) return false;
	if (routeId === '/') return true;
	if (under('/classroom', routeId)) return true;
	return (
		QUICK_NOTE_HARNESSES.some((p) => under(p, routeId)) ||
		CLASSROOM_SHELL_HARNESSES.some((p) => under(p, routeId))
	);
}

// ---------------------------------------------------------------------------
// The "Hide quick note" preference
// ---------------------------------------------------------------------------

/**
 * `profiles.preferences.quickNote`, one more independent namespace written
 * through `$lib/preferences/profile-io` (read-first, merged, queued). SPARSE:
 * shown is the default and is stored as nothing at all, so only a person who
 * hid the control has a key.
 */
export const QUICK_NOTE_PREF_NAMESPACE = 'quickNote';

/** Hidden only when the stored value says exactly that; anything else is the default. */
export function quickNoteHiddenIn(preferences: unknown): boolean {
	if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return false;
	const ns = (preferences as Record<string, unknown>)[QUICK_NOTE_PREF_NAMESPACE];
	if (!ns || typeof ns !== 'object' || Array.isArray(ns)) return false;
	return (ns as Record<string, unknown>).hidden === true;
}

/** What to write into the namespace: `{ hidden: true }`, or nothing for the default. */
export function quickNotePrefValue(hidden: boolean): { hidden: true } | undefined {
	return hidden ? { hidden: true } : undefined;
}

// ---------------------------------------------------------------------------
// Filing a quick note, from the route it was written on
// ---------------------------------------------------------------------------

export interface QuickNoteFiling {
	/** The class the note is filed to, or null for the Inbox alone. */
	sectionId: string | null;
	/** The entry's title: the assignment's, on an assignment page; otherwise none. */
	customLabel: string | null;
	/** Where it goes, in words, for the line under the box. */
	where: string;
}

/**
 * WHERE THIS NOTE GOES, from facts the header already has: the class in the
 * URL, that class's name, and the assignment title when the page is one.
 *
 * THE LABEL IS THE ASSIGNMENT'S TITLE AND NOTHING ELSE. A page name such as
 * "People" or "Notebook" would become the entry's title in every list
 * (`entryTitle` prefers `custom_label` over the note's own words), which hides
 * what the note says behind where it was typed. With no label an entry is
 * titled by its own first words.
 */
export function quickNoteFiling(input: {
	sectionId: string | null | undefined;
	sectionLabel?: string | null;
	itemTitle?: string | null;
}): QuickNoteFiling {
	const sectionId = input.sectionId || null;
	if (!sectionId) return { sectionId: null, customLabel: null, where: 'your notebook Inbox' };
	const customLabel = captureLabel(input.itemTitle);
	const className = input.sectionLabel?.trim() || 'this class';
	return {
		sectionId,
		customLabel,
		where: customLabel ? `${className}, ${customLabel}` : className
	};
}

/**
 * THE PAYLOAD FOR THE FIRST WRITE: a draft (`submitted: false`) the autosave
 * may replace (`autosave: true`, 0129), with no check-in and no folder.
 */
export function quickNotePayload(filing: QuickNoteFiling, content: NotePayload['content']): NotePayload {
	return {
		content,
		custom_label: filing.customLabel,
		folder_id: null,
		section_id: filing.sectionId,
		submitted: false,
		autosave: true
	};
}

// ---------------------------------------------------------------------------
// The Inbox
// ---------------------------------------------------------------------------

/** When a draft was last written to: the entry, or the newest of its notes. */
export function draftTouchedAt(entry: Pick<NotebookEntry, 'upload_timestamp' | 'notes'>): string {
	let best = entry.upload_timestamp;
	for (const n of entry.notes ?? []) {
		const at = n.updated_at ?? n.created_at;
		if (at && at > best) best = at;
	}
	return best;
}

/**
 * THE INBOX: the viewer's own drafts that answer no check-in, newest first.
 *
 * A draft filed to a class but to no check-in is still here, because it has not
 * been put anywhere it counts: a check-in is where notebook work is asked for.
 * Ties break on the id so two renders never disagree about the order.
 */
export function inboxDrafts<E extends Pick<NotebookEntry, 'id' | 'session_id' | 'submitted_at' | 'upload_timestamp' | 'notes'>>(
	entries: readonly E[]
): E[] {
	return entries
		.filter((e) => e.submitted_at === null && e.session_id === null)
		.map((e) => ({ e, at: draftTouchedAt(e) }))
		.sort((a, b) => b.at.localeCompare(a.at) || a.e.id.localeCompare(b.e.id))
		.map(({ e }) => e);
}

/** Where a draft can be filed with one press. */
export type InboxTarget =
	| {
			kind: 'check-in';
			sectionId: string;
			sessionId: string;
			/** The check-in's own label. */
			label: string;
			/** The class it runs in, when that needs saying (a draft with no class yet). */
			classLabel: string | null;
	  }
	| { kind: 'class'; sectionId: string; label: string };

/** The words on the button. */
export function inboxTargetLabel(target: InboxTarget): string {
	if (target.kind === 'class') return `File to ${target.label}`;
	return target.classLabel
		? `File to ${target.label} (${target.classLabel})`
		: `File to ${target.label}`;
}

/**
 * THE ONE-PRESS DESTINATIONS FOR A DRAFT, decided the way the composer decides
 * its own quick-pick (`nearestOutstanding`, the check-in nearest today that the
 * student has not turned anything in for), so the Inbox and the composer can
 * never suggest two different check-ins for the same day.
 *
 *   - A draft already in a class: that class's nearest open check-in, or
 *     nothing when the class has none open (it is already where it belongs).
 *   - A draft in no class: one destination per class, each that class's
 *     nearest open check-in or, when it has none, the class itself.
 */
export function inboxTargets(
	entry: Pick<NotebookEntry, 'section_id'>,
	context: {
		sessions: readonly NotebookSession[];
		/** Every entry, so a check-in already turned in is not offered again. */
		entries: readonly Pick<NotebookEntry, 'session_id' | 'submitted_at'>[];
		/** The classes a draft with no class may go to, in the order to offer them. */
		classes: readonly { id: string; label: string }[];
		today: string;
	}
): InboxTarget[] {
	const nearestIn = (sectionId: string) =>
		nearestOutstanding(
			context.sessions.filter((s) => s.section_id === sectionId),
			[...context.entries],
			context.today
		);
	if (entry.section_id) {
		const s = nearestIn(entry.section_id);
		return s
			? [{ kind: 'check-in', sectionId: s.section_id, sessionId: s.id, label: s.session_label, classLabel: null }]
			: [];
	}
	return context.classes.map((c): InboxTarget => {
		const s = nearestIn(c.id);
		return s
			? { kind: 'check-in', sectionId: c.id, sessionId: s.id, label: s.session_label, classLabel: c.label }
			: { kind: 'class', sectionId: c.id, label: c.label };
	});
}

/**
 * WHY A DRAFT CANNOT BE FILED WITH ONE PRESS, or null when it can.
 *
 * NO RPC MOVES AN EXISTING ENTRY FOR A STUDENT. `notebook_admin_override_entry`
 * is the only write that changes an entry's class or check-in and it is
 * admin-only (`is_admin()` inside it), so filing is done with two writes that
 * DO exist: the note is written again as a new draft where it belongs, then the
 * old draft is deleted (into Recently deleted, where it can be restored). That
 * copies a note and nothing else -- photos cannot be copied, because a photo is
 * a Drive upload -- so it is offered only for a draft that is exactly one note
 * and no photos, which is what a quick note is. An atomic
 * `notebook_file_draft` would lift this and is a migration, proposed in the
 * ledger 0298 report rather than built.
 */
export type InboxFileBlock = 'photos' | 'notes' | 'empty' | null;

export function inboxFileBlock(entry: Pick<NotebookEntry, 'photos' | 'notes'>): InboxFileBlock {
	if (livePhotos(entry.photos ?? []).length > 0) return 'photos';
	const threads = noteThreads(entry.notes ?? []);
	if (threads.length === 0) return 'empty';
	if (threads.length > 1) return 'notes';
	return null;
}

/** The sentence for a blocked row: what is true, and where the draft can still be finished. */
export function inboxFileBlockReason(block: Exclude<InboxFileBlock, null>): string {
	switch (block) {
		case 'photos':
			return 'Has photos, so it cannot be moved. Open it to add to it or turn it in where it is.';
		case 'notes':
			return 'Has more than one note, so it cannot be moved. Open it to finish it where it is.';
		case 'empty':
			return 'Has nothing in it yet.';
	}
}

export interface InboxFileTransports {
	createNote: (payload: NotePayload) => Promise<CreateEntryResult>;
	deleteEntry: (entryId: string) => Promise<EntryActionResult>;
}

export type InboxFileOutcome =
	| { ok: true; entryId: string }
	/** The new draft was never made; nothing changed. */
	| { ok: false; stage: 'create'; error: string }
	/** The draft IS filed (`entryId`), but the old copy is still in the Inbox. */
	| { ok: false; stage: 'delete'; entryId: string; error: string };

/**
 * FILE ONE DRAFT: write it again where it belongs, THEN delete the old copy.
 *
 * THE ORDER IS THE ACCEPTABLE FAILURE, Foundry's "rows first" argument in
 * small. Two writes cannot be one transaction from a browser, so one of them
 * can land alone. Create-first leaves, at worst, the note in two places -- the
 * filed draft and the Inbox copy, both private, both visible, the second one
 * named by the Inbox as still there. Delete-first leaves, at worst, the note in
 * Recently deleted and nowhere else, which a student reads as lost work. So the
 * create goes first, and a failed delete is reported as "filed, but the old
 * copy is still here" -- never as a failed filing, because pressing it again
 * would file it twice.
 *
 * The note is written as the stored document reopened in the editor's shape
 * (`docToTiptap`, the same conversion every edit uses), keeping its title and
 * folder, as a DRAFT and with no autosave flag: this is a deliberate act, so
 * its one revision is a boundary, not something the next autosave may replace.
 */
export async function fileDraft(
	transports: InboxFileTransports,
	entry: Pick<NotebookEntry, 'id' | 'custom_label' | 'folder_id' | 'notes' | 'photos'>,
	target: InboxTarget
): Promise<InboxFileOutcome> {
	const block = inboxFileBlock(entry);
	if (block) return { ok: false, stage: 'create', error: inboxFileBlockReason(block) };
	const thread = noteThreads(entry.notes)[0];
	let created: CreateEntryResult;
	try {
		created = await transports.createNote({
			content: docToTiptap(thread.current.content),
			custom_label: entry.custom_label ?? null,
			folder_id: entry.folder_id ?? null,
			section_id: target.sectionId,
			...(target.kind === 'check-in' ? { session_id: target.sessionId } : {}),
			submitted: false
		});
	} catch (err) {
		return { ok: false, stage: 'create', error: errorText(err, 'That draft could not be filed.') };
	}
	if (!created.ok) return { ok: false, stage: 'create', error: created.error };
	return removeInboxCopy(transports, entry.id, created.entryId);
}

/** The second half on its own, for the Retry beside a failed delete. */
export async function removeInboxCopy(
	transports: Pick<InboxFileTransports, 'deleteEntry'>,
	oldEntryId: string,
	filedEntryId: string
): Promise<InboxFileOutcome> {
	let removed: EntryActionResult;
	try {
		removed = await transports.deleteEntry(oldEntryId);
	} catch (err) {
		return { ok: false, stage: 'delete', entryId: filedEntryId, error: errorText(err, 'The old copy could not be removed.') };
	}
	if (!removed.ok) return { ok: false, stage: 'delete', entryId: filedEntryId, error: removed.error };
	return { ok: true, entryId: filedEntryId };
}

function errorText(err: unknown, fallback: string): string {
	return err instanceof Error && err.message ? err.message : fallback;
}
