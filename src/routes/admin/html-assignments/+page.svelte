<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import { enhance } from '$app/forms';

	/**
	 * THE HTML ASSIGNMENTS HEALTH LIST (ledger 0458, report 3bf69806). Oldest
	 * kit first, so the overhaul has a queue: pages built by hand, then pages on
	 * an older kit, then stamped pages by kit date. Each row names its kit, its
	 * source, its size and saved time, and its classes, and says when a newer
	 * kit has not reached it. A row whose post matches a committed source can
	 * take it with one key.
	 */
	let { data, form } = $props();

	const behind = $derived(data.entries.filter((e) => e.behind).length);
	const noSource = $derived(data.entries.filter((e) => !e.sourceStored).length);

	function saved(at: string | null): string {
		if (!at) return 'never saved';
		const d = new Date(at);
		return Number.isNaN(d.getTime()) ? at : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
	const kb = (n: number) => `${Math.round(n / 1024)} KB`;
</script>

<svelte:head><title>HTML assignments health</title></svelte:head>

<main class="hh" data-testid="html-health">
	<header class="hh-head">
		<h1>HTML assignments</h1>
		<p class="hh-sub">
			Every HTML post in every class, oldest kit first.
			{#if data.kitNow}
				The kit on the site is {data.kitNow.sha} of {data.kitNow.date}.
			{:else}
				The site could not read which kit is current, so every page is listed as needing a check.
			{/if}
		</p>
		{#if !data.unavailable}
			<ul class="hh-tally" aria-label="Totals">
				<li><strong>{data.entries.length}</strong> posts</li>
				<li><strong>{behind}</strong> on an older kit or built by hand</li>
				<li><strong>{noSource}</strong> with no source stored</li>
				<li><strong>{data.committed}</strong> sources in the repository</li>
			</ul>
		{/if}
	</header>

	{#if form?.message}
		<p class="hh-error" role="alert">{form.message}</p>
	{/if}

	{#if data.unavailable}
		<p class="hh-note" role="status">{data.unavailable}</p>
	{:else if !data.entries.length}
		<p class="hh-note">No HTML assignments yet.</p>
	{:else}
		<ol class="hh-list">
			{#each data.entries as e (e.row.item_id)}
				<li class="hh-row" class:is-behind={e.behind} data-testid="html-health-row" data-kit={e.build.kind}>
					<div class="hh-main">
						<p class="hh-title">
							{#if e.row.classes[0]}
								<a href="/classroom/{e.row.classes[0].section_id}/item/{e.row.item_id}">{e.row.title ?? e.row.manifest_title ?? 'Untitled'}</a>
							{:else}
								{e.row.title ?? e.row.manifest_title ?? 'Untitled'}
							{/if}
							{#if !e.row.published}<StatusChip tone="draft" class="hh-draft" label="Draft" />{/if}
						</p>
						<p class="hh-classes">{e.row.classes.map((c) => `${c.course} ${c.label}`).join(', ') || 'Not posted to a class'}</p>
					</div>
					<dl class="hh-facts">
						<div>
							<dt>Kit</dt>
							<dd>
								{e.kitLine}
								{#if e.behind}<span class="hh-flag" data-testid="html-health-behind">Rebuild on the current kit</span>{/if}
							</dd>
						</div>
						<div>
							<dt>Standard</dt>
							<dd>{e.row.standard ?? 'Not stamped'}</dd>
						</div>
						<div>
							<dt>Source</dt>
							<dd>
								{#if e.sourceStored}
									{e.row.source_filename}, saved {saved(e.row.source_updated_at)}
								{:else if e.committed}
									<form method="POST" action="?/attach" use:enhance>
										<input type="hidden" name="item_id" value={e.row.item_id} />
										<input type="hidden" name="path" value={e.committed.path} />
										<button type="submit" class="hh-key" data-testid="html-health-attach">Attach {e.committed.path.split('/').pop()}</button>
									</form>
								{:else}
									Not stored
								{/if}
							</dd>
						</div>
						<div>
							<dt>Page</dt>
							<dd>{kb(e.row.bytes)}, saved {saved(e.row.updated_at)}</dd>
						</div>
						{#if e.pointsMismatch}
							<div>
								<dt>Points</dt>
								<dd class="hh-warn">Post {e.row.points ?? 'unset'}, rubric {e.row.manifest_points}</dd>
							</div>
						{/if}
					</dl>
				</li>
			{/each}
		</ol>
	{/if}
	<p class="hh-note">
		The kit's automatic test runs on every committed source whenever the kit or a source changes; its table is in the repository's Retest assignments run.
	</p>
</main>

<style>
	.hh {
		max-width: 72rem;
		margin: 0 auto;
		padding: var(--space-4) var(--space-4) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.hh-head h1 {
		margin: 0 0 var(--space-1);
		font-family: var(--font-display);
	}
	.hh-sub,
	.hh-note {
		margin: 0;
		color: var(--text-2);
	}
	.hh-tally {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: var(--space-2) 0 0;
		padding: 0;
		list-style: none;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.hh-tally strong {
		color: var(--text-1);
	}
	.hh-error {
		margin: 0;
		color: var(--crimson);
	}
	.hh-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.hh-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
	}
	.hh-row.is-behind {
		border-left: 4px solid var(--amber);
	}
	@media (min-width: 900px) {
		.hh-row {
			grid-template-columns: minmax(14rem, 1fr) minmax(0, 2fr);
		}
	}
	.hh-title {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.hh-classes {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}
	:global(.hh-draft) {
		margin-left: var(--space-1);
	}
	.hh-facts {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: var(--space-2);
	}
	.hh-facts dt {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.hh-facts dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.hh-flag {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--amber);
	}
	.hh-warn {
		color: var(--amber);
	}
	.hh-key {
		min-height: 44px;
		padding: 0 var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2);
		color: var(--text-1);
		font-family: var(--font-mono);
		cursor: pointer;
	}
	.hh-key:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
</style>
