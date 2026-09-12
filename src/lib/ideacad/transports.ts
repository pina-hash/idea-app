import type { SupabaseClient } from '@supabase/supabase-js';
import { createIdeacadLive, type IdeacadLive } from './live';

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
		uploadSubmissionFile
	};
}
