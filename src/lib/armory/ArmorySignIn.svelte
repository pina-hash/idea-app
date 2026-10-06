<script lang="ts">
	/**
	 * Armory is for signed-in students. The pages are not behind the site's
	 * prefix guard (that would bounce a connect link to the home page and lose
	 * the computer's one-time details), so each one renders this instead, and
	 * signing in comes back to the same address.
	 */
	let { onSignIn, reason }: { onSignIn: (() => void) | null; reason: string } = $props();
</script>

<div class="ar-panel" data-testid="armory-signin">
	<p class="ar-lead">{reason}</p>
	{#if onSignIn}
		<button class="ar-btn" type="button" onclick={() => onSignIn?.()}>Sign in with your school Google account</button>
	{/if}
</div>
