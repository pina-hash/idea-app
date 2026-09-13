import type { SupabaseClient } from '@supabase/supabase-js';
import type { IdeacadHistoryTransports } from './history';
import {
	createIdeacadAssemblyTransports,
	type IdeacadAssemblyTransports
} from './assembly';
import { createIdeacadLive, type IdeacadLive } from './live';
/* THE TWO ENGINE PREDICATES, IMPORTED RATHER THAN RESTATED. `mount.ts` value-imports nothing from this directory (its `store` and `history` imports are type-only), so this does not close a cycle. */
import { isIdeaCad } from './mount';
import { isHtmlAssignment } from '$lib/classroom/html-assignment/mount';
import { DEFAULT_BLADE_CONFIG } from './blade/materials';
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

/**
 * The complete RPC boundary consumed by the IdeaCAD state layer.
 *
 * IT DOES NOT EXTEND `IdeacadAttachControl` (0223), DELIBERATELY, AND THAT WAS
 * MEASURED RATHER THAN CHOSEN. Extending it makes `bladeConfig` a REQUIRED
 * member here, which reddens every hand-built stub of this interface --
 * `tests/ideacad-store.test.ts` and `tests/dom/ideacad-mount.test.ts` both
 * failed that way. What the attach prop needs is a property of the CLIENT
 * object rather than of the boundary, so `createIdeacadTransports` returns the
 * intersection and the interface is untouched.
 */
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

	// -----------------------------------------------------------------------
	// ASSEMBLY AND CHECKOUT (0207). An IDEA-Blade is several parts and one
	// person holds a part at a time; the owner reassigns live.
	//
	// IT IS ONE OPTIONAL FIELD RATHER THAN NINE, and that is the deliberate
	// difference from the sharing region above. `assembly.ts` already declares
	// `IdeacadAssemblyTransports` as a closed boundary with its own factory,
	// written self-contained because that lane could not touch this file; a
	// nine-field spread here would be a SECOND spelling of the same nine RPC
	// names. The whole object is present or absent, which is all any surface
	// needs: `0207` is applied as one migration, so there is no deployment that
	// has `ideacad_claim_part` and not `ideacad_release_part`.
	//
	// ABSENCE IS STILL THE MECHANISM. Undefined removes the parts panel
	// entirely, exactly as an omitted `shareDocument` removes the share form.
	// -----------------------------------------------------------------------
	assembly?: IdeacadAssemblyTransports;

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
): IdeacadTransports & IdeacadAttachControl {
	const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
		const { data, error } = await supabase.rpc(name, args);
		if (error) throw new Error(error.message);
		return data as T;
	};

	return {
		live: createIdeacadLive(supabase),
		/* THE CONFIG A NEW EDITOR ROW IS WRITTEN WITH, and the only one there
		   is. `/admin/ideacad-materials` manages the material LIBRARY, which
		   `bladeConfigWithMaterials` resolves over a config at RENDER time and
		   which is global rather than per item -- so nothing anywhere supplies a
		   per-item config, and a caller that invented one would be inventing the
		   part every student in the class opens on. It sits on this object
		   because this is the module that owns the `setEditor` call it is an
		   argument to, and because a surface holding the boundary must not have
		   to reach for a second import to use it correctly. */
		bladeConfig: DEFAULT_BLADE_CONFIG,
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

		// The assembly boundary, BUILT BY ITS OWN FACTORY rather than restated
		// here. `assembly.ts` is the one place the nine `0207` RPC names are
		// written down, and a second copy in this file is exactly the drift the
		// "do not duplicate a rule" convention exists to prevent.
		assembly: createIdeacadAssemblyTransports(supabase),

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

/**
 * The same question for `0207`, asked the same way and answered on the same
 * code.
 *
 * `ideacad_assembly` IS THE PROBE BECAUSE IT IS THE READ THE PANEL WANTS
 * ANYWAY. The sharing probe spends a round trip purely to find out; this one
 * does not have to, so the caller passes the document it is about to show and
 * gets the payload back when the answer is yes. A pre-`0207` deployment answers
 * `PGRST202` and the parts panel is removed rather than mounted over a function
 * that is not there.
 *
 * IT DEGRADES ON `PGRST202` ALONE, for the reason the sharing probe states: any
 * other error is a real failure inside a function that DOES exist -- a caller
 * who may not read the assembly raises `You cannot open this assembly.` -- and
 * treating that as "not deployed" would turn a refusal into a silently missing
 * feature.
 */
export async function probeIdeacadAssembly(
	supabase: SupabaseClient,
	documentId: string
): Promise<{ available: boolean; code: string | null; payload: unknown }> {
	const { data, error } = await supabase.rpc('ideacad_assembly', { p_document_id: documentId });
	if (!error) return { available: true, code: null, payload: data };
	const code = (error as { code?: string }).code ?? null;
	return { available: code !== 'PGRST202', code, payload: null };
}

/**
 * Strip the assembly boundary off, so a pre-`0207` deployment mounts a surface
 * with NO parts panel rather than one whose every control throws when pressed.
 * ABSENCE IS THE MECHANISM; this is the one place it is applied, exactly as
 * `withoutIdeacadSharing` is for `0205`.
 */
export function withoutIdeacadAssembly(transports: IdeacadTransports): IdeacadTransports {
	const { assembly: _assembly, ...rest } = transports;
	return rest;
}


/**
 * ==========================================================================
 * 0209's HISTORY BOUNDARY (0196)
 * ==========================================================================
 *
 * WHY IT IS A SEPARATE FACTORY RATHER THAN TWO MORE KEYS ON `IdeacadTransports`.
 * `createIdeacadStore` takes the pair on the SIDE (`options.history`) precisely
 * so a deployment sitting between 0208 and 0209 gets a store with no log, no
 * undo, no redo and no timeline -- absence being the mechanism, exactly as it
 * is for 0205's sharing and 0207's assembly. Folding them into the main
 * boundary would make that absence unrepresentable.
 *
 * THE SHAPES ARE THE RPCs' OWN AND ARE NOT RESHAPED HERE. `0209` already
 * projects `undoes_seq` as `undoesSeq` and `before_value`/`after_value` as
 * `before`/`after`, which is what lets `IdeacadHistoryRow` be the same type on
 * both sides of the wire; a rename in this file would be a second vocabulary
 * for one row.
 *
 * THERE IS NO PROBE FUNCTION BESIDE THIS ONE, AND THAT IS DELIBERATE. Sharing
 * and assembly each spend a round trip to ask whether their migration is there;
 * the history does not have to, because `store.open` reads the log as its FIRST
 * act on every document and a `PGRST202` from that read is the narrowest
 * possible probe -- it is a call the feature makes anyway. The store's own
 * history region degrades on that code ALONE and turns `historyReady` off, so
 * a runtime failure inside a function that DOES exist stays a failure rather
 * than silently removing the feature.
 */
export function createIdeacadHistoryTransports(
	supabase: SupabaseClient
): IdeacadHistoryTransports<IdeacadConceptRow> {
	const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
		const { data, error } = await supabase.rpc(name, args);
		if (error) {
			// THE CODE IS CARRIED ON THE THROWN ERROR, because the store's ladder
			// keys on `PGRST202` ALONE and a bare `new Error(message)` would have
			// thrown that discriminator away. Any other code stays a real failure.
			const wrapped = new Error(error.message) as Error & { code?: string };
			wrapped.code = (error as { code?: string }).code;
			throw wrapped;
		}
		return data as T;
	};
	return {
		applyActions: (conceptId, actions, features, revision) =>
			rpc('ideacad_apply_actions', {
				p_concept_id: conceptId,
				p_actions: actions,
				p_features: features,
				p_revision: revision
			}),
		conceptHistory: (conceptId, afterSeq, limit) =>
			rpc('ideacad_concept_history', {
				p_concept_id: conceptId,
				p_after_seq: afterSeq,
				p_limit: limit
			})
	};
}

/* ===========================================================================
 * ATTACHING THE EDITOR TO AN ASSIGNMENT -- 0223
 *
 * `setEditor` above has existed since 0201 and, until this bundle, NO SURFACE
 * OUTSIDE `src/routes/dev/` CALLED IT. The RPC was applied, the editor was
 * built, and there was no control anywhere by which a teacher could put the two
 * together -- so no classroom item in production carried
 * `assignment_schema_version` 4 and every student-side path below was dead
 * code. Everything in this section exists to make that one call reachable, and
 * it is all PURE: the control itself is markup in `ItemDetail`'s instructor
 * arm, and what lives here is the vocabulary and the two predicates, so both
 * can be asserted with no browser and no database.
 * ======================================================================== */

/**
 * WHAT THE ITEM SAYS ABOUT ITS OWN WORK SURFACE, decided from the SAME two
 * predicates every other surface uses (`isIdeaCad` for 4, `isHtmlAssignment`
 * for 3) rather than from a third reading of the column. A second spelling of
 * "which engine is this" is `htmlAssignmentMount`'s own named failure, one
 * table over.
 *
 * `off` IS ALSO THE ANSWER FOR A READ THAT COULD NOT TELL, which is
 * deliberate and is `htmlAssignmentMount`'s rule: null and 1 are the v1 spec
 * engine, a payload that never selected the column is indistinguishable from
 * one, and `ideacad_set_editor`'s upsert is idempotent -- so the cost of being
 * wrong this way is a teacher pressing a control that writes what is already
 * there. The other way round would hide the control on every ordinary
 * assignment.
 */
export type IdeacadAttachState = 'on' | 'off' | 'other-surface';

/**
 * WHY THE CONTROL IS NOT OFFERED ON A SCHEMA-3 ITEM, said in words.
 *
 * `ideacad_set_editor` raises 'This assignment already uses another work
 * surface. Remove it first.' for one, so a control here could only ever
 * produce a refusal -- and a control whose only possible answer is a refusal
 * must not be offered. What replaces it is this sentence, because a row that
 * is simply missing its button reads as a defect.
 *
 * IT IS NOT A COPY OF THE DATABASE'S REFUSAL AND MUST NOT BECOME ONE. That
 * sentence answers "your call was rejected"; this one answers "there is no
 * button here", which is a different question asked at a different moment. The
 * refusal itself is still rendered verbatim if the RPC ever raises it, which it
 * can: another manager can import a document between this page loading and the
 * press.
 */
export const IDEACAD_ATTACH_OTHER_SURFACE =
	'This assignment already has a ported worksheet on it. Remove that first, and the Blade editor can go on instead.';

/**
 * THE LOCAL REFUSAL, RAISED BEFORE THE CALL RATHER THAN AFTER IT.
 *
 * `ideacad_open_document` builds a student's FIRST CONCEPT out of
 * `config->'defaultFeatures'`, so an editor row written with a config that
 * cannot produce a valid tree is an assignment that accepts a student and then
 * refuses to open for them -- a failure that surfaces to the wrong person, in
 * class, days later. `bladeConfigShaped` is asked on this side first, and
 * nothing is written when it says no.
 *
 * IT NAMES NO TABLE AND NO MIGRATION, because a teacher reads it, and it says
 * NOTHING CHANGED, because that is the fact that decides what they do next.
 */
export const IDEACAD_ATTACH_BAD_CONFIG =
	'The Blade editor could not be turned on: this site could not build a starting part for students to open. Nothing changed. Tell Mr. Pina before you post this assignment.';

/**
 * WHAT TURNING IT OFF ACTUALLY DOES, WHICH IS THE SENTENCE THE CONFIRMATION
 * EXISTS FOR.
 *
 * MEASURED AGAINST `0201`, NOT ASSUMED: `ideacad_set_editor` with a null editor
 * runs `delete from public.ideacad_editors` and sets
 * `assignment_schema_version` back to null. `ideacad_documents`,
 * `ideacad_concepts` and `ideacad_predictions` all cascade off
 * `classroom_items`, NEVER off `ideacad_editors`, and there is no trigger on
 * that table but `touch_updated_at` and no `delete from
 * public.ideacad_documents` anywhere in the migration chain. So NOTHING A
 * STUDENT DREW IS DELETED.
 *
 * WHAT IT DOES COST IS REACH: `ideacad_open_document` raises 'This assignment
 * does not have the Blade editor.' once the row is gone, so every student's
 * work is stranded for as long as it is off. Turning it back on restores it --
 * the document upsert is `on conflict do nothing` and a document that already
 * has an `active_concept_id` mints no second concept, so their own concepts
 * come back exactly as they left them.
 *
 * A CONFIRMATION THAT SAID "this cannot be undone" WOULD BE A LIE, and one that
 * said nothing would let a teacher take a class's work off the screen mid-period
 * without knowing it. This says the true thing, which is both halves.
 */
export const IDEACAD_ATTACH_OFF_WARNING =
	'Students lose access to their blades while it is off. Nothing they have drawn is deleted, and turning it back on brings every concept back exactly as it was.';

/** What the teacher types to confirm the removal. Uppercase, short, and not a
    word a stray keystroke produces. */
export const IDEACAD_ATTACH_OFF_CONFIRM = 'TURN OFF';

/** The instructions above the typed box, naming the word without making the
    reader hunt for it in the warning. */
export const IDEACAD_ATTACH_OFF_PROMPT = `Type ${IDEACAD_ATTACH_OFF_CONFIRM} to confirm.`;

/**
 * WHAT A CALLER MUST HAND DOWN TO GET THE CONTROL. Null removes it entirely,
 * which is the gate rather than a flag: a caller that cannot build this -- a
 * student, a page whose viewer manages no section -- has no write to execute,
 * so read-only is structural.
 *
 * `IdeacadTransports` SATISFIES IT STRUCTURALLY, which is what lets the item
 * page hand its existing boundary straight down as ONE added prop rather than
 * constructing a second object out of pieces. The narrowing is the type's: an
 * instructor arm typed to this sees two members and not twenty.
 *
 * `bladeConfig` IS A VALUE AND NOT A FACTORY on purpose. The instructor arm
 * VALIDATES whatever arrives and never chooses it -- so a deployment that ever
 * does grow a per-item config changes this one property and no control.
 */
export interface IdeacadAttachControl {
	/** The config `ideacad_editors.config` is written with. */
	readonly bladeConfig: unknown;
	/** `ideacad_set_editor`. A null editor removes the row. */
	setEditor(itemId: string, editor: string | null, config: unknown): Promise<unknown>;
}

/**
 * THE DATABASE'S OWN SENTENCE, KEPT VERBATIM.
 *
 * Every refusal `ideacad_set_editor` raises is already addressed to a teacher
 * and already says what to do -- 'This assignment already uses another work
 * surface. Remove it first.' is better copy than anything a client could
 * substitute, and re-toning it here is how the schema-3 case becomes 'Could not
 * turn the editor on.' The fallback is for the case with no message at all (a
 * network failure, an abort), which is the only case where there is nothing to
 * render.
 */
export function ideacadAttachRefusal(error: unknown): string {
	const message = error instanceof Error ? error.message.trim() : '';
	return (
		message ||
		'The Blade editor could not be changed. Nothing was saved. Check your connection and try again.'
	);
}

/**
 * WHICH OF THE THREE STATES THIS ITEM IS IN. Total over any payload, throws for
 * nothing, and asks the two existing predicates rather than reading the column
 * a third time.
 */
export function ideacadAttachState(item: unknown): IdeacadAttachState {
	if (isIdeaCad(item)) return 'on';
	if (isHtmlAssignment(item)) return 'other-surface';
	return 'off';
}
