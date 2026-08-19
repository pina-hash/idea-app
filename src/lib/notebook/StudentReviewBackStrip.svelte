<script lang="ts">
	/**
	 * The breadcrumb + "you cannot change anything here" framing atop
	 * /notebook/review/student/[studentEmail], ONE IMPLEMENTATION shared with
	 * its dev harness (which used to hand-roll this identically).
	 */

	let { displayName, email }: { displayName: string | null; email: string } = $props();
</script>

<div class="back-strip">
	<a class="back" href="/notebook/review">&larr; Section review</a>
	<p class="who">
		Reading <strong>{displayName ?? email}</strong>'s notebook. This is their whole notebook,
		including entries they filed outside your class. You cannot change anything here.
	</p>
</div>

<style>
	.back-strip {
		max-width: var(--measure-split);
		margin: 1rem auto 0;
		padding-inline: var(--cr-gutter, 1rem);
		box-sizing: border-box;
		display: grid;
		gap: 0.35rem;
	}
	.back {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		color: var(--gold);
	}
	.who {
		margin: 0;
		font-size: 0.85rem;
		color: var(--dim);
	}
	.who strong {
		color: var(--white);
	}
</style>
