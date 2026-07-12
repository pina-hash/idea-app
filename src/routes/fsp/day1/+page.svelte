<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import FspLiveFeed from '$lib/fsp/FspLiveFeed.svelte';

	/**
	 * /fsp/day1 — the FSP Day 1 presentation deck. The canonical slides are the
	 * standalone Claude Design export, hosted verbatim as a static file and shown
	 * in a full-viewport iframe (src="/fsp/day1-slides.html"); the deck owns its
	 * own keyboard navigation (arrows / PageUp / PageDown / space), so a
	 * presentation clicker drives it natively. We do NOT reimplement the slides.
	 *
	 * The one wire between the deck and this page: the hosted HTML re-emits the
	 * deck's slide-change broadcast to us as { type:'FSP_SLIDE', slide }. When the
	 * presenter reaches slide 13 ("Live Questions") we overlay the REAL live Q&A
	 * feed (FspLiveFeed, the same component /fsp/live uses) over the deck; leaving
	 * slide 13 removes it.
	 *
	 * Staff only (@boscotech.edu), gated in-page like /fsp/live (this route is not
	 * in authedPrefixes, since the deck itself is otherwise harmless — the real
	 * boundary is that the feed reads fsp_questions under RLS for a signed-in
	 * presenter).
	 */

	const ALLOWED_DOMAIN = '@boscotech.edu';
	const SLIDES_SRC = '/fsp/day1-slides.html';

	let { data } = $props();
	const supabase = $derived(data.supabase as SupabaseClient);
	const claims = $derived(data.claims);

	const email = $derived((claims?.email ?? '').toString());
	const signedIn = $derived(!!claims);
	const domainOk = $derived(email.toLowerCase().endsWith(ALLOWED_DOMAIN));

	let loading = $state(false);
	let authError = $state('');

	let rootEl: HTMLElement;
	let iframeEl: HTMLIFrameElement | undefined = $state();
	let liveActive = $state(false);
	let count = $state(0);

	async function signIn() {
		loading = true;
		authError = '';
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/fsp/day1')}`,
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

	function onMessage(e: MessageEvent) {
		const d = e.data;
		if (!d || d.type !== 'FSP_SLIDE') return;
		liveActive = d.slide === 13;
		// Keep the clicker alive: after any slide-change message, hand keyboard
		// focus back to the deck iframe so arrow / PageUp / PageDown keep working
		// (the overlay is a plain div and never steals focus on its own, but a
		// presenter clicking the feed would — this restores it on the next nav).
		iframeEl?.contentWindow?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		// F toggles the browser's native fullscreen on the whole deck surface.
		if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			toggleFullscreen();
		}
	}

	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			rootEl?.requestFullscreen?.().catch(() => {});
		} else {
			document.exitFullscreen?.().catch(() => {});
		}
	}

	function focusDeck() {
		iframeEl?.contentWindow?.focus();
	}

	onMount(() => {
		window.addEventListener('message', onMessage);
		window.addEventListener('keydown', onKeydown);
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('message', onMessage);
			window.removeEventListener('keydown', onKeydown);
		}
	});
</script>

<svelte:head>
	<title>FSP // Day 1</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="deck-root" bind:this={rootEl}>
	{#if !signedIn}
		<div class="center">
			<div class="card">
				<h1>FSP Day 1</h1>
				<p>Sign in with your Bosco Tech staff account to run the Day 1 deck.</p>
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
					You are signed in as <strong>{email || 'an unknown account'}</strong>. The Day 1 deck is
					for Bosco Tech staff (<strong>@boscotech.edu</strong>).
				</p>
				<button class="primary" onclick={signOut}>Sign out and switch account</button>
			</div>
		</div>
	{:else}
		<!-- The canonical slides. The deck owns its own keyboard nav. -->
		<iframe
			bind:this={iframeEl}
			class="deck"
			src={SLIDES_SRC}
			title="FSP Day 1 presentation"
			allow="fullscreen"
			onload={focusDeck}
		></iframe>

		{#if liveActive}
			<!-- Slide 13: overlay the real live Q&A feed over the deck. -->
			<div class="live-overlay">
				<header class="live-head">
					<h2>Your Questions.</h2>
					<span class="live-badge">
						<span class="dot"></span>
						<span class="lbl">LIVE</span>
						{#if count > 0}<span class="cnt">{count}</span>{/if}
					</span>
				</header>
				<div class="live-body">
					<FspLiveFeed variant="slide" {supabase} bind:count />
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.deck-root {
		position: fixed;
		inset: 0;
		background: #0a0a0a;
		overflow: hidden;
		z-index: 1;
	}
	.deck {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
	}

	/* --- Live Q&A overlay (slide 13) --- */
	.live-overlay {
		position: absolute;
		inset: 0;
		z-index: 2;
		background: #0a0a0a;
		display: flex;
		flex-direction: column;
		padding: 40px 56px 44px;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', system-ui, sans-serif;
	}
	.live-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 22px;
	}
	.live-head h2 {
		margin: 0;
		font-size: clamp(2.4rem, 5vw, 4.4rem);
		font-weight: 700;
		line-height: 1;
		color: var(--green, #00ff41);
		text-shadow: var(--glow-green, 0 0 18px rgba(0, 255, 65, 0.5));
	}
	.live-badge {
		display: inline-flex;
		align-items: center;
		gap: 14px;
		padding: 10px 22px;
		border: 1px solid rgba(255, 51, 85, 0.5);
		border-radius: 2px;
		font-family: 'Share Tech Mono', monospace;
	}
	.live-badge .dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--crimson, #ff3355);
		animation: overlay-pulse 1.6s ease-in-out infinite;
	}
	.live-badge .lbl {
		font-size: clamp(1rem, 1.8vw, 1.6rem);
		letter-spacing: 0.2em;
		color: var(--crimson, #ff3355);
	}
	.live-badge .cnt {
		font-size: clamp(1rem, 1.8vw, 1.6rem);
		letter-spacing: 0.08em;
		color: var(--cyan, #00f0ff);
	}
	.live-body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	@keyframes overlay-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.live-badge .dot {
			animation: none;
		}
	}

	/* --- Auth gate cards (mirrors /fsp/live) --- */
	.center {
		position: absolute;
		inset: 0;
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
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', system-ui, sans-serif;
	}
	.card h1 {
		font-size: 1.7rem;
		font-weight: 700;
		color: var(--green, #00ff41);
		text-shadow: 0 0 14px rgba(0, 255, 65, 0.45);
		margin: 0;
	}
	.card p {
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
</style>
