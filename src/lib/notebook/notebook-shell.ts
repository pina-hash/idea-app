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
