<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import '$lib/fsp/fsp-theme.css';
	import FspTechSelection from '$lib/fsp/FspTechSelection.svelte';
	import { execUrl, fetchSelection, type FspSelection } from '$lib/fsp/client';

	/**
	 * /fsp-tech-selection — live tech-ranking tool for incoming freshmen during
	 * FSP, reached cold from a QR code. Reuses the existing Google OAuth flow,
	 * restricted to @boscotech.net. Writes DIRECTLY to the Apps Script endpoint
	 * (no Supabase). Neutral Bosco Tech branding, scoped under `.fsp-root`.
	 */

	let { data } = $props();
	const supabase = $derived(data.supabase as SupabaseClient);
	const claims = $derived(data.claims);

	const email = $derived((claims?.email ?? '').toString());
	const signedIn = $derived(!!claims);
	const domainOk = $derived(email.toLowerCase().endsWith('@boscotech.net'));

	const url = execUrl();

	let loading = $state(false);
	let authError = $state('');

	// Prefill state (loaded client-side once we know the signed-in email).
	let prefillDone = $state(false);
	let initial = $state<FspSelection | null>(null);

	async function signIn() {
		loading = true;
		authError = '';
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/fsp-tech-selection')}`,
				// Hint Google to the school domain (UX only; the real check is below).
				queryParams: { hd: 'boscotech.net', prompt: 'select_account' }
			}
		});
		if (error) {
			authError = error.message;
			loading = false;
		}
	}

	async function signOut() {
		await supabase.auth.signOut();
		await invalidateAll();
	}

	onMount(async () => {
		if (signedIn && domainOk && url) {
			try {
				initial = await fetchSelection(url, email);
			} catch {
				initial = null; // prefill is best-effort; never blocks the student
			}
		}
		prefillDone = true;
	});
</script>

<svelte:head>
	<title>Bosco Tech — Tech Selection</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="fsp-root">
	{#if !signedIn}
		<div class="gate">
			<div class="gate-card">
				<h1>Tech Selection</h1>
				<p>Rank your top four Bosco Tech pathways. Sign in with your Bosco Tech account to begin.</p>
				<button class="google" onclick={signIn} disabled={loading}>
					{loading ? 'Redirecting…' : 'Sign in with Google'}
				</button>
				{#if authError}<p class="err">{authError}</p>{/if}
				<p class="fine">Use your <strong>@boscotech.net</strong> student account.</p>
				<a class="staff-link" href="/fsp-tech-selection/preview">See how staff view this &rarr;</a>
			</div>
		</div>
	{:else if !domainOk}
		<div class="gate">
			<div class="gate-card">
				<h1>Wrong account</h1>
				<p>
					You are signed in as <strong>{email || 'an unknown account'}</strong>. This tool is for
					Bosco Tech students only. Please sign in with your <strong>@boscotech.net</strong> account.
				</p>
				<button class="google" onclick={signOut}>Sign out and switch account</button>
				<a class="staff-link" href="/fsp-tech-selection/preview">See how staff view this &rarr;</a>
			</div>
		</div>
	{:else if !prefillDone}
		<div class="gate">
			<div class="gate-card">
				<span class="spinner" aria-hidden="true"></span>
				<p>Loading your ranking…</p>
			</div>
		</div>
	{:else}
		<FspTechSelection {email} {initial} execUrl={url} />
	{/if}
</div>

<style>
	.gate {
		min-height: 70vh;
		display: grid;
		place-items: center;
		padding: 2rem 1.25rem;
	}
	.gate-card {
		max-width: 440px;
		width: 100%;
		text-align: center;
		background: var(--fsp-surface);
		border: 1px solid var(--fsp-line);
		border-radius: 14px;
		padding: 2rem 1.75rem;
		box-shadow: 0 8px 30px rgba(10, 37, 64, 0.08);
	}
	.gate-card h1 {
		font-size: 1.6rem;
		font-weight: 800;
		color: var(--fsp-navy);
		margin-bottom: 0.6rem;
	}
	.gate-card p {
		color: var(--fsp-muted);
		margin-bottom: 1.2rem;
	}
	.google {
		font: inherit;
		font-weight: 700;
		padding: 0.7rem 1.3rem;
		border-radius: 9px;
		border: none;
		cursor: pointer;
		background: var(--fsp-navy);
		color: #fff;
	}
	.google:hover:not(:disabled) {
		background: var(--fsp-navy-2);
	}
	.google:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.fine {
		margin-top: 1.1rem;
		font-size: 0.85rem;
	}
	.err {
		color: var(--fsp-warn);
		font-size: 0.85rem;
	}
	.staff-link {
		display: inline-block;
		margin-top: 1rem;
		font-size: 0.85rem;
		color: var(--fsp-navy-2);
		text-decoration: none;
		border-bottom: 1px dotted currentColor;
	}
	.spinner {
		display: inline-block;
		width: 22px;
		height: 22px;
		border: 3px solid var(--fsp-line);
		border-top-color: var(--fsp-navy);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		margin-bottom: 0.6rem;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
