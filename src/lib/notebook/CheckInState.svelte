<script lang="ts">
	import type { LogCheckInState } from '$lib/notebook/log';

	/**
	 * WHERE A STUDENT STANDS ON A CHECK-IN, AS A CHIP (ledger 0298, R32): a word
	 * and a tone, never colour alone. The word is the classroom's own
	 * (`checkInStatusLabel`), so "Not filed yet" reads the same here as on the
	 * class page; the tone is `checkInTone`'s, drawn in this room's inks.
	 *
	 * THE TONE IS ALSO A FILL STYLE, so it survives a reader who cannot tell the
	 * hues apart: something asked of you is a filled pill, done is an outlined
	 * one, and a check-in not asked for yet is dashed.
	 */
	let { value, testId = null }: { value: LogCheckInState; testId?: string | null } = $props();
</script>

<span class="ci-state tone-{value.tone}" data-tone={value.tone} data-testid={testId}>{value.word}</span>

<style>
	.ci-state {
		display: inline-flex;
		align-items: center;
		flex: none;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		border: 1px solid var(--nb-hairline-strong);
		font-family: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: none;
		line-height: 1.35;
		white-space: nowrap;
		color: var(--text-2);
	}
	/* Asked of you: the warning thread the draft chip on a card already wears. */
	.tone-attention {
		color: var(--nb-warn);
		border-color: color-mix(in srgb, var(--nb-warn) 55%, transparent);
		background: color-mix(in srgb, var(--nb-warn) 10%, transparent);
	}
	.tone-good {
		color: var(--nb-ok);
		border-color: color-mix(in srgb, var(--nb-ok) 50%, transparent);
	}
	.tone-info {
		color: var(--nb-accent-ink);
		border-color: color-mix(in srgb, var(--nb-accent) 45%, transparent);
	}
	/* Not asked for yet: dashed, and the room's secondary ink, which is
	   measured for text where the tertiary tier is not. */
	.tone-muted {
		color: var(--text-2);
		border-style: dashed;
	}
</style>
