import type {
	IdeacadConceptRow,
	IdeacadDocumentRow,
	IdeacadPredictionRow,
	IdeacadTransports
} from './transports';

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
}

/** Construction options; tests may shorten the debounce without changing production policy. */
export interface CreateIdeacadStoreOptions {
	readonly debounceMs?: number;
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
		conflictedServerConcept: null
	};
	const subscribers = new Set<(state: IdeacadStoreState) => void>();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let inFlight: Promise<void> | null = null;
	let dirtyRevision: number | null = null;
	let stopped = false;

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
		publish({ phase: 'saving', error: null });
		inFlight = (async () => {
			try {
				const result = await transports.saveConcept(active.id, sentFeatures, sentRevision);
				if (!result.ok) {
					// THE LOCAL ROW IS INTENTIONALLY UNTOUCHED. The server row is
					// exposed beside it for an explicit future resolution surface.
					publish({
						phase: 'conflict',
						error: 'This concept changed elsewhere. Your unsaved work is still here.',
						conflictedServerConcept: result.concept
					});
					return;
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
		},
		edit(features) {
			if (stopped) throw new Error('This IdeaCAD store has been destroyed.');
			const activeId = current.activeConceptId;
			const active = activeId ? concept(activeId) : undefined;
			if (!active) throw new Error('Open an IdeaCAD document before editing.');
			const revision = Math.max(active.revision, dirtyRevision ?? 0) + 1;
			dirtyRevision = revision;
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
		}
	};
}
