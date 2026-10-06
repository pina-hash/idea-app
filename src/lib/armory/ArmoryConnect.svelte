<script lang="ts">
	/**
	 * `/armory/connect` (contract 3b): "Connect <device> to Armory as <email>?"
	 * Confirming is a plain form POST to /api/armory/connect/start, which answers
	 * 303 to the computer's own listener at http://127.0.0.1:<port>/callback.
	 * A native form rather than fetch: the browser has to FOLLOW that redirect
	 * to reach the app, and the form needs no script to do it.
	 */
	import type { ConnectRequest } from './connect';

	let {
		request,
		problem,
		email,
		action = '/api/armory/connect/start'
	}: { request: ConnectRequest | null; problem: string | null; email: string; action?: string } = $props();
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
			<p class="ar-connect-q">Connect {request.device} to Armory as {email}?</p>
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
			<p class="ar-message">Only press Connect if you just pressed Connect in the Armory app yourself.</p>
		</form>
	{/if}
</div>
