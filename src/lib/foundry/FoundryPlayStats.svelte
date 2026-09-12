<script lang="ts">
	/**
	 * HOW MUCH AN APP HAS BEEN PLAYED. One component, two mounts, one boundary.
	 *
	 * THE AUTHOR MOUNTS IT ON /foundry/mine AND AN ADMIN MOUNTS IT IN THE REVIEW
	 * INSPECTOR, and they render the IDENTICAL thing -- because they are allowed
	 * to see the identical thing. Since 0204 `foundry_app_play_stats` admits
	 * anybody who can SEE the app (decision 07, answered public), not the owner of
	 * the app and `is_admin()`, and returns the same four scalars to both. There
	 * is no staff branch in this file and there must not be one: what an admin
	 * gets that an author does not is OTHER APPS, never more detail about one.
	 *
	 * FOUR NUMBERS AND NO ROWS. Plays, how many different people, how long in
	 * total, and when it was last opened. There is no list of players, no
	 * per-play line, no "who is playing it most" and no parameter through which
	 * any of those could be asked for -- not because the interface leaves them
	 * out, but because the function behind it has no shape in which it could
	 * answer. This is student data in a school and the boundary is the feature.
	 *
	 * WHICH MEANS THE ABSENCE HERE IS NOT A DESIGN GAP TO BE FILLED IN LATER. An
	 * author asking "who played it" and a reviewer asking "which student is
	 * using this" both get the same answer, and it is the same answer for the
	 * same reason.
	 *
	 * THE COVERAGE SENTENCE IS PART OF THE FIGURE, NOT A FOOTNOTE. A play opened
	 * from the app's own share link runs on the apps origin with no portal
	 * around it, so nothing counts it. A figure shown without that sentence is a
	 * figure a student will read as "how many people used my app", which it is
	 * not. It comes from `telemetry.ts` so no surface can end up wording it
	 * differently, and it renders whether or not the count is zero. (A count of
	 * those surfaces stood here and said "four"; it is a figure a commit moves.)
	 *
	 * ABSENCE IS STILL THE MECHANISM. No `playStats` transport, nothing rendered
	 * -- not an empty panel, not a "not available" card.
	 *
	 * AND THERE IS A SECOND LAYER NOW, SEPARATELY ABSENT (decision 07, answered
	 * public by Mr. Pina on 2026-09-12; `foundry_my_play_stats`, 0204). The
	 * block above is the app's PUBLIC TOTALS; the block below it is THE VIEWER'S
	 * OWN time with this one app. They are two transports rather than one with a
	 * mode, because the database is two functions rather than one with a
	 * parameter, and for the same reason: the personal one takes no identity
	 * argument, so "only your own" is a property of the signature.
	 *
	 * THE PERSONAL BLOCK IS ABSENT FOR SOMEBODY WHO HAS NEVER PLAYED, and that
	 * is a decision about what a zero says rather than a saving. A row reading
	 * "0 sessions / 0s / not yet" under "Your time with it" answers a question
	 * the reader did not ask and turns a page about somebody's work into a
	 * scoreboard about the reader. `hasOwnPlaytime` in `telemetry.ts` is the one
	 * statement of the rule; nothing here re-derives it.
	 *
	 * THE PERSONAL BLOCK IS STILL NOT A PER-PLAYER READ, AND THE SENTENCE BELOW
	 * STAYS TRUE. "Nobody can see which students played an app" is about OTHER
	 * people; a caller reading their own row learns nothing about anybody else,
	 * because there is no argument through which anybody else could be named.
	 */
	import { untrack } from 'svelte';
	import {
		FOUNDRY_PLAY_COVERAGE_NOTE,
		formatPlayStamp,
		formatPlayTime,
		formatPlayers,
		hasOwnPlaytime,
		type FoundryMyPlayStats,
		type FoundryPlayStats
	} from './telemetry.ts';
	import type {
		FoundryMyPlayStatsTransport,
		FoundryPlayStatsTransport
	} from './transports.ts';

	let {
		appId,
		load = undefined,
		/**
		 * `foundry_my_play_stats`, THE SECOND LAYER, AND IT IS SEPARATELY
		 * OPTIONAL FROM THE FIRST.
		 *
		 * Decision 07 is two layers and they are two transports, so a surface
		 * gets exactly the ones it hands over. `/foundry/mine` and
		 * `/foundry/review` pass only `load` and render precisely what they
		 * rendered before this existed; the gallery's detail pane passes both.
		 * There is no mode, no flag and no boolean that could be got wrong --
		 * each block is present because its own reader is.
		 */
		loadMine = undefined,
		/** Heading level, so the block sits correctly under whichever surface mounts it. */
		heading = 'h3'
	}: {
		appId: string;
		load?: FoundryPlayStatsTransport | undefined;
		loadMine?: FoundryMyPlayStatsTransport | undefined;
		heading?: 'h3' | 'h4';
	} = $props();

	let stats = $state<FoundryPlayStats | null>(null);
	let loading = $state(false);
	/**
	 * TRUE ONLY AFTER AN ANSWER CAME BACK NULL, which is a real state and not an
	 * error: an app whose figures this caller may not read. It cannot happen on
	 * either surface as mounted -- the author owns the app and the admin passes
	 * `is_admin()` -- so it renders one quiet sentence rather than a problem.
	 */
	let refused = $state(false);

	/**
	 * RE-READ WHEN THE APP CHANGES, and clear everything belonging to the
	 * previous one first, so a stale figure is never shown under a new title.
	 *
	 * Only `appId` is read tracked, and there are TWO independent reasons for
	 * that, both of which have to hold.
	 *
	 * The body WRITES `stats`, `loading` and `refused`, so reading any of them
	 * here would take a dependency on state this effect itself moves. That much
	 * was already written down, and it stops one step short: it accounts only
	 * for what THIS file reads, and says nothing about what `load` reads.
	 *
	 * `load` is INJECTED -- written by whoever mounts this component, who cannot
	 * see this effect -- so everything it touches reactively before its first
	 * `await` would join this effect's dependency set too, and anything it
	 * writes would re-trigger the effect. A harness transport that merely read a
	 * fixture array and appended a log line is already a non-terminating loop.
	 * So the CALL is untracked while `appId` stays tracked. See the
	 * injected-callback rule in CLAUDE.md.
	 */
	$effect(() => {
		const id = appId;
		stats = null;
		refused = false;
		if (!load) return;
		loading = true;
		untrack(() => load(id))
			.then((r) => {
				// The subject may have moved on while this was in flight.
				if (appId !== id) return;
				if (r) stats = r;
				else refused = true;
			})
			.catch(() => {
				// Silent. A figure that did not load is a figure not shown; it is
				// never an error banner over somebody's work.
				if (appId === id) refused = true;
			})
			.finally(() => {
				if (appId === id) loading = false;
			});
	});

	/**
	 * THE VIEWER'S OWN ROW, READ THE SAME WAY AND WITH THE SAME UNTRACKING.
	 *
	 * A SECOND EFFECT RATHER THAN A SECOND CALL INSIDE THE FIRST, so a surface
	 * that hands over one transport and not the other is not waiting on a
	 * promise it never made, and a failure of either read cannot take the other
	 * block down with it. The two answers are independent and so are the two
	 * renders.
	 *
	 * `loadMine` IS INJECTED, so the CALL is untracked and only `appId` is read
	 * tracked -- the identical argument as the effect above, for the identical
	 * reason: whatever a caller's transport touches reactively before its first
	 * `await` would otherwise join this effect's dependency set. See the
	 * injected-callback rule in CLAUDE.md.
	 *
	 * THERE IS NO `refused` TWIN. Null from this read is the ORDINARY answer --
	 * no session, an app outside the caller's population, or a deployment
	 * without 0204 -- and it is indistinguishable from "never played", which
	 * also renders nothing. A sentence explaining the absence of a figure about
	 * yourself that you have not earned would be noise on most pages in the
	 * gallery.
	 */
	let mine = $state<FoundryMyPlayStats | null>(null);

	$effect(() => {
		const id = appId;
		mine = null;
		if (!loadMine) return;
		untrack(() => loadMine(id))
			.then((r) => {
				if (appId === id) mine = r;
			})
			.catch(() => {
				// Silent, exactly as above. Nothing renders and nothing is said.
			});
	});

	/**
	 * THE ROW TO RENDER, OR NOTHING. One place where `hasOwnPlaytime` is asked,
	 * so the markup has a single truthiness test rather than a predicate call
	 * and a null check that could one day disagree.
	 */
	const myRow = $derived(hasOwnPlaytime(mine) ? mine : null);
</script>

<!--
	THE OUTER GATE IS `load` AND NOT `load || loadMine`, DELIBERATELY, so a
	mounting that hands over the personal transport alone renders NOTHING.

	The public totals are the floor the personal row is read against: "you have
	played this for twenty minutes" is a fact a reader can do nothing with until
	they can see it beside the app's own total, and a lone personal row also has
	no heading that would be true of it ("How much it has been played" is about
	the app). No shipping surface passes one without the other; the case is
	pinned by a test rather than left to be discovered.
-->
{#if load}
	<section class="fdy-plays" data-testid="foundry-play-stats">
		{#if heading === 'h4'}
			<h4>How much it has been played</h4>
		{:else}
			<h3>How much it has been played</h3>
		{/if}

		{#if loading && !stats}
			<p class="fdy-plays-note">Reading...</p>
		{:else if refused}
			<p class="fdy-plays-note">These figures are not available here.</p>
		{:else if stats}
			<!--
				A DEFINITION LIST, because each figure is a term and a value rather
				than a row of a table -- and because the label has to sit WITH the
				number for a screen reader, not in a header cell somewhere else.
			-->
			<dl class="fdy-plays-grid">
				<div>
					<dt>Plays</dt>
					<dd data-testid="fdy-plays">{stats.plays}</dd>
				</div>
				<div>
					<dt>Different players</dt>
					<dd data-testid="fdy-players">{formatPlayers(stats.players)}</dd>
				</div>
				<div>
					<dt>Total time played</dt>
					<dd data-testid="fdy-seconds">{formatPlayTime(stats.seconds_played)}</dd>
				</div>
				<div>
					<dt>Last played</dt>
					<dd data-testid="fdy-last">{formatPlayStamp(stats.last_played_at)}</dd>
				</div>
			</dl>
		{/if}

		<!--
			THE SENTENCE RENDERS WITH THE BLOCK, not with the numbers, so it is
			there in the state where the figures are all zero -- which is exactly
			when somebody is most likely to read a zero as "nobody has opened it".
		-->
		<p class="fdy-plays-note">{FOUNDRY_PLAY_COVERAGE_NOTE}</p>
		<!--
			SAID IN WORDS RATHER THAN LEFT TO BE INFERRED FROM AN EMPTY PANEL. The
			question "who played it" is the first one anybody asks of a figure like
			this, and the answer is a rule rather than a missing feature.
		-->
		<p class="fdy-plays-note">
			Nobody can see which students played an app, including staff. These are counts only.
		</p>

		{#if myRow}
			<!--
				LAYER TWO: THE VIEWER'S OWN TIME, INSIDE THE SAME SECTION.

				It is one block on screen because it is one subject -- how much this
				app has been played, and how much of that was you. Splitting it into
				a section of its own would mean a second coverage note (the same
				sentence, twice, on one page) or a personal figure with no coverage
				note at all, and the second is how a student reads their own twenty
				minutes as everything they ever played rather than everything the
				portal saw.

				IT IS THE LAST THING IN THE BLOCK, under the two rules above rather
				than above them, so the page reads outward-then-inward: what this
				app is, then what everyone did with it, then what you did. Putting
				it first would answer a question about the reader before answering
				the one they opened the page for.
			-->
			<h4 class="fdy-plays-mine-head">Your time with it</h4>
			<dl class="fdy-plays-grid" data-testid="foundry-my-play-stats">
				<div>
					<dt>Your sessions</dt>
					<dd data-testid="fdy-my-plays">{myRow.plays}</dd>
				</div>
				<div>
					<dt>Your time played</dt>
					<dd data-testid="fdy-my-seconds">{formatPlayTime(myRow.seconds_played)}</dd>
				</div>
				<div>
					<dt>First played</dt>
					<dd data-testid="fdy-my-first">{formatPlayStamp(myRow.first_played_at)}</dd>
				</div>
				<div>
					<dt>Last played</dt>
					<dd data-testid="fdy-my-last">{formatPlayStamp(myRow.last_played_at)}</dd>
				</div>
			</dl>
			<!--
				WHOSE FIGURES THESE ARE, IN WORDS. Four numbers under four labels
				that all begin "Your" is still four numbers sitting immediately
				below four numbers that mean something else, and a reader scanning
				the page owes nothing to our column headings. One sentence costs a
				line and removes the only way to misread the pair.
			-->
			<p class="fdy-plays-note">
				Only you can see this row. It counts your own sessions with this app, not anybody
				else's.
			</p>
		{/if}
	</section>
{/if}

<style>
	.fdy-plays {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}

	.fdy-plays h3,
	.fdy-plays h4 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}

	/*
	   `auto-fit` with a `min()` track, the pattern the gallery grid uses: four
	   figures across where there is room, and one column when the pane is narrow,
	   with no breakpoint of its own. 9rem is the width at which the longest
	   value ("Different players" over "12 people") stops wrapping mid-phrase.
	*/
	.fdy-plays-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr));
		gap: var(--space-3, 0.75rem);
		margin: 0.15rem 0 0;
		padding: var(--space-3, 0.75rem);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-md, 8px);
		background: var(--surface-1, var(--bg1));
		min-width: 0;
	}

	.fdy-plays-grid > div {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}

	.fdy-plays-grid dt {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--text-2, var(--dim));
		overflow-wrap: anywhere;
	}

	/*
	   The figure itself is the display face at reading size: these are values
	   somebody scans, and the label above each one is the metadata.
	*/
	.fdy-plays-grid dd {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.15rem;
		color: var(--text-1, var(--white));
		overflow-wrap: anywhere;
	}

	/*
	   The personal layer's own heading, one step quieter than the block's: it is
	   a subdivision of "How much it has been played" and not a second topic. It
	   is an `h4` unconditionally, where the block heading is a prop -- an `h4`
	   under an `h3` is correct, and an `h4` under an `h4` is the flat case the
	   inspector already renders elsewhere, which a screen reader handles as a
	   sibling rather than as a skipped level.
	*/
	.fdy-plays-mine-head {
		margin: 0.5rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}

	.fdy-plays-note {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--text-2, var(--dim));
		max-width: var(--measure-prose, 42rem);
	}
</style>
