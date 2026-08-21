/**
 * THE NOTEBOOK'S TWO-PANE DECISIONS, as plain functions.
 *
 * Out here rather than in NotebookView for the reason composer-staging.ts is
 * out of ContentComposer: the guarantees these carry are the ones that fail
 * SILENTLY. A selection that keeps naming a deleted entry looks exactly like a
 * selection that is working; a discard warning that fires on a navigation the
 * form survives looks exactly like one that is protecting something; a detail
 * pane that shows a stale copy of an entry looks exactly like a fresh one.
 * None of that shows up in a type check and none of it is visible in a
 * screenshot, so all of it is asserted directly against these functions.
 *
 * Pure: no Svelte, no Supabase, nothing that decides who may write.
 */

import { tiptapHasText, type TiptapNode } from '$lib/notebook-notes';
import type { NotebookEntry, StagedPhoto } from '$lib/notebook';

/** What the composer holds when it is asked to be thrown away. */
export type ComposerWork = {
	staged: StagedPhoto[];
	title: string;
	noteDraft: TiptapNode | null;
};

/**
 * IS THERE ANYTHING TO LOSE. A picked check-in is deliberately NOT work: the
 * form arrives with one already selected (the nearest outstanding one), so
 * counting it would make every close ask a question about a choice nobody made.
 * A staged photo, a typed title and a note with real text in it are the three
 * things a student cannot get back from a discarded form.
 */
export function notebookComposerHasWork(work: ComposerWork): boolean {
	if (work.staged.length > 0) return true;
	if (work.title.trim().length > 0) return true;
	return tiptapHasText(work.noteDraft);
}

/** Said once, so the close control and the navigation guard cannot diverge. */
export const NOTEBOOK_DISCARD_WARNING =
	'This entry has not been saved yet, and the photos and text in it are only in this browser.';

/** The other thing a notebook page can be holding: an open note editor. */
export const NOTEBOOK_NOTE_DISCARD_WARNING =
	'You have edits to a note that have not been saved yet.';

/** Everything on a notebook page that the server has not acknowledged. */
export type NotebookUnsavedWork = {
	/** The composer's contents, or null when it is not mounted at all. */
	composer: ComposerWork | null;
	/** How many open note editors are holding unsaved edits. */
	dirtyNoteEditors: number;
};

/**
 * WHICH UNSAVED THING THE PAGE IS HOLDING, or null for none.
 *
 * The guard used to ask `notebookComposerHasWork` and nothing else, so an open
 * note editor with a retyped paragraph in it was invisible to it: clicking
 * another entry threw the edit away with nothing said. A note editor is two
 * components below the page, so it reports its own dirty state up and this
 * function is where the two answers are combined -- one place, so the guard
 * and the close control cannot end up disagreeing about what counts as work.
 *
 * THE NOTE COMES FIRST because it is the more surprising loss. A composer
 * visibly holds a form; an open note editor looks like the note.
 */
export function notebookUnsavedReason(work: NotebookUnsavedWork): 'note' | 'composer' | null {
	if (work.dirtyNoteEditors > 0) return 'note';
	if (work.composer && notebookComposerHasWork(work.composer)) return 'composer';
	return null;
}

/** The warning that goes with each reason, so no caller writes its own. */
export function notebookUnsavedWarning(reason: 'note' | 'composer'): string {
	return reason === 'note' ? NOTEBOOK_NOTE_DISCARD_WARNING : NOTEBOOK_DISCARD_WARNING;
}

/**
 * WHICH ENTRY THE DETAIL PANE IS SHOWING, resolved from the CURRENT list every
 * time rather than captured when the row was clicked.
 *
 * This is the trap ReferenceDoc shipped: a pane that survives a data change
 * keeps rendering whatever was open when it was constructed. Here the feed
 * reloads after every save (a new photo, a new note, a re-file, a pin), which
 * replaces every entry object -- so a snapshot would leave the open entry
 * showing the state it had before the thing that was just saved to it.
 * Resolving by id means the pane and the row can never disagree, and an entry
 * that has stopped existing resolves to null instead of to a ghost.
 */
export function selectedEntryOf(
	entries: NotebookEntry[],
	selectedId: string | null
): NotebookEntry | null {
	if (!selectedId) return null;
	return entries.find((entry) => entry.id === selectedId) ?? null;
}

/**
 * The selection, CLAMPED to what is actually in the notebook. Returns the id to
 * keep, or null to clear it -- an entry that has been deleted, or that this
 * payload never contained, must not leave the pane pointing at nothing.
 *
 * Deliberately keyed on the whole notebook rather than on what the query has
 * narrowed to: filtering the list to one folder should not close the entry you
 * are reading.
 */
export function clampSelection(entries: NotebookEntry[], selectedId: string | null): string | null {
	if (!selectedId) return null;
	return entries.some((entry) => entry.id === selectedId) ? selectedId : null;
}
