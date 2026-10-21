<script lang="ts">
	/**
	 * NOTICES ABOUT YOUR OWN ACCOUNT (ledger 0422): today, only "a site admin
	 * worked on your account", written when an admin acts as someone. Read in
	 * the browser after the page is up, so no page load waits on it; nothing
	 * is drawn when there is nothing to say or the database cannot answer yet.
	 */
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';

	let { supabase }: { supabase: SupabaseClient } = $props();

	type Notice = { id: string; title: string; body: string; created_at: string };
	let notices = $state<Notice[]>([]);

	onMount(() => {
		let gone = false;
		supabase.rpc('account_notices_mine').then(({ data, error }) => {
			if (!gone && !error && Array.isArray(data)) notices = data as Notice[];
		});
		return () => {
			gone = true;
		};
	});

	async function dismiss(id: string) {
		const keep = notices;
		notices = notices.filter((n) => n.id !== id);
		const { error } = await supabase.rpc('account_notice_dismiss', { p_id: id });
		if (error) notices = keep;
	}
</script>

{#if notices.length}
	<div class="an-wrap" role="status" data-testid="account-notices">
		{#each notices as n (n.id)}
			<div class="an-card">
				<span class="an-lamp" aria-hidden="true"></span>
				<div class="an-text">
					<strong>{n.title}</strong>
					<span>{n.body}</span>
				</div>
				<button class="btn secondary" type="button" onclick={() => dismiss(n.id)}>Got it</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.an-wrap {
		display: grid;
		gap: 0.5rem;
		max-width: 72rem;
		margin: 0.6rem auto;
		padding: 0 1rem;
	}
	.an-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.7rem 0.9rem;
		border-radius: 12px;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
	}
	.an-lamp {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--amber);
		box-shadow: 0 0 6px 1px color-mix(in srgb, var(--amber) 60%, transparent);
	}
	.an-text {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
		flex: 1;
	}
	.an-text span {
		color: var(--text-2);
		font-size: 0.95rem;
	}
	.an-card .btn {
		min-height: 44px;
		flex: none;
	}
</style>
