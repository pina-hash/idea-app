<script lang="ts">
	/**
	 * THE HARNESS PAGE. It mounts the REAL components with in-memory transports.
	 *
	 * Selection is local state here rather than the URL, because the point is to
	 * drive both surfaces on one screen without a router round trip between
	 * clicks. Everything else -- the components, the tokens, the frame, the
	 * source reads -- is the shipping path.
	 */
	import FoundryGallery from '$lib/foundry/FoundryGallery.svelte';
	import ReviewQueue from '$lib/foundry/ReviewQueue.svelte';
	import type {
		FoundryGalleryTransports,
		FoundryReviewTransports
	} from '$lib/foundry/transports';

	let { data } = $props();

	const now = new Date('2026-08-24T12:00:00Z');

	let gallerySlug = $state<string | null>('hostile-probe');
	let reviewSlug = $state<string | null>('hostile-probe');
	/** What the decision transport was last handed, rendered so a drive can read it. */
	let lastDecision = $state<string>('(none yet)');

	const gallerySelected = $derived(gallerySlug ? (data.details[gallerySlug] ?? null) : null);
	const reviewSelected = $derived(reviewSlug ? (data.details[reviewSlug] ?? null) : null);

	function srcFor(appId: string, versionId: string): string {
		return data.srcs[`${appId}:${versionId}`] ?? '';
	}

	const galleryTransports: FoundryGalleryTransports = {
		async launch({ appId, versionId }) {
			const src = srcFor(appId, versionId);
			if (!src) return { ok: false, message: 'PUBLIC_FOUNDRY_APPS_HOST is not set.' };
			return { ok: true, src, versionId, expiresInSeconds: 1800 };
		}
	};

	const reviewTransports: FoundryReviewTransports = {
		launch: galleryTransports.launch,
		async listFiles(versionId) {
			const files = data.files[versionId] ?? [];
			return { ok: true, files };
		},
		async readFile(versionId, path) {
			const text = data.sources[versionId]?.[path];
			if (text === undefined) return { ok: false, message: 'That file could not be read.' };
			return { ok: true, text, path, byteSize: new TextEncoder().encode(text).byteLength };
		},
		async decide({ versionId, decision, note, reasonId }) {
			lastDecision = JSON.stringify({ versionId, decision, note, reasonId });
			return { ok: true };
		},
		async clearMetadataFlag(appId) {
			lastDecision = JSON.stringify({ clearedFlagFor: appId });
			return { ok: true };
		}
	};
</script>

<svelte:head><title>Foundry gallery harness</title></svelte:head>

<div class="cr-root harness">
	<header>
		<h1>Foundry gallery / review harness</h1>
		{#if !data.configured}
			<p class="warn">
				PUBLIC_FOUNDRY_APPS_HOST is not set, so no frame can load. Set it in .env to the loopback
				alias you are serving on (for example <code>127.0.0.1:5173</code>) and reload.
			</p>
		{:else}
			<p class="note">Apps host: <code>{data.appsHost}</code></p>
		{/if}
		<p class="note">
			Last decision handed to the transport: <code data-testid="last-decision">{lastDecision}</code>
		</p>
		<p class="note">
			The unpublished build with a PUBLISHED token (must 404, the review kind is what lifts it):
			<a href={data.staleWithPublishedToken} data-testid="stale-published-token" target="_blank"
				rel="noreferrer">open it</a
			>
		</p>
	</header>

	<!--
		EACH SURFACE SITS IN THE SAME PAGE SHELL ITS ROUTE GIVES IT, and that is
		not decoration: a geometry measured in a harness whose container differs
		from the route's is not the shipping geometry. Measured the hard way --
		this page's own `.harness` wrapper let the split run to 1313px at a 1440px
		viewport, where the real route caps it, so the numbers it produced were
		about a page nobody will ever load. `.fdy-shell` restates the routes' two
		rules (`--measure-split` and the room's gutter) and nothing else.
	-->
	<section class="fdy-shell">
		<h2>
			/foundry &mdash; the gallery
			<!--
				NOTHING OPEN IS A FIRST-CLASS ARRANGEMENT, not a placeholder state:
				the split renders NO detail pane and the card grid takes the whole
				measure. The routes reach it by navigating to the path with no
				`?app`; the harness needs a control for it, and it drives the same
				`onSelect(null)` the routes call.
			-->
			<button type="button" class="hbtn" onclick={() => (gallerySlug = null)}>deselect</button>
		</h2>
		<FoundryGallery
			apps={data.apps}
			selected={gallerySelected}
			transports={galleryTransports}
			onSelect={(slug) => (gallerySlug = slug)}
		/>
	</section>

	<section class="fdy-shell">
		<h2>
			/foundry/review &mdash; the queue
			<button type="button" class="hbtn" onclick={() => (reviewSlug = null)}>deselect</button>
		</h2>
		<ReviewQueue
			apps={data.apps}
			selected={reviewSelected}
			transports={reviewTransports}
			onSelect={(slug) => (reviewSlug = slug)}
			{now}
		/>
	</section>
</div>

<style>
	/* The harness's own chrome only. The surfaces below carry the routes' shell. */
	.harness {
		display: flex;
		flex-direction: column;
		gap: var(--space-6, 1.5rem);
		padding: var(--space-5, 1.25rem) 0;
		min-width: 0;
	}

	.harness > header {
		padding: 0 var(--cr-gutter, 1rem);
	}

	.fdy-shell {
		max-width: var(--measure-split);
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1rem);
		min-width: 0;
		width: 100%;
	}

	h2 {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}

	.hbtn {
		margin-left: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: none;
		color: var(--cyan);
		background: none;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 6px);
		padding: 0.15rem 0.4rem;
		cursor: pointer;
	}

	.note {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}

	.warn {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--amber);
	}
</style>
