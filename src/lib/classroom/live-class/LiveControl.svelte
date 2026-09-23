<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import HallPass from '$lib/classroom/HallPass.svelte';
	import LiveGrid from './LiveGrid.svelte';
	import {
		addAgendaLine,
		agendaLines,
		agendaStorageKey,
		derivedAgenda,
		moveAgendaLine,
		readAgendaStore,
		removeAgendaLine,
		toggleAgendaLine,
		wallAgenda,
		writeAgendaStore,
		AGENDA_MAX_CHARS,
		AGENDA_MAX_TYPED,
		EMPTY_AGENDA,
		type AgendaStore
	} from './agenda';
	import {
		clockParts,
		countdown,
		parseTimerMinutes,
		stopwatch,
		timerDigits,
		timerExtend,
		timerOvertime,
		timerPhase,
		timerReset,
		timerToggle,
		timerWord,
		THINK_TIME_MINUTES,
		TIMER_PRESET_MINUTES,
		type LiveTimer
	} from './timer';
	import {
		liveCells,
		liveItemChoices,
		nextArrivals,
		presentEmails,
		type LivePresenceStatus
	} from './grid';
	import {
		buildProjectorFrame,
		hallPassWall,
		openProjectorChannel,
		PROJECTOR_GONE_MS,
		WALL_HALL_GLYPH,
		type ProjectorChannel,
		type ProjectorChannelHost,
		type ProjectorMessage,
		type WallPick
	} from './projector';
	import { pickerOne, pickerPool, pickerSeedFrom, pickerSeedLabel } from '$lib/classroom/picker';
	import { PRESENCE_POLL_MS, type PresencePayload } from '$lib/classroom/presence/state';
	import type { PresenceTransports } from '$lib/classroom/presence/transports';
	import { GRADING_POLL_MS, type ClassroomLive } from '$lib/classroom/live';
	import { CLASSROOM_LIVE_DEBOUNCE_MS, type HallPassState, type HallPassTransports } from '$lib/classroom/hall-pass';
	import { registerCommandHandler } from '$lib/shell/command-handlers';
	import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
	import type { ClassroomEnrollment, ClassroomItem, ClassroomSection, TxResult } from '$lib/classroom/classroom';
	import type { GradingData } from '$lib/classroom/assignment-spec';

	/**
	 * THE TEACHER AT THE FRONT OF THE ROOM (ledger 0297, package LIVE): the
	 * private control view for one class.
	 *
	 * Mr. Pina's task, verbatim from the audit: "put today's agenda on the
	 * projector with a 10-minute timer, see who has not opened the current
	 * assignment and who has gone idle, and send one student on a hall pass,
	 * without the class seeing anything private." Every panel here is one clause
	 * of that sentence, and the projector view is the other half of it.
	 *
	 * PRIVATE AND PROJECTED ARE TWO WINDOWS, NEVER ONE WINDOW WITH A MODE. This
	 * view holds the roster, presence, hand-ins and the hall pass as a manager
	 * sees it, and it shows them. What the class sees is a SECOND page
	 * (`ProjectorView`) that reads nothing private and paints only a
	 * `ProjectorFrame`, which this view builds through `buildProjectorFrame` --
	 * the one function that decides what may reach the wall -- and sends over a
	 * same-browser channel whenever something that frame carries changes.
	 *
	 * ONE CLOCK FOR THE SCREEN. `clock` is read on a short interval into `now`,
	 * and the timer, the wall clock, the hall pass's elapsed label and the grid
	 * all take that one value, so nothing in one paint disagrees about the time.
	 *
	 * EVERY SERVER CALL IS INJECTED. The route hands in the hall-pass, presence
	 * and grading transports and the live notice bus; the harness hands in
	 * memory twins. An omitted one removes what it drives: no presence transport,
	 * every student reads "Not known"; no grading read, no hand-in states.
	 */
	let {
		section,
		viewer,
		today,
		items,
		checkIns,
		roster,
		hallPass,
		hallPassTransports = null,
		live = null,
		presence = null,
		loadGrading = null,
		projectorHref,
		peopleHref = null,
		gradeHrefFor = null,
		initialItemId = null,
		clock = () => Date.now(),
		storage = undefined,
		channelHost = undefined,
		random = Math.random
	}: {
		section: ClassroomSection;
		/** The signed-in teacher's id: this device's slots are per viewer. */
		viewer: string;
		/** The loader's school day (America/Los_Angeles), YYYY-MM-DD. */
		today: string;
		items: ClassroomItem[];
		checkIns: ClassCheckIn[];
		/** The section's roster, managers still in it: `splitRoster` drops them downstream. */
		roster: ClassroomEnrollment[];
		/** The layout's hall-pass state (manager scope), or null where 0143 is absent. */
		hallPass: HallPassState | null;
		hallPassTransports?: HallPassTransports | null;
		live?: ClassroomLive | null;
		presence?: PresenceTransports | null;
		loadGrading?: ((itemId: string, sectionId: string) => Promise<TxResult<GradingData>>) | null;
		/** The projector page for this class. */
		projectorHref: string;
		/** The People tab, which is the picker's and the teams' first-class home. */
		peopleHref?: string | null;
		gradeHrefFor?: ((itemId: string) => string) | null;
		/** An item to watch first (the class page's Live door names one). */
		initialItemId?: string | null;
		clock?: () => number;
		/** Where the agenda lines are kept; undefined means this browser's `localStorage`. */
		storage?: Storage | null;
		channelHost?: ProjectorChannelHost;
		/** Entropy for the picker's seed; the harness pins it. */
		random?: () => number;
	} = $props();

	// ---------------------------------------------------------------------
	// THE ONE CLOCK
	// ---------------------------------------------------------------------
	// svelte-ignore state_referenced_locally
	let now = $state(clock());
	$effect(() => {
		const read = clock;
		// rAF-or-timeout, never rAF alone: a backgrounded window never ticks an
		// animation frame, and a projector control left behind the wall must not
		// stop keeping time.
		const timer = setInterval(() => (now = read()), 250);
		return () => clearInterval(timer);
	});
	const wallClock = $derived(clockParts(now));
	/**
	 * A SLOWER READ OF THE SAME CLOCK for what only moves by the minute (which
	 * items are live, today's agenda). A derived number only propagates when it
	 * CHANGES, so the chooser and the agenda re-derive every fifteen seconds
	 * rather than four times a second -- and the polling effect keyed on the
	 * chosen item is not re-run by a tick.
	 */
	const slowNow = $derived(Math.floor(now / 15_000) * 15_000);

	// ---------------------------------------------------------------------
	// THE TIMER
	// ---------------------------------------------------------------------
	let timer = $state<LiveTimer | null>(null);
	let customMinutes = $state<string | number>('');
	const customLength = $derived(parseTimerMinutes(customMinutes));
	const phase = $derived(timer ? timerPhase(timer, now) : null);

	function setTimer(next: LiveTimer | null) {
		timer = next;
	}
	function startPreset(minutes: number) {
		setTimer(countdown(minutes, clock()));
	}
	function startCustom(event: SubmitEvent) {
		event.preventDefault();
		if (customLength === null) return;
		setTimer(countdown(customLength, clock()));
	}
	function toggleTimer() {
		if (!timer) return;
		setTimer(timerToggle(timer, clock()));
	}
	function resetTimer() {
		if (!timer) return;
		setTimer(timerReset(timer));
	}
	function extendTimer() {
		if (!timer) return;
		setTimer(timerExtend(timer, clock()));
	}
	function toggleLabel(t: LiveTimer): string {
		const p = timerPhase(t, now);
		if (p === 'running') return 'Pause';
		if (p === 'paused') return 'Resume';
		if (p === 'done') return 'Restart';
		return 'Start';
	}

	// ---------------------------------------------------------------------
	// THE AGENDA
	// ---------------------------------------------------------------------
	const agendaKey = $derived(agendaStorageKey(viewer, section.id, today));
	let agenda = $state<AgendaStore>(EMPTY_AGENDA);
	let agendaKept = $state(true);
	let draftLine = $state('');
	const todayLines = $derived(derivedAgenda(items, checkIns, today, slowNow));
	const lines = $derived(agendaLines(todayLines, agenda));

	function localStore(): Storage | null {
		if (storage !== undefined) return storage;
		try {
			return typeof window === 'undefined' ? null : window.localStorage;
		} catch {
			return null;
		}
	}
	function saveAgenda(next: AgendaStore) {
		agenda = next;
		agendaKept = writeAgendaStore(localStore(), agendaKey, next);
	}
	function addLine(event: SubmitEvent) {
		event.preventDefault();
		const next = addAgendaLine(agenda, draftLine);
		if (next === agenda) return;
		saveAgenda(next);
		draftLine = '';
	}

	// ---------------------------------------------------------------------
	// THE HALL PASS, as the teacher sees it, and as the wall may say it
	// ---------------------------------------------------------------------
	// svelte-ignore state_referenced_locally
	let hallState = $state<HallPassState | null>(hallPass);
	/**
	 * THE WALL LEARNS WHAT THE PASS LEARNS, BY WATCHING ITS OWN READ. Every
	 * change the pass component makes or hears about ends in `load()` (its poll,
	 * its live notice, and the refresh after every open and close), so wrapping
	 * that one call keeps this view's copy exactly as fresh as the card's --
	 * with no second poll of the same RPC and no change to the component.
	 */
	const observedHallPass = $derived<HallPassTransports | null>(
		hallPassTransports
			? {
					...hallPassTransports,
					load: async (sectionId: string) => {
						const next = await hallPassTransports.load(sectionId);
						if (next) hallState = next;
						return next;
					}
				}
			: null
	);
	const wallHall = $derived(hallPassWall(hallState));

	// ---------------------------------------------------------------------
	// WHO IS WORKING
	// ---------------------------------------------------------------------
	const choices = $derived(liveItemChoices(items, slowNow, today));
	let pickedItemId = $state<string | null>(null);
	const chosenId = $derived(
		pickedItemId && choices.some((c) => c.id === pickedItemId)
			? pickedItemId
			: initialItemId && choices.some((c) => c.id === initialItemId)
				? initialItemId
				: (choices[0]?.id ?? null)
	);
	const chosen = $derived(choices.find((c) => c.id === chosenId) ?? null);
	/** A primitive, so an effect keyed on it re-runs only when it changes. */
	const chosenSignal = $derived(chosen?.signal ?? false);
	const chosenItem = $derived(items.find((i) => i.id === chosenId) ?? null);

	let presenceData = $state<PresencePayload | null>(null);
	let presenceStatus = $state<LivePresenceStatus>('pending');
	let arrivals = $state<Map<string, number>>(new Map());
	let previousPresent: Set<string> | null = null;
	let grading = $state<GradingData | null>(null);
	let gradingLoading = $state(false);
	/** The grid's instant: moved by every read and every fifteen seconds, not four times a second. */
	// svelte-ignore state_referenced_locally
	let gridNow = $state(clock());

	async function refreshPresence(itemId: string, signal: boolean) {
		const t = presence;
		if (!t || !signal) {
			presenceStatus = t ? 'ready' : 'unavailable';
			return;
		}
		try {
			const payload = await t.loadPresence(itemId, section.id);
			if (itemId !== chosenId) return;
			if (payload === null) {
				presenceData = null;
				presenceStatus = 'unavailable';
				return;
			}
			const at = clock();
			const present = presentEmails(payload, at);
			arrivals = nextArrivals(previousPresent, arrivals, present, at);
			previousPresent = present;
			presenceData = payload;
			presenceStatus = 'ready';
			gridNow = at;
		} catch {
			// Best effort by contract: keep what is on screen, and SAY it may be old.
			if (itemId === chosenId) presenceStatus = presenceData ? 'stale' : 'unavailable';
		}
	}

	async function refreshGrading(itemId: string) {
		const read = loadGrading;
		if (!read) return;
		gradingLoading = true;
		try {
			const res = await read(itemId, section.id);
			if (itemId !== chosenId) return;
			if (res.ok) grading = res.data;
		} catch {
			/* The poll is the floor; the next one tries again. */
		} finally {
			gradingLoading = false;
			gridNow = clock();
		}
	}

	$effect(() => {
		// TRACKED: the item is what a fresh read is FOR. Everything else happens
		// in a microtask, outside this effect's tracking and after the render
		// settles, so the reset and the reads cannot become its dependencies.
		const itemId = chosenId;
		const signal = chosenSignal;
		queueMicrotask(() => {
			presenceData = null;
			presenceStatus = 'pending';
			arrivals = new Map();
			previousPresent = null;
			grading = null;
			if (!itemId) return;
			void refreshPresence(itemId, signal);
			void refreshGrading(itemId);
		});
		if (!itemId) return;
		const tick = () => {
			if (typeof document !== 'undefined' && document.hidden) return;
			void refreshPresence(itemId, signal);
		};
		const presenceTimer = setInterval(tick, PRESENCE_POLL_MS);
		const gradingTimer = setInterval(() => {
			if (typeof document !== 'undefined' && document.hidden) return;
			void refreshGrading(itemId);
		}, GRADING_POLL_MS);
		const ageTimer = setInterval(() => (gridNow = clock()), 15_000);
		const onVisible = () => {
			if (!document.hidden) {
				void refreshPresence(itemId, signal);
				void refreshGrading(itemId);
			}
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(presenceTimer);
			clearInterval(gradingTimer);
			clearInterval(ageTimer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	// THE LIVE NOTICES make a sitting-down or a hand-in immediate; the polls above
	// stay as the floor (live.ts's own rule).
	$effect(() => {
		const bus = live;
		const itemId = chosenId;
		const signal = chosenSignal;
		if (!bus || !itemId) return;
		let debounce: ReturnType<typeof setTimeout> | null = null;
		const unsubscribe = untrack(() =>
			bus.subscribe(section.id, (topic) => {
				if (topic !== 'presence' && topic !== 'responses') return;
				if (debounce) clearTimeout(debounce);
				debounce = setTimeout(() => {
					debounce = null;
					if (topic === 'presence') void refreshPresence(itemId, signal);
					else void refreshGrading(itemId);
				}, CLASSROOM_LIVE_DEBOUNCE_MS);
			})
		);
		return () => {
			if (debounce) clearTimeout(debounce);
			unsubscribe();
		};
	});

	const cells = $derived(
		liveCells({
			item: chosenItem,
			signal: chosenSignal,
			grading,
			roster,
			presence: presenceData,
			presenceStatus,
			now: gridNow,
			arrivals
		})
	);

	// ---------------------------------------------------------------------
	// THE PICKER: warm call, from whoever is here
	// ---------------------------------------------------------------------
	let poolMode = $state<'present' | 'everyone'>('present');
	const outEmail = $derived(hallState?.scope === 'manager' ? (hallState.open?.student_email ?? null) : null);
	const presentPeople = $derived(cells.filter((c) => c.present).map((c) => ({ email: c.email, name: c.name })));
	const everyone = $derived(cells.map((c) => ({ email: c.email, name: c.name })));
	const mode = $derived(poolMode === 'present' && presentPeople.length > 0 ? 'present' : 'everyone');
	const pool = $derived(
		pickerPool(mode === 'present' ? presentPeople : everyone, new Set(outEmail ? [outEmail] : []))
	);
	let drawn = $state<WallPick | null>(null);
	let shownPick = $state<WallPick | null>(null);

	function pick() {
		const seed = pickerSeedFrom(random());
		const one = pickerOne(pool.included, seed);
		drawn = one ? { name: one.name, seed: pickerSeedLabel(seed) } : null;
	}
	function showPick() {
		if (drawn) shownPick = drawn;
	}
	function clearPick() {
		shownPick = null;
	}
	function thinkTime() {
		setTimer(countdown(THINK_TIME_MINUTES, clock(), true, 'think'));
	}

	// ---------------------------------------------------------------------
	// THE WALL: one frame, sent when something it carries changes
	// ---------------------------------------------------------------------
	let channel: ProjectorChannel | null = null;
	let lastSentKey = '';
	let lastSentAt = 0;
	let lastHere = $state(0);
	const onWall = $derived(lastHere > 0 && now - lastHere < PROJECTOR_GONE_MS);
	const wallInput = $derived({
		agenda: wallAgenda(lines),
		timer,
		hallPass: hallState,
		pick: shownPick
	});

	function sendFrame(force = false) {
		if (!channel) return;
		const input = wallInput;
		const frame = buildProjectorFrame({ day: today, at: clock(), ...input });
		const key = JSON.stringify({ ...frame, at: 0 });
		if (!force && key === lastSentKey) return;
		lastSentKey = key;
		lastSentAt = frame.at;
		channel.send({ type: 'frame', frame });
	}

	$effect(() => {
		void wallInput;
		untrack(() => sendFrame());
	});

	function onMessage(message: ProjectorMessage) {
		if (message.type === 'hello') {
			lastHere = clock();
			sendFrame(true);
		} else if (message.type === 'here') {
			lastHere = clock();
		} else if (message.type === 'frame') {
			// The projector's own keyboard (a mirrored display, where reaching this
			// view would put it on the wall) changes the TIMER and only the timer.
			const f = message.frame;
			if (f.day === today && f.at > lastSentAt) {
				lastSentAt = f.at;
				timer = f.timer;
			}
		}
	}

	onMount(() => {
		agenda = readAgendaStore(localStore(), agendaKey);
		channel = openProjectorChannel(viewer, section.id, onMessage, channelHost);
		// A reload in the middle of a period keeps the running timer and the name
		// on the wall: they are the stored frame, and the stored frame is today's.
		const stored = channel.stored();
		if (stored && stored.day === today) {
			timer = stored.timer;
			shownPick = stored.pick;
			lastSentAt = stored.at;
		}
		sendFrame(true);
		return () => {
			channel?.close();
			channel = null;
		};
	});

	/**
	 * THE PROJECTOR OPENS AS ITS OWN WINDOW, so it can be dragged onto the wall
	 * display while this one stays on the laptop. The window is NAMED per class,
	 * so a second press brings the same window forward rather than opening a
	 * second projector. When the browser refuses a pop-up, the link's own
	 * `target` opens a tab instead, which is the mirrored-display path.
	 */
	function openProjector(event?: MouseEvent) {
		if (typeof window === 'undefined') return;
		const w = window.open(projectorHref, projectorWindowName, 'popup=yes,width=1280,height=800');
		if (w) {
			event?.preventDefault();
			w.focus?.();
		}
	}
	const projectorWindowName = $derived(`idea-projector-${section.id}`);

	$effect(() => {
		const offs = [
			registerCommandHandler('live.projector', () => openProjector()),
			registerCommandHandler('live.timer', () => (timer ? toggleTimer() : startPreset(10))),
			registerCommandHandler('live.pick', () => pick())
		];
		return () => offs.forEach((off) => off());
	});
</script>

<div class="classroom-page lc-root" data-testid="live-control">
	<header class="lc-head">
		<h1 class="lc-title">Live class</h1>
		<p class="lc-clock" data-testid="live-clock" aria-label="Time now">
			{wallClock.time}<span class="lc-period">{wallClock.period}</span>
		</p>
		<span class="lc-wall-state" data-on={onWall} data-testid="live-projector-state">
			<span class="lc-dot" aria-hidden="true">{onWall ? '●' : '○'}</span>
			{onWall ? 'Projector showing' : 'Projector closed'}
		</span>
		<a
			class="btn lc-open"
			href={projectorHref}
			target={projectorWindowName}
			data-testid="live-open-projector"
			onclick={(e) => openProjector(e)}
		>
			Open projector view
		</a>
	</header>

	<div class="lc-cols">
		<div class="lc-side">
			<section class="lc-panel" aria-labelledby="lc-timer-title" data-testid="live-timer">
				<h2 id="lc-timer-title" class="lc-panel-title">Timer</h2>
				{#if timer}
					<div class="lc-readout" data-phase={phase} data-testid="live-timer-readout">
						<span class="lc-digits">{timerDigits(timer, now)}</span>
						<span class="lc-word">{timerWord(timer, now)}</span>
						{#if timerOvertime(timer, now)}
							<span class="lc-over">Over by {timerOvertime(timer, now)}</span>
						{/if}
					</div>
					<div class="lc-row">
						<button type="button" class="btn" data-testid="live-timer-toggle" onclick={toggleTimer}>
							{toggleLabel(timer)}
						</button>
						<button type="button" class="btn secondary" data-testid="live-timer-reset" onclick={resetTimer}>
							Reset
						</button>
						{#if timer.mode === 'countdown'}
							<button type="button" class="btn secondary" data-testid="live-timer-extend" onclick={extendTimer}>
								+1 min
							</button>
						{/if}
						<button type="button" class="btn secondary" data-testid="live-timer-clear" onclick={() => setTimer(null)}>
							Clear
						</button>
					</div>
				{/if}
				<div class="lc-row" role="group" aria-label="Start a timer">
					{#each TIMER_PRESET_MINUTES as m (m)}
						<button
							type="button"
							class="btn secondary lc-preset"
							data-testid="live-preset-{m}"
							onclick={() => startPreset(m)}
						>
							{m} min
						</button>
					{/each}
					<button type="button" class="btn secondary" data-testid="live-stopwatch" onclick={() => setTimer(stopwatch(clock()))}>
						Stopwatch
					</button>
				</div>
				<form class="lc-row lc-custom" onsubmit={startCustom}>
					<label class="lc-field">
						<span class="lc-field-label">Minutes</span>
						<input
							type="text"
							inputmode="decimal"
							autocomplete="off"
							placeholder="7:30"
							bind:value={customMinutes}
							data-testid="live-custom-minutes"
						/>
					</label>
					<button type="submit" class="btn" aria-disabled={customLength === null} data-testid="live-custom-start">
						Start
					</button>
				</form>
			</section>

			{#if hallState}
				<section class="lc-panel" aria-labelledby="lc-hall-title" data-testid="live-hall">
					<h2 id="lc-hall-title" class="lc-panel-title">Hall pass</h2>
					<div class="lc-hall-row">
						<HallPass
							sectionId={section.id}
							state={hallState}
							transports={observedHallPass}
							now={now}
							{live}
							tool
						/>
					</div>
					{#if wallHall}
						<p class="lc-wall-line" data-testid="live-hall-wall">
							<span class="lc-wall-tag">On the wall</span>
							<span class="lc-wall-chip" data-tone={wallHall.tone}>
								<span aria-hidden="true">{WALL_HALL_GLYPH[wallHall.tone]}</span>
								{wallHall.word}
							</span>
						</p>
					{/if}
				</section>
			{/if}

			<section class="lc-panel" aria-labelledby="lc-agenda-title" data-testid="live-agenda">
				<h2 id="lc-agenda-title" class="lc-panel-title">
					Today
					{#if !agendaKept}
						<span class="lc-chip-quiet" data-testid="live-agenda-unkept">This page only</span>
					{/if}
				</h2>
				{#if lines.length > 0}
					<ol class="lc-lines">
						{#each lines as line (line.key)}
							<li class="lc-line" data-on-wall={line.onWall} data-testid="live-agenda-line">
								<span class="lc-line-text">
									{line.text}{#if line.when}<span class="lc-line-when">{line.when}</span>{/if}
								</span>
								<span class="lc-line-actions">
									<button
										type="button"
										class="lc-mini"
										aria-pressed={line.onWall}
										data-testid="live-agenda-toggle"
										onclick={() => saveAgenda(toggleAgendaLine(agenda, line))}
									>
										<span aria-hidden="true">{line.onWall ? '●' : '○'}</span>
										{line.onWall ? 'Shown' : 'Hidden'}
									</button>
									{#if line.source === 'typed'}
										<button
											type="button"
											class="lc-mini"
											aria-label="Move up: {line.text}"
											onclick={() => saveAgenda(moveAgendaLine(agenda, line.key, -1))}
										>
											Up
										</button>
										<button
											type="button"
											class="lc-mini"
											data-testid="live-agenda-remove"
											aria-label="Remove: {line.text}"
											onclick={() => saveAgenda(removeAgendaLine(agenda, line.key))}
										>
											Remove
										</button>
									{/if}
								</span>
							</li>
						{/each}
					</ol>
				{/if}
				{#if agenda.typed.length < AGENDA_MAX_TYPED}
					<form class="lc-row lc-add" onsubmit={addLine}>
						<label class="lc-field lc-grow">
							<span class="lc-field-label">Add a line</span>
							<input
								type="text"
								maxlength={AGENDA_MAX_CHARS}
								autocomplete="off"
								bind:value={draftLine}
								data-testid="live-agenda-input"
							/>
						</label>
						<button type="submit" class="btn" aria-disabled={!draftLine.trim()} data-testid="live-agenda-add">
							Add
						</button>
					</form>
				{/if}
			</section>
		</div>

		<div class="lc-main">
			<section class="lc-panel" data-testid="live-work">
				<LiveGrid
					{cells}
					{choices}
					{chosenId}
					{presenceStatus}
					loading={gradingLoading || presenceStatus === 'pending'}
					gradeHref={chosen?.signal && gradeHrefFor && chosenId ? gradeHrefFor(chosenId) : null}
					onchoose={(id) => (pickedItemId = id)}
				/>
			</section>

			<section class="lc-panel" aria-labelledby="lc-pick-title" data-testid="live-picker">
				<h2 id="lc-pick-title" class="lc-panel-title">Random pick</h2>
				<div class="lc-row" role="group" aria-label="Draw from">
					<button
						type="button"
						class="lc-seg"
						aria-pressed={mode === 'present'}
						aria-disabled={presentPeople.length === 0}
						data-testid="live-pool-present"
						onclick={() => (poolMode = 'present')}
					>
						On the page <span class="lc-count">{presentPeople.length}</span>
					</button>
					<button
						type="button"
						class="lc-seg"
						aria-pressed={mode === 'everyone'}
						data-testid="live-pool-everyone"
						onclick={() => (poolMode = 'everyone')}
					>
						Everyone <span class="lc-count">{everyone.length}</span>
					</button>
				</div>
				<div class="lc-row">
					<button type="button" class="btn secondary" data-testid="live-think" onclick={thinkTime}>
						Think time {THINK_TIME_MINUTES} min
					</button>
					<button
						type="button"
						class="btn"
						aria-disabled={pool.included.length === 0}
						data-testid="live-pick"
						onclick={pick}
					>
						{drawn ? 'Pick again' : 'Pick'}
					</button>
				</div>
				{#if drawn}
					<div class="lc-drawn" data-testid="live-drawn">
						<span class="lc-drawn-name">{drawn.name}</span>
						<span class="lc-seed">seed {drawn.seed}</span>
						{#if shownPick && shownPick.name === drawn.name && shownPick.seed === drawn.seed}
							<button type="button" class="btn secondary" data-testid="live-pick-hide" onclick={clearPick}>
								Take off the wall
							</button>
						{:else}
							<button type="button" class="btn" data-testid="live-pick-show" onclick={showPick}>
								Show on the wall
							</button>
						{/if}
					</div>
				{:else if shownPick}
					<div class="lc-drawn">
						<span class="lc-drawn-name">{shownPick.name}</span>
						<button type="button" class="btn secondary" data-testid="live-pick-hide" onclick={clearPick}>
							Take off the wall
						</button>
					</div>
				{/if}
				{#if peopleHref}
					<a class="lc-link" href={peopleHref} data-testid="live-people-link">Teams and the full picker</a>
				{/if}
			</section>
		</div>
	</div>
</div>

<style>
	/* THE MEASURE IS THE SPLIT'S: `classroomMeasure` answers `split` for `live`,
	   so the trail and tabs sit on the line this page does. */
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-split));
		margin: 0 auto;
		/* 6rem at the foot: the floating report control sits over the last
		   ~64px of the window, and the pick controls are the last row. */
		padding: 0 var(--cr-gutter, 1rem) 6rem;
	}
	.lc-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		margin: 0 0 var(--space-4);
	}
	.lc-title {
		margin: 0;
		font-size: 1.5rem;
		line-height: 1.2;
		flex: 1 1 auto;
	}
	.lc-clock {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 1.6rem;
		line-height: 1;
		color: var(--text-1);
		font-variant-numeric: tabular-nums;
	}
	.lc-period {
		font-size: 0.8rem;
		margin-left: 0.25rem;
		color: var(--text-2);
	}
	.lc-wall-state {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.lc-wall-state[data-on='true'] .lc-dot {
		color: var(--status-ok);
	}
	.lc-open {
		flex: none;
	}
	/* TWO COLUMNS ABOVE 1024px, each a stack: the tools a teacher presses on the
	   left, the class on the right. Two independent stacks rather than a grid,
	   so a tall grid of names never stretches the timer's row. */
	.lc-cols {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.lc-side,
	.lc-main {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	@media (min-width: 1024px) {
		.lc-cols {
			flex-direction: row;
			align-items: flex-start;
		}
		.lc-side {
			flex: 0 0 24rem;
		}
		.lc-main {
			flex: 1 1 auto;
		}
	}
	.lc-panel {
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		padding: var(--space-4);
		min-width: 0;
	}
	.lc-panel-title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		font-size: 1.15rem;
		line-height: 1.3;
	}
	.lc-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.lc-row :global(.btn) {
		padding-inline: 0.9rem;
	}
	.lc-readout {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem var(--space-3);
	}
	.lc-digits {
		font-family: var(--font-mono);
		font-size: 3rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		color: var(--text-1);
	}
	.lc-word {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.lc-readout[data-phase='done'] .lc-digits,
	.lc-readout[data-phase='done'] .lc-word {
		color: var(--status-warn);
	}
	.lc-over {
		flex-basis: 100%;
		color: var(--status-warn);
		font-size: 0.9rem;
	}
	.lc-field {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.lc-grow {
		flex: 1 1 12rem;
	}
	.lc-field-label {
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--text-2);
	}
	.lc-field input {
		min-height: 44px;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		background: var(--surface-2);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font: inherit;
		padding: 0 0.6rem;
	}
	.lc-custom .lc-field {
		width: 7rem;
	}
	.lc-hall-row {
		display: flex;
		min-width: 0;
	}
	.lc-hall-row > :global(*) {
		flex: 1 1 auto;
		min-width: 0;
	}
	.lc-wall-line {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: var(--space-3) 0 0;
	}
	.lc-wall-tag {
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--text-2);
	}
	.lc-wall-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.15rem 0.55rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-chip);
		color: var(--text-1);
	}
	.lc-wall-chip[data-tone='taken'] {
		color: var(--status-warn);
		border-color: currentColor;
	}
	.lc-chip-quiet {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--status-warn);
		border: 1px solid currentColor;
		border-radius: var(--radius-chip);
		padding: 0.05rem 0.4rem;
	}
	.lc-lines {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.lc-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1) var(--space-2);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--hairline);
		min-width: 0;
	}
	.lc-line[data-on-wall='false'] .lc-line-text {
		color: var(--text-2);
	}
	.lc-line-text {
		flex: 1 1 10rem;
		min-width: 0;
		overflow-wrap: anywhere;
		color: var(--text-1);
	}
	.lc-line-when {
		margin-left: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.lc-line-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.lc-mini,
	.lc-seg {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		padding: 0 0.7rem;
		background: var(--surface-2);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font: inherit;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.lc-mini[aria-pressed='true'],
	.lc-seg[aria-pressed='true'] {
		border-color: var(--accent-ink);
		box-shadow: inset 0 -3px 0 var(--accent-ink);
	}
	.lc-seg[aria-disabled='true'] {
		color: var(--text-2);
		cursor: not-allowed;
	}
	.lc-count {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		min-width: 1.4em;
		padding: 0.05rem 0.35rem;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		text-align: center;
		color: var(--text-2);
	}
	.lc-drawn {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin-top: var(--space-3);
		padding: var(--space-3);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
	}
	.lc-drawn-name {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text-1);
		flex: 1 1 auto;
	}
	.lc-seed {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.lc-link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-top: var(--space-2);
	}
</style>
