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

<header class="app-header gt-header">
	<div class="gt-brand">
		<span class="gt-eyebrow">Trains SOLIDWORKS skills</span>
		<nav class="gt-brandline" aria-label="Breadcrumb">
			<span class="gt-wordmark">
				<a href="/">IDEA</a><span class="sl" aria-hidden="true">//</span><a href="/gauntlet">GAUNTLET</a>
			</span>
			{#each crumbs as crumb (crumb.label)}
				<span class="crumb-sep" aria-hidden="true">&rsaquo;</span>
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
	/* Sample-matched brand block: mono eyebrow over an Orbitron gradient wordmark
	   (green -> lime -> cyan), with the breadcrumb trailing in mono. */
	.gt-brand {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.gt-eyebrow {
		font-family: var(--font-data, 'Share Tech Mono', monospace);
		font-size: 0.6rem;
		letter-spacing: 0.34em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.gt-brandline {
		display: flex;
		align-items: baseline;
		gap: 0.55rem;
		flex-wrap: wrap;
	}
	.gt-wordmark {
		font-family: var(--font-head, 'Orbitron', sans-serif);
		font-weight: 900;
		font-size: 1.7rem;
		letter-spacing: 0.02em;
		line-height: 1;
		background: linear-gradient(92deg, var(--green), var(--lime) 60%, var(--cyan));
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		color: transparent;
		filter: drop-shadow(0 0 14px rgba(0, 255, 65, 0.28));
		transition: filter 0.25s ease;
	}
	/* The two links share the wordmark's clipped gradient (transparent fill lets
	   the parent's gradient show through their glyphs). */
	.gt-wordmark a {
		-webkit-text-fill-color: transparent;
		color: transparent;
		text-decoration: none;
	}
	.gt-wordmark .sl {
		-webkit-text-fill-color: var(--dim);
		color: var(--dim);
		font-weight: 500;
		margin: 0 0.18em;
	}
	.gt-wordmark:hover {
		filter: drop-shadow(0 0 18px rgba(0, 255, 65, 0.5)) brightness(1.06);
	}
	/* Breadcrumb trail after the wordmark. */
	.crumb-sep {
		font-family: var(--font-data, 'Share Tech Mono', monospace);
		color: var(--dim);
	}
	.crumb {
		font-family: var(--font-data, 'Share Tech Mono', monospace);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		color: var(--dim);
		text-decoration: none;
		transition: color 0.2s ease;
	}
	a.crumb:hover {
		color: var(--green);
	}
	.crumb-current {
		color: var(--cyan);
	}
	.gt-clock {
		font-family: var(--font-data, var(--font-mono));
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		color: var(--ice);
		text-shadow: 0 0 8px rgba(136, 221, 255, 0.4);
	}
</style>
