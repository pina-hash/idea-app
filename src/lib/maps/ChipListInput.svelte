<script lang="ts">
	/**
	 * Aliases and tags entry -- spec 5.1 calls this vocabulary the searchable
	 * half of an item type, so entering it "has to be pleasant rather than an
	 * afterthought": type, press Enter (or comma), the value becomes a chip;
	 * paste a comma-separated list and every part lands at once; Backspace in
	 * an empty field removes the last chip; every chip carries a real remove
	 * button with a visible word for assistive tech.
	 *
	 * The list is normalized on the way in -- trimmed, blanks dropped, deduped
	 * case-insensitively -- because these are identity keys for search and
	 * "Allen key" twice is one alias, not two (the normalize-dedupe-sort rule,
	 * minus the sort: entry order is the author's own and is kept).
	 *
	 * A value still sitting in the text box commits on blur, so tabbing away
	 * to press Save cannot silently drop the last thing typed.
	 */
	let {
		id,
		label,
		values,
		placeholder = '',
		hint = null,
		onchange
	}: {
		id: string;
		label: string;
		values: string[];
		placeholder?: string;
		hint?: string | null;
		onchange: (next: string[]) => void;
	} = $props();

	let draft = $state('');

	function commit() {
		const parts = draft
			.split(',')
			.map((p) => p.trim())
			.filter((p) => p !== '');
		if (parts.length === 0) {
			draft = '';
			return;
		}
		const seen = new Set(values.map((v) => v.toLowerCase()));
		const next = [...values];
		for (const part of parts) {
			if (!seen.has(part.toLowerCase())) {
				next.push(part);
				seen.add(part.toLowerCase());
			}
		}
		draft = '';
		if (next.length !== values.length) onchange(next);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			commit();
			return;
		}
		if (event.key === 'Backspace' && draft === '' && values.length > 0) {
			event.preventDefault();
			onchange(values.slice(0, -1));
		}
	}

	function remove(index: number) {
		onchange(values.filter((_, i) => i !== index));
	}
</script>

<div class="chips-field">
	<label for={id}>{label}</label>
	<div class="chips-box">
		{#each values as value, i (value)}
			<span class="chip">
				{value}
				<button
					type="button"
					class="chip-remove"
					onclick={() => remove(i)}
					aria-label={`Remove ${label.toLowerCase().replace(/s$/, '')} "${value}"`}
				>
					&times;
				</button>
			</span>
		{/each}
		<input
			{id}
			type="text"
			bind:value={draft}
			{placeholder}
			autocomplete="off"
			onkeydown={onkeydown}
			onblur={commit}
		/>
	</div>
	{#if hint}<p class="hint">{hint}</p>{/if}
</div>

<style>
	.chips-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	.chips-box {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem;
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		font-size: 0.82rem;
		color: var(--white);
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.1rem 0.2rem 0.1rem 0.6rem;
	}
	.chip-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* The 24px absolute floor. 44px here would overlap the chip beside it
		   and hand its taps to the wrong remove button, the same argument the
		   inline-prose exemption makes. */
		min-width: 24px;
		min-height: 24px;
		border: 0;
		background: transparent;
		color: var(--dim);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		border-radius: 999px;
	}
	.chip-remove:hover,
	.chip-remove:focus-visible {
		color: var(--white);
		background: var(--bg2);
	}
	input {
		flex: 1 1 8rem;
		min-width: 8rem;
		min-height: 32px;
		border: 0;
		background: transparent;
		color: var(--white);
		font-family: var(--font-display);
		font-size: 0.95rem;
	}
	input:focus {
		outline: none;
	}
	.chips-box:focus-within {
		border-color: var(--focus-ring);
	}
	.hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}
</style>
