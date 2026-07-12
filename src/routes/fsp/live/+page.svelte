<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import FspLiveFeed from '$lib/fsp/FspLiveFeed.svelte';
	import FspStudentPreview from '$lib/fsp/FspStudentPreview.svelte';

	/**
	 * /fsp/live — Mr. Pina's live presenter console for FSP Q&A. Staff only
	 * (@boscotech.edu). The actual question feed (Realtime subscription + cards)
	 * lives in $lib/fsp/FspLiveFeed.svelte so the Day 1 deck (/fsp/day1 slide 13)
	 * embeds the SAME feed without rebuilding it. This page owns the chrome: the
	 * staff auth gate, the active-session controls (Set / Clear), the count, and
	 * the full-screen toggle.
	 */

	const ALLOWED_DOMAIN = '@boscotech.edu';

	let { data } = $props();
	const supabase = $derived(data.supabase as SupabaseClient);
	const claims = $derived(data.claims);

	const email = $derived((claims?.email ?? '').toString());
	const signedIn = $derived(!!claims);
	const domainOk = $derived(email.toLowerCase().endsWith(ALLOWED_DOMAIN));

	let loading = $state(false);
	let authError = $state('');

	let activeSession = $state('');
	let sessionInput = $state('');
	let count = $state(0);
	let feedError = $state('');
	let busy = $state(''); // 'set' | 'clear' | ''

	let rootEl: HTMLElement;
	let isFullscreen = $state(false);
	let studentOpen = $state(false);

	async function signIn() {
		loading = true;
		authError = '';
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/fsp/live')}`,
				queryParams: { hd: 'boscotech.edu', prompt: 'select_account' }
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

	async function setSession() {
		const s = sessionInput.trim();
		if (!s || busy) return;
		busy = 'set';
		feedError = '';
		try {
			const { error } = await supabase
				.from('fsp_config')
				.update({ value: s })
				.eq('key', 'active_session');
			if (error) throw error;
			// The feed reacts to the `session` prop changing.
			activeSession = s;
			sessionInput = s;
		} catch (err) {
			feedError = err instanceof Error ? err.message : 'Could not set the session.';
		} finally {
			busy = '';
		}
	}

	async function clearSession() {
		if (!activeSession || busy) return;
		busy = 'clear';
		feedError = '';
		try {
			const { error } = await supabase.rpc('clear_fsp_session', { p_session_id: activeSession });
			if (error) throw error;
			// Soft clear: the feed's Realtime UPDATE handler removes the cleared
			// cards on its own; new questions repopulate it.
		} catch (err) {
			feedError = err instanceof Error ? err.message : 'Could not clear the session.';
		} finally {
			busy = '';
		}
	}

	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			rootEl?.requestFullscreen?.().catch(() => {});
		} else {
			document.exitFullscreen?.().catch(() => {});
		}
	}

	function onFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
	}

	onMount(async () => {
		document.addEventListener('fullscreenchange', onFullscreenChange);
		if (signedIn && domainOk) {
			const { data: cfg } = await supabase
				.from('fsp_config')
				.select('value')
				.eq('key', 'active_session')
				.maybeSingle();
			const session = cfg?.value ?? 'Day1-A';
			activeSession = session;
			sessionInput = session;
		}
	});

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.removeEventListener('fullscreenchange', onFullscreenChange);
		}
	});
</script>

<svelte:head>
	<title>FSP — Live Q&amp;A</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="live-root" bind:this={rootEl}>
	{#if !signedIn}
		<div class="center">
			<div class="card">
				<h1>FSP Live Q&amp;A</h1>
				<p>Sign in with your Bosco Tech staff account to run the live feed.</p>
				<button class="primary" onclick={signIn} disabled={loading}>
					{loading ? 'Redirecting…' : 'Sign in with Google'}
				</button>
				{#if authError}<p class="err">{authError}</p>{/if}
				<p class="fine">Staff only (<strong>@boscotech.edu</strong>).</p>
			</div>
		</div>
	{:else if !domainOk}
		<div class="center">
			<div class="card">
				<h1>Staff only</h1>
				<p>
					You are signed in as <strong>{email || 'an unknown account'}</strong>. The live console is
					for Bosco Tech staff (<strong>@boscotech.edu</strong>).
				</p>
				<button class="primary" onclick={signOut}>Sign out and switch account</button>
			</div>
		</div>
	{:else}
		<header class="bar">
			<div class="brand">
				<span class="dot" class:live={count > 0}></span>
				<span class="title">FSP LIVE</span>
			</div>
			<div class="controls">
				<label class="sesslabel" for="sess">Session</label>
				<input
					id="sess"
					class="sess"
					type="text"
					bind:value={sessionInput}
					placeholder="Day1-A"
					onkeydown={(e) => e.key === 'Enter' && setSession()}
				/>
				<button class="ghost" onclick={setSession} disabled={busy !== '' || !sessionInput.trim()}>
					{busy === 'set' ? 'Setting…' : 'Set Session'}
				</button>
				<button class="ghost danger" onclick={clearSession} disabled={busy !== '' || !activeSession}>
					{busy === 'clear' ? 'Clearing…' : 'Clear Session'}
				</button>
				<button class="ghost" onclick={() => (studentOpen = true)} title="Preview the student phone view">
					Student View
				</button>
				<button class="ghost fs" onclick={toggleFullscreen} title="Toggle full screen">
					{isFullscreen ? 'Exit full screen' : 'Full screen'}
				</button>
			</div>
		</header>

		<div class="meta">
			<span>Active session: <strong>{activeSession || '—'}</strong></span>
			<span class="count">{count} question{count === 1 ? '' : 's'}</span>
		</div>

		{#if feedError}<p class="err bannErr">{feedError}</p>{/if}

		<main class="feed">
			<FspLiveFeed variant="console" {supabase} session={activeSession} bind:count />
		</main>

		<FspStudentPreview bind:open={studentOpen} />
	{/if}
</div>

<style>
	.live-root {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: #0a0a0a;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', system-ui, sans-serif;
	}
	.center {
		min-height: 100vh;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 1.25rem;
	}
	.card {
		width: 100%;
		max-width: 460px;
		background: #101410;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 16px;
		padding: 1.6rem 1.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	h1 {
		font-size: 1.7rem;
		font-weight: 700;
		color: var(--green, #00ff41);
		text-shadow: 0 0 14px rgba(0, 255, 65, 0.45);
		margin: 0;
	}
	p {
		margin: 0;
		line-height: 1.5;
	}
	.primary {
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.05rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.9rem 1.1rem;
		border-radius: 10px;
		border: 1px solid var(--green, #00ff41);
		background: rgba(0, 255, 65, 0.12);
		color: var(--green, #00ff41);
		cursor: pointer;
	}
	.primary:hover:not(:disabled) {
		background: rgba(0, 255, 65, 0.22);
	}
	.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.fine {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		color: #4a7a52;
	}
	.err {
		color: #ff6b6b;
		font-size: 0.9rem;
	}

	/* ---- Console ---- */
	.bar {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem 1rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.8rem 1.1rem;
		background: #0c110c;
		border-bottom: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}
	.brand .title {
		font-family: 'Share Tech Mono', monospace;
		letter-spacing: 0.14em;
		color: var(--green, #00ff41);
		font-size: 1rem;
	}
	.dot {
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: #3a5a3f;
	}
	.dot.live {
		background: var(--green, #00ff41);
		box-shadow: 0 0 12px rgba(0, 255, 65, 0.8);
		animation: pulse 1.6s ease-in-out infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.sesslabel {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: #4a7a52;
		text-transform: uppercase;
	}
	.sess {
		font: inherit;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.95rem;
		width: 8.5rem;
		color: var(--white, #e8ffe8);
		background: #0a0f0a;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 7px;
		padding: 0.45rem 0.6rem;
	}
	.sess:focus {
		outline: none;
		border-color: var(--green, #00ff41);
	}
	.ghost {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.45rem 0.7rem;
		border-radius: 7px;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		background: transparent;
		color: var(--green, #00ff41);
		cursor: pointer;
	}
	.ghost:hover:not(:disabled) {
		background: rgba(0, 255, 65, 0.12);
	}
	.ghost:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.ghost.danger {
		color: var(--gold, #c8ff00);
		border-color: rgba(200, 255, 0, 0.4);
	}
	.ghost.danger:hover:not(:disabled) {
		background: rgba(200, 255, 0, 0.1);
	}
	.meta {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 1.2rem 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		color: #7fae86;
	}
	.meta strong {
		color: var(--cyan, #00f0ff);
	}
	.bannErr {
		padding: 0.4rem 1.2rem;
	}
	.feed {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding-top: 0.5rem;
	}
</style>
