<script lang="ts">
	/**
	 * The breadcrumb + "you cannot change anything here" framing atop
	 * /notebook/review/student/[studentEmail], ONE IMPLEMENTATION shared with
	 * its dev harness (which used to hand-roll this identically).
	 *
	 * THE WAY BACK CARRIES THE SECTION. This link was a bare
	 * `/notebook/review`, so returning from a student dropped the console back
	 * to its FIRST section with the unit at "All units", the cursor gone and
	 * the panel closed -- and the instructor re-found the row by eye, every
	 * time. ReviewConsole hands `?section=` down the outbound link and the
	 * load echoes it here; /notebook/review validates it against the viewer's
	 * own sections, so this is courtesy and never a claim about access.
	 *
	 * THE UNIT IS NOT CARRIED because there is nothing to carry: the console
	 * reads only `?section=` from the URL and keeps its unit choice in
	 * component state. See `studentNotebookHref` in ReviewConsole.
	 *
	 * NULL IS THE ORDINARY CASE, not a fault -- an address typed straight into
	 * the bar, or a link made before this existed -- and it gets the bare
	 * all-sections console.
	 *
	 * INSIDE THE CLASSROOM (ledger 0297) the way back is usually the CLASS'S OWN
	 * Notebook tab, which is its grid for a manager; the load knows whether the
	 * viewer manages the class and hands the answer in as `backHref`. Without
	 * one the link is the all-sections console on the given section, through
	 * the one helper that spells its address.
	 */
	import { notebookReviewHref } from '$lib/classroom/nav';

	let {
		displayName,
		email,
		sectionId = null,
		backHref = null,
		backLabel = 'Section review'
	}: {
		displayName: string | null;
		email: string;
		sectionId?: string | null;
		backHref?: string | null;
		backLabel?: string;
	} = $props();

	const href = $derived(backHref ?? notebookReviewHref(sectionId));
</script>

<div class="back-strip">
	<a class="back tap-reach-44" {href} data-testid="back-to-review">&larr; {backLabel}</a>
	<p class="who">
		Reading <strong>{displayName ?? email}</strong>'s notebook. This is their whole notebook,
		including entries they filed outside your class. You cannot change anything here.
	</p>
</div>

<style>
	.back-strip {
		max-width: var(--cr-measure, var(--measure-split));
		margin: var(--space-3) auto 0;
		padding-inline: var(--cr-gutter, 1rem);
		box-sizing: border-box;
		display: grid;
		gap: var(--space-1);
	}
	.back {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--gold);
	}
	.who {
		margin: 0;
		font-size: 0.85rem;
		/* --text-2, never --dim: --dim clears only the darkest portal ground
		   (CLAUDE.md), and this strip sits on the classroom's own. */
		color: var(--text-2);
	}
	.who strong {
		color: var(--text-1);
	}
</style>
