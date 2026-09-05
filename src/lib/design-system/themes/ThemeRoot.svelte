<script lang="ts">
	import { page } from '$app/state';
	import { siteTheme, siteThemeAttr } from '$lib/theme.svelte';

	/**
	 * PUTS THE THEME ON `<html>`, AND IS THE ONLY THING THAT DOES.
	 *
	 * It renders nothing. It exists because a theme has to reach the DOCUMENT
	 * ELEMENT and nothing else can: `body { background: var(--bg0) }` and
	 * `.bg-fx` are both ANCESTORS of, or siblings above, whatever a page
	 * mounts, so an attribute written on a component's own wrapper is invisible
	 * to them -- the same trap `.nb-root`'s canvas mirror documents from the
	 * other end. `<html>` is the one element above all of it.
	 *
	 * MOUNTED ONCE IN `src/routes/+layout.svelte`, beside `SiteFeedback` and
	 * `NavigationProgress`, and for the identical reason: there are no layout
	 * resets anywhere in `src/routes`, so every page route INHERITS the theme
	 * instead of having to remember it. Mounting it per page, or hanging it off
	 * `ProfileMenu` (which not every shell mounts), would give a theme that is
	 * on for some routes and off for others.
	 *
	 * THE SESSION GATE IS THE POINT, NOT AN OPTIMISATION. See
	 * `$lib/theme.svelte.ts` for the argument: the control is in ProfileMenu,
	 * ProfileMenu renders nothing when signed out, and a theme that outlives
	 * the control that turns it off is a theme the next person at a shared
	 * school desktop is stuck with.
	 *
	 * THE WRITE IS AN ATTRIBUTE SET AND A REMOVAL, never a class toggle and
	 * never `style`. `data-theme` absent IS the default state, so turning the
	 * theme off leaves `<html>` exactly as a session that never turned it on --
	 * there is no residue to clean up because there is no residue.
	 */
	const signedIn = $derived(!!page.data.claims);

	$effect(() => {
		const attr = signedIn ? siteThemeAttr(siteTheme()) : undefined;
		const el = document.documentElement;
		if (attr) el.setAttribute('data-theme', attr);
		else el.removeAttribute('data-theme');
		/* Teardown restores the unthemed document. Nothing unmounts the root
		   layout in production, but a harness that swaps roots must not leave a
		   theme behind on a page that no longer has a control for it. */
		return () => el.removeAttribute('data-theme');
	});
</script>
