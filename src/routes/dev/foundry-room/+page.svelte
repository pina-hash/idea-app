<script lang="ts">
	/**
	 * THE ROOM AS /foundry, /foundry/review AND /foundry/author/<id> MOUNT IT,
	 * one surface at a time (`?surface=gallery | gallery-open | review |
	 * author`). See +page.server.ts for why this harness exists beside
	 * /dev/foundry-gallery: that one never builds the full-height column, and
	 * the column is where the narrow gallery came from.
	 *
	 * WHAT IS MIRRORED: `.fg-root` with `.cr-app` exactly when
	 * `foundryIsApplication` says so for the real path; the real shell, page
	 * wrapper and surfaces; the forge stylesheet. WHAT IS NOT: the class gate
	 * and the site switch (no session here), and every write (the transports
	 * answer in memory or are absent).
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	import '$lib/foundry/forge.css';
	import FoundryAuthorPage from '$lib/foundry/FoundryAuthorPage.svelte';
	import FoundryGallery from '$lib/foundry/FoundryGallery.svelte';
	import FoundryPage from '$lib/foundry/FoundryPage.svelte';
	import FoundryReviewNav from '$lib/foundry/FoundryReviewNav.svelte';
	import FoundryShell from '$lib/foundry/FoundryShell.svelte';
	import ReviewQueue from '$lib/foundry/ReviewQueue.svelte';
	import { foundryIsApplication, locateFoundry } from '$lib/foundry/nav';
	import { queueOrder } from '$lib/foundry/review';
	import type { FoundryAuthorCard, FoundryReviewTransports } from '$lib/foundry/transports';

	let { data } = $props();

	/* `?theme=space-white`: THE FORGE'S LIGHT TWIN, forced the classroom-teams
	   harness's way. A harness holds no session, so ThemeRoot decides "none"
	   here, and `/foundry` is not in Space White's route scope on this tree
	   (that scope is the site lane's `theme.ts`). Writing the attribute is
	   the only way to measure the twin `forge.css` declares; it is re-written
	   once after ThemeRoot's first effect, and removed on teardown. */
	const themeParam = page.url.searchParams.get('theme');
	$effect(() => {
		if (themeParam !== 'space-white') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', 'space-white');
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	/* HYDRATED, as an attribute a spec can wait on. A card is a real link
	   (`/foundry?app=<slug>`), so a click that lands before hydration follows
	   it -- to a route that sends a signed-out visitor home -- and the run
	   then measures the home page. Paint is not interactivity, and Vite
	   reloads this page once on a cold server while it optimizes the route's
	   dependencies, so the spec waits for this, lets that reload happen, and
	   waits for it again. */
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});

	const surface = $derived(page.url.searchParams.get('surface') ?? 'gallery');
	const path = $derived(
		surface === 'review'
			? '/foundry/review'
			: surface === 'author'
				? '/foundry/author/room-author'
				: '/foundry'
	);
	const active = $derived(locateFoundry(path));
	const isApp = $derived(foundryIsApplication(path));

	let gallerySlug = $state<string | null>(null);
	let reviewSlug = $state<string | null>('hostile-probe');
	const openedOnLoad = $derived(surface === 'gallery-open' ? 'wide-playfield' : null);
	const gallerySelected = $derived.by(() => {
		const slug = gallerySlug ?? openedOnLoad;
		if (!slug) return null;
		const summary = data.apps.find((a) => a.slug === slug);
		// The synthesized cards borrow the playfield fixture's detail and build,
		// so every card in the room opens a real stage.
		const d =
			data.details[slug] ??
			(summary
				? { ...data.details['wide-playfield']!, id: summary.id, slug: summary.slug, title: summary.title }
				: null);
		// A cover on the opened app, so the poster on the idle stage is real.
		return d ? { ...d, cover_path: 'room/cover.png' } : null;
	});
	const reviewSelected = $derived(reviewSlug ? (data.details[reviewSlug] ?? null) : null);

	const reviewTransports: FoundryReviewTransports = {
		async listFiles(versionId) {
			return { ok: true, files: data.files[versionId] ?? [] };
		},
		async readFile(versionId, p) {
			const text = data.sources[versionId]?.[p];
			if (text === undefined) return { ok: false, message: 'That file could not be read.' };
			return { ok: true, text, path: p, byteSize: text.length };
		},
		async decide() {
			return { ok: true };
		}
	};

	const card: FoundryAuthorCard = {
		owner: 'room-author',
		owner_display_name: null,
		owner_full_name: 'Sam Cruz',
		owner_class: 'Engineering II',
		avatar: 'preset:bolt',
		avatar_url: null,
		pathway: 'IDEA',
		app_count: 16,
		first_published_at: '2026-03-04T12:00:00Z'
	};

	/** Any stored cover path resolves to one static picture this dev server has. */
	const coverUrl = () => '/IDEA/icon-512.png';
</script>

<svelte:head><title>dev: Foundry room ({surface})</title></svelte:head>

<div class="fg-root" class:cr-app={isApp} data-room-surface={surface} data-room-hydrated={hydrated ? 'true' : undefined}>
	<FoundryShell {active} isAdmin={true} reviewPending={queueOrder(data.apps).length}>
		{#if surface === 'review'}
			<FoundryPage
				heading="Review queue"
				lead="Read the source beside the running build. Approving publishes it immediately; sending it back needs a reason and a note the student can act on."
				testid="foundry-review-page"
				split
			>
				{#snippet nav()}
					<FoundryReviewNav active="apps" pendingApps={queueOrder(data.apps).length} pendingApplications={2} />
				{/snippet}
				<ReviewQueue
					apps={data.apps}
					selected={reviewSelected}
					transports={reviewTransports}
					onSelect={(slug) => (reviewSlug = slug)}
					now={new Date('2026-08-24T12:00:00Z')}
				/>
			</FoundryPage>
		{:else if surface === 'author'}
			<FoundryAuthorPage {card} apps={data.apps} playCounts={{}} {coverUrl} />
		{:else}
			<FoundryPage
				heading="Gallery"
				lead="Web apps built and published by students. Everything here runs in a sandbox on a separate address, so nothing it does can reach your account."
				testid="foundry-gallery-page"
				split
			>
				<FoundryGallery
					apps={data.apps}
					selected={gallerySelected}
					onSelect={(slug) => (gallerySlug = slug)}
					appsOrigin="https://apps.ideabosco.com"
					{coverUrl}
				/>
			</FoundryPage>
		{/if}
	</FoundryShell>
</div>
