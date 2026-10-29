<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Header from '$lib/gauntlet/Header.svelte';
	import RouteBuilder from '$lib/gauntlet/RouteBuilder.svelte';
	import { formatTime } from '$lib/gauntlet';
	import { ROUTE_STATUS_WORDS, routeProgress, type RouteStatus } from '$lib/gauntlet/community';

	let { data } = $props();
	let { supabase, userName, userRole } = $derived(data);
	const r = $derived(data.route);
	const progress = $derived(routeProgress(r.parts));
	const status = $derived(r.status ? ROUTE_STATUS_WORDS[r.status as RouteStatus] : null);

	let editing = $state(false);
	let busy = $state(false);
	let error = $state('');
	let note = $state('');
	let confirmDelete = $state(false);

	async function call(fn: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
		busy = true;
		error = '';
		note = '';
		const { error: e } = await fn();
		busy = false;
		if (e) {
			error = e.message;
			return false;
		}
		note = done;
		await invalidateAll();
		return true;
	}

	const save = async (draft: { title: string; description: string; ids: string[] }) => {
		const ok = await call(
			() =>
				supabase.rpc('gauntlet_route_save', {
					p_route_id: r.id,
					p_title: draft.title,
					p_description: draft.description,
					p_challenge_ids: draft.ids
				}),
			r.status === 'listed' ? 'Saved. It goes back for review before it is listed again.' : 'Saved.'
		);
		if (ok) editing = false;
	};
	const share = (list: boolean) =>
		call(
			() => supabase.rpc('gauntlet_route_share', { p_route_id: r.id, p_list: list }),
			list ? 'Sent for review. A teacher lists it for everyone.' : 'It is link only now.'
		);
	const review = (decision: 'list' | 'hide' | 'return') =>
		call(
			() => supabase.rpc('gauntlet_route_review', { p_route_id: r.id, p_decision: decision }),
			decision === 'list' ? 'Listed for every student.' : decision === 'hide' ? 'Taken down.' : 'Returned to link only.'
		);
	async function remove() {
		busy = true;
		const { error: e } = await supabase.rpc('gauntlet_route_delete', { p_route_id: r.id });
		busy = false;
		if (e) {
			error = e.message;
			return;
		}
		await goto('/gauntlet/speedrun/community');
	}

	let copied = $state(false);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(page.url.href);
			copied = true;
			setTimeout(() => (copied = false), 2500);
		} catch {
			copied = false;
		}
	}

	const secs = (s: number | null) => (s === null || s === undefined ? '--' : formatTime(Number(s)));
</script>

<svelte:head>
	<title>{r.title} · Community speedruns · GAUNTLET</title>
</svelte:head>

<Header
	{supabase}
	{userName}
	{userRole}
	crumbs={[
		{ label: 'Speedrun', href: '/gauntlet/speedrun' },
		{ label: 'Community', href: '/gauntlet/speedrun/community' },
		{ label: r.title }
	]}
/>

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Community speedrun</span>
		<h1>{r.title}</h1>
		{#if r.description}<p class="lead">{r.description}</p>{/if}
		<div class="mode-hero-meta">
			<span class="mono">{r.part_count} parts · by {r.author}</span>
			{#if status}
				<span class="cr-status status-{r.status}" title={status.hint} data-testid="route-status">
					<span aria-hidden="true">{status.glyph}</span>
					{status.word}
				</span>
			{/if}
		</div>
	</section>

	<p class="cr-live" role="status">{note}</p>
	{#if error}<p class="cr-error" role="alert">{error}</p>{/if}

	{#if r.mine || r.can_review}
		<section class="card cr-tools" data-testid="route-tools">
			{#if r.mine}
				<div class="cr-tool-row">
					<button type="button" class="btn secondary" onclick={copyLink} data-action="copy-link">
						{copied ? 'Link copied' : 'Copy link'}
					</button>
					{#if r.status === 'private'}
						<button type="button" class="btn" disabled={busy} onclick={() => share(true)} data-action="ask-list">
							Ask to list it
						</button>
					{:else if r.status === 'pending' || r.status === 'listed'}
						<button type="button" class="btn secondary" disabled={busy} onclick={() => share(false)} data-action="unlist">
							Make it link only
						</button>
					{/if}
					<button type="button" class="btn secondary" onclick={() => (editing = !editing)} data-action="edit-route">
						{editing ? 'Close editor' : 'Edit'}
					</button>
					{#if confirmDelete}
						<button type="button" class="btn danger" disabled={busy} onclick={remove} data-action="confirm-delete">Delete it</button>
						<button type="button" class="btn secondary" onclick={() => (confirmDelete = false)}>Keep</button>
					{:else}
						<button type="button" class="btn secondary" onclick={() => (confirmDelete = true)} data-action="delete-route">Delete</button>
					{/if}
				</div>
				{#if status}<p class="dim cr-hint">{status.hint}</p>{/if}
			{/if}
			{#if r.can_review}
				<div class="cr-tool-row" data-testid="route-review">
					<span class="cr-review-label">Review</span>
					<button type="button" class="btn" disabled={busy || r.status === 'listed'} onclick={() => review('list')} data-action="review-list">
						List it
					</button>
					<button type="button" class="btn secondary" disabled={busy || r.status === 'private'} onclick={() => review('return')}>
						Return to link only
					</button>
					<button type="button" class="btn danger" disabled={busy || r.status === 'hidden'} onclick={() => review('hide')}>
						Take down
					</button>
				</div>
			{/if}
		</section>
		{#if editing && r.mine}
			<section class="card">
				<RouteBuilder
					parts={data.parts}
					initial={{ title: r.title, description: r.description, ids: r.parts.map((p: { id: string }) => p.id) }}
					{busy}
					saveLabel="Save changes"
					onsave={save}
					oncancel={() => (editing = false)}
				/>
			</section>
		{/if}
	{/if}

	<section class="cr-grid">
		<div>
			<h2>Parts</h2>
			<p class="dim cr-progress mono">
				You: {progress.done} of {progress.total} ranked{progress.held ? ` · ${progress.held} held for review` : ''}
			</p>
			<ol class="cr-parts">
				{#each r.parts as p, i (p.id)}
					<li class="cr-part">
						<span class="cr-n mono">{i + 1}</span>
						{#if p.published}
							<a class="cr-part-title" href="/gauntlet/speedrun/{p.id}">{p.title}</a>
						{:else}
							<span class="cr-part-title dim">{p.title} (no longer published)</span>
						{/if}
						<span class="cr-part-time mono">
							{#if p.my_state === 'ranked'}
								<span class="cr-done" aria-label="Ranked">✓</span> {secs(p.my_seconds)}
							{:else if p.my_state === 'pending_verification'}
								<span class="cr-held">◷ held</span>
							{:else}
								<span class="dim">not run</span>
							{/if}
						</span>
					</li>
				{/each}
			</ol>
		</div>
		<div>
			<h2>Leaderboard</h2>
			{#if r.board.length === 0}
				<p class="dim">Nobody has a ranked run on every part yet. Be the first.</p>
			{:else}
				<table class="board" data-testid="route-board">
					<thead>
						<tr>
							<th class="rank-col">#</th>
							<th>Player</th>
							<th class="time-col">Total</th>
						</tr>
					</thead>
					<tbody>
						{#each r.board as b, i (i)}
							<tr class:me={b.me}>
								<td class="rank-col">{b.rank}</td>
								<td>{b.player}{#if b.me}<span class="you">you</span>{/if}</td>
								<td class="time-col mono">{secs(b.total_seconds)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
			<p class="board-note">
				A total counts your best ranked time on each part. Runs held for review count once they are
				cleared.
			</p>
		</div>
	</section>

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet/speedrun/community">&lsaquo; Community speedruns</a>
	</div>
</main>

<style>
	.cr-status {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.12rem 0.5rem;
		border: 1px solid var(--line-strong);
		border-radius: 3px;
		color: var(--dim);
	}
	.status-pending {
		color: var(--status-info);
		border-color: var(--status-info);
	}
	.status-listed {
		color: var(--green);
		border-color: var(--green);
	}
	.status-hidden {
		color: var(--amber);
		border-color: var(--amber);
	}
	.cr-live {
		margin: 0.6rem 0 0;
		color: var(--white);
	}
	.cr-live:empty {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
	.cr-error {
		margin: 0.6rem 0 0;
		color: var(--amber);
	}
	.cr-tools {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 1rem;
	}
	.cr-tool-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.cr-tool-row .btn {
		min-height: 44px;
	}
	.cr-review-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.cr-hint {
		margin: 0;
	}
	.btn.danger {
		color: var(--crimson);
		border-color: var(--crimson);
	}
	.cr-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1.6rem;
		margin-top: 1.6rem;
	}
	.cr-grid h2 {
		margin: 0 0 0.4rem;
	}
	.cr-progress {
		margin: 0 0 0.6rem;
		font-size: 0.8rem;
	}
	.cr-parts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.cr-part {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 44px;
		padding: 0 0.7rem;
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 4px;
	}
	.cr-n {
		flex: none;
		width: 1.3rem;
		color: var(--cyan);
	}
	.cr-part-title {
		flex: 1;
		min-width: 0;
		color: var(--white);
		overflow-wrap: anywhere;
	}
	a.cr-part-title:hover {
		color: var(--green);
	}
	.cr-part-time {
		flex: none;
		font-size: 0.85rem;
	}
	.cr-done {
		color: var(--green);
	}
	.cr-held {
		color: var(--status-info);
	}
	.board {
		width: 100%;
	}
	@media (max-width: 760px) {
		.cr-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
