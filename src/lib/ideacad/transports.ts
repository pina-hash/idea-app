import type { SupabaseClient } from '@supabase/supabase-js';
import { createIdeacadLive, type IdeacadLive } from './live';
import {
	ideacadRoleFromPayload,
	type IdeacadDocumentRole,
	type IdeacadGrant,
	type IdeacadGrantRole,
	type IdeacadSharedDocument
} from './sharing';

/** The database row returned for one live IdeaCAD concept. */
export interface IdeacadConceptRow {
	id: string;
	document_id: string;
	name: string;
	position: number;
	features: unknown;
	revision: number;
	committed_at: string | null;
	deleted_at: string | null;
	created_at: string;
	updated_at: string;
}

/** The student's one IdeaCAD document for an assignment. */
export interface IdeacadDocumentRow {
	id: string;
	item_id: string;
	student_email: string;
	active_concept_id: string | null;
	created_at: string;
	updated_at: string;
}

/** The prediction attached to an IdeaCAD document, when one has been made. */
export interface IdeacadPredictionRow {
	document_id: string;
	predicted_concept_id: string;
	rationale: string;
	made_at: string;
}

/** Exact payload of `ideacad_open_document`. */
export interface IdeacadOpenDocumentResult {
	document: IdeacadDocumentRow;
	concepts: IdeacadConceptRow[];
	prediction: IdeacadPredictionRow | null;
	config: unknown;
}

/**
 * Exact payload of `ideacad_open_shared_document` (0205).
 *
 * IT IS NOT `IdeacadOpenDocumentResult` PLUS TWO FIELDS BY ACCIDENT. The two
 * RPCs differ in what they are keyed on and in whether they write:
 * `ideacad_open_document` takes an ITEM, resolves the caller's OWN document and
 * CREATES it (and its first concept) if they are absent; this one takes a
 * DOCUMENT ID, belongs to somebody else, and never writes anything. `role` and
 * `canWrite` come down with the payload so a surface does not have to ask a
 * second question to know whether to render a read-only view.
 */
export interface IdeacadOpenSharedResult extends IdeacadOpenDocumentResult {
	role: IdeacadDocumentRole | null;
	canWrite: boolean;
}

/** Exact success-or-stale union returned by `ideacad_save_concept`. */
export type IdeacadSaveConceptResult =
	| { ok: true; concept: IdeacadConceptRow }
	| { ok: false; reason: 'stale'; concept: IdeacadConceptRow };

/** The complete RPC boundary consumed by the IdeaCAD state layer. */
export interface IdeacadTransports {
	readonly live: IdeacadLive;
	setEditor(itemId: string, editor: string | null, config: unknown): Promise<unknown>;
	openDocument(itemId: string): Promise<IdeacadOpenDocumentResult>;
	newConcept(documentId: string, name: string, features: unknown): Promise<IdeacadConceptRow>;
	saveConcept(
		conceptId: string,
		features: unknown,
		revision: number
	): Promise<IdeacadSaveConceptResult>;
	updateConceptMeta(conceptId: string, name: string, position: number): Promise<IdeacadConceptRow>;
	deleteConcept(conceptId: string): Promise<{ ok: true; activeConceptId: string }>;
	setActive(documentId: string, conceptId: string): Promise<{ ok: true }>;
	setPrediction(
		documentId: string,
		conceptId: string,
		rationale: string
	): Promise<IdeacadPredictionRow>;
	commitConcept(conceptId: string): Promise<IdeacadConceptRow>;
	roster(itemId: string): Promise<unknown>;

	// -----------------------------------------------------------------------
	// SHARING (0205). Decision 24: private by default, the owner shares with
	// named classmates as viewer or editor, instructors read everything.
	//
	// EVERY ONE OF THESE IS OPTIONAL, AND THE ABSENCE IS THE MECHANISM. A
	// migration is applied by hand, so a deployment between 0204 and 0205 is a
	// real state; on it these are left undefined and the surface that would
	// mount a share control renders none, exactly the way an omitted
	// `uploadSubmissionFile` removes the file picker. Read-only is then
	// structural -- there is no write to execute -- rather than a flag somebody
	// has to remember to check.
	//
	// NONE OF THEM TAKES AN IDENTITY. The caller is `current_user_email()`
	// inside the definer, so "can only act as themselves" is a property of the
	// signature rather than a check a client could get wrong.
	// -----------------------------------------------------------------------

	/** Share the caller's OWN document with a classmate, or change their role. */
	shareDocument?: (
		documentId: string,
		granteeEmail: string,
		role: IdeacadGrantRole
	) => Promise<IdeacadGrant>;
	/** Remove a grant from the caller's own document. Removing a grant that is not there is not an error. */
	unshareDocument?: (
		documentId: string,
		granteeEmail: string
	) => Promise<{ ok: true; removed: number }>;
	/** The whole grant list for a document, for its owner or a teacher of record. */
	documentGrants?: (documentId: string) => Promise<IdeacadGrant[]>;
	/** Open a document somebody shared with the caller. Never writes. */
	openSharedDocument?: (documentId: string) => Promise<IdeacadOpenSharedResult>;
	/** What has been shared WITH the caller on one item: their only way to learn a document id. */
	sharedWithMe?: (itemId: string) => Promise<IdeacadSharedDocument[]>;

	uploadSubmissionFile?: (
		itemId: string,
		file: File,
		blockId?: string | null,
		caption?: string | null,
		onProgress?: (progress: number) => void
	) => Promise<unknown>;
}

/** Build the typed IdeaCAD RPC boundary around the signed-in Supabase client. */
export function createIdeacadTransports(
	supabase: SupabaseClient,
	uploadSubmissionFile?: IdeacadTransports['uploadSubmissionFile']
): IdeacadTransports {
	const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
		const { data, error } = await supabase.rpc(name, args);
		if (error) throw new Error(error.message);
		return data as T;
	};

	return {
		live: createIdeacadLive(supabase),
		setEditor: (itemId, editor, config) =>
			rpc('ideacad_set_editor', { p_item_id: itemId, p_editor: editor, p_config: config }),
		openDocument: (itemId) => rpc('ideacad_open_document', { p_item_id: itemId }),
		newConcept: (documentId, name, features) =>
			rpc('ideacad_new_concept', {
				p_document_id: documentId,
				p_name: name,
				p_features: features
			}),
		saveConcept: (conceptId, features, revision) =>
			rpc('ideacad_save_concept', {
				p_concept_id: conceptId,
				p_features: features,
				p_revision: revision
			}),
		updateConceptMeta: (conceptId, name, position) =>
			rpc('ideacad_update_concept_meta', {
				p_concept_id: conceptId,
				p_name: name,
				p_position: position
			}),
		deleteConcept: (conceptId) => rpc('ideacad_delete_concept', { p_concept_id: conceptId }),
		setActive: (documentId, conceptId) =>
			rpc('ideacad_set_active', { p_document_id: documentId, p_concept_id: conceptId }),
		setPrediction: (documentId, conceptId, rationale) =>
			rpc('ideacad_set_prediction', {
				p_document_id: documentId,
				p_concept_id: conceptId,
				p_rationale: rationale
			}),
		commitConcept: (conceptId) => rpc('ideacad_commit_concept', { p_concept_id: conceptId }),
		roster: (itemId) => rpc('ideacad_roster', { p_item_id: itemId }),

		// The sharing region. These are wired unconditionally here, because the
		// factory cannot know whether 0205 is applied without spending a round
		// trip to find out; what decides whether a CONTROL appears is
		// `createIdeacadSharingTransports` below, which probes once and hands
		// back undefined on a deployment that has not had the migration.
		shareDocument: (documentId, granteeEmail, role) =>
			rpc('ideacad_share_document', {
				p_document_id: documentId,
				p_grantee_email: granteeEmail,
				p_role: role
			}),
		unshareDocument: (documentId, granteeEmail) =>
			rpc('ideacad_unshare_document', {
				p_document_id: documentId,
				p_grantee_email: granteeEmail
			}),
		documentGrants: (documentId) =>
			rpc('ideacad_document_grants', { p_document_id: documentId }),
		openSharedDocument: async (documentId) => {
			const payload = await rpc<
				IdeacadOpenDocumentResult & { role: unknown; canWrite: unknown }
			>('ideacad_open_shared_document', { p_document_id: documentId });
			// The role is VALIDATED against the union rather than trusted: a value
			// no branch renders must not reach the UI, and "cannot tell" must never
			// read as the permissive answer. An unrecognised role comes back null,
			// and canWrite is then false whatever the payload claimed.
			const role = ideacadRoleFromPayload(payload.role);
			return {
				...payload,
				role,
				canWrite: role !== null && payload.canWrite === true
			};
		},
		sharedWithMe: (itemId) => rpc('ideacad_shared_with_me', { p_item_id: itemId }),

		uploadSubmissionFile
	};
}

/**
 * Decide ONCE whether this deployment has 0205, and remove the sharing
 * transports if it does not.
 *
 * WHY A PROBE AND NOT A TRY-AT-EVERY-CALL. A surface needs to know whether to
 * draw a Share control BEFORE anybody presses it, and a control whose only
 * possible outcome is a refusal must not be offered. So this asks the cheapest
 * question that only 0205 can answer -- the caller's own shared-with-me list for
 * one item, which is a read, writes nothing, and is empty for most students --
 * and reports the answer.
 *
 * IT DEGRADES ON `PGRST202` ALONE. That code means the function is not in the
 * schema, which is exactly the pre-0205 deployment. Any OTHER error is a real
 * failure inside a function that does exist, and falling through on it would
 * turn a fault into a silently missing feature -- so it fails CLOSED: sharing
 * off, with the reason said out loud.
 */
export async function createIdeacadSharingTransports(
	supabase: SupabaseClient,
	itemId: string
): Promise<{ available: boolean; code: string | null }> {
	const { error } = await supabase.rpc('ideacad_shared_with_me', { p_item_id: itemId });
	if (!error) return { available: true, code: null };
	return { available: false, code: (error as { code?: string }).code ?? null };
}

/**
 * Strip the sharing transports off a boundary, so a pre-0205 deployment mounts
 * a surface with no share control at all rather than one that throws when
 * pressed. ABSENCE IS THE MECHANISM; this is the one place it is applied.
 */
export function withoutIdeacadSharing(transports: IdeacadTransports): IdeacadTransports {
	const {
		shareDocument: _share,
		unshareDocument: _unshare,
		documentGrants: _grants,
		openSharedDocument: _open,
		sharedWithMe: _mine,
		...rest
	} = transports;
	return rest;
}
