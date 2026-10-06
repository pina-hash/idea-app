<script lang="ts">
	/** A state the page cannot fix by itself, said in words. Never colour alone. */
	import type { Snippet } from 'svelte';
	let { title, testid, children }: { title: string; testid?: string; children?: Snippet } = $props();
</script>

<div class="ar-notice" role="status" data-testid={testid}>
	<span class="ar-notice-glyph" aria-hidden="true">!</span>
	<div>
		<strong>{title}</strong>
		{#if children}{@render children()}{/if}
	</div>
</div>
