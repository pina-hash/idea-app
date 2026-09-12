<script lang="ts">
	import PresenceChip from './PresenceChip.svelte';
	import {
		PRESENCE_NEVER_OPENED,
		presenceActiveLabel,
		presenceLastWorkedLabel,
		presenceState,
		type PresenceLimits,
		type PresenceRow
	} from './state';

	/**
	 * ONE STUDENT'S PRESENCE, ON ONE LINE: the state, when they last worked, and
	 * how long they have actually worked. Those are the three things Mr. Pina
	 * asked to be able to see, and this is the only place they are drawn.
	 *
	 * `now` IS THREADED IN FROM THE CALLER and this component never reads a
	 * clock. Thirty rows each asking `Date.now()` at slightly different moments
	 * is thirty answers to one question, and the console's own `now` is what the
	 * roster is being rendered at.
	 *
	 * A MISSING ROW IS "NOT OPENED", NOT "AWAY", and the difference is the one an
	 * instructor cares about at the start of a period: away is somebody who was
	 * here, not-opened is somebody who never arrived. It renders with no chip at
	 * all, because a chip would put it in the same vocabulary as the four states
	 * and it is not one of them -- it is the absence of a row.
	 */
	let {
		row = null,
		now,
		limits
	}: {
		row?: PresenceRow | null;
		now: number;
		limits: PresenceLimits;
	} = $props();

	const state = $derived(row ? presenceState(row, now, limits) : null);
</script>

{#if row && state}
	<span class="pline" data-testid="presence-line">
		<PresenceChip {state} compact />
		<span class="pmeta" data-testid="presence-worked"
			>{presenceLastWorkedLabel(row.last_input_at, now)}</span
		>
		<span class="psep" aria-hidden="true">&middot;</span>
		<!-- THE WORD IS BESIDE THE FIGURE, ALWAYS. A bare "24m" on a roster row
		     is a duration of something unstated, and the thing a reader guesses
		     is "time since", which is the other number on this line. -->
		<span class="pmeta" data-testid="presence-active"
			>{presenceActiveLabel(row.active_seconds)} active</span
		>
	</span>
{:else}
	<span class="pline" data-testid="presence-line">
		<span class="pmeta pnever" data-testid="presence-never">{PRESENCE_NEVER_OPENED}</span>
	</span>
{/if}

<style>
	.pline {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem;
		/* An item's automatic minimum is its min-content, so without this a
		   `nowrap` chip forces the whole roster column wider than the pane. */
		min-width: 0;
	}
	.pmeta {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		/* `--text-2` AND NOT `--dim`: this line sits on `--surface-1` and on
		   `--surface-2` depending on whether the row is selected, and `--dim`
		   clears only the darkest of the three grounds in this register. */
		color: var(--text-2);
		white-space: nowrap;
	}
	.pnever {
		font-style: normal;
	}
	/* A SEPARATOR GLYPH IS A BOUNDARY AND TAKES THE BOUNDARY TOKEN, never a
	   hairline: a hairline weight is authored to sit below every text threshold,
	   which is correct for a line drawn beside content and wrong for a mark
	   drawn AS content. */
	.psep {
		color: var(--boundary);
		font-size: 0.7rem;
	}
</style>
