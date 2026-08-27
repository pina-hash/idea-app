<script lang="ts">
	import { toleranceForNote, type ToleranceReading } from '$lib/notebook/tolerance';

	/**
	 * THE BAND, AND ONLY THE BAND.
	 *
	 * It renders a machining tolerance and stops. There is no adjective in this
	 * file, no count on screen, no trend, no streak and no comparison, and that
	 * is the specification rather than an aesthetic: the callout is about the
	 * NOTE, never about the student. `± 0.005 in` is a fact about a piece of
	 * text. "Nice work" and "needs proofreading" are both statements about a
	 * person, and a surface that can say the first can say the second.
	 *
	 * THE COUNTS ARE COMPUTED AND NOT SHOWN. `toleranceForNote` returns them
	 * and this component reads only `band.label`, which is deliberate: the
	 * counts are what the band is derived from and what the tests assert
	 * against, and putting them on screen would turn a band into a score.
	 *
	 * IT IS THE AUTHOR'S. It is mounted by `NoteEditor` and by nothing else,
	 * and `NoteEditor` is mounted only where a student writes their own note --
	 * the composer, a card's new-note panel, and their own note being edited.
	 * The instructor's read path is `NoteContent`, which imports none of this.
	 * `tests/notebook-tolerance-privacy.test.ts` sweeps the tree for a second
	 * mount and reddens on one.
	 *
	 * NOTHING RENDERS BELOW THE MINIMUM. `toleranceForNote` answers null and
	 * this returns no element at all -- not an empty box, not a placeholder --
	 * because a rate per hundred words over a nine word note is arithmetic
	 * pretending to be a measurement.
	 */
	let { doc, enabled = true }: { doc: unknown; enabled?: boolean } = $props();

	const reading = $derived<ToleranceReading | null>(enabled ? toleranceForNote(doc) : null);
</script>

{#if reading}
	<p class="nb-tolerance" data-testid="nb-tolerance" data-band={reading.band.id}>
		<span class="nb-tol-label">Tolerance</span>
		<span class="nb-tol-band">{reading.band.label}</span>
	</p>
{/if}

<style>
	.nb-tolerance {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-1) var(--space-3) var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.76rem;
		/* The room's own boundary token, not a hairline: this is the only thing
		   separating two pieces of metadata on one line, which is the case the
		   boundary contract names. */
		color: var(--text-2);
	}
	.nb-tol-label {
		color: var(--text-2);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	/* Gold, the notebook's one accent thread, through the room-corrected ink.
	   Never green: green is completion and this is not a verdict. */
	.nb-tol-band {
		color: var(--nb-accent-ink);
	}
	/* IN SPEC is the same weight as every other band on purpose. Marking it
	   apart would make the callout a scoreboard with a top of it. */
</style>
