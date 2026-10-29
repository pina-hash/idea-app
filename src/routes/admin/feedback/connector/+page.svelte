<script lang="ts">
	import PageHeader from '$lib/shell/PageHeader.svelte';
	/**
	 * THE CONNECTOR'S GAPS, as one of the feedback console's tabs: what was asked
	 * of Claude that the site cannot do yet, open first. Each gap shows his words
	 * as he said them, what was tried, the saved requests it produced with their
	 * last practice result, and a status control: open, built (with the ledger
	 * that built it) or declined. In the site plate: the status keys are raised
	 * keys lit when current, the chips recessed tags. Instructor-facing, so no
	 * mascot, and every key is a 44px target.
	 */
	import { enhance } from '$app/forms';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import type { ActionData, PageData } from './$types';
	import type { Gap } from './+page.server';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let view = $state<'open' | 'built' | 'declined' | 'all'>('open');
	let building = $state<string | null>(null);

	const counts = $derived({
		open: data.gaps.filter((g) => g.status === 'open').length,
		built: data.gaps.filter((g) => g.status === 'built').length,
		declined: data.gaps.filter((g) => g.status === 'declined').length,
		all: data.gaps.length
	});
	const shown = $derived(view === 'all' ? data.gaps : data.gaps.filter((g) => g.status === view));
	const VIEWS = [
		{ id: 'open', label: 'Open' },
		{ id: 'built', label: 'Built' },
		{ id: 'declined', label: 'Declined' },
		{ id: 'all', label: 'All' }
	] as const;

	const when = (iso: string | null) =>
		iso
			? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
			: '';
	const tool = (t: string) => t.replace(/^site_call:/, '').replace(/_/g, ' ');
	const statusWord = (g: Gap) => (g.status === 'built' ? `Built in ${g.built_ledger}` : g.status === 'declined' ? 'Declined' : 'Open');
</script>

<svelte:head><title>Connector feedback · IDEA</title></svelte:head>

<main class="cg-page" data-testid="connector-gaps">
	<PageHeader eyebrow="IDEA Admin · Feedback" title="Asked of Claude, not built yet" meta="Everything you asked the IDEA Website connector that the site could not do. Mark one built with the ledger that built it, or declined." />

	{#if data.unavailable}
		<section class="card cg-card"><p data-testid="connector-gaps-unavailable">{data.unavailable}</p></section>
	{:else}
		<div class="cg-views" role="group" aria-label="Which gaps">
			{#each VIEWS as v (v.id)}
				<button
					type="button"
					class="btn secondary cg-key"
					class:on={view === v.id}
					aria-pressed={view === v.id}
					onclick={() => (view = v.id)}
					data-testid="connector-gaps-view-{v.id}"
				>
					{v.label} <span class="cg-count">{counts[v.id]}</span>
				</button>
			{/each}
		</div>

		{#if shown.length === 0}
			<section class="card cg-card">
				<p class="cg-small">
					{view === 'open' ? 'Nothing is waiting. Everything asked of Claude so far was something the site could do.' : 'None here.'}
				</p>
			</section>
		{:else}
			<ul class="cg-list" data-testid="connector-gap-list">
				{#each shown as g (g.id)}
					<li class="card cg-card cg-gap" data-testid="connector-gap" data-status={g.status}>
						<div class="cg-head">
							<span class="cg-tag" class:open={g.status === 'open'}>{statusWord(g)}</span>
							<span class="cg-small">{when(g.created_at)}{g.model ? ` · ${g.model}` : ''}</span>
						</div>
						<blockquote class="cg-said">{g.said}</blockquote>
						<p class="cg-missing"><span class="section-label">Missing</span> {g.missing}</p>
						{#if g.tried.length}
							<p class="cg-small"><span class="section-label">Tried</span> {g.tried.map(tool).join(', ')}</p>
						{/if}
						{#if g.evals.length}
							<p class="section-label cg-sub">Saved requests</p>
							<ul class="cg-evals">
								{#each g.evals as e (e.seq)}
									<li>
										<span class="cg-num">#{e.seq}</span>
										<span class="cg-eval-said">{e.said}</span>
										<span class="cg-tag" class:pass={e.last_passed === true} class:fail={e.last_passed === false}>
											{e.last_passed === null ? 'Not replayed' : e.last_passed ? 'Passed' : 'Failed'}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
						{#if form?.id === g.id && form?.message}
							<p class="cg-note" role="status">{form.message}</p>
						{/if}
						<form method="POST" action="?/status" class="cg-actions" use:enhance>
							<input type="hidden" name="id" value={g.id} />
							{#if building === g.id}
								<label class="cg-ledger">
									<span class="cg-small">Ledger that built it</span>
									<input name="ledger" inputmode="numeric" pattern="[0-9]{'{'}4{'}'}" maxlength="4" placeholder="0402" required />
								</label>
								<button class="btn" type="submit" name="status" value="built">Mark built</button>
								<button class="btn secondary" type="button" onclick={() => (building = null)}>Cancel</button>
							{:else}
								{#if g.status !== 'built'}
									<button class="btn secondary" type="button" onclick={() => (building = g.id)} data-testid="connector-gap-built">Built</button>
								{/if}
								{#if g.status !== 'declined'}
									<button class="btn secondary" type="submit" name="status" value="declined">Decline</button>
								{/if}
								{#if g.status !== 'open'}
									<button class="btn secondary" type="submit" name="status" value="open">Open again</button>
								{/if}
							{/if}
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<footer class="cg-footer"><VersionBadge app="portal" /></footer>
</main>

<style>
	.cg-page {
		max-width: 60rem;
		margin: 0 auto;
		padding: 0 1rem 3rem;
	}
	.cg-views {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0 0 1rem;
	}
	.cg-key,
	.cg-actions .btn {
		min-height: 44px;
	}
	.cg-count {
		margin-left: 0.35rem;
		color: var(--text-2);
	}
	.cg-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.9rem;
	}
	.cg-card {
		padding: 1rem 1.15rem;
		margin: 0;
		min-width: 0;
	}
	.cg-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin: 0 0 0.5rem;
	}
	.cg-said {
		margin: 0 0 0.6rem;
		font-size: 1.15rem;
		line-height: 1.35;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.cg-said::before {
		content: '\201C';
	}
	.cg-said::after {
		content: '\201D';
	}
	.cg-missing {
		margin: 0 0 0.5rem;
		overflow-wrap: anywhere;
	}
	.cg-small {
		color: var(--text-2);
		font-size: 0.92rem;
		margin: 0 0 0.5rem;
	}
	.cg-sub {
		margin: 0.4rem 0 0.3rem;
	}
	.cg-evals {
		list-style: none;
		margin: 0 0 0.6rem;
		padding: 0;
		display: grid;
		gap: 0.35rem;
	}
	.cg-evals li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}
	.cg-num {
		font-family: var(--font-mono);
		color: var(--text-2);
	}
	.cg-eval-said {
		flex: 1 1 14rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.cg-tag {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.15rem 0.45rem;
		border-radius: 0.4rem;
		border: 1px solid var(--boundary);
		color: var(--text-2);
	}
	.cg-tag.open,
	.cg-tag.fail {
		color: var(--amber);
	}
	.cg-tag.pass {
		color: var(--green);
	}
	.cg-note {
		margin: 0 0 0.6rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--boundary);
		border-radius: 0.6rem;
	}
	.cg-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.5rem;
	}
	.cg-ledger {
		display: grid;
		gap: 0.2rem;
	}
	.cg-ledger input {
		min-height: 44px;
		width: 7rem;
		font-family: var(--font-mono);
	}
	.cg-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
</style>
