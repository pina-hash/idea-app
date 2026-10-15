<script lang="ts">
	/**
	 * THE TRAINING VIDEO PLAYER (ledger 0391, docs/CERTIFICATIONS.md "Video
	 * watch tracking", DECISIONS D11). One embedded YouTube player whose every
	 * second of real playback is counted, speed-capped at 2x, with random
	 * Continue check-ins, reporting what it saw to whoever mounted it.
	 *
	 * WHAT IS HERE AND WHAT IS NOT. This file owns the iframe, the one-second
	 * tick, the overlays and the markup. Every DECISION (which seconds count,
	 * when a check-in opens, what a missed one costs, how a seek or a fast rate
	 * is handled, what a report carries) is `WatchTracker` in `./tracker.ts`,
	 * which is pure and tested at a pinned clock. A rule found wrong is fixed
	 * there, never here.
	 *
	 * THE IFRAME PLAYER API, ON THE NOCOOKIE HOST. The player is built with
	 * `new YT.Player(host, { host: 'https://www.youtube-nocookie.com', ... })`
	 * so the clock can be read; the host element is created HERE, imperatively,
	 * because the API REPLACES the element it is given with the iframe, and a
	 * node Svelte bound would then be a node Svelte no longer owns. The iframe
	 * gets `referrerpolicy="strict-origin-when-cross-origin"`: YouTube answers
	 * error 153 to a player that sends no referrer at all, and the origin is
	 * all it is handed (the classroom's embedded player, HtmlAssignmentFrame,
	 * found this first).
	 *
	 * THE TICK IS A `setTimeout` CHAIN, NEVER requestAnimationFrame. A hidden
	 * tab never ticks rAF, and a student who switches tabs while the audio
	 * plays would stop being credited while the video kept playing (CLAUDE.md,
	 * "Schedule on rAF-OR-TIMEOUT, never rAF alone"). Nothing on the teardown
	 * path uses a frame either (the AppStage rule).
	 *
	 * THE CHECK-IN IS PARENT CHROME: a band laid over the player with a worded
	 * 44px Continue key, never a dialog, so it works on a phone and never
	 * fights the player's own full screen. While it is up the video is paused
	 * and nothing is credited; a seek past it is seeked back; unanswered past
	 * the settings' timeout it counts as missed and crediting stays stopped
	 * until Continue is pressed.
	 *
	 * `onsession` FIRES ON PAUSE, ON END, EVERY 60 SECONDS OF PLAY, ON A MISSED
	 * CHECK-IN, ON `pagehide` AND ON TEARDOWN, carrying the merged ranges of the
	 * whole watch (the server merges; a repeat costs nothing) and the figures
	 * since the last report. `onprogress` fires every tick with the covered
	 * seconds. Both are called from the tick or an event handler, never from a
	 * tracked `$effect` (the injected-callback rule).
	 *
	 * NO NETWORK IN THE HARNESS: `createPlayer` is the one injection, and the
	 * `FakePlayer` beside this file is what `/dev/cert-watch` and `tests/dom`
	 * hand it. With no factory, and no API script within `apiTimeoutMs` (the
	 * browser-verify harness blocks every non-loopback request), the player
	 * renders the worded "did not load" state with a Reload key; the harness
	 * measures exactly that state.
	 *
	 * THE DEPLOY RELOAD IS HELD WHILE THE VIDEO PLAYS (`holdDeployReload`), so
	 * a navigation during a watch keeps the tab's build rather than restarting
	 * the player mid-video.
	 */
	import { onDestroy, onMount } from 'svelte';
	import Pending from '$lib/Pending.svelte';
	import { holdDeployReload } from '$lib/shell/deploy-safety';
	import { WATCH_RULES_SENTENCE } from '../copy';
	import { CHECKIN_KEY_WORD, CHECKIN_MISSED_SENTENCE, CHECKIN_PROMPT } from './checkins';
	import { coveragePercentWords, WATCH_COVERAGE, WATCH_MAX_RATE, type Range } from './ranges';
	import { RATE_BLOCKED_SENTENCE, WatchTracker, type TrackerAction, type WatchProgress, type WatchSession } from './tracker';
	import {
		loadYouTubeIframeApi,
		PLAYER_ERROR_SENTENCE,
		PLAYER_FAILED_SENTENCE,
		resetYouTubeIframeApi,
		YOUTUBE_NOCOOKIE_HOST,
		YT_STATE,
		type YTPlayer,
		type YTPlayerEvents
	} from './youtube-api';

	export type PlayerFactory = (host: HTMLElement, events: YTPlayerEvents) => YTPlayer | Promise<YTPlayer>;

	let {
		videoId,
		start = 0,
		title,
		itemKey,
		checkinTimeoutSeconds,
		onsession = null,
		onprogress = null,
		priorCoverage = null,
		priorRanges = null,
		showRules = true,
		createPlayer = null,
		tickMs = 1000,
		apiTimeoutMs = 8000,
		sessionEveryMs = 60_000,
		now = () => Date.now(),
		scheduleNext = null
	}: {
		/** The 11-character id. The caller normalizes it (`normalizeYouTubeId`). */
		videoId: string;
		/** A whole second to begin at. */
		start?: number;
		title: string;
		/** `yt:<id>`, the key progress is saved under. */
		itemKey: string;
		/** `cert_settings.checkin_timeout_seconds`. */
		checkinTimeoutSeconds: number;
		onsession?: ((s: WatchSession) => void | Promise<void>) | null;
		onprogress?: ((p: WatchProgress) => void) | null;
		/** The coverage the server already holds (0..1), so a resumed watch's bar starts honest. */
		priorCoverage?: number | null;
		/** Stored ranges, when the caller has them; seeds the tracker. */
		priorRanges?: Range[] | null;
		/** Render the rules sentence under the bar. A caller that renders it itself passes false. */
		showRules?: boolean;
		/** A harness's or a test's player. Production passes nothing and the API is loaded. */
		createPlayer?: PlayerFactory | null;
		/** The poll period. 1000 in production; a test shortens it. */
		tickMs?: number;
		/** How long the API script may take before the "did not load" state. */
		apiTimeoutMs?: number;
		/** How often `onsession` fires during continuous play. */
		sessionEveryMs?: number;
		/** The clock, for a test. */
		now?: () => number;
		/** The check-in schedule, for a harness. Defaults to the random 3 to 8 minute rule. */
		scheduleNext?: ((playedSeconds: number) => number) | null;
	} = $props();

	type Phase = 'loading' | 'ready' | 'failed';

	let phase = $state<Phase>('loading');
	let errorCode = $state<number | null>(null);
	let playing = $state(false);
	let checkinOpen = $state(false);
	let missed = $state(false);
	let rateNotice = $state(false);
	let progress = $state<WatchProgress>({ covered: 0, duration: 0, coverage: 0 });

	const shownCoverage = $derived(Math.max(priorCoverage ?? 0, progress.coverage));
	const pct = $derived(Math.floor(Math.min(1, Math.max(0, shownCoverage)) * 100));
	const complete = $derived(shownCoverage >= WATCH_COVERAGE);

	let stageEl = $state<HTMLElement | null>(null);

	/* Everything below is plain state the tick and the handlers own; none of
	   it renders, so none of it needs to be reactive. */
	let tracker: WatchTracker | null = null;
	let player: YTPlayer | null = null;
	let hostEl: HTMLElement | null = null;
	let destroyed = false;
	let tickHandle: ReturnType<typeof setTimeout> | null = null;
	let checkinTimer: ReturnType<typeof setTimeout> | null = null;
	let releaseHold: (() => void) | null = null;
	let lastSessionAt = 0;
	let bootId = 0;

	function makeTracker(): WatchTracker {
		const t = new WatchTracker({
			itemKey,
			checkinTimeoutSeconds,
			pollSeconds: tickMs / 1000,
			now,
			scheduleNext: scheduleNext ?? undefined
		});
		if (priorRanges && priorRanges.length) t.seed(priorRanges);
		return t;
	}

	function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('timed out')), ms);
			p.then(
				(v) => {
					clearTimeout(timer);
					resolve(v);
				},
				(e) => {
					clearTimeout(timer);
					reject(e);
				}
			);
		});
	}

	function safe<T>(read: () => T, fallback: T): T {
		try {
			return read();
		} catch {
			return fallback;
		}
	}

	function hold() {
		if (!releaseHold) releaseHold = holdDeployReload('a training video is playing');
	}
	function unhold() {
		releaseHold?.();
		releaseHold = null;
	}

	function stopTick() {
		if (tickHandle !== null) clearTimeout(tickHandle);
		tickHandle = null;
	}
	function scheduleTick() {
		stopTick();
		if (destroyed) return;
		tickHandle = setTimeout(tick, tickMs);
	}

	function publishProgress() {
		if (!tracker) return;
		progress = tracker.progress();
		onprogress?.(progress);
	}

	function sendSession() {
		if (!tracker) return;
		const s = tracker.report();
		lastSessionAt = now();
		if (!s) return;
		try {
			void onsession?.(s);
		} catch {
			// Instrumentation never reaches the viewer.
		}
	}

	function carryOut(actions: TrackerAction[]) {
		for (const a of actions) {
			if (a.kind === 'checkin') openCheckin();
			else if (a.kind === 'seek-back') {
				safe(() => player?.seekTo(a.to, true), undefined);
				safe(() => player?.pauseVideo(), undefined);
			} else if (a.kind === 'rate-blocked') blockRate();
			else if (a.kind === 'missed') {
				missed = true;
				sendSession();
			}
		}
	}

	function openCheckin() {
		checkinOpen = true;
		missed = false;
		safe(() => player?.pauseVideo(), undefined);
		if (checkinTimer !== null) clearTimeout(checkinTimer);
		// The timeout is judged by the tracker from its clock; this timer only
		// makes sure a PAUSED player (which ticks nothing) still gets asked.
		checkinTimer = setTimeout(
			() => {
				checkinTimer = null;
				if (destroyed || !tracker || !player) return;
				carryOut(tracker.sample(safe(() => player!.getCurrentTime(), 0), safe(() => player!.getPlaybackRate(), 1), safe(() => player!.getDuration(), 0)));
			},
			Math.max(1, checkinTimeoutSeconds) * 1000 + 50
		);
	}

	function answerCheckin() {
		if (!tracker) return;
		if (checkinTimer !== null) clearTimeout(checkinTimer);
		checkinTimer = null;
		tracker.answerCheckin();
		checkinOpen = false;
		missed = false;
		safe(() => player?.playVideo(), undefined);
	}

	function blockRate() {
		rateNotice = true;
		safe(() => player?.setPlaybackRate(WATCH_MAX_RATE), undefined);
		safe(() => player?.pauseVideo(), undefined);
	}

	function tick() {
		tickHandle = null;
		if (destroyed || !player || !tracker) return;
		const state = safe(() => player!.getPlayerState(), YT_STATE.PAUSED);
		if (state !== YT_STATE.PLAYING) {
			playing = false;
			unhold();
			return;
		}
		const t = safe(() => player!.getCurrentTime(), NaN);
		const rate = safe(() => player!.getPlaybackRate(), 1);
		const dur = safe(() => player!.getDuration(), 0);
		carryOut(tracker.sample(t, rate, dur));
		publishProgress();
		if (now() - lastSessionAt >= sessionEveryMs) sendSession();
		scheduleTick();
	}

	function onStateChange(state: number) {
		if (destroyed || !player || !tracker) return;
		if (state === YT_STATE.PLAYING) {
			playing = true;
			hold();
			if (tickHandle === null) scheduleTick();
			return;
		}
		// Paused, ended, buffering, cued: the current range ends at the clock
		// as it stands, and the tick stops until the next PLAYING.
		stopTick();
		playing = false;
		unhold();
		const t = safe(() => player!.getCurrentTime(), NaN);
		carryOut(tracker.stop(t, safe(() => player!.getPlaybackRate(), 1), safe(() => player!.getDuration(), 0)));
		publishProgress();
		if (state === YT_STATE.PAUSED || state === YT_STATE.ENDED) sendSession();
	}

	const events: YTPlayerEvents = {
		onReady: () => {
			if (destroyed) return;
			phase = 'ready';
			tracker?.setDuration(safe(() => player?.getDuration() ?? 0, 0));
			publishProgress();
		},
		onStateChange: (e) => onStateChange(e.data),
		onPlaybackRateChange: (e) => {
			if (destroyed || !tracker) return;
			if (tracker.blockRate(e.data)) blockRate();
		},
		onError: (e) => {
			if (destroyed) return;
			errorCode = e.data;
			phase = 'failed';
		}
	};

	async function boot() {
		const id = ++bootId;
		phase = 'loading';
		errorCode = null;
		const stage = stageEl;
		if (!stage) return;
		if (hostEl) hostEl.remove();
		hostEl = document.createElement('div');
		hostEl.className = 'ytp-host';
		stage.appendChild(hostEl);
		tracker = tracker ?? makeTracker();
		try {
			if (createPlayer) {
				player = await createPlayer(hostEl, events);
			} else {
				const yt = await withTimeout(loadYouTubeIframeApi(), apiTimeoutMs);
				if (destroyed || id !== bootId) return;
				const vars: Record<string, string | number> = {
					enablejsapi: 1,
					origin: location.origin,
					rel: 0,
					playsinline: 1,
					modestbranding: 1
				};
				if (Number.isFinite(start) && start > 0) vars.start = Math.floor(start);
				player = new yt.Player(hostEl, {
					host: YOUTUBE_NOCOOKIE_HOST,
					videoId,
					width: '100%',
					height: '100%',
					playerVars: vars,
					events
				});
				safe(() => player?.getIframe()?.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin'), undefined);
				safe(() => player?.getIframe()?.setAttribute('title', title), undefined);
			}
			if (destroyed || id !== bootId) {
				safe(() => player?.destroy(), undefined);
				return;
			}
		} catch {
			if (destroyed || id !== bootId) return;
			phase = 'failed';
		}
	}

	function retry() {
		safe(() => player?.destroy(), undefined);
		player = null;
		resetYouTubeIframeApi();
		void boot();
	}

	function onPageHide() {
		// A closing tab runs no teardown: this is the last chance to report.
		if (!tracker) return;
		const t = safe(() => player?.getCurrentTime() ?? NaN, NaN);
		if (player && Number.isFinite(t)) tracker.stop(t, safe(() => player!.getPlaybackRate(), 1), safe(() => player!.getDuration(), 0));
		sendSession();
	}
	function onVisibility() {
		if (document.visibilityState === 'hidden' && tracker?.dirty) sendSession();
	}

	onMount(() => {
		lastSessionAt = now();
		void boot();
		window.addEventListener('pagehide', onPageHide);
		document.addEventListener('visibilitychange', onVisibility);
	});

	onDestroy(() => {
		if (destroyed) return;
		destroyed = true;
		stopTick();
		if (checkinTimer !== null) clearTimeout(checkinTimer);
		checkinTimer = null;
		if (typeof window !== 'undefined') {
			window.removeEventListener('pagehide', onPageHide);
			document.removeEventListener('visibilitychange', onVisibility);
		}
		if (tracker && player) {
			const t = safe(() => player!.getCurrentTime(), NaN);
			if (Number.isFinite(t)) tracker.stop(t, safe(() => player!.getPlaybackRate(), 1), safe(() => player!.getDuration(), 0));
		}
		sendSession();
		unhold();
		safe(() => player?.destroy(), undefined);
		player = null;
		hostEl?.remove();
		hostEl = null;
	});
</script>

<div class="ytp" data-testid="cert-player" data-phase={phase} data-playing={playing ? 'yes' : 'no'} data-checkin={checkinOpen ? (missed ? 'missed' : 'open') : 'none'}>
	<div class="ytp-stage" bind:this={stageEl} aria-busy={phase === 'loading'}>
		{#if phase === 'loading'}
			<div class="ytp-overlay ytp-placeholder" data-testid="cert-player-loading">
				<Pending label="Loading the player" />
			</div>
		{:else if phase === 'failed'}
			<div class="ytp-overlay ytp-failed" role="status" data-testid="cert-player-failed">
				<p class="ytp-words">
					{#if errorCode !== null}{PLAYER_ERROR_SENTENCE} (YouTube error {errorCode}.){:else}{PLAYER_FAILED_SENTENCE}{/if}
				</p>
				<button type="button" class="btn cert-btn" onclick={retry} data-testid="cert-player-reload">Reload the player</button>
			</div>
		{/if}
		{#if checkinOpen}
			<div class="ytp-overlay ytp-band" role="group" aria-label="Continue check" data-testid="cert-player-checkin" data-missed={missed ? 'yes' : 'no'}>
				<p class="ytp-words">{missed ? CHECKIN_MISSED_SENTENCE : CHECKIN_PROMPT}</p>
				<button type="button" class="btn cert-btn ytp-continue" onclick={answerCheckin} data-testid="cert-player-continue">{CHECKIN_KEY_WORD}</button>
			</div>
		{:else if rateNotice}
			<div class="ytp-overlay ytp-band ytp-band-notice" role="status" data-testid="cert-player-rate">
				<p class="ytp-words">{RATE_BLOCKED_SENTENCE}</p>
				<button type="button" class="btn cert-btn secondary" onclick={() => (rateNotice = false)} data-testid="cert-player-rate-ok">Got it</button>
			</div>
		{/if}
	</div>
	<div class="ytp-coverage" data-testid="cert-player-coverage" data-complete={complete ? 'yes' : 'no'}>
		<div class="ytp-bar" role="progressbar" aria-label="Played" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
			<div class="ytp-bar-fill" style="width: {pct}%"></div>
		</div>
		<p class="ytp-coverage-words" data-testid="cert-player-coverage-words">
			{coveragePercentWords(shownCoverage)}{#if complete}. Counts as watched.{:else if progress.duration > 0} of {Math.round(progress.duration / 60)} minutes.{/if}
		</p>
	</div>
	{#if showRules}
		<p class="cert-help ytp-rules">{WATCH_RULES_SENTENCE}</p>
	{/if}
</div>

<style>
	.ytp {
		display: grid;
		gap: 0.5rem;
	}
	/* The player's box keeps a 16:9 shape and the iframe the API inserts (a
	   node this component does not render, hence :global) fills it. */
	.ytp-stage {
		position: relative;
		aspect-ratio: 16 / 9;
		width: 100%;
		background: var(--surface-0, var(--bg0));
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 8px);
		overflow: hidden;
	}
	.ytp-stage :global(iframe),
	.ytp-stage :global(.ytp-host) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}
	.ytp-overlay {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem;
		text-align: center;
	}
	.ytp-placeholder {
		background: var(--surface-0, var(--bg0));
	}
	.ytp-failed,
	.ytp-band {
		/* Near-opaque: the words take the room's own ink over the room's own
		   ground, so their contrast is the room's and not a composite over
		   whatever frame the video stopped on. */
		background: color-mix(in srgb, var(--surface-0, var(--bg0)) 94%, transparent);
		color: var(--text-1);
	}
	.ytp-words {
		margin: 0;
		max-width: 32rem;
		line-height: 1.45;
		font-size: 1rem;
	}
	.ytp-continue {
		min-width: 10rem;
		font-size: 1.05rem;
	}
	.ytp-coverage {
		display: grid;
		gap: 0.3rem;
	}
	.ytp-bar {
		height: 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: 999px;
		background: var(--surface-0, var(--bg0));
		overflow: hidden;
	}
	.ytp-bar-fill {
		height: 100%;
		background: var(--green);
		border-radius: inherit;
	}
	.ytp-coverage-words {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.04em;
		color: var(--text-2);
	}
	.ytp-rules {
		margin: 0;
	}
</style>
