<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { laCalendarDay } from '$lib/classroom/school-calendar';
	import { isTypingTarget } from '$lib/shell/keys';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import PlateRing from '$lib/classroom/PlateRing.svelte';
	import WallClock from './WallClock.svelte';
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
		wallRingValue,
		TIMER_FINAL_MS,
		type LiveTimer,
		type TimerReadout
	} from './timer';
	import {
		newerFrame,
		openProjectorChannel,
		PROJECTOR_HERE_MS,
		WALL_ACTIVITY_GROUPS,
		WALL_HALL_GLYPH,
		type ProjectorChannel,
		type ProjectorChannelHost,
		type ProjectorFrame,
		type ProjectorMessage
	} from './projector';
	import { wallFit, WALL_SCALE } from './wall-layout';

	/**
	 * THE PROJECTOR VIEW: what the class sees on the wall, and nothing else.
	 *
	 * It reads NOTHING private. Its page load carries a class name; everything
	 * else arrives as a `ProjectorFrame` over the same-browser channel from the
	 * teacher's control view, and is re-validated on arrival (`projector.ts`).
	 * So the agenda, the clock, the running timer, the hall pass in student-scope
	 * words, a picked name the teacher chose to show, what is coming up, and
	 * student activity as COUNTS when the teacher turned it on (names only on a
	 * second, separate press) are the WHOLE of what this page can paint -- there
	 * is no roster, presence, grade or email in reach of it to leak.
	 *
	 * IT USES THE WHOLE SCREEN (reports R12, R13). The hero is the timer, drawn
	 * as the Plate's progress ring with the digits in its middle, or a large
	 * clock when no timer is set -- or, when the teacher turned it on, the CLOCK
	 * FACE (`WallClock`, idea 26033e4b), an analog dial on the same Plate ring
	 * with the digits under it, only while no timer is up (with a timer, the
	 * ring already means time left, and the time is digits in the side card);
	 * the side is a column of Plate cards fitted to
	 * the box it has (`wallFit`), at the largest size that fits and never below
	 * the 8H floor. The hero's size comes from a container whose size the window
	 * sets, never its contents: the old time column was a shrink-to-fit grid item
	 * that was also its own size container, collapsed to zero width with no
	 * agenda, and drew a 48px timer on a 1440px wall.
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
	 * viewport or of the wall's own container, so a 1280x800 projector and a
	 * 1920x1080 one show the same layout at the same proportions.
	 *
	 * THE KEYS ARE FOR A MIRRORED DISPLAY, where the teacher cannot reach the
	 * control view without the class watching: Space starts or pauses the timer,
	 * R resets it, F toggles full screen. A change made here is written back as a
	 * newer frame, which the control view adopts, so neither window is the only
	 * one that can run the clock. NO KEY HERE TURNS STUDENT ACTIVITY OR NAMES ON:
	 * that is a decision made on the teacher's own screen, never in front of the
	 * class.
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
	/**
	 * THE CLOCK FACE IS ON: the teacher chose it, and the Plate is on (the ring
	 * it is drawn on exists only under the Plate, so the revert constant gives
	 * back the plain clock). It is the hero only while no timer is up, which
	 * `plan.hero` and the template's order already say.
	 */
	const dialOn = $derived(frame?.clockFace === 'dial' && !!CLASSROOM_PLATE);

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
	/** The last ten seconds of a countdown that has started: the warn arc, and the beat while it runs. */
	const final = $derived(!!timer && (phase === 'running' || phase === 'paused') && timerFinal(timer, timerNow));
	const word = $derived(timer ? timerWord(timer, timerNow) : '');
	const overtime = $derived(timer ? timerOvertime(timer, timerNow) : null);
	/**
	 * THE RING'S VALUE MOVES ONCE A SECOND (`wallRingValue` is quantised), and a
	 * derived number only propagates when it changes, so the SVG and its three
	 * blurs repaint once a second while the digits keep their own pace.
	 */
	const ringValue = $derived(timer ? wallRingValue(timer, timerNow) : 0);

	/*
	 * THE DIGITS ARE SIZED ONCE PER TIMER, NOT PER READING. The ring's face fits
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

	// ---------------------------------------------------------------------
	// THE SIDE: which cards, at what size, and anything cut
	// ---------------------------------------------------------------------
	let viewW = $state(0);
	let viewH = $state(0);
	let sideW = $state(0);
	let sideH = $state(0);
	/** The four-times-a-second clock, slowed to whole seconds: what the plan's staleness check needs. */
	const planNow = $derived(Math.floor(now / 1000) * 1000);
	const portrait = $derived(viewW > 0 && viewH > 0 && viewW <= viewH);
	const plan = $derived(
		wallFit(
			frame ?? {
				v: 1,
				day: today,
				at: 0,
				agenda: [],
				timer: null,
				hallPass: null,
				pick: null,
				next: [],
				activity: null,
				clockFace: 'digits'
			},
			planNow,
			{
				// Before the first measurement (and in a server render) the box is
				// estimated from the window; the measured box replaces it at once.
				width: sideW > 0 ? sideW : viewW * 0.42,
				height: sideH > 0 ? sideH : viewH * 0.7,
				viewHeight: viewH,
				portrait
			}
		)
	);
	const activity = $derived(plan.activityLive ? (frame?.activity ?? null) : null);
	const asOf = $derived(activity ? clockParts(activity.at) : null);
	const namedGroups = $derived(
		activity?.names
			? WALL_ACTIVITY_GROUPS.filter(
					(g) => (activity.names?.[g.key]?.length ?? 0) > 0 && !plan.namesDropped.includes(g.key)
				).map((g) => ({
					...g,
					names: (activity.names?.[g.key] ?? []).slice(0, plan.namesShown[g.key] ?? 0),
					more: plan.namesMore[g.key] ?? 0
				}))
			: []
	);

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

<svelte:window bind:innerWidth={viewW} bind:innerHeight={viewH} />

<main
	class="lp-root {CLASSROOM_PLATE}"
	data-testid="projector"
	data-has-agenda={agenda.length > 0}
	data-has-timer={!!timer}
	data-hero={plan.hero}
	data-side-empty={plan.sideEmpty}
>
	<div class="lp-stage" bind:this={stage}>
		<header class="lp-head">
			<span class="lp-class" data-testid="projector-class">{classLabel}</span>
			<span class="lp-date">{dateLabel}</span>
		</header>

		<div class="lp-main">
			<div
				class="lp-body"
				data-hero={plan.hero}
				data-side-empty={plan.sideEmpty}
				data-clock-face={dialOn ? 'dial' : undefined}
			>
				<section class="lp-hero" aria-label="Time">
					{#if timer && readout}
						<div
							class="lp-timer"
							data-phase={phase}
							data-final={final}
							data-mode={timer.mode}
							data-testid="projector-timer"
						>
							<div class="lp-ring-box" data-testid="projector-ring">
								<!-- THE PLATE'S PROGRESS RING IS THE TIMER (R12): how much of
								     the countdown is left, or a stopwatch's sweep of the
								     minute. Decoration (aria-hidden): the digits in its middle
								     are the reading. -->
								<PlateRing value={ringValue} size="var(--lp-ring)" />
								<!-- THE BEAT AND THE FINISH. One ring on the timer's outer
								     edge, drawn as an outline so it never widens the page. In
								     the last ten seconds it is re-made each time the whole
								     second changes, so its pulse lands with the digit; when
								     time is up it bursts once. Both move only under
								     `no-preference`; under reduced motion the ring rests on the
								     edge, still. -->
								{#if final && phase === 'running'}
									{#key readout.whole}
										<span class="lp-ring lp-pulse" aria-hidden="true" data-testid="projector-timer-pulse"></span>
									{/key}
								{:else if phase === 'done'}
									<span class="lp-ring lp-burst" aria-hidden="true" data-testid="projector-timer-burst"></span>
								{/if}
								<!-- The digits are the ring's SIBLINGS, never its children, so
								     with the Plate switched off they still read. -->
								<div class="lp-face">
									<span
										class="lp-digits"
										style="--chars: {faceCells}; --frac: {FRACTION_SCALE}"
										data-testid="projector-timer-digits"
										><span class="lp-whole">{readout.whole}</span><span class="lp-frac">{readout.fraction}</span></span
									>
								</div>
							</div>
							<p class="lp-timer-line">
								<span class="lp-word">{word}</span>
								{#if overtime}
									<span class="lp-over">Over by {overtime}</span>
								{/if}
							</p>
						</div>
					{:else if dialOn}
						<!-- THE CLOCK FACE, when the teacher turned it on: the dial is
						     decoration, the digits under it are the time (and keep the
						     wall's one `projector-clock`). Off the Plate the ring cannot
						     draw, so the plain clock below is the fallback. -->
						<div class="lp-dial-box">
							<WallClock {now} size="var(--lp-dial)" />
							<p class="lp-clock lp-dial-read" data-testid="projector-clock">
								{wallClock.time}<span class="lp-period">{wallClock.period}</span>
							</p>
						</div>
					{:else}
						<p class="lp-clock lp-bigclock" data-testid="projector-clock">
							{wallClock.time}<span class="lp-period">{wallClock.period}</span>
						</p>
					{/if}
				</section>

				{#if !plan.sideEmpty}
					<div
						class="lp-side"
						bind:clientWidth={sideW}
						bind:clientHeight={sideH}
						style="--f: {plan.fontPx}px; --lp-floor: {plan.floorPx}px"
						data-testid="projector-side"
					>
						{#if plan.clock || frame?.hallPass}
							<!-- The clock and the hall pass share one card, side by side:
							     two short facts, one row. -->
							<section class="lc-panel lp-card lp-status" aria-label={plan.clock ? 'Clock and hall pass' : 'Hall pass'}>
								{#if plan.clock}
									<p class="lp-clock" data-testid="projector-clock" style="font-size: {plan.clockPx}px">
										{wallClock.time}<span class="lp-period">{wallClock.period}</span>
									</p>
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
						{/if}
						{#if frame?.pick}
							<section class="lc-panel lp-card lp-pick" aria-label="Random pick" data-testid="projector-pick">
								<p class="lp-pick-head">
									<span class="lp-label">Random pick</span>
									<span class="lp-seed">seed {frame.pick.seed}</span>
								</p>
								<p class="lp-pick-name" style="font-size: {WALL_SCALE.pick}em">{frame.pick.name}</p>
							</section>
						{/if}
						{#if agenda.length > 0}
							<section class="lc-panel lp-card lp-agenda" aria-labelledby="lp-agenda-title" data-testid="projector-agenda">
								<h2 id="lp-agenda-title" class="lp-label">Today</h2>
								<ol class="lp-lines">
									{#each agenda.slice(0, plan.agendaShown) as line, i (i)}
										<li class="lp-line" data-testid="projector-agenda-line">{line}</li>
									{/each}
								</ol>
								{#if plan.agendaMore > 0}
									<p class="lp-more" data-testid="projector-agenda-more">+{plan.agendaMore} more</p>
								{/if}
							</section>
						{/if}
						{#if frame && frame.next.length > 0}
							<section class="lc-panel lp-card lp-next" aria-labelledby="lp-next-title" data-testid="projector-next">
								<h2 id="lp-next-title" class="lp-label">Coming up</h2>
								<ul class="lp-lines">
									{#each frame.next.slice(0, plan.nextShown) as line, i (i)}
										<li class="lp-line" data-testid="projector-next-line">{line}</li>
									{/each}
								</ul>
								{#if plan.nextMore > 0}
									<p class="lp-more" data-testid="projector-next-more">+{plan.nextMore} more</p>
								{/if}
							</section>
						{/if}
						{#if activity}
							<section
								class="lc-panel lp-card lp-activity"
								aria-labelledby="lp-activity-title"
								data-testid="projector-activity"
							>
								<h2 id="lp-activity-title" class="lp-label">Student activity</h2>
								<p class="lp-act-item">
									{activity.item}
									{#if asOf}
										<span class="lp-asof" data-testid="projector-activity-asof">as of {asOf.time} {asOf.period}</span>
									{/if}
								</p>
								<!-- COUNTS, ALWAYS FIVE, IN A FIXED ORDER: a zero is a number the
								     room can read, and the tiles never move under the class's
								     eyes. Each is a recessed tag (inset is not pressable). -->
								<ul class="lp-tiles">
									{#each WALL_ACTIVITY_GROUPS as g (g.key)}
										<li class="lp-tile" data-key={g.key} data-testid="projector-count">
											<span class="lp-count" style="font-size: {WALL_SCALE.count}em">{activity.counts[g.key]}</span>
											<span class="lp-tile-word">{g.word}</span>
										</li>
									{/each}
								</ul>
								<!-- NAMES, ONLY ON THE SECOND TOGGLE: each group's word, then
								     its names on the same flowing line. A group folded away to
								     fit is counted in one "+N more names" line. -->
								{#each namedGroups as g (g.key)}
									<ul
										class="lp-names"
										data-key={g.key}
										data-testid="projector-names"
										aria-label={g.word}
										style="font-size: max(var(--lp-floor), {WALL_SCALE.name}em)"
									>
										<li class="lp-namegroup-word" aria-hidden="true">{g.word}</li>
										{#each g.names as n (n)}
											<li class="lp-name person-name" title={n}>{n}</li>
										{/each}
										{#if g.more > 0}
											<li class="lp-name lp-name-more">+{g.more} more</li>
										{/if}
									</ul>
								{/each}
								{#if plan.namesDroppedCount > 0}
									<p class="lp-more" data-testid="projector-names-folded">+{plan.namesDroppedCount} more names</p>
								{/if}
							</section>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#if !fullscreen}
		<div class="lp-strip" class:quiet data-testid="projector-strip">
			<button type="button" class="btn secondary lp-btn" data-testid="projector-fullscreen" onclick={toggleFullscreen}>
				Full screen <kbd>F</kbd>
			</button>
			{#if timer}
				<button type="button" class="btn secondary lp-btn" onclick={() => changeTimer('toggle')}>
					{phase === 'running' ? 'Pause' : 'Start'} <kbd>Space</kbd>
				</button>
				<button type="button" class="btn secondary lp-btn" onclick={() => changeTimer('reset')}>
					Reset <kbd>R</kbd>
				</button>
			{/if}
			{#if controls}{@render controls()}{/if}
		</div>
	{/if}
</main>

<style>
	/* THE ROOM. Opaque, above the root layout's scanline overlay, on the Plate's
	   own ground (`CLASSROOM_PLATE` on the root, so the classroom's shape
	   language and its theme blocks reach the wall exactly as they reach a
	   class page): under Space White a light machined plate, under IDEA the dark
	   one. The canvas mirror below keeps an overscroll or a window resize from
	   flashing the portal's green plate at the edges. */
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
		background-color: var(--plate-plate-bot, var(--surface-0));
		background-image: linear-gradient(
			to bottom,
			var(--plate-page-top, var(--surface-0)),
			var(--plate-page-bot, var(--surface-0))
		);
		color: var(--text-1);
		font-family: var(--font-display);
		/* The 8H floor, before the side's own plan sets it: 1/50 of the height. */
		--lp-floor: 2.05vh;
		/* The timer's word under the ring, and what the hero keeps for it. */
		--lp-word: clamp(1rem, 3.4vh, 3.6rem);
	}
	/* A LANDSCAPE WINDOW IS A WALL, AND A WALL IS EXACTLY ONE SCREEN: the stage
	   takes the window's height, so the hero's container has a definite size.
	   A portrait window stacks and may scroll (a phone is not a wall). */
	@media (min-aspect-ratio: 1/1) {
		.lp-root {
			height: 100dvh;
		}
	}
	:global(body:has(.lp-root)) {
		background: var(--plate-plate-bot, var(--surface-0));
	}
	:global(body:has(.lp-root) .bg-fx) {
		display: none;
	}
	.lp-stage {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		gap: 2vh;
		padding: 2.5vh 3vw;
		min-height: 0;
		box-sizing: border-box;
	}
	.lp-head {
		flex: none;
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 2vw;
		padding-bottom: 1.2vh;
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
	/* THE WALL'S CONTAINER. Its size is the window's, after the header: a
	   flex item that grows into a definite height, so `container-type: size`
	   has a size to report and nothing inside can collapse it. Every hero size
	   below is a fraction of THIS box (cqw, cqh), never of a shrink-to-fit
	   parent. */
	.lp-main {
		flex: 1 1 0;
		min-height: 0;
		min-width: 0;
		container-type: size;
	}
	.lp-body {
		height: 100%;
		display: grid;
		gap: 0 3cqw;
		grid-template-rows: minmax(0, 1fr);
		/* The ring is as large as the box allows, leaving the one line under it
		   (the word, and the overtime beside it) its room. */
		--lp-ring: min(56cqw, calc(100cqh - var(--lp-word) * 1.9));
		grid-template-columns: calc(var(--lp-ring) + 1cqw) minmax(0, 1fr);
	}
	.lp-body[data-hero='clock'] {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	}
	.lp-body[data-side-empty='true'] {
		grid-template-columns: minmax(0, 1fr);
	}
	@media (max-aspect-ratio: 1/1) {
		.lp-main {
			flex: 1 1 auto;
			container-type: inline-size;
		}
		.lp-body,
		.lp-body[data-hero='clock'],
		.lp-body[data-side-empty='true'] {
			height: auto;
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto auto;
			gap: 3vh 0;
			--lp-ring: min(86cqw, 60vh);
		}
	}
	/* THE CLOCK FACE'S OWN SIZE (`--lp-dial`), never a re-pointed `--lp-ring`:
	   the dial leaves room under it for the digits, and the rules that size it
	   are scoped by the window's shape so a higher-specificity selector here
	   cannot override the portrait stack or the one-column side-empty wall.
	   Every rule keys on `data-clock-face='dial'`, which is written only when
	   the face is on, so with it off the wall's markup and styles are the
	   digits wall exactly. */
	.lp-body[data-clock-face='dial'] {
		--lp-dial-read: clamp(1.5rem, 7cqh, 6rem);
	}
	@media (min-aspect-ratio: 1/1) {
		.lp-body[data-hero='clock'][data-clock-face='dial'] {
			--lp-dial: min(56cqw, calc(100cqh - var(--lp-dial-read) * 1.6));
		}
		.lp-body[data-hero='clock'][data-clock-face='dial']:not([data-side-empty='true']) {
			grid-template-columns: calc(var(--lp-dial) + 1cqw) minmax(0, 1fr);
		}
		.lp-body[data-hero='clock'][data-clock-face='dial'][data-side-empty='true'] {
			--lp-dial: min(90cqw, calc(100cqh - var(--lp-dial-read) * 1.6));
		}
	}
	@media (max-aspect-ratio: 1/1) {
		.lp-body[data-clock-face='dial'] {
			--lp-dial: min(86cqw, 60vh);
		}
	}
	.lp-hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: 0;
		min-height: 0;
	}

	/* --- The timer: the ring, the digits in its middle, the word under it. --- */
	.lp-timer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6vh;
		/* THE TRACK ON THE WALL IS ONE FLAT TONE, the darker on a dark theme and
		   the lighter on Space White, so the arc that says how much time is left
		   stands off it as a projector boundary (2:1 washed, measured): the
		   Plate's two-tone track puts the green arc against its own lighter stop
		   on a dark plate and its darker one on a light plate. `--lp-rest` is
		   computed HERE, where the theme's value resolves, and handed to the ring
		   below as a plain colour. */
		--lp-rest: var(--plate-ring-rest-b);
	}
	:global(:root[data-theme='space-white']) .lp-timer {
		--lp-rest: var(--plate-ring-rest-a);
	}
	/* THE LAST TEN SECONDS, STILL: the arc takes the warning ink. With the
	   hundredths appearing beside the seconds it is never colour alone, and it
	   is what reduced motion keeps of the beat below. */
	.lp-timer[data-final='true'] {
		--plate-ring-value: var(--status-warn);
		--plate-ring-bloom: transparent;
	}
	/* TIME IS UP: the arc is empty, so the whole track takes the warning ink,
	   beside the words "Time is up". */
	.lp-timer[data-phase='done'] {
		--lp-rest: var(--status-warn);
	}
	.lp-ring-box {
		position: relative;
		flex: none;
		width: var(--lp-ring);
		height: var(--lp-ring);
		--plate-ring-rest-a: var(--lp-rest);
		--plate-ring-rest-b: var(--lp-rest);
	}
	/* The digits sit INSIDE the ring's glowing segments (radius 47 of 100),
	   centred, so a light digit never crosses a light segment. */
	.lp-face {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		pointer-events: none;
		/* The digits change ten times a second and the ring under them is an
		   SVG with three blurs that changes once. Its own layer means a new
		   digit repaints the digits, never the blurred ring beneath them, which
		   is the cost an old school desktop would feel. */
		will-change: transform;
	}
	.lp-digits {
		font-family: var(--font-mono);
		/* As large as the ring's face allows: a mono cell is 0.54em (measured),
		   and the digits span at most 42% of the ring, which keeps them inside
		   the glowing segments at every reading. A fraction digit counts as
		   --frac of a cell, the size it is drawn at. */
		font-size: min(calc(var(--lp-ring) * 0.42 / (var(--chars, 4) * 0.54)), calc(var(--lp-ring) * 0.2));
		line-height: 1;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: var(--text-1);
		/* A bump scales from the middle. */
		transform-origin: center;
	}
	.lp-frac {
		font-size: calc(var(--frac, 0.6) * 1em);
	}
	/* THE RING sits on the Plate ring's outer edge (radius 96 of 100), so at
	   rest it IS that edge. It is an OUTLINE and not a transform or a box: an
	   outline is ink overflow, which never adds to a page's scrollable area, so
	   a pulse at the window's edge cannot make the wall scroll. */
	.lp-ring {
		position: absolute;
		inset: 2%;
		border-radius: 50%;
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
	.lp-timer-line {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: baseline;
		gap: 0 1.2em;
		margin: 0;
		font-size: var(--lp-word);
	}
	.lp-word {
		font-family: var(--font-mono);
		font-size: var(--lp-word);
		line-height: 1.2;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.lp-timer[data-phase='done'] .lp-word,
	.lp-timer[data-final='true'] .lp-word {
		color: var(--status-warn);
	}
	.lp-over {
		font-family: var(--font-mono);
		font-size: var(--lp-word);
		line-height: 1.2;
		color: var(--status-warn);
	}

	/* --- The clock: the hero when no timer is set, a card beside one. --- */
	.lp-clock {
		margin: 0;
		font-family: var(--font-mono);
		line-height: 1;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: var(--text-1);
	}
	.lp-bigclock {
		font-size: min(36cqh, 15cqw);
	}
	.lp-body[data-side-empty='true'] .lp-bigclock {
		font-size: min(44cqh, 28cqw);
	}
	@media (max-aspect-ratio: 1/1) {
		.lp-bigclock,
		.lp-body[data-side-empty='true'] .lp-bigclock {
			font-size: min(30cqw, 24vh);
		}
	}
	.lp-dial-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(var(--lp-dial-read) * 0.3);
		min-width: 0;
	}
	.lp-dial-read {
		font-size: var(--lp-dial-read);
	}
	.lp-period {
		font-size: max(var(--lp-floor), 0.35em);
		margin-left: 0.2em;
		color: var(--text-2);
	}

	/* --- The side: Plate cards, sized by the plan (`--f`). --- */
	/* The cards sit in the middle of the side, level with the ring, so a short
	   column reads as one group rather than a list hanging from the header. */
	.lp-side {
		display: flex;
		flex-direction: column;
		/* `safe`: a column that does not fit starts at its top rather than
		   spilling over the header, which plain centring would do. */
		justify-content: safe center;
		gap: calc(var(--f, 2.4vh) * 0.5);
		min-width: 0;
		min-height: 0;
		font-size: var(--f, 2.4vh);
		line-height: 1.25;
	}
	@media (max-aspect-ratio: 1/1) {
		.lp-side {
			min-height: auto;
		}
	}
	.lp-card {
		flex: none;
		min-width: 0;
		margin: 0;
		padding: calc(var(--f, 2.4vh) * 0.45) calc(var(--f, 2.4vh) * 0.8);
		background: var(--surface-1);
		border: 2px solid var(--boundary);
		border-radius: var(--radius-card);
		box-sizing: border-box;
	}
	/* The shell prefixes every h2 with a green "// "; the wall reads a word. */
	.lp-label::before {
		content: none;
	}
	.lp-label {
		margin: 0 0 calc(var(--f, 2.4vh) * 0.25);
		font-family: var(--font-mono);
		font-size: max(var(--lp-floor), 0.72em);
		font-weight: 400;
		line-height: 1.2;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.lp-lines {
		margin: 0;
		padding: 0 0 0 1.4em;
		display: flex;
		flex-direction: column;
		gap: calc(var(--f, 2.4vh) * 0.25);
		line-height: 1.25;
	}
	.lp-next .lp-lines {
		list-style: square;
	}
	.lp-line {
		overflow-wrap: anywhere;
	}
	.lp-line::marker {
		color: var(--text-2);
	}
	.lp-more {
		margin: calc(var(--f, 2.4vh) * 0.25) 0 0;
		font-family: var(--font-mono);
		font-size: max(var(--lp-floor), 0.8em);
		color: var(--text-2);
	}
	.lp-status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: calc(var(--f, 2.4vh) * 0.3) calc(var(--f, 2.4vh) * 1.2);
	}
	.lp-status .lp-clock {
		line-height: 1.1;
	}
	.lp-hall {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.3em 1em;
		margin: 0;
		flex: 1 1 auto;
	}
	.lp-status .lp-clock + .lp-hall {
		flex: 0 1 auto;
	}
	.lp-hall .lp-label {
		margin: 0;
	}
	.lp-hall-word {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
		padding: 0.1em 0.6em;
		border: 2px solid var(--boundary);
		border-radius: var(--radius-control);
		font-weight: 700;
		color: var(--text-1);
	}
	.lp-hall[data-tone='taken'] .lp-hall-word {
		color: var(--status-warn);
		border-color: currentColor;
	}
	.lp-pick-name {
		margin: 0;
		font-weight: 700;
		line-height: 1.1;
		overflow-wrap: break-word;
		color: var(--text-1);
	}
	.lp-pick-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0 1em;
		margin: 0 0 calc(var(--f, 2.4vh) * 0.15);
	}
	.lp-pick-head .lp-label {
		margin: 0;
	}
	.lp-seed {
		margin: 0;
		font-family: var(--font-mono);
		font-size: max(var(--lp-floor), 0.72em);
		line-height: 1.2;
		color: var(--text-2);
	}

	/* --- Student activity: five recessed counts, and names when asked. --- */
	.lp-act-item {
		margin: 0 0 calc(var(--f, 2.4vh) * 0.25);
		overflow-wrap: anywhere;
		color: var(--text-1);
	}
	.lp-asof {
		margin-left: 0.5em;
		font-family: var(--font-mono);
		font-size: max(var(--lp-floor), 0.72em);
		line-height: 1.2;
		white-space: nowrap;
		color: var(--text-2);
	}
	.lp-tiles {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: calc(var(--f, 2.4vh) * 0.4);
	}
	/* A COUNT IS A RECESSED TAG, set into the card: a face a shade darker than
	   the card, a shadow under its top lip, a light lip at its foot, and no
	   drop shadow (raised means pressable, inset means not). The background
	   colour is the face the numeral reads worst against. */
	.lp-tile {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 3.2em;
		padding: calc(var(--f, 2.4vh) * 0.2) calc(var(--f, 2.4vh) * 0.5);
		background-color: var(--plate-chip-ground, var(--surface-2));
		background-image: linear-gradient(
			to bottom,
			var(--plate-chip-top, var(--surface-2)),
			var(--plate-chip-bot, var(--surface-2))
		);
		border: 1px solid var(--plate-chip-edge, var(--boundary));
		border-radius: var(--plate-r-pad, var(--radius-control));
		box-shadow:
			inset 0 2px 2px -1px var(--plate-chip-shade, transparent),
			0 1px 0 0 var(--plate-chip-lip, transparent);
	}
	.lp-count {
		font-family: var(--font-mono);
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
		color: var(--text-1);
	}
	.lp-tile-word {
		font-size: max(var(--lp-floor), 0.72em);
		line-height: 1.2;
		color: var(--text-2);
	}
	.lp-names {
		list-style: none;
		margin: calc(var(--f, 2.4vh) * 0.25) 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 0.9em;
		line-height: 1.25;
	}
	.lp-namegroup-word {
		font-family: var(--font-mono);
		font-size: max(var(--lp-floor), 0.8em);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
		color: var(--text-2);
	}
	.lp-name {
		max-width: 100%;
		white-space: nowrap;
		color: var(--text-1);
	}
	.lp-name-more {
		color: var(--text-2);
	}

	/* THE STRIP: in the flow, never floating, and absent in full screen. It fades
	   while the pointer is still (the class sees a clean wall) and returns on any
	   movement or when it holds focus; the fade is the only motion and it is
	   gated, so under reduced motion it simply appears and disappears. Its
	   buttons are the Plate's keys (`.btn`). */
	.lp-strip {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 3vw;
		border-top: 1px solid var(--hairline);
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
		gap: 0.5rem;
		padding: 0 0.9rem;
		font-size: 0.8rem;
	}
	.lp-btn kbd {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.05rem 0.35rem;
		border: 1px solid var(--hairline);
		border-radius: 4px;
		color: var(--text-2);
		text-transform: none;
		letter-spacing: 0;
	}
</style>
