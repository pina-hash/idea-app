/**
 * THE QUICK NOTE'S SHARED STATE (ledger 0298): two facts more than one surface
 * reads in the same tab.
 *
 *   1. Whether this viewer has HIDDEN the header control. It is stored in
 *      `profiles.preferences.quickNote` through `$lib/preferences/profile-io`
 *      (never a direct `.update`), and it is read by the header, which hides
 *      the control, and by the notebook's Inbox, which is where it is turned
 *      back on. The page-load snapshot of the profile is not refreshed by a
 *      client navigation, so a choice made on one surface has to reach the
 *      other through here, the moment it is made.
 *   2. Which draft the header's quick note is still WRITING, so the Inbox does
 *      not offer to move a draft out from under an editor that is typing into
 *      it.
 *
 * THE READS NEVER WRITE REACTIVE STATE. `writing-aid.svelte.ts` measured what
 * that costs -- a module-level `$state` assigned during a `$derived` read is
 * `state_unsafe_mutation`, after which no click handler in the tree fires -- so
 * the reactive part is a counter only the setters bump, and the per-viewer
 * values live in a plain `Map`.
 */
import {
	supabaseProfileIo,
	writeProfileNamespace,
	type PreferenceWriteResult,
	type ProfilePreferenceIo
} from '$lib/preferences/profile-io';
import { QUICK_NOTE_PREF_NAMESPACE, quickNoteHiddenIn, quickNotePrefValue } from '$lib/notebook/quick-note';
import type { SupabaseClient } from '@supabase/supabase-js';

let version = $state(0);
const hiddenByViewer = new Map<string, boolean>();

/**
 * Is the header control hidden for this viewer? A choice made in this tab
 * wins; otherwise the stored preference the page loaded with.
 */
export function quickNoteHidden(viewerId: string | null | undefined, preferences: unknown): boolean {
	void version;
	const known = viewerId ? hiddenByViewer.get(viewerId) : undefined;
	return known ?? quickNoteHiddenIn(preferences);
}

/**
 * Hide or show it, at once on screen and then in the profile row. The screen
 * keeps the choice for the session whatever the write answers, which is
 * `profile-io`'s own "fails soft" rule; the result is returned for a caller
 * that wants to say the choice was not stored.
 */
export async function setQuickNoteHidden(
	viewerId: string,
	hidden: boolean,
	io: ProfilePreferenceIo | null
): Promise<PreferenceWriteResult> {
	hiddenByViewer.set(viewerId, hidden);
	version += 1;
	if (!io) return { ok: true };
	return writeProfileNamespace(io, QUICK_NOTE_PREF_NAMESPACE, quickNotePrefValue(hidden));
}

/** The real row, for a mount that has a client and a viewer. */
export function quickNoteProfileIo(
	supabase: SupabaseClient | null | undefined,
	viewerId: string | null | undefined
): ProfilePreferenceIo | null {
	return supabase && viewerId ? supabaseProfileIo(supabase, viewerId) : null;
}

let writingEntry = $state<string | null>(null);

/** The draft the header's quick note is still writing into, or null. */
export function quickNoteWritingEntry(): string | null {
	return writingEntry;
}

/** Set by the quick note only, from event handlers and its own writes. */
export function setQuickNoteWritingEntry(entryId: string | null): void {
	if (writingEntry !== entryId) writingEntry = entryId;
}
