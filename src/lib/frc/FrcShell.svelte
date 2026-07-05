<script lang="ts">
	import { page } from '$app/state';
	import '@fontsource/roboto/400.css';
	import '@fontsource/roboto/500.css';
	import '@fontsource/roboto/700.css';
	import '@fontsource/roboto/700-italic.css';
	import '$lib/frc/frc-theme.css';
	import FrcMark from '$lib/frc/FrcMark.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import { FRC_TEAM } from '$lib/frc/track';

	/**
	 * The FRC Training chrome: Team 5669 header, track nav, and footer, wrapping
	 * every track page in the scoped .frc-root theme (frc-theme.css). Used by
	 * the /frc layout AND mounted directly by the /dev/frc harness, so it must
	 * not assume auth (ProfileMenu renders nothing when signed out).
	 * Team 5669's own identity is the primary mark; FIRST is referenced by name
	 * only, never by logo.
	 */

	let { children } = $props();

	const path = $derived(page.url.pathname);
	const onHome = $derived(path === '/frc');
	const onRefs = $derived(path.startsWith('/frc/references'));
</script>

<div class="frc-root">
	<header class="frc-header">
		<a class="frc-lockup" href="/frc">
			<FrcMark height={24} />
			<span class="frc-lockup-text">
				<span class="frc-team">TEAM {FRC_TEAM.number}</span>
				<span class="frc-track">FRC TRAINING &middot; {FRC_TEAM.org}</span>
			</span>
		</a>
		<nav class="frc-nav" aria-label="FRC Training">
			<a href="/frc" class:active={onHome}>Track home</a>
			<a href="/frc/references" class:active={onRefs}>References</a>
			<a href="/" class="portal">IDEA Portal</a>
			<ProfileMenu />
		</nav>
	</header>

	<main class="frc-main">
		{@render children()}
	</main>

	<footer class="frc-footer">
		<div class="frc-footer-top">
			<span class="frc-footer-id">
				<FrcMark height={16} />
				<span>{FRC_TEAM.name} &middot; {FRC_TEAM.org} &middot; FRC Training</span>
			</span>
			<p class="frc-disclaimer">
				FIRST&reg; and FIRST&reg; Robotics Competition are trademarks of For Inspiration and
				Recognition of Science and Technology (FIRST), which does not sponsor or endorse this
				training track. This is an original {FRC_TEAM.name} program.
			</p>
		</div>
		<div class="frc-footer-strip">
			<span class="frc-idea-mark">An IDEA program</span>
			<VersionBadge app="frc" />
		</div>
	</footer>
</div>

<style>
	.frc-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.85rem 1.5rem;
		background: var(--frc-surface, #fafbfd);
		border-bottom: 3px solid var(--frc-blue, #0066b3);
	}
	.frc-lockup {
		display: inline-flex;
		align-items: center;
		gap: 0.7rem;
		text-decoration: none;
	}
	.frc-lockup-text {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}
	.frc-team {
		font-weight: 700;
		font-style: italic;
		font-size: 1.15rem;
		letter-spacing: 0.02em;
		color: var(--frc-ink, #231f20);
	}
	.frc-track {
		font-weight: 700;
		font-size: 0.6rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--frc-blue, #0066b3);
	}
	.frc-nav {
		display: inline-flex;
		align-items: center;
		gap: 1.1rem;
	}
	.frc-nav a {
		font-weight: 700;
		font-size: 0.82rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-decoration: none;
		color: var(--frc-ink, #231f20);
		padding: 0.2rem 0;
		border-bottom: 2px solid transparent;
	}
	.frc-nav a:hover {
		color: var(--frc-blue, #0066b3);
	}
	/* Active page underline: the sanctioned red emphasis accent. */
	.frc-nav a.active {
		color: var(--frc-blue, #0066b3);
		border-bottom-color: var(--frc-red, #ed1c24);
	}
	.frc-nav a.portal {
		color: var(--frc-gray, #9a989a);
	}
	.frc-nav a.portal:hover {
		color: var(--frc-blue, #0066b3);
	}

	.frc-footer {
		margin-top: auto;
	}
	.frc-footer-top {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1.4rem 1.5rem;
		background: var(--frc-surface, #fafbfd);
		border-top: 1px solid var(--frc-line, #dde1e8);
	}
	.frc-footer-id {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		font-weight: 700;
		font-style: italic;
		font-size: 0.8rem;
		color: var(--frc-ink, #231f20);
	}
	.frc-disclaimer {
		margin: 0;
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--frc-gray, #9a989a);
		max-width: 72ch;
	}
	/* Dark base strip: home of the IDEA-green program mark and the version
	   badge (both designed for dark ground). */
	.frc-footer-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.6rem 1.5rem;
		background: var(--frc-ink, #231f20);
	}
	.frc-idea-mark {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--frc-achieve, #00ff41);
	}

	@media (max-width: 560px) {
		.frc-nav {
			gap: 0.75rem;
		}
	}
</style>
