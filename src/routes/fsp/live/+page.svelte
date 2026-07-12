<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import FspLiveFeed from '$lib/fsp/FspLiveFeed.svelte';
	import FspStudentPreview from '$lib/fsp/FspStudentPreview.svelte';

	/**
	 * /fsp/live — the standalone Q&A display, projected during FSP live sessions.
	 * Staff only (@boscotech.edu). Presentations now run from Claude Design
	 * externally; this page is always opened separately (its own window/tab) for
	 * Q&A, never embedded in a deck. The actual question feed (Realtime
	 * subscription + cards) lives in $lib/fsp/FspLiveFeed.svelte, shared with the
	 * dead-code FspDeck.svelte and the dev harnesses. This page owns the chrome:
	 * the staff auth gate, the session preset panel, the QR code, and the
	 * full-screen toggle.
	 *
	 * Session selection is now six fixed presets (Day1-A/B, Day2-A/B, Day3-A/B),
	 * not free text — one FSP still runs three days, two sessions each. Clicking
	 * a preset writes it to fsp_config.active_session (same RLS-gated write path
	 * as before); the feed reacts because `session` is passed to FspLiveFeed and
	 * it re-subscribes whenever that prop changes. Switching presets naturally
	 * "clears" what's on screen since a new session_id starts with no rows for
	 * it; Clear Feed remains as an explicit soft-delete of the CURRENT session's
	 * questions for edge cases (e.g. clearing chatter mid-session without
	 * switching to a new slot).
	 */

	const ALLOWED_DOMAIN = '@boscotech.edu';
	const SESSION_PRESETS = ['Day1-A', 'Day1-B', 'Day2-A', 'Day2-B', 'Day3-A', 'Day3-B'];
	const ASK_URL = 'https://ideabosco.com/fsp/ask';
	const QR_SRC =
		'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https%3A%2F%2Fideabosco.com%2Ffsp%2Fask&bgcolor=0a0a0a&color=00FF41&format=png';

	let { data } = $props();
	const supabase = $derived(data.supabase as SupabaseClient);
	const claims = $derived(data.claims);

	const email = $derived((claims?.email ?? '').toString());
	const signedIn = $derived(!!claims);
	const domainOk = $derived(email.toLowerCase().endsWith(ALLOWED_DOMAIN));

	let loading = $state(false);
	let authError = $state('');

	let activeSession = $state('');
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

	async function selectSession(s: string) {
		if (busy || s === activeSession) return;
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
		} catch (err) {
			feedError = err instanceof Error ? err.message : 'Could not set the session.';
		} finally {
			busy = '';
		}
	}

	async function clearFeed() {
		if (!activeSession || busy) return;
		busy = 'clear';
		feedError = '';
		try {
			const { error } = await supabase.rpc('clear_fsp_session', { p_session_id: activeSession });
			if (error) throw error;
			// Soft clear: the feed's Realtime UPDATE handler removes the cleared
			// cards on its own; new questions repopulate it.
		} catch (err) {
			feedError = err instanceof Error ? err.message : 'Could not clear the feed.';
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
			activeSession = cfg?.value ?? 'Day1-A';
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
				<p>Sign in with your Bosco Tech staff account to run the live display.</p>
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
					You are signed in as <strong>{email || 'an unknown account'}</strong>. The live display is
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
				<button class="ghost" onclick={() => (studentOpen = true)} title="Preview the student phone view">
					Student View
				</button>
				<button class="ghost fs" onclick={toggleFullscreen} title="Toggle full screen">
					{isFullscreen ? 'Exit full screen' : 'Full screen'}
				</button>
			</div>
		</header>

		{#if feedError}<p class="err bannErr">{feedError}</p>{/if}

		<div class="layout">
			<aside class="panel">
				<div class="active-session">
					<span class="active-label">Active session</span>
					<span class="active-name">{activeSession || '—'}</span>
					<span class="count">{count} question{count === 1 ? '' : 's'}</span>
				</div>

				<div class="presets">
					{#each SESSION_PRESETS as preset (preset)}
						<button
							class="preset"
							class:active={preset === activeSession}
							onclick={() => selectSession(preset)}
							disabled={busy !== ''}
						>
							{preset}
						</button>
					{/each}
				</div>

				<button class="ghost danger clear" onclick={clearFeed} disabled={busy !== '' || !activeSession}>
					{busy === 'clear' ? 'Clearing…' : 'Clear Feed'}
				</button>

				<div class="qr-block">
					<img class="qr" src={QR_SRC} width="200" height="200" alt="QR code linking to {ASK_URL}" />
					<span class="qr-label">ideabosco.com/fsp/ask</span>
				</div>
			</aside>

			<main class="feed">
				<FspLiveFeed variant="console" {supabase} session={activeSession} bind:count />
			</main>
		</div>

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

	/* ---- Top bar ---- */
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
	.bannErr {
		padding: 0.4rem 1.2rem;
	}

	/* ---- Widescreen layout: session panel + feed ---- */
	.layout {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: row;
	}
	@media (max-width: 860px) {
		.layout {
			flex-direction: column;
		}
	}

	.panel {
		flex: 0 0 300px;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
		padding: 1.1rem 1rem 1.4rem;
		border-right: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		background: #0c110c;
		overflow-y: auto;
	}
	@media (max-width: 860px) {
		.panel {
			flex: 0 0 auto;
			border-right: 0;
			border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		}
	}

	.active-session {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.active-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #4a7a52;
	}
	.active-name {
		font-size: 2rem;
		font-weight: 700;
		line-height: 1.1;
		color: var(--green, #00ff41);
		text-shadow: 0 0 14px rgba(0, 255, 65, 0.4);
	}
	.count {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		color: var(--cyan, #00f0ff);
	}

	.presets {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.preset {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.9rem;
		letter-spacing: 0.02em;
		padding: 0.6rem 0.5rem;
		border-radius: 8px;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.25));
		background: #0a0f0a;
		color: #a9c9ad;
		cursor: pointer;
	}
	.preset:hover:not(:disabled) {
		background: rgba(0, 255, 65, 0.1);
		color: var(--green, #00ff41);
	}
	.preset:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.preset.active {
		background: rgba(0, 255, 65, 0.16);
		border-color: var(--green, #00ff41);
		color: var(--green, #00ff41);
		box-shadow: 0 0 14px rgba(0, 255, 65, 0.2);
	}

	.clear {
		align-self: flex-start;
	}

	.qr-block {
		margin-top: auto;
		padding-top: 0.8rem;
		border-top: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.qr {
		width: 140px;
		height: 140px;
		border-radius: 8px;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.3));
		background: #0a0a0a;
	}
	.qr-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: #6fae77;
		text-align: center;
	}

	.feed {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding-top: 0.5rem;
	}
</style>
