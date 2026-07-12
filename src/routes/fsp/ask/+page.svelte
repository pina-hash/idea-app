<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';

	/**
	 * /fsp/ask — the audience-facing question box for FSP live sessions. Reached
	 * from a QR code, so it gates its own sign-in in-page (no hooks redirect) the
	 * way /fsp-tech-selection does. Google OAuth, restricted to @boscotech.net
	 * students. Mobile-first, IDEA green on near-black.
	 *
	 * Submit calls the submit_fsp_question RPC (the only write path) with the
	 * CURRENT active session id, read fresh from fsp_config at submit time so a
	 * mid-session switch by staff on /fsp/live lands in the right feed. On success
	 * the form is replaced by a confirmation (no reload); "Ask another question"
	 * brings the form back for a second question.
	 *
	 * Anonymous submission: a lightweight toggle below the textarea, default
	 * unchecked. Unchecked shows the student's own name (read-only, from the
	 * auth session: user_metadata.full_name, falling back to email) and passes it
	 * as p_submitter_name. Checked hides the name line and passes
	 * p_is_anonymous = true (the RPC forces submitter_name to null server-side
	 * regardless of what's passed, so there's nothing to strip client-side).
	 */

	const ALLOWED_DOMAIN = '@boscotech.net';

	let { data } = $props();
	const supabase = $derived(data.supabase as SupabaseClient);
	const claims = $derived(data.claims);

	const email = $derived((claims?.email ?? '').toString());
	const signedIn = $derived(!!claims);
	const domainOk = $derived(email.toLowerCase().endsWith(ALLOWED_DOMAIN));
	const displayName = $derived(
		((claims?.user_metadata as { full_name?: string } | undefined)?.full_name || email) as string
	);

	let loading = $state(false);
	let authError = $state('');

	let question = $state('');
	let anonymous = $state(false);
	let submitting = $state(false);
	let submitted = $state(false);
	let submitError = $state('');

	async function signIn() {
		loading = true;
		authError = '';
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/fsp/ask')}`,
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

	/** Read the active session id fresh (authenticated read allowed by RLS). */
	async function activeSessionId(): Promise<string | null> {
		const { data: row, error } = await supabase
			.from('fsp_config')
			.select('value')
			.eq('key', 'active_session')
			.maybeSingle();
		if (error) return null;
		return row?.value ?? null;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const text = question.trim();
		if (!text || submitting) return;
		submitting = true;
		submitError = '';
		try {
			const session = await activeSessionId();
			if (!session) {
				submitError = 'No active session is set right now. Please try again in a moment.';
				return;
			}
			const { error } = await supabase.rpc('submit_fsp_question', {
				p_question: text,
				p_session_id: session,
				p_is_anonymous: anonymous,
				p_submitter_name: anonymous ? null : displayName
			});
			if (error) throw error;
			submitted = true;
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}

	function askAnother() {
		question = '';
		submitted = false;
		submitError = '';
	}
</script>

<svelte:head>
	<title>FSP — Ask a Question</title>
	<meta name="robots" content="noindex" />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="ask-root">
	{#if !signedIn}
		<div class="center">
			<div class="card">
				<h1>Ask a Question</h1>
				<p>Sign in with your Bosco Tech student account to send a question to the session.</p>
				<button class="primary" onclick={signIn} disabled={loading}>
					{loading ? 'Redirecting…' : 'Sign in with Google'}
				</button>
				{#if authError}<p class="err">{authError}</p>{/if}
				<p class="fine">Use your <strong>@boscotech.net</strong> account.</p>
			</div>
		</div>
	{:else if !domainOk}
		<div class="center">
			<div class="card">
				<h1>Wrong account</h1>
				<p>
					You are signed in as <strong>{email || 'an unknown account'}</strong>. This is for Bosco
					Tech students. Please sign in with your <strong>@boscotech.net</strong> account.
				</p>
				<button class="primary" onclick={signOut}>Sign out and switch account</button>
			</div>
		</div>
	{:else if submitted}
		<div class="center">
			<div class="card confirm">
				<div class="check" aria-hidden="true">✓</div>
				<h1>Question submitted</h1>
				<p class="coin">You earned <strong>1 IDEA Coin</strong>.</p>
				<button class="primary" onclick={askAnother}>Ask another question</button>
			</div>
		</div>
	{:else}
		<div class="center">
			<form class="card" onsubmit={submit}>
				<h1>Ask a Question</h1>
				<p class="sub">Type your question for the session. Keep it short and clear.</p>
				<textarea
					bind:value={question}
					placeholder="What would you like to ask?"
					rows="5"
					maxlength="600"
					autocomplete="off"
					disabled={submitting}
				></textarea>

				<label class="anon-toggle">
					<input type="checkbox" bind:checked={anonymous} disabled={submitting} />
					<span>Submit anonymously</span>
				</label>
				{#if !anonymous}
					<p class="who">Asking as {displayName}</p>
				{/if}

				<button class="primary" type="submit" disabled={submitting || !question.trim()}>
					{submitting ? 'Sending…' : 'Submit question'}
				</button>
				{#if submitError}<p class="err">{submitError}</p>{/if}
			</form>
		</div>
	{/if}
</div>

<style>
	.ask-root {
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
		padding: max(1.25rem, env(safe-area-inset-top)) 1.25rem max(1.25rem, env(safe-area-inset-bottom));
	}
	.card {
		width: 100%;
		max-width: 460px;
		background: #101410;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 16px;
		padding: 1.6rem 1.4rem;
		box-shadow: 0 0 40px rgba(0, 255, 65, 0.08);
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
		letter-spacing: 0.02em;
	}
	.sub,
	p {
		margin: 0;
		color: var(--white, #e8ffe8);
		line-height: 1.5;
	}
	.sub {
		color: #a9c9ad;
		font-size: 0.98rem;
	}
	textarea {
		width: 100%;
		font: inherit;
		font-size: 1.1rem;
		color: var(--white, #e8ffe8);
		background: #0a0f0a;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 10px;
		padding: 0.85rem 0.9rem;
		resize: vertical;
		min-height: 6.5rem;
	}
	textarea::placeholder {
		color: #4a7a52;
	}
	textarea:focus {
		outline: none;
		border-color: var(--green, #00ff41);
		box-shadow: 0 0 0 2px rgba(0, 255, 65, 0.2);
	}
	.primary {
		font: inherit;
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.05rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 0.9rem 1.1rem;
		border-radius: 10px;
		border: 1px solid var(--green, #00ff41);
		background: rgba(0, 255, 65, 0.12);
		color: var(--green, #00ff41);
		cursor: pointer;
		min-height: 48px;
	}
	.primary:hover:not(:disabled) {
		background: rgba(0, 255, 65, 0.22);
		box-shadow: 0 0 18px rgba(0, 255, 65, 0.35);
	}
	.anon-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		color: #a9c9ad;
		cursor: pointer;
		user-select: none;
	}
	.anon-toggle input {
		accent-color: var(--green, #00ff41);
		width: 16px;
		height: 16px;
		cursor: pointer;
	}
	.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.err {
		color: #ff6b6b;
		font-size: 0.9rem;
	}
	.fine,
	.who {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		color: #4a7a52;
	}
	.confirm {
		text-align: center;
		align-items: center;
	}
	.check {
		width: 64px;
		height: 64px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		font-size: 2rem;
		color: #0a0a0a;
		background: var(--green, #00ff41);
		box-shadow: 0 0 26px rgba(0, 255, 65, 0.6);
	}
	.coin {
		color: var(--gold, #c8ff00);
		font-size: 1.15rem;
	}
	.coin strong {
		color: var(--gold, #c8ff00);
	}
</style>
