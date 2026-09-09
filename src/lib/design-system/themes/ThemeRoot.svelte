<script lang="ts">
	import { page } from '$app/state';
	import { siteTheme, siteThemeAttr } from '$lib/theme.svelte';
	import type { Component } from 'svelte';

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
	 *
	 * THE RAIN IS MOUNTED HERE TOO, KEYED ON THE SAME ANSWER. `MatrixRain`
	 * renders no markup of its own; it takes `active` and creates its canvas
	 * inside `.bg-fx` only while that is true, so the rain is on exactly when
	 * the attribute is `matrix` -- one derived value drives both, and there is
	 * no second reading of the preference or the session for them to disagree
	 * on. Turning the theme off unmounts the canvas in the same tick the
	 * attribute comes off.
	 *
	 * BUT IT IS FETCHED, NOT IMPORTED, AND THE GATE IS THE SAME DERIVED VALUE.
	 * This component is mounted in the root layout, so a static import put
	 * `MatrixRain.svelte` (11,801 bytes, plus the simulation module it pulls)
	 * on EVERY route in the site -- including the signed-out landing page,
	 * where the theme cannot even be turned on, for an opt-in theme that is not
	 * the default. Nobody who has not chosen `matrix` now downloads any of it.
	 *
	 * THE SSR AND CLIENT DOM ARE IDENTICAL EITHER WAY, WHICH IS WHAT MAKES THIS
	 * SAFE TO DEFER. `MatrixRain` renders NO MARKUP: it has nothing after its
	 * closing script tag (not written out here -- the compiler ends this block
	 * at that literal even inside a comment) and creates its canvas
	 * imperatively inside `.bg-fx`. So the
	 * component contributed an empty render before this change and an absent
	 * one after it, and both are the same zero nodes. There is no `{#if}` block
	 * for the server and the client to disagree about, which is the property
	 * the component's own header already promised and this preserves.
	 */
	const signedIn = $derived(!!page.data.claims);
	const attr = $derived(signedIn ? siteThemeAttr(siteTheme()) : undefined);

	$effect(() => {
		const el = document.documentElement;
		if (attr) el.setAttribute('data-theme', attr);
		else el.removeAttribute('data-theme');
		/* Teardown restores the unthemed document. Nothing unmounts the root
		   layout in production, but a harness that swaps roots must not leave a
		   theme behind on a page that no longer has a control for it. */
		return () => el.removeAttribute('data-theme');
	});

	let Rain = $state<Component<{ active: boolean }> | null>(null);
	/* Plain, NOT `$state`: the "already asked for it" latch is written by the
	   same effect that reads it, and a reactive read there would make the
	   effect depend on a value it sets -- the `effect_update_depth_exceeded`
	   shape. `attr` is the tracked input this effect exists to re-run on. */
	let requested = false;

	$effect(() => {
		if (attr !== 'matrix' || requested) return;
		requested = true;
		/* The `.then` runs in a microtask, outside this tracking context, so
		   the write below needs no `untrack` and cannot land mid-render. */
		import('$lib/MatrixRain.svelte').then((m) => {
			Rain = m.default;
		});
	});
</script>

<!--
	ONCE FETCHED IT STAYS MOUNTED AND `active` KEEPS DRIVING IT, exactly as the
	static import did. Unmounting on theme-off would work too, but it would move
	the decision about when the canvas exists out of `MatrixRain` (which owns
	it, and tears it down on `active` going false) and into this file, giving
	two places an opinion about one thing.
-->
{#if Rain}
	<Rain active={attr === 'matrix'} />
{/if}
