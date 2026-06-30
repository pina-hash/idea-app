<script lang="ts">
	/**
	 * Renders a challenge asset that is either an inline SVG (seed/pasted, starts
	 * with `<`) or an uploaded image URL (authored, stored in the `gauntlet`
	 * bucket). Inline markup is teacher/seed authored (trusted), so {@html} is
	 * intentional. Parents guard the empty case and provide their own fallback.
	 */
	let { value, alt = 'Challenge drawing' }: { value: string; alt?: string } = $props();

	const isMarkup = $derived(value.trimStart().startsWith('<'));
</script>

{#if isMarkup}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html value}
{:else}
	<img src={value.trim()} {alt} />
{/if}
