<script lang="ts">
	/**
	 * THE WHOLE EDITOR PAGE AS ONE COMPONENT: the bar of chrome and the
	 * workspace under it. `/maps/edit` mounts this and so does the
	 * `/dev/maps-editor` harness, which is what makes the geometry the harness
	 * measures the geometry the route ships (CLAUDE.md: the whole screen is a
	 * component the route mounts, so the harness mounts the IDENTICAL thing).
	 *
	 * IT IS THE APPLICATION SHELL, `.cr-app` + `.cr-app-body` around a
	 * `scroll="fill"` split -- the shape `split.css` provides for a room that
	 * IS the viewport. Above 1024px the bar measures itself and the workspace
	 * takes the rest of the window, so the drawing and the fields share the
	 * screen and each pane scrolls on its own; below it the page is an ordinary
	 * scrolling document, which is the only shape that works when there is more
	 * chrome than fits. No height is named anywhere.
	 *
	 * THE BAR IS ONE ROW OF CONTROLS AND NO HERO. A tool somebody uses for
	 * hours does not need a heading the height of a toolbox above its work
	 * every time it opens; the eyebrow says where you are and the rest of the
	 * row is the ways out -- the public map (to see what was published), the
	 * shelf (to record what is in a drawer from a phone), and home.
	 *
	 * The room class `mp-root` is on THIS root as well as on the workspace's,
	 * so the bar reads the same `--cr-gutter` the split reads and the chrome
	 * lines up with the panes under it (interface standard 1: chrome and
	 * content share a width source).
	 */
	import type { Snippet } from 'svelte';
	import '$lib/shell/split.css';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import MapsEditor from './MapsEditor.svelte';
	import { MAPS_ADMIN_SCOPE, type MapsEditorScope } from './grants';
	import type { MapsEditorData, MapsSelection } from './maps';
	import type { MapsTransports } from './transports';

	let {
		initial,
		transports,
		scope = MAPS_ADMIN_SCOPE,
		initialSelection = null,
		editors = null
	}: {
		initial: MapsEditorData;
		transports: MapsTransports;
		scope?: MapsEditorScope;
		initialSelection?: MapsSelection | null;
		/**
		 * The grant console, handed in as a snippet by the route and rendered
		 * as the third tab of the tree pane. Null renders no tab at all: the
		 * console's transports are a separate injected object and a page that
		 * has none (a granted editor's) has nothing to mount.
		 */
		editors?: Snippet | null;
	} = $props();
</script>

<div class="mp-root mp-shell cr-app" data-testid="maps-editor-shell">
	<header class="mp-bar app-header">
		<a class="wordmark logo-mark mp-logo" href="/" aria-label="IDEA home"><AnimatedLogo width={64} /></a>
		<div class="mp-title">
			<span class="eyebrow">IDEA // Maps</span>
			<h1>Editor</h1>
		</div>
		<nav class="mp-links" aria-label="Editor pages">
			<a class="btn secondary" href="/maps">Public map</a>
			<a class="btn secondary" href="/maps/edit/shelf">Shelf entry</a>
			{#if scope.admin}
				<a class="btn secondary mp-link-wide" href="/dashboard">Dashboard</a>
			{/if}
			<a class="btn secondary" href="/">&lsaquo; Home</a>
			<ProfileMenu />
		</nav>
	</header>

	<main class="mp-body cr-app-body">
		<MapsEditor {initial} {transports} {scope} {initialSelection} {editors} />
	</main>

	<footer class="mp-foot">
		<VersionBadge app="maps" />
	</footer>
</div>

<style>
	.mp-shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		color: var(--white);
	}
	.mp-bar {
		display: flex;
		align-items: center;
		gap: 0.8rem 1rem;
		flex-wrap: wrap;
		padding: 0.5rem var(--cr-gutter, 1rem);
		border-bottom: 1px solid var(--boundary);
		background: var(--bg1);
		flex: 0 0 auto;
	}
	.mp-logo {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.mp-title {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-width: 0;
	}
	.eyebrow {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	h1 {
		margin: 0;
		font-size: 1.15rem;
		line-height: 1.1;
	}
	.mp-links {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-left: auto;
	}
	.mp-links .btn {
		padding: 0.5rem 0.9rem;
	}
	/* A phone gets one row of the ways out: the dashboard is one click from
	   Home and is the link a person at a toolbox needs least. Measured at
	   375px: four links wrapped the bar to 170px; three fit one row. */
	@media (max-width: 639.98px) {
		.mp-link-wide {
			display: none;
		}
		.mp-links .btn {
			padding: 0.5rem 0.65rem;
			font-size: 0.74rem;
		}
	}
	/* The global `main` rule is a reading page's (880px, centred, deep
	   padding); this is a console and takes the window. */
	.mp-body {
		max-width: none;
		width: 100%;
		margin: 0;
		padding: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.mp-foot {
		flex: 0 0 auto;
		padding: 0.3rem var(--cr-gutter, 1rem);
		border-top: 1px solid var(--line);
	}
</style>
