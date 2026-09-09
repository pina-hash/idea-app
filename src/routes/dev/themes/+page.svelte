<script lang="ts">
	import AppLauncher from '$lib/AppLauncher.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	/* The three room stylesheets, for `?room=` only (see +page.ts). Each is
	   scoped under its own root class and reaches nothing until that class is
	   on an element, so importing all three costs this harness nothing on the
	   default case. */
	import '$lib/classroom/classroom.css';
	import '$lib/notebook/notebook-theme.css';
	import '$lib/foundry/forge.css';
	import {
		SITE_THEMES,
		SITE_THEME_LABELS,
		setSiteTheme,
		siteTheme,
		type SiteTheme
	} from '$lib/theme.svelte';

	/**
	 * THE THEME HARNESS. It mounts the REAL AppLauncher and the REAL
	 * ProfileMenu -- never a copy of their markup -- and puts a chrome board
	 * beside them carrying one element per repainted text role on one element
	 * per repainted ground.
	 *
	 * THE BOARD IS THE PART THAT NEEDS EXPLAINING. Contrast is a claim about a
	 * colour AND the ground behind it, and this theme repaints eight grounds
	 * and eight text roles. No shipping surface puts all sixty-four pairs on
	 * screen, so a browser pass over shipping pages measures whichever handful
	 * of pairs those pages happen to use and reports a clean sweep for the
	 * rest. Every cell here is a real element with the real token on it, so
	 * `tools/browser-verify`'s contrast check composites the actual painted
	 * ground rather than being told what it is.
	 *
	 * THE SWITCH IS THE SHIPPING ONE. `setSiteTheme` here is the same call the
	 * ProfileMenu control makes; the buttons exist so a person driving this
	 * page by hand can flip it without opening the menu, and so the harness can
	 * reach the themed state with one click instead of writing an attribute the
	 * app would then fight over.
	 */

	/**
	 * THE BOARD RENDERS THE PAIRINGS THE APP MAKES, NOT THE CARTESIAN PRODUCT,
	 * and that is the "a fixture must be something its real producer can emit"
	 * rule applied to a colour pair. Eight roles over eight grounds is
	 * sixty-four cells, and three of them -- --dim and --gear on --green-tint,
	 * --gear on --plate -- are below 4.5:1 in the BASE palette too and are
	 * pairings nothing in `src/` writes: --green-tint has exactly one call site
	 * (`.cr-root .is-selected`, a classroom row whose copy is the register
	 * tiers), and colors.css says of --plate in its own words that "nothing in
	 * the app renders on it". Asserting them would be a permanently red row
	 * recording a property of the palette rather than of this theme.
	 *
	 * So each ground carries the roles that actually land on it. The full
	 * sixty-four-cell table is measured too -- see the history entry -- it is
	 * just not what this page asserts.
	 */
	type Role = { token: string; label: string; min: number };
	const ROLES: Record<string, Role> = {
		white: { token: '--white', label: 'white body', min: 4.5 },
		'text-1': { token: '--text-1', label: 'text-1 body', min: 4.5 },
		'text-2': { token: '--text-2', label: 'text-2 meta', min: 4.5 },
		ice: { token: '--ice', label: 'ice disabled', min: 4.5 },
		dim: { token: '--dim', label: 'dim secondary', min: 4.5 },
		/* --gear is read as TEXT exactly once (MarkdownText, on a classroom
		   surface), so it owes the text floor on the grounds it is read on. */
		gear: { token: '--gear', label: 'gear chrome', min: 4.5 },
		/* A boundary is a graphical object, not text: 3:1
		   (IDEA_INTERFACE_STANDARDS 10). */
		boundary: { token: '--boundary', label: 'boundary', min: 3 },
		/* Tertiary decoration -- separators, disabled glyphs, decorative rules.
		   colors.css measures it at 2.9:1 on --surface-1 deliberately. */
		'text-3': { token: '--text-3', label: 'text-3 decorative', min: 0 }
	};

	const ALL: string[] = Object.keys(ROLES);
	/** The copy a hero panel and a selected classroom row carry.
	 *  NO --boundary ON --plate: colors.css measures one there at 2.66:1 in its
	 *  own note and says nothing in the app renders on that ground at all, so a
	 *  cell for it would be asserting a pairing nobody makes. */
	const COPY: string[] = ['white', 'text-1', 'text-2'];
	const ROW: string[] = ['text-1', 'text-2', 'boundary'];

	const GROUNDS = [
		{ token: '--bg0', label: 'bg0 page base', roles: ALL },
		{ token: '--bg1', label: 'bg1 cards', roles: ALL },
		{ token: '--bg2', label: 'bg2 header, input', roles: ALL },
		{ token: '--surface-0', label: 'surface-0 page', roles: ALL },
		{ token: '--surface-1', label: 'surface-1 card', roles: ALL },
		{ token: '--surface-2', label: 'surface-2 input', roles: ALL },
		{ token: '--plate', label: 'plate hero panel', roles: COPY },
		{ token: '--green-tint', label: 'green-tint selected row', roles: ROW }
	];

	const current = $derived(siteTheme());
	let { data } = $props();
	const ROOM_CLASS: Record<string, string> = { classroom: 'cr-root', notebook: 'nb-root', foundry: 'fg-root' };
	const roomClass = $derived(data.room ? ROOM_CLASS[data.room] : '');

	/**
	 * `?state=<id>` starts the harness on a theme, through the SHIPPING call.
	 *
	 * `untrack` around the call is the repository's own rule and not a
	 * precaution: an $effect that calls something which WRITES state takes a
	 * dependency on whatever it touches, and `setSiteTheme` writes the very
	 * `$state` `siteTheme()` reads. Tracked, this is
	 * `effect_update_depth_exceeded` on mount. The input it re-runs on -- the
	 * URL -- is read tracked above the call, which is the half that must not
	 * be untracked or the effect stops re-running and nothing says so.
	 */
	$effect(() => {
		const want = page.url.searchParams.get('state');
		if (!want || !SITE_THEMES.includes(want as SiteTheme)) return;
		untrack(() => {
			if (siteTheme() !== want) setSiteTheme(want as SiteTheme);
		});
	});
</script>

<svelte:head><title>Site theme harness</title></svelte:head>

<!-- The room wrapper is OUTSIDE main: a room root is the page's own root in
     the routes that mount it, and `body:has(.cr-root)` has to see it. -->
<div class={roomClass || undefined} data-testid="theme-room" data-room={data.room ?? 'none'}>
<main class="harness">
	<header class="hz">
		<h1>Site theme: the launcher, and every repainted role on every repainted ground</h1>
		<ProfileMenu />
	</header>

	<p class="note">
		Dev-only (404 in production; no auth, no Supabase). The switch below is the same
		<code>setSiteTheme</code> call the profile menu makes. The launcher underneath is the real
		component: a theme may repaint chrome and may never repaint an app's accent, so the twelve
		cards must stay tellable apart with the theme on.
	</p>

	<div class="switch" data-testid="theme-switch">
		{#each SITE_THEMES as t (t)}
			<button
				class="sw"
				class:on={current === t}
				type="button"
				data-theme-set={t}
				onclick={() => setSiteTheme(t)}>{SITE_THEME_LABELS[t]}</button
			>
		{/each}
		<span class="cur" data-testid="theme-current">{current}</span>
	</div>

	<section class="board" data-testid="chrome-board">
		<h2>Chrome board</h2>
		{#each GROUNDS as g (g.token)}
			<div class="ground" style="background: var({g.token})" data-ground={g.token}>
				<span class="gname" style="color: var(--text-2)">{g.label}</span>
				<div class="roles">
					{#each g.roles as key (key)}
						<span
							class="role"
							style="color: var({ROLES[key].token})"
							data-role={ROLES[key].token}
							data-min={ROLES[key].min}>{ROLES[key].label}</span
						>
					{/each}
				</div>
			</div>
		{/each}
	</section>

	<section class="launch">
		<h2>The launcher, unmodified</h2>
		<AppLauncher onRequireSignIn={() => {}} />
	</section>
</main>
</div>

<style>
	.harness {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.5rem 1rem 4rem;
	}
	/* THE MENU IS RIGHT-ANCHORED, AND AT 375 THAT HAD TO BE MADE EXPLICIT.
	   `.pm-panel` is `position: absolute; right: 0` on its own trigger, so at
	   375px it opens 343px wide leftwards from wherever the trigger sits.
	   Measured here before this rule existed: the heading wrapped, the trigger
	   landed at the LEFT of the second line, and every theme row came back at
	   `left: -186` with `elementFromPoint` answering null at its centre -- a
	   control off the side of the screen, which reads exactly like a broken
	   click and is really a harness that put the menu somewhere no shipping
	   masthead does. `margin-left: auto` pins it to the right edge on the
	   wrapped line too, which is the arrangement every real header has. */
	.hz {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.hz :global(.pm-root) {
		margin-left: auto;
	}
	h1 {
		font-size: 1.25rem;
		color: var(--white);
	}
	h2 {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--text-2);
		margin: 1.5rem 0 0.6rem;
	}
	.note {
		color: var(--text-2);
		max-width: 46rem;
		margin-top: 0.6rem;
	}
	code {
		font-family: var(--font-mono);
		color: var(--cyan);
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1rem;
		flex-wrap: wrap;
	}
	.sw {
		min-height: 44px;
		padding: 0 0.9rem;
		background: var(--bg2);
		color: var(--white);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.sw.on {
		border-color: var(--green);
		color: var(--green);
	}
	.cur {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.board {
		display: grid;
		gap: 0.35rem;
	}
	.ground {
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
	}
	.gname {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		margin-bottom: 0.35rem;
	}
	.roles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
	}
	.role {
		font-size: 0.9rem;
		line-height: 1.5;
	}
</style>
