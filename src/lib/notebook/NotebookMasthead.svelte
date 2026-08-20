<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import NotebookThemeToggle from '$lib/notebook/NotebookThemeToggle.svelte';

	/**
	 * The notebook's masthead band, written once.
	 *
	 * It was previously spelled out twice, verbatim apart from the back link's
	 * href and label -- once in NotebookView and once in ReviewConsole. Two
	 * copies of one bar is the thing that quietly stops matching: the theme
	 * toggle was added to both by hand, and the next control would have been
	 * too.
	 *
	 * WHY THIS IS NOT ClassroomShell, since the classroom has a shell component
	 * and the notebook now has this. They are not the same job:
	 *
	 *  - ClassroomShell WRAPS a route's children and owns three pieces of
	 *    classroom navigation on top of the bar -- the section switcher, the
	 *    breadcrumb trail and the tab strip. None of them has a notebook
	 *    meaning, and `minimal` already exists there to switch all three off,
	 *    so sharing would mean every notebook screen mounting a component whose
	 *    entire body is disabled.
	 *  - The room wrapper sits in a different place in each room. `.cr-root` is
	 *    put on by the classroom LAYOUT; `.nb-root` is rendered by NotebookView
	 *    and ReviewConsole themselves, because the notebook mounts under other
	 *    layouts too (the classroom's view-as tree). A shared shell would have
	 *    to own the wrapper in one room and not the other.
	 *  - This bar carries NotebookThemeToggle, which is the notebook's alone --
	 *    it is the control for the three plates, and the classroom has one.
	 *
	 * So the duplication that was worth removing is the eight lines below, and
	 * the boundary that was worth keeping is the one between the two rooms'
	 * chrome. The bar's own dressing stays in notebook-theme.css
	 * (`.nb-root .app-header`), which both rooms' screens already load.
	 *
	 * Presentation only: two strings in, no state, no transports.
	 */
	let {
		backHref,
		backLabel
	}: {
		/** Where the back link goes. */
		backHref: string;
		/** Its wording, without the guillemet -- that is chrome and lives here. */
		backLabel: string;
	} = $props();
</script>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<NotebookThemeToggle />
		<a class="btn secondary" href={backHref}>&lsaquo; {backLabel}</a>
		<ProfileMenu />
	</div>
</div>
