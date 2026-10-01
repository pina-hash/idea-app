<script lang="ts">
	import { untrack } from 'svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import BadgeIcon from '$lib/tournaments/BadgeIcon.svelte';
	import TeamStyleEditor from '$lib/classroom/TeamStyleEditor.svelte';
	import {
		backgroundCss,
		canStyleTeam,
		draftTeam,
		teamLabel,
		teamStyleDraftOf,
		teamStyleVars,
		hasStyle,
		teamStyle,
		type SaveTeamStyleInput,
		type TeamStyleDraft,
		type TeamStyleResult
	} from '$lib/classroom/teams';
	import {
		CLASS_TEAMS_POLL_MS,
		ownTeams,
		postedTeamsNotice,
		withSavedStyle,
		type ClassTeam,
		type ClassTeamSet
	} from '$lib/classroom/class-teams';
	import { page } from '$app/state';
	import { PollSignedOut, startPoller, type Poller, type PollOutcome } from '$lib/classroom/poll';
	import { pollSessionKey, pollSignedOut } from '$lib/classroom/poll-session';

	/**
	 * THE TEAMS A TEACHER POSTED, ON THE CLASS PAGE (ledger 0297, reordered in
	 * ledger 0298 for R23).
	 *
	 * The class reads the same board the People tab posts, through the same
	 * audience-gated read, projected to names (`postedTeamSets`). Three parts,
	 * in this order, and the order is the fix:
	 *
	 *   1. THE STUDENT'S OWN TEAM, OPEN, FIRST. Every own-team card across every
	 *      posted draw comes before any board (`ownTeams`), so a student who
	 *      opens the class sees their team without opening anything, and a
	 *      second draw's card never sits below the first draw's board.
	 *   2. A TEACHER'S ONE-LINE STRIP: "Teams posted until <date>", with the
	 *      People tab one press away. A teacher is on no team, so before it the
	 *      only trace of a posted draw on their own class page was a closed
	 *      board, and a draw the class could see read the same as one nobody
	 *      could. `manage` is null for everyone else, which removes the strip.
	 *   3. THE WHOLE DRAW, A DISCLOSURE, CLOSED BY DEFAULT, because it sits at
	 *      the top of the class pane and thirty names there push the class a
	 *      screen down. The count stays on the trigger, so shutting it hides
	 *      nothing a reader needs to decide whether to open it. A teacher sees
	 *      the board exactly as the class does (role parity).
	 *
	 * NAMES ONLY. The projection this reads carries no address, and nothing
	 * here asks for one.
	 *
	 * IT IS MOUNTED WHETHER OR NOT ANYTHING IS POSTED, AND RENDERS NOTHING WHEN
	 * NOTHING IS (ledger 0298, R23). The section layout's load never re-runs on
	 * a navigation inside the class, so a draw posted after the page loaded
	 * reached nobody who had it open -- the teacher included, pressing the Class
	 * tab straight after posting from People. `refresh` re-asks the same
	 * audience-gated read on `CLASS_TEAMS_POLL_MS` while the tab is visible and
	 * when it comes back into view (the shared poller's rules, ledger 0357);
	 * omitted, the component is what the page load handed it and nothing else
	 * (absence is the mechanism).
	 */
	let {
		sets,
		manage = null,
		today = null,
		refresh = null,
		pollMs = CLASS_TEAMS_POLL_MS,
		style = null
	}: {
		sets: ClassTeamSet[];
		/** Where a teacher manages the draw (the People tab). Null for a student: no strip. */
		manage?: { href: string; label: string } | null;
		/** The loader's school day, so the strip's date prints the year only when it is not this year. */
		today?: string | null;
		/** Re-reads the posted draws: the projection, or null when the read failed. */
		refresh?: (() => Promise<ClassTeamSet[] | null>) | null;
		/**
		 * The refresh cadence. The class page never passes it (the shipped cadence
		 * is `CLASS_TEAMS_POLL_MS`); the dev harness does, so a spec can watch a
		 * draw arrive in seconds rather than wait out a five-minute floor.
		 */
		pollMs?: number;
		/**
		 * THE TEAM STYLE WRITE (ledger 0360, report R17): 0223's membership-gated
		 * `classroom_set_team_style`, through `saveTeamStyle`. ABSENT REMOVES
		 * EVERY CONTROL -- Customize team on a student's own card and Edit look on
		 * a teacher's board -- so a read-only mount is structural, not a flag.
		 */
		style?: ((input: SaveTeamStyleInput) => Promise<TeamStyleResult>) | null;
	} = $props();

	/**
	 * The page load's answer, overlaid with whatever a refresh has since
	 * learned -- HallPass's `local` pattern, keyed on WHICH page-load answer it
	 * overlays. When the page's own `sets` move (a reload, `invalidateAll` after
	 * a post, another class), the overlay no longer matches and the page load
	 * wins again. `$state.raw`, so `over` stays the very array it was read over
	 * and the identity test means what it says. A failed refresh keeps what is
	 * on screen.
	 */
	let local = $state.raw<{ over: ClassTeamSet[]; sets: ClassTeamSet[] } | null>(null);
	const shown = $derived(local && local.over === sets ? local.sets : sets);

	const own = $derived(ownTeams(shown));
	const notice = $derived(manage ? postedTeamsNotice(shown, today) : null);

	/**
	 * THE POLL, ON THE SHARED POLLER (ledger 0357). `$lib/classroom/poll` owns the
	 * cadence: out of step with the rest of the class, one call in flight, ONE
	 * call per return to the tab (this widget used to tick on both
	 * `visibilitychange` and `focus`, which is why the board was asked two or three
	 * times a tick), a backoff when the database is failing, and a stop handed to
	 * the app's signed-out handling when the session is gone. The effect reads
	 * `refresh` and nothing else, the poller is started untracked, and the call
	 * itself is untracked. A sequence number drops an answer that arrives after a
	 * newer one, and an answer identical to what is on screen writes nothing.
	 */
	let poller: Poller | null = null;
	$effect(() => {
		const read = refresh;
		if (!read || typeof document === 'undefined') return;
		let alive = true;
		let asked = 0;
		const run = async (): Promise<PollOutcome> => {
			const mine = ++asked;
			// The page-load answer this ask is about. If the page's own data moves
			// while the ask is in flight (another class, `invalidateAll`), the
			// answer is about a page that is gone and is dropped.
			const over = sets;
			let next: ClassTeamSet[] | null;
			try {
				next = await untrack(() => read());
			} catch (e) {
				return e instanceof PollSignedOut ? 'signed-out' : 'failed';
			}
			// A failed refresh keeps what is on screen.
			if (!next) return 'failed';
			if (!alive || mine !== asked || over !== sets) return 'ok';
			const onScreen = local && local.over === over ? local.sets : over;
			if (JSON.stringify(next) === JSON.stringify(onScreen)) return 'ok';
			local = { over, sets: next };
			return 'ok';
		};
		const p = untrack(() =>
			startPoller({ intervalMs: pollMs, run, onSignedOut: pollSignedOut })
		);
		poller = p;
		return () => {
			alive = false;
			p.stop();
			if (poller === p) poller = null;
		};
	});
	$effect(() => {
		const key = pollSessionKey(page.data.claims);
		untrack(() => poller?.authChanged(key));
	});

	/* -------------------------------------------------------------------------
	 * CUSTOMIZING A TEAM (ledger 0360, report R17). The write existed since 0223
	 * and nothing on this page offered it, which is the whole of the report.
	 *
	 * ONE EDITOR AT A TIME, keyed on where it was opened: a student's own card
	 * at the top, or a teacher's board card. The DRAFT LIVES HERE, not in the
	 * editor, because every render of that team -- the own card and its card on
	 * the board -- previews it, so what a student sees while choosing is what
	 * the class will see. It is seeded in the press that opens the editor, never
	 * in an effect, so no prop is read into state at mount.
	 *
	 * NOTHING HERE TOUCHES THE POLL. A save lays the saved fields over what is on
	 * screen (`withSavedStyle`, the same overlay a refresh writes) and then asks
	 * the existing poller for ONE re-read (`runNow`), which confirms the save and
	 * picks up a classmate's change made at the same moment. That is one RPC and
	 * one board read per Save, and nothing per minute; the cadence, the run and
	 * `CLASS_TEAMS_POLL_MS` are 0357's and are unchanged.
	 * ---------------------------------------------------------------------- */
	const manager = $derived(manage !== null);
	let editing = $state<{ key: string; teamId: string; draft: TeamStyleDraft } | null>(null);
	/** The live region's words after a save. Always mounted; only its text moves. */
	let savedNote = $state('');

	const editorKey = (setId: string, teamId: string, where: 'own' | 'board') => `${where}-${setId}-${teamId}`;

	function toggleEditor(setId: string, team: ClassTeam, where: 'own' | 'board') {
		const key = editorKey(setId, team.id, where);
		savedNote = '';
		editing = editing?.key === key ? null : { key, teamId: team.id, draft: teamStyleDraftOf(team) };
	}

	function saved(input: SaveTeamStyleInput) {
		local = { over: sets, sets: withSavedStyle(shown, input) };
		editing = null;
		savedNote = 'Saved. Your class sees the new look.';
		poller?.runNow();
	}

	/** What a card draws: the team, or the draft laid over it while that team is being customized. */
	const look = (team: ClassTeam): ClassTeam =>
		editing && editing.teamId === team.id ? draftTeam(team, editing.draft) : team;
</script>

{#snippet card(stored: ClassTeam, isOwn: boolean, setId: string)}
	{@const team = look(stored)}
	{@const where = isOwn ? 'own' : 'board'}
	{@const key = editorKey(setId, stored.id, where)}
	{@const control = style ? (isOwn ? canStyleTeam(stored, false) : manager) : false}
	<div
		class="ct-card"
		class:has-style={hasStyle(teamStyle(team))}
		class:has-bg={!!backgroundCss(teamStyle(team))}
		class:own={isOwn}
		style={teamStyleVars(team)}
		data-testid={isOwn ? 'class-team-mine' : 'class-team'}
	>
		<h3 class="ct-name">
			<span class="ct-name-text">{teamLabel(team)}</span>
			{#if team.badge}
				<!-- The badge takes the ink, never the accent: it is a glyph somebody
				     chose to display, so it is READ (IdentityBanner's measured rule). -->
				<span class="ct-badge" data-testid="class-team-badge"><BadgeIcon id={team.badge} size="1.05em" /></span>
			{/if}
		</h3>
		{#if team.tagline}<p class="ct-tagline">{team.tagline}</p>{/if}
		<ul class="ct-members">
			{#each team.members as name, i (i)}
				<li>{name}</li>
			{/each}
		</ul>
		{#if control}
			<div class="ct-card-tools">
				<button
					type="button"
					class="btn secondary tiny"
					class:on={editing?.key === key}
					aria-expanded={editing?.key === key}
					aria-controls="team-style-{key}"
					data-testid={isOwn ? 'class-team-customize' : 'class-team-edit-look'}
					onclick={() => toggleEditor(setId, stored, where)}
				>
					{#if editing?.key === key}Close{:else if isOwn}Customize team{:else}Edit look{/if}
				</button>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet editor(stored: ClassTeam, setId: string, where: 'own' | 'board')}
	{@const key = editorKey(setId, stored.id, where)}
	{#if style && editing && editing.key === key}
		<TeamStyleEditor
			id="team-style-{key}"
			team={stored}
			bind:draft={
				// A FUNCTION BINDING, so the editor's own bindings never read a
				// draft through a `null` while the block holding them tears down.
				() => editing?.draft ?? teamStyleDraftOf(stored),
				(next) => {
					if (editing) editing.draft = next;
				}
			}
			who={where === 'own' ? 'member' : 'teacher'}
			onsave={style}
			onsaved={saved}
			oncancel={() => (editing = null)}
		/>
	{/if}
{/snippet}

{#if shown.length}
<section class="ct-root" data-testid="class-teams" aria-label="Teams">
	{#each own as o (`${o.set.id}:${o.team.id}`)}
		<div class="ct-mine" data-testid="class-team-mine-wrap">
			<p class="ct-mine-label">
				Your team · {o.set.label}{#if o.set.edited}<span class="ct-edited" data-testid="class-teams-edited"
						>&nbsp;· Edited by hand</span
					>{/if}
			</p>
			{@render card(o.team, true, o.set.id)}
			{@render editor(o.team, o.set.id, 'own')}
		</div>
	{/each}

	<!-- ALWAYS MOUNTED WHILE THE REGION IS, ONLY ITS TEXT MOVES: a live region a
	     screen reader was not already observing is often not announced. -->
	{#if style}
		<p class="ct-saved" role="status" data-testid="class-team-saved">{savedNote}</p>
	{/if}

	{#if manage && notice}
		<p class="ct-posted" data-testid="class-teams-posted">
			<span class="ct-posted-text">{notice}</span>
			<a class="btn tiny ct-posted-link" href={manage.href} data-testid="class-teams-manage">
				Manage in {manage.label}
			</a>
		</p>
	{/if}

	{#each shown as set (set.id)}
		<Disclosure
			label={`All teams · ${set.label}`}
			scope={`class-teams:${set.id}`}
			collapseWhen={true}
			testId="class-teams-board"
		>
			{#snippet meta()}
				<span class="ct-count">{set.teams.length} team{set.teams.length === 1 ? '' : 's'}</span>
				{#if set.edited}
					<!-- Decision 44: a hand edit is marked, not hidden, in words. -->
					<span class="ct-count ct-edited" data-testid="class-teams-edited">Edited by hand</span>
				{/if}
			{/snippet}
			<div class="ct-cards">
				{#each set.teams as team (team.id)}
					{@render card(team, false, set.id)}
				{/each}
			</div>
			<!-- A teacher's editor opens UNDER the columns, at the board's full
			     width: inside a 13rem column it would wrap every swatch row. -->
			{#each set.teams as team (team.id)}
				{@render editor(team, set.id, 'board')}
			{/each}
		</Disclosure>
	{/each}
</section>
{/if}

<style>
	.ct-root {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		min-width: 0;
	}
	/* NEVER BOUNDED TO THE PANE'S HEIGHT. Above 1024px split.css gives every
	   DIRECT child of the class pane `max-height: 100%` (so a bounded surface
	   can keep its header while its body scrolls), and this region is a direct
	   child there. Measured at 1440 with the team style editor open (ledger
	   0360): the region overflowed its capped box and the class page's own
	   header, the next sibling, painted over the editor's Save, which a hit
	   test at Save's centre answered as the h1. This region is content in the
	   pane's flow, so the pane scrolls instead. The selector outranks
	   split.css's (0,4,0) on purpose, and names the split only to do that. */
	:global(.cr-root .cr-split .cr-nav) > .ct-root {
		max-height: none;
	}
	/* One card, not a banner across the class pane: the width of a team card
	   on the board below, a little more. */
	.ct-mine {
		max-width: 32rem;
		min-width: 0;
	}
	.ct-mine-label {
		margin: 0 0 var(--space-1);
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--text-2);
	}
	/* The teacher's strip. One line where the pane allows it, wrapping (never
	   clipping) where it does not; the link keeps its own 44px floor through
	   the classroom's `.btn.tiny`. The own card's width, not the pane's: at
	   1440 a full-width strip put the link 950px from the words it acts on. */
	.ct-posted {
		max-width: 32rem;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1) var(--space-2);
		margin: 0;
		min-width: 0;
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
	}
	.ct-posted-text {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.ct-posted-link {
		flex: none;
		text-decoration: none;
	}
	.ct-count {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
	}
	/* Cards of unequal height side by side: a multi-column container, capped,
	   the People tab's own arrangement for the same cards. */
	.ct-cards {
		columns: 13rem 4;
		column-gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.ct-card {
		break-inside: avoid;
		margin-bottom: var(--space-2);
		min-width: 0;
		padding: var(--space-2) var(--space-3);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-left: 4px solid var(--team-accent, var(--boundary));
		border-radius: var(--radius-card);
		color: var(--text-1);
	}
	/* THE STUDENTS' COLOURS ARE A WASH OVER THE CARD, NEVER A FILL UNDER THE
	   TEXT (ledger 0360, R17), and that is IdentityBanner's measured rule rather
	   than a taste one. A student may pick ANY background, and with the colour
	   painted at full strength `bannerInk`'s light-or-dark choice bottoms out at
	   1.90:1 (a mid olive, #a5b478) against the 4.5:1 a name needs. Laid over
	   the card's own ground at 0.22, the ink is the room's `--text-1`, which
	   every theme has measured against its own card, so legibility is a
	   property of the construction for a colour nobody has picked yet.
	   `--team-ink` is no longer read here. As a layer rather than a
	   `background`, so the opacity is the colour's and never the text's. */
	.ct-card.has-style {
		position: relative;
		overflow: hidden;
	}
	.ct-card.has-bg::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--team-bg);
		opacity: 0.22;
		pointer-events: none;
	}
	.ct-card.has-style > * {
		position: relative;
		z-index: 1;
	}
	/* The student's own card sits alone in the pane, so it drops the gap the
	   board's columns need under each card. */
	.ct-mine .ct-card {
		margin-bottom: 0;
	}
	.ct-name {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0 0 0.2rem;
		font-size: 1rem;
		line-height: 1.3;
		color: var(--text-1);
	}
	.ct-name-text {
		min-width: 0;
		overflow-wrap: break-word;
	}
	/* The badge is read like the name, so it takes the name's ink. */
	.ct-badge {
		display: inline-flex;
		flex: none;
		color: var(--text-1);
	}
	.ct-tagline {
		margin: 0 0 0.3rem;
		font-style: italic;
		font-size: 0.85rem;
		color: var(--text-1);
	}
	.ct-card-tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}
	.ct-saved {
		margin: 0;
		color: var(--text-1);
	}
	/* Empty, it takes no place in the column (an absolutely placed child is
	   out of the flex flow, so it adds no gap) and stays in the tree, so a
	   screen reader that was observing it hears the sentence when it lands. */
	.ct-saved:empty {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
	/* One name a line, no bullet: the plate draws the card, and a disc beside
	   every name was the browser's look, not the room's (ledger 0360). */
	.ct-members {
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
