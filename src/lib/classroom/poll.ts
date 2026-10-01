/**
 * THE ONE POLLER EVERY LIVE CLASSROOM WIDGET RUNS ON (ledger 0357).
 *
 * WHY IT EXISTS. On 2026-09-29 and 2026-09-30 the production database stalled
 * at 8:00, when the 21-student IDEA100 class logs in, and each time it took a
 * manual restart. Five widgets each ran their own `setInterval` with their own
 * idea of when to ask again, and between them they had every defect a poll can
 * have at once:
 *
 *   - IN STEP. Every client's first tick landed one interval after the page
 *     loaded, and the whole class loads the page in the same minute.
 *   - DOUBLED ON A TAB RETURN. Two widgets ticked on BOTH `visibilitychange`
 *     and `focus`, so one return to the tab was two or three calls, and `focus`
 *     had no rate rule at all: a student alt-tabbing to SOLIDWORKS and back
 *     asked again every time.
 *   - BLIND TO FAILURE. Every error was swallowed and the next tick asked at
 *     full rate -- including as `anon`, after the session was lost, which is
 *     the `42501 permission denied` storm in the logs after each restart.
 *
 * WHAT IT DOES, AND EVERY ONE OF THESE IS ASSERTED IN `tests/classroom-poll.test.ts`:
 *
 *   1. ONE REQUEST IN FLIGHT. A tick or a poke while a run is outstanding is
 *      dropped, and the next run is scheduled only after the current one ends.
 *   2. A TAB RETURN IS ONE POKE. `visibilitychange` (to visible) and `focus`
 *      are the same signal, and a poke runs only when the last run started at
 *      least `pokeGapMs` ago -- never less than `POLL_MIN_POKE_GAP_MS`, and a
 *      quarter of the interval for a slow widget, so focus churn cannot drive a
 *      widget faster than four times its own cadence.
 *   3. OUT OF STEP. The first run waits a random time in [0, interval), and
 *      every later wait is the interval +/- `POLL_JITTER` (20%).
 *   4. PAUSED WHILE HIDDEN. A tick that comes due while `document.hidden` asks
 *      nothing; it is remembered, and the return to the tab runs it.
 *   5. BACKS OFF. A failed run doubles the wait, from the interval up to
 *      `POLL_MAX_BACKOFF_MS` (5 minutes); one success resets it. A poke does
 *      not cut a backoff short.
 *   6. STOPS WHEN SIGNED OUT. A run that answers `signed-out` (a 401, a 403, a
 *      `42501`: see `isSignedOutFailure`) stops this poller for good, and
 *      hands over to the app's existing signed-out handling
 *      (`$lib/classroom/poll-session`), which is the root layout's own
 *      `invalidate('supabase:auth')`. It never asks again as `anon`. It starts
 *      again only when `authChanged` reports a DIFFERENT, non-null session --
 *      a refreshed token, never the absence of one.
 *
 * PURE: no Svelte, no Supabase, no `$app`. The environment (clock, randomness,
 * timers, visibility and the two listeners) is injected, defaulted to the
 * browser's, so every rule above is testable at a pinned instant with no DOM.
 */

/** What one run reports. `void` from a run means it worked. */
export type PollOutcome = 'ok' | 'failed' | 'signed-out';

/** Every wait is the interval +/- this fraction. */
export const POLL_JITTER = 0.2;
/** The floor under the gap between a poke-driven run and the run before it. */
export const POLL_MIN_POKE_GAP_MS = 10_000;
/** The ceiling a failing widget backs off to. */
export const POLL_MAX_BACKOFF_MS = 5 * 60_000;
/** No wait is ever shorter than this, however the jitter falls. */
const POLL_MIN_WAIT_MS = 1_000;

/**
 * THROWN BY A TRANSPORT THAT LEARNED THE CALLER HAS NO VALID SESSION, so a run
 * can say so through code that otherwise answers `null` for every failure.
 * The poller reads it as `signed-out`; any other throw is `failed`.
 */
export class PollSignedOut extends Error {
	constructor() {
		super('The session is not valid; polling stopped.');
		this.name = 'PollSignedOut';
	}
}

/**
 * IS THIS FAILURE "YOU ARE NOT SIGNED IN", rather than "try again later".
 *
 * 401 and 403 from PostgREST are JWT failures (expired, malformed) and
 * `42501` is `insufficient_privilege` -- which on these RPCs, every one granted
 * to `authenticated` and revoked from `anon` by name, means the request
 * arrived as `anon`. PostgREST answers that 401 for an anonymous caller and 403
 * for an authenticated one, so the code is checked as well as the status, in
 * case either is missing from what a client library hands back.
 *
 * A NETWORK FAILURE IS NOT THIS. supabase-js reports one with status 0 and no
 * code, and that is a `failed` run that backs off, never a stop.
 */
export function isSignedOutFailure(
	error: { code?: string | null; status?: number | null } | null | undefined,
	status?: number | null
): boolean {
	if (!error && status == null) return false;
	const s = status ?? error?.status ?? null;
	if (s === 401 || s === 403) return true;
	const code = (error?.code ?? '').trim();
	return code === '42501' || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303';
}

/** What the poller needs from the outside world; the browser's by default. */
export interface PollerEnv {
	now(): number;
	random(): number;
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
	hidden(): boolean;
	/** Call `poke` on a return to the tab (visible) and on window focus; returns the unlisten. */
	listen(poke: () => void): () => void;
}

export interface PollerOptions {
	/** The base cadence. */
	intervalMs: number;
	/** One poll. Return `failed` or `signed-out`, or throw (`PollSignedOut` is signed-out). */
	run: () => Promise<PollOutcome | void> | PollOutcome | void;
	/**
	 * Run at once on start rather than after a random offset. For a surface whose
	 * first call IS the point (the presence heartbeat makes a student appear the
	 * moment they open the work); everything else starts out of step.
	 */
	immediate?: boolean;
	/** Override the poke gap; defaults to `defaultPokeGapMs(intervalMs)`. */
	pokeGapMs?: number;
	/** Called once when a run reports signed-out. */
	onSignedOut?: (() => void) | null;
	env?: PollerEnv;
}

export interface Poller {
	/** A tab return or a focus; runs now only if the rules above allow it. */
	poke(): void;
	/**
	 * Run now, whatever the gap or a backoff says, and restart the wait from this
	 * run. For a caller that KNOWS it needs an answer (the presence beat on a
	 * return to the tab, a widget whose page-load answer just replaced a newer
	 * one). Still never while a run is in flight, while hidden (it is owed to the
	 * return instead), or once stopped or signed out.
	 */
	runNow(): void;
	/** Tear down: no timer, no listener, nothing runs again. */
	stop(): void;
	/** Change the cadence; takes effect from the next wait. */
	setIntervalMs(ms: number): void;
	/**
	 * The session as the page now knows it (any string that changes when the
	 * token does), or null when there is none. A poller stopped for a signed-out
	 * run starts again only when this moves to a non-null value different from
	 * the one it held when it stopped.
	 */
	authChanged(session: string | null): void;
	readonly signedOut: boolean;
	readonly stopped: boolean;
	readonly inFlight: boolean;
	/** Consecutive failed runs; 0 after any success. */
	readonly failures: number;
}

/** The gap a poke must clear: a quarter of the interval, and never under 10s. */
export function defaultPokeGapMs(intervalMs: number): number {
	return Math.max(POLL_MIN_POKE_GAP_MS, Math.round(intervalMs / 4));
}

/** The wait after `failures` consecutive failures, before jitter. */
export function backoffMs(intervalMs: number, failures: number): number {
	if (failures <= 0) return intervalMs;
	return Math.min(POLL_MAX_BACKOFF_MS, intervalMs * 2 ** failures);
}

/**
 * `base` moved by up to +/- `POLL_JITTER`, from one draw of `random` in [0, 1).
 * Never under a second, unless the base itself is under a second (a test's
 * accelerated clock), so the floor can never make a wait LONGER than asked.
 */
export function jittered(base: number, random: number): number {
	const factor = 1 + POLL_JITTER * (2 * random - 1);
	return Math.max(Math.min(POLL_MIN_WAIT_MS, base), Math.round(base * factor));
}

/** The browser, or a do-nothing environment where there is no document (SSR). */
export function browserPollerEnv(): PollerEnv {
	const hasDocument = typeof document !== 'undefined';
	return {
		now: () => Date.now(),
		random: () => Math.random(),
		setTimeout: (fn, ms) => setTimeout(fn, ms),
		clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
		hidden: () => (hasDocument ? document.hidden : false),
		listen(poke) {
			if (!hasDocument || typeof window === 'undefined') return () => undefined;
			const onVisibility = () => {
				if (!document.hidden) poke();
			};
			document.addEventListener('visibilitychange', onVisibility);
			window.addEventListener('focus', poke);
			return () => {
				document.removeEventListener('visibilitychange', onVisibility);
				window.removeEventListener('focus', poke);
			};
		}
	};
}

export function startPoller(options: PollerOptions): Poller {
	const env = options.env ?? browserPollerEnv();
	let intervalMs = options.intervalMs;
	const pokeGap = () => options.pokeGapMs ?? defaultPokeGapMs(intervalMs);

	let timer: unknown = null;
	let stopped = false;
	let signedOut = false;
	let inFlight = false;
	let failures = 0;
	/**
	 * When the last run STARTED. Before the first it is the moment the poller
	 * started: the page load just handed the widget a fresh answer, so a focus in
	 * the first seconds is not a reason to ask again (and would undo the offset).
	 */
	let lastRunAt: number = env.now();
	/** A tick came due while hidden; the return to the tab owes it. */
	let dueWhileHidden = false;
	/** The session the poller held when it stopped for a signed-out run. */
	let session: string | null = null;
	let sessionAtStop: string | null = null;

	const clear = () => {
		if (timer !== null) env.clearTimeout(timer);
		timer = null;
	};

	const schedule = (ms: number) => {
		clear();
		if (stopped || signedOut) return;
		timer = env.setTimeout(fire, ms);
	};

	function fire() {
		timer = null;
		if (stopped || signedOut || inFlight) return;
		if (env.hidden()) {
			dueWhileHidden = true;
			return;
		}
		void execute();
	}

	async function execute(): Promise<void> {
		clear();
		inFlight = true;
		dueWhileHidden = false;
		lastRunAt = env.now();
		// The session this run's request went out under. A refusal is about THAT
		// session: if a new one arrived while the request was out, the refusal is
		// news about a session already gone, and the poller must not stop on it.
		const startedWith = session;
		let outcome: PollOutcome;
		try {
			outcome = (await options.run()) ?? 'ok';
		} catch (e) {
			outcome = e instanceof PollSignedOut ? 'signed-out' : 'failed';
		}
		inFlight = false;
		if (stopped) return;
		if (
			outcome === 'signed-out' &&
			startedWith !== null &&
			session !== null &&
			session !== startedWith
		) {
			// Refused under the old session, and a new one is already here: ask again
			// on an ordinary backed-off wait rather than stopping.
			outcome = 'failed';
		}
		if (outcome === 'signed-out') {
			signedOut = true;
			// A run that started before the widget learned the session at all is
			// charged to the session it holds now.
			sessionAtStop = startedWith ?? session;
			clear();
			options.onSignedOut?.();
			return;
		}
		failures = outcome === 'failed' ? failures + 1 : 0;
		schedule(jittered(backoffMs(intervalMs, failures), env.random()));
	}

	const poke = () => {
		if (stopped || signedOut || inFlight || env.hidden()) return;
		if (!dueWhileHidden) {
			// A backoff is not cut short by a tab return, and a return within the
			// gap of the last run asks nothing.
			if (failures > 0) return;
			if (env.now() - lastRunAt < pokeGap()) return;
		}
		void execute();
	};

	const runNow = () => {
		if (stopped || signedOut || inFlight) return;
		if (env.hidden()) {
			dueWhileHidden = true;
			return;
		}
		void execute();
	};

	const unlisten = env.listen(poke);

	if (options.immediate) {
		if (env.hidden()) dueWhileHidden = true;
		else void execute();
	} else {
		schedule(Math.max(0, Math.floor(env.random() * intervalMs)));
	}

	return {
		poke,
		runNow,
		stop() {
			stopped = true;
			clear();
			unlisten();
		},
		setIntervalMs(ms: number) {
			if (Number.isFinite(ms) && ms > 0) intervalMs = ms;
		},
		authChanged(next: string | null) {
			session = next;
			if (!signedOut || stopped) return;
			if (next === null || next === sessionAtStop) return;
			signedOut = false;
			failures = 0;
			dueWhileHidden = true;
			poke();
		},
		get signedOut() {
			return signedOut;
		},
		get stopped() {
			return stopped;
		},
		get inFlight() {
			return inFlight;
		},
		get failures() {
			return failures;
		}
	};
}
