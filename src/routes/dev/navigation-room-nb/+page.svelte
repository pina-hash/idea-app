<script lang="ts">
	/**
	 * `Pending` INSIDE THE NOTEBOOK ROOM, on all three plates (404 in
	 * production, no auth, no Supabase). The third of the three routes this
	 * component needs, and it is a route rather than a section on
	 * `/dev/navigation` for the same forced reason `/dev/navigation-room` is:
	 * `notebook-theme.css` mirrors the plate onto the canvas
	 * (`:root:has(.nb-root ...)`), so a `.nb-root` wrapper anywhere on a page
	 * repaints the whole document.
	 *
	 * WHY THE NOTEBOOK GETS ITS OWN ROUTE RATHER THAN A NOTE SAYING IT WAS NOT
	 * MEASURED. This is the room with the record: `SaveIndicator`'s failed
	 * message arrived here at 3.65:1 and `VersionBadge`'s stamp at 3.20:1, both
	 * on plates they had never been measured on, and both had passed review in
	 * the room they were written for. `Pending` was written on the portal plate
	 * and mounted into three notebook surfaces in the same change, which is
	 * precisely the shape of those two.
	 *
	 * ALL THREE PLATES ON ONE PAGE, and that is safe here in a way it is not for
	 * the room itself: the canvas mirror keys on the plate ATTRIBUTE, so three
	 * wrappers repaint one canvas three ways, but every `Pending` below sits on
	 * its OWN wrapper's `--nb-surface` card, which is the ground it actually
	 * lands on in `ReviewConsole`, `DocumentationCheck` and `AdminLogPanel`. The
	 * body ground is not what is being measured.
	 */
	import Pending from '$lib/Pending.svelte';
	import '$lib/notebook/notebook-theme.css';

	/* Undefined is the DEFAULT plate -- the classroom's console register since
	   the warm near-black one was retired -- and the two named plates are
	   opt-in, exactly as `notebookThemeAttr()` returns them. */
	const PLATES: { attr: 'light' | 'idea' | undefined; label: string }[] = [
		{ attr: undefined, label: 'default (console register)' },
		{ attr: 'light', label: 'light (paper)' },
		{ attr: 'idea', label: 'idea (green)' }
	];
</script>

<svelte:head><title>dev · Pending in .nb-root</title></svelte:head>

{#each PLATES as plate (plate.label)}
	<div class="nb-root" data-nb-theme={plate.attr} data-testid="nb-room">
		<div class="stage">
			<h2>{plate.label}</h2>
			<section class="card">
				<Pending label="Loading the entry" />
			</section>
			<section class="card">
				<div class="narrow">
					<Pending label="Loading every earlier revision of this document" />
				</div>
			</section>
		</div>
	</div>
{/each}

<style>
	.stage {
		padding: 1rem;
		display: grid;
		gap: 0.75rem;
		max-width: 70ch;
		margin: 0 auto;
	}
	h2 {
		font-size: 0.9rem;
		margin: 0;
	}
	.card {
		background: var(--nb-surface);
		border: 1px solid var(--nb-boundary);
		border-radius: var(--radius-md, 6px);
		padding: 1rem;
	}
	.narrow {
		width: 140px;
		border: 1px dashed var(--nb-hairline);
		padding: 0.4rem;
	}
</style>
