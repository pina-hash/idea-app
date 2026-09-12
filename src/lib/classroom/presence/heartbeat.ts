/**
 * THE STUDENT SIDE: one beat at most every 30 seconds, only while the page is
 * visible, plus exactly one report on the way out of visible.
 *
 * A CLASS, NOT A COMPONENT, AND NOTHING IN IT TOUCHES THE DOM. The clock and
 * the transport are injected, so every rule below is assertable at a pinned
 * instant with no browser and no waiting. `PresenceHeartbeat.svelte` is the
 * thin wrapper that attaches the real listeners to it; this is where the
 * decisions live.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT SENDS, AND WHAT IT CANNOT SEND
 * ---------------------------------------------------------------------------
 *
 * TWO BOOLEANS. `typed` is whether an input event happened recently enough to
 * mean this interval was work; `visible` is `document.visibilityState`. There
 * is nothing else to send, because `classroom_presence_ping` has no parameter
 * for anything else -- no key, no word, no selection, no URL, no duration. The
 * shape of this class cannot widen what the database will store.
 *
 * `noteInput` RECORDS AN INSTANT AND NOTHING ABOUT THE EVENT. It is called from
 * a listener that never looks at the event: not its target, not its key, not
 * its value. The only thing that leaves this object is "there was some input at
 * or after time T", and even T is reduced to a boolean before it is sent.
 *
 * ---------------------------------------------------------------------------
 * THE RATE, AND WHY THE FLOOR IS ALSO IN THE DATABASE
 * ---------------------------------------------------------------------------
 *
 * `tick()` sends at most one beat per `heartbeatMs` and sends nothing at all
 * while hidden. That is the ordinary case and it is what keeps the write rate
 * down in practice. It is NOT what makes the write rate a fact:
 * `classroom_presence_ping` refuses to write a beat arriving inside its own
 * 20-second floor, so a client that ignored every rule here still could not
 * write more often. A limit that lives only in the code sending the requests is
 * a promise, not a limit.
 *
 * ---------------------------------------------------------------------------
 * THE HIDE REPORT IS A STATE CHANGE, NOT A HEARTBEAT
 * ---------------------------------------------------------------------------
 *
 * A periodic beat while hidden would be a page that keeps reporting from a tab
 * nobody is looking at. But without a single report on the TRANSITION, "open in
 * another tab" and "gone" are the same silence, and telling those two apart is
 * half of what Mr. Pina asked for. So `noteVisibility(false)` sends once,
 * immediately, carrying `visible: false` and `typed: false` -- and then nothing
 * more until the page comes back.
 *
 * BOTH TRANSITIONS ARE EXEMPT FROM THE CLIENT'S OWN FLOOR, and the database's
 * is what bounds them. A student flicking between two tabs would otherwise be
 * indistinguishable from one who left, so the report has to go when it happens
 * rather than when the timer next comes round. What that costs at worst is a
 * handful of RPCs that write nothing: `classroom_presence_ping` answers
 * `{ok:true, throttled:true}` inside its 20-second window, so the storm reaches
 * the function and never the table.
 *
 * `typed: false` ON THE HIDE REPORT IS DELIBERATE AND IS NOT A LIE ABOUT THE
 * PAST. The database credits an interval only when the beat reports BOTH typed
 * and visible, so the flag would change nothing about the credit; what it would
 * change is `last_input_at`, which drives "when did they last work". Stamping
 * that at the moment a student switched away would report the tab switch as
 * work.
 */

export interface PresenceBeat {
	typed: boolean;
	visible: boolean;
}

export interface PresenceHeartbeatOptions {
	/** Injected, so a test pins the instant instead of waiting for one. */
	now: () => number;
	/**
	 * FIRE AND FORGET BY CONTRACT. A beat that does not get through costs the
	 * instructor one poll interval, which is what they had before this existed,
	 * so nothing here awaits it and a rejection is swallowed by the caller.
	 */
	send: (beat: PresenceBeat) => void;
	/** Called after a beat that was actually sent. The live notice, if any. */
	announce?: () => void;
	/** Both default to this deployment's own values, threaded in by the caller. */
	heartbeatMs?: number;
	inputWindowMs?: number;
}

const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_INPUT_WINDOW_MS = 60_000;

export class PresenceHeartbeat {
	readonly #now: () => number;
	readonly #send: (beat: PresenceBeat) => void;
	readonly #announce: (() => void) | null;
	readonly #heartbeatMs: number;
	readonly #inputWindowMs: number;

	#visible = true;
	#running = false;
	#lastInputAt: number | null = null;
	#lastSentAt: number | null = null;
	/** Every beat this object has sent, oldest first. The test's instrument. */
	readonly sent: (PresenceBeat & { at: number })[] = [];

	constructor(options: PresenceHeartbeatOptions) {
		this.#now = options.now;
		this.#send = options.send;
		this.#announce = options.announce ?? null;
		this.#heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
		this.#inputWindowMs = options.inputWindowMs ?? DEFAULT_INPUT_WINDOW_MS;
	}

	get running(): boolean {
		return this.#running;
	}

	get visible(): boolean {
		return this.#visible;
	}

	/**
	 * THE FIRST BEAT GOES OUT AT ONCE, and that is what makes a student appear on
	 * the console when they open the assignment rather than half a minute later.
	 * It credits nothing -- there is no interval behind it -- so it costs one row
	 * and buys the whole difference between "here" and "not opened".
	 */
	start(): void {
		if (this.#running) return;
		this.#running = true;
		if (this.#visible) this.#beat(false);
	}

	stop(): void {
		this.#running = false;
	}

	/**
	 * AN INPUT HAPPENED. Records the instant and nothing else; sends nothing, so
	 * typing cannot drive the write rate.
	 */
	noteInput(): void {
		if (!this.#running) return;
		this.#lastInputAt = this.#now();
	}

	/**
	 * VISIBILITY MOVED. Going hidden sends one report immediately; coming back
	 * beats straight away, because a student returning to the tab is exactly the
	 * moment an instructor wants to see them move.
	 */
	noteVisibility(visible: boolean): void {
		if (!this.#running) return;
		if (visible === this.#visible) return;
		this.#visible = visible;
		if (!visible) {
			// The one beat sent while not visible. `typed` is false on purpose --
			// see the header.
			this.#emit({ typed: false, visible: false });
			return;
		}
		this.#beat(true);
	}

	/**
	 * THE TIMER'S CALL. Sends only while visible, only once per `heartbeatMs`.
	 * Calling it more often than that is harmless by construction, which is what
	 * lets the wrapper drive it from a plain interval without a second rate rule.
	 */
	tick(): void {
		if (!this.#running || !this.#visible) return;
		this.#beat(false);
	}

	/** Was there input inside the window ending now? The one thing `typed` is. */
	#typedRecently(at: number): boolean {
		return this.#lastInputAt !== null && at - this.#lastInputAt <= this.#inputWindowMs;
	}

	#beat(force: boolean): void {
		const at = this.#now();
		if (!force && this.#lastSentAt !== null && at - this.#lastSentAt < this.#heartbeatMs) return;
		this.#emit({ typed: this.#typedRecently(at), visible: true });
	}

	#emit(beat: PresenceBeat): void {
		const at = this.#now();
		this.#lastSentAt = at;
		this.sent.push({ ...beat, at });
		this.#send(beat);
		this.#announce?.();
	}
}
