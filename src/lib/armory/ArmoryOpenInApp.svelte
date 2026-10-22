<script lang="ts">
	/**
	 * Open in SolidWorks, on a file's page (ledger 0430, website feedback
	 * ba81c57d). The key is a plain link to the IDEA Armory app on this
	 * computer (`$lib/armory/open-link.ts`): the app opens the file under the
	 * same check-out rules as its own Open. When the page is still in front a
	 * moment after the click, nothing answered it, and the page says so with the
	 * download. Nothing is fetched and nothing on the site changes.
	 */
	import { onDestroy } from 'svelte';
	import { armoryAnswered, armoryOpenHref, OPEN_FALLBACK_MS } from './open-link';
	import { ARMORY_DOWNLOAD_HREF } from './team';

	let { fileId, name, missingAtStart = false }: { fileId: string; name: string; missingAtStart?: boolean } = $props();

	const href = $derived(armoryOpenHref(fileId));
	// The dev harness draws the "nothing answered" state without a click.
	let missing = $state(false);
	$effect.pre(() => {
		if (missingAtStart) missing = true;
	});
	let stop: (() => void) | null = null;

	function opened() {
		stop?.();
		missing = false;
		const seen = { blurred: false, hidden: false };
		const blur = () => (seen.blurred = true);
		const visibility = () => {
			if (document.visibilityState === 'hidden') seen.hidden = true;
		};
		window.addEventListener('blur', blur);
		document.addEventListener('visibilitychange', visibility);
		const timer = window.setTimeout(() => {
			stop?.();
			if (!armoryAnswered(seen) && document.hasFocus()) missing = true;
		}, OPEN_FALLBACK_MS);
		stop = () => {
			window.clearTimeout(timer);
			window.removeEventListener('blur', blur);
			document.removeEventListener('visibilitychange', visibility);
			stop = null;
		};
	}

	onDestroy(() => stop?.());
</script>

{#if href}
	<div class="ar-open" data-testid="armory-open">
		<a class="btn ar-btn ar-open-key" {href} onclick={opened} data-testid="armory-open-app">
			<svg class="ar-open-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
				<path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10M9 2h5v5M14 2 7.5 8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			Open in SolidWorks<span class="ar-visually-hidden">: {name}</span>
		</a>
		<p class="ar-open-help">
			Opens through IDEA Armory on this computer. It opens read-only unless you have it checked out; check it out in Armory to change it.
		</p>
		{#if missing}
			<p class="ar-message bad ar-open-missing" role="status" data-testid="armory-open-missing">
				Nothing opened? This computer needs IDEA Armory, signed in as you.
				<a href={ARMORY_DOWNLOAD_HREF}>Get IDEA Armory</a>, then click Open in SolidWorks again.
			</p>
		{/if}
	</div>
{/if}
