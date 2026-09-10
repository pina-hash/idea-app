<script lang="ts">
	import { RANK_STATES, type RankState } from '$lib/gauntlet';

	/**
	 * WHAT A BOARD ROW SAYS ABOUT ITSELF (0194), rendered.
	 *
	 * THE WORD IS ALWAYS PRESENT AND THE GLYPH IS ALWAYS `aria-hidden`. Colour
	 * is never the only signal here, and neither is shape: the chip carries a
	 * mark, a hue AND the state's own word, exactly as the notebook grid's
	 * states do and for the same reason. A reader who cannot separate lime from
	 * green, or who is reading a printout, gets the same answer.
	 *
	 * THE WORDS COME FROM `RANK_STATES` AND ARE NOT WRITTEN HERE. One vocabulary
	 * for a state that is rendered on the board, on the result card and on the
	 * challenge list; three spellings of "held for a teacher to check" is three
	 * things that stop agreeing, and one of them would be the one that named a
	 * number.
	 *
	 * `ranked` RENDERS NOTHING. A board row with a number in the `#` column has
	 * already said it is ranked, and a chip repeating that on every row is noise
	 * that makes the one chip that matters harder to see.
	 */
	let {
		state,
		/** Show the state's full sentence beneath the chip. Off in a table row. */
		explain = false
	}: { state: RankState; explain?: boolean } = $props();

	const words = $derived(RANK_STATES[state]);
</script>

{#if state !== 'ranked'}
	<span class="rs-wrap" class:block={explain}>
		<span class="rs-chip" data-state={state}>
			<!-- A clock face: waiting, not warning. Deliberately not the bang the
			     review console's own observations use -- this says a decision has
			     not been made yet, never that something is wrong. -->
			<svg class="rs-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
				<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5" />
				<path
					d="M8 4.5V8l2.5 1.75"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<span class="rs-word">{words.label}</span>
		</span>
		{#if explain}
			<span class="rs-detail">{words.detail}</span>
		{/if}
	</span>
{/if}

<style>
	.rs-wrap {
		display: inline-flex;
		align-items: center;
	}
	.rs-wrap.block {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
		/* The explaining form stands as its own paragraph on a result card, so
		   it carries the leading a sibling `<p>` would have. It is here rather
		   than on the page because `src/app.css` owns `.gauntlet`'s typography
		   and belongs to another bundle. */
		margin-top: 0.75rem;
	}

	.rs-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.15rem 0.5rem;
		border-radius: var(--radius-ctl, 4px);
		font-family: var(--font-mono, monospace);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
		/* A ROOM HOOK WITH THE VIEWPORT TOKEN AS THE FALLBACK, the way
		   `Disclosure` reads `--disc-accent`: a surface mounting this on another
		   plate re-points the name rather than editing this file.

		   `--lime` (VIEWPORT's callout accent) and NOT `--standby`, `--crimson`
		   or `--green`. All three are spoken for: `--standby` is reserved for the
		   STANDBY run-state text, `--crimson` for live/rec/error, and `--green`
		   is success and completion, which is the one thing a held run has not
		   been granted. */
		color: var(--gt-pending-ink, var(--lime, #c8ff00));
		/* THE FILL IS PINNED, never a `color-mix` of the ink above it: a fill
		   derived from the ink moves whenever the ink does and hands most of the
		   contrast straight back. */
		background: var(--gt-pending-fill, var(--bg2, #0e161b));
		border: 1px solid var(--gt-pending-edge, currentColor);
	}

	.rs-glyph {
		width: 0.85rem;
		height: 0.85rem;
		flex: none;
	}

	.rs-word {
		/* min-width 0 so a narrow board column cannot force the table wider than
		   the viewport through this element's automatic minimum. */
		min-width: 0;
	}

	.rs-detail {
		font-family: var(--font-body, inherit);
		font-size: 0.9rem;
		line-height: 1.5;
		text-transform: none;
		letter-spacing: 0;
		color: var(--white, #e8fff0);
		max-width: 52ch;
	}
</style>
