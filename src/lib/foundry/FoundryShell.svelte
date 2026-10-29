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

	import AppSubNav, { type SubNavItem } from '$lib/shell/AppSubNav.svelte';
	import MoltenSeam from './MoltenSeam.svelte';
	import type { FoundryPlace } from './nav.ts';

	let {
		active = null,
		isAdmin = false,
		managesSection = false,
		reviewPending = null,
		children
	}: {
		active?: FoundryPlace | null;
		isAdmin?: boolean;
		/**
		 * 0173. Whether this viewer is the teacher of record for any section,
		 * which is what /foundry/classes is for. FALSE FOR EVERY STUDENT and
		 * false for staff who teach no section -- it is `manages`, never
		 * `role === 'teacher'`, which the email domain hands to all staff.
		 *
		 * IT IS NOT A GATE. `classroom_manages_section` inside the RPCs is,
		 * and the page renders its own refusal for somebody who manages
		 * nothing; this only decides whether a door is offered to somebody who
		 * can already open it.
		 */
		managesSection?: boolean;
		/** Apps waiting for review. Null = not asked (every non-admin). */
		reviewPending?: number | null;
		children: import('svelte').Snippet;
	} = $props();

	/**
	 * REQUESTS SITS BESIDE THE GALLERY (report b2ba6d74, ledger 0360): the
	 * board is where somebody who wants a game asks for one, so it is next to
	 * the place they went looking for it. Every signed-in student gets it.
	 */
	const tabs: { place: FoundryPlace; href: string; word: string }[] = [
		{ place: 'gallery', href: '/foundry', word: 'Gallery' },
		{ place: 'requests', href: '/foundry/requests', word: 'Requests' },
		{ place: 'mine', href: '/foundry/mine', word: 'My apps' },
		{ place: 'contract', href: '/foundry/contract', word: 'Build contract' },
		{ place: 'submit', href: '/foundry/submit', word: 'Publish' }
	];

	/**
	 * THE ROOM'S PLACES ARE THE SITE'S ONE APP SUB-NAV (ledger 0468): the
	 * Plate's pads under the masthead, the current place lit. A SITE
	 * ADMINISTRATOR GETS THE CLASSES PAD TOO (ledger 0360): the whole-Foundry
	 * switch lives on that page, and an admin who teaches no section would
	 * otherwise have no door to it. The Review pad's count is lit while
	 * something waits.
	 */
	const places: SubNavItem[] = $derived([
		...tabs.map((t) => ({ id: t.place, label: t.word, href: t.href, current: active === t.place })),
		...(managesSection || isAdmin ? [{ id: 'classes', label: 'Classes', href: '/foundry/classes', current: active === 'classes' }] : []),
		...(isAdmin
			? [{ id: 'review', label: 'Review', href: '/foundry/review', current: active === 'review', count: reviewPending, hot: (reviewPending ?? 0) > 0 }]
			: [])
	]);
</script>

<header class="fg-header">
	<div class="fg-mast">
		<a class="fg-home" href="/" aria-label="IDEA home"><AnimatedLogo width={92} /></a>
		<a class="fg-wordmark" href="/foundry">Foundry</a>
		<div class="fg-mast-right">
			<ProfileMenu />
		</div>
	</div>
	<div class="fg-subnav">
		<AppSubNav label="Foundry" testid="foundry-tabs" items={places} />
	</div>
	<MoltenSeam variant="seam" />
</header>

<!--
	THE SECOND HALF OF THE `scroll="fill"` CONTRACT, and it can only be claimed
	here. `.cr-app` goes on `.fg-root` in +layout.svelte, because the header and
	the page are SIBLINGS under it and a component can never claim the element
	above itself; this is the body that takes whatever the header leaves. It is
	inert unless the layout put `.cr-app` on, which it does for exactly the two
	places a student bundle actually runs.
-->
<div class="fg-body cr-app-body">
	{@render children()}
</div>

<style>
	/* A PLAIN WRAPPER UNLESS THE ROOM IS AN APPLICATION. Below 1024px, and on
	   every page the layout does not mark, this is a `display: block` div and
	   changes nothing about how the document flows -- which is what the submit
	   form and the build contract need, both being long documents somebody
	   scrolls.

	   In app mode it is a flex column that does NOT scroll itself: the split
	   inside it owns the scrolling, one region per pane, which is the whole
	   point of pinning the detail. A wrapper that also scrolled would be the
	   two-scrollbars failure `page-flow` exists to avoid. */
	.fg-body {
		min-height: 0;
	}

	@media (min-width: 1024px) {
		:global(.cr-app) > .fg-body {
			display: flex;
			flex-direction: column;
			min-height: 0;
			overflow: hidden;
		}
	}

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
		min-height: 44px;
	}

	.fg-wordmark {
		/* 44px tall (ledger 0469): it measured 26.9. */
		display: inline-flex;
		align-items: center;
		min-height: 44px;
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

	/* The pads sit on the masthead's own measure, under the logo row. */
	.fg-subnav {
		max-width: var(--measure-split, 92rem);
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1rem) 0.4rem;
		min-width: 0;
	}
	.fg-subnav :global(.app-subnav) {
		margin: 0;
	}
	.fg-subnav :global(.idea-pads) {
		justify-content: flex-start;
	}

	.fg-mast-right {
		margin-left: auto;
		display: flex;
		align-items: center;
	}
</style>
