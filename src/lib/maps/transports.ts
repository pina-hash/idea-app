/**
 * THE EDITOR'S WRITE SURFACE, as an injected transports object: the route
 * hands the real one (built over the browser Supabase client) to MapsEditor,
 * and the dev harness hands an in-memory one, which is what makes the whole
 * surface drivable with no network (CLAUDE.md "Server calls are INJECTED as a
 * transports object").
 *
 * WHAT A WRITE IS HERE, AND WHAT IT IS NOT. 0161's header states this
 * feature's deviation from the repo's every-write-is-a-definer-RPC default:
 * the P1 editor is admin-only and writes THROUGH THE `is_admin()` RLS
 * POLICIES directly, with `maps_publish` as the one RPC because
 * promote-and-retain must be atomic. These transports stay inside that
 * boundary -- plain inserts, updates and deletes on the five tables, plus
 * that one RPC. No new RPC, no API route, no service role.
 *
 * ONE PROMOTION PATH. An edit to a PUBLISHED object is always staged as the
 * pending revision (`stagePending`) and promoted by `maps_publish` -- the
 * editor never updates a published live row directly, even though the
 * retention trigger would archive it correctly. Save-and-publish is therefore
 * stage-then-publish in sequence: if the publish half fails, what is left
 * behind is a visible pending edit, not a half-applied row.
 *
 * REFUSAL vs RETRYABLE is the SQLSTATE partition in `$lib/pg-errors`, the
 * same one the classroom upload vocabulary reads -- never a second list. A
 * trigger's `raise` (P0001) is already worded for the person who caused it
 * ("A compartment cannot sit inside a room. Allowed: ...") and is passed
 * through verbatim; the bare constraint codes that can still escape the
 * form's own pre-checks get sentences in the user's terms.
 */

import { isTransientSqlstate } from '$lib/pg-errors';
import type { MapsEditorData, MapsTable } from './maps';
import { MAPS_PENDING_COLUMN } from './maps';
import { loadMapsEditorData, type MapsReadClient } from './selects';

export type MapsResult<T> =
	| { ok: true; data: T }
	| { ok: false; retryable: boolean; message: string };

export interface MapsPublishOutcome {
	ok: boolean;
	action?: string;
	reason?: string;
	retained_revision?: number | null;
}

export interface MapsTransports {
	/** Creates a row (status defaults to draft in the schema). Returns its id. */
	insertRow(table: MapsTable, values: Record<string, unknown>): Promise<MapsResult<{ id: string }>>;
	/** Updates a DRAFT live row in place. Published rows go through stagePending. */
	updateRow(table: MapsTable, id: string, patch: Record<string, unknown>): Promise<MapsResult<null>>;
	/** Real deletion -- the row and its history. The schema refuses when children or contents remain. */
	deleteRow(table: MapsTable, id: string): Promise<MapsResult<null>>;
	/** Stages (or replaces) the pending revision of a published object. */
	stagePending(
		table: MapsTable,
		id: string,
		snapshot: Record<string, unknown>
	): Promise<MapsResult<null>>;
	/** Removes a staged pending edit; the published row is untouched. */
	discardPending(table: MapsTable, id: string): Promise<MapsResult<null>>;
	/** The one RPC: first-publish a draft, or promote the pending revision. */
	publish(table: MapsTable, id: string): Promise<MapsResult<MapsPublishOutcome>>;
	/** Re-reads everything the route load read, through the same module. */
	reload(): Promise<MapsResult<MapsEditorData>>;
}

interface DbError {
	code?: string;
	message: string;
}

/** The narrow client slice the real transports need. */
export interface MapsWriteClient extends MapsReadClient {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	from(table: string): any;
	rpc(
		name: string,
		args?: Record<string, unknown>
	): PromiseLike<{ data: unknown; error: DbError | null }>;
}

/**
 * The constraint codes a form's own pre-checks cannot fully prevent, in the
 * user's terms rather than the storage vendor's. Anything unrecognised keeps
 * the database's message -- a P0001 raise here is already user-worded.
 */
function refusalMessage(error: DbError, table: MapsTable, verb: string): string {
	if (error.code === '23503' && verb === 'delete') {
		return table === 'maps_item_types'
			? 'This type is still placed or referenced somewhere. Remove its items and stock placements first.'
			: 'Something still lives inside this. Move or delete its contents first.';
	}
	if (error.code === '23505' && table === 'maps_stock') {
		return 'This item type is already placed in that container. Edit the existing placement instead.';
	}
	return error.message;
}

function failure(error: DbError, table: MapsTable, verb: string): MapsResult<never> {
	return {
		ok: false,
		retryable: isTransientSqlstate(error.code),
		message: refusalMessage(error, table, verb)
	};
}

const GONE: MapsResult<never> = {
	ok: false,
	retryable: false,
	message: 'That object is no longer there. Reload the editor and try again.'
};

/**
 * THE ONE WRITE DECISION every form shares: where an edit goes depends only on
 * what the object IS. A new object is inserted (a draft, by the schema's own
 * default); a draft's live row is updated in place, because nobody but
 * editors can see it; a PUBLISHED object's edit is staged as the pending
 * revision, never written to the live row, so the public keeps seeing the old
 * version until publish. `publishNow` is the admin save-and-publish of spec
 * 4.3, and it is the same decision plus the one RPC -- not a different path.
 * Four forms calling one function is what keeps them from drifting into four
 * opinions about when the public sees an edit.
 */
export async function mapsSaveObject(
	transports: MapsTransports,
	args: {
		table: MapsTable;
		/** The row being edited, or null to create one. */
		row: { id: string; status: 'draft' | 'published' } | null;
		content: Record<string, unknown>;
		publishNow: boolean;
	}
): Promise<MapsResult<{ id: string }>> {
	let id: string;
	if (args.row === null) {
		const created = await transports.insertRow(args.table, args.content);
		if (!created.ok) return created;
		id = created.data.id;
	} else if (args.row.status === 'draft') {
		const updated = await transports.updateRow(args.table, args.row.id, args.content);
		if (!updated.ok) return updated;
		id = args.row.id;
	} else {
		const staged = await transports.stagePending(args.table, args.row.id, args.content);
		if (!staged.ok) return staged;
		id = args.row.id;
	}
	if (args.publishNow) {
		const published = await transports.publish(args.table, id);
		// The save half LANDED: a failed publish leaves a draft or a visible
		// pending edit, and the message says which half still needs doing.
		if (!published.ok) {
			return {
				ok: false,
				retryable: published.retryable,
				message: `Saved, but not published: ${published.message}`
			};
		}
	}
	return { ok: true, data: { id } };
}

export function mapsTransports(supabase: MapsWriteClient): MapsTransports {
	return {
		async insertRow(table, values) {
			const { data, error } = await supabase.from(table).insert(values).select('id').single();
			if (error) return failure(error, table, 'insert');
			return { ok: true, data: { id: (data as { id: string }).id } };
		},

		async updateRow(table, id, patch) {
			const { data, error } = await supabase.from(table).update(patch).eq('id', id).select('id');
			if (error) return failure(error, table, 'update');
			// RLS answers an update of a vanished row with zero rows, not an error.
			if (!Array.isArray(data) || data.length === 0) return GONE;
			return { ok: true, data: null };
		},

		async deleteRow(table, id) {
			const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
			if (error) return failure(error, table, 'delete');
			if (!Array.isArray(data) || data.length === 0) return GONE;
			return { ok: true, data: null };
		},

		async stagePending(table, id, snapshot) {
			const col = MAPS_PENDING_COLUMN[table];
			// Update-then-insert rather than upsert: the at-most-one-pending rule
			// is a partial EXPRESSION index (coalesce(revision, -1)), which
			// PostgREST's on_conflict column list cannot name. Two tabs racing the
			// insert collide on that index (23505); the loser's correct move is to
			// update the winner's row, which the retry below is.
			for (let attempt = 0; attempt < 2; attempt += 1) {
				const updated = await supabase
					.from('maps_revisions')
					.update({ snapshot })
					.eq(col, id)
					.eq('state', 'pending')
					.select('id');
				if (updated.error) return failure(updated.error, table, 'stage');
				if (Array.isArray(updated.data) && updated.data.length > 0) return { ok: true, data: null };
				const inserted = await supabase
					.from('maps_revisions')
					.insert({ [col]: id, state: 'pending', snapshot });
				if (!inserted.error) return { ok: true, data: null };
				if (inserted.error.code !== '23505') return failure(inserted.error, table, 'stage');
			}
			return { ok: false, retryable: true, message: 'Two edits collided. Try saving again.' };
		},

		async discardPending(table, id) {
			const col = MAPS_PENDING_COLUMN[table];
			const { error } = await supabase
				.from('maps_revisions')
				.delete()
				.eq(col, id)
				.eq('state', 'pending');
			if (error) return failure(error, table, 'discard');
			return { ok: true, data: null };
		},

		async publish(table, id) {
			const { data, error } = await supabase.rpc('maps_publish', {
				p_object_table: table,
				p_object_id: id
			});
			if (error) return failure(error, table, 'publish');
			const outcome = data as MapsPublishOutcome;
			if (!outcome?.ok) {
				const reason =
					outcome?.reason === 'not_found'
						? 'That object is no longer there. Reload the editor and try again.'
						: outcome?.reason === 'nothing_pending'
							? 'Nothing is waiting to publish on this object.'
							: `Publish refused: ${outcome?.reason ?? 'unknown reason'}.`;
				return { ok: false, retryable: false, message: reason };
			}
			return { ok: true, data: outcome };
		},

		async reload() {
			try {
				return { ok: true, data: await loadMapsEditorData(supabase) };
			} catch (cause) {
				return {
					ok: false,
					retryable: true,
					message: cause instanceof Error ? cause.message : 'The reload failed.'
				};
			}
		}
	};
}
