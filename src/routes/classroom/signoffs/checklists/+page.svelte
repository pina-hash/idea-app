<script lang="ts">
	/**
	 * EDIT A SIGN-OFF CHECKLIST (ledger 0436, 0304). Every checkpoint copied in
	 * from a team post, one card each: its title, date, shop gate and items. An
	 * item is checked by the site (auto, its check named) or tapped pass or fail
	 * by the instructor (tap), and a tap item may be Mr. Pina's alone or name the
	 * role whose owner gets the fix. Save writes the whole checklist; a re-upload
	 * of the post never overwrites it.
	 */
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	// svelte-ignore state_referenced_locally
	const supabase = data.supabase;

	interface Item {
		id: string;
		kind: 'auto' | 'tap';
		text: string;
		check?: string;
		blocks?: string[];
		ownerOnly?: boolean;
		role?: string;
	}
	interface Cp {
		item_id: string;
		item_title: string;
		key: string;
		title: string;
		date: string | null;
		gate: string | null;
		items: Item[];
	}
	const CHECKS = ['plan-owners', 'roles-owned', 'plan-balanced', 'blocks-complete', 'assignment-complete'];

	let list = $state<Cp[] | null>(null);
	let said = $state<Record<string, string>>({});
	async function read() {
		const { data: raw } = await supabase.rpc('classroom_signoff_checklists');
		list = ((raw as { checkpoints?: Cp[] } | null)?.checkpoints ?? []).map((c) => ({ ...c, items: c.items.map((i) => ({ ...i })) }));
	}
	$effect(() => {
		untrack(() => void read());
	});
	const k = (c: Cp) => `${c.item_id}:${c.key}`;
	async function save(c: Cp) {
		const { data: out, error } = await supabase.rpc('classroom_signoff_checkpoint_set', {
			p_item_id: c.item_id,
			p_key: c.key,
			p_title: c.title,
			p_due_on: c.date || null,
			p_gate: c.gate ?? '',
			p_items: c.items.map((i) => ({ ...i, blocks: i.kind === 'auto' ? i.blocks : undefined }))
		});
		said = { ...said, [k(c)]: error || !(out as { ok?: boolean })?.ok ? 'Not saved: check every item has an id and words.' : 'Saved.' };
	}
	function add(c: Cp) {
		c.items.push({ id: `item-${c.items.length + 1}`, kind: 'tap', text: '' });
	}
</script>

<svelte:head><title>Sign-off checklists</title></svelte:head>

<div class="ck-page">
	<h1 class="ck-title">Sign-off checklists</h1>
	{#if !list}
		<p class="card ck-p">Reading the checklists.</p>
	{:else if !list.length}
		<p class="card ck-p">No team post has a checkpoint yet. A checkpoint appears here the first time a team's plan reads it.</p>
	{:else}
		{#each list as c (k(c))}
			<section class="card ck-card">
				<p class="ck-from">From {c.item_title}</p>
				<div class="ck-row">
					<label><span class="section-label">Title</span><input bind:value={c.title} maxlength="80" /></label>
					<label><span class="section-label">Date</span><input type="date" bind:value={c.date} /></label>
				</div>
				<label><span class="section-label">Shop gate</span><input bind:value={c.gate} maxlength="200" placeholder="No metal is cut before this sign-off." /></label>
				<ol class="ck-items">
					{#each c.items as item, i (i)}
						<li class="ck-item">
							<div class="ck-row">
								<select class="cr-select" bind:value={item.kind} aria-label="Kind">
									<option value="tap">Tap (pass or fail)</option>
									<option value="auto">Auto (the site checks)</option>
								</select>
								{#if item.kind === 'auto'}
									<select class="cr-select" bind:value={item.check} aria-label="Check">
										{#each CHECKS as ch (ch)}<option value={ch}>{ch}</option>{/each}
									</select>
								{:else}
									<label class="ck-inline"><input type="checkbox" bind:checked={item.ownerOnly} /> Mr. Pina only</label>
									<input class="ck-role" bind:value={item.role} placeholder="Role id for the fix (optional)" />
								{/if}
							</div>
							<input class="ck-text" bind:value={item.text} maxlength="200" placeholder="What is checked" />
							{#if item.kind === 'auto' && item.check === 'blocks-complete'}
								<input
									class="ck-text"
									value={(item.blocks ?? []).join(', ')}
									onchange={(e) => (item.blocks = (e.currentTarget as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean))}
									placeholder="Block ids, separated by commas"
								/>
							{/if}
							<button type="button" class="btn ghost danger" onclick={() => c.items.splice(i, 1)}>Remove</button>
						</li>
					{/each}
				</ol>
				<div class="ck-row">
					<button type="button" class="btn secondary" onclick={() => add(c)}>Add an item</button>
					<button type="button" class="btn" onclick={() => save(c)}>Save</button>
					{#if said[k(c)]}<span class="ck-said" role="status">{said[k(c)]}</span>{/if}
				</div>
			</section>
		{/each}
	{/if}
</div>

<style>
	.ck-page {
		display: grid;
		gap: 0.8rem;
		max-width: 56rem;
		margin: 0 auto;
		padding: 0.5rem 0 2rem;
	}
	.ck-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.6rem;
	}
	.ck-p {
		margin: 0;
		padding: 1rem;
	}
	.ck-card {
		display: grid;
		gap: 0.6rem;
		padding: 1rem;
	}
	.ck-from {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}
	.ck-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.ck-row label,
	.ck-card > label {
		display: grid;
		gap: 0.2rem;
		flex: 1 1 12rem;
	}
	.ck-items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.ck-item {
		display: grid;
		gap: 0.4rem;
		padding: 0.6rem;
		border-radius: 0.6rem;
		border: 1px solid color-mix(in srgb, var(--dim) 25%, transparent);
	}
	.ck-text,
	.ck-role {
		min-height: 44px;
		width: 100%;
	}
	.ck-inline {
		display: flex !important;
		align-items: center;
		gap: 0.4rem;
		flex: 0 0 auto !important;
		min-height: 44px;
	}
	.ck-said {
		font-family: var(--font-display);
		color: var(--text-2, var(--dim));
	}
</style>
