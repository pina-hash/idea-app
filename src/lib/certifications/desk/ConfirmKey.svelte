<script lang="ts">
	/**
	 * A TWO-STEP INLINE CONFIRM for anything irreversible (CLAUDE.md: arm,
	 * then confirm, and name what it costs before the confirm). The first key
	 * arms; armed, the cost is said in words beside a real submit key and a
	 * Cancel. It sits INSIDE the caller's form, so the confirm is the form's
	 * own submit; a caller with no form hands in `onconfirm` and the confirm
	 * key calls it instead.
	 *
	 * `children` is anything the armed state needs filled in first (a
	 * required reason), rendered between the sentence and the keys.
	 */
	import type { Snippet } from 'svelte';

	let {
		word,
		confirmWord = word,
		cost,
		danger = false,
		onconfirm = null,
		canConfirm = true,
		heldBecause = null,
		testId = null,
		children = null
	}: {
		/** The visible word on the arming key. */
		word: string;
		confirmWord?: string;
		/** What this costs, in words, shown once armed. */
		cost: string;
		danger?: boolean;
		onconfirm?: (() => void) | null;
		/** Whether the confirm may go (a required reason typed). */
		canConfirm?: boolean;
		/** Why it may not, beside the held key. */
		heldBecause?: string | null;
		testId?: string | null;
		children?: Snippet | null;
	} = $props();

	let armed = $state(false);

	function confirm(event: Event) {
		if (!canConfirm) {
			event.preventDefault();
			return;
		}
		if (onconfirm) {
			event.preventDefault();
			onconfirm();
		}
	}
</script>

{#if !armed}
	<button
		type="button"
		class="btn cert-btn {danger ? 'danger' : 'secondary'}"
		data-testid={testId}
		onclick={() => (armed = true)}>{word}</button
	>
{:else}
	<div class="dk-confirm" data-testid={testId ? `${testId}-armed` : null}>
		<p class="dk-confirm-cost">{cost}</p>
		{#if children}{@render children()}{/if}
		<div class="cert-actions">
			<button
				type={onconfirm ? 'button' : 'submit'}
				class="btn cert-btn {danger ? 'danger' : ''}"
				aria-disabled={canConfirm ? undefined : 'true'}
				data-testid={testId ? `${testId}-confirm` : null}
				onclick={confirm}>{confirmWord}</button
			>
			<button type="button" class="btn cert-btn secondary" onclick={() => (armed = false)}>Cancel</button>
		</div>
		{#if !canConfirm && heldBecause}<p class="dk-held">{heldBecause}</p>{/if}
	</div>
{/if}

<style>
	.dk-confirm {
		display: grid;
		gap: 0.5rem;
		padding: 0.75rem 0.85rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-0, var(--bg0));
	}
	.dk-confirm-cost {
		margin: 0;
		line-height: 1.45;
	}
	/* A danger key: the room's crimson as the edge and the word, never the
	   only signal (the word says what it does). */
	.btn.danger {
		border-color: var(--crimson);
		color: var(--plate-danger-ink, var(--crimson));
	}
</style>
