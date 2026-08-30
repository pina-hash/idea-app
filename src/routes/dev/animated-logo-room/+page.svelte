<script lang="ts">
	/**
	 * `AnimatedLogo` INSIDE A SCOPED ROOM (404 in production, no auth, no
	 * Supabase). The companion to `/dev/animated-logo`, which is the portal
	 * plate.
	 *
	 * WHY THIS IS A SECOND ROUTE RATHER THAN A SECTION ON THE FIRST ONE, and it
	 * is forced rather than chosen. `classroom.css` carries
	 * `body:has(.cr-root) { background: var(--surface-0) }` and
	 * `body:has(.cr-root) .bg-fx { display: none }`, so a `.cr-root` wrapper
	 * anywhere on a page repaints the CANVAS for the whole document. Measured on
	 * the other harness with a room section added to it: the roomless note copy's
	 * ground moved from rgb(18, 26, 18) to rgb(10, 12, 11) and its ratio from
	 * 5.31:1 to 5.87:1. One page cannot hold both plates, so the roomless
	 * readings and the room readings are two routes.
	 *
	 * WHICH ROOM, AND WHY NOT ALL OF THEM. `AnimatedLogo` is mounted by more
	 * surfaces than any other shared component in this repo: the portal home page
	 * and `/admin*` (no room), `ClassroomShell` and `/reference/[itemId]`
	 * (`.cr-root`), `NotebookMasthead` (`.nb-root`), GAUNTLET's `Header`
	 * (`.gt-root`), `FoundryShell` (`.fg-root`), `/coin-desk/+layout` (`.cd-root`),
	 * `FspDeck` (`.fsp-root`) and the tournament pages. It does not follow that it
	 * needs eight harnesses: the emblem's own stylesheet declares NO custom
	 * property at all -- two PNGs layered at fixed percentages -- so no room can
	 * repaint the emblem. What a room changes is the GROUND behind it and the
	 * chrome around it, and `.cr-root` is the one that changes both, being opaque,
	 * setting `background: var(--surface-0)`, suppressing `.bg-fx`, and giving
	 * `.app-header` a `--surface-1` background of its own -- which is the exact
	 * slot `/reference/[itemId]` puts the emblem in.
	 *
	 * The other rooms are named rather than silently omitted. Nothing in this repo
	 * has measured the emblem's header slot on `.nb-root`'s paper or in the forge.
	 */
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	/* The room's own stylesheet, imported exactly as `/reference/+layout.svelte`
	   imports it. Without it `.cr-root` is a class with no rules -- a wrapper
	   that reads as a room in the markup and paints nothing, which is a worse
	   fixture than no wrapper at all. */
	import '$lib/classroom/classroom.css';
</script>

<svelte:head><title>dev · AnimatedLogo in .cr-root</title></svelte:head>

<!-- The chain is `/reference/[itemId]`'s own: `.cr-root` from that route group's
     layout, then the page's own `.app-header.ref-header > a.wordmark.logo-mark`.
     Not an approximation of it -- `classroom.css` keys rules on
     `.cr-root .app-header`, so a stage that skipped the header class would be a
     third plate belonging to no route. -->
<div class="cr-root">
	<div class="app-header ref-header">
		<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	</div>

	<main class="room-page">
		<h1>AnimatedLogo in the classroom room</h1>
		<p class="note">
			The same emblem at the same 104px the portal headers use, in the header slot
			<code>/reference/[itemId]</code> puts it in, on <code>.cr-root</code>'s calm surfaces
			rather than the portal's green machined plate. The spin gate is the same one
			<code>/dev/animated-logo</code> measures; what is different here is everything around it.
		</p>

		<section class="card">
			<h2>Hero scale on the room's card surface</h2>
			<AnimatedLogo width={260} />
		</section>

		<section class="card">
			<h2>Static fallback (spin off)</h2>
			<AnimatedLogo width={260} spin={false} />
		</section>
	</main>
</div>

<style>
	/* The room brings its own plate, its own type and its own card; this file
	   supplies a measure and the header's box and nothing else. A background
	   declared here would be measuring this file instead of the room. */
	.room-page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 1.5rem var(--cr-gutter, 1rem) 4rem;
	}
	.app-header {
		display: flex;
		align-items: center;
		padding: 0.6rem var(--cr-gutter, 1rem);
	}
	.note {
		max-width: 60ch;
		line-height: 1.5;
	}
	section.card {
		margin-top: 1.2rem;
		padding: 1.2rem;
	}
	h2 {
		font-size: 0.9rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
</style>
