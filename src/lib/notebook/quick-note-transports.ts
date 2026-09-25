import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateEntryResult, EntryActionResult, NoteSaveResult, NotePayload } from '$lib/notebook';
import type { TiptapNode } from '$lib/notebook-notes';
import { createNotebookTransports } from '$lib/notebook/transports';

/**
 * EVERYTHING THE QUICK NOTE WRITES OR ASKS, as one injected object (ledger
 * 0298, R33). The real mount points it at the notebook's own write routes;
 * `/dev/quick-note` answers in memory.
 *
 * THE FOUR WRITES ARE THE NOTEBOOK'S OWN TRANSPORTS, taken from
 * `createNotebookTransports` rather than re-spelled: a quick note is a notebook
 * note, so it reaches `/api/notebook/note`, `/api/notebook/edit-note`,
 * `/api/notebook/add-note` and `notebook_seal_notes` exactly as the composer
 * does, with the same refusal-versus-retry reading of every answer. Nothing
 * here is a new server path, and nothing is widened.
 */
export interface QuickNoteTransports {
	createNote: (payload: NotePayload) => Promise<CreateEntryResult>;
	editNote: (noteId: string, doc: TiptapNode, autosave?: boolean) => Promise<NoteSaveResult>;
	addNote: (entryId: string, doc: TiptapNode, autosave?: boolean) => Promise<NoteSaveResult>;
	sealNotes: (entryId: string) => Promise<EntryActionResult>;
	/**
	 * IS THIS STILL THE CALLER'S OWN OPEN DRAFT? Asked once, of a draft id a
	 * restored mirror names, before the quick note goes on writing into it: a
	 * draft turned in or deleted in another tab since must not be edited, and an
	 * answer this cannot give is `'unknown'`, which is treated as "no" -- a
	 * second draft is recoverable, writing into the wrong one is not.
	 */
	draftOpen: (entryId: string) => Promise<boolean | 'unknown'>;
}

/**
 * WHAT A `/dev` HARNESS PROVIDES INSTEAD OF A SESSION, through Svelte context
 * under this key: a viewer id and in-memory transports. The dock reads it
 * before it reads `page.data`, so the harness mounts the REAL header with the
 * real dock inside it rather than a copy of either. Production never sets it.
 */
export const QUICK_NOTE_HARNESS = Symbol('quick-note-harness');

export interface QuickNoteHarness {
	viewerId: string;
	transports: QuickNoteTransports;
}

/**
 * The real transports, on the caller's own client. `draftOpen` is a plain
 * RLS-scoped select (0069 grants a student their own `notebook_entries` rows;
 * `deleted_at` is 0116's), so it can only ever see the caller's own draft.
 */
export function createQuickNoteTransports(supabase: SupabaseClient): QuickNoteTransports {
	const t = createNotebookTransports(supabase);
	return {
		createNote: t.createNote,
		editNote: t.editNote,
		addNote: t.addNote,
		sealNotes: t.sealNotes,
		async draftOpen(entryId) {
			try {
				const { data, error } = await supabase
					.from('notebook_entries')
					.select('id, submitted_at')
					.eq('id', entryId)
					.is('deleted_at', null)
					.maybeSingle();
				if (error) return 'unknown';
				const row = data as { id?: string; submitted_at?: string | null } | null;
				return !!row?.id && row.submitted_at === null;
			} catch {
				return 'unknown';
			}
		}
	};
}
