<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';

	/**
	 * Shared header for the GAUNTLET section. Mirrors the app-shell `.app-header`
	 * used by the dashboard: the IDEA wordmark, a breadcrumb into the dojo, the
	 * signed-in user block, and a client-side sign out (matching the homepage).
	 * A live mono clock rounds out the VIEWPORT chrome (see GAUNTLET-DESIGN.md).
	 */
	interface Crumb {
		label: string;
		href?: string;
	}

	let {
		supabase,
		userName,
		userRole,
		crumbs = []
	}: {
		supabase: SupabaseClient;
		userName: string;
		userRole: string;
		crumbs?: Crumb[];
	} = $props();

	let clock = $state('--:--:--');
	onMount(() => {
		const tick = () => (clock = new Date().toLocaleTimeString('en-US', { hour12: false }));
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	});

	const signOut = async () => {
		await supabase.auth.signOut();
		await invalidateAll();
	};
</script>

<header class="app-header">
	<div class="gauntlet-brand">
		<a class="wordmark" href="/">IDEA</a>
		<nav class="gauntlet-crumbs" aria-label="Breadcrumb">
			<a class="crumb crumb-root" href="/gauntlet">// GAUNTLET</a>
			{#each crumbs as crumb (crumb.label)}
				<span class="crumb-sep" aria-hidden="true">/</span>
				{#if crumb.href}
					<a class="crumb" href={crumb.href}>{crumb.label}</a>
				{:else}
					<span class="crumb crumb-current">{crumb.label}</span>
				{/if}
			{/each}
		</nav>
	</div>
	<div class="header-right">
		<span class="gt-clock" aria-hidden="true">{clock}</span>
		<div class="user-block">
			<div class="user-name">{userName}</div>
			<div class="user-role">{userRole}</div>
		</div>
		<button class="btn secondary" type="button" onclick={signOut}>Sign out</button>
	</div>
</header>

<style>
	.gt-clock {
		font-family: var(--font-data, var(--font-mono));
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		color: var(--ice);
		text-shadow: 0 0 8px rgba(136, 221, 255, 0.4);
	}
</style>
