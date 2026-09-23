import type { SupabaseClient } from '@supabase/supabase-js';
import { driveConfigured } from '$lib/server/notebook-drive';
import { readStudentEntries } from '$lib/server/notebook-student';
import { captureLabel } from '$lib/notebook/capture';
import type { NotebookEntry } from '$lib/notebook';

/**
 * WHAT THE ITEM PAGE'S NOTEBOOK CAPTURE NEEDS, AND NOTHING MORE (ledger 0297,
 * package F4b): the two capabilities the notebook route already reports
 * (`uploadReady` is whether Drive is configured, `draftsReady` whether 0118's
 * drafts exist), and the student's OWN entries in this class that could belong
 * to this item. The precise filing rule runs in the page (`captureFiling`,
 * against the layout's check-ins and its one clock); this read only narrows the
 * payload so an item page does not carry a term's notebook.
 *
 * THE SAME ROWS THROUGH THE SAME LADDER AND MAPPING as the notebook itself
 * (`readStudentEntries`), scoped with both explicit filters -- the caller's own
 * rows, filed to this class -- because RLS legitimately returns a staff
 * account's reviewable rows too, and "mine" is attribution, not authorization.
 *
 * FAILS SOFT, never loud: the item page is the work surface, and a notebook
 * read that cannot answer costs the capture block and nothing else.
 */
export interface ItemNotebook {
	configured: boolean;
	uploadReady: boolean;
	draftsReady: boolean;
	coalescingReady: boolean;
	entries: NotebookEntry[];
}

export async function loadItemNotebook(
	supabase: SupabaseClient,
	studentId: string,
	sectionId: string,
	item: { id: string; title: string | null }
): Promise<ItemNotebook> {
	try {
		const [read, postings] = await Promise.all([
			readStudentEntries(supabase, { studentId, sectionId }),
			// Which check-ins in this class hang off this item (0120). A project
			// without the column refuses the filter, and then every check-in entry
			// in the class is kept for the page to sort out.
			supabase
				.from('notebook_session_postings')
				.select('session_id')
				.eq('section_id', sectionId)
				.eq('item_id', item.id)
		]);
		const sessions = postings.error
			? null
			: new Set(((postings.data ?? []) as { session_id: string }[]).map((p) => p.session_id));
		const label = captureLabel(item.title);
		const entries = read.entries.filter((e) =>
			e.session_id
				? sessions === null || sessions.has(e.session_id)
				: (e.custom_label ?? '').trim() === (label ?? '')
		);
		return {
			configured: !read.entryError,
			uploadReady: driveConfigured(),
			draftsReady: read.ready.drafts === true,
			coalescingReady: read.ready.coalescing === true,
			entries
		};
	} catch {
		return { configured: false, uploadReady: false, draftsReady: false, coalescingReady: false, entries: [] };
	}
}
