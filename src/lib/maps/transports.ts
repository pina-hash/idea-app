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
import type { MapsEditorGrant, MapsEditorScope, MapsRosterRow } from './grants';
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
	/**
	 * The one RPC: first-publish a draft, or promote the pending revision.
	 *
	 * OPTIONAL, AND THE ABSENCE IS THE MECHANISM (CLAUDE.md: "an omitted
	 * optional transport REMOVES the control it drives"). 0172 keeps
	 * `maps_publish` admin-only in its own body, so a GRANTEE is handed
	 * transports with no `publish` at all and every publish control -- the
	 * panel, Save & publish, the subtree plan -- has nothing to call and is
	 * not rendered. Read-only-as-to-publishing is then structural rather than
	 * a discipline: there is no write to execute.
	 */
	publish?(table: MapsTable, id: string): Promise<MapsResult<MapsPublishOutcome>>;
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
 * The constraint codes a form's own pre-checks cannot fully prevent, in the
 * user's terms rather than the storage vendor's. Anything unrecognised keeps
 * the database's message -- a P0001 raise here is already user-worded.
 */
function refusalMessage(error: DbError, table: MapsTable, verb: string): string {
	// 42501 IS A CONSIDERED REFUSAL, NOT A FAILURE TO DELIVER. Postgres's own
	// sentence for it is "new row violates row-level security policy for table
	// \"maps_nodes\"", which names our storage vendor's mechanism and not the
	// person's problem. A refusal names its gate (CLAUDE.md), and after 0172
	// the gate a grantee hits is always one of two things: outside what they
	// were given, or already public.
	if (error.code === '42501') return MAPS_PERMISSION_REFUSAL;
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

/**
 * THE ONE SPELLING OF A PERMISSION REFUSAL, shared by the two paths a refusal
 * can arrive on. It is deliberately about what the person may do rather than
 * about which policy said no: naming the policy would be naming the schema at
 * somebody standing at a toolbox with a phone.
 */
export const MAPS_PERMISSION_REFUSAL =
	'You cannot change this. Map editing covers drafts inside the containers you have been given; anything already on the public map is a site admin.';

const GONE: MapsResult<never> = {
	ok: false,
	retryable: false,
	message: 'That object is no longer there. Reload the editor and try again.'
};

const REFUSED: MapsResult<never> = {
	ok: false,
	retryable: false,
	message: MAPS_PERMISSION_REFUSAL
};

/**
 * AN UPDATE OR DELETE REFUSED BY RLS ANSWERS ZERO ROWS, NOT AN ERROR, so the
 * two outcomes a client has to tell apart -- "it is gone" and "you may not" --
 * arrive identically. Before 0172 they could not be told apart and did not
 * need to be: every writer was an admin, who could reach every row, so zero
 * rows really did mean the row had gone. A grantee makes the second case
 * ordinary, and "That object is no longer there. Reload the editor" is then
 * advice that cannot work -- the reload brings the row straight back.
 *
 * The discriminator is a SECOND READ: an UPDATE's USING clause and a SELECT
 * policy are different predicates, so a row that is still READABLE after a
 * write returned nothing was refused rather than removed. It costs one round
 * trip and only ever on the failure path.
 */
async function absentOrRefused(
	supabase: MapsWriteClient,
	table: MapsTable,
	id: string
): Promise<MapsResult<never>> {
	try {
		const { data, error } = await supabase.from(table).select('id').eq('id', id);
		if (error) return GONE;
		return Array.isArray(data) && data.length > 0 ? REFUSED : GONE;
	} catch {
		return GONE;
	}
}

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
		if (!transports.publish) {
			// Unreachable through the UI -- with no publish transport no control
			// sets publishNow -- and stated anyway, because the save HALF LANDED
			// and a silent success would report a draft as published.
			return {
				ok: false,
				retryable: false,
				message: `Saved as a draft. ${MAPS_PERMISSION_REFUSAL}`
			};
		}
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
			// Zero rows is either "gone" or "not yours" -- see absentOrRefused.
			if (!Array.isArray(data) || data.length === 0)
				return absentOrRefused(supabase, table, id);
			return { ok: true, data: null };
		},

		async deleteRow(table, id) {
			const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
			if (error) return failure(error, table, 'delete');
			if (!Array.isArray(data) || data.length === 0)
				return absentOrRefused(supabase, table, id);
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
				return {
					ok: false,
					retryable: isTransientSqlstate(error.code),
					// The bytes ARE up. Saying so is the difference between a
					// retry that re-uploads 8 MB and one that writes a row.
					message: `The photo uploaded but was not attached: ${error.message}`
				};
			}
			return { ok: true, data: data as { id: string; storage_key: string } };
		}
	};
}

/**
 * THE GRANT ADMIN'S OWN TRANSPORTS, a THIRD injected object rather than three
 * more methods on `MapsTransports`, for the same reason photos are a second
 * one: a surface handed none renders no grant console, so the admin-only half
 * of the editor is absent by construction for everybody else rather than
 * present and refusing.
 *
 * All three are RPCs, not table writes -- `maps_editor_grants` has no client
 * write path at all (0172 section 1), which is what makes the definer bodies
 * the only way in and their `is_admin()` refusals the boundary.
 */
export interface MapsGrantTransports {
	/** Every grant, or one container's. Empty for a non-admin, never an error. */
	roster(nodeId?: string | null): Promise<MapsResult<MapsRosterRow[]>>;
	grant(email: string, nodeId: string, note: string | null): Promise<MapsResult<null>>;
	revoke(email: string, nodeId: string): Promise<MapsResult<null>>;
}

/**
 * The CALLER's own scope, read once by the route load. `maps_my_editor_grants`
 * is parameterless on purpose (0172): "only their own grants" is a property of
 * the signature rather than a check that could be got wrong.
 *
 * IT DEGRADES ON `PGRST202` ALONE, the repo's rule, and the rung is what makes
 * the migration and the deploy independent events: on a deployment where 0172
 * has not been pasted yet the function does not exist, the caller has no
 * grants because the table does not exist either, and the honest answer is an
 * empty grant list -- which leaves the editor exactly as admin-only as it is
 * today. Any OTHER error fails closed to the same empty list rather than
 * throwing the page away, because "cannot tell" must never read as "yes".
 */
export async function loadMapsScope(
	supabase: MapsWriteClient,
	admin: boolean
): Promise<MapsEditorScope> {
	const { data, error } = await supabase.rpc('maps_my_editor_grants');
	if (error || !Array.isArray(data)) return { admin, grants: [] };
	return { admin, grants: data as MapsEditorGrant[] };
}

/**
 * THE TRANSPORTS FOR A GIVEN VIEWER, and the ONE place `publish` is withheld.
 *
 * 0172 keeps `maps_publish` admin-only in its own body, so a granted editor's
 * transports simply have no `publish` -- and every publish control in the tree
 * (the panel, Save & publish, the subtree plan, the shelf's confirm) has
 * nothing to call and is not rendered. Two routes mount an editor and both
 * call this rather than each stripping the method themselves: two spellings of
 * "does this person publish" is the pair that stops agreeing, and the one that
 * drifted would render a control whose only outcome is a refusal.
 */
export function mapsTransportsFor(
	supabase: MapsWriteClient,
	scope: MapsEditorScope
): MapsTransports {
	const full = mapsTransports(supabase);
	if (scope.admin) return full;
	const { publish: _publish, ...rest } = full;
	void _publish;
	return rest;
}

export function mapsGrantTransports(supabase: MapsWriteClient): MapsGrantTransports {
	const done = (error: DbError | null): MapsResult<null> =>
		error
			? { ok: false, retryable: isTransientSqlstate(error.code), message: error.message }
			: { ok: true, data: null };
	return {
		async roster(nodeId = null) {
			const { data, error } = await supabase.rpc('maps_editor_roster', { p_node_id: nodeId });
			if (error) {
				return { ok: false, retryable: isTransientSqlstate(error.code), message: error.message };
			}
			return { ok: true, data: (Array.isArray(data) ? data : []) as MapsRosterRow[] };
		},
		async grant(email, nodeId, note) {
			const { error } = await supabase.rpc('maps_editor_grant', {
				p_email: email,
				p_node_id: nodeId,
				p_note: note
			});
			return done(error);
		},
		async revoke(email, nodeId) {
			const { error } = await supabase.rpc('maps_editor_revoke', {
				p_email: email,
				p_node_id: nodeId
			});
			return done(error);
		}
	};
}
