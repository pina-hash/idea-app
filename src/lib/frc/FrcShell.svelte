<script lang="ts">
	import { setContext } from 'svelte';
	import { page } from '$app/state';
	import '@fontsource/roboto/400.css';
	import '@fontsource/roboto/500.css';
	import '@fontsource/roboto/700.css';
	import '@fontsource/roboto/700-italic.css';
	import '$lib/frc/frc-theme.css';
	import logoHorizontal from '$lib/frc/assets/frc-logo-horizontal.png';
	import logoVertical from '$lib/frc/assets/frc-logo-vertical.png';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ChangelogFooter from '$lib/frc/ChangelogFooter.svelte';
	import FrcRankBadge from '$lib/frc/FrcRankBadge.svelte';
	import { FRC_TEAM, FRC_VIEW_CONTEXT_KEY, type FrcViewContext } from '$lib/frc/track';

	/**
	 * The FRC Training chrome: the official FIRST Robotics Competition logo
	 * (horizontal in the header, compact vertical in the footer) shown ALONGSIDE
	 * Team 5669's own identity, wrapping every track page in the scoped .frc-root
	 * theme (frc-theme.css). Used by the /frc layout AND the /dev/frc harness, so
	 * it must not assume auth (ProfileMenu renders nothing when signed out).
	 *
	 * FRC logo brand rules honored here: the RGB logos are used unmodified (never
	 * recolored, distorted, stretched, or cropped: `width:auto` preserves the
	 * exact aspect from the intrinsic attributes), and each is given clear space
	 * (transparent padding) at least the height of its icon so nothing crowds it.
	 * Team 5669 identity sits outside that clear space. The FIRST triangle /
	 * circle / square icon is FIRST's; it appears here only within the full logo.
	 */

	// `rankCount` is an optional override for the dev harness; in the real track
	// it falls back to the /frc layout's frcCompletedCount (page data).
	// `teacherOverride` likewise lets the dev harness simulate a teacher without
	// a real Supabase session; the real track derives it from the signed-in
	// profile's role.
	let {
		children,
		rankCount,
		teacherOverride
	}: { children: import('svelte').Snippet; rankCount?: number; teacherOverride?: boolean } =
		$props();

	const path = $derived(page.url.pathname);
	const onHome = $derived(path === '/frc');
	const onRefs = $derived(path.startsWith('/frc/references'));

	// The rank chip appears for a signed-in user (student's profile surface within
	// the track), or whenever the harness supplies a count.
	const showRank = $derived(rankCount != null || !!page.data.claims);
	const rank = $derived(rankCount ?? (page.data.frcCompletedCount as number | undefined) ?? 0);

	// ------ Teacher "view as student" ------
	// A teacher can preview the track exactly as a student sees it: real
	// per-account progress states and a working gate, with teacher-only
	// override controls hidden. Any page under /frc reads this via
	// getContext(FRC_VIEW_CONTEXT_KEY); FrcShell is the sole owner of the
	// toggle so it survives navigation between /frc pages (this layout
	// component stays mounted while its child pages change).
	const isTeacher = $derived(teacherOverride ?? page.data.userProfile?.role === 'teacher');
	let viewAsStudent = $state(false);

	setContext<FrcViewContext>(FRC_VIEW_CONTEXT_KEY, {
		get isTeacher() {
			return isTeacher;
		},
		get viewAsStudent() {
			return viewAsStudent;
		},
		get showOverride() {
			return isTeacher && !viewAsStudent;
		}
	});
</script>


<div class="frc-root">
	<header class="frc-header">
		<div class="frc-brand">
			<a class="frc-logo-link" href="/frc" aria-label="FRC Training home">
				<img
					class="frc-logo"
					src={logoHorizontal}
					width="804"
					height="190"
					alt="FIRST Robotics Competition"
				/>
			</a>
			<span class="frc-brand-div" aria-hidden="true"></span>
			<span class="frc-team-id">
				<span class="frc-team">TEAM {FRC_TEAM.number}</span>
				<span class="frc-track">FRC Training &middot; {FRC_TEAM.org}</span>
			</span>
		</div>
		<nav class="frc-nav" aria-label="FRC Training">
			<a href="/frc" class:active={onHome}>Track home</a>
			<a href="/frc/references" class:active={onRefs}>References</a>
			<a href="/" class="portal">IDEA Portal</a>
			{#if isTeacher}
				<button
					type="button"
					class="frc-view-toggle"
					class:active={viewAsStudent}
					aria-pressed={viewAsStudent}
					onclick={() => (viewAsStudent = !viewAsStudent)}
				>
					{viewAsStudent ? 'Viewing as student' : 'View as student'}
				</button>
			{/if}
			{#if showRank}<FrcRankBadge count={rank} size="sm" />{/if}
			<ProfileMenu />
		</nav>
	</header>

	{#if isTeacher && viewAsStudent}
		<div class="frc-preview-banner" role="status">
			Previewing the track as a student sees it. Teacher tools are hidden.
		</div>
	{/if}

	<main class="frc-main">
		{@render children()}
	</main>

	<footer class="frc-footer">
		<div class="frc-footer-main">
			<div class="frc-footer-brand">
				<img
					class="frc-footer-logo"
					src={logoVertical}
					width="699"
					height="479"
					alt="FIRST Robotics Competition"
				/>
				<span class="frc-footer-id">
					<span class="frc-footer-team">{FRC_TEAM.name}</span>
					<span class="frc-footer-org">{FRC_TEAM.org} &middot; FRC Training</span>
				</span>
			</div>
			<div class="frc-footer-meta">
				<ChangelogFooter />
				<p class="frc-trademark">
					FIRST and FIRST Robotics Competition are trademarks of For Inspiration and Recognition of
					Science and Technology (FIRST).
				</p>
				<p class="frc-disclaimer">
					Not sponsored or endorsed by FIRST. An original {FRC_TEAM.name} program.
				</p>
			</div>
		</div>
		<div class="frc-footer-strip">
			<span class="frc-idea-mark">An IDEA program</span>
			<VersionBadge app="frc" />
		</div>
	</footer>
</div>

<style>
	/* Clear space = the height of the logo's icon, kept as transparent padding
	   so no element crowds the mark (FRC brand rule). */
	.frc-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.5rem 1.5rem;
		background: var(--frc-surface, #fafbfd);
		border-bottom: 3px solid var(--frc-blue, #0066b3);
	}
	.frc-brand {
		display: inline-flex;
		align-items: center;
	}
	.frc-logo-link {
		display: inline-flex;
		/* Horizontal logo icon height == full logo height, so clear space == the
		   rendered logo height. */
		padding: 30px;
	}
	.frc-logo {
		height: 30px;
		width: auto;
		display: block;
	}
	/* Divider + team identity sit OUTSIDE the logo's clear space. */
	.frc-brand-div {
		width: 1px;
		align-self: stretch;
		margin: 0.5rem 0;
		background: var(--frc-line, #dde1e8);
	}
	.frc-team-id {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
		padding-left: 1rem;
	}
	.frc-team {
		font-weight: 700;
		font-style: italic;
		font-size: 1.1rem;
		letter-spacing: 0.02em;
		color: var(--frc-ink, #231f20);
	}
	.frc-track {
		font-weight: 700;
		font-size: 0.58rem;
		letter-spacing: 0.16em;
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
	.frc-view-toggle {
		font-family: inherit;
		font-weight: 700;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--frc-blue, #0066b3);
		background: var(--frc-surface, #fafbfd);
		border: 1px solid var(--frc-blue-line, rgba(0, 102, 179, 0.35));
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.frc-view-toggle:hover {
		border-color: var(--frc-blue, #0066b3);
	}
	.frc-view-toggle.active {
		color: #fff;
		background: var(--frc-blue, #0066b3);
		border-color: var(--frc-blue, #0066b3);
	}
	.frc-preview-banner {
		text-align: center;
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--frc-blue-deep, #004f8a);
		background: var(--frc-blue-tint, rgba(0, 102, 179, 0.08));
		border-bottom: 1px solid var(--frc-blue-line, rgba(0, 102, 179, 0.35));
		padding: 0.4rem 1rem;
	}

	.frc-footer {
		margin-top: auto;
	}
	.frc-footer-main {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 2rem;
		flex-wrap: wrap;
		padding: 1.4rem 1.5rem;
		background: var(--frc-surface, #fafbfd);
		border-top: 1px solid var(--frc-line, #dde1e8);
	}
	.frc-footer-brand {
		display: inline-flex;
		align-items: center;
		gap: 1rem;
	}
	.frc-footer-logo {
		/* Compact vertical logo; its icon is ~40% of the height, so this padding
		   preserves at least an icon-height of clear space. */
		height: 66px;
		width: auto;
		display: block;
		padding: 22px;
	}
	.frc-footer-id {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}
	.frc-footer-team {
		font-weight: 700;
		font-style: italic;
		font-size: 0.95rem;
		color: var(--frc-ink, #231f20);
	}
	.frc-footer-org {
		font-size: 0.72rem;
		color: var(--frc-gray, #9a989a);
	}
	.frc-footer-meta {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		max-width: 60ch;
	}
	.frc-trademark {
		margin: 0;
		font-size: 0.68rem;
		line-height: 1.5;
		color: var(--frc-gray, #9a989a);
	}
	.frc-disclaimer {
		margin: 0;
		font-size: 0.68rem;
		line-height: 1.5;
		color: var(--frc-gray, #9a989a);
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

	@media (max-width: 640px) {
		.frc-logo-link {
			padding: 22px;
		}
		.frc-logo {
			height: 24px;
		}
		.frc-nav {
			gap: 0.75rem;
		}
	}
</style>
