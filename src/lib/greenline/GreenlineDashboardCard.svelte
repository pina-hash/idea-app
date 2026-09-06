<script lang="ts">
	import { pendingBreakdown, pendingLabel, type GreenlinePending } from '$lib/greenline/moderation';

	/**
	 * The dashboard's way into GREENLINE moderation.
	 *
	 * WHAT WAS WRONG WITH IT. This card was three lines of markup inside
	 * `/dashboard/+page.svelte` reading:
	 *
	 *     Community Track Moderation
	 *     Published GREENLINE community tracks: reports, star ratings,
	 *     completion telemetry, featuring (ranked eligibility + IC payout),
	 *     and removal.
	 *
	 * Every noun in that sentence is about a track that is ALREADY PUBLISHED,
	 * which is 0057's model: a student published, and a teacher moderated what
	 * was already live. 0059 inverted it -- a submitted track waits at
	 * `status = 'pending'` and is not on any leaderboard until somebody
	 * approves it -- so the one entry point to the queue described the
	 * SUPERSEDED flow, and a teacher reading it had no reason to think anybody
	 * was waiting. It carried no count either, so the card looked identical
	 * whether the queue held nothing or held six students' work.
	 *
	 * THE COUNT COMES FROM `loadGreenlinePending` AND FROM NOWHERE ELSE. That
	 * module is already the one reader of "what is waiting on a teacher" and
	 * already backs GREENLINE's own title screen; a second count computed here
	 * is exactly how a badge comes to read zero over a queue with three rows in
	 * it. The wording comes from `pendingLabel`/`pendingBreakdown` for the same
	 * reason -- the title screen and this card must not describe one state two
	 * ways.
	 *
	 * ZERO IS A SENTENCE AND LOOKS DELIBERATE. `pendingLabel` answers "NOTHING
	 * AWAITING REVIEW" at zero rather than rendering an empty badge, because a
	 * badge that vanishes at zero is indistinguishable from a badge that broke
	 * -- which is the state this whole lane exists because nobody could tell
	 * apart. `ready: false` (a pre-0051/0059 deployment, or a read that failed)
	 * is the THIRD answer and is not zero: it says the count is unavailable
	 * rather than claiming the queue is empty.
	 *
	 * PRESENTATION ONLY. The card takes a finished `GreenlinePending` and emits
	 * nothing; `/dashboard` is already admin-gated at its load and
	 * `/greenline/moderation` 404s anyone else, so nothing here is a boundary.
	 */
	let { pending }: { pending: GreenlinePending } = $props();

	const label = $derived(pendingLabel(pending));
	const breakdown = $derived(pendingBreakdown(pending));
	const waiting = $derived(pending.ready && pending.total > 0);
</script>

<div class="course-card visible" data-testid="greenline-moderation-card">
	<div class="course-header">
		<div class="course-header-left">
			<div class="course-id">GREENLINE Review Queue</div>
			<div class="course-updated">
				Community tracks and custom decals students have submitted and are waiting on. A track
				stays off every leaderboard until it is approved, and a decal stays invisible to other
				players, so nothing here is live yet. The panel also carries reports, star ratings,
				completion telemetry, featuring and removal for tracks that are already published.
			</div>
			<!-- GLYPH AND WORD, never the count alone: the tone below is a hue and
			     the rule is that colour is never the only signal. The label already
			     says "AWAITING REVIEW" or "NOTHING AWAITING REVIEW" in words, and
			     the breakdown names which queue rather than leaving a bare total a
			     teacher cannot act on ("2 tracks, 1 decal" says which page to
			     open; a bare 3 does not). -->
			<p class="gl-pending" class:waiting data-testid="greenline-pending">
				<span class="gl-glyph" aria-hidden="true">{waiting ? '●' : '○'}</span>
				<span data-testid="greenline-pending-label">{label}</span>
				{#if breakdown}
					<span class="gl-breakdown" data-testid="greenline-pending-breakdown">{breakdown}</span>
				{/if}
			</p>
		</div>
		<div class="course-meta">
			<a class="btn secondary" href="/greenline/moderation">Open panel</a>
		</div>
	</div>
</div>

<style>
	.gl-pending {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0.55rem 0 0;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		/* --dim clears only the darkest of the three portal grounds; this card
		   sits on --bg1 where it measures 4.46:1. --text-2 is the register's own
		   token for secondary meta and clears all three. */
		color: var(--text-2);
	}
	/* --green is "active navigation, focus, success and completion" in this
	   register, and a queue with work in it is none of those. --amber is the
	   warning token and is what an unattended queue is. */
	.gl-pending.waiting {
		color: var(--amber);
	}
	.gl-breakdown {
		color: var(--text-2);
	}
</style>
