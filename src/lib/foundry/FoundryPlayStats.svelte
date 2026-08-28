<script lang="ts">
	/**
	 * HOW MUCH AN APP HAS BEEN PLAYED. One component, two mounts, one boundary.
	 *
	 * THE AUTHOR MOUNTS IT ON /foundry/mine AND AN ADMIN MOUNTS IT IN THE REVIEW
	 * INSPECTOR, and they render the IDENTICAL thing -- because they are allowed
	 * to see the identical thing. `foundry_app_play_stats` admits the owner of
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
	 * not. It comes from `telemetry.ts` so the four surfaces cannot end up
	 * wording it differently, and it renders whether or not the count is zero.
	 *
	 * ABSENCE IS STILL THE MECHANISM. No `playStats` transport, nothing rendered
	 * -- not an empty panel, not a "not available" card.
	 */
	import { untrack } from 'svelte';
	import {
		FOUNDRY_PLAY_COVERAGE_NOTE,
		formatPlayTime,
		formatPlayers,
		type FoundryPlayStats
	} from './telemetry.ts';
	import type { FoundryPlayStatsTransport } from './transports.ts';

	let {
		appId,
		load = undefined,
		/** Heading level, so the block sits correctly under whichever surface mounts it. */
		heading = 'h3'
	}: {
		appId: string;
		load?: FoundryPlayStatsTransport | undefined;
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

	/** The clock time of the last play, in the reader's own locale. */
	function stamp(iso: string | null): string {
		if (!iso) return 'not yet';
		return new Date(iso).toLocaleString([], {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

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
					<dd data-testid="fdy-last">{stamp(stats.last_played_at)}</dd>
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

	.fdy-plays-note {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--text-2, var(--dim));
		max-width: var(--measure-prose, 42rem);
	}
</style>
