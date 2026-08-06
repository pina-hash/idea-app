<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import '$lib/tournaments/tournaments-theme.css';
	import EntryBanner from './EntryBanner.svelte';
	import TournamentQr from './TournamentQr.svelte';
	import {
		entryMap,
		isByeMatch,
		isForfeitMatch,
		matchScoreline,
		roundLabel,
		statusLabel
	} from './tournaments';
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

	const liveMatches = $derived(matches.filter((m) => m.status === 'in_progress'));
	const readyMatches = $derived(
		matches
			.filter((m) => m.status === 'pending' && m.entry_a_id && m.entry_b_id)
			.sort(
				(a, b) =>
					['winners', 'losers', 'grand_final', 'grand_final_reset'].indexOf(a.bracket) -
						['winners', 'losers', 'grand_final', 'grand_final_reset'].indexOf(b.bracket) ||
					a.round - b.round ||
					a.slot - b.slot
			)
	);
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

	// --- fullscreen: the only input this screen takes ------------------------
	let hintExpired = $state(false);
	const hintVisible = $derived(showHint && !hintExpired);
	onMount(() => {
		const id = setTimeout(() => (hintExpired = true), 9000);
		return () => clearTimeout(id);
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'f' && e.key !== 'F') return;
		e.preventDefault();
		if (document.fullscreenElement) document.exitFullscreen();
		else document.documentElement.requestFullscreen?.().catch(() => {});
	}
</script>

<svelte:window onkeydown={onKeydown} />

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
				{#if matchScoreline(featured, games)}
					<p class="scoreline">{matchScoreline(featured, games)}</p>
				{/if}
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
		{#if hintVisible}<span class="hint">Press F for fullscreen</span>{/if}
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
		font-size: clamp(0.9rem, 1.6vw, 1.6rem);
		flex: none;
	}
	.tv-state {
		font-family: 'Share Tech Mono', monospace;
		font-size: clamp(0.75rem, 1.3vw, 1.3rem);
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

	.stage-label {
		font-size: clamp(0.78rem, 1.35vw, 1.4rem);
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
		font-size: clamp(0.8rem, 1.2vw, 1.2rem);
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
		font-size: clamp(0.8rem, 1.4vw, 1.5rem);
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
		font-size: clamp(0.85rem, 1.5vw, 1.5rem);
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
		font-size: clamp(0.7rem, 1.1vw, 1.1rem);
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
		justify-content: space-between;
		gap: 1rem;
		padding: clamp(0.5rem, 1.2vh, 1rem) clamp(1.2rem, 3vw, 3rem);
		border-top: 1px solid var(--tnm-line);
		font-family: 'Share Tech Mono', monospace;
		font-size: clamp(0.7rem, 1.05vw, 1.05rem);
		letter-spacing: 0.1em;
		color: var(--tnm-ink-dim);
	}
	.hint {
		opacity: 0.55;
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
