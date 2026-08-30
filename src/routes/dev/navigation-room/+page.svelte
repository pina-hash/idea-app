<script lang="ts">
	/**
	 * `Pending` INSIDE THE CLASSROOM ROOM (404 in production, no auth, no
	 * Supabase). The companion to `/dev/navigation`, which is the portal plate.
	 *
	 * WHY A SECOND ROUTE RATHER THAN A SECTION, and it is forced rather than
	 * chosen -- the same reason `/dev/animated-logo-room` exists.
	 * `classroom.css` carries `body:has(.cr-root) { background: var(--surface-0) }`,
	 * so a `.cr-root` wrapper anywhere on a page repaints the canvas for the
	 * whole document and the roomless readings on the other route would stop
	 * describing the portal plate.
	 *
	 * WHY THIS ROOM. `Pending` is mounted by six surfaces: `GradingConsole`,
	 * `RevisionHistory` and `PeoplePanel` under `.cr-root`, and `ReviewConsole`,
	 * `DocumentationCheck` and `AdminLogPanel` under `.nb-root`. The notebook is
	 * `/dev/navigation-room-nb`, which is a third route for the identical reason
	 * (`body:has(.nb-root)` is the notebook's own canvas mirror). No other room
	 * mounts it, and a room this component never ships in is a plate belonging to
	 * no route.
	 *
	 * THE GROUND IS `--surface-1`, NOT THE BODY. Every real mount sits inside a
	 * card, which is what the stage below reproduces -- measuring the label
	 * against the page plate would be measuring a ground it never lands on.
	 */
	import Pending from '$lib/Pending.svelte';
	/* The room's own stylesheet, imported the way `/reference/+layout.svelte`
	   imports it. Without it `.cr-root` is a class with no rules: a wrapper that
	   reads as a room and paints nothing, which is a worse fixture than none. */
	import '$lib/classroom/classroom.css';
</script>

<svelte:head><title>dev · Pending in .cr-root</title></svelte:head>

<div class="cr-root" data-testid="cr-room">
	<div class="stage">
		<h1>Pending, on the classroom plate</h1>
		<section class="card">
			<h2>On a card surface</h2>
			<Pending label="Loading the roster" />
		</section>
		<section class="card">
			<h2>In a narrow pane</h2>
			<div class="narrow" data-testid="narrow-pane">
				<Pending label="Loading every earlier revision of this document" />
			</div>
		</section>
	</div>
</div>

<style>
	.stage {
		padding: 1rem;
		display: grid;
		gap: 1rem;
		max-width: 70ch;
		margin: 0 auto;
	}
	h1 {
		font-size: 1.1rem;
		color: var(--text-1);
		margin: 0;
	}
	h2 {
		font-size: 0.9rem;
		color: var(--text-1);
		margin: 0 0 0.5rem;
	}
	.card {
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 6px);
		padding: 1rem;
	}
	.narrow {
		width: 140px;
		border: 1px dashed var(--hairline);
		padding: 0.4rem;
	}
</style>
