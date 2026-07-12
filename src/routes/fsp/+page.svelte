<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';

	/**
	 * /fsp — the FSP navigation hub. Auth required (Google OAuth), gated in-page
	 * like /fsp/day1, /fsp/live, and /fsp/ask (this route is NOT in
	 * authedPrefixes, so a cold/QR visitor sees a friendly sign-in rather than a
	 * bounce to /). Routes by account domain:
	 *
	 *   @boscotech.edu (staff) — two cards (Day 1 Presentation -> /fsp/day1,
	 *     Live Q&A Feed -> /fsp/live) plus an inline active-session shortcut
	 *     (shows the current fsp_config.active_session and a Set Session input,
	 *     so Mr. Pina can set the session without opening /fsp/live first).
	 *   @boscotech.net (student) — one card (Submit a Question -> /fsp/ask) plus
	 *     a note that questions appear live during the presentation.
	 *
	 * The former /fsp class-materials page (pawn add-in + project days + pulse
	 * check) moved to /fsp/class and is linked from here as "Class materials".
	 */

	const STAFF_DOMAIN = '@boscotech.edu';
	const STUDENT_DOMAIN = '@boscotech.net';

	let { data } = $props();
	const supabase = $derived(data.supabase as SupabaseClient);
	const claims = $derived(data.claims);

	const email = $derived((claims?.email ?? '').toString());
	const signedIn = $derived(!!claims);
	const isStaff = $derived(email.toLowerCase().endsWith(STAFF_DOMAIN));
	const isStudent = $derived(email.toLowerCase().endsWith(STUDENT_DOMAIN));

	let loading = $state(false);
	let authError = $state('');

	// Staff-only inline session shortcut (mirrors /fsp/live's Set Session).
	let activeSession = $state('');
	let sessionInput = $state('');
	let sessionBusy = $state(false);
	let sessionMsg = $state('');
	let sessionErr = $state('');

	async function signIn() {
		loading = true;
		authError = '';
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/fsp')}`,
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

	async function setSession() {
		const s = sessionInput.trim();
		if (!s || sessionBusy) return;
		sessionBusy = true;
		sessionMsg = '';
		sessionErr = '';
		try {
			const { error } = await supabase
				.from('fsp_config')
				.update({ value: s })
				.eq('key', 'active_session');
			if (error) throw error;
			activeSession = s;
			sessionInput = s;
			sessionMsg = `Active session set to "${s}".`;
		} catch (err) {
			sessionErr = err instanceof Error ? err.message : 'Could not set the session.';
		} finally {
			sessionBusy = false;
		}
	}

	onMount(async () => {
		if (signedIn && isStaff) {
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
</script>

<svelte:head>
	<title>FSP // Hub</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="hub-root">
	<div class="center">
		{#if !signedIn}
			<div class="card gate">
				<h1>Freshman Summer Program</h1>
				<p>Sign in with your Bosco Tech account to reach the FSP tools.</p>
				<button class="primary" onclick={signIn} disabled={loading}>
					{loading ? 'Redirecting…' : 'Sign in with Google'}
				</button>
				{#if authError}<p class="err">{authError}</p>{/if}
				<p class="fine">
					Staff (<strong>@boscotech.edu</strong>) and students (<strong>@boscotech.net</strong>).
				</p>
			</div>
		{:else}
			<div class="hub">
				<header class="head">
					<div class="eyebrow">Freshman Summer Program</div>
					<h1>FSP <span class="accent">Hub</span></h1>
					<p class="who">
						Signed in as {email}
						<button class="linkbtn" onclick={signOut}>Sign out</button>
					</p>
				</header>

				{#if isStaff}
					<div class="grid">
						<a class="card link" href="/fsp/day1">
							<div class="card-kicker">Present</div>
							<h2>Day 1 Presentation</h2>
							<p>Run the Day 1 deck full-screen. Slide 13 overlays the live question feed.</p>
							<span class="go">Open deck &rarr;</span>
						</a>
						<a class="card link" href="/fsp/live">
							<div class="card-kicker">Console</div>
							<h2>Live Q&amp;A Feed</h2>
							<p>The presenter console: watch questions arrive live and manage the session.</p>
							<span class="go">Open feed &rarr;</span>
						</a>
					</div>

					<div class="card session">
						<div class="session-head">
							<h2>Active session</h2>
							<span class="cur">{activeSession || '—'}</span>
						</div>
						<p class="session-sub">
							Students on <strong>/fsp/ask</strong> submit to this session; the live feed shows it.
						</p>
						<div class="session-row">
							<input
								class="sess"
								type="text"
								bind:value={sessionInput}
								placeholder="Day1-A"
								onkeydown={(e) => e.key === 'Enter' && setSession()}
							/>
							<button class="ghost" onclick={setSession} disabled={sessionBusy || !sessionInput.trim()}>
								{sessionBusy ? 'Setting…' : 'Set Session'}
							</button>
						</div>
						{#if sessionMsg}<p class="ok">{sessionMsg}</p>{/if}
						{#if sessionErr}<p class="err">{sessionErr}</p>{/if}
					</div>
				{:else if isStudent}
					<div class="grid one">
						<a class="card link" href="/fsp/ask">
							<div class="card-kicker">Live session</div>
							<h2>Submit a Question</h2>
							<p>Send a question to the current session from your phone.</p>
							<span class="go">Ask &rarr;</span>
						</a>
					</div>
					<p class="student-note">Questions appear live during the presentation.</p>
				{:else}
					<div class="card gate">
						<h2>Bosco Tech account required</h2>
						<p>
							You are signed in as <strong>{email || 'an unknown account'}</strong>. The FSP hub is
							for Bosco Tech staff (<strong>@boscotech.edu</strong>) and students
							(<strong>@boscotech.net</strong>).
						</p>
						<button class="primary" onclick={signOut}>Sign out and switch account</button>
					</div>
				{/if}

				<a class="materials" href="/fsp/class">Class materials &amp; SolidWorks add-in &rarr;</a>
			</div>
		{/if}
	</div>
</div>

<style>
	.hub-root {
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
		padding: 2rem 1.25rem;
	}
	.hub {
		width: 100%;
		max-width: 780px;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.head {
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.eyebrow {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #6fae77;
	}
	.head h1 {
		margin: 0;
		font-size: clamp(2rem, 6vw, 3rem);
		font-weight: 700;
		color: var(--green, #00ff41);
		text-shadow: 0 0 18px rgba(0, 255, 65, 0.45);
	}
	.accent {
		color: var(--white, #e8ffe8);
		text-shadow: none;
	}
	.who {
		margin: 0.2rem 0 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		color: #4a7a52;
		display: flex;
		gap: 0.6rem;
		justify-content: center;
		align-items: center;
	}
	.linkbtn {
		font: inherit;
		background: none;
		border: 0;
		padding: 0;
		color: var(--cyan, #00f0ff);
		cursor: pointer;
		text-decoration: underline;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	.grid.one {
		grid-template-columns: 1fr;
		max-width: 420px;
		margin: 0 auto;
		width: 100%;
	}
	@media (max-width: 620px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
	.card {
		background: #101410;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 16px;
		padding: 1.4rem 1.3rem;
	}
	.card.gate {
		width: 100%;
		max-width: 460px;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		text-align: left;
	}
	.card.link {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		text-decoration: none;
		color: inherit;
		transition:
			border-color 0.18s,
			box-shadow 0.18s,
			transform 0.18s;
	}
	.card.link:hover {
		border-color: var(--green, #00ff41);
		box-shadow: 0 0 0 1px rgba(0, 255, 65, 0.2), 0 0 30px rgba(0, 255, 65, 0.12);
		transform: translateY(-2px);
	}
	.card-kicker {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #6fae77;
	}
	.card h1,
	.card h2 {
		margin: 0;
	}
	.card h2 {
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--green, #00ff41);
	}
	.card.link p,
	.card.session .session-sub {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.5;
		color: #b7d4bb;
	}
	.go {
		margin-top: 0.3rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		letter-spacing: 0.04em;
		color: var(--cyan, #00f0ff);
	}
	.card.gate h1 {
		font-size: 1.7rem;
		font-weight: 700;
		color: var(--green, #00ff41);
		text-shadow: 0 0 14px rgba(0, 255, 65, 0.45);
	}
	.card.gate p {
		margin: 0;
		line-height: 1.5;
	}

	/* ---- session shortcut ---- */
	.card.session {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.session-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}
	.session-head .cur {
		font-family: 'Share Tech Mono', monospace;
		font-size: 1rem;
		color: var(--cyan, #00f0ff);
	}
	.session-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.sess {
		flex: 1;
		min-width: 8rem;
		font: inherit;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.95rem;
		color: var(--white, #e8ffe8);
		background: #0a0f0a;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 8px;
		padding: 0.55rem 0.7rem;
	}
	.sess:focus {
		outline: none;
		border-color: var(--green, #00ff41);
	}
	.ghost {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.55rem 0.9rem;
		border-radius: 8px;
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
	.student-note {
		margin: 0;
		text-align: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		color: #7fae86;
	}
	.materials {
		margin-top: 0.4rem;
		text-align: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		letter-spacing: 0.03em;
		color: #6fae77;
		text-decoration: none;
	}
	.materials:hover {
		color: var(--green, #00ff41);
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
	.ok {
		margin: 0;
		color: var(--green, #00ff41);
		font-size: 0.85rem;
	}
	.err {
		margin: 0;
		color: #ff6b6b;
		font-size: 0.9rem;
	}
</style>
