<script lang="ts">
	/**
	 * THE ARENA BOARD (prompt 0110, item 3): the whole screen of the list
	 * page, presentation only. The route owns the load, the realtime
	 * subscription and the two RPC transports; the dev harness mounts this
	 * identical component against a fixture of five tournaments.
	 *
	 * THE DIRECTION, CHOSEN: an arena board GROUPED BY WHAT A PERSON CAN DO,
	 * not a list ordered by creation. `boardLanes` (live.ts) sorts every
	 * tournament into one of four lanes and they render in the order a
	 * spectator, a competitor and a host each need them -- watch it, enter
	 * it, wait for it, read its result:
	 *
	 *   LIVE NOW       the first live tournament is the MARQUEE: a wide panel
	 *                  with the event rail, the pair on the floor and Watch /
	 *                  TV mode. A second live event renders as a card under it.
	 *   OPEN FOR ENTRY cards with a Register (or Sign in to enter) action.
	 *   COMING UP      drafts and seeding, plain chips; Manage for hosts.
	 *   FINISHED       compact cards in gold: the champion and a Results link.
	 *
	 * An empty lane renders NOTHING, not an empty heading -- a heading over
	 * nothing is a promise the page is not keeping. Every card's title is ONE
	 * link and its actions are SIBLING links or buttons, never nested in the
	 * anchor (a button in an <a> is invalid markup and its click navigates).
	 *
	 * A SIGNED-OUT SPECTATOR CAN STILL WATCH: every tournament on the board
	 * carries a link to its page (`data-watch`), whatever the viewer's
	 * session. What signing in adds is Register, Manage and the delete
	 * control; what it never removes is the way to a bracket.
	 *
	 * RESTRAINT. The one emerald element on the page is the LIVE chip on the
	 * marquee (`.tnm-status.live`, the room's pulsing dot). A second live
	 * tournament's card carries its own live chip, which is the one exception
	 * the rule tolerates: two events genuinely running at once are two live
	 * signals, and hiding one would be the board lying. Gold is placement
	 * only -- the Final chip and the champion line. The `.btn` keeps the
	 * app's primary-action green, which is a control colour and not a status.
	 * The room's generic link hover (`tournaments-theme.css` paints a plain
	 * link's underline `--tnm-accent` on hover) is NOT counted as an emerald
	 * element: it is a transient affordance under the pointer, not a mark on
	 * the screen -- and the card title's own hover below is pinned to
	 * `--tnm-ink` anyway, so a title under the pointer spends no second
	 * emerald beside the marquee's chip.
	 *
	 * EVERY CHIP CARRIES A GLYPH AND A WORD, and the word is the signal: the
	 * live dot, the `+` of open, the `✦` of final are `aria-hidden` spans
	 * beside "Live", "Open", "Final". Colour is never the only signal.
	 *
	 * ABSENCE IS THE MECHANISM: no `ondelete`, no delete control anywhere; no
	 * `onrespond`, no invites section; not signed in, no Register.
	 */
	import DeleteTournament from './DeleteTournament.svelte';
	import EntryBanner from './EntryBanner.svelte';
	import EventRail from './EventRail.svelte';
	import './tournaments-theme.css';
	import { BOARD_LANE_LABELS, BOARD_LANE_ORDER, boardLanes, matchQueue, type BoardLane } from './live';
	import {
		entryMap,
		parseConfig,
		roundLabel,
		statusLabel,
		type BracketMatch,
		type Tournament,
		type TournamentEntry,
		type TournamentInvite
	} from './tournaments';
	import type { EntryStyle } from './entry-styles';

	let {
		tournaments,
		entries,
		matches = [],
		styles = {},
		hostedIds = [],
		isAdmin = false,
		signedIn = false,
		now,
		rewardCountById = {},
		rewardCoinsById = {},
		rewardEntriesById = {},
		myInvites = [],
		onrespond,
		ondelete,
		deleteBusyId = null,
		deleteErrors = {},
		inviteBusyId = null,
		inviteError = ''
	}: {
		tournaments: Tournament[];
		/** Every tournament's entries (id, tournament_id, display_name, user_id,
		 * thumbnail_url, seed at least): counts, the champion's name, the
		 * marquee's banners. */
		entries: TournamentEntry[];
		/** The LIVE tournaments' bracket rows, for the marquee's pair and rail. */
		matches?: BracketMatch[];
		styles?: Record<string, EntryStyle>;
		/** Tournaments the viewer hosts. */
		hostedIds?: string[];
		/** A site admin manages every tournament (item 5). */
		isAdmin?: boolean;
		signedIn?: boolean;
		/** Epoch ms for the marquee's clock, threaded in; null draws no clock. */
		now: number | null;
		rewardCountById?: Record<string, number>;
		rewardCoinsById?: Record<string, number>;
		rewardEntriesById?: Record<string, number>;
		myInvites?: TournamentInvite[];
		/** Absent: no invite controls (the section itself is then not drawn). */
		onrespond?: (inviteId: string, accept: boolean, displayName: string | null) => void;
		/** Absent: no delete control anywhere on the board. */
		ondelete?: (tournamentId: string, confirmName: string, ack: boolean) => void;
		deleteBusyId?: string | null;
		deleteErrors?: Record<string, string>;
		inviteBusyId?: string | null;
		inviteError?: string;
	} = $props();

	const lanes = $derived(boardLanes(tournaments));
	const byId = $derived(entryMap(entries));

	const entriesOf = (id: string) => entries.filter((e) => e.tournament_id === id);
	const matchesOf = (id: string) => matches.filter((m) => m.tournament_id === id);
	const hosted = (id: string) => hostedIds.includes(id);
	/** A host of this one, or any site admin; the RPCs enforce the same rule. */
	const canManage = (id: string) => isAdmin || hosted(id);
	const teamSize = (t: Tournament) => parseConfig(t.config).team_size;
	const championName = (t: Tournament) =>
		t.champion_entry_id ? (byId[t.champion_entry_id]?.display_name ?? null) : null;
	const tournamentName = (id: string) =>
		tournaments.find((t) => t.id === id)?.name ?? 'a tournament';

	/** What the marquee shows on the floor: the match in progress, else the
	 * next callable pair, else nothing but the count. One queue, shared with
	 * the host console and the projector (live.ts). */
	function floor(t: Tournament): { kind: 'now' | 'next'; match: BracketMatch } | null {
		const q = matchQueue(matchesOf(t.id));
		if (q.inProgress[0]) return { kind: 'now', match: q.inProgress[0] };
		if (q.ready[0]) return { kind: 'next', match: q.ready[0] };
		return null;
	}
	function label(t: Tournament, m: BracketMatch): string {
		const rows = matchesOf(t.id);
		const maxRound = Math.max(0, ...rows.filter((x) => x.bracket === m.bracket).map((x) => x.round));
		return roundLabel(m.bracket, m.round, maxRound);
	}
	function played(t: Tournament): { played: number; total: number } {
		const rows = matchesOf(t.id);
		return {
			played: rows.filter((m) => m.status === 'complete' && m.winner_id).length,
			total: rows.length
		};
	}

	// Pending-invite responses: the display name is required to accept and
	// is INTERNAL state, typed here and handed to the transport.
	let inviteNames = $state<Record<string, string>>({});
	const showInvites = $derived(myInvites.length > 0 && !!onrespond);

	function respond(inviteId: string, accept: boolean) {
		onrespond?.(inviteId, accept, inviteNames[inviteId]?.trim() || null);
	}
</script>

{#snippet chip(t: Tournament)}
	{#if t.status === 'live'}
		<span class="tnm-status live tnm-live">Live</span>
	{:else if t.status === 'registration_open'}
		<span class="tnm-status open"><span class="g" aria-hidden="true">+</span>Open</span>
	{:else if t.status === 'complete'}
		<span class="tnm-status done"><span class="g" aria-hidden="true">✦</span>Final</span>
	{:else}
		<span class="tnm-status">{statusLabel(t.status)}</span>
	{/if}
{/snippet}

{#snippet meta(t: Tournament, lane: BoardLane)}
	{@const n = entriesOf(t.id).length}
	{@const size = teamSize(t)}
	<p class="meta">
		<span class="m-item">{n} entr{n === 1 ? 'y' : 'ies'}</span>
		{#if size > 1}
			<span class="m-item">teams of up to {size}</span>
		{/if}
		{#if lane === 'finished' && championName(t)}
			<span class="m-item champ">Champion: {championName(t)}</span>
		{/if}
		{#if hosted(t.id)}
			<span class="m-item host-tag">You host this</span>
		{/if}
	</p>
{/snippet}

{#snippet manage(t: Tournament)}
	{#if canManage(t.id)}
		<a class="btn secondary" href="/tournaments/{t.id}/host" data-manage>Manage</a>
	{/if}
{/snippet}

{#snippet remove(t: Tournament)}
	{#if ondelete && canManage(t.id)}
		<!-- A SIBLING of the card body, never inside the title link. -->
		<div class="card-admin">
			<DeleteTournament
				tournament={t}
				entryCount={entriesOf(t.id).length}
				matchCount={matchesOf(t.id).length}
				rewardCount={rewardCountById[t.id] ?? 0}
				rewardCoins={rewardCoinsById[t.id] ?? 0}
				rewardEntries={rewardEntriesById[t.id] ?? 0}
				compact
				busy={deleteBusyId === t.id}
				error={deleteErrors[t.id] ?? ''}
				ondelete={(name, ack) => ondelete?.(t.id, name, ack)}
			/>
		</div>
	{/if}
{/snippet}

{#snippet card(t: Tournament, lane: BoardLane)}
	<article class="board-card" data-testid="board-card" data-lane={lane}>
		<div class="card-head">
			<a class="title" href="/tournaments/{t.id}"><h3>{t.name}</h3></a>
			{@render chip(t)}
		</div>
		{#if t.description}<p class="desc">{t.description}</p>{/if}
		{@render meta(t, lane)}
		<div class="tnm-actions">
			{#if lane === 'live'}
				<a class="btn" href="/tournaments/{t.id}" data-watch>Watch</a>
				<a class="btn secondary" href="/tournaments/{t.id}/tv">TV mode</a>
			{:else if lane === 'open'}
				{#if signedIn}
					<a class="btn" href="/tournaments/{t.id}#register" data-register>Register</a>
				{:else}
					<a class="btn" href="/" data-register>Sign in to enter</a>
				{/if}
				<a class="btn secondary" href="/tournaments/{t.id}" data-watch>Watch</a>
			{:else if lane === 'finished'}
				<a class="btn secondary" href="/tournaments/{t.id}" data-watch>Results</a>
			{:else}
				<a class="btn secondary" href="/tournaments/{t.id}" data-watch>Watch</a>
			{/if}
			{@render manage(t)}
		</div>
		{@render remove(t)}
	</article>
{/snippet}

{#snippet marquee(t: Tournament)}
	{@const f = floor(t)}
	{@const p = played(t)}
	<article class="board-marquee" data-testid="board-marquee">
		<div class="mq-head">
			<a class="title" href="/tournaments/{t.id}"><h3 class="mq-name">{t.name}</h3></a>
			<!-- THE one emerald element on the page. -->
			<span class="tnm-status live tnm-live">Live</span>
		</div>
		<EventRail matches={matchesOf(t.id)} {now} dense />
		{#if f}
			<p class="tnm-label mq-floor-label">
				{f.kind === 'now' ? 'Now playing' : 'Up next'} · {label(t, f.match)}
			</p>
			<div class="mq-pair">
				<EntryBanner
					entry={f.match.entry_a_id ? (byId[f.match.entry_a_id] ?? null) : null}
					style={f.match.entry_a_id ? (styles[f.match.entry_a_id] ?? null) : null}
					size="md"
				/>
				<span class="vs">vs</span>
				<EntryBanner
					entry={f.match.entry_b_id ? (byId[f.match.entry_b_id] ?? null) : null}
					style={f.match.entry_b_id ? (styles[f.match.entry_b_id] ?? null) : null}
					size="md"
				/>
			</div>
		{:else}
			<p class="mq-note">{p.played} of {p.total} matches played</p>
		{/if}
		{@render meta(t, 'live')}
		<div class="tnm-actions">
			<a class="btn" href="/tournaments/{t.id}" data-watch>Watch</a>
			<a class="btn secondary" href="/tournaments/{t.id}/tv">TV mode</a>
			{@render manage(t)}
		</div>
		{@render remove(t)}
	</article>
{/snippet}

<div class="tnm-root board" data-testid="tournament-board">
	{#if showInvites}
		<section class="invites card" data-testid="board-invites">
			<h2>Your invites</h2>
			{#if inviteError}<p class="error" role="alert">{inviteError}</p>{/if}
			{#each myInvites as inv (inv.id)}
				<div class="invite-row">
					<span class="invite-name">{tournamentName(inv.tournament_id)}</span>
					<label class="invite-field">
						<span class="visually-hidden">Display name, shown publicly</span>
						<input
							class="invite-input"
							type="text"
							maxlength="40"
							placeholder="Display name (shown publicly)"
							bind:value={inviteNames[inv.id]}
						/>
					</label>
					<div class="tnm-actions">
						<button
							type="button"
							class="btn"
							disabled={inviteBusyId === inv.id || !inviteNames[inv.id]?.trim()}
							onclick={() => respond(inv.id, true)}
						>
							Accept
						</button>
						<button
							type="button"
							class="btn secondary"
							disabled={inviteBusyId === inv.id}
							onclick={() => respond(inv.id, false)}
						>
							Decline
						</button>
					</div>
				</div>
			{/each}
		</section>
	{/if}

	{#if !tournaments.length}
		<section class="board-card empty" data-testid="board-empty">
			<p>No tournaments yet.</p>
			{#if signedIn}
				<div class="tnm-actions">
					<a class="btn" href="/tournaments/new">New tournament</a>
				</div>
			{/if}
		</section>
	{/if}

	{#each BOARD_LANE_ORDER as lane (lane)}
		{@const rows = lanes[lane]}
		{#if rows.length}
			<section class="lane" data-testid="board-lane-{lane}" data-lane={lane}>
				<p class="tnm-label lane-label">
					{BOARD_LANE_LABELS[lane]}
					<span class="count">{rows.length}</span>
				</p>
				<div class="lane-grid">
					{#each rows as t, i (t.id)}
						{#if lane === 'live' && i === 0}
							{@render marquee(t)}
						{:else}
							{@render card(t, lane)}
						{/if}
					{/each}
				</div>
			</section>
		{/if}
	{/each}
</div>

<style>
	/* The board is a stack of lanes; a lane is a label over a grid of cards.
	   Every colour below is a room token already measured against the room's
	   grounds (tournaments-theme.css, the table under "THE ROOM AT PAGE
	   SCALE"): ink #edede8 14.10:1 on the panel and 12.72 on panel-2, ink-dim
	   #93a09a 6.10 / 5.50, gold #e0ac4e 8.03 / 7.24, accent #0fbe7a 6.83 /
	   6.16. Nothing new is mixed here. */
	.board {
		display: grid;
		gap: 1.8rem;
		font-family: 'Rajdhani', sans-serif;
	}
	.lane {
		display: grid;
		gap: 0.8rem;
		min-width: 0;
	}
	.lane-label {
		font-size: 0.74rem;
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}
	.lane-label .count {
		color: var(--tnm-ink);
		letter-spacing: 0;
	}
	/* Cards take the width the page gives them: `auto-fit` so a lane of two
	   gets two columns and not two plus a void, `min(22rem, 100%)` so the same
	   rule is the single column at 375px with no breakpoint of its own. The
	   marquee spans the whole row whatever the column count. */
	.lane-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(22rem, 100%), 1fr));
		gap: 0.9rem;
		align-items: stretch;
	}
	.board-marquee {
		grid-column: 1 / -1;
	}

	/* A card: the room's flat panel (no bevel, no texture -- the room is flat
	   by its own rule) with the hairline edge every `.card` in the room
	   carries. The marquee takes the STRONG line, because it is the one panel
	   on the page that must read as a different thing from the cards under
	   it; composited over the page plate the strong line measures 1.88:1
	   against #0e1412, which is a decorative rule and not a boundary -- what
	   separates the marquee from the page is its own lighter plate (panel-2)
	   and its size, not the hairline. */
	.board-card,
	.board-marquee {
		box-sizing: border-box;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 1rem 1.1rem 1.1rem;
		border-radius: 10px;
		background: var(--tnm-panel);
		border: 1px solid var(--tnm-line);
		margin: 0;
	}
	.board-marquee {
		background: var(--tnm-panel-2);
		border-color: var(--tnm-line-strong);
		padding: 1.3rem 1.4rem 1.4rem;
		gap: 0.9rem;
	}
	.board-card.empty {
		gap: 0.9rem;
	}
	.board-card.empty p {
		margin: 0;
		color: var(--tnm-ink);
	}

	.card-head,
	.mq-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.8rem;
		min-width: 0;
	}
	/* The title is the tournament's NAME and the card's one link. A component
	   rule outranks the room's `:where()` underline, so the name reads as a
	   heading and the hover restores the quiet underline as the affordance.

	   IT IS A TAP TARGET AND CLEARS 44px AS A `min-height`, NEVER A HEIGHT.
	   MEASURED before this rule by the browser run: the card title link was
	   207.4 x 24.8 px at 375 and 1280.6 x 24.8 px at 1440 (one line of the
	   1.35rem heading, nothing else in the box), under the floor at both
	   widths on the one link a spectator presses most. `inline-flex` with
	   the heading centred keeps the name on the same baseline it had and
	   lets a wrapping name grow the box past the floor rather than clip. */
	.title {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		box-sizing: border-box;
		text-decoration: none;
		color: var(--tnm-ink);
		min-width: 0;
		flex: 1 1 auto;
	}
	/* The hover underline is the room's INK, not its accent: the accent on a
	   hovered title would be a second emerald on a board whose one emerald is
	   the marquee's live chip. */
	.title:hover h3,
	.title:focus-visible h3 {
		text-decoration: underline;
		text-decoration-color: var(--tnm-ink);
		text-underline-offset: 0.18em;
	}
	.title h3 {
		margin: 0;
		font-family: 'Rajdhani', sans-serif;
		font-size: 1.35rem;
		font-weight: 700;
		line-height: 1.15;
		letter-spacing: 0;
		text-transform: none;
		color: var(--tnm-ink);
		overflow-wrap: anywhere;
	}
	/* The marquee's name is sized to be read across a room from the doorway
	   -- it is the answer to "is anything on right now". */
	.title .mq-name {
		font-size: clamp(1.5rem, 3vw, 2.4rem);
		line-height: 1.05;
	}
	.tnm-status {
		flex: none;
		/* The chip holds its line beside a wrapping name. */
		align-self: flex-start;
		margin-top: 0.2rem;
	}
	.desc {
		margin: 0;
		color: var(--tnm-ink-dim);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.meta {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		color: var(--tnm-ink-dim);
	}
	/* Gold is placement only: the champion's name and nothing else on a card. */
	.champ {
		color: var(--tnm-gold);
	}
	/* "You host this" is a fact about the viewer, not a status: dim ink, no
	   accent (the old list painted it emerald, a second emerald per card). */
	.host-tag {
		color: var(--tnm-ink-dim);
		border: 1px solid var(--tnm-line-strong);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
	}
	.tnm-actions {
		margin-top: auto;
	}
	.card-admin {
		padding-top: 0.2rem;
		border-top: 1px solid var(--tnm-line);
	}

	/* The floor of the marquee: the pair playing now (or called next). */
	.mq-floor-label {
		font-size: 0.72rem;
	}
	.mq-pair {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.8rem;
		min-width: 0;
	}
	.vs {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
	}
	@media (max-width: 40rem) {
		.mq-pair {
			grid-template-columns: 1fr;
		}
		.vs {
			justify-self: center;
		}
	}
	.mq-note {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
	}

	/* Invites: moved in from the route unchanged in behaviour. The input is
	   the room's input plate (panel-2) with the room's ink (12.72:1) and a
	   control edge in ink-dim (a `--boundary`-class line, 5.50:1 on that
	   plate). */
	.invites {
		margin: 0;
	}
	.invites h2 {
		margin-top: 0;
	}
	.invite-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.4rem 0;
	}
	.invite-name {
		font-weight: 700;
		min-width: 10rem;
	}
	.invite-field {
		flex: 1 1 12rem;
		min-width: 0;
		display: flex;
	}
	.invite-input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		box-sizing: border-box;
		background: var(--tnm-panel-2);
		border: 1px solid var(--tnm-ink-dim);
		border-radius: 6px;
		color: var(--tnm-ink);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.4rem 0.6rem;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	/* A refusal reads in the room's amber (#d08030, 5.37:1 on the panel),
	   the app's warning colour; crimson stays live/error status. */
	.error {
		margin: 0 0 0.5rem;
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
	}
</style>
