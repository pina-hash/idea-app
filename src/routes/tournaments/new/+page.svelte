<script lang="ts">
	import { goto } from '$app/navigation';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let name = $state('');
	let description = $state('');
	let qualsEnabled = $state(false);
	let scoreEntry = $state(false);
	let bestOfDefault = $state(1);
	let bestOfGrandFinal = $state(0); // 0 = same as default
	let busy = $state(false);
	let errorMsg = $state('');

	async function create() {
		errorMsg = '';
		if (!name.trim()) {
			errorMsg = 'Give the tournament a name.';
			return;
		}
		busy = true;
		const best_of: Record<string, number> = {};
		if (bestOfGrandFinal > 0) best_of.grand_final = bestOfGrandFinal;
		const { data: id, error } = await data.supabase.rpc('tournament_create', {
			p_name: name.trim(),
			p_description: description.trim(),
			p_config: {
				quals_enabled: qualsEnabled,
				score_entry: scoreEntry,
				best_of_default: bestOfDefault,
				best_of
			}
		});
		busy = false;
		if (error) {
			errorMsg = error.message;
			return;
		}
		await goto(`/tournaments/${id}/host`);
	}
</script>

<svelte:head>
	<title>New Tournament // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/tournaments">&lsaquo; Tournaments</a>
		<ProfileMenu />
	</div>
</div>

<main class="new-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Tournaments</div>
		<h1>New tournament</h1>
		<p class="lead">You become the first host and can add co-hosts later from the host console.</p>
	</section>

	<div class="card">
		<label class="frow">
			<span>Name</span>
			<input type="text" maxlength="80" bind:value={name} placeholder="Tournament name" />
		</label>
		<label class="frow">
			<span>Description</span>
			<textarea rows="3" bind:value={description} placeholder="What is this tournament?"
			></textarea>
		</label>
		<label class="frow toggle">
			<input type="checkbox" bind:checked={qualsEnabled} />
			<span>Qualifying pools before the bracket (head-to-head round robin, seeds the bracket)</span>
		</label>
		<label class="frow toggle">
			<input type="checkbox" bind:checked={scoreEntry} />
			<span>Record per-game scores (off = win/loss only)</span>
		</label>
		<label class="frow">
			<span>Best of (default, per match)</span>
			<select bind:value={bestOfDefault}>
				{#each [1, 3, 5, 7] as n (n)}<option value={n}>Best of {n}</option>{/each}
			</select>
		</label>
		<label class="frow">
			<span>Grand final</span>
			<select bind:value={bestOfGrandFinal}>
				<option value={0}>Same as default</option>
				{#each [1, 3, 5, 7] as n (n)}<option value={n}>Best of {n}</option>{/each}
			</select>
		</label>
		{#if errorMsg}<p class="error">{errorMsg}</p>{/if}
		<div class="btn-row">
			<button class="btn" onclick={create} disabled={busy}>Create tournament</button>
		</div>
	</div>
</main>

<style>
	.new-page {
		max-width: 42rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.frow {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.9rem;
	}
	.frow > span {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.frow input[type='text'],
	.frow textarea,
	.frow select {
		background: var(--bg0);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.45rem 0.6rem;
	}
	.frow.toggle {
		flex-direction: row;
		align-items: center;
		gap: 0.6rem;
	}
	.frow.toggle > span {
		text-transform: none;
		letter-spacing: 0;
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.95rem;
		color: var(--white);
	}
	.error {
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
	}
</style>
