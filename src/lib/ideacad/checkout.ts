/**
 * IdeaCAD PART CHECKOUT: the controller a surface mounts, and the words a
 * refusal is read in.
 *
 * `assembly.ts` (ledger 0183) is the DATA layer -- the types, the RPC boundary,
 * the channel and the pure predicates. It shipped with no UI at all. This is the
 * half between that and a panel: one object that holds the assembly, keeps the
 * caller's own hold alive, notices when the hold is gone, and turns every
 * structured refusal into a sentence a fifteen-year-old reads and acts on.
 *
 * NO SVELTE IN HERE. It is a plain subscribe-able store, exactly the shape
 * `store.ts` is, so the whole state machine is assertable with no browser and a
 * surface is left with nothing but rendering.
 *
 * ---------------------------------------------------------------------------
 * THE TERMINAL STATE IS `store.ts`'s `conflict`, REUSED RATHER THAN REINVENTED.
 * ---------------------------------------------------------------------------
 *
 * When a save is refused as stale, `store.ts` publishes `phase: 'conflict'`,
 * KEEPS the local row untouched, and stops writing. Losing a part is the same
 * event one layer up: the work on screen is still the student's, it is no longer
 * saveable HERE, and continuing to write would overwrite whoever holds it now.
 * So `phase: 'lost'` is terminal in the same way -- the heartbeat stops, no
 * write is attempted, and the only way out is a deliberate act (claiming the
 * part again, when it is free).
 *
 * ---------------------------------------------------------------------------
 * A LAPSED HOLD IS NOTICED LOCALLY, NOT DISCOVERED ON A REFUSED WRITE.
 * ---------------------------------------------------------------------------
 *
 * `0207`'s window is ten minutes and the client beats every ten seconds, so the
 * ordinary way to learn a hold is gone is a heartbeat answering `lost` or
 * `lapsed`. **That path needs the network, which is exactly what is missing in
 * the case it matters most**: a student whose wifi dropped gets no answer from
 * anything, keeps typing, and finds out when they come back. So the controller
 * ALSO runs its own clock against `holdWindowSeconds` from the payload and goes
 * terminal on its own once the window has passed with no successful beat. Two
 * independent routes to the same state, and the one that does not need a server
 * is the one that covers the disconnection.
 *
 * THE WINDOW IS NEVER WRITTEN DOWN HERE. `_ideacad_hold_window()` is its one
 * statement and `ideacad_assembly` returns it as `holdWindowSeconds`; every
 * number below is read off the payload. A constant here would be the
 * `_foundry_play_window()` lesson repeated in a second language.
 */

import {
	IDEACAD_ASSEMBLY_POLL_MS,
	IDEACAD_HOLD_BEAT_MS,
	assemblyHoldsChanged,
	holdIsMine,
	holdLostAgainst,
	partsInOrder,
	type IdeacadAssembly,
	type IdeacadAssemblyPart,
	type IdeacadAssemblyTransports,
	type IdeacadHoldReason,
	type IdeacadHoldResult
} from './assembly';

/**
 * How long before a hold lapses the surface should start saying so.
 *
 * A FRACTION OF THE WINDOW RATHER THAN A NUMBER OF SECONDS, because the window
 * is the database's and may be changed there without anybody editing this file.
 * A fixed "warn at 60s" against a window somebody shortened to 45 would be a
 * warning that is on from the first second.
 */
export const IDEACAD_HOLD_WARN_FRACTION = 0.25;

/** The controller's phase. `lost` is terminal, in the sense `conflict` is. */
export type IdeacadCheckoutPhase = 'idle' | 'busy' | 'lost';

/**
 * What the surface shows about the last thing that happened.
 *
 * A TONE AND A WORD, NEVER A COLOUR ALONE, and the tones are the three a reader
 * needs to tell apart: something worked, something was refused, something ended.
 */
export type IdeacadNoticeTone = 'info' | 'refusal' | 'terminal';

export interface IdeacadCheckoutNotice {
	tone: IdeacadNoticeTone;
	text: string;
	/** The reason the database gave, so a surface can key a test on it. */
	reason: IdeacadHoldReason | 'network';
}

/** The controller's published snapshot. Immutable; replaced, never mutated. */
export interface IdeacadCheckoutState {
	readonly documentId: string | null;
	readonly assembly: IdeacadAssembly | null;
	/** The parts in the owner's order. Empty until the first read lands. */
	readonly parts: readonly IdeacadAssemblyPart[];
	/** The part this client believes it holds, and the generation it was handed. */
	readonly myPartId: string | null;
	readonly myHoldRevision: number | null;
	readonly phase: IdeacadCheckoutPhase;
	readonly notice: IdeacadCheckoutNotice | null;
	/**
	 * Seconds left on this client's own hold, from the payload's window and this
	 * controller's own clock. NULL when nothing is held -- never 0, which a
	 * surface would render as "about to lapse".
	 */
	readonly secondsLeft: number | null;
	/** Set when a read or a write failed outright. Never a refusal; see below. */
	readonly error: string | null;
}

/**
 * THE WORDS, ONCE, EXHAUSTIVE OVER `IdeacadHoldReason`.
 *
 * A `Record` over the union rather than a `switch` with a default: adding a
 * reason to `assembly.ts` without a sentence here is then a TYPE ERROR rather
 * than a blank line on a student's screen, which is the rule `RANK_STATES`
 * follows and the reason a third grant role is a decision and not a string.
 *
 * EVERY SENTENCE SAYS WHAT TO DO NEXT. "Refused" on its own is what a console
 * error already was; a refusal that reaches a student is only worth rendering if
 * it tells them what the next press is.
 */
const REASON_TEXT: Record<IdeacadHoldReason, string> = {
	claimed: 'You have this part. Nobody else can change it while you are working.',
	takeover: 'You have this part. Whoever had it before had stopped working on it.',
	resumed: 'You still have this part.',
	held: 'Somebody else is working on this part right now. Ask them to release it, or take a different one.',
	released: 'You let this part go. Anyone on the assembly can take it now.',
	already_free: 'Nobody had this part, so there was nothing to release.',
	not_yours: 'This part is not yours to release. Whoever has it, or the owner of the assembly, can let it go.',
	beating: 'You still have this part.',
	lost: 'You do not have this part any more. What is on screen is still here, but it will not save. Take the part again, or ask the owner.',
	lapsed: 'Your hold on this part timed out. What is on screen is still here, but it will not save. Take the part again.',
	assigned: 'The owner moved this part to somebody.',
	cleared: 'The owner took this part off whoever had it. It is free now.',
	unchanged: 'That person already has this part.'
};

/** Which tone each reason reads in. Exhaustive for the same reason. */
const REASON_TONE: Record<IdeacadHoldReason, IdeacadNoticeTone> = {
	claimed: 'info',
	takeover: 'info',
	resumed: 'info',
	held: 'refusal',
	released: 'info',
	already_free: 'info',
	not_yours: 'refusal',
	beating: 'info',
	lost: 'terminal',
	lapsed: 'terminal',
	assigned: 'info',
	cleared: 'info',
	unchanged: 'info'
};

/**
 * The notice for one RPC answer.
 *
 * `held` NAMES THE HOLDER when the payload carries one, because "somebody else"
 * is a sentence a student cannot act on and a name is one they can: the person
 * is three feet away. Every other reason keeps the flat sentence -- a name on
 * `released` would be the caller's own address read back at them.
 */
export function checkoutNotice(result: IdeacadHoldResult): IdeacadCheckoutNotice {
	const base = REASON_TEXT[result.reason];
	const text =
		result.reason === 'held' && result.heldBy
			? `${result.heldBy} is working on this part right now. Ask them to release it, or take a different one.`
			: result.reason === 'assigned' && result.heldBy
				? `The owner moved this part to ${result.heldBy}.`
				: base;
	return { tone: REASON_TONE[result.reason], text, reason: result.reason };
}

/**
 * THE ONE SENTENCE A NETWORK FAILURE READS, and it is deliberately not a
 * refusal: nothing was decided, so telling a student their claim was refused
 * would be a lie about a round trip that never landed.
 */
export const IDEACAD_CHECKOUT_OFFLINE =
	'That did not reach the server. Your work is still here. Try again in a moment.';

/**
 * THE SENTENCE A VIEWER READS INSTEAD OF CONTROLS.
 *
 * A viewer is never shown a control that would be refused -- `canWrite` false
 * means the claim buttons are ABSENT, structurally, so there is nothing to
 * disable and nothing to press. This says why, which is the difference between
 * a rule and a surface that looks broken.
 */
export const IDEACAD_CHECKOUT_VIEW_ONLY =
	'You can look at every part of this assembly. Taking a part is for the people the owner shared it with as editors.';

/** Seconds left on a hold, from the payload's own window. NULL when not held. */
export function holdSecondsLeft(
	part: Pick<IdeacadAssemblyPart, 'holdBeatAt'> | null | undefined,
	windowSeconds: number,
	now: number
): number | null {
	if (!part?.holdBeatAt) return null;
	const beat = Date.parse(part.holdBeatAt);
	if (Number.isNaN(beat)) return null;
	return Math.max(0, Math.round((beat + windowSeconds * 1000 - now) / 1000));
}

/**
 * Whether a hold is close enough to lapsing that the surface should say so.
 * False for a null -- "not held" is not "about to lapse".
 */
export function holdIsExpiring(secondsLeft: number | null, windowSeconds: number): boolean {
	if (secondsLeft === null) return false;
	return secondsLeft <= Math.max(1, Math.round(windowSeconds * IDEACAD_HOLD_WARN_FRACTION));
}

/**
 * THE ROW MODEL A SURFACE RENDERS, derived once here rather than in the markup.
 *
 * `partIsClaimable` in `assembly.ts` answers whether the control should be
 * OFFERED; this adds which of the three words it carries and whether the row is
 * this viewer's. A surface computing it inline is the second statement of a rule
 * about who may press what.
 */
export type IdeacadPartAction = 'claim' | 'release' | 'blocked' | 'none';

export interface IdeacadPartRowModel {
	part: IdeacadAssemblyPart;
	/** True when THIS client holds it, by the payload's own answer. */
	mine: boolean;
	/** The holder's address, or null when the part is free or the hold lapsed. */
	holder: string | null;
	/** A live hold somebody else has. The row says whose. */
	blockedBy: string | null;
	action: IdeacadPartAction;
}

export function partRows(
	assembly: Pick<IdeacadAssembly, 'parts' | 'viewer' | 'canWrite'>
): IdeacadPartRowModel[] {
	return partsInOrder(assembly.parts).map((part) => {
		const mine = part.holdLive && holdIsMine(part, assembly.viewer);
		// A LAPSED HOLD RENDERS AS FREE, which is what the database will do with
		// it: `ideacad_claim_part` takes over a hold outside the window. A row
		// still naming the person who walked away would offer a refusal that
		// would not happen.
		const holder = part.holdLive ? part.heldBy : null;
		const blockedBy = holder && !mine ? holder : null;
		const action: IdeacadPartAction = !assembly.canWrite
			? 'none'
			: mine
				? 'release'
				: blockedBy
					? 'blocked'
					: 'claim';
		return { part, mine, holder, blockedBy, action };
	});
}

/** Construction options. A test shortens the timers and pins the clock. */
export interface CreateIdeacadCheckoutOptions {
	readonly beatMs?: number;
	readonly pollMs?: number;
	/** How often the local lapse clock re-evaluates. */
	readonly tickMs?: number;
	/** The clock, so a test can pin an instant rather than sleep through one. */
	readonly now?: () => number;
}

export interface IdeacadCheckout {
	readonly state: IdeacadCheckoutState;
	subscribe(run: (state: IdeacadCheckoutState) => void): () => void;
	/** Read the assembly and adopt whatever hold this caller already had. */
	open(documentId: string): Promise<void>;
	/** Re-read the assembly now. What the poll and a hold frame both call. */
	refresh(): Promise<void>;
	claim(partId: string): Promise<IdeacadHoldResult | null>;
	release(partId: string): Promise<IdeacadHoldResult | null>;
	/** OWNER ONLY, and the database is what enforces that. `null` frees the part. */
	assign(partId: string, email: string | null): Promise<IdeacadHoldResult | null>;
	/** Dismiss a notice without acting on it. */
	clearNotice(): void;
	/** Stop every timer and release the subscription. */
	destroy(): void;
}

const EMPTY: IdeacadCheckoutState = {
	documentId: null,
	assembly: null,
	parts: [],
	myPartId: null,
	myHoldRevision: null,
	phase: 'idle',
	notice: null,
	secondsLeft: null,
	error: null
};

export function createIdeacadCheckout(
	transports: IdeacadAssemblyTransports,
	options: CreateIdeacadCheckoutOptions = {}
): IdeacadCheckout {
	const beatMs = options.beatMs ?? IDEACAD_HOLD_BEAT_MS;
	const pollMs = options.pollMs ?? IDEACAD_ASSEMBLY_POLL_MS;
	const tickMs = options.tickMs ?? 1000;
	const clock = options.now ?? (() => Date.now());

	let current: IdeacadCheckoutState = EMPTY;
	const subscribers = new Set<(state: IdeacadCheckoutState) => void>();
	let beat: ReturnType<typeof setInterval> | null = null;
	let poll: ReturnType<typeof setInterval> | null = null;
	let tick: ReturnType<typeof setInterval> | null = null;
	let stopped = false;

	const publish = (patch: Partial<IdeacadCheckoutState>) => {
		current = { ...current, ...patch } as IdeacadCheckoutState;
		for (const subscriber of subscribers) subscriber(current);
	};
	const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

	const stopBeat = () => {
		if (beat) clearInterval(beat);
		beat = null;
	};
	const stopTick = () => {
		if (tick) clearInterval(tick);
		tick = null;
	};

	/**
	 * ENTER THE TERMINAL STATE. Everything that ends a hold comes through here,
	 * so "the heartbeat stops" is one statement rather than one per caller --
	 * a beat left running after a loss keeps asking a question that has been
	 * answered, and its next `lost` answer would overwrite the notice that
	 * explained the first one.
	 */
	const lose = (notice: IdeacadCheckoutNotice) => {
		stopBeat();
		stopTick();
		publish({ phase: 'lost', notice, myPartId: null, myHoldRevision: null, secondsLeft: null });
	};

	/** Recompute the seconds left, and go terminal if the window has passed. */
	const reclock = () => {
		const assembly = current.assembly;
		const partId = current.myPartId;
		if (!assembly || !partId) {
			if (current.secondsLeft !== null) publish({ secondsLeft: null });
			return;
		}
		const part = assembly.parts.find((p) => p.id === partId) ?? null;
		const left = holdSecondsLeft(part, assembly.holdWindowSeconds, clock());
		if (left !== null && left <= 0) {
			// THE HALF THAT DOES NOT NEED THE SERVER. A student whose network went
			// away gets no answer from a heartbeat, so this is the only route to
			// the truth in exactly the case the truth matters.
			lose({ tone: 'terminal', text: REASON_TEXT.lapsed, reason: 'lapsed' });
			return;
		}
		if (left !== current.secondsLeft) publish({ secondsLeft: left });
	};

	/** Adopt an assembly payload. Called by `open`, `refresh` and the poll. */
	const adopt = (assembly: IdeacadAssembly) => {
		const parts = partsInOrder(assembly.parts);
		const mine = parts.find((p) => p.holdLive && holdIsMine(p, assembly.viewer)) ?? null;

		// A hold this client BELIEVED it had, checked against what came back.
		// `holdLostAgainst` treats a revision BEHIND ours as a stale read rather
		// than a loss, which is what stops a slow poll tearing down a live editor.
		if (current.myPartId && current.myHoldRevision !== null) {
			const held = parts.find((p) => p.id === current.myPartId);
			if (held && holdLostAgainst(held, assembly.viewer, current.myHoldRevision)) {
				publish({ assembly, parts });
				lose({
					tone: 'terminal',
					text: held.heldBy
						? `${held.heldBy} has this part now. What is on screen is still here, but it will not save. Take the part again, or ask the owner.`
						: REASON_TEXT.lost,
					reason: 'lost'
				});
				return;
			}
		}

		publish({
			assembly,
			parts,
			// The hold is re-derived from the payload every read, so a client that
			// reloaded mid-session adopts the hold it still has rather than
			// believing it has none.
			myPartId: mine?.id ?? (current.phase === 'lost' ? null : current.myPartId),
			myHoldRevision: mine?.holdRevision ?? (current.phase === 'lost' ? null : current.myHoldRevision)
		});
		if (mine && current.phase !== 'lost') startBeat();
		if (!mine) stopBeat();
		reclock();
	};

	const runBeat = async () => {
		const partId = current.myPartId;
		const revision = current.myHoldRevision;
		if (!partId || revision === null || current.phase === 'lost') return;
		try {
			const result = await transports.beatPart(partId, revision);
			if (!result.ok) {
				lose(checkoutNotice(result));
				return;
			}
			// A successful beat moves the payload's own `holdBeatAt`, which is what
			// the local lapse clock counts from -- so the assembly row is patched
			// rather than waiting for the next poll to notice the extension.
			const assembly = current.assembly;
			if (assembly && result.holdBeatAt) {
				const beatAt = result.holdBeatAt;
				const parts = assembly.parts.map((p) =>
					p.id === partId ? { ...p, holdBeatAt: beatAt, holdLive: true } : p
				);
				publish({ assembly: { ...assembly, parts }, parts: partsInOrder(parts) });
			}
			reclock();
		} catch {
			// A FAILED BEAT IS NOT A LOST HOLD. Nothing was decided, the hold may
			// well still be ours, and the local clock above is what will end it if
			// the failure lasts past the window.
			reclock();
		}
	};

	const startBeat = () => {
		if (beat || stopped) return;
		beat = setInterval(() => void runBeat(), beatMs);
		if (!tick) tick = setInterval(() => reclock(), tickMs);
	};

	const read = async (): Promise<void> => {
		if (!current.documentId) return;
		try {
			const assembly = await transports.assembly(current.documentId);
			// One integer decides whether anything moved, so an unchanged poll is
			// not a re-render of every row.
			if (!assemblyHoldsChanged(current.assembly, assembly) && current.assembly) {
				publish({ assembly, parts: partsInOrder(assembly.parts), error: null });
				reclock();
				return;
			}
			publish({ error: null });
			adopt(assembly);
		} catch (error) {
			publish({ error: message(error) });
		}
	};

	/** One write, with the network failure separated from the refusal. */
	const act = async (
		fn: () => Promise<IdeacadHoldResult>,
		onOk: (result: IdeacadHoldResult) => void
	): Promise<IdeacadHoldResult | null> => {
		publish({ phase: current.phase === 'lost' ? 'lost' : 'busy', error: null });
		let result: IdeacadHoldResult;
		try {
			result = await fn();
		} catch (error) {
			publish({
				phase: current.phase === 'lost' ? 'lost' : 'idle',
				notice: { tone: 'refusal', text: IDEACAD_CHECKOUT_OFFLINE, reason: 'network' },
				error: message(error)
			});
			return null;
		}
		const notice = checkoutNotice(result);
		if (result.ok) onOk(result);
		publish({
			phase: notice.tone === 'terminal' ? 'lost' : 'idle',
			notice
		});
		await read();
		return result;
	};

	// THE POLL IS THE FLOOR, exactly as it is for the live roster: a
	// reassignment has to reach the displaced holder whether or not a broadcast
	// frame does. It is started at CONSTRUCTION rather than in `open`, so a
	// controller whose document is opened later is covered by the same one
	// timer and there is no window in which nothing is watching. `read` is a
	// no-op while `documentId` is null.
	poll = setInterval(() => void read(), pollMs);

	return {
		get state() {
			return current;
		},
		subscribe(run) {
			run(current);
			subscribers.add(run);
			return () => subscribers.delete(run);
		},
		async open(documentId) {
			publish({ ...EMPTY, documentId });
			await read();
		},
		refresh: read,
		claim(partId) {
			return act(
				() => transports.claimPart(partId),
				(result) => {
					// A SUCCESSFUL CLAIM IS THE WAY OUT OF THE TERMINAL STATE, and the
					// only one: the student deliberately took the part back, which is
					// the same shape as `store.ts` leaving `conflict` only on `open`.
					stopBeat();
					publish({
						phase: 'idle',
						myPartId: partId,
						myHoldRevision: result.holdRevision
					});
					startBeat();
				}
			);
		},
		release(partId) {
			return act(
				() => transports.releasePart(partId),
				() => {
					stopBeat();
					stopTick();
					publish({ myPartId: null, myHoldRevision: null, secondsLeft: null });
				}
			);
		},
		assign(partId, email) {
			return act(
				() => transports.assignPart(partId, email),
				(result) => {
					// The owner reassigning a part they were holding themselves loses
					// the hold like anybody else, so the local hold is re-derived from
					// the answer rather than assumed to survive.
					if (current.myPartId !== partId) return;
					const stillMine =
						!!email &&
						!!result.heldBy &&
						email.trim().toLowerCase() === result.heldBy.trim().toLowerCase() &&
						!!current.assembly &&
						holdIsMine({ heldBy: result.heldBy }, current.assembly.viewer);
					if (stillMine) {
						publish({ myHoldRevision: result.holdRevision });
						return;
					}
					stopBeat();
					stopTick();
					publish({ myPartId: null, myHoldRevision: null, secondsLeft: null });
				}
			);
		},
		clearNotice() {
			publish({ notice: null });
		},
		destroy() {
			stopped = true;
			stopBeat();
			stopTick();
			if (poll) clearInterval(poll);
			poll = null;
			subscribers.clear();
		}
	};
}
