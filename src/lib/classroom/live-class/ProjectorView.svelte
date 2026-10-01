<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { laCalendarDay } from '$lib/classroom/school-calendar';
	import { isTypingTarget } from '$lib/shell/keys';
	import {
		clockParts,
		formatReadout,
		tickEachFrame,
		timerFinal,
		timerHoldMs,
		timerOvertime,
		timerPhase,
		timerReadout,
		timerReset,
		timerTicking,
		timerToggle,
		timerWord,
		wallDateLabel,
		TIMER_FINAL_MS,
		type LiveTimer,
		type TimerReadout
	} from './timer';
	import {
		newerFrame,
		openProjectorChannel,
		PROJECTOR_HERE_MS,
		WALL_HALL_GLYPH,
		type ProjectorChannel,
		type ProjectorChannelHost,
		type ProjectorFrame,
		type ProjectorMessage
	} from './projector';

	/**
	 * THE PROJECTOR VIEW: what the class sees on the wall, and nothing else.
	 *
	 * It reads NOTHING private. Its page load carries a class name; everything
	 * else arrives as a `ProjectorFrame` over the same-browser channel from the
	 * teacher's control view, and is re-validated on arrival (`projector.ts`).
	 * So the agenda, the clock, the running timer, the hall pass in student-scope
	 * words and a picked name the teacher chose to show are the WHOLE of what
	 * this page can paint -- there is no roster, presence, grade or email in
	 * reach of it to leak.
	 *
	 * NO CHROME AND NO FLOATING CONTROLS. The page is reset to the root layout
	 * (no classroom masthead), it is in the feedback exclusion registry (so the
	 * report control does not float over it) and in the deploy-safety projector
	 * registry (so a new version never reloads it off the wall). Its own
	 * controls are one strip at the bottom that exists only outside full screen,
	 * and it fades when the pointer is still, so a window dragged onto the wall
	 * without full screen still shows the class nothing to click.
	 *
	 * SIZED BY THE 8H RULE. Text a class reads from the back of a room is at
	 * least 1/50 of the screen's height; every size below is a fraction of the
	 * viewport, so a 1280x800 projector and a 1920x1080 one show the same layout
	 * at the same proportions, and nothing drops below 2vh.
	 *
	 * THE KEYS ARE FOR A MIRRORED DISPLAY, where the teacher cannot reach the
	 * control view without the class watching: Space starts or pauses the timer,
	 * R resets it, F toggles full screen. A change made here is written back as a
	 * newer frame, which the control view adopts, so neither window is the only
	 * one that can run the clock.
	 */
	let {
		classLabel,
		viewer,
		sectionId,
		clock = () => Date.now(),
		channelHost = undefined,
		controls = null
	}: {
		classLabel: string;
		viewer: string;
		sectionId: string;
		clock?: () => number;
		channelHost?: ProjectorChannelHost;
		/** The relocated report control, drawn in the strip (the deck's own arrangement). */
		controls?: Snippet | null;
	} = $props();

	// svelte-ignore state_referenced_locally
	let now = $state(clock());
	$effect(() => {
		const read = clock;
		// A timeout, not an animation frame: a projector window behind another
		// window still keeps time.
		const timer = setInterval(() => (now = read()), 250);
		return () => clearInterval(timer);
	});
	const today = $derived(laCalendarDay(new Date(now)));
	const wallClock = $derived(clockParts(now));
	const dateLabel = $derived(wallDateLabel(now));

	let held = $state<ProjectorFrame | null>(null);
	const frame = $derived(held && held.day === today ? held : null);
	const agenda = $derived(frame?.agenda ?? []);
	const timer = $derived(frame?.timer ?? null);

	/*
	 * THE TIMER'S OWN INSTANT. The page clock above moves four times a second,
	 * which is right for everything else here; the digits read tenths, and
	 * hundredths in a countdown's last ten seconds, so while a timer is COUNTING
	 * a second reading is taken on every frame (`tickEachFrame`: an animation
	 * frame OR a timeout, never a frame alone). The timer reads the later of
	 * the two, so the slow clock carries it whenever the frame loop is off -- a
	 * paused, ready or finished timer runs no loop at all -- and handing over
	 * between them can never step the digits backwards. The digits are derived
	 * from that instant at every paint, never counted by ticks.
	 */
	let frameNow = $state(0);
	const timerNow = $derived(Math.max(now, frameNow));
	const ticking = $derived(timerTicking(timer, timerNow));
	$effect(() => {
		if (!ticking) return;
		// TRACKED: a new timer (a press, in either window) restarts the loop, so
		// its first reading is the next frame rather than the end of a sleep.
		const t = timer;
		const read = clock;
		return tickEachFrame(() => {
			const at = read();
			frameNow = at;
			return t ? timerHoldMs(t, at, 'wall') : undefined;
		});
	});
	const phase = $derived(timer ? timerPhase(timer, timerNow) : null);
	const readout = $derived(timer ? timerReadout(timer, timerNow, 'wall') : null);
	/** The last ten seconds of a countdown that has started: the warn edge, and the beat while it runs. */
	const final = $derived(!!timer && (phase === 'running' || phase === 'paused') && timerFinal(timer, timerNow));
	const word = $derived(timer ? timerWord(timer, timerNow) : '');
	const overtime = $derived(timer ? timerOvertime(timer, timerNow) : null);

	/*
	 * THE DIGITS ARE SIZED ONCE PER TIMER, NOT PER READING. The time column fits
	 * `--chars` monospace cells, the fraction drawn at FRACTION_SCALE of the
	 * whole's size (one number, handed to the stylesheet as `--frac`). Sized off
	 * the current reading, the digits would grow at 9:59 and shrink again at the
	 * switch to hundredths; a countdown is sized by the widest it will read (its
	 * full length, or "0:09.99"), a stopwatch, which grows, by what it reads now.
	 */
	const FRACTION_SCALE = 0.6;
	const cells = (r: TimerReadout) => r.whole.length + r.fraction.length * FRACTION_SCALE;
	function wallCells(t: LiveTimer, current: TimerReadout): number {
		const widths = [cells(current)];
		if (t.mode === 'countdown') {
			widths.push(cells(timerReadout(timerReset(t), 0, 'wall')));
			widths.push(cells(formatReadout(TIMER_FINAL_MS - 10, 'up', 2)));
		}
		return Math.max(4, ...widths);
	}
	const faceCells = $derived(timer && readout ? wallCells(timer, readout) : 4);

	let channel: ProjectorChannel | null = null;
	function onMessage(message: ProjectorMessage) {
		if (message.type === 'frame') held = newerFrame(held, message.frame, laCalendarDay(new Date(clock())));
	}

	onMount(() => {
		channel = openProjectorChannel(viewer, sectionId, onMessage, channelHost);
		held = newerFrame(null, channel.stored(), laCalendarDay(new Date(clock())));
		channel.send({ type: 'hello' });
		const here = setInterval(() => channel?.send({ type: 'here' }), PROJECTOR_HERE_MS);
		return () => {
			clearInterval(here);
			channel?.close();
			channel = null;
		};
	});

	/** Change the timer here and hand the newer frame back to the control view. */
	function changeTimer(action: 'toggle' | 'reset') {
		if (!frame || !frame.timer) return;
		const at = clock();
		const next: ProjectorFrame = {
			...frame,
			at,
			timer: action === 'toggle' ? timerToggle(frame.timer, at) : timerReset(frame.timer)
		};
		held = next;
		channel?.send({ type: 'frame', frame: next });
	}

	// ---------------------------------------------------------------------
	// FULL SCREEN, and the strip that exists only outside it
	// ---------------------------------------------------------------------
	let stage = $state<HTMLElement | null>(null);
	let fullscreen = $state(false);
	let quiet = $state(false);
	let quietTimer: ReturnType<typeof setTimeout> | null = null;

	function wake() {
		quiet = false;
		if (quietTimer) clearTimeout(quietTimer);
		quietTimer = setTimeout(() => (quiet = true), 3000);
	}

	async function toggleFullscreen() {
		if (typeof document === 'undefined') return;
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await (stage ?? document.documentElement).requestFullscreen();
		} catch {
			/* A browser without element full screen keeps the chrome-free page as it is. */
		}
	}

	onMount(() => {
		const onChange = () => (fullscreen = !!document.fullscreenElement);
		const onKey = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			if (e.target && isTypingTarget(e.target as HTMLElement)) return;
			if (e.key === ' ' || e.key === 'Spacebar') {
				if (!timer) return;
				e.preventDefault();
				changeTimer('toggle');
			} else if (e.key === 'r' || e.key === 'R') {
				changeTimer('reset');
			} else if (e.key === 'f' || e.key === 'F') {
				void toggleFullscreen();
			}
		};
		document.addEventListener('fullscreenchange', onChange);
		window.addEventListener('keydown', onKey);
		window.addEventListener('pointermove', wake);
		wake();
		return () => {
			document.removeEventListener('fullscreenchange', onChange);
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointermove', wake);
			if (quietTimer) clearTimeout(quietTimer);
		};
	});
</script>

<svelte:head>
	<title>{classLabel} // Projector</title>
</svelte:head>

<main class="lp-root" data-testid="projector" data-has-agenda={agenda.length > 0} data-has-timer={!!timer}>
	<div class="lp-stage" bind:this={stage}>
		<header class="lp-head">
			<span class="lp-class" data-testid="projector-class">{classLabel}</span>
			<span class="lp-date">{dateLabel}</span>
		</header>

		<div class="lp-body">
			{#if agenda.length > 0}
				<section class="lp-agenda" aria-labelledby="lp-agenda-title" data-testid="projector-agenda">
					<h2 id="lp-agenda-title" class="lp-label">Today</h2>
					<ol class="lp-lines" style="--lines: {Math.max(agenda.length, 4)}">
						{#each agenda as line, i (i)}
							<li class="lp-line" data-testid="projector-agenda-line">{line}</li>
						{/each}
					</ol>
				</section>
			{/if}

			<section class="lp-time" aria-label="Time">
				<p class="lp-clock" data-testid="projector-clock">
					{wallClock.time}<span class="lp-period">{wallClock.period}</span>
				</p>
				{#if timer && readout}
					<div class="lp-timer" data-phase={phase} data-final={final} data-testid="projector-timer">
						<!-- THE BEAT AND THE FINISH. One ring on the timer's edge, drawn
						     as an outline so it never widens the page. In the last ten
						     seconds it is re-made each time the whole second changes, so
						     its pulse lands with the digit; when time is up it bursts
						     once. Both move only under `no-preference`; under reduced
						     motion the ring rests on the edge, still. -->
						{#if final && phase === 'running'}
							{#key readout.whole}
								<span class="lp-ring lp-pulse" aria-hidden="true" data-testid="projector-timer-pulse"></span>
							{/key}
						{:else if phase === 'done'}
							<span class="lp-ring lp-burst" aria-hidden="true" data-testid="projector-timer-burst"></span>
						{/if}
						<span
							class="lp-digits"
							style="--chars: {faceCells}; --frac: {FRACTION_SCALE}"
							data-testid="projector-timer-digits"
							><span class="lp-whole">{readout.whole}</span><span class="lp-frac">{readout.fraction}</span></span
						>
						<span class="lp-word">{word}</span>
						{#if overtime}
							<span class="lp-over">Over by {overtime}</span>
						{/if}
					</div>
				{/if}
				{#if frame?.hallPass}
					<p class="lp-hall" data-tone={frame.hallPass.tone} data-testid="projector-hall">
						<span class="lp-label">Hall pass</span>
						<span class="lp-hall-word">
							<span aria-hidden="true">{WALL_HALL_GLYPH[frame.hallPass.tone]}</span>
							{frame.hallPass.word}
						</span>
					</p>
				{/if}
			</section>

			{#if frame?.pick}
				<section class="lp-pick" aria-label="Random pick" data-testid="projector-pick">
					<p class="lp-label">Random pick</p>
					<p class="lp-pick-name">{frame.pick.name}</p>
					<p class="lp-seed">seed {frame.pick.seed}</p>
				</section>
			{/if}
		</div>
	</div>

	{#if !fullscreen}
		<div class="lp-strip" class:quiet data-testid="projector-strip">
			<button type="button" class="lp-btn" data-testid="projector-fullscreen" onclick={toggleFullscreen}>
				Full screen <kbd>F</kbd>
			</button>
			{#if timer}
				<button type="button" class="lp-btn" onclick={() => changeTimer('toggle')}>
					{phase === 'running' ? 'Pause' : 'Start'} <kbd>Space</kbd>
				</button>
				<button type="button" class="lp-btn" onclick={() => changeTimer('reset')}>
					Reset <kbd>R</kbd>
				</button>
			{/if}
			{#if controls}{@render controls()}{/if}
		</div>
	{/if}
</main>

<style>
	/* THE ROOM. Opaque, above the root layout's scanline overlay, on the site
	   theme's own ground: under Space White this is the white console, under
	   IDEA the dark plate. The canvas mirror below keeps an overscroll or a
	   window resize from flashing the portal's green plate at the edges. */
	.lp-root {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		/* The app shell's global `main` rule caps every page at 880px and pads
		   it; a wall display takes the whole window. */
		max-width: none;
		margin: 0;
		padding: 0;
		background: var(--surface-0);
		color: var(--text-1);
		font-family: var(--font-display);
	}
	:global(body:has(.lp-root)) {
		background: var(--surface-0);
	}
	:global(body:has(.lp-root) .bg-fx) {
		display: none;
	}
	.lp-stage {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		gap: 2.5vh;
		padding: 3vh 3.5vw;
		background: var(--surface-0);
		min-height: 0;
		box-sizing: border-box;
	}
	.lp-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 2vw;
		padding-bottom: 1.5vh;
		border-bottom: 2px solid var(--boundary);
		font-family: var(--font-mono);
		font-size: clamp(1rem, min(3vh, 2vw), 3.5rem);
		color: var(--text-2);
	}
	.lp-class {
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.lp-date {
		flex: none;
	}
	/* THE BODY: the agenda on the left, time on the right; with no agenda the
	   time takes the whole width. A portrait window stacks them. */
	.lp-body {
		flex: 1 1 auto;
		display: grid;
		grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
		grid-template-areas:
			'agenda time'
			'pick time';
		grid-template-rows: auto 1fr;
		gap: 3vh 3vw;
		align-content: start;
		min-height: 0;
	}
	.lp-root[data-has-agenda='false'] .lp-body {
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 'time' 'pick';
		justify-items: center;
	}
	@media (max-aspect-ratio: 1/1) {
		.lp-body,
		.lp-root[data-has-agenda='false'] .lp-body {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'time' 'agenda' 'pick';
		}
	}
	.lp-agenda {
		grid-area: agenda;
		min-width: 0;
	}
	.lp-time {
		grid-area: time;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2vh;
		min-width: 0;
		/* The digits size against this column as well as the screen, so an
		   hour-long stopwatch ("1:02:05") fits beside the agenda. */
		container-type: inline-size;
	}
	.lp-root[data-has-agenda='false'] .lp-time {
		align-items: center;
	}
	.lp-pick {
		grid-area: pick;
		align-self: start;
		min-width: 0;
		padding: 2vh 2vw;
		background: var(--surface-1);
		border: 2px solid var(--boundary);
		border-radius: var(--radius-card);
	}
	/* The shell prefixes every h2 with a green "// "; the wall reads a word. */
	.lp-label::before {
		content: none;
	}
	.lp-label {
		margin: 0 0 1vh;
		font-family: var(--font-mono);
		font-size: clamp(1rem, min(2.6vh, 1.8vw), 3rem);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	/* THE AGENDA SHRINKS WITH ITS LENGTH SO TWELVE LINES STILL FIT THE WALL:
	   about 60% of the height shared between the lines, never above 4vh, and
	   never below the 8H floor (1/50 of the screen height, 2vh) at twelve. */
	.lp-lines {
		margin: 0;
		padding: 0 0 0 1.4em;
		display: flex;
		flex-direction: column;
		gap: 1.2vh;
		font-size: clamp(1.1rem, min(4vh, 2.8vw, calc(58vh / (var(--lines, 4) * 1.5))), 5rem);
		line-height: 1.2;
	}
	.lp-line {
		overflow-wrap: anywhere;
	}
	.lp-line::marker {
		color: var(--text-2);
	}
	.lp-clock {
		margin: 0;
		font-family: var(--font-mono);
		font-size: clamp(2rem, min(11vh, 8vw, 20cqi), 14rem);
		line-height: 1;
		font-variant-numeric: tabular-nums;
		color: var(--text-1);
	}
	.lp-period {
		font-size: 0.35em;
		margin-left: 0.2em;
		color: var(--text-2);
	}
	.lp-timer {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: inherit;
		padding: 1.5vh 2vw;
		border: 3px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
	}
	/* THE LAST TEN SECONDS, STILL: the edge takes the warning ink. With the
	   hundredths appearing beside the seconds it is never colour alone, and it
	   is what reduced motion keeps of the beat below. */
	.lp-timer[data-final='true'] {
		border-color: var(--status-warn);
	}
	.lp-digits {
		font-family: var(--font-mono);
		/* As large as the screen allows (20vh), and never wider than the time
		   column: a mono digit is about 0.55em, so the column holds
		   --chars cells at 90cqi / (chars * 0.55). A fraction digit counts as
		   --frac of a cell, the size it is drawn at. */
		font-size: clamp(3rem, min(20vh, 14vw, calc(90cqi / (var(--chars, 4) * 0.55))), 26rem);
		line-height: 1;
		font-variant-numeric: tabular-nums;
		color: var(--text-1);
		/* A bump scales from the middle, so it grows into the timer's own padding. */
		transform-origin: center;
	}
	.lp-frac {
		font-size: calc(var(--frac, 0.6) * 1em);
	}
	/* THE RING sits exactly on the timer's 3px edge (an outline at offset 0 of
	   the padding box), so at rest it IS the edge. It is an OUTLINE and not a
	   transform or a box: an outline is ink overflow, which never adds to a
	   page's scrollable area, so a pulse at the window's edge cannot make the
	   wall scroll. */
	.lp-ring {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		color: var(--status-warn);
		outline: 3px solid currentColor;
		outline-offset: 0;
		pointer-events: none;
	}
	/* MOTION, AND ONLY UNDER no-preference: outline-offset and opacity on one
	   ring, one bump of the digits' transform when time is up. Nothing loops:
	   the pulse is re-made once a second by the markup, and the burst and the
	   bump run once and rest where the still state rests. */
	@media (prefers-reduced-motion: no-preference) {
		.lp-pulse {
			animation: lp-pulse 900ms ease-out both;
		}
		.lp-burst {
			animation: lp-burst 1400ms ease-out both;
		}
		.lp-timer[data-phase='done'] .lp-digits {
			animation: lp-bump 700ms ease-out both;
		}
	}
	@keyframes lp-pulse {
		from {
			outline-offset: 0;
			opacity: 0.9;
		}
		to {
			outline-offset: 2.5vh;
			opacity: 0;
		}
	}
	@keyframes lp-burst {
		0% {
			outline-offset: 0;
			opacity: 1;
		}
		60% {
			opacity: 0.6;
		}
		100% {
			outline-offset: 6vh;
			opacity: 0;
		}
	}
	@keyframes lp-bump {
		0% {
			transform: scale(1);
		}
		30% {
			transform: scale(1.08);
		}
		100% {
			transform: scale(1);
		}
	}
	.lp-word {
		font-family: var(--font-mono);
		font-size: clamp(1rem, min(3vh, 2vw), 3.5rem);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.lp-timer[data-phase='done'] {
		border-color: var(--status-warn);
		background: var(--status-warn-fill);
	}
	.lp-timer[data-phase='done'] .lp-digits,
	.lp-timer[data-phase='done'] .lp-word {
		color: var(--status-warn);
	}
	.lp-over {
		font-size: clamp(1rem, min(2.6vh, 1.8vw), 3rem);
		color: var(--status-warn);
	}
	.lp-hall {
		display: flex;
		align-items: center;
		gap: 1vw;
		margin: 0;
	}
	.lp-hall .lp-label {
		margin: 0;
	}
	.lp-hall-word {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
		padding: 0.5vh 1vw;
		border: 2px solid var(--boundary);
		border-radius: var(--radius-control);
		font-size: clamp(1.1rem, min(4vh, 2.8vw), 5rem);
		font-weight: 700;
		color: var(--text-1);
	}
	.lp-hall[data-tone='taken'] .lp-hall-word {
		color: var(--status-warn);
		border-color: currentColor;
	}
	.lp-pick-name {
		margin: 0;
		font-size: clamp(1.8rem, min(9vh, 6vw), 11rem);
		font-weight: 700;
		line-height: 1.05;
		overflow-wrap: anywhere;
		color: var(--text-1);
	}
	.lp-seed {
		margin: 1vh 0 0;
		font-family: var(--font-mono);
		font-size: clamp(1rem, min(2.2vh, 1.6vw), 2.5rem);
		color: var(--text-2);
	}
	/* THE STRIP: in the flow, never floating, and absent in full screen. It fades
	   while the pointer is still (the class sees a clean wall) and returns on any
	   movement or when it holds focus; the fade is the only motion and it is
	   gated, so under reduced motion it simply appears and disappears. */
	.lp-strip {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 3.5vw;
		border-top: 1px solid var(--hairline);
		background: var(--surface-0);
	}
	.lp-strip.quiet:not(:focus-within) {
		opacity: 0;
	}
	@media (prefers-reduced-motion: no-preference) {
		.lp-strip {
			transition: opacity 0.3s ease;
		}
	}
	.lp-btn {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		padding: 0 0.9rem;
		background: var(--surface-1);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font: inherit;
		font-size: 0.95rem;
		cursor: pointer;
	}
	.lp-btn kbd {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		padding: 0.05rem 0.35rem;
		border: 1px solid var(--hairline);
		border-radius: 4px;
		color: var(--text-2);
	}
</style>
