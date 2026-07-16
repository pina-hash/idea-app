<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import FspStudentPreview from '$lib/fsp/FspStudentPreview.svelte';

	/**
	 * FspDayArchive — shared host for an FSP day's archive deck. Factored out of
	 * /fsp/day1 (see its git history) so /fsp/day2, /fsp/day3, etc. don't
	 * duplicate the auth gate + iframe + presenter toolbar a third time.
	 *
	 * Presentations run live from Claude Design (external tool) with /fsp/live
	 * opened separately for Q&A; this just hosts the canonical exported slides
	 * for later review, in a full-viewport iframe. We do NOT reimplement the
	 * slides, and the deck owns its own keyboard navigation (arrows / PageUp /
	 * PageDown / space).
	 *
	 * Open to any authenticated Bosco Tech user (@boscotech.net students or
	 * @boscotech.edu staff), not staff-only: students should be able to review
	 * the archive. The host route is not in authedPrefixes (hooks.server.ts),
	 * so the gate is in-page like the rest of the /fsp/* live-session routes.
	 */

	const ALLOWED_DOMAINS = ['@boscotech.net', '@boscotech.edu'];

	let {
		day,
		slidesSrc,
		data
	}: {
		day: number;
		slidesSrc: string;
		data: { supabase: SupabaseClient; claims: Record<string, unknown> | null };
	} = $props();

	const supabase = $derived(data.supabase);
	const claims = $derived(data.claims);

	const email = $derived((claims?.email ?? '').toString());
	const signedIn = $derived(!!claims);
	const domainOk = $derived(ALLOWED_DOMAINS.some((d) => email.toLowerCase().endsWith(d)));

	let loading = $state(false);
	let authError = $state('');

	let rootEl: HTMLElement;
	let iframeEl: HTMLIFrameElement | undefined = $state();
	let studentOpen = $state(false);
	let isFullscreen = $state(false);

	async function signIn() {
		loading = true;
		authError = '';
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/fsp/day${day}`)}`,
				queryParams: { prompt: 'select_account' }
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

	function onKeydown(e: KeyboardEvent) {
		// F toggles the browser's native fullscreen on the whole deck surface.
		if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			toggleFullscreen();
		}
	}

	/**
	 * The deck is an editor: its default layout shows a thumbnail RAIL of every
	 * slide on the left beside the current slide. The deck exposes a `no-rail`
	 * observed attribute on its <deck-stage> element that hides the rail and
	 * refits the current slide to fill the whole frame — this is its intended
	 * "present" layout. Toggle it (same-origin, so the iframe document is
	 * reachable) so presentation mode shows ONLY the current slide. Guarded: a
	 * not-yet-loaded or unexpected deck can never throw.
	 */
	function setDeckRailHidden(hidden: boolean) {
		try {
			const stage = iframeEl?.contentDocument?.querySelector('deck-stage');
			if (!stage) return;
			if (hidden) stage.setAttribute('no-rail', '');
			else stage.removeAttribute('no-rail');
		} catch {
			// cross-origin or not ready — ignore, presentation still fullscreens.
		}
	}

	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			setDeckRailHidden(true);
			rootEl?.requestFullscreen?.().catch(() => {});
		} else {
			document.exitFullscreen?.().catch(() => {});
		}
	}

	/**
	 * Present: hide the deck's thumbnail rail, then fullscreen the deck iframe
	 * DIRECTLY (not the page root), so all page chrome — the toolbar included —
	 * falls away and only the current slide fills the screen. Escape exits
	 * fullscreen natively; the rail and toolbar return on fullscreenchange.
	 */
	function presentDeck() {
		setDeckRailHidden(true);
		iframeEl?.requestFullscreen?.().catch(() => {});
	}

	function onFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
		// Rail hidden only while presenting (fullscreen); restored on exit so the
		// embedded /fsp/day<n> view keeps the deck's normal navigable thumbnails.
		setDeckRailHidden(isFullscreen);
	}

	function focusDeck() {
		iframeEl?.contentWindow?.focus();
	}

	onMount(() => {
		window.addEventListener('keydown', onKeydown);
		document.addEventListener('fullscreenchange', onFullscreenChange);
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', onKeydown);
		}
		if (typeof document !== 'undefined') {
			document.removeEventListener('fullscreenchange', onFullscreenChange);
		}
	});
</script>

<svelte:head>
	<title>FSP // Day {day}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="deck-root" bind:this={rootEl}>
	{#if !signedIn}
		<div class="center">
			<div class="card">
				<h1>FSP Day {day}</h1>
				<p>Sign in with your Bosco Tech account to view the Day {day} deck archive.</p>
				<button class="primary" onclick={signIn} disabled={loading}>
					{loading ? 'Redirecting…' : 'Sign in with Google'}
				</button>
				{#if authError}<p class="err">{authError}</p>{/if}
				<p class="fine">Use your <strong>@boscotech.net</strong> or <strong>@boscotech.edu</strong> account.</p>
			</div>
		</div>
	{:else if !domainOk}
		<div class="center">
			<div class="card">
				<h1>Wrong account</h1>
				<p>
					You are signed in as <strong>{email || 'an unknown account'}</strong>. This deck is for
					Bosco Tech accounts (<strong>@boscotech.net</strong> or <strong>@boscotech.edu</strong>).
				</p>
				<button class="primary" onclick={signOut}>Sign out and switch account</button>
			</div>
		</div>
	{:else}
		<!-- The canonical slides. The deck owns its own keyboard nav. -->
		<iframe
			bind:this={iframeEl}
			class="deck"
			src={slidesSrc}
			title="FSP Day {day} presentation"
			allow="fullscreen"
			onload={focusDeck}
		></iframe>

		<!-- Presenter toolbar: floats bottom-center, hidden once fullscreen. -->
		{#if !isFullscreen}
			<div class="toolbar">
				<button class="tb" onclick={presentDeck} title="Fullscreen the deck">
					<span class="ico" aria-hidden="true">⛶</span> Present
				</button>
				<button class="tb" onclick={() => (studentOpen = true)} title="Preview the student phone view">
					<span class="ico" aria-hidden="true">▢</span> Student View
				</button>
			</div>
		{/if}

		<FspStudentPreview bind:open={studentOpen} />
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

	/* --- Presenter toolbar (bottom center, minimal & dark) --- */
	.toolbar {
		position: fixed;
		left: 50%;
		bottom: 20px;
		transform: translateX(-50%);
		z-index: 20;
		display: flex;
		gap: 0.4rem;
		padding: 0.4rem;
		border-radius: 12px;
		background: rgba(10, 12, 10, 0.82);
		border: 1px solid rgba(0, 255, 65, 0.28);
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(6px);
	}
	.toolbar .tb {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.85rem;
		border-radius: 8px;
		border: 1px solid transparent;
		background: transparent;
		color: #b7d4bb;
		cursor: pointer;
	}
	.toolbar .tb:hover {
		background: rgba(0, 255, 65, 0.12);
		border-color: rgba(0, 255, 65, 0.3);
		color: var(--green, #00ff41);
	}
	.toolbar .ico {
		font-size: 0.9rem;
		line-height: 1;
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
