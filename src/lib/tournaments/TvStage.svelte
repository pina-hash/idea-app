<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import '$lib/tournaments/tournaments-theme.css';
	import EntryBanner from './EntryBanner.svelte';
	import TournamentQr from './TournamentQr.svelte';
	import {
		entryMap,
		formatDuration,
		isByeMatch,
		isForfeitMatch,
		matchScoreline,
		msBetween,
		roundLabel,
		statusLabel
	} from './tournaments';
	import { matchQueue } from './live';
	import {
		EXIT_CONTROL_IDLE_MS,
		fullscreenActive,
		keyHasModifier,
		keyTargetIsTextEntry,
		toggleFullscreen
	} from './fullscreen';
	import type {
		BracketMatch,
		MatchGame,
		Tournament,
		TournamentEntry
	} from './tournaments';
	import type { EntryStyle } from './entry-styles';

	/**
	 * TV MODE -- the shop projector screen. Presentation only (data in via
	 * props, the BracketView convention); the route owns the load and the
	 * realtime subscription, so the dev harness can mount this exact
	 * component against sample data with no auth and no Supabase.
	 *
	 * Design rules, all of them load-bearing:
	 *   * Nobody is standing at this screen. No buttons, no links, no
	 *     sign-in prompt, no host control. The only input is a hidden F for
	 *     fullscreen, hinted once at startup and then gone.
	 *   * Everything is sized for distance. Pairings render as full banners,
	 *     never the dense bracket grid -- a 16-node bracket laid out on one
	 *     screen is unreadable from across a room, so this shows WHO IS
	 *     PLAYING NOW and WHO IS UP NEXT instead.
	 *   * It advances itself off whatever the route's realtime subscription
	 *     pushes in. Nothing here polls.
	 *   * RESTRAINT: exactly ONE dominant emerald element per screen state.
	 *     Live -> the LIVE indicator in the header. Result -> the WINNER
	 *     label. Register / between -> the section label. Champion -> none
	 *     at all (gold owns placement). Everything else is a neutral panel.
	 */
	let {
		tournament,
		entries: entryRows,
		styles = {},
		matches = [],
		games = [],
		shareUrl,
		showHint = true,
		fullscreen = true
	}: {
		tournament: Tournament;
		entries: TournamentEntry[];
		styles?: Record<string, EntryStyle>;
		matches?: BracketMatch[];
		games?: MatchGame[];
		shareUrl: string;
		showHint?: boolean;
		/** The route pins this to the viewport; the dev harness mounts it
		 * inside a sized, position:relative frame instead. */
		fullscreen?: boolean;
	} = $props();

	const t = $derived(tournament);
	const entries = $derived(entryMap(entryRows));

	// ONE queue, shared with the host console and the public page (live.ts):
	// the match the projector shows as next is the one the host's Start
	// button is on.
	const queue = $derived(matchQueue(matches));
	const liveMatches = $derived(queue.inProgress);
	const readyMatches = $derived(queue.ready);
	const playedCount = $derived(
		matches.filter((m) => m.status === 'complete' && m.winner_id).length
	);
	const champion = $derived(t.champion_entry_id ? (entries[t.champion_entry_id] ?? null) : null);

	function maxRound(bracket: string): number {
		return Math.max(0, ...matches.filter((m) => m.bracket === bracket).map((m) => m.round));
	}
	const label = (m: BracketMatch) => roundLabel(m.bracket, m.round, maxRound(m.bracket));

	// --- the result beat -----------------------------------------------------
	// A match that JUST finished holds the screen for a few seconds so the
	// room sees the call (and so a competitor's one-shot flourish has a
	// moment to play). Seeded on first run from whatever is already
	// complete, so opening the page mid-tournament never celebrates an old
	// result.
	let resultMatch = $state<BracketMatch | null>(null);
	let seenLatest: string | null = null;
	let seeded = false;
	let resultTimer: ReturnType<typeof setTimeout> | undefined;

	function latestCompleted(rows: BracketMatch[]): BracketMatch | null {
		let best: BracketMatch | null = null;
		for (const m of rows) {
			if (m.status !== 'complete' || !m.winner_id || !m.completed_at) continue;
			// A BYE is not a result. It completes with an empty side the moment
			// the bracket is generated, so celebrating it would hold the
			// projector for 13 seconds on a match nobody played -- and show the
			// opposite side as "Eliminated · TBD".
			if (isByeMatch(m)) continue;
			if (!best || m.completed_at > (best.completed_at ?? '')) best = m;
		}
		return best;
	}

	$effect(() => {
		const latest = latestCompleted(matches);
		untrack(() => {
			if (!seeded) {
				seeded = true;
				seenLatest = latest?.id ?? null;
				return;
			}
			if (!latest || latest.id === seenLatest) return;
			seenLatest = latest.id;
			resultMatch = latest;
			clearTimeout(resultTimer);
			resultTimer = setTimeout(() => (resultMatch = null), 13000);
		});
	});

	// --- featured live match rotation ---------------------------------------
	let rotateTick = $state(0);
	onMount(() => {
		const id = setInterval(() => (rotateTick += 1), 12000);
		return () => clearInterval(id);
	});
	const featured = $derived(
		liveMatches.length ? liveMatches[rotateTick % liveMatches.length] : null
	);

	// THE MATCH CLOCK (prompt 0077): how long the featured match has been
	// running, off its own started_at, ticking once a second. A tournament
	// is an event and a clock is what says so; it is text, so nothing here
	// moves under reduced motion. The interval is cleared on unmount and only
	// runs while a match is featured.
	let now = $state(Date.now());
	$effect(() => {
		if (!featured) return;
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});
	const featuredElapsed = $derived(
		featured?.started_at ? msBetween(featured.started_at, new Date(now).toISOString()) : null
	);

	type View = 'result' | 'match' | 'champion' | 'register' | 'between';
	const view = $derived<View>(
		resultMatch
			? 'result'
			: featured
				? 'match'
				: champion && t.status === 'complete'
					? 'champion'
					: t.status === 'draft' || t.status === 'registration_open'
						? 'register'
						: 'between'
	);

	/** The QR belongs on the states where someone could still walk up and join
	 * or has nothing else to look at (the spec's registration-open and
	 * between-match states). */
	const showQr = $derived(view === 'register' || view === 'between');

	// The loser of a decided match is ELIMINATED only when the match has no
	// loser pointer -- 0062's "a null loser pointer means elimination on loss".
	const resultWinnerId = $derived(resultMatch?.winner_id ?? null);
	const resultLoserId = $derived(
		resultMatch
			? resultMatch.entry_a_id === resultMatch.winner_id
				? resultMatch.entry_b_id
				: resultMatch.entry_a_id
			: null
	);
	const resultEliminated = $derived(!!resultMatch && resultMatch.loser_to_match_id === null);

	// --- fullscreen, and the way back out ------------------------------------
	// Prompt 0077 gave this screen an F key and nothing else. Prompt 0091 is
	// the first report from a real projector and it says two things: the layout
	// is wrong (see `.tv-body` below) and there is NO WAY OUT a person can
	// find. The Fullscreen API's own exit is Escape and the browser
	// deliberately paints no chrome, so a page that offers fullscreen and no
	// visible control has handed a projector to somebody who has to already
	// know a keyboard shortcut.
	/** Whether the DOCUMENT is fullscreen, read from the browser's own event
	 * rather than tracked beside the toggle -- Escape, the F key and the
	 * control below are three ways in and out and only `fullscreenchange`
	 * sees all three. Seeded on mount so opening the page with fullscreen
	 * already on (a reload inside it) still renders the exit. */
	let isFull = $state(false);
	onMount(() => {
		const sync = () => (isFull = fullscreenActive(document));
		sync();
		document.addEventListener('fullscreenchange', sync);
		document.addEventListener('webkitfullscreenchange', sync);
		return () => {
			document.removeEventListener('fullscreenchange', sync);
			document.removeEventListener('webkitfullscreenchange', sync);
		};
	});

	// The startup hint is for getting IN, so it stands down the moment somebody
	// is in -- the exit control is what that state needs instead.
	let hintExpired = $state(false);
	const hintVisible = $derived(showHint && !hintExpired && !isFull);
	onMount(() => {
		const id = setTimeout(() => (hintExpired = true), 9000);
		return () => clearTimeout(id);
	});

	/** The exit control DIMS after a few seconds of stillness; it never
	 * disappears. See EXIT_CONTROL_IDLE_MS for why that trade goes this way on
	 * a machine driving a class. */
	let controlAwake = $state(true);
	let awakeTimer: ReturnType<typeof setTimeout> | undefined;
	function wake() {
		controlAwake = true;
		clearTimeout(awakeTimer);
		awakeTimer = setTimeout(() => (controlAwake = false), EXIT_CONTROL_IDLE_MS);
	}
	$effect(() => {
		if (!isFull) {
			clearTimeout(awakeTimer);
			controlAwake = true;
			return;
		}
		wake();
		return () => clearTimeout(awakeTimer);
	});

	function onKeydown(e: KeyboardEvent) {
		// SOMEBODY MAY BE TYPING ON THIS PAGE. The report affordance is mounted
		// in the root layout and this route is not excluded, so the report box
		// is here like everywhere else -- and this handler used to eat the `f`
		// out of it. `keyTargetIsTextEntry` is the one place that question is
		// asked; see `fullscreen.ts` for the measurement.
		if (keyTargetIsTextEntry(e.target)) return;
		if (isFull) wake();
		if (keyHasModifier(e)) return;
		if (e.key !== 'f' && e.key !== 'F') return;
		e.preventDefault();
		// STILL A TOGGLE, not an entry. F is the only way out for a person who
		// has already learned it, and Escape stays the browser's.
		toggleFullscreen(document.documentElement, document);
	}
</script>

<svelte:window onkeydown={onKeydown} onpointermove={() => isFull && wake()} />

<div class="tnm-root tv" class:fixed={fullscreen}>
	<header class="tv-head">
		<h1 class="tv-name">{t.name}</h1>
		{#if view === 'match'}
			<span class="tnm-live tv-live">Live</span>
		{:else if view === 'champion'}
			<span class="tv-state gold">Final</span>
		{:else}
			<span class="tv-state">{statusLabel(t.status)}</span>
		{/if}
	</header>

	<main class="tv-body">
		{#if view === 'result' && resultMatch}
			<div class="stage stack">
				<p class="tnm-label stage-label">{label(resultMatch)} · Result</p>
				<div class="result-grid">
					<div class="result-side">
						<p class="tnm-label accent win-label">Winner</p>
						<EntryBanner
							entry={resultWinnerId ? (entries[resultWinnerId] ?? null) : null}
							style={resultWinnerId ? (styles[resultWinnerId] ?? null) : null}
							size="lg"
							winner
							event="win"
						/>
					</div>
					<div class="result-side">
						<p class="tnm-label">{resultEliminated ? 'Eliminated' : 'Drops to losers'}</p>
						<EntryBanner
							entry={resultLoserId ? (entries[resultLoserId] ?? null) : null}
							style={resultLoserId ? (styles[resultLoserId] ?? null) : null}
							size="lg"
							dim
							event={resultEliminated ? 'eliminated' : null}
						/>
					</div>
				</div>
				{#if isForfeitMatch(resultMatch)}
					<!-- A forfeit is a real advancement and a real elimination, so it
					     still gets the beat -- but the room is told what it was, never
					     shown it as a played result (there is no scoreline to show). -->
					<p class="scoreline forfeit">
						By forfeit{resultMatch.forfeit_reason ? ` · ${resultMatch.forfeit_reason}` : ''}
					</p>
				{:else if matchScoreline(resultMatch, games)}
					<p class="scoreline">{matchScoreline(resultMatch, games)}</p>
				{/if}
			</div>
		{:else if view === 'match' && featured}
			<div class="stage stack">
				<p class="tnm-label stage-label">
					{label(featured)}{featured.best_of > 1 ? ` · Best of ${featured.best_of}` : ''}
					{#if liveMatches.length > 1}
						<span class="of">· match {(rotateTick % liveMatches.length) + 1} of {liveMatches.length}</span>
					{/if}
				</p>
				<div class="versus">
					<EntryBanner
						entry={featured.entry_a_id ? (entries[featured.entry_a_id] ?? null) : null}
						style={featured.entry_a_id ? (styles[featured.entry_a_id] ?? null) : null}
						size="xl"
					/>
					<span class="vs">vs</span>
					<EntryBanner
						entry={featured.entry_b_id ? (entries[featured.entry_b_id] ?? null) : null}
						style={featured.entry_b_id ? (styles[featured.entry_b_id] ?? null) : null}
						size="xl"
					/>
				</div>
				<div class="live-foot">
					{#if matchScoreline(featured, games)}
						<p class="scoreline">{matchScoreline(featured, games)}</p>
					{/if}
					{#if featuredElapsed !== null && featuredElapsed >= 0}
						<p class="clock" aria-label="Match running time">
							<span class="clock-word">on the clock</span>{formatDuration(featuredElapsed)}
						</p>
					{/if}
				</div>
			</div>
		{:else if view === 'champion' && champion}
			<div class="stage stack center">
				<p class="tnm-label gold stage-label">Champion</p>
				<div class="champ-wrap">
					<EntryBanner
						entry={champion}
						style={styles[champion.id] ?? null}
						size="xl"
						winner
						event="win"
					/>
				</div>
			</div>
		{:else if view === 'register'}
			<div class="stage split">
				<div class="split-main">
					<p class="tnm-label accent stage-label">Scan to enter</p>
					<p class="big-line">Registration is open</p>
					<p class="sub-line">
						{entryRows.length} entr{entryRows.length === 1 ? 'y' : 'ies'} so far
					</p>
					{#if entryRows.length}
						<div class="roster">
							{#each entryRows.slice(0, 6) as e (e.id)}
								<EntryBanner entry={e} style={styles[e.id] ?? null} size="md" />
							{/each}
							{#if entryRows.length > 6}
								<p class="more">+{entryRows.length - 6} more</p>
							{/if}
						</div>
					{/if}
				</div>
				<div class="split-side tnm-panel">
					<TournamentQr url={shareUrl} name={t.name} variant="panel" />
				</div>
			</div>
		{:else}
			<div class="stage split">
				<div class="split-main">
					<p class="tnm-label accent stage-label">Next up</p>
					{#if readyMatches.length}
						<div class="upnext">
							{#each readyMatches.slice(0, 3) as m (m.id)}
								<div class="upnext-row">
									<span class="upnext-label">{label(m)}</span>
									<div class="upnext-pair">
										<EntryBanner
											entry={m.entry_a_id ? (entries[m.entry_a_id] ?? null) : null}
											style={m.entry_a_id ? (styles[m.entry_a_id] ?? null) : null}
											size="md"
										/>
										<span class="vs small">vs</span>
										<EntryBanner
											entry={m.entry_b_id ? (entries[m.entry_b_id] ?? null) : null}
											style={m.entry_b_id ? (styles[m.entry_b_id] ?? null) : null}
											size="md"
										/>
									</div>
								</div>
							{/each}
						</div>
						<p class="sub-line">
							{playedCount} of {matches.length} matches played
						</p>
					{:else if matches.length}
						<p class="big-line">Waiting on results</p>
						<p class="sub-line">
							{playedCount} of {matches.length} matches played
						</p>
					{:else}
						<p class="big-line">Seeding the field</p>
						<p class="sub-line">
							{entryRows.length} entr{entryRows.length === 1 ? 'y' : 'ies'}
						</p>
					{/if}
				</div>
				{#if showQr}
					<div class="split-side tnm-panel">
						<TournamentQr url={shareUrl} name={t.name} variant="panel" />
					</div>
				{/if}
			</div>
		{/if}
	</main>

	<footer class="tv-foot">
		<span>{shareUrl.replace(/^https?:\/\//, '')}</span>
		{#if isFull}
			<!-- THE WAY BACK OUT. It lives in the FOOTER'S OWN FLOW rather than
			     floating over the stage, which is what makes "it never covers the
			     match" a property of the box model instead of a number somebody
			     tuned: `.tv-foot` is a `flex: none` sibling BELOW `.tv-body`, so
			     no rect inside the stage can intersect it at any size or ratio.
			     It carries a WORD, it is a real button, and it says which key
			     does the same thing so the next person needs the mouse once. -->
			<button
				type="button"
				class="tv-exit"
				class:awake={controlAwake}
				onclick={() => toggleFullscreen(document.documentElement, document)}
				onfocus={wake}
				onpointerenter={wake}
			>
				<span class="tv-exit-word">Exit full screen</span>
				<span class="tv-exit-key">Esc</span>
			</button>
		{:else if hintVisible}
			<span class="hint">Press F for fullscreen</span>
		{/if}
	</footer>
</div>

<style>
	:global(body:has(.tv.fixed)) {
		margin: 0;
		overflow: hidden;
	}
	:global(body:has(.tv.fixed) .bg-fx) {
		display: none;
	}

	.tv {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		font-family: 'Rajdhani', sans-serif;
		overflow: hidden;
	}
	.tv.fixed {
		position: fixed;
	}

	.tv-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1.5rem;
		padding: clamp(0.8rem, 1.8vh, 1.6rem) clamp(1.2rem, 3vw, 3rem);
		border-bottom: 1px solid var(--tnm-line);
		flex: none;
	}
	.tv-name {
		margin: 0;
		font-size: clamp(1.3rem, 2.6vw, 2.6rem);
		font-weight: 700;
		letter-spacing: 0.01em;
		color: var(--tnm-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tv-live {
		font-size: clamp(1rem, 2vw, 2.1rem);
		flex: none;
	}
	.tv-state {
		font-family: 'Share Tech Mono', monospace;
		font-size: clamp(0.85rem, 1.6vw, 1.7rem);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
		flex: none;
	}
	.tv-state.gold {
		color: var(--tnm-gold);
	}

	.tv-body {
		flex: 1;
		min-height: 0;
		display: flex;
		padding: clamp(1rem, 3vh, 2.6rem) clamp(1.2rem, 3vw, 3rem);
		/* THIS IS A PROJECTOR, AND `main` IS CAPPED AT 880px IN `src/app.css`.
		   That cap is right for every reading surface in the app and wrong for
		   the one element in it that is a WALL. It applied here because this is
		   a `<main>` and the component only ever overrode `padding`, so a
		   1920-wide stage rendered in an 880px column centred by `margin: auto`
		   with 520px of dead black down each side -- while `.tv-head` and
		   `.tv-foot` (a `header` and a `footer`) went full bleed, which is what
		   made it read as broken rather than merely narrow.

		   MEASURED at 1920x1080 before this rule: body 880px of 1920 (45.8% of
		   the screen), `.split-main` 243px, and the up-next entry names -- the
		   two words the room is there to read -- laid out at ZERO pixels wide
		   (`scrollWidth` 155, `clientWidth` 0), ellipsised out of existence by
		   a grid track that had nothing left to give. It is a WIDTH defect and
		   not a fullscreen one: fullscreen is simply how somebody first reaches
		   the widest state, and the wider the screen the worse it gets. */
		max-width: none;
		margin: 0;
	}
	.stage {
		flex: 1;
		min-width: 0;
		display: flex;
	}
	.stage.stack {
		flex-direction: column;
		justify-content: center;
		gap: clamp(0.8rem, 2.2vh, 1.8rem);
	}
	.stage.center {
		align-items: center;
	}
	.stage.split {
		gap: clamp(1.4rem, 3vw, 3.5rem);
		align-items: center;
	}
	.split-main {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: clamp(0.5rem, 1.4vh, 1.1rem);
	}
	.split-side {
		flex: 0 0 auto;
		padding: clamp(0.9rem, 2vw, 1.8rem);
		display: flex;
		align-items: center;
	}

	/* SIZED FOR A ROOM, NOT A DESK (prompt 0077). The assumption every figure
	   below is measured against: a 1920x1080 image about 2.2 m wide (a 100"
	   16:9 projection), read from the back of a shop classroom at 8 m. At that
	   distance the 1:200 rule of thumb wants ~40 mm of cap height for a word
	   that must be READ and 20 mm for one that only needs to be recognised;
	   at 2.2 m / 1920 px one pixel is ~1.15 mm and Rajdhani's cap height is
	   ~0.7 em, so "read from the back" is ~50 px of font and "recognise" is
	   ~25 px. Before this block the round label was 22.4 px, the up-next
	   names 24.8 px and their round labels 17.6 px -- the name about to be
	   called was the smallest thing on the screen. Measured before/after in
	   the bundle's history entry. */
	.stage-label {
		font-size: clamp(0.9rem, 2.1vw, 2.2rem);
	}
	.of {
		color: var(--tnm-ink-dim);
		letter-spacing: 0.1em;
	}

	.versus {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: clamp(0.8rem, 2.2vw, 2.4rem);
		min-width: 0;
	}
	.vs {
		font-family: 'Share Tech Mono', monospace;
		font-size: clamp(1rem, 2.4vw, 2.4rem);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
		flex: none;
	}
	.vs.small {
		font-size: clamp(0.9rem, 1.7vw, 1.8rem);
	}
	/* The banners the room has to read: the pair about to be called and the
	   result pair. EntryBanner's own sizes are for a page; the stage outranks
	   them (one more class in the selector) rather than adding a fifth size
	   to a component four surfaces share. Up-next md: name 24.8 -> 57.6 px,
	   result lg: 48 -> 76.8 px at 1920. */
	.tv :global(.entry-banner.md) {
		--pad: clamp(0.8rem, 1.4vw, 1.4rem);
		--thumb: clamp(3rem, 5vw, 5rem);
		--name: clamp(1.6rem, 3vw, 3.6rem);
		--tag: clamp(0.9rem, 1.3vw, 1.3rem);
	}
	.tv :global(.entry-banner.lg) {
		--pad: clamp(1.2rem, 2vw, 2rem);
		--thumb: clamp(4rem, 7vw, 7rem);
		--name: clamp(2rem, 4vw, 4.8rem);
		--tag: clamp(1rem, 1.6vw, 1.6rem);
	}

	.result-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: clamp(1rem, 2.6vw, 2.6rem);
		align-items: start;
	}
	.result-side {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}
	.win-label {
		font-size: clamp(0.9rem, 2.1vw, 2.2rem);
	}
	.live-foot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: clamp(0.3rem, 1vh, 0.8rem);
	}
	.clock {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: clamp(1rem, 2.4vw, 2.6rem);
		letter-spacing: 0.1em;
		font-variant-numeric: tabular-nums;
		color: var(--tnm-ink);
	}
	.clock-word {
		color: var(--tnm-ink-dim);
		text-transform: uppercase;
		font-size: 0.55em;
		margin-right: 0.8em;
	}
	.scoreline.forfeit {
		color: var(--tnm-gold);
		font-size: clamp(1rem, 1.9vw, 2rem);
	}
	.scoreline {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: clamp(1.2rem, 3vw, 3.2rem);
		letter-spacing: 0.1em;
		color: var(--tnm-ink);
		text-align: center;
	}

	.champ-wrap {
		width: min(100%, 62rem);
	}

	.big-line {
		margin: 0;
		font-size: clamp(1.6rem, 4.2vw, 4.2rem);
		font-weight: 700;
		line-height: 1.05;
		color: var(--tnm-ink);
	}
	.sub-line {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: clamp(0.95rem, 1.9vw, 2rem);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
	}
	.roster {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
		gap: 0.6rem;
		margin-top: 0.4rem;
		overflow: hidden;
	}
	.more {
		margin: 0;
		align-self: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: 1rem;
		color: var(--tnm-ink-dim);
	}

	.upnext {
		display: flex;
		flex-direction: column;
		gap: clamp(0.5rem, 1.6vh, 1.2rem);
		min-width: 0;
	}
	.upnext-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	.upnext-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: clamp(0.8rem, 1.6vw, 1.7rem);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
	}
	.upnext-pair {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: clamp(0.5rem, 1.4vw, 1.4rem);
		min-width: 0;
	}

	.tv-foot {
		flex: none;
		display: flex;
		align-items: center;
		gap: clamp(1rem, 2vw, 2.5rem);
		padding: clamp(0.5rem, 1.2vh, 1rem) clamp(1.2rem, 3vw, 3rem);
		border-top: 1px solid var(--tnm-line);
		/* LEFT-PACKED, AND THE BOTTOM-RIGHT CORNER IS LEFT EMPTY ON PURPOSE.
		   `SiteFeedback`'s shell pill is `position: fixed` at `right`/`bottom`
		   with `z-index: 90` and is mounted in the ROOT LAYOUT, so it is on
		   this page like every other and it owns that corner at every width.
		   The exit control was written into the right end first and Chromium
		   refused to click it at 1024x768 -- "Report a problem intercepts
		   pointer events" -- which is a way out that cannot be taken. Packing
		   the footer from the left makes the clearance a property of the
		   layout rather than a margin somebody measured against another
		   component's size. */
		justify-content: flex-start;
		/* AND IT WRAPS, WHICH IS A REACHABILITY FIX RATHER THAN A TIDINESS ONE.
		   At 375px the share address alone is 246px of a 375px row, so a
		   `nowrap` footer pushed the exit control to `right: 473` -- 98px
		   outside the viewport, CLIPPED IN SILENCE by `.tv`'s own
		   `overflow: hidden`, so the horizontal-scroll check read 0px overflow
		   and said nothing. What caught it was hit-testing the control's own
		   span: three of five sample points answered `null` (outside the
		   viewport) and two answered the report pill. `order: -1` then puts the
		   way out on the FIRST row and lets the address wrap under it, which
		   also lifts the control clear of the bottom band the report pill is
		   anchored in. */
		flex-wrap: wrap;
		font-family: 'Share Tech Mono', monospace;
		/* The share address is typed from a phone at the back: recognise, not
		   read, so the smaller floor. 16.8 -> 26.9 px at 1920. */
		font-size: clamp(0.8rem, 1.4vw, 1.7rem);
		letter-spacing: 0.1em;
		color: var(--tnm-ink-dim);
	}
	.hint {
		opacity: 0.55;
	}

	/* THE EXIT CONTROL. Present the whole time fullscreen is on; it DIMS after
	   EXIT_CONTROL_IDLE_MS of stillness and never disappears, because the
	   failure it exists to fix is a person stuck in front of a room and a
	   control that has vanished is one more thing they have to know how to
	   summon. `opacity` only -- the box does not move, so the footer never
	   reflows and the pill stays hit-testable and Tab-focusable at every
	   moment rather than only after a reveal gesture. */
	.tv-exit {
		order: -1;
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 0.9em;
		min-height: 44px;
		padding: 0.35em 1em;
		/* The outer edge of an interactive control is a `--boundary`-class line
		   and clears 3:1, so it is the ink-dim token in BOTH states rather than
		   the room's decorative `--tnm-line`. Measured below. */
		border: 1px solid var(--tnm-ink-dim);
		border-radius: 999px;
		background: transparent;
		font: inherit;
		color: var(--tnm-ink);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		opacity: 0.62;
	}
	.tv-exit.awake {
		opacity: 1;
		border-color: var(--tnm-ink-dim);
	}
	.tv-exit:hover,
	.tv-exit:focus-visible {
		opacity: 1;
		border-color: var(--tnm-ink-dim);
	}
	/* THE KEY HINT IS THE PILL'S OWN INK, NOT THE DIM TOKEN, AND THAT IS A
	   MEASUREMENT RATHER THAN A PREFERENCE. `--tnm-ink-dim` reads 6.86:1 on
	   the footer at full strength and 3.36:1 once the pill settles to its
	   idle opacity -- under the 4.5 floor for a word, in the state it spends
	   almost all of its life in. Solving the composite for 4.5 at that
	   opacity needs an ink of at least 213 on this ground, which is
	   `--tnm-ink` (237) and nothing dimmer, so the two halves are separated
	   by SIZE and the gap instead of by hue. 6.60:1 idle, measured. */
	.tv-exit-key {
		font-size: 0.85em;
	}
	@media (prefers-reduced-motion: no-preference) {
		.tv-exit {
			transition: opacity 220ms ease;
		}
	}

	/* Portrait / narrow projectors: stack rather than crush the columns. */
	@media (max-aspect-ratio: 1/1) {
		.stage.split {
			flex-direction: column;
			align-items: stretch;
		}
		.versus,
		.upnext-pair,
		.result-grid {
			grid-template-columns: 1fr;
		}
		.vs {
			justify-self: center;
		}
	}
</style>
