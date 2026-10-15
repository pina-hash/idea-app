/**
 * THE WATCH TRACKER: everything the training player DECIDES, with no player
 * and no DOM in it (ledger 0391).
 *
 * `YouTubePlayer.svelte` is the thin half: it owns the iframe, the 1 s tick and
 * the markup, and hands every poll to this class. This class owns the rules:
 * which seconds are credited (`accumulatePlayed`), when a Continue check-in
 * opens, when an unanswered one goes missed and stops crediting, what a seek
 * past an unanswered check-in costs, how a rate above 2x is handled, and what
 * one `onsession` report carries. Every rule is a method on plain data with the
 * clock and the random source injected, so `tests/cert-watch-tracker.test.ts`
 * drives a whole watch at a pinned clock and reads the report.
 *
 * WHAT A REPORT CARRIES. `ranges` is CUMULATIVE for the whole watch (the server
 * merges them with what it already holds, so sending the lot every time is
 * idempotent and a dropped report costs nothing). `playedSeconds` and
 * `checkinsMissed` are the figures SINCE THE LAST REPORT, because each report
 * becomes one `cert_watch_sessions` row and rows are summed for telemetry: a
 * cumulative figure would be counted once per minute of play. `maxRate` is the
 * highest rate any second was CREDITED at, so it never exceeds 2: a poll that
 * sees a rate above the cap credits nothing, asks the player to set the rate
 * back, and counts in `rateBlocks` instead. The server still refuses any
 * report whose `maxRate` is above 2 (DECISIONS D11), which is the floor under a
 * client that does not run this code.
 */
import {
	accumulatePlayed,
	clampRate,
	coverage,
	coveredSeconds,
	mergeRanges,
	playedSeconds as playedOf,
	rateOverCap,
	WATCH_MAX_RATE,
	type Range
} from './ranges';
import { checkinDue, checkinTimedOut, scheduleNextCheckin } from './checkins';

/** The sentence the player shows when it set a rate back to the cap. */
export const RATE_BLOCKED_SENTENCE = `Speeds above ${WATCH_MAX_RATE}x are off for training videos.`;

/** What `onsession` carries. The field names are the contract's (DATA_MODEL, the player contract). */
export interface WatchSession {
	itemKey: string;
	duration: number;
	ranges: Range[];
	maxRate: number;
	checkinsMissed: number;
	playedSeconds: number;
	/** Polls that saw a rate above the cap since the last report (telemetry; not in the contract's shape). */
	rateBlocks: number;
}

/** What `onprogress` carries, every poll. */
export interface WatchProgress {
	covered: number;
	duration: number;
	coverage: number;
}

export interface PendingCheckin {
	/** `Date.now()` when it opened. */
	askedAt: number;
	/** The player's clock when it opened: a seek past this is seeked back. */
	atT: number;
	/** Timed out without an answer; crediting is stopped until Continue. */
	missed: boolean;
}

/** What the component must do after a poll. Each is an instruction, never a decision. */
export type TrackerAction =
	| { kind: 'checkin' } // pause the player and show the Continue band
	| { kind: 'seek-back'; to: number } // the student seeked past an unanswered check-in
	| { kind: 'rate-blocked'; rate: number } // set the rate back to the cap and say so
	| { kind: 'missed' }; // the pending check-in just timed out

export interface TrackerOptions {
	itemKey: string;
	/** The settings' timeout for an unanswered check-in, in seconds. */
	checkinTimeoutSeconds: number;
	/** The poll period in seconds (the component's tick). */
	pollSeconds?: number;
	/** `Date.now()` by default. */
	now?: () => number;
	/** The next check-in's mark from the current played mark. Defaults to the random rule. */
	scheduleNext?: (playedSeconds: number) => number;
	/** The cap. `WATCH_MAX_RATE` unless a test says otherwise. */
	maxRate?: number;
	/** How far past an unanswered check-in's position a poll may land before it is a seek past it. */
	seekPastTolerance?: number;
}

export class WatchTracker {
	readonly itemKey: string;
	private readonly timeoutSeconds: number;
	private readonly pollS: number;
	private readonly now: () => number;
	private readonly scheduleNext: (played: number) => number;
	private readonly cap: number;
	private readonly seekPastTolerance: number;

	private ranges: Range[] = [];
	private lastT: number | null = null;
	private duration = 0;
	private creditedMax = 1;
	private nextCheckinAt: number;
	private checkin: PendingCheckin | null = null;
	/** Figures since the last report. */
	private sincePlayed = 0;
	private sinceMissed = 0;
	private sinceBlocks = 0;
	/** The whole watch, for `summary()`. */
	private totalMissed = 0;
	private totalBlocks = 0;

	constructor(options: TrackerOptions) {
		this.itemKey = options.itemKey;
		this.timeoutSeconds = options.checkinTimeoutSeconds;
		this.pollS = options.pollSeconds ?? 1;
		this.now = options.now ?? (() => Date.now());
		this.scheduleNext = options.scheduleNext ?? ((p) => scheduleNextCheckin(p));
		this.cap = options.maxRate ?? WATCH_MAX_RATE;
		this.seekPastTolerance = options.seekPastTolerance ?? 1.5;
		this.nextCheckinAt = this.scheduleNext(0);
	}

	/** Seed with ranges from an earlier session, so a resume keeps its bar honest. */
	seed(ranges: readonly (readonly number[])[], duration?: number): void {
		this.ranges = mergeRanges(ranges);
		if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) this.duration = duration;
	}

	/** The video's length as last reported; 0 until the player answers. */
	setDuration(duration: number): void {
		if (Number.isFinite(duration) && duration > 0) this.duration = duration;
	}

	get pending(): PendingCheckin | null {
		return this.checkin;
	}

	/** Is time being credited right now (no check-in waiting)? */
	get crediting(): boolean {
		return this.checkin === null;
	}

	/** The merged ranges so far. */
	get played(): Range[] {
		return this.ranges.map((r) => [r[0], r[1]]);
	}

	/** Seconds credited in this watch so far (merged, no duration clamp). */
	get playedTotal(): number {
		return playedOf(this.ranges);
	}

	/**
	 * ONE POLL OF A PLAYING PLAYER. `t` is the player's clock, `rate` its
	 * playback rate, `duration` its length (0 while unknown). Returns the
	 * actions the component must carry out, in order.
	 */
	sample(t: number, rate: number, duration: number): TrackerAction[] {
		const actions: TrackerAction[] = [];
		this.setDuration(duration);
		const nowMs = this.now();

		if (this.checkin) {
			// A check-in is waiting. Nothing is credited while it waits; a seek
			// past it is seeked back; a timeout marks it missed exactly once.
			if (t > this.checkin.atT + this.seekPastTolerance) {
				actions.push({ kind: 'seek-back', to: this.checkin.atT });
			}
			if (!this.checkin.missed && checkinTimedOut(this.checkin.askedAt, nowMs, this.timeoutSeconds)) {
				this.checkin.missed = true;
				this.sinceMissed++;
				this.totalMissed++;
				actions.push({ kind: 'missed' });
			}
			this.lastT = null;
			return actions;
		}

		if (rateOverCap(rate, this.cap)) {
			// Faster than the cap: nothing played in this poll counts, and the
			// player is told to come back to the cap. The next poll starts a new
			// range from wherever it lands.
			this.sinceBlocks++;
			this.totalBlocks++;
			this.lastT = null;
			actions.push({ kind: 'rate-blocked', rate });
			return actions;
		}

		if (this.lastT !== null) {
			const before = playedOf(this.ranges);
			this.ranges = accumulatePlayed(this.ranges, this.lastT, t, rate, this.pollS);
			const credited = playedOf(this.ranges) - before;
			if (credited > 0) {
				this.sincePlayed += credited;
				this.creditedMax = Math.max(this.creditedMax, clampRate(rate, this.cap));
			}
		}
		this.lastT = t;

		if (checkinDue(this.playedTotal, this.nextCheckinAt)) {
			this.checkin = { askedAt: nowMs, atT: t, missed: false };
			this.lastT = null;
			actions.push({ kind: 'checkin' });
		}
		return actions;
	}

	/**
	 * THE PLAYER STOPPED (pause, end, buffering): take the last sample's
	 * position as the end of the current range, then forget it, so a seek while
	 * paused credits nothing when play resumes. Returns the same actions a poll
	 * would, because a stop can also be the poll that opens a check-in.
	 */
	stop(t: number, rate: number, duration: number): TrackerAction[] {
		const actions = this.sample(t, rate, duration);
		this.lastT = null;
		return actions;
	}

	/**
	 * THE PLAYER ITSELF REPORTED A RATE ABOVE THE CAP (its `onPlaybackRateChange`
	 * event, which lands between polls). Counts the block and forgets the last
	 * position, so the seconds played at that rate before the component set it
	 * back are never credited. Answers false for a rate the cap allows.
	 */
	blockRate(rate: number): boolean {
		if (!rateOverCap(rate, this.cap)) return false;
		this.sinceBlocks++;
		this.totalBlocks++;
		this.lastT = null;
		return true;
	}

	/** The student pressed Continue: crediting resumes and the next check-in is scheduled. */
	answerCheckin(): void {
		if (!this.checkin) return;
		this.checkin = null;
		this.nextCheckinAt = this.scheduleNext(this.playedTotal);
		this.lastT = null;
	}

	/** Did the last poll say the pending check-in is unanswered past the timeout? */
	get missed(): boolean {
		return this.checkin?.missed ?? false;
	}

	/** The bar's figures, every poll. */
	progress(): WatchProgress {
		const d = this.duration;
		return {
			covered: coveredSeconds(this.ranges, d),
			duration: d,
			coverage: coverage(this.ranges, d)
		};
	}

	/**
	 * ONE REPORT. Cumulative ranges; `playedSeconds`, `checkinsMissed` and
	 * `rateBlocks` since the last report (reset by this call); `maxRate` the
	 * highest credited rate in the whole watch. Returns null when nothing has
	 * happened since the last report, so a page that opened a video and never
	 * pressed play sends no row, and a pause that already reported is not
	 * reported again by the teardown.
	 */
	report(): WatchSession | null {
		if (!this.dirty) return null;
		const session: WatchSession = {
			itemKey: this.itemKey,
			duration: this.duration,
			ranges: this.played,
			maxRate: this.creditedMax,
			checkinsMissed: this.sinceMissed,
			playedSeconds: Math.round(this.sincePlayed * 1000) / 1000,
			rateBlocks: this.sinceBlocks
		};
		this.sincePlayed = 0;
		this.sinceMissed = 0;
		this.sinceBlocks = 0;
		return session;
	}

	/** Has anything happened since the last report? */
	get dirty(): boolean {
		return this.sincePlayed > 0 || this.sinceMissed > 0 || this.sinceBlocks > 0;
	}

	/** The whole watch, for a harness's readout. */
	summary(): { playedSeconds: number; checkinsMissed: number; rateBlocks: number; maxRate: number } {
		return {
			playedSeconds: this.playedTotal,
			checkinsMissed: this.totalMissed,
			rateBlocks: this.totalBlocks,
			maxRate: this.creditedMax
		};
	}
}
