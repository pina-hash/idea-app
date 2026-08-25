<script lang="ts">
	/**
	 * DEV-ONLY password sign-in against whatever local Supabase project `.env`
	 * points at. See +page.server.ts for why this exists.
	 *
	 * It uses `page.data.supabase` -- the SAME browser client every other page
	 * uses -- so the session it produces and the cookies @supabase/ssr writes
	 * for it are the real ones. Nothing here impersonates: the password is typed
	 * and Supabase auth decides.
	 */
	import { page } from '$app/state';
	import { goto, invalidate } from '$app/navigation';

	let email = $state('tvargas@boscotech.edu');
	let password = $state('local-dev-password');
	let next = $state('/');
	let busy = $state(false);
	let msg = $state<{ ok: boolean; text: string } | null>(null);

	/**
	 * Handed down by the root layout load. Non-null in practice -- the root
	 * layout always creates one -- but the generated page type does not know
	 * that, and this route is dev-only, so a guard on use is cheaper than a
	 * cast that would hide a real absence.
	 */
	const supabase = $derived(page.data.supabase);

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (!supabase) {
			msg = { ok: false, text: 'No Supabase client on page.data -- is the root layout loaded?' };
			return;
		}
		busy = true;
		msg = null;
		try {
			const { data, error } = await supabase.auth.signInWithPassword({ email, password });
			if (error) {
				msg = { ok: false, text: error.message };
				return;
			}
			msg = { ok: true, text: `Signed in as ${data.user?.email ?? email}.` };
			await invalidate('supabase:auth');
			await goto(next, { invalidateAll: true });
		} finally {
			busy = false;
		}
	}

	async function signOut() {
		if (!supabase) return;
		busy = true;
		try {
			await supabase.auth.signOut();
			msg = { ok: true, text: 'Signed out.' };
			await invalidate('supabase:auth');
		} finally {
			busy = false;
		}
	}
</script>

<div class="wrap">
	<h1>Dev sign-in</h1>
	<p class="note">
		Local Supabase only. Production sign-in is Google OAuth and this route 404s there.
	</p>
	<p class="note" data-testid="who">
		Currently: {page.data.claims?.email ?? 'signed out'}
	</p>

	<form onsubmit={signIn}>
		<label>
			<span>Email</span>
			<input type="email" bind:value={email} autocomplete="off" />
		</label>
		<label>
			<span>Password</span>
			<input type="password" bind:value={password} autocomplete="off" />
		</label>
		<label>
			<span>Then go to</span>
			<input type="text" bind:value={next} />
		</label>
		<div class="row">
			<button type="submit" class="tap-44" disabled={busy}>Sign in</button>
			<button type="button" class="tap-44 quiet" disabled={busy} onclick={signOut}>Sign out</button>
		</div>
	</form>

	{#if msg}
		<p class="msg" class:bad={!msg.ok} data-testid="result">{msg.text}</p>
	{/if}
</div>

<style>
	.wrap {
		max-width: 34rem;
		margin: 0 auto;
		padding: var(--space-4, 1rem);
		display: grid;
		gap: var(--space-3, 0.75rem);
	}
	h1 {
		font-family: var(--font-title, var(--font-display));
		margin: 0;
	}
	.note {
		margin: 0;
		color: var(--dim);
		font-size: 0.9rem;
	}
	form {
		display: grid;
		gap: 0.6rem;
	}
	label {
		display: grid;
		gap: 0.2rem;
	}
	label span {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--dim);
	}
	input {
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 6px);
		background: var(--bg2);
		color: var(--white);
		font-family: var(--font-display);
	}
	.row {
		display: flex;
		gap: 0.5rem;
	}
	button {
		padding: 0.45rem 1rem;
		border: 1px solid var(--green);
		border-radius: var(--radius-2, 6px);
		background: transparent;
		color: var(--green);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		cursor: pointer;
	}
	button.quiet {
		border-color: var(--hairline);
		color: var(--dim);
	}
	.msg {
		margin: 0;
		font-size: 0.9rem;
		color: var(--green);
	}
	.msg.bad {
		color: var(--crimson);
	}
</style>
