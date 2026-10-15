<script lang="ts">
	/**
	 * A list of short lines (acceptance criteria, self-inspection items,
	 * accepted spellings) edited as one textarea, one item a line. The raw text
	 * is this field's own state so a blank line being typed is not filtered
	 * away under the cursor; the parent receives the parsed list on every
	 * input through `onchange` and only ever reads that.
	 */
	import { linesToList, listToLines } from './desk';

	let {
		label,
		value,
		onchange,
		rows = 4,
		help = null,
		name = null
	}: {
		label: string;
		value: readonly string[];
		onchange: (lines: string[]) => void;
		rows?: number;
		help?: string | null;
		name?: string | null;
	} = $props();

	// svelte-ignore state_referenced_locally
	let text = $state(listToLines(value));
</script>

<label class="cert-field">
	<span>{label}</span>
	<textarea {name} {rows} bind:value={text} oninput={() => onchange(linesToList(text))}></textarea>
	{#if help}<span class="cert-help dk-help">{help}</span>{/if}
</label>

<style>
	.dk-help {
		text-transform: none;
		letter-spacing: 0;
		font-family: var(--font-display);
	}
</style>
