<script lang="ts">
	import PresenceChip from './PresenceChip.svelte';
	import {
		PRESENCE_NEVER_OPENED,
		PRESENCE_UNKNOWN,
		presenceActiveLabel,
		presenceLastWorkedLabel,
		presenceLineKind,
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
	 * ------------------------------------------------------------------------
	 * A MISSING ROW IS THREE DIFFERENT ANSWERS AND THIS USED TO PRINT ONE.
	 * ------------------------------------------------------------------------
	 *
	 * It was two branches -- a row, or `PRESENCE_NEVER_OPENED` -- so "Not opened"
	 * was also what a payload that had not arrived yet printed, what a deployment
	 * with no `classroom_presence_state` printed, and what a swallowed network
	 * error printed. Mr. Pina filed it on 2026-09-12 from the other end: a row
	 * reading "Returned 18/20" with "Not opened" underneath it. Reproduced on all
	 * four paths in `tests/dom/presence-console-mount.test.ts`.
	 *
	 * `presenceLineKind` IS THE DECISION AND IT IS NOT MADE HERE. The two facts
	 * this component cannot know -- whether presence answered at all, and whether
	 * anything of this student's has arrived -- come in as props, and the ORDER
	 * they are weighed in lives in `state.ts` beside the words, so a caller and a
	 * renderer cannot come to disagree about which of them is printing.
	 *
	 * NO CHIP ON ANY OF THE THREE. A chip would put an absence in the same
	 * vocabulary as the four measured states, and none of them is one: they are
	 * things this instrument cannot say.
	 */
	let {
		row = null,
		now,
		limits,
		loaded = true,
		workArrived = false
	}: {
		row?: PresenceRow | null;
		now: number;
		limits: PresenceLimits;
		/**
		 * HAS A PRESENCE PAYLOAD ARRIVED AT ALL? Defaulting to TRUE is deliberate
		 * and is the one direction that cannot manufacture the bug: a caller who
		 * forgets it gets the pre-0278 reading for a row it has, and the only thing
		 * a wrong default could turn into is a "Not known" on a console that does
		 * know -- never a "Not opened" on a console that does not.
		 */
		loaded?: boolean;
		/**
		 * HAS ANYTHING OF THIS STUDENT'S ARRIVED -- a submission, a response, a
		 * file? When it has, presence says NOTHING: the heartbeat table is written
		 * only by a beat from the assignment page, so it can be silent about a
		 * student who did the whole thing, and a derived instrument must never
		 * contradict the record sitting on the line above it.
		 */
		workArrived?: boolean;
	} = $props();

	const kind = $derived(presenceLineKind({ hasRow: !!row, loaded, workArrived }));
	const state = $derived(row ? presenceState(row, now, limits) : null);
</script>

{#if kind === 'row' && row && state}
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
{:else if kind === 'never-opened'}
	<span class="pline" data-testid="presence-line">
		<span class="pmeta pnever" data-testid="presence-never">{PRESENCE_NEVER_OPENED}</span>
	</span>
{:else if kind === 'unknown'}
	<span class="pline" data-testid="presence-line">
		<span class="pmeta punknown" data-testid="presence-unknown">{PRESENCE_UNKNOWN}</span>
	</span>
{/if}
<!--
	AND `outranked` RENDERS NOTHING AT ALL -- no line, no element, no test hook.
	Absence is the mechanism, the way it is for every omitted transport in this
	codebase: there is no sentence to get wrong and no box to leave empty. It also
	takes the third line off exactly the rows a grader is reading, which is the
	half of Mr. Pina's spacing report that could be answered without touching the
	44px floor on the row itself.
-->

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
	/* THE SAME TIER AS EVERY OTHER WORD ON THIS LINE, deliberately. "Not known"
	   is a statement this console is making about ITSELF, not a quieter grade of
	   fact about the student, so dimming it below the text threshold would be the
	   hairline-as-content mistake in words rather than in a rule. */
	.punknown {
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
