<script lang="ts">
	/**
	 * /admin/view-as (ledger 0422). Find anyone who has signed in, then see the
	 * site exactly as they do (read-only) or act on their account (logged, and
	 * they are told). Below, the record of every session and what each act
	 * session changed.
	 */
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import ViewAsButtons from '$lib/shell/ViewAsButtons.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const when = (iso: string | null) =>
		iso
			? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
			: '';
	const nameOf = (p: { full_name: string | null; display_name: string | null; email: string | null }) =>
		p.display_name?.trim() || p.full_name?.trim() || p.email || 'Someone';
	const ROLE: Record<string, string> = { student: 'Student', teacher: 'Staff', visitor: 'Visitor' };
	const OPS: Record<string, string> = { INSERT: 'added', UPDATE: 'changed', DELETE: 'removed', TRUNCATE: 'cleared' };
	const tableWords = (t: string) => t.replace(/^classroom_|^coin_/, '').replace(/_/g, ' ');
</script>

<svelte:head><title>View as · IDEA</title></svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/admin/test-accounts">Test accounts</a>
		<a class="btn secondary" href="/dashboard">&lsaquo; Admin console</a>
		<ProfileMenu />
	</div>
</div>

<main class="va-page" data-testid="view-as-admin">
	<section class="hero">
		<div class="eyebrow">Admin console</div>
		<h1>View as</h1>
		<p class="va-lede">See the site exactly as one person sees it, or act on their account. A panel you can drag anywhere is the only thing added; Exit brings you back.</p>
	</section>

	{#if form?.message}
		<p class="va-note" role="alert" data-testid="view-as-note">{form.message}</p>
	{/if}

	<div class="va-grid">
		<section class="card va-card" aria-labelledby="va-find">
			<h2 id="va-find" class="section-label">Find someone</h2>
			<form method="GET" class="va-search" role="search">
				<label class="va-field">
					<span class="sr-only">Name or school address</span>
					<input type="search" name="q" value={data.q} placeholder="Name or school address" autocomplete="off" minlength="2" />
				</label>
				<button class="btn" type="submit">Search</button>
			</form>
			{#if data.q && data.people.length === 0}
				<p class="va-small">Nobody who has signed in matches "{data.q}".</p>
			{:else if data.people.length}
				<ul class="va-people" data-testid="view-as-people">
					{#each data.people as p (p.id)}
						<li class="va-person">
							<span class="va-who">
								<strong>{nameOf(p)}</strong>
								<span class="va-small">{p.email} · {ROLE[p.role ?? ''] ?? 'Account'}</span>
							</span>
							<ViewAsButtons userId={p.id} name={nameOf(p)} />
						</li>
					{/each}
				</ul>
			{:else}
				<p class="va-small">Type at least two letters of a name or an address.</p>
			{/if}
		</section>

		<section class="card va-card" aria-labelledby="va-how">
			<h2 id="va-how" class="section-label">The two ways in</h2>
			<dl class="va-modes">
				<div>
					<dt><span class="va-lamp view" aria-hidden="true"></span>View as</dt>
					<dd>Their data, their layout, every page. Nothing can be changed: the site refuses every save.</dd>
				</div>
				<div>
					<dt><span class="va-lamp act" aria-hidden="true"></span>Act as</dt>
					<dd>Changes really happen on their account. Each one is logged under your name, a hand-in is marked in grading as made by you, and they get a notice. Not available for other admins.</dd>
				</div>
			</dl>
			<p class="va-small">A session ends by itself after three hours.</p>
		</section>
	</div>

	<section class="card va-card" aria-labelledby="va-record">
		<h2 id="va-record" class="section-label">Record</h2>
		{#if !data.ready}
			<p class="va-small">The record is not available on this database yet.</p>
		{:else if data.history.length === 0}
			<p class="va-small">No sessions yet.</p>
		{:else}
			<ul class="va-record" data-testid="view-as-record">
				{#each data.history as h (h.session)}
					<li class="va-entry">
						<div class="va-entry-head">
							<span class="va-tag" class:act={h.mode === 'act'}>{h.mode === 'act' ? 'Acted as' : 'Viewed as'}</span>
							<strong>{h.target_name ?? h.target_email}</strong>
							<span class="va-small">by {h.admin_name ?? h.admin_email} · {when(h.started_at)}{h.ended_at ? ` to ${when(h.ended_at)}` : ''}</span>
						</div>
						{#if h.mode === 'act'}
							{#if h.changes.length === 0}
								<p class="va-small">Nothing was changed.</p>
							{:else}
								<details class="va-changes">
									<summary>{h.changes.length} {h.changes.length === 1 ? 'change' : 'changes'}</summary>
									<ul>
										{#each h.changes as c, i (i)}
											<li class="va-small">{when(c.at)} · {tableWords(c.table)} {OPS[c.operation] ?? c.operation.toLowerCase()}{c.path ? ` · ${c.path}` : ''}</li>
										{/each}
									</ul>
								</details>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style>
	.va-page {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 1rem 3rem;
	}
	.va-lede {
		color: var(--text-2);
		margin: 0.3rem auto 0;
		max-width: 46rem;
	}
	.va-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
		gap: 1rem;
		align-items: start;
	}
	@media (max-width: 860px) {
		.va-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.va-card {
		padding: 1.1rem 1.2rem;
		margin: 0 0 1rem;
		min-width: 0;
	}
	.va-card h2 {
		margin: 0 0 0.7rem;
	}
	.va-note {
		margin: 0 0 1rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--amber);
		border-radius: 0.6rem;
	}
	.va-search {
		display: flex;
		gap: 0.6rem;
		margin: 0 0 0.8rem;
	}
	.va-field {
		flex: 1;
		display: flex;
	}
	.va-field input {
		flex: 1;
		min-height: 44px;
		min-width: 0;
	}
	.va-search .btn {
		min-height: 44px;
	}
	.va-small {
		color: var(--text-2);
		font-size: 0.92rem;
		margin: 0;
	}
	.va-people,
	.va-record {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.va-person {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.55rem 0;
		border-top: 1px solid var(--hairline);
	}
	.va-who {
		display: grid;
		min-width: 0;
	}
	.va-who strong {
		overflow-wrap: anywhere;
	}
	.va-modes {
		margin: 0 0 0.7rem;
		display: grid;
		gap: 0.75rem;
	}
	.va-modes dt {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.va-modes dd {
		margin: 0.2rem 0 0;
		color: var(--text-2);
		line-height: 1.4;
	}
	.va-lamp {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.va-lamp.view {
		background: var(--amber);
		box-shadow: 0 0 6px 1px color-mix(in srgb, var(--amber) 60%, transparent);
	}
	.va-lamp.act {
		background: var(--crimson);
		box-shadow: 0 0 6px 1px color-mix(in srgb, var(--crimson) 60%, transparent);
	}
	.va-entry {
		padding: 0.55rem 0;
		border-top: 1px solid var(--hairline);
	}
	.va-entry-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
	}
	.va-tag {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.12rem 0.45rem;
		border-radius: 0.4rem;
		border: 1px solid var(--boundary);
		color: var(--amber);
	}
	.va-tag.act {
		color: var(--crimson);
	}
	.va-changes summary {
		cursor: pointer;
		color: var(--text-2);
		min-height: 32px;
		display: flex;
		align-items: center;
	}
	.va-changes ul {
		margin: 0.2rem 0 0;
		padding-left: 1.1rem;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.va-page input {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 500;
		padding-inline: 0.7rem;
	}
</style>
