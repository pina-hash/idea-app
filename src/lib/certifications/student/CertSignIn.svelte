<script lang="ts">
	/**
	 * The signed-out visitor's panel (ledger 0391, DECISIONS D13), the Armory
	 * sign-in's shape: `/certifications` is not behind the site's prefix guard,
	 * because `/certifications/verify` is public under the same prefix, so the
	 * layout renders this in place of every other page and signing in comes
	 * back to the same address. `onSignIn` absent removes the key (a harness
	 * with no client).
	 */
	let {
		onSignIn,
		reason = 'Sign in with your school Google account to explore and earn IDEA certifications.'
	}: { onSignIn: (() => void) | null; reason?: string } = $props();
</script>

<div class="cert-panel cert-signin" data-testid="cert-signin">
	<p class="cert-lead cert-signin-lead">{reason}</p>
	{#if onSignIn}
		<button class="btn cert-btn" type="button" onclick={() => onSignIn?.()} data-testid="cert-signin-key">Sign in with your school Google account</button>
	{/if}
</div>

<style>
	.cert-signin-lead {
		margin-inline: auto;
	}
</style>
