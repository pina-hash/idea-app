<script lang="ts">
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import FspPresentationsPanel from '$lib/fsp/FspPresentationsPanel.svelte';
	import FspCourseInfoPanel from '$lib/fsp/FspCourseInfoPanel.svelte';
	import {
		FSP_ARCHIVE_ITEMS,
		fspArchiveStateLabel,
		type FspArchiveIcon,
		type FspArchiveItem
	} from '$lib/fsp/archive';

	/**
	 * The Freshman Summer Program archive: a read-only record of a programme that
	 * has finished, kept because the material is still worth reading and because
	 * QR codes pointing into it are already in circulation.
	 *
	 * Public and session-blind on purpose -- /fsp is not an authed prefix, and
	 * everything here was public while the programme ran. Nothing on this page
	 * writes, so there is no state to scope.
	 *
	 * The two slide/course panels are the ORIGINAL components, mounted unchanged;
	 * this page is where they now live. There is deliberately no collapse control
	 * anywhere on it: the retired home card's collapse was a bare div driven by a
	 * document-level listener (mouse-only, silent to assistive tech), and rather
	 * than carry that bug into the archive the list is simply always open.
	 */

	let presentationsOpen = $state(false);
	let courseInfoOpen = $state(false);

	const PANEL_OPENERS: Record<string, () => void> = {
		'fsp-presentations': () => (presentationsOpen = true),
		'fsp-course-info': () => (courseInfoOpen = true)
	};

	const openPanel = (item: FspArchiveItem) => PANEL_OPENERS[item.slug]?.();
</script>

<svelte:head>
	<title>FSP Archive // IDEA</title>
	<meta name="description" content="Archived materials from the IDEA Freshman Summer Program." />
</svelte:head>

{#snippet icon(kind: FspArchiveIcon)}
	<span class="row-icon" aria-hidden="true">
		{#if kind === 'deck'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="4" width="18" height="13" rx="1.5" />
				<path d="M7 9h6M7 12h4" />
				<path d="M8 20l4-3 4 3" />
			</svg>
		{:else if kind === 'pulse'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M2 12h4l2-7 4 14 3-10 2 3h5" />
			</svg>
		{:else if kind === 'plugin'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
				<path d="M12 12v9M12 12l8-4.5M12 12l-8-4.5" />
			</svg>
		{:else if kind === 'clipboard'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="5" y="4" width="14" height="17" rx="1.5" />
				<rect x="9" y="2.5" width="6" height="3" rx="1" />
				<path d="M8.5 11l2 2 4-4.5M8.5 16h7" />
			</svg>
		{:else if kind === 'archive'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="4" width="18" height="4" rx="1" />
				<path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" />
				<path d="M10 12h4" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 5.5C4 4.67 4.67 4 5.5 4H12v16H5.5A1.5 1.5 0 014 18.5v-13z" />
				<path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 001.5-1.5v-13z" />
			</svg>
		{/if}
	</span>
{/snippet}

{#snippet body(item: FspArchiveItem)}
	{@render icon(item.icon)}
	<span class="row-text">
		<span class="row-title">{item.title}</span>
		<span class="row-blurb">{item.blurb}</span>
	</span>
	<span class="row-state state-{item.state}">{fspArchiveStateLabel(item.state)}</span>
{/snippet}

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/">&lsaquo; Home</a>
	</div>
</div>

<main class="fsp-archive-page">
	<section class="hero">
		<div class="eyebrow">IDEA FSP &middot; Archived</div>
		<h1>Freshman Summer Program</h1>
		<p class="lead">
			The Freshman Summer Program has concluded. Its materials are kept here so they stay readable:
			the presentation decks, what each IDEA course covers, and everything the programme linked to.
		</p>
	</section>

	<section class="card">
		<ul class="row-list">
			{#each FSP_ARCHIVE_ITEMS as item (item.slug)}
				<li>
					{#if item.href}
						<a class="row" href={item.href}>{@render body(item)}</a>
					{:else}
						<button class="row" type="button" onclick={() => openPanel(item)}>
							{@render body(item)}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<p class="tail">
		Looking for your classes? They live in <a href="/classroom">IDEA Classroom</a> now.
	</p>

	<footer class="page-footer">
		<VersionBadge app="archive" />
	</footer>
</main>

<FspPresentationsPanel bind:open={presentationsOpen} />
<FspCourseInfoPanel bind:open={courseInfoOpen} />

<style>
	.fsp-archive-page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.lead {
		max-width: 60ch;
	}
	.row-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.row-list li + li {
		border-top: 1px solid var(--line);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		width: 100%;
		padding: 0.85rem 0.2rem;
		background: none;
		border: 0;
		font: inherit;
		color: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.row:hover .row-title {
		color: var(--green);
	}
	.row:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: -2px;
	}
	.row-icon {
		width: 2rem;
		height: 2rem;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg2);
		color: var(--gold);
	}
	.row-icon :global(svg) {
		width: 1.15rem;
		height: 1.15rem;
	}
	.row-text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		flex: 1;
	}
	.row-title {
		font-weight: 700;
		font-size: 1rem;
	}
	.row-blurb {
		font-size: 0.82rem;
		color: var(--dim);
		line-height: 1.4;
	}
	.row-state {
		flex-shrink: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.row-state.state-live {
		color: var(--green);
	}
	.row-state.state-panel {
		color: var(--gold);
	}
	.tail {
		margin-top: 1.4rem;
		font-size: 0.9rem;
		color: var(--dim);
	}
	.tail a {
		color: var(--gold);
	}
	.page-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
	@media (max-width: 640px) {
		.row {
			align-items: flex-start;
		}
		.row-state {
			align-self: center;
		}
	}
</style>
