<script lang="ts">
	/**
	 * The portal's one notice: a stripe, a glyph and words, in the tones
	 * `cert.css` paints (`.cert-notice-ok/-bad/-quiet`, amber by default).
	 * Never colour alone: the glyph and the words say what the stripe means.
	 * The body is plain text or the caller's own markup; nothing here is
	 * `{@html}`.
	 */
	import type { Snippet } from 'svelte';

	let {
		tone = 'warn',
		title = null,
		testId = null,
		children
	}: {
		tone?: 'warn' | 'ok' | 'bad' | 'quiet';
		title?: string | null;
		testId?: string | null;
		children?: Snippet;
	} = $props();

	const GLYPH: Record<typeof tone, string> = { warn: '!', ok: '✓', bad: '✕', quiet: '·' };
	const WORD: Record<typeof tone, string> = { warn: 'Note', ok: 'Done', bad: 'Refused', quiet: 'Note' };
</script>

<div
	class="cert-notice"
	class:cert-notice-ok={tone === 'ok'}
	class:cert-notice-bad={tone === 'bad'}
	class:cert-notice-quiet={tone === 'quiet'}
	role={tone === 'bad' ? 'alert' : 'status'}
	data-testid={testId}
	data-tone={tone}
>
	<span class="cert-notice-glyph" aria-hidden="true">{GLYPH[tone]}</span>
	<div class="cert-notice-body">
		<strong>{title ?? WORD[tone]}</strong>
		{#if children}{@render children()}{/if}
	</div>
</div>

<style>
	.cert-notice-body {
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
