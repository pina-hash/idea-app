<script lang="ts">
	import type { LogCheckInState } from '$lib/notebook/log';
	import StatusChip from '$lib/ui/StatusChip.svelte';

	/**
	 * WHERE A STUDENT STANDS ON A CHECK-IN, AS A CHIP (ledger 0298, R32): a word
	 * and a tone, never colour alone. The word is the classroom's own
	 * (`checkInStatusLabel`), so "Not filed yet" reads the same here as on the
	 * class page; the tone and the mark are `checkInTone`'s and `checkInGlyph`'s,
	 * drawn by the one status chip (ledger 0466), so a reader who cannot tell
	 * the hues apart still has the mark and the word.
	 */
	let { value, testId = null }: { value: LogCheckInState; testId?: string | null } = $props();
</script>

<StatusChip tone={value.tone} glyph={value.glyph} class="ci-state" label={value.word} data-testid={testId ?? undefined} />
