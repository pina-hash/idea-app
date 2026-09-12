import { htmlAssignmentSchemaVersion } from '$lib/classroom/html-assignment/mount';
import type { IdeacadStoreState } from './store';
export const IDEACAD_SCHEMA_VERSION=4;
export function isIdeaCad(item:unknown):boolean{return htmlAssignmentSchemaVersion(item)===IDEACAD_SCHEMA_VERSION;}
export type IdeacadMount='ideacad'|'other'|'unavailable';
export function ideacadMount(item:unknown,data:unknown):IdeacadMount{return !isIdeaCad(item)?'other':data?'ideacad':'unavailable';}
export const IDEACAD_UNAVAILABLE='This blade editor could not be opened. Nothing you have done is lost. Tell your teacher.';

/**
 * THE EDITOR'S WRITE BOUNDARY, AND IT IS A PROJECTION OF `store.ts` RATHER THAN
 * A SECOND IMPLEMENTATION OF ANYTHING. Every method here is one `IdeacadStore`
 * method with its arguments narrowed to what the editor actually has; the
 * 750ms debounce, the serialized writes and the terminal `conflict` state all
 * stay in the store, which is ledger 0170's file and not this bundle's.
 *
 * `edit` IS THE ONLY SYNCHRONOUS ONE, deliberately: it updates memory and
 * enters the autosave machine, so a caller that awaited it would be awaiting a
 * debounce. Every other write resolves only after its RPC lands, which is what
 * lets the editor change its own list AFTER the server agreed rather than
 * before -- a concept added locally and refused by the database is a card a
 * student keeps working in and loses at the next reload.
 *
 * ABSENCE IS STILL THE MECHANISM. A surface that hands no writes down gets the
 * editor it has always had: a local working copy that persists nothing. The
 * dev harness is that surface and must stay that surface.
 */
export interface IdeacadEditorWrites {
	/** Replace the active concept's features in memory and schedule the autosave. */
	edit(features: unknown): void;
	/** Create and activate a concept; resolves with the row the database wrote. */
	create(name: string, features: unknown): Promise<{ id: string; name: string }>;
	/** Rename a concept without changing its position. */
	rename(conceptId: string, name: string): Promise<void>;
	/** Move a concept to a 1-based position, which is what `0201` stores. */
	reposition(conceptId: string, position: number): Promise<void>;
	/** Soft-delete a concept; resolves with the concept the database selected next. */
	remove(conceptId: string): Promise<{ activeConceptId: string }>;
	/** Persist which concept is being worked in. */
	activate(conceptId: string): Promise<void>;
	/** Record the student's prediction and rationale. It GATES NOTHING; see the
	 *  prediction block in `BladeEditor.svelte` for decision 26's answer. */
	setPrediction(conceptId: string, rationale: string): Promise<unknown>;
	/** Stamp a concept card as committed. */
	commit(conceptId: string): Promise<unknown>;
}

/**
 * THE ONE SENTENCE A REFUSED WRITE READS. It says the work is still on screen,
 * because it is -- the editor's local copy is never rolled back by a refusal --
 * and it names reloading as the thing that would cost it.
 */
export const IDEACAD_WRITE_REFUSED =
	'That change did not save. What is on screen is still here, but it will be lost if you reload. Try again.';

/** The words for each `IdeacadSavePhase`, which is the only place they are written. */
export function ideacadSaveLabel(phase: string | null | undefined): string {
	switch (phase) {
		case 'saving':
			return 'Saving';
		case 'saved':
			return 'Saved';
		case 'error':
			return 'Not saved';
		case 'conflict':
			return 'Changed elsewhere';
		default:
			return 'Unsaved';
	}
}

/**
 * THE STORE'S SNAPSHOT, IN THE EDITOR'S OWN VOCABULARY. This is the "one field
 * rename at the mount site" ledger 0171 reported, written down once: it is four
 * renames rather than one (`committed_at` to `committed`,
 * `predicted_concept_id` to `conceptId`, `made_at` to `at`, and the document's
 * `active_concept_id` out of the row and into its own seed), and every one of
 * them written inline at a mount is a rename that can be got wrong somewhere
 * else later.
 *
 * A NULL DOCUMENT ANSWERS NULL. The store publishes an empty snapshot before
 * `open` lands, and mounting an editor on it would put an empty concept list
 * and a default tree in front of a student for as long as the RPC takes -- and
 * then replace it, which reads as their work being lost and coming back.
 */
export interface IdeacadEditorSeed {
	concepts: { id: string; name: string; features: unknown; committed: boolean }[];
	activeConceptId: string | null;
	config: unknown;
	prediction: { conceptId: string; rationale: string; at: string | null } | null;
}
export function ideacadEditorSeed(state: IdeacadStoreState | null | undefined): IdeacadEditorSeed | null {
	if (!state?.document || state.concepts.length === 0) return null;
	return {
		concepts: state.concepts.map((row) => ({
			id: row.id,
			name: row.name,
			features: row.features,
			committed: !!row.committed_at
		})),
		activeConceptId: state.activeConceptId,
		config: state.config,
		prediction: state.prediction
			? {
					conceptId: state.prediction.predicted_concept_id,
					rationale: state.prediction.rationale,
					at: state.prediction.made_at ?? null
				}
			: null
	};
}
