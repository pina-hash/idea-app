<script lang="ts">
	import { pendingLabel } from '$lib/pending';

	/**
	 * THE ONE PENDING STATE, so the next surface that needs one does not invent
	 * a fourth spelling.
	 *
	 * `SaveIndicator` is the model and the division of labour is the same:
	 * `$lib/pending.ts` owns the words, this file owns only how they look and
	 * where they sit. What is NEW here relative to the twenty-odd hand-written
	 * paragraphs it replaces is not the styling, it is two things neither of
	 * them had:
	 *
	 *  - IT IS A LIVE REGION. A pending state that a screen reader never hears
	 *    is a blank pane to the one reader who cannot see the layout shift that
	 *    replaced it. `role="status"` is an implicit `aria-live="polite"`; both
	 *    are stated because the pair is what older assistive tech keys on.
	 *  - IT SAYS WHAT IS PENDING. `Loading…` on its own is the same sentence on
	 *    a roster, a photo and a revision list. The label is REQUIRED for that
	 *    reason -- there is no zero-argument form to reach for.
	 *
	 * NO SPINNER, DELIBERATELY. Every surface this replaces was text, several of
	 * them with a comment saying so, and a glyph that spins is a second thing to
	 * gate behind `prefers-reduced-motion` on a component whose whole job is one
	 * sentence. The route-transition indicator carries the motion, once, where a
	 * whole page is being waited on; a pane waiting for its own payload says so
	 * in words.
	 */
	let {
		/** What is pending, in the caller's own words. Its ellipsis is added here. */
		label,
		/**
		 * `block` is a pane or a page with nothing else in it yet; `inline` sits
		 * in a row beside other content and takes no vertical space of its own.
		 */
		variant = 'block'
	}: {
		label: string;
		variant?: 'block' | 'inline';
	} = $props();

	const text = $derived(pendingLabel(label));
</script>

<!--
	THE ELEMENT FOLLOWS THE VARIANT, and it is a correctness rule rather than a
	styling one. The inline variant sits INSIDE a sentence, and a `<p>` nested in
	a `<p>` is invalid HTML: the parser closes the outer paragraph at the inner
	one's start tag, so a server-rendered page and a client-rendered one produce
	two different DOMs from the same source. This route's own harness rendered it
	client-side (`ssr = false`) where `appendChild` has no such restriction, so
	the nesting appeared to work -- which is exactly how a defect like this
	reaches a server-rendered surface unnoticed.
-->
{#if variant === 'inline'}
	<span class="pending inline" role="status" aria-live="polite">{text}</span>
{:else}
	<p class="pending block" role="status" aria-live="polite">{text}</p>
{/if}

<style>
	/*
	 * A ROOM HOOK WITH THE PORTAL TOKEN AS THE FALLBACK, the mechanism
	 * `Disclosure` uses for `--disc-accent` and `SaveIndicator` for `--save-*`.
	 * This component is mounted in the classroom, the notebook and the Foundry
	 * forge, which are three different plates, and a component built on one and
	 * read on another is how `SaveIndicator`'s failed message arrived at 3.65:1
	 * on the notebook's paper.
	 *
	 * `--text-2` and NOT `--dim` for the default. CLAUDE.md records the
	 * measurement: `--dim` clears only the darkest of the three portal grounds
	 * (5.31 on --bg0, 4.46 on --bg1, 4.24 on --bg2), and a pending note lands on
	 * all three. `--text-2` is the register's own token for secondary copy and
	 * measures 6.91 / 5.88 / 5.51 on the same grounds.
	 */
	.pending {
		margin: 0;
		color: var(--pending-ink, var(--text-2));
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		/* A NARROW PANE IS THE DEFAULT CASE, NOT THE EDGE ONE. A grid or flex
		   child's automatic minimum is its min-content, so a long label in a
		   split's detail pane would push the whole page wider than the viewport
		   without this pair. It wraps instead. */
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.pending.block {
		display: block;
		padding: var(--space-3, 0.75rem) 0;
	}

	.pending.inline {
		display: inline;
		padding: 0;
	}
</style>
