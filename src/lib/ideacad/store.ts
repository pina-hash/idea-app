import type {
	IdeacadConceptRow,
	IdeacadDocumentRow,
	IdeacadPredictionRow,
	IdeacadTransports
} from './transports';
import {
	IDEACAD_VIEW_ONLY_REFUSAL,
	ideacadCanWrite,
	ideacadRoleFromPayload,
	type IdeacadDocumentRole
} from './sharing';
import { IDEACAD_SHARED_ACCESS_LOST } from './shared-open';
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

	// --- THE SHARED-OPEN REGION (0205). See the block comment below. ---

	/**
	 * What the signed-in caller is TO THIS DOCUMENT. `owner` after `open()`,
	 * which resolves the caller's own document and can be nothing else; whatever
	 * `ideacad_open_shared_document` answered after `openShared()`.
	 *
	 * NULL BEFORE ANYTHING IS OPENED, and null is the CLOSED answer: `canWrite`
	 * below is false for it. "Cannot tell" must never render as the permissive
	 * value.
	 */
	readonly role: IdeacadDocumentRole | null;
	/**
	 * Whether this store will attempt a write at all. Every mutating method
	 * refuses when it is false, so read-only is STRUCTURAL here rather than a
	 * flag a surface has to remember to check -- and a surface that handed every
	 * callback in over a viewer's payload still cannot write.
	 */
	readonly canWrite: boolean;
	/**
	 * Set when a write was refused and the database then confirmed the caller no
	 * longer has access. It rides `phase: 'conflict'`, which is terminal; this
	 * flag is what lets a surface say WHY with the right sentence.
	 */
	readonly accessLost: boolean;

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
	/**
	 * Open a document somebody ELSE shared with the caller, by document id, and
	 * replace the complete snapshot.
	 *
	 * IT IS NOT `open` WITH A DIFFERENT ARGUMENT, and the two must not be folded
	 * together. `open` takes an ITEM, resolves the caller's OWN document, and
	 * CREATES it and its first concept when they are absent; this takes a
	 * DOCUMENT ID, belongs to somebody else, and `ideacad_open_shared_document`
	 * never writes -- which is `0205`'s own header's reasoning and the reason a
	 * viewer cannot mint rows in a document they cannot write.
	 *
	 * IT REFUSES WHEN THE TRANSPORT IS ABSENT rather than pretending. A
	 * deployment between `0204` and `0205` has no such RPC, and a store that
	 * silently resolved would leave a surface showing an empty editor for a
	 * document it never read.
	 */
	openShared(documentId: string): Promise<void>;
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
		role: null,
		canWrite: false,
		accessLost: false,
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
	/**
	 * TURNED OFF BY A `PGRST202` FROM THE FIRST READ, AND BY NOTHING ELSE.
	 *
	 * 0209 is applied by hand, so a deployment sitting between 0208 and it is a
	 * real state -- and until this rung existed, the store on such a deployment
	 * would have rejected `open()` outright, because `loadHistory` is the first
	 * thing that runs after a document opens. A whole editor removed by a
	 * missing migration is the failure this repo's select ladders exist to
	 * prevent, and the ladder here is one rung: read the log, and if the
	 * FUNCTION IS NOT THERE, publish `historyReady: false` and carry on saving
	 * through `ideacad_save_concept` exactly as 0208 did.
	 *
	 * `PGRST202` ALONE, which is this repo's rule and matters here: a caller who
	 * may not read a part raises `That part is not one you can open.` from
	 * inside a function that DOES exist, and reading that as "not deployed"
	 * would turn a refusal into a silently missing feature.
	 *
	 * IT IS THE NARROWEST POSSIBLE PROBE because it is a call the feature makes
	 * anyway -- no round trip is spent asking, unlike 0205's sharing probe.
	 */
	let historyOff = false;
	const historyOn = () => historyTransports !== null && !historyOff;
	const notDeployed = (error: unknown): boolean =>
		!!error && typeof error === 'object' && (error as { code?: string }).code === 'PGRST202';
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
		if (!historyOn() || !conceptId) {
			historyRows = [];
			publishFold();
			return;
		}
		try {
			historyRows = await readWholeHistory(historyTransports!, conceptId);
		} catch (error) {
			if (!notDeployed(error)) throw error;
			// The rung. Everything below this line is 0208's behaviour.
			historyOff = true;
			historyRows = [];
			pending = [];
			publish({ historyReady: false });
		}
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

	/* =====================================================================
	 * THE SHARED-OPEN REGION (0205)
	 *
	 * WHAT IT ADDS: one more way in. `open(itemId)` resolves the caller's OWN
	 * document; `openShared(documentId)` resolves one a classmate granted them.
	 * Everything downstream of that one difference -- the debounce, the
	 * serialized writes, the terminal `conflict`, the history fold -- is shared,
	 * which is why this is a method on this store and not a second store. Two
	 * stores would be two autosave machines, two ideas of what `conflict` means,
	 * and two places to fix the next bug in either.
	 *
	 * A VIEWER'S STORE CANNOT WRITE, AND THAT IS STRUCTURAL RATHER THAN POLITE.
	 * `refuseWrite()` below gates every mutating method on `current.canWrite`, so
	 * a surface that handed every callback in over a viewer's payload -- which is
	 * exactly the state a page bug produces -- still cannot put a write on the
	 * wire. The UI hiding the control is the convenience; this is the floor
	 * beneath it, and `0205` re-asking `_ideacad_can_write_document` inside every
	 * RPC is the actual boundary beneath that.
	 *
	 * `canWrite` IS THE AND OF TWO ANSWERS, NOT THE PAYLOAD'S ALONE. The RPC
	 * sends `canWrite`, and `ideacadCanWrite(role)` is the pure mirror of the
	 * same rule; taking both means an unrecognised role fails CLOSED even if the
	 * payload said true. `ideacadRoleFromPayload` drops anything outside the
	 * union rather than coercing it, so a role this build does not know becomes
	 * null and null cannot write.
	 * ================================================================== */

	/**
	 * The refusal every mutating method opens with.
	 *
	 * ONE FUNCTION RATHER THAN NINE COPIES of the same `if`. Nine spellings of
	 * "may this store write" is the pair that stops agreeing, and the one that
	 * gets forgotten is whichever method is added next.
	 *
	 * IT THROWS RATHER THAN RETURNING QUIETLY. A surface that called a write on a
	 * read-only document has a bug, and a silent no-op is how that bug reaches a
	 * student as typing that never saves -- the one failure the whole IdeaCAD
	 * lane is written to avoid. The sentence is `0205`'s own, verbatim, so the
	 * client and the database say the same thing.
	 */
	const refuseWrite = () => {
		// NOTHING OPEN IS NOT THIS GUARD'S REFUSAL TO MAKE. Each method already
		// has its own sentence for that ('Open an IdeaCAD document before
		// creating a concept.' and so on), and they are more specific than
		// anything this function could say. Answering here would replace every
		// one of them with a single worse message and change refusals that have
		// nothing to do with sharing.
		if (current.document === null || current.canWrite) return;
		// TWO CAUSES, TWO SENTENCES. A document that was always read-only reads
		// `0205`'s own view-only refusal; one whose grant was taken away mid
		// -session reads the access-lost sentence, because telling that student
		// they have "view-only access" describes a state they were never in and
		// says nothing about the work still on their screen.
		throw new Error(current.accessLost ? IDEACAD_SHARED_ACCESS_LOST : IDEACAD_VIEW_ONLY_REFUSAL);
	};

	/**
	 * Did this caller just lose access, or was that an ordinary failure?
	 *
	 * THE CLIENT DOES NOT PARSE THE REFUSAL SENTENCE, and that is the decision
	 * here. `0205` raises 'You can only save your own concept.' for a revoked
	 * grantee -- the role is null by then, so it does not take the viewer arm --
	 * which is indistinguishable BY TEXT from several other refusals, and
	 * CLAUDE.md forbids re-toning or classifying a refusal string anyway. So the
	 * only thing that can answer "do I still have access" is the database.
	 *
	 * IT ASKS `sharedWithMe` AND NOT `openSharedDocument`, AND THE REASON IS THE
	 * WHOLE POINT. Both can answer, but only one of them answers SAFELY:
	 * `ideacad_open_shared_document` RAISES for a caller whose role has become
	 * null, so a revoked grant and an unreachable network arrive as the same
	 * thrown error and cannot be told apart -- and guessing either way is wrong
	 * in one direction (a network blip reported as a permanent loss, or a real
	 * loss reported as retryable forever). `ideacad_shared_with_me` returns a
	 * LIST and raises for neither: a revoked grantee simply gets a list with the
	 * document missing from it. So a call that SUCCEEDS is a decision, and a call
	 * that FAILS is not -- which is exactly the partition this needs.
	 *
	 * A FAILURE TO ASK IS THEREFORE NOT A LOST GRANT. Nothing was decided, so
	 * this answers false and the original error stands as the retryable `error`
	 * phase it already was. Reporting an undecided round trip as a terminal loss
	 * is the lie `checkout.ts` names for a failed heartbeat, one layer up.
	 *
	 * IT COSTS ONE ROUND TRIP, ON A SHARED DOCUMENT, ONLY AFTER A THROWN
	 * REFUSAL. A stale revision comes back `ok: false` and never reaches here, so
	 * the ordinary conflict path is unchanged and pays nothing. An owner's own
	 * document skips it entirely, because `role === 'owner'` cannot be revoked.
	 */
	const accessWasRevoked = async (): Promise<boolean> => {
		const list = transports.sharedWithMe;
		if (!list || current.role === 'owner' || current.role === null) return false;
		const document = current.document;
		if (!document) return false;
		try {
			const shared = await list(document.item_id);
			const mine = shared.find((row) => row.documentId === document.id);
			// ABSENT MEANS REVOKED; PRESENT BUT NARROWED ALSO COUNTS. An owner who
			// changed an editor to a viewer has taken the write away just as
			// surely as one who removed the grant, and the student has to see that
			// rather than keep retrying a save the database will refuse forever.
			return mine === undefined || !ideacadCanWrite(ideacadRoleFromPayload(mine.role));
		} catch {
			return false;
		}
	};

	const write = async (): Promise<void> => {
		clearTimer();
		if (inFlight) return inFlight;
		if (dirtyRevision === null || current.phase === 'conflict') return;
		// DEFENCE IN DEPTH, not belt and braces. `refuseWrite` stops a mutating
		// METHOD; this stops the autosave MACHINE, which is reached by a timer
		// nobody calls directly. Opening either one alone leaves the other
		// closed, which is the property the mutation proof checks by opening
		// them separately.
		if (!current.canWrite) return;
		const activeId = current.activeConceptId;
		const active = activeId ? concept(activeId) : undefined;
		if (!active) return;
		const sentRevision = dirtyRevision;
		const sentFeatures = active.features;
		// Captured BEFORE the await, so edits made during the write queue up
		// behind this batch instead of being sent twice or dropped.
		const sentActions = pending;
		if (historyOn()) pending = [];
		publish({ phase: 'saving', error: null });
		inFlight = (async () => {
			try {
				const result = historyOn()
					? await historyTransports!.applyActions(
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
					if (historyOn()) pending = [...sentActions, ...pending];
					// THE LOCAL ROW IS INTENTIONALLY UNTOUCHED. The server row is
					// exposed beside it for an explicit future resolution surface.
					publish({
						phase: 'conflict',
						error: 'This concept changed elsewhere. Your unsaved work is still here.',
						conflictedServerConcept: result.concept
					});
					return;
				}
				if (historyOn() && 'firstSeq' in result && result.firstSeq !== null) {
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
				// A THROWN REFUSAL ON A SHARED DOCUMENT ASKS ONE MORE QUESTION.
				// `0205` re-checks `_ideacad_can_write_document` inside the RPC, so
				// a grant removed mid-session lands here -- and the difference
				// between "try again" and "this can never save again" is the whole
				// of what a student needs. See `accessWasRevoked`.
				if (await accessWasRevoked()) {
					publish({
						phase: 'conflict',
						error: IDEACAD_SHARED_ACCESS_LOST,
						accessLost: true,
						// `canWrite` GOES FALSE WITH IT, and leaving it true was a
						// real hole rather than an untidiness. `conflict` stops the
						// autosave MACHINE, so no further save is scheduled -- but
						// `create`, `rename`, `delete` and the rest are explicit
						// presses that go straight to their RPC, and with `canWrite`
						// still true `refuseWrite` waved every one of them through to
						// a raw database error. Terminal has to mean terminal for
						// every write, not only for the one that discovered it.
						canWrite: false
					});
					return;
				}
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
		// UNDO IS A WRITE. It appends the inverse action and saves the tree, so a
		// viewer pressing it would be refused by `0205` at the RPC -- and guarding
		// `step` rather than `undo` and `redo` separately is what keeps that one
		// rule in one place.
		refuseWrite();
		// AND `historyOn()` RATHER THAN A BARE `historyTransports` NULL TEST, which
		// is the same question asked one rung short: it is
		// `historyTransports !== null && !historyOff`, so it also honours the
		// `PGRST202` ladder that turns this region off on a deployment sitting
		// between 0208 and 0209. Testing the transports alone would send an undo
		// to an RPC this deployment has already been told does not exist.
		if (!historyOn()) throw new Error('This deployment has no IdeaCAD history.');
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
			const result = await historyTransports!.applyActions(activeId!, [action], next, revision);
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
				conflictedServerConcept: null,
				// THE CALLER IS THE OWNER AND THIS IS NOT A GUESS.
				// `ideacad_open_document` resolves the caller's own document
				// through `_classroom_engine_student` and can return nobody
				// else's, so `owner` is the only role this arm can produce.
				// `accessLost` is cleared because a fresh open is a fresh
				// decision -- and an owner's grant cannot be revoked at all.
				role: 'owner',
				canWrite: true,
				accessLost: false
			});
			const active = opened.document.active_concept_id;
			rebaseLog(opened.concepts.find((row) => row.id === active)?.features ?? null);
			await loadHistory(active);
		},
		async openShared(documentId) {
			const openShared = transports.openSharedDocument;
			if (!openShared) {
				// THE LADDER'S LAST RUNG, AND IT REFUSES RATHER THAN RESOLVING.
				// A deployment between 0204 and 0205 has no such RPC; a store
				// that resolved quietly would leave the surface showing an empty
				// editor for a document it never read, which is indistinguishable
				// from a document with no work in it.
				throw new Error('This deployment cannot open a shared IdeaCAD document.');
			}
			// Anything this store still holds for the PREVIOUS document is
			// flushed before the snapshot is replaced. `open` does the same, and
			// for the same reason: whatever is in the debounce belongs to the
			// document being navigated away from, and writing it after the
			// replacement would aim it at the new one's concept ids.
			await write();
			const opened = await openShared(documentId);
			// THE ROLE IS READ THROUGH THE UNION AND THE TWO ANSWERS ARE ANDED.
			// `ideacadRoleFromPayload` drops a role this build does not know
			// rather than coercing it, and `ideacadCanWrite(null)` is false, so
			// an unrecognised role opens READ-ONLY instead of opening with the
			// permissive default. The payload's own `canWrite` is required too:
			// either one saying no is a no.
			const role = ideacadRoleFromPayload(opened.role);
			const canWrite = ideacadCanWrite(role) && opened.canWrite === true;
			dirtyRevision = null;
			publish({
				// THE ITEM COMES OFF THE DOCUMENT ROW, NOT FROM A PARAMETER.
				// This method is keyed on a document id, and a surface passing
				// the item separately would be a second statement of which item
				// this document belongs to -- with nothing to catch the two
				// disagreeing. `item_id` is on the row `0205` returns.
				itemId: opened.document.item_id,
				document: opened.document,
				concepts: opened.concepts,
				activeConceptId: opened.document.active_concept_id,
				prediction: opened.prediction,
				config: opened.config,
				// `saved` IS THE HONEST PHASE FOR A VIEWER TOO. Nothing is
				// outstanding: what is on screen is exactly what the database
				// holds. `idle` would read as unsaved work.
				phase: 'saved',
				error: null,
				conflictedServerConcept: null,
				role,
				canWrite,
				accessLost: false
			});
			const active = opened.document.active_concept_id;
			rebaseLog(opened.concepts.find((row) => row.id === active)?.features ?? null);
			// THE LOG IS READ FOR A VIEWER AS WELL, AND THAT IS DELIBERATE.
			// `ideacad_concept_history` is a READ that 0205's own policies already
			// scope to who may see the document, so a viewer seeing how a part was
			// built is the same disclosure as seeing the part. What a viewer
			// cannot do is UNDO, which `refuseWrite` stops in `step`.
			await loadHistory(active);
		},
		edit(features) {
			if (stopped) throw new Error('This IdeaCAD store has been destroyed.');
			refuseWrite();
			const activeId = current.activeConceptId;
			const active = activeId ? concept(activeId) : undefined;
			if (!active) throw new Error('Open an IdeaCAD document before editing.');
			const revision = Math.max(active.revision, dirtyRevision ?? 0) + 1;
			dirtyRevision = revision;
			if (historyOn()) {
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
			refuseWrite();
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
			refuseWrite();
			const row = concept(conceptId);
			if (!row) throw new Error('Unknown IdeaCAD concept.');
			await updateMeta(conceptId, name, row.position);
		},
		async reposition(conceptId, position) {
			refuseWrite();
			const row = concept(conceptId);
			if (!row) throw new Error('Unknown IdeaCAD concept.');
			await updateMeta(conceptId, row.name, position);
		},
		async delete(conceptId) {
			refuseWrite();
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
			refuseWrite();
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
			refuseWrite();
			if (!current.document) throw new Error('Open an IdeaCAD document before predicting.');
			const prediction = await transports.setPrediction(current.document.id, conceptId, rationale);
			publish({ prediction, error: null });
		},
		async commit(conceptId) {
			refuseWrite();
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
			if (!historyOn() || historyRows.length === 0) return null;
			return stateAt(historyRows, seq);
		},
		async refreshHistory() {
			await loadHistory(current.activeConceptId);
		}
	};
}
