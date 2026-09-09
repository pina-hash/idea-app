<script lang="ts">
	import EntryBanner from './EntryBanner.svelte';
	import ForfeitForm from './ForfeitForm.svelte';
	import ResultForm from './ResultForm.svelte';
	import { matchQueue } from './live';
	import {
		isForfeitMatch,
		matchHref,
		memberNames,
		roundLabel,
		type BracketMatch,
		type TournamentEntry,
		type TournamentEntryMember
	} from './tournaments';

	/**
	 * THE HOST'S MATCH CONTROL: everything a host does between two matches,
	 * as one component the route mounts and the dev harness mounts identically
	 * (the ReviewConsole / CoinDeskTool convention). It used to be a section
	 * inline in `/tournaments/[id]/host/+page.svelte`, which no harness could
	 * reach, so the controls a teacher runs a live bracket from on a phone had
	 * never been measured: the winner picks were 28.6px and the forfeit /
	 * correct / ping buttons about 20px (prompt 0077).
	 *
	 * Presentation only. Every write is a callback the route points at its
	 * RPCs; AN OMITTED TRANSPORT REMOVES THE CONTROL IT DRIVES -- `onping` is
	 * optional and its absence is what takes the ping buttons off a surface
	 * with no push sender behind it (the harness). Each write callback answers
	 * whether it landed, so a panel (forfeit, correct) closes only on success.
	 *
	 * WHAT IS ON SCREEN, TOP TO BOTTOM, AND WHY:
	 *   1. NOW -- every match in progress, each with its result form open.
	 *   2. NEXT UP -- the first callable match as a banner pair with one big
	 *      Start control, because "who is up next" is the thing a host reads
	 *      aloud, and the rest of the ready list under it.
	 *   3. WAITING -- a count, never rows: nothing can be done with them.
	 *   4. COMPLETED -- with the correction control per row.
	 * The queue itself is `matchQueue` in live.ts, shared with the public
	 * page and the projector stage, so all three agree on what "next" is.
	 */
	let {
		matches,
		entries,
		scoreEntry,
		busy = false,
		tournamentId = null,
		members = {},
		onstart,
		onsubmit,
		onforfeit,
		oncorrect,
		onping
	}: {
		matches: BracketMatch[];
		entries: Record<string, TournamentEntry>;
		scoreEntry: boolean;
		busy?: boolean;
		/** Given one, a completed row links to its match detail page. */
		tournamentId?: string | null;
		/** Registrants by entry id (0192), for the NEXT UP banners: a host
		 * calling a team reads every name on it. Default empty: nothing changes
		 * on a surface that has not loaded them. */
		members?: Record<string, TournamentEntryMember[]>;
		onstart: (matchId: string) => Promise<boolean> | boolean | void;
		onsubmit: (matchId: string, result: unknown) => Promise<boolean> | boolean | void;
		onforfeit: (matchId: string, result: unknown) => Promise<boolean> | boolean | void;
		oncorrect: (
			matchId: string,
			result: unknown,
			reason: string
		) => Promise<boolean> | boolean | void;
		/** Optional: a push ping to one competitor. Absent means no ping buttons. */
		onping?: (matchId: string, entryId: string, entryName: string) => void;
	} = $props();

	const queue = $derived(matchQueue(matches));
	const next = $derived(queue.ready[0] ?? null);
	const laterReady = $derived(queue.ready.slice(1));

	function maxRound(bracket: string): number {
		return Math.max(0, ...matches.filter((m) => m.bracket === bracket).map((m) => m.round));
	}
	const label = (m: BracketMatch) =>
		`${roundLabel(m.bracket, m.round, maxRound(m.bracket))} · M${m.slot}`;
	const nameOf = (id: string | null) => (id ? (entries[id]?.display_name ?? '?') : 'TBD');

	/** Forfeit is a separate, explicitly opened panel: see ForfeitForm. */
	let forfeitingId = $state<string | null>(null);
	let correctingId = $state<string | null>(null);

	async function forfeit(matchId: string, result: unknown) {
		const ok = await onforfeit(matchId, result);
		if (ok !== false) forfeitingId = null;
	}
	async function correct(matchId: string, result: unknown, reason: string) {
		const ok = await oncorrect(matchId, result, reason);
		if (ok !== false) correctingId = null;
	}
</script>

{#snippet pingButtons(m: BracketMatch)}
	{#if onping}
		{#each [m.entry_a_id, m.entry_b_id] as eid (eid)}
			{#if eid && entries[eid]?.user_id}
				<button
					type="button"
					class="mini"
					disabled={busy}
					title="Send this player a push notification now"
					onclick={() => onping?.(m.id, eid, entries[eid]?.display_name ?? '')}
				>
					ping {entries[eid].display_name}
				</button>
			{/if}
		{/each}
	{/if}
{/snippet}

{#snippet forfeitToggle(m: BracketMatch, title: string)}
	<button
		type="button"
		class="mini gold"
		disabled={busy}
		{title}
		aria-expanded={forfeitingId === m.id}
		onclick={() => (forfeitingId = forfeitingId === m.id ? null : m.id)}
	>
		{forfeitingId === m.id ? 'cancel forfeit' : 'forfeit'}
	</button>
{/snippet}

<div class="hmc" data-testid="host-match-control">
	{#if queue.inProgress.length}
		<h3 class="mc-sub live-sub"><span class="tnm-live">Now</span></h3>
		{#each queue.inProgress as m (m.id)}
			<div class="mc-block" data-match-state="live" data-match-id={m.id}>
				<div class="mc-row slim">
					<span class="mc-label">{label(m)}</span>
					{@render pingButtons(m)}
					{@render forfeitToggle(m, 'Award this match without it being played')}
				</div>
				{#if forfeitingId === m.id}
					<ForfeitForm
						match={m}
						{entries}
						{busy}
						onsubmit={(result) => forfeit(m.id, result)}
						oncancel={() => (forfeitingId = null)}
					/>
				{:else}
					<ResultForm
						match={m}
						{entries}
						{scoreEntry}
						{busy}
						onsubmit={(result) => onsubmit(m.id, result)}
					/>
				{/if}
			</div>
		{/each}
	{/if}

	{#if next}
		<h3 class="mc-sub">Next up</h3>
		<div class="next" data-match-state="next" data-match-id={next.id}>
			<div class="mc-row slim">
				<span class="mc-label">{label(next)}</span>
				{@render pingButtons(next)}
				{@render forfeitToggle(next, 'Nobody turned up: award it without starting the clock')}
			</div>
			<div class="next-pair">
				<EntryBanner
					entry={next.entry_a_id ? (entries[next.entry_a_id] ?? null) : null}
					seed={next.entry_a_id ? entries[next.entry_a_id]?.seed : null}
					members={next.entry_a_id ? memberNames(members[next.entry_a_id]) : []}
					size="sm"
				/>
				<span class="vs-sep">vs</span>
				<EntryBanner
					entry={next.entry_b_id ? (entries[next.entry_b_id] ?? null) : null}
					seed={next.entry_b_id ? entries[next.entry_b_id]?.seed : null}
					members={next.entry_b_id ? memberNames(members[next.entry_b_id]) : []}
					size="sm"
				/>
			</div>
			{#if forfeitingId === next.id}
				<ForfeitForm
					match={next}
					{entries}
					{busy}
					onsubmit={(result) => forfeit(next.id, result)}
					oncancel={() => (forfeitingId = null)}
				/>
			{:else}
				<button type="button" class="btn start" disabled={busy} onclick={() => onstart(next.id)}>
					Start {nameOf(next.entry_a_id)} vs {nameOf(next.entry_b_id)}
				</button>
			{/if}
		</div>
	{/if}

	{#if laterReady.length}
		<h3 class="mc-sub">Ready to start</h3>
		{#each laterReady as m (m.id)}
			<div class="mc-row" data-match-state="ready" data-match-id={m.id}>
				<span class="mc-label">{label(m)}</span>
				<span class="mc-vs">
					{nameOf(m.entry_a_id)}
					<span class="vs-sep">vs</span>
					{nameOf(m.entry_b_id)}
				</span>
				<span class="row-actions">
					{@render pingButtons(m)}
					{@render forfeitToggle(m, 'Nobody turned up: award it without starting the clock')}
					<button type="button" class="btn" disabled={busy} onclick={() => onstart(m.id)}>
						Start
					</button>
				</span>
			</div>
			{#if forfeitingId === m.id}
				<div class="mc-block">
					<ForfeitForm
						match={m}
						{entries}
						{busy}
						onsubmit={(result) => forfeit(m.id, result)}
						oncancel={() => (forfeitingId = null)}
					/>
				</div>
			{/if}
		{/each}
	{/if}

	{#if !queue.inProgress.length && !queue.ready.length && queue.waiting.length}
		<p class="note">Nothing to call yet.</p>
	{/if}

	{#if queue.waiting.length}
		<h3 class="mc-sub">Waiting on earlier results</h3>
		<p class="note">
			{queue.waiting.length} match{queue.waiting.length === 1 ? '' : 'es'}
			still missing a participant.
		</p>
	{/if}

	{#if queue.completed.length}
		<h3 class="mc-sub">Completed</h3>
		{#each queue.completed as m (m.id)}
			<div class="mc-row done" data-match-state="done" data-match-id={m.id}>
				<span class="mc-label">
					{#if tournamentId}
						<a class="mc-link" href={matchHref(tournamentId, m.id)}>{label(m)}</a>
					{:else}
						{label(m)}
					{/if}
				</span>
				<span class="mc-vs">
					{nameOf(m.entry_a_id)}
					<span class="vs-sep">vs</span>
					{nameOf(m.entry_b_id)}
					<span class="mc-winner">→ {nameOf(m.winner_id)}</span>
					{#if isForfeitMatch(m)}
						<span class="ff-tag" title={m.forfeit_reason ?? ''}>by forfeit</span>
					{/if}
				</span>
				<button
					type="button"
					class="mini"
					aria-expanded={correctingId === m.id}
					onclick={() => (correctingId = correctingId === m.id ? null : m.id)}
				>
					{correctingId === m.id ? 'cancel' : 'correct'}
				</button>
			</div>
			{#if correctingId === m.id}
				<div class="mc-block">
					<ResultForm
						match={m}
						{entries}
						{scoreEntry}
						mode="correct"
						{busy}
						onsubmit={(result, reason) => correct(m.id, result, reason)}
					/>
				</div>
			{/if}
		{/each}
	{/if}
</div>

<style>
	.hmc {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.note {
		color: var(--dim);
		font-size: 0.85rem;
	}
	.mc-sub {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cyan);
		margin: 1rem 0 0.4rem;
	}
	.mc-sub:first-child {
		margin-top: 0;
	}
	/* The ONE emerald element on the console: the live indicator. */
	.mc-sub.live-sub {
		font-size: 0.8rem;
	}
	.mc-row {
		display: flex;
		align-items: center;
		gap: 0.6rem 0.8rem;
		flex-wrap: wrap;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.08));
	}
	.mc-row.done {
		opacity: 0.85;
	}
	.mc-row.slim {
		border-bottom: none;
		padding: 0 0 0.2rem;
	}
	.mc-row.slim .mini {
		margin-left: 0;
	}
	.mc-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
		min-width: 11rem;
	}
	.mc-vs {
		font-weight: 700;
	}
	.vs-sep {
		color: var(--dim);
		font-weight: 400;
	}
	.mc-winner {
		color: var(--green);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		margin-left: 0.4rem;
	}
	.mc-row .btn,
	.mc-row .mini {
		margin-left: auto;
	}
	.row-actions {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.mc-block {
		margin: 0.4rem 0 0.8rem;
	}
	.mc-block .mc-label {
		margin-bottom: 0.3rem;
	}
	/* NEXT UP: the match about to be called, at banner size, with one Start. */
	.next {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 0.7rem;
		margin-bottom: 0.4rem;
		border: 1px solid var(--line-strong, var(--line));
		border-radius: 8px;
		background: var(--bg2);
	}
	.next-pair {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
	.next-pair .vs-sep {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		text-transform: uppercase;
	}
	@media (max-width: 30rem) {
		.next-pair {
			grid-template-columns: 1fr;
		}
		.next-pair .vs-sep {
			justify-self: center;
		}
	}
	.btn.start {
		justify-content: center;
		width: 100%;
	}
	.mini {
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		padding: 0.15rem 0.8rem;
		/* Measured about 20px before prompt 0077; a thumb on a phone. */
		min-height: 44px;
		cursor: pointer;
	}
	.mini:hover:not(:disabled) {
		color: var(--white);
		border-color: var(--green);
	}
	.mini:disabled {
		opacity: 0.35;
		cursor: default;
	}
	/* Forfeit is the exception path, in the exception colour everywhere: gold,
	 * never the primary action's green. */
	.mini.gold {
		color: var(--gold);
		border-color: rgba(200, 168, 72, 0.45);
	}
	.mini.gold:hover:not(:disabled) {
		color: var(--gold);
		border-color: var(--gold);
	}
	.ff-tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--gold);
		margin-left: 0.5rem;
	}
	.mc-link {
		color: var(--dim);
	}
</style>
