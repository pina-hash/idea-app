<script lang="ts">
	/**
	 * THE PERSISTENT ROOM every /foundry page renders inside.
	 *
	 * WHY IT EXISTS: six routes shared nothing -- no masthead, no way back to
	 * the portal, no way between the surfaces except links scattered in page
	 * bodies, and the review queue reachable only by typing its URL. This is
	 * the ClassroomShell pattern one room over: the layout works out where it
	 * is (`$lib/foundry/nav`) and hands the answer down, so the shell decides
	 * nothing about routing and can be mounted in a harness with no router.
	 *
	 * THE MOLTEN SEAM UNDER THE MASTHEAD IS THE ROOM'S SIGNATURE -- the casting
	 * channel that runs across every Foundry surface. It is the header's one
	 * piece of heat; everything else up here is cold iron and type.
	 *
	 * THE REVIEW TAB IS MARKUP GATING ONLY, and says so. It renders for admins
	 * because a queue nobody is reminded of goes stale; it does not render for
	 * anyone else because the existence of a review lane is not public. The
	 * real boundary is the route's own 404 and `is_admin()` inside the RPCs --
	 * this tab could render for everyone and nothing would open. The pending
	 * count arrives from the layout's server load, which asks only for admins,
	 * so a student's payload does not carry it either.
	 *
	 * HEAT MEANS IN PROGRESS, here too: the count chip is lit (ember trio, the
	 * submitted state's own colours) exactly while something is waiting, and
	 * cold iron when the queue is empty. An admin reads the header and knows.
	 */
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';

	import MoltenSeam from './MoltenSeam.svelte';
	import type { FoundryPlace } from './nav.ts';

	let {
		active = null,
		isAdmin = false,
		reviewPending = null,
		children
	}: {
		active?: FoundryPlace | null;
		isAdmin?: boolean;
		/** Apps waiting for review. Null = not asked (every non-admin). */
		reviewPending?: number | null;
		children: import('svelte').Snippet;
	} = $props();

	const tabs: { place: FoundryPlace; href: string; word: string }[] = [
		{ place: 'gallery', href: '/foundry', word: 'Gallery' },
		{ place: 'mine', href: '/foundry/mine', word: 'My apps' },
		{ place: 'submit', href: '/foundry/submit', word: 'Publish' }
	];
</script>

<header class="fg-header">
	<div class="fg-mast">
		<a class="fg-home" href="/" aria-label="IDEA home"><AnimatedLogo width={92} /></a>
		<a class="fg-wordmark" href="/foundry">Foundry</a>
		<nav class="fg-tabs" aria-label="Foundry">
			{#each tabs as t (t.place)}
				<a
					class="fg-tab tap-44"
					href={t.href}
					aria-current={active === t.place ? 'page' : undefined}
				>
					{t.word}
				</a>
			{/each}
			{#if isAdmin}
				<a
					class="fg-tab tap-44"
					href="/foundry/review"
					aria-current={active === 'review' ? 'page' : undefined}
				>
					Review
					{#if reviewPending !== null}
						<span class="fg-count" data-hot={reviewPending > 0 ? 'true' : undefined}>
							{reviewPending}
						</span>
					{/if}
				</a>
			{/if}
		</nav>
		<div class="fg-mast-right">
			<ProfileMenu />
		</div>
	</div>
	<MoltenSeam variant="seam" />
</header>

{@render children()}

<style>
	.fg-header {
		position: relative;
		z-index: 2; /* above `main`: the ProfileMenu drops a panel below itself */
		background: var(--fg-surface, var(--bg1));
		padding-top: 0.35rem;
	}

	.fg-mast {
		display: flex;
		align-items: center;
		gap: var(--space-4, 1rem);
		flex-wrap: wrap;
		max-width: var(--measure-split, 92rem);
		margin: 0 auto;
		padding: 0.35rem var(--cr-gutter, 1rem);
		min-width: 0;
	}

	.fg-home {
		display: inline-flex;
		align-items: center;
	}

	.fg-wordmark {
		font-family: var(--font-title, var(--font-display));
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-1, var(--white));
		text-decoration: none;
	}

	.fg-wordmark:hover {
		color: var(--text-1, var(--white));
		text-decoration: none;
		text-shadow: none;
	}

	.fg-tabs {
		display: flex;
		align-items: stretch;
		gap: var(--space-2, 0.5rem);
		flex-wrap: wrap;
		min-width: 0;
	}

	.fg-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
		text-decoration: none;
		border: 1px solid transparent;
		border-radius: var(--radius-control, 3px);
	}

	.fg-tab:hover {
		color: var(--text-1, var(--white));
		text-decoration: none;
		text-shadow: none;
	}

	/* Active navigation is green, the one role green keeps in every room. */
	.fg-tab[aria-current='page'] {
		color: var(--green);
		border-color: var(--boundary);
		background: var(--fg-surface-2, var(--bg2));
	}

	.fg-tab:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	/* The pending count: cold iron at zero, the ember trio while work waits.
	   The trios are measured in forge.css; the ink-on-fill pair here is the
	   submitted chip's own (8.05:1). */
	.fg-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.3rem;
		padding: 0.05rem 0.3rem;
		border-radius: 999px;
		border: 1px solid var(--fg-st-draft-edge, var(--hairline));
		background: var(--fg-st-draft-fill, var(--bg2));
		color: var(--fg-st-draft-ink, var(--dim));
		font-size: 0.75rem;
	}

	.fg-count[data-hot] {
		border-color: var(--fg-st-heat-edge, var(--amber));
		background: var(--fg-st-heat-fill, var(--bg2));
		color: var(--fg-st-heat-ink, var(--amber));
		box-shadow: 0 0 8px var(--fg-heat-glow, rgba(246, 149, 47, 0.35));
	}

	.fg-mast-right {
		margin-left: auto;
		display: flex;
		align-items: center;
	}
</style>
