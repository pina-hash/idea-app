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
 *
 * WITH ONE THING THE SQLSTATE ALONE CANNOT SAY, WHICH IS WHY
 * `MAPS_PERMANENT_UNIQUE` EXISTS BELOW: `23505` is on that whitelist as a
 * RACE, and two of this feature's unique indexes are RULES that answer the
 * same way every time. The partition therefore finishes at THIS call site, on
 * the constraint's name, and the shared list is not widened or narrowed for
 * it.
 */

import { constraintNameOf, isTransientDbError } from '$lib/pg-errors';
import { MAPS_MEDIA_BUCKET, mapsPhotoOwnerColumn, type MapsPhotoOwner } from './media';
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

/**
 * PHOTOS ARE A SEPARATE INJECTED OBJECT, not four more methods on the one
 * above, and the split is the repo's own "an omitted optional transport
 * REMOVES the control it drives" rule taken at face value: a surface handed no
 * photo transports renders no camera and no picker, so read-only is structural
 * rather than a discipline. It also keeps `MapsTable` meaning what it means --
 * the four tables that carry draft/publish state and revisions -- while
 * `maps_photos` carries none of that (0163: a photo is CONTENT OF its owner and
 * has no publish state of its own).
 *
 * TWO WRITES, IN ONE ORDER, AND THE ORDER IS THE ARGUMENT. The object goes to
 * Storage FIRST and the row second. Row-first would leave a row naming bytes
 * that are not there, which renders as a broken image on a public map and
 * which nobody can repair without the file; object-first leaves at worst an
 * orphaned public image nobody references, which is the same acceptable
 * failure the Foundry delete argues for in the other direction. 0163 says the
 * same thing about deletion ("deleting a photo ROW does not delete the
 * OBJECT ... orphaned public image bytes are the acceptable failure").
 */
export interface MapsPhotoTransports {
	/**
	 * Uploads the bytes under `storageKey` with a CONCRETE `image/*` content
	 * type, then inserts the `maps_photos` row pointing at them.
	 *
	 * The content type is a parameter rather than read from the File here,
	 * because `File.type` is legitimately empty for an iPhone HEIC and the
	 * bucket refuses the `application/octet-stream` that an empty type
	 * defaults to -- 0163 names that as this bundle's obligation, and
	 * `mapsImageMime` is the one place it is discharged.
	 */
	attachPhoto(args: {
		owner: MapsPhotoOwner;
		ownerId: string;
		file: Blob;
		storageKey: string;
		mimeType: string;
	}): Promise<MapsResult<{ id: string; storage_key: string }>>;
}

interface DbError {
	code?: string;
	message: string;
	/* PostgREST forwards Postgres's own DETAIL line here, and on a 23505 that
	   is where `Key (item_type_id, node_id)=(...) already exists.` lands. It is
	   read only so `constraintNameOf` has both places to look; nothing renders
	   it, because it names columns rather than anything a person typed. */
	details?: string;
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

/** The storage slice, kept apart so a caller with no photos needs no bucket. */
export interface MapsStorageClient {
	storage: {
		from(bucket: string): {
			upload(
				path: string,
				body: Blob,
				options?: { contentType?: string; upsert?: boolean; cacheControl?: string }
			): PromiseLike<{ data: unknown; error: { message: string } | null }>;
		};
	};
}

/**
 * THE UNIQUE INDEXES THAT ARE RULES RATHER THAN RACES, and the sentence each
 * one owes the person who landed on it.
 *
 * `$lib/pg-errors` has `23505` on its TRANSIENT whitelist and that is right
 * for the case it was found in -- two writers racing an upsert, where the
 * loser's second attempt genuinely wins. It is wrong for a unique index that
 * encodes a RULE: "one placement per item type per container" and "one
 * published compartment per elevation slot" refuse the same way on every
 * attempt, so a caller reading the SQLSTATE alone retries a permanent answer
 * to exhaustion. 0168's own header says so and names this as the fix: "the fix
 * is for the maps write path to recognise this index by name and say 'that
 * elevation slot is taken', not to widen the transient list."
 *
 * SO THE PARTITION IS AT THE CALL SITE AND THE KEY IS THE CONSTRAINT NAME.
 * This map's KEYS are the permanent set and its VALUES are the wording, which
 * is what stops the two from drifting: a sentence added here removes the retry
 * in the same edit, and there is no second list of "which ones are permanent"
 * to forget. `maps_revisions_*_slot` is deliberately ABSENT -- `stagePending`
 * handles that 23505 itself, as the genuine race it is, by updating the
 * winner's row.
 */
export const MAPS_PERMANENT_UNIQUE: Record<string, string> = {
	maps_stock_one_row_per_placement:
		'This item type is already placed in that container. Edit the existing placement instead.',
	maps_nodes_elevation_slot:
		'Another published compartment in this unit is already in that elevation slot. Give this one a different slot number, or move the other one out of it first.',
	maps_photos_storage_key_key:
		'A photo is already stored under that name. Take the photo again.'
};

/**
 * The constraint a 23505 on this table must have been, when the driver did not
 * say which. One entry, because `maps_stock` is the one table in the write
 * surface with exactly one unique index that a form can reach -- guessing on a
 * table with two would be inventing an answer. A driver that names the
 * constraint (PostgREST does) never reaches this.
 */
const TABLE_IMPLIED_UNIQUE: Partial<Record<MapsTable, string>> = {
	maps_stock: 'maps_stock_one_row_per_placement'
};

/**
 * THE ONE DECISION, and it answers both halves at once: the sentence this
 * failure deserves, and -- by being non-null -- that no retry can change it.
 *
 * Written as one function on purpose. "What do we tell them" and "may we send
 * it again" used to be two independent expressions, which is exactly how the
 * shipped code came to hand a person "This item type is already placed in that
 * container" while simultaneously marking the result `retryable: true`.
 */
function permanentRefusal(error: DbError, table: MapsTable, verb: string): string | null {
	if (error.code === '23503' && verb === 'delete') {
		return table === 'maps_item_types'
			? 'This type is still placed or referenced somewhere. Remove its items and stock placements first.'
			: 'Something still lives inside this. Move or delete its contents first.';
	}
	if (error.code !== '23505') return null;
	const named = constraintNameOf(error) ?? TABLE_IMPLIED_UNIQUE[table] ?? null;
	return named === null ? null : (MAPS_PERMANENT_UNIQUE[named] ?? null);
}

/**
 * A refusal is rendered verbatim where this module has words for it, and the
 * database's own message otherwise -- a P0001 raise from a maps trigger is
 * already worded for whoever caused it. Both halves are read off ONE call to
 * `permanentRefusal`, because a separate `refusalMessage` helper reading it a
 * second time is how the two answers came to contradict each other in the
 * first place.
 */
function failure(error: DbError, table: MapsTable, verb: string): MapsResult<never> {
	const refusal = permanentRefusal(error, table, verb);
	return {
		ok: false,
		/* A refusal this module can word is a considered one, so it is never
		   retried; everything else falls to the shared partition, which is
		   itself told which uniqueness here is permanent so a 23505 naming one
		   cannot come back retryable through the other branch either. */
		retryable: refusal === null && isTransientDbError(error, Object.keys(MAPS_PERMANENT_UNIQUE)),
		message: refusal ?? error.message
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

/**
 * The real photo transports, over the browser Supabase client and the
 * `maps-media` bucket. Storage first, row second (see `MapsPhotoTransports`).
 *
 * NO SIGNING ROUTE AND NO SERVICE ROLE, which is 0163's own call: the bucket's
 * policies admit an `is_admin()` caller's own client directly, so the write
 * runs as the person doing it and the database stays the boundary. A server
 * route holding a key would be a second authorization model for a bucket that
 * already has one.
 */
export function mapsPhotoTransports(
	supabase: MapsWriteClient & MapsStorageClient
): MapsPhotoTransports {
	return {
		async attachPhoto({ owner, ownerId, file, storageKey, mimeType }) {
			const uploaded = await supabase.storage
				.from(MAPS_MEDIA_BUCKET)
				.upload(storageKey, file, { contentType: mimeType, upsert: false });
			if (uploaded.error) {
				return {
					ok: false,
					// Storage's own refusals here are the bucket's two rules --
					// the 20 MiB ceiling and images-only -- which the client
					// checked before sending. Reaching one means the two
					// disagree, so the message is passed through rather than
					// reworded into a guess about which.
					retryable: /network|fetch|timeout|failed to fetch/i.test(uploaded.error.message),
					message: `The photo did not upload: ${uploaded.error.message}`
				};
			}
			const column = mapsPhotoOwnerColumn(owner);
			const { data, error } = await supabase
				.from('maps_photos')
				.insert({ [column]: ownerId, storage_key: storageKey })
				.select('id, storage_key')
				.single();
			if (error) {
				/* `maps_photos.storage_key` is globally unique (0163) and the key
				   is a fresh uuid, so a 23505 here cannot be a race a resend
				   wins -- the same key would collide again. It goes through the
				   same permanent set as every other write. */
				const named = constraintNameOf(error);
				const worded = named === null ? null : (MAPS_PERMANENT_UNIQUE[named] ?? null);
				return {
					ok: false,
					retryable:
						worded === null && isTransientDbError(error, Object.keys(MAPS_PERMANENT_UNIQUE)),
					// The bytes ARE up. Saying so is the difference between a
					// retry that re-uploads 8 MB and one that writes a row.
					message: `The photo uploaded but was not attached: ${worded ?? error.message}`
				};
			}
			return { ok: true, data: data as { id: string; storage_key: string } };
		}
	};
}
