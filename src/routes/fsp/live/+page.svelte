<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

	/**
	 * /fsp/live — Mr. Pina's live presenter console for FSP Q&A. Staff only
	 * (@boscotech.edu). Subscribes to fsp_questions over Realtime, filtered by the
	 * current active session, and renders the unanswered questions as cards
	 * (newest on top, animate in). Staff controls sit at the top: set the active
	 * session (writes fsp_config, RLS-gated to staff) and Clear Session (soft
	 * clear via the clear_fsp_session RPC — sets answered = true, never deletes).
	 * A full-screen toggle makes it presentation-ready.
	 *
	 * This is Phase 1: the live feed only. Phase 2 embeds it in a slide route.
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

	interface QRow {
		id: string;
		question: string;
		session_id: string;
		created_at: string;
		answered: boolean;
	}

	let activeSession = $state('');
	let sessionInput = $state('');
	let questions = $state<QRow[]>([]);
	let ready = $state(false);
	let feedError = $state('');
	let busy = $state(''); // 'set' | 'clear' | ''

	let channel: RealtimeChannel | null = null;
	let now = $state(Date.now());
	let clockTimer: ReturnType<typeof setInterval> | null = null;
	let reduced = false;

	let rootEl: HTMLElement;
	let isFullscreen = $state(false);

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

	/** Load the unanswered questions for a session, newest first. */
	async function loadFeed(session: string) {
		const { data: rows, error } = await supabase
			.from('fsp_questions')
			.select('id, question, session_id, created_at, answered')
			.eq('session_id', session)
			.eq('answered', false)
			.order('created_at', { ascending: false });
		if (error) {
			feedError = error.message;
			questions = [];
			return;
		}
		feedError = '';
		questions = (rows ?? []) as QRow[];
	}

	/** (Re)subscribe to Realtime for the active session. */
	function subscribe(session: string) {
		if (channel) {
			supabase.removeChannel(channel);
			channel = null;
		}
		channel = supabase
			.channel(`fsp-live-${session}`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'fsp_questions',
					filter: `session_id=eq.${session}`
				},
				(payload) => {
					const row = payload.new as QRow;
					if (row.answered) return;
					if (questions.some((q) => q.id === row.id)) return;
					questions = [row, ...questions];
				}
			)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'fsp_questions',
					filter: `session_id=eq.${session}`
				},
				(payload) => {
					const row = payload.new as QRow;
					// A soft clear (answered = true) removes the card from the feed.
					if (row.answered) {
						questions = questions.filter((q) => q.id !== row.id);
					}
				}
			)
			.subscribe();
	}

	async function switchTo(session: string) {
		const s = session.trim();
		if (!s) return;
		activeSession = s;
		sessionInput = s;
		await loadFeed(s);
		subscribe(s);
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
			await switchTo(s);
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
			// Soft clear: the feed empties now; new questions repopulate it.
			questions = [];
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

	function relTime(iso: string): string {
		const secs = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
		if (secs < 5) return 'just now';
		if (secs < 60) return `${secs}s ago`;
		const mins = Math.floor(secs / 60);
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		return `${hrs}h ago`;
	}

	onMount(async () => {
		reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		document.addEventListener('fullscreenchange', onFullscreenChange);
		clockTimer = setInterval(() => (now = Date.now()), 1000);

		if (signedIn && domainOk) {
			const { data: cfg } = await supabase
				.from('fsp_config')
				.select('value')
				.eq('key', 'active_session')
				.maybeSingle();
			const session = cfg?.value ?? 'Day1-A';
			await switchTo(session);
		}
		ready = true;
	});

	onDestroy(() => {
		if (channel) supabase.removeChannel(channel);
		if (clockTimer) clearInterval(clockTimer);
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
				<span class="dot" class:live={questions.length > 0}></span>
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
				<button class="ghost fs" onclick={toggleFullscreen} title="Toggle full screen">
					{isFullscreen ? 'Exit full screen' : 'Full screen'}
				</button>
			</div>
		</header>

		<div class="meta">
			<span>Active session: <strong>{activeSession || '—'}</strong></span>
			<span class="count">{questions.length} question{questions.length === 1 ? '' : 's'}</span>
		</div>

		{#if feedError}<p class="err bannErr">{feedError}</p>{/if}

		<main class="feed">
			{#if !ready}
				<p class="empty">Loading…</p>
			{:else if questions.length === 0}
				<p class="empty">No questions yet. They appear here live as they come in.</p>
			{:else}
				{#each questions as q (q.id)}
					<article class="qcard" in:fly={{ y: reduced ? 0 : -14, duration: reduced ? 0 : 260 }}>
						<p class="qtext">{q.question}</p>
						<span class="qtime">{relTime(q.created_at)}</span>
					</article>
				{/each}
			{/if}
		</main>
	{/if}
</div>

<style>
	.live-root {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		min-height: 100dvh;
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
		max-width: 900px;
		margin: 0 auto;
		padding: 1rem 1.2rem 4rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.empty {
		color: #4a7a52;
		text-align: center;
		padding: 3rem 1rem;
		font-size: 1.1rem;
	}
	.qcard {
		background: #101610;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-left: 3px solid var(--green, #00ff41);
		border-radius: 12px;
		padding: 1rem 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.qtext {
		font-size: 1.4rem;
		line-height: 1.35;
		color: var(--white, #e8ffe8);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.qtime {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		color: var(--cyan, #00f0ff);
		align-self: flex-end;
	}
	@media (max-width: 560px) {
		.qtext {
			font-size: 1.2rem;
		}
	}
</style>
