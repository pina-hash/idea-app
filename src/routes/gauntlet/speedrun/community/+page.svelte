<script lang="ts">
	import { goto } from '$app/navigation';
	import Header from '$lib/gauntlet/Header.svelte';
	import RouteBuilder from '$lib/gauntlet/RouteBuilder.svelte';
	import { ROUTE_STATUS_WORDS, type RouteSummary } from '$lib/gauntlet/community';

	let { data } = $props();
	let { supabase, userName, userRole } = $derived(data);

	const mine = $derived(data.routes.filter((r: RouteSummary) => r.mine));
	const queue = $derived(data.routes.filter((r: RouteSummary) => !r.mine && r.status === 'pending'));
	const listed = $derived(data.routes.filter((r: RouteSummary) => !r.mine && r.status !== 'pending' && r.status !== 'hidden'));
	const hidden = $derived(data.routes.filter((r: RouteSummary) => !r.mine && r.status === 'hidden'));

	let building = $state(false);
	let busy = $state(false);
	let error = $state('');

	async function create(draft: { title: string; description: string; ids: string[] }) {
		busy = true;
		error = '';
		const { data: id, error: e } = await supabase.rpc('gauntlet_route_save', {
			p_route_id: null,
			p_title: draft.title,
			p_description: draft.description,
			p_challenge_ids: draft.ids
		});
		busy = false;
		if (e) {
			error = e.message;
			return;
		}
		await goto(`/gauntlet/speedrun/community/${id as string}`);
	}
</script>

<svelte:head>
	<title>Community speedruns · GAUNTLET</title>
</svelte:head>

<Header
	{supabase}
	{userName}
	{userRole}
	crumbs={[{ label: 'Speedrun', href: '/gauntlet/speedrun' }, { label: 'Community' }]}
/>

{#snippet card(r: RouteSummary)}
	<li>
		<a class="rc" href="/gauntlet/speedrun/community/{r.id}" data-route={r.id}>
			<span class="rc-top">
				<span class="rc-title">{r.title}</span>
				{#if r.status && (r.mine || r.status !== 'listed')}
					{@const w = ROUTE_STATUS_WORDS[r.status]}
					<span class="rc-status status-{r.status}"><span aria-hidden="true">{w.glyph}</span> {w.word}</span>
				{/if}
			</span>
			{#if r.description}<span class="rc-desc">{r.description}</span>{/if}
			<span class="rc-meta mono">{r.part_count} parts · by {r.author}</span>
		</a>
	</li>
{/snippet}

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Speedrun</span>
		<h1>Community speedruns</h1>
		<p class="lead">
			String Speedrun parts into a run of your own and race your friends on it. Your time on a speedrun
			is the sum of your best ranked times on its parts.
		</p>
		<div class="mode-hero-meta">
			<span class="mono">{listed.length} listed · {mine.length} yours</span>
		</div>
	</section>

	{#if data.state === 'unavailable'}
		<div class="card"><p>Community speedruns are on their way. Check back soon.</p></div>
	{:else if data.state === 'error'}
		<div class="card"><p>The speedrun list did not load. Refresh to try again.</p></div>
	{:else}
		<section class="cs-block" aria-labelledby="cs-make">
			<div class="cs-head">
				<h2 id="cs-make">Make a speedrun</h2>
				{#if !building}
					<button type="button" class="btn" onclick={() => (building = true)} data-action="new-route">New speedrun</button>
				{/if}
			</div>
			{#if building}
				<div class="card">
					<RouteBuilder parts={data.parts} {busy} {error} onsave={create} oncancel={() => (building = false)} />
				</div>
			{:else}
				<p class="dim cs-note">
					It is yours to share by link straight away. Ask for it to be listed and a teacher checks it before
					every student can find it.
				</p>
			{/if}
		</section>

		{#if mine.length}
			<section class="cs-block" aria-labelledby="cs-mine">
				<h2 id="cs-mine">Yours</h2>
				<ul class="rc-list">{#each mine as r (r.id)}{@render card(r)}{/each}</ul>
			</section>
		{/if}

		{#if data.canReview && queue.length}
			<section class="cs-block" aria-labelledby="cs-queue" data-testid="route-queue">
				<h2 id="cs-queue">Waiting for review</h2>
				<ul class="rc-list">{#each queue as r (r.id)}{@render card(r)}{/each}</ul>
			</section>
		{/if}

		<section class="cs-block" aria-labelledby="cs-listed">
			<h2 id="cs-listed">Listed</h2>
			{#if listed.length}
				<ul class="rc-list">{#each listed as r (r.id)}{@render card(r)}{/each}</ul>
			{:else}
				<p class="dim cs-note">Nothing listed yet. Make the first one.</p>
			{/if}
		</section>

		{#if data.canReview && hidden.length}
			<section class="cs-block" aria-labelledby="cs-hidden">
				<h2 id="cs-hidden">Taken down</h2>
				<ul class="rc-list">{#each hidden as r (r.id)}{@render card(r)}{/each}</ul>
			</section>
		{/if}
	{/if}

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet/speedrun">&lsaquo; Speedrun</a>
		<a class="btn secondary" href="/gauntlet/speedrun/history">My attempts</a>
	</div>
</main>

<style>
	.cs-block {
		margin-top: 1.6rem;
	}
	.cs-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		margin-bottom: 0.6rem;
	}
	.cs-block h2 {
		margin: 0 0 0.6rem;
	}
	.cs-head h2 {
		margin: 0;
	}
	.cs-note {
		margin: 0;
	}
	.rc-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
		gap: 0.6rem;
	}
	.rc {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		height: 100%;
		box-sizing: border-box;
		padding: 0.8rem 0.9rem;
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 6px;
		color: var(--white);
		text-decoration: none;
	}
	.rc:hover,
	.rc:focus-visible {
		border-color: var(--green);
	}
	.rc-top {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.3rem 0.6rem;
	}
	.rc-title {
		font-size: 1.1rem;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.rc-desc {
		color: var(--dim);
		font-size: 0.92rem;
		overflow-wrap: anywhere;
	}
	.rc-meta {
		margin-top: auto;
		font-size: 0.74rem;
		color: var(--cyan);
	}
	.rc-status {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.1rem 0.45rem;
		border: 1px solid var(--line-strong);
		border-radius: 3px;
		color: var(--dim);
	}
	.status-pending {
		color: var(--teal);
		border-color: var(--teal);
	}
	.status-hidden {
		color: var(--amber);
		border-color: var(--amber);
	}
</style>
