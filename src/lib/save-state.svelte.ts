/**
 * THE ONE SAVE STATE MACHINE, for every surface that persists work.
 *
 * This is FspTechSelection's and FspPulse's engine, extracted rather than
 * copied. Those two were the only surfaces in the repo that retried a failed
 * write, and they held two byte-identical copies of the same ~90 lines; a
 * third, fourth and fifth variant is how the classroom ended up telling a
 * student "Saving..." for a request that had not been made and would never be
 * re-attempted.
 *
 * WHAT IT OWNS: a five-state machine (clean, dirty, writing, saved, failed),
 * an 800ms debounce, exponential backoff to 8s, a durability net on
 * visibilitychange and pagehide, and a `dirty` signal a navigation guard can
 * read.
 *
 * PER-INSTANCE, NEVER GLOBAL. One shell-wide banner reading "all changes
 * saved" while a sibling surface holds a failed write is a false negative with
 * a much wider blast radius than the defect it would be papering over. Each
 * surface owns its own instance and reports its own truth, in the place the
 * work was done.
 *
 * THE LOAD-BEARING RULE: `saved` is reached ONLY when the save function
 * resolves ok. Never on dispatch, never on a timer, never because a debounce
 * was scheduled. Everything else here is machinery around that one line.
 *
 * NOT tied to SvelteKit: the navigation guard lives next door in
 * `save-guard.svelte.ts`, so this module stays importable -- and the state
 * machine stays assertable -- with no `$app/*` in scope.
 */

/**
 * What one attempt at a write came back with.
 *
 * THE TWO FAILURES ARE NOT THE SAME FAILURE, and collapsing them is what makes
 * a retry loop dangerous. A `retryable` failure is the network, the tab, a
 * serverless cold start: sending the identical payload again is the correct
 * response. A refusal is the server having considered the payload and said no
 * ("this is submitted, so edits are locked"). Re-sending that five times with
 * backoff spends fifteen seconds arriving at the same answer, while telling
 * the person their work is being retried when nothing about it will change.
 */
export type SaveOutcome =
	| { ok: true }
	| { ok: false; retryable: true; message: string }
	| { ok: false; retryable: false; message: string };

/** The five states. `saved` carries the clock time of the acknowledgement. */
export type SavePhase = 'clean' | 'dirty' | 'writing' | 'saved' | 'failed';

export interface SaveStateOptions {
	/**
	 * Persist the CURRENT value. Read the state fresh inside here rather than
	 * closing over a snapshot: every attempt (a retry, or a coalesced re-run
	 * after an edit landed mid-write) calls this again, and last-write-wins is
	 * only true if the newest value is what goes out.
	 *
	 * A throw is treated as a retryable failure, so a transport that rejects
	 * rather than resolving an ok:false result cannot strand the machine.
	 */
	save: () => Promise<SaveOutcome>;
	/**
	 * False for a surface with an explicit Save control and no autosave (a
	 * notebook note mints a REVISION per write, so debouncing one would fill a
	 * thread with versions nobody asked for). `markDirty` still moves the
	 * machine to `dirty` -- which is what a navigation guard reads -- it just
	 * schedules nothing.
	 */
	autosave?: boolean;
	/** The FSP convention, and now everyone's. */
	debounceMs?: number;
	/** Backoff ceiling. */
	maxBackoffMs?: number;
	/** Attempts per run, INCLUDING the first. */
	maxAttempts?: number;
	/**
	 * The durability net when the tab is hidden or closing. The default is a
	 * plain `saveNow()`, which is right for anything posting to our own origin.
	 * FSP hands in a `sendBeacon` instead, because its endpoint is an Apps
	 * Script exec URL on another origin and a fetch begun at `pagehide` is not
	 * guaranteed to leave the machine.
	 */
	onHide?: () => void;
	/** Injectable clock, so a test can assert the stamp rather than the format. */
	now?: () => number;
	/** Injectable sleep, so a test can prove the backoff sequence in no time. */
	wait?: (ms: number) => Promise<void>;
	/** Shown while failed, when the outcome carried no message of its own. */
	fallbackMessage?: string;
}

/** The FSP curve: 800, 1600, 3200, 6400, then pinned at the ceiling. */
export function backoffMs(attempt: number, debounce = 800, ceiling = 8000): number {
	return Math.min(debounce * 2 ** (attempt - 1), ceiling);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type ResolvedOptions = SaveStateOptions &
	Required<
		Pick<
			SaveStateOptions,
			| 'autosave'
			| 'debounceMs'
			| 'maxBackoffMs'
			| 'maxAttempts'
			| 'now'
			| 'wait'
			| 'fallbackMessage'
		>
	>;

export class SaveState {
	#phase = $state<SavePhase>('clean');
	#savedAt = $state<number | null>(null);
	#message = $state<string | null>(null);
	#attempt = $state(0);

	#opts: ResolvedOptions;

	#timer: ReturnType<typeof setTimeout> | null = null;
	#inflight = false;
	#current: Promise<void> | null = null;
	/** An edit that has not yet been handed to `save()`. */
	#pending = false;
	#destroyed = false;

	constructor(options: SaveStateOptions) {
		this.#opts = {
			autosave: true,
			debounceMs: 800,
			maxBackoffMs: 8000,
			maxAttempts: 5,
			now: () => Date.now(),
			wait: sleep,
			fallbackMessage: 'That change was not saved.',
			...options
		};
	}

	get phase(): SavePhase {
		return this.#phase;
	}

	/** Epoch ms of the last ACKNOWLEDGED write, or null if there has not been one. */
	get savedAt(): number | null {
		return this.#savedAt;
	}

	get message(): string | null {
		return this.#message;
	}

	/** 0 outside a run; 1..maxAttempts while writing. */
	get attempt(): number {
		return this.#attempt;
	}

	get maxAttempts(): number {
		return this.#opts.maxAttempts;
	}

	/**
	 * IS THERE WORK THE SERVER HAS NOT ACKNOWLEDGED. This is what a navigation
	 * guard reads, so `writing` and `failed` both count: a request in flight can
	 * still be killed by the navigation being asked about, and a failed write is
	 * the whole reason the question is worth asking.
	 */
	get dirty(): boolean {
		return this.#phase === 'dirty' || this.#phase === 'writing' || this.#phase === 'failed';
	}

	/** True once a write has failed and stopped retrying: show a Retry control. */
	get failed(): boolean {
		return this.#phase === 'failed';
	}

	/**
	 * Something changed. Moves to `dirty` and (when autosaving) arms the
	 * debounce. Safe to call on every keystroke.
	 */
	markDirty(): void {
		if (this.#destroyed) return;
		this.#pending = true;
		if (this.#phase !== 'writing') {
			this.#phase = 'dirty';
			this.#message = null;
		}
		if (this.#opts.autosave) this.#schedule();
	}

	/**
	 * Seed the baseline without writing: what is on screen is what the server
	 * already holds. `at` null (the default) means "as of the load", which is a
	 * `saved` state with no clock time to show rather than a lie about one.
	 */
	markSaved(at: number | null = null): void {
		this.#cancelTimer();
		this.#pending = false;
		this.#phase = 'saved';
		this.#savedAt = at;
		this.#message = null;
		this.#attempt = 0;
	}

	/** Back to `clean`: the work was discarded, or the surface moved on. */
	reset(): void {
		this.#cancelTimer();
		this.#pending = false;
		this.#phase = 'clean';
		this.#savedAt = null;
		this.#message = null;
		this.#attempt = 0;
	}

	/** Write now, skipping any pending debounce. Resolves when the run settles. */
	async saveNow(): Promise<void> {
		if (this.#destroyed) return;
		this.#cancelTimer();
		if (this.#inflight) {
			await this.#current;
			// An edit that landed while that run was in flight has not been sent.
			if (!this.#pending) return;
			this.#cancelTimer();
		} else if (!this.#pending && this.#phase !== 'failed' && this.#phase !== 'dirty') {
			return;
		}
		await this.#run();
	}

	/** The manual Retry beside a failed indicator. */
	async retry(): Promise<void> {
		this.#message = null;
		await this.saveNow();
	}

	/**
	 * The durability net. Call from an `$effect` and return the teardown, so the
	 * listeners live and die with the component instance.
	 */
	attach(): () => void {
		if (typeof document === 'undefined' || typeof window === 'undefined') {
			return () => this.destroy();
		}
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') this.#flush();
		};
		const onPageHide = () => this.#flush();
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pagehide', onPageHide);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pagehide', onPageHide);
			this.destroy();
		};
	}

	destroy(): void {
		this.#destroyed = true;
		this.#cancelTimer();
	}

	#flush(): void {
		if (!this.dirty) return;
		if (this.#opts.onHide) {
			this.#opts.onHide();
			return;
		}
		void this.saveNow();
	}

	#cancelTimer(): void {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
	}

	#schedule(): void {
		this.#cancelTimer();
		this.#timer = setTimeout(() => {
			this.#timer = null;
			// NOTHING PENDING MEANS NOTHING TO SEND. An edit made mid-write arms
			// this timer AND is picked up by the settle path, which is faster;
			// without this line the timer then fires behind it and writes an
			// identical row for the second time.
			if (!this.#pending) return;
			void this.#run();
		}, this.#opts.debounceMs);
	}

	#run(): Promise<void> {
		// A second caller does not start a second run; it waits on this one, and
		// the settle path re-runs if an edit landed meanwhile.
		if (this.#inflight) return this.#current ?? Promise.resolve();
		this.#current = this.#execute();
		return this.#current;
	}

	async #execute(): Promise<void> {
		this.#inflight = true;
		const { maxAttempts, debounceMs, maxBackoffMs, wait, now, fallbackMessage } = this.#opts;
		let settledOk = false;
		try {
			for (let attempt = 1; attempt <= maxAttempts; attempt++) {
				this.#attempt = attempt;
				this.#phase = 'writing';
				this.#message = attempt > 1 ? `Retrying (attempt ${attempt} of ${maxAttempts})...` : null;

				// Cleared HERE, immediately before the value goes out: anything
				// typed after this point is a genuinely newer edit and must cause
				// another run once this one settles.
				this.#pending = false;

				let outcome: SaveOutcome;
				try {
					outcome = await this.#opts.save();
				} catch (err) {
					outcome = {
						ok: false,
						retryable: true,
						message: err instanceof Error && err.message ? err.message : fallbackMessage
					};
				}

				if (outcome.ok) {
					// THE ONE LINE THIS WHOLE MODULE EXISTS FOR.
					this.#phase = 'saved';
					this.#savedAt = now();
					this.#message = null;
					this.#attempt = 0;
					settledOk = true;
					break;
				}

				if (!outcome.retryable || attempt === maxAttempts) {
					this.#phase = 'failed';
					this.#message = outcome.message || fallbackMessage;
					this.#attempt = 0;
					break;
				}

				await wait(backoffMs(attempt, debounceMs, maxBackoffMs));
			}
		} finally {
			this.#inflight = false;
			this.#current = null;
		}

		if (this.#pending && !this.#destroyed) {
			// An edit landed mid-write. On success go straight back out (that can
			// only happen once per edit, so there is no hot loop in it); after a
			// failure re-arm the debounce instead, so a broken endpoint cannot be
			// hammered by someone typing.
			if (settledOk) await this.#run();
			else if (this.#opts.autosave) this.#schedule();
		}
	}
}

/** What an indicator shows. `kind` is for styling; `text` is the words. */
export interface SaveLabel {
	kind: SavePhase;
	text: string;
}

/**
 * THE WORDS, SAID ONCE, so four surfaces cannot drift into four vocabularies
 * for the same five states.
 */
export function saveStateLabel(state: {
	phase: SavePhase;
	savedAt: number | null;
	message: string | null;
	attempt: number;
	maxAttempts: number;
}): SaveLabel {
	switch (state.phase) {
		case 'clean':
			return { kind: 'clean', text: '' };
		case 'dirty':
			return { kind: 'dirty', text: 'Unsaved changes' };
		case 'writing':
			return {
				kind: 'writing',
				text:
					state.attempt > 1
						? `Retrying (attempt ${state.attempt} of ${state.maxAttempts})...`
						: 'Saving...'
			};
		case 'saved':
			return {
				kind: 'saved',
				text: state.savedAt == null ? 'Saved' : `Saved ${clockTime(state.savedAt)}`
			};
		case 'failed':
			return {
				kind: 'failed',
				text: state.message ? `Not saved. ${state.message}` : 'Not saved.'
			};
	}
}

/** The clock time of a write, in the reader's own locale. */
export function clockTime(at: number): string {
	const d = new Date(at);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
