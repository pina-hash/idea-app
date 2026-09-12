import type {
	IdeacadConceptRow,
	IdeacadDocumentRow,
	IdeacadPredictionRow,
	IdeacadTransports
} from './transports';
import {
	diffTrees,
	foldHistory,
	inverseOf,
	readWholeHistory,
	stateAt,
	unwindTo,
	type IdeacadAction,
	type IdeacadHistoryRow,
	type IdeacadHistoryTransports
} from './history';

/**
 * Edits pause for 750 ms before writing. That is long enough to collapse a
 * short drag/typing burst without leaving more than one second of work only in
 * memory; an edit made during a write bypasses the delay when that write ends.
 */
export const IDEACAD_AUTOSAVE_DEBOUNCE_MS = 750;

/** The observable lifecycle of the document and its autosave machine. */
export type IdeacadSavePhase = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

/** Public, immutable snapshot read by an IdeaCAD surface. */
export interface IdeacadStoreState {
	readonly itemId: string | null;
	readonly document: IdeacadDocumentRow | null;
	readonly concepts: readonly IdeacadConceptRow[];
	readonly activeConceptId: string | null;
	readonly prediction: IdeacadPredictionRow | null;
	readonly config: unknown;
	readonly phase: IdeacadSavePhase;
	readonly error: string | null;
	readonly conflictedServerConcept: IdeacadConceptRow | null;

	// --- THE HISTORY REGION (0209). See the block comment below. ---

	/**
	 * Whether this deployment has 0209. FALSE is a real, supported state and
	 * not a failure: the migration is applied by hand, so a tree sitting
	 * between 0208 and 0209 has no action log, and every control below is
	 * absent rather than disabled.
	 */
	readonly historyReady: boolean;
	/** The active concept's whole log, newest last. Empty when history is off. */
	readonly history: readonly IdeacadHistoryRow[];
	readonly canUndo: boolean;
	readonly canRedo: boolean;
}

/** Construction options; tests may shorten the debounce without changing production policy. */
export interface CreateIdeacadStoreOptions {
	readonly debounceMs?: number;
	/**
	 * 0209's two RPCs. OMITTING THEM REMOVES THE WHOLE FEATURE -- no log is
	 * read, no action is recorded, `undo` and `redo` refuse, and every write
	 * goes through `ideacad_save_concept` exactly as it did before this
	 * bundle. Absence is the mechanism, the way an omitted
	 * `uploadSubmissionFile` removes the file picker.
	 */
	readonly history?: IdeacadHistoryTransports<IdeacadConceptRow>;
}

/**
 * The sole state-and-write contract for the IdeaCAD UI. Every mutating method
 * resolves only after its RPC has landed. `edit` is the exception by design:
 * it updates memory synchronously and enters the durable autosave machine.
 */
export interface IdeacadStore {
	/** Read the current snapshot immediately. */
	readonly state: IdeacadStoreState;
	/** Svelte-compatible subscription; the subscriber is called immediately. */
	subscribe(run: (state: IdeacadStoreState) => void): () => void;
	/** Open or create this student's document and replace the complete snapshot. */
	open(itemId: string): Promise<void>;
	/** Replace the active concept's features in memory and schedule autosave. */
	edit(features: unknown): void;
	/** Create and activate a concept. */
	create(name: string, features: unknown): Promise<IdeacadConceptRow>;
	/** Write the newest active edit now; resolves after all coalesced edits settle. */
	save(): Promise<void>;
	/** Rename a concept without changing its position. */
	rename(conceptId: string, name: string): Promise<void>;
	/** Change a concept's ordering position without changing its name. */
	reposition(conceptId: string, position: number): Promise<void>;
	/** Soft-delete a concept and adopt the server-selected active concept. */
	delete(conceptId: string): Promise<void>;
	/** Persist and select one live concept. */
	setActive(conceptId: string): Promise<void>;
	/** Persist the student's prediction and rationale. */
	setPrediction(conceptId: string, rationale: string): Promise<void>;
	/** Persist a concept-card commit timestamp. */
	commit(conceptId: string): Promise<void>;
	/** Flush outstanding work, stop timers, and release the realtime transport. */
	destroy(): Promise<void>;

	// --- THE HISTORY REGION (0209). ---

	/** Undo the newest live action, durably. Refuses when there is nothing to undo. */
	undo(): Promise<void>;
	/** Re-apply the newest undone action, durably. */
	redo(): Promise<void>;
	/**
	 * The active concept's tree AS IT WAS at `seq`, computed rather than
	 * fetched. A READ, and deliberately not a write: scrubbing shows a student
	 * a past state, and committing to one is `undo` pressed until it is
	 * reached, which is what keeps the log append-only.
	 */
	stateAtSeq(seq: number): unknown;
	/** Re-read the active concept's log from the server. */
	refreshHistory(): Promise<void>;
}

/** Create one document store. A mounted editor should keep this instance for its lifetime. */
export function createIdeacadStore(
	transports: IdeacadTransports,
	options: CreateIdeacadStoreOptions = {}
): IdeacadStore {
	const debounceMs = options.debounceMs ?? IDEACAD_AUTOSAVE_DEBOUNCE_MS;
	let current: IdeacadStoreState = {
		itemId: null,
		document: null,
		concepts: [],
		activeConceptId: null,
		prediction: null,
		config: null,
		phase: 'idle',
		error: null,
		conflictedServerConcept: null,
		historyReady: Boolean(options.history),
		history: [],
		canUndo: false,
		canRedo: false
	};
	const subscribers = new Set<(state: IdeacadStoreState) => void>();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let inFlight: Promise<void> | null = null;
	let dirtyRevision: number | null = null;
	let stopped = false;

	/* =====================================================================
	 * THE HISTORY REGION (0209)
	 *
	 * WHAT IT ADDS: every accepted edit is DIFFED against the last accepted
	 * one and the resulting actions ride along with the write, so the tree and
	 * the log that explains it land in one statement. Undo and redo then walk
	 * the LOG rather than a memory stack, which is the whole point -- close the
	 * tab and `ui/undo.ts`'s fifty are gone, where these survive.
	 *
	 * WHY THE DIFF IS HERE AND NOT AT EVERY CALL SITE. `edit(features)` has
	 * always taken a whole tree, because that is what `feature-model.ts`'s four
	 * verbs produce. Asking every control in the editor to hand over an action
	 * instead would be a rewrite of the UI to record something the store can
	 * work out for itself -- and it is why this bundle changes no `.svelte`
	 * file at all.
	 *
	 * THE RESOLUTION IS THE ACCEPTED EDIT. `ui/undo.ts` already made that case
	 * and it has not changed: a student drags a slider through forty values
	 * before pressing the green check, and a history fed by the preview needs
	 * forty presses of Ctrl+Z to undo one decision. SolidWorks records the
	 * feature edit, not the mouse.
	 *
	 * ABSENCE IS THE MECHANISM. `options.history` undefined is a deployment
	 * between 0208 and 0209: nothing is diffed, nothing is read, `undo` and
	 * `redo` refuse with a sentence, and every write goes through
	 * `ideacad_save_concept` exactly as it did before.
	 * ================================================================== */

	const historyTransports = options.history ?? null;
	/** Actions accumulated since the last write, in the order they happened. */
	let pending: (IdeacadAction & { undoesSeq?: number })[] = [];
	/** The last tree the log accounts for. Every diff is taken against this. */
	let logged: unknown = null;
	let historyRows: IdeacadHistoryRow[] = [];

	const publishFold = () => {
		const fold = foldHistory(historyRows);
		publish({
			history: historyRows,
			canUndo: fold.canUndo,
			canRedo: fold.canRedo
		});
	};

	/**
	 * Re-read the whole log for the active concept.
	 *
	 * IT IS NOT CALLED ON EVERY SAVE, and the reason is that it does not have
	 * to be: `ideacad_apply_actions` returns the exact seq range it allocated,
	 * so the rows this client just wrote can be added locally with no round
	 * trip. What DOES force a re-read is that range not starting where the
	 * local log ends -- which is precisely the case where somebody else has
	 * appended in between, and the one where a stale local fold would aim undo
	 * at the wrong row.
	 */
	const loadHistory = async (conceptId: string | null) => {
		if (!historyTransports || !conceptId) {
			historyRows = [];
			publishFold();
			return;
		}
		historyRows = await readWholeHistory(historyTransports, conceptId);
		publishFold();
	};

	/** Adopt the active concept as the point every later diff is taken from. */
	const rebaseLog = (features: unknown) => {
		pending = [];
		logged = features;
	};

	const publish = (patch: Partial<IdeacadStoreState>) => {
		current = { ...current, ...patch };
		for (const subscriber of subscribers) subscriber(current);
	};
	const concept = (id: string) => current.concepts.find((entry) => entry.id === id);
	const replaceConcept = (row: IdeacadConceptRow) =>
		current.concepts.map((entry) => (entry.id === row.id ? row : entry));
	const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
	const clearTimer = () => {
		if (timer) clearTimeout(timer);
		timer = null;
	};

	const write = async (): Promise<void> => {
		clearTimer();
		if (inFlight) return inFlight;
		if (dirtyRevision === null || current.phase === 'conflict') return;
		const activeId = current.activeConceptId;
		const active = activeId ? concept(activeId) : undefined;
		if (!active) return;
		const sentRevision = dirtyRevision;
		const sentFeatures = active.features;
		// Captured BEFORE the await, so edits made during the write queue up
		// behind this batch instead of being sent twice or dropped.
		const sentActions = pending;
		if (historyTransports) pending = [];
		publish({ phase: 'saving', error: null });
		inFlight = (async () => {
			try {
				const result = historyTransports
					? await historyTransports.applyActions(
							active.id,
							sentActions,
							sentFeatures,
							sentRevision
						)
					: await transports.saveConcept(active.id, sentFeatures, sentRevision);
				if (!result.ok) {
					// THE ACTIONS GO BACK ON THE QUEUE. A stale revision wrote
					// nothing at all -- the RPC returns before it appends -- so
					// dropping them here would leave the tree ahead of the log
					// with nothing to say so.
					if (historyTransports) pending = [...sentActions, ...pending];
					// THE LOCAL ROW IS INTENTIONALLY UNTOUCHED. The server row is
					// exposed beside it for an explicit future resolution surface.
					publish({
						phase: 'conflict',
						error: 'This concept changed elsewhere. Your unsaved work is still here.',
						conflictedServerConcept: result.concept
					});
					return;
				}
				if (historyTransports && 'firstSeq' in result && result.firstSeq !== null) {
					const newest = historyRows.length ? historyRows[historyRows.length - 1].seq : -1;
					if (result.firstSeq === newest + 1) {
						// Ours are the only rows since we last looked, so the
						// seqs the server allocated are exactly these actions
						// in order and no read is needed.
						historyRows = [
							...historyRows,
							...sentActions.map((action, index) => ({
								...action,
								seq: (result.firstSeq as number) + index
							}))
						];
						publishFold();
					} else {
						// Somebody else appended in between. A local fold over a
						// log with a hole in it would aim undo at the wrong row.
						await loadHistory(active.id);
					}
				}
				if (dirtyRevision === sentRevision) {
					dirtyRevision = null;
					publish({
						concepts: replaceConcept(result.concept),
						phase: 'saved',
						error: null,
						conflictedServerConcept: null
					});
				} else {
					// A newer local row already exists. Do not replace it with the ack.
					publish({ phase: 'idle' });
				}
			} catch (error) {
				publish({ phase: 'error', error: message(error) });
			}
		})().finally(() => {
			inFlight = null;
		});
		await inFlight;
		if (dirtyRevision !== null && !(['error', 'conflict'] as IdeacadSavePhase[]).includes(current.phase)) {
			await write();
		}
	};

	const schedule = () => {
		clearTimer();
		timer = setTimeout(() => void write(), debounceMs);
	};
	/**
	 * One press of undo or redo.
	 *
	 * THERE IS ONE FUNCTION FOR BOTH BECAUSE THEY ARE ONE OPERATION. Redoing is
	 * undoing an undo -- the inverse of the inverse -- so the two differ only in
	 * which target the fold hands back, and writing them separately would be two
	 * spellings of one rule.
	 *
	 * IT RE-READS THE LOG FIRST, and that round trip is bought deliberately.
	 * Undo is an explicit press rather than an autosave, and on a document 0205
	 * shared with a second editor the newest rows may be theirs -- inverting the
	 * wrong row would rewrite somebody else's work under their cursor. The
	 * unique index on (concept_id, undoes_seq) refuses the double-undo behind
	 * this, so the read narrows a race it does not have to close.
	 *
	 * THE INVERSE IS APPENDED, NEVER SUBTRACTED. See 0209's header: nothing in
	 * this feature deletes a row, which is what "all the way back to the
	 * creation of the part" costs and is the point of it.
	 */
	const step = async (which: 'undo' | 'redo'): Promise<void> => {
		if (!historyTransports) throw new Error('This deployment has no IdeaCAD history.');
		const activeId = current.activeConceptId;
		const active = activeId ? concept(activeId) : undefined;
		if (!active) throw new Error('Open an IdeaCAD document before undoing.');
		// Anything typed but unsent goes first: an undo that stepped over
		// unsaved work would silently discard it.
		await write();
		await loadHistory(activeId);

		const fold = foldHistory(historyRows);
		const target = which === 'undo' ? fold.undoTarget : fold.redoTarget;
		if (!target) {
			publish({ error: `There is nothing to ${which}.` });
			return;
		}
		const action = inverseOf(target);
		const currentTree = concept(activeId!)?.features ?? null;
		const next =
			which === 'undo'
				? unwindTo(currentTree, historyRows, target.seq - 1)
				: stateAt([
						...historyRows,
						{ ...action, seq: (historyRows[historyRows.length - 1]?.seq ?? 0) + 1 }
					]);
		const revision = Math.max(active.revision, dirtyRevision ?? 0) + 1;
		publish({ phase: 'saving', error: null });
		try {
			const result = await historyTransports.applyActions(activeId!, [action], next, revision);
			if (!result.ok) {
				publish({
					phase: 'conflict',
					error: 'This concept changed elsewhere. Your unsaved work is still here.',
					conflictedServerConcept: result.concept
				});
				return;
			}
			dirtyRevision = null;
			rebaseLog(result.concept.features);
			publish({
				concepts: replaceConcept(result.concept),
				phase: 'saved',
				error: null,
				conflictedServerConcept: null
			});
			await loadHistory(activeId);
		} catch (error) {
			publish({ phase: 'error', error: message(error) });
		}
	};

	const updateMeta = async (conceptId: string, name: string, position: number) => {
		const row = await transports.updateConceptMeta(conceptId, name, position);
		publish({ concepts: replaceConcept(row), error: null });
	};

	return {
		get state() {
			return current;
		},
		subscribe(run) {
			run(current);
			subscribers.add(run);
			return () => subscribers.delete(run);
		},
		async open(itemId) {
			await write();
			const opened = await transports.openDocument(itemId);
			dirtyRevision = null;
			publish({
				itemId,
				document: opened.document,
				concepts: opened.concepts,
				activeConceptId: opened.document.active_concept_id,
				prediction: opened.prediction,
				config: opened.config,
				phase: 'saved',
				error: null,
				conflictedServerConcept: null
			});
			const active = opened.document.active_concept_id;
			rebaseLog(opened.concepts.find((row) => row.id === active)?.features ?? null);
			await loadHistory(active);
		},
		edit(features) {
			if (stopped) throw new Error('This IdeaCAD store has been destroyed.');
			const activeId = current.activeConceptId;
			const active = activeId ? concept(activeId) : undefined;
			if (!active) throw new Error('Open an IdeaCAD document before editing.');
			const revision = Math.max(active.revision, dirtyRevision ?? 0) + 1;
			dirtyRevision = revision;
			if (historyTransports) {
				// The diff is taken against the last tree the LOG accounts for,
				// never against the concept row: several edits can queue behind
				// one write, and diffing against the row would re-record every
				// change since the last acknowledgement on each of them.
				pending = [...pending, ...diffTrees(logged, features)];
				logged = features;
			}
			publish({
				concepts: replaceConcept({ ...active, features, revision }),
				phase: 'idle',
				error: null,
				conflictedServerConcept: null
			});
			schedule();
		},
		async create(name, features) {
			if (!current.document) throw new Error('Open an IdeaCAD document before creating a concept.');
			await write();
			const row = await transports.newConcept(current.document.id, name, features);
			publish({
				concepts: [...current.concepts, row],
				activeConceptId: row.id,
				document: { ...current.document, active_concept_id: row.id },
				error: null
			});
			// A NEW CONCEPT STARTS A NEW LOG, exactly as `ui/undo.ts`'s `clear`
			// does: an undo that reached back into a different concept would
			// rewrite a document the student is not looking at.
			rebaseLog(row.features);
			await loadHistory(row.id);
			return row;
		},
		async save() {
			clearTimer();
			await write();
			if (inFlight) await inFlight;
		},
		async rename(conceptId, name) {
			const row = concept(conceptId);
			if (!row) throw new Error('Unknown IdeaCAD concept.');
			await updateMeta(conceptId, name, row.position);
		},
		async reposition(conceptId, position) {
			const row = concept(conceptId);
			if (!row) throw new Error('Unknown IdeaCAD concept.');
			await updateMeta(conceptId, row.name, position);
		},
		async delete(conceptId) {
			if (conceptId === current.activeConceptId) await write();
			const result = await transports.deleteConcept(conceptId);
			const document = current.document
				? { ...current.document, active_concept_id: result.activeConceptId }
				: null;
			publish({
				concepts: current.concepts.filter((row) => row.id !== conceptId),
				activeConceptId: result.activeConceptId,
				document,
				error: null
			});
			if (conceptId === current.activeConceptId || historyRows.length) {
				// The DELETED concept's rows are NOT removed anywhere -- 0209
				// keeps them and `ideacad_delete_concept` only stamps
				// `deleted_at`. What changes is only which log is on screen.
				rebaseLog(concept(result.activeConceptId)?.features ?? null);
				await loadHistory(result.activeConceptId);
			}
		},
		async setActive(conceptId) {
			if (!current.document || !concept(conceptId)) throw new Error('Unknown IdeaCAD concept.');
			await write();
			await transports.setActive(current.document.id, conceptId);
			publish({
				activeConceptId: conceptId,
				document: { ...current.document, active_concept_id: conceptId },
				error: null
			});
			rebaseLog(concept(conceptId)?.features ?? null);
			await loadHistory(conceptId);
		},
		async setPrediction(conceptId, rationale) {
			if (!current.document) throw new Error('Open an IdeaCAD document before predicting.');
			const prediction = await transports.setPrediction(current.document.id, conceptId, rationale);
			publish({ prediction, error: null });
		},
		async commit(conceptId) {
			if (conceptId === current.activeConceptId) await write();
			const row = await transports.commitConcept(conceptId);
			publish({ concepts: replaceConcept(row), error: null });
		},
		async destroy() {
			clearTimer();
			await write();
			stopped = true;
			transports.live.destroy();
			subscribers.clear();
		},

		// --- THE HISTORY REGION (0209). ---

		async undo() {
			await step('undo');
		},
		async redo() {
			await step('redo');
		},
		stateAtSeq(seq) {
			if (!historyTransports || historyRows.length === 0) return null;
			return stateAt(historyRows, seq);
		},
		async refreshHistory() {
			await loadHistory(current.activeConceptId);
		}
	};
}
