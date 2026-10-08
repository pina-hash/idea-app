<script lang="ts">
	/**
	 * `/armory/connect` (contract 3b): "Connect <device> to Armory as <email>?"
	 * Confirming is a plain form POST to /api/armory/connect/start, which answers
	 * 303 to the computer's own listener at http://127.0.0.1:<port>/callback.
	 * A native form rather than fetch: the browser has to FOLLOW that redirect
	 * to reach the app, and the form needs no script to do it.
	 *
	 * A LAB COMPUTER'S BROWSER IS OFTEN STILL SIGNED IN AS THE LAST STUDENT
	 * (Armory 0.3.2, request 4), so the question names the person ("Connect
	 * LAB-PC-07 as Alex Kim?") with the address under it, and "Not you? Use
	 * another account" signs this browser out and comes back to this same
	 * address after the next sign-in. The connect protocol is unchanged; an
	 * absent `onSwitch` removes the control.
	 */
	import type { ConnectRequest } from './connect';

	let {
		request,
		problem,
		email,
		name = null,
		action = '/api/armory/connect/start',
		onSwitch = null
	}: {
		request: ConnectRequest | null;
		problem: string | null;
		email: string;
		/** The person's chosen name, else their full name; null shows the address alone. */
		name?: string | null;
		action?: string;
		onSwitch?: (() => Promise<void> | void) | null;
	} = $props();

	const who = $derived(name?.trim() || email);
	let switching = $state(false);
	async function switchAccount() {
		if (!onSwitch || switching) return;
		switching = true;
		try {
			await onSwitch();
		} finally {
			switching = false;
		}
	}
</script>

<div class="ar-connect">
	{#if !request}
		<div class="ar-panel" data-testid="armory-connect-bad">
			<p class="ar-connect-q">This connect link is not valid.</p>
			<p class="ar-lead">
				Go back to the Armory app on your computer and press Connect again. It opens the right link by
				itself.
			</p>
			{#if problem}<p class="ar-hash">{problem}</p>{/if}
		</div>
	{:else}
		<form class="ar-panel" method="POST" {action} data-testid="armory-connect-form">
			<p class="ar-connect-q" data-testid="armory-connect-question">Connect {request.device} as {who}?</p>
			<p class="ar-message" data-testid="armory-connect-account">
				Signed in to ideabosco.com as {who === email ? email : `${who} (${email})`}.
			</p>
			<p class="ar-lead">
				This lets the Armory app on that computer save and fetch your project files as you. It gets its
				own sign-in, so signing out here does not sign it out, and nothing here can be reused by
				anyone else.
			</p>
			<input type="hidden" name="port" value={request.port} />
			<input type="hidden" name="state" value={request.state} />
			<input type="hidden" name="challenge" value={request.challenge} />
			<input type="hidden" name="device" value={request.device} />
			<div class="ar-row-actions">
				<button class="btn ar-btn" type="submit">Connect this computer</button>
				<a class="btn secondary ar-btn" href="/armory">Not now</a>
			</div>
			{#if onSwitch}
				<div class="ar-row-actions">
					<button class="btn secondary ar-btn" type="button" aria-disabled={switching} data-testid="armory-connect-switch" onclick={switchAccount}>
						{switching ? 'Signing out…' : 'Not you? Use another account'}
					</button>
				</div>
			{/if}
			<p class="ar-message">Only press Connect if you just pressed Connect in the Armory app yourself.</p>
		</form>
	{/if}
</div>
