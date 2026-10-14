<script lang="ts">
	/**
	 * A FILTER THAT TAKES MORE THAN ONE VALUE (ledger 0380, reports 15a6d687 and
	 * 45b78498): a key that opens a panel of checkboxes, one 44px row each, and a
	 * summary on the key that says what is ticked in words. Nothing ticked is
	 * "any", and ticking the last one off puts it back there, so the filter can
	 * never sit in a state with no value under it. The panel stays open while
	 * several are ticked and closes on Escape or a press anywhere else.
	 *
	 * Pure presentation: the facet's list and the test it feeds live in
	 * `$lib/feedback/armory-reports` (`facetMatches`, `toggleFacet`), so the two
	 * Armory consoles ask one rule.
	 */
	import { onMount } from 'svelte';
	import { toggleFacet } from './armory-reports';

	let {
		label,
		anyLabel,
		options,
		selected,
		onchange,
		testId
	}: {
		label: string;
		/** The summary when nothing is ticked: "Any version". */
		anyLabel: string;
		options: Array<{ value: string; label: string }>;
		selected: string[];
		onchange: (next: string[]) => void;
		testId?: string;
	} = $props();

	let open = $state(false);
	let root: HTMLElement | undefined = $state();
	const uid = `fms-${Math.random().toString(36).slice(2, 8)}`;

	const summary = $derived.by(() => {
		if (selected.length === 0) return anyLabel;
		if (selected.length === 1) return options.find((o) => o.value === selected[0])?.label ?? selected[0];
		return `${selected.length} selected`;
	});

	onMount(() => {
		// pointerdown, not click, and a detached target is ignored: the press that
		// opened the panel must not close it, and a re-render removes the node.
		function outside(e: PointerEvent) {
			const t = e.target as Node | null;
			if (!open || !root || !t || !t.isConnected) return;
			if (!root.contains(t)) open = false;
		}
		document.addEventListener('pointerdown', outside);
		return () => document.removeEventListener('pointerdown', outside);
	});

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			open = false;
			e.stopPropagation();
		}
	}
</script>

<div class="fms" bind:this={root} onkeydown={keydown} role="presentation">
	<button
		type="button"
		class="fms-key"
		aria-expanded={open}
		aria-controls="{uid}-panel"
		aria-label="{label}: {summary}"
		data-testid={testId}
		onclick={() => (open = !open)}
	>
		<span class="fms-sum" class:on={selected.length > 0}>{summary}</span>
		<span class="fms-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
	</button>
	{#if open}
		<fieldset class="fms-panel" id="{uid}-panel">
			<legend class="fms-legend">{label}</legend>
			<button
				type="button"
				class="fms-clear"
				disabled={selected.length === 0}
				data-testid={testId ? `${testId}-clear` : undefined}
				onclick={() => onchange([])}
			>
				{anyLabel}
			</button>
			{#each options as o (o.value)}
				<label class="fms-row">
					<input
						type="checkbox"
						checked={selected.includes(o.value)}
						onchange={() => onchange(toggleFacet(selected, o.value))}
					/>
					<span class="fms-word">{o.label}</span>
				</label>
			{/each}
		</fieldset>
	{/if}
</div>

<style>
	.fms {
		position: relative;
		min-width: 0;
	}
	.fms-key {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		min-height: 44px;
		box-sizing: border-box;
		padding: 0 0.6rem;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.88rem;
		text-align: left;
		cursor: pointer;
	}
	.fms-sum {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fms-sum.on {
		color: var(--green);
	}
	.fms-caret {
		color: var(--text-2);
		font-size: 0.7rem;
	}
	.fms-panel {
		position: absolute;
		z-index: 20;
		top: calc(100% + 0.25rem);
		left: 0;
		min-width: 100%;
		width: max-content;
		max-width: min(24rem, 90vw);
		max-height: 18rem;
		overflow-y: auto;
		margin: 0;
		padding: 0.25rem;
		box-sizing: border-box;
		background: var(--surface-1, var(--surface-2));
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.28);
	}
	.fms-legend {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.fms-clear {
		display: block;
		width: 100%;
		min-height: 44px;
		padding: 0 0.6rem;
		background: none;
		border: 0;
		border-bottom: 1px solid var(--hairline);
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-align: left;
		cursor: pointer;
	}
	.fms-clear:disabled {
		cursor: default;
		opacity: 0.6;
	}
	.fms-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 44px;
		padding: 0 0.6rem;
		cursor: pointer;
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.88rem;
	}
	.fms-row input {
		width: 1.1rem;
		height: 1.1rem;
		flex: none;
		accent-color: var(--green);
	}
	.fms-word {
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
