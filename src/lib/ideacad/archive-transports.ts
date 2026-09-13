/**
 * The archive's server boundary: the six `0214` RPCs, in one place.
 *
 * A SEPARATE MODULE FROM `archive.ts`, which is the PURE layer and says so in
 * its own header -- no Svelte, no transport, no client, so every rule in it is
 * assertable without a browser and without a database. This is the half that
 * needs a `SupabaseClient`.
 *
 * AND A SEPARATE MODULE FROM `transports.ts`, which is the shape `assembly.ts`
 * already established: a subsystem owns the names of its own RPCs, and
 * `transports.ts` calls its factory rather than restating them. A second copy
 * of six function names in that file is exactly the drift the "do not duplicate
 * a rule" convention exists to prevent.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IdeacadArchiveRow } from './archive';

export interface IdeacadArchiveTransports {
	/** Every archived or off-roster document on one assignment. Instructor only. */
	list: (itemId: string) => Promise<IdeacadArchiveRow[]>;
	/** Archive, or restore. One call for both directions, as `0214` is written. */
	setArchived: (documentId: string, archived: boolean) => Promise<void>;
	shareWithSection: (documentId: string, sectionId: string) => Promise<void>;
	unshareFromSection: (documentId: string, sectionId: string) => Promise<void>;
}

/**
 * THE ERROR IS RE-THROWN VERBATIM. `0214` raises the sentence an instructor
 * should read ("Archive this document first. Sharing with a whole class is for
 * archived reference work."), and a transport that re-toned it would be a
 * second wording of one rule -- the surface renders whatever arrives here.
 */
async function rpc<T>(
	supabase: SupabaseClient,
	name: string,
	args: Record<string, unknown>
): Promise<T> {
	const { data, error } = await supabase.rpc(name, args);
	if (error) throw new Error(error.message);
	return data as T;
}

export function createIdeacadArchiveTransports(
	supabase: SupabaseClient
): IdeacadArchiveTransports {
	return {
		list: (itemId) =>
			rpc<IdeacadArchiveRow[]>(supabase, 'ideacad_archive', { p_item_id: itemId }),
		setArchived: async (documentId, archived) => {
			await rpc(supabase, 'ideacad_set_document_archived', {
				p_document_id: documentId,
				p_archived: archived
			});
		},
		shareWithSection: async (documentId, sectionId) => {
			await rpc(supabase, 'ideacad_share_document_with_section', {
				p_document_id: documentId,
				p_section_id: sectionId
			});
		},
		unshareFromSection: async (documentId, sectionId) => {
			await rpc(supabase, 'ideacad_unshare_document_from_section', {
				p_document_id: documentId,
				p_section_id: sectionId
			});
		}
	};
}

/**
 * Decide ONCE whether this deployment has `0214`, and report it.
 *
 * WHY A PROBE AND NOT A TRY-AT-EVERY-CALL, which is the same argument
 * `createIdeacadSharingTransports` makes for `0205`: a surface needs to know
 * whether to draw the archive BEFORE anybody presses anything, and an empty
 * panel is indistinguishable from an empty archive. So this asks the cheapest
 * question only `0214` can answer -- the archive list for one item, which is a
 * read, writes nothing, and is empty for most assignments -- and reports it.
 *
 * IT DEGRADES ON `PGRST202` ALONE. That code means the function is not in the
 * schema, which is exactly the pre-`0214` deployment. Any OTHER error is a real
 * failure inside a function that does exist, and falling through on it would
 * turn a fault into a silently missing feature, so it FAILS CLOSED: the archive
 * off, with the reason said out loud.
 *
 * A NON-MANAGER GETS `available: false` TOO, and that is correct rather than a
 * false negative: `ideacad_archive` raises for them, this reports the archive
 * as unavailable, and the panel is not drawn. The refusal is the database's
 * either way.
 */
export async function probeIdeacadArchive(
	supabase: SupabaseClient,
	itemId: string
): Promise<{ available: boolean; code: string | null }> {
	const { error } = await supabase.rpc('ideacad_archive', { p_item_id: itemId });
	if (!error) return { available: true, code: null };
	return { available: false, code: (error as { code?: string }).code ?? null };
}
