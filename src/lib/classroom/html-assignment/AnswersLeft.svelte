<script lang="ts">
	/**
	 * ANSWERS LEFT, AS A LIST YOU CAN WALK (ledger 0431, report cb6d42bc).
	 *
	 * Parent chrome over `hxAnswersLeft`, which is `hxProgress`'s own unmet
	 * blocks: one button opens the list, every row is a button, and pressing a
	 * row hands its FIELD to `onjump`. What a jump does is the frame's business
	 * (`HtmlAssignmentFrame.focusField`, through the bridge, never into the
	 * document's DOM); this component only says how it went when it could not
	 * take the student all the way there.
	 *
	 * `compact` is the same list for the expanded full-page bar, where it opens
	 * as a dropdown under its button rather than pushing the rail down.
	 */
	import { tick } from 'svelte';
	import type { HxAnswersLeftGroup, HxJumpResult } from './answers-left';

	let {
		groups,
		onjump,
		compact = false
	}: {
		groups: HxAnswersLeftGroup[];
		onjump: (field: string) => Promise<HxJumpResult> | HxJumpResult;
		compact?: boolean;
	} = $props();

	const count = $derived(groups.reduce((n, g) => n + g.items.length, 0));
	let open = $state(false);
	let note = $state<string | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	let panel = $state<HTMLDivElement | null>(null);
	const panelId = `hx-left-${Math.random().toString(36).slice(2, 8)}`;

	$effect(() => {
		if (count === 0) open = false;
	});

	/** Open the list, at one module's first row when one is named. */
	export async function openAt(moduleId: string | null = null): Promise<void> {
		if (count === 0) return;
		open = true;
		note = null;
		await tick();
		const key = moduleId ?? '';
		const first =
			panel?.querySelector<HTMLButtonElement>(`[data-hx-left-module="${CSS.escape(key)}"] button`) ??
			panel?.querySelector<HTMLButtonElement>('button[data-hx-left-field]');
		first?.focus();
	}

	function toggle() {
		if (open) {
			open = false;
			return;
		}
		void openAt(null);
	}

	async function jump(groupTitle: string, field: string) {
		note = null;
		const result = await onjump(field);
		if (result === 'answer') {
			open = false;
			return;
		}
		note =
			result === 'frame'
				? `This worksheet cannot jump to one answer yet. It is in "${groupTitle}".`
				: 'The worksheet is not ready yet. Try again in a moment.';
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.stopPropagation();
			open = false;
			trigger?.focus();
		}
	}
</script>

{#if count > 0}
	<div class="hxl" class:compact data-hx-answers-left={count} onkeydown={keydown} role="presentation">
		<button
			type="button"
			class="hxl-trigger"
			aria-expanded={open}
			aria-controls={panelId}
			data-testid="hx-answers-left"
			bind:this={trigger}
			onclick={toggle}
		>
			<span class="hxl-count">{count}</span>
			<span>{count === 1 ? 'answer left' : 'answers left'}</span>
			<svg class="hxl-chev" class:up={open} viewBox="0 0 12 12" aria-hidden="true"
				><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg
			>
		</button>
		{#if open}
			<div class="hxl-panel" id={panelId} bind:this={panel} data-testid="hx-answers-left-list">
				{#each groups as group (group.moduleId ?? '')}
					<section class="hxl-group" data-hx-left-module={group.moduleId ?? ''}>
						<h4 class="hxl-group-title">{group.title}</h4>
						<ul class="hxl-items">
							{#each group.items as item (item.field)}
								<li>
									<button
										type="button"
										class="hxl-item"
										data-hx-left-field={item.field}
										onclick={() => jump(group.title, item.field)}
									>
										<span class="hxl-label">{item.label}</span>
										<span class="hxl-want">{item.want}</span>
									</button>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
				{#if note}
					<p class="hxl-note" role="status" data-testid="hx-answers-left-note">{note}</p>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.hxl {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.hxl-trigger {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		min-height: 44px;
		padding: 0 0.95rem;
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		cursor: pointer;
	}
	.hxl-trigger:hover {
		border-color: var(--hover-ink, var(--green));
	}
	.hxl-trigger:focus-visible,
	.hxl-item:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.hxl-count {
		font-weight: 700;
		font-size: var(--fs-sm);
		font-variant-numeric: tabular-nums;
	}
	.hxl-chev {
		width: 0.75rem;
		height: 0.75rem;
	}
	.hxl-chev.up {
		transform: rotate(180deg);
	}
	.hxl-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		background: var(--surface-2);
		max-height: min(60vh, 28rem);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.compact .hxl-panel {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 3;
		width: min(24rem, calc(100vw - 2rem));
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.4);
		background: var(--surface-1);
	}
	.compact .hxl-trigger {
		align-self: flex-end;
	}
	.hxl-group {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.hxl-group-title {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.hxl-items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.hxl-item {
		width: 100%;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: 0.45rem 0.75rem;
		text-align: left;
		font: inherit;
		font-size: var(--fs-ui);
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 6px);
		cursor: pointer;
	}
	.hxl-item:hover {
		border-color: var(--hover-ink, var(--green));
	}
	.hxl-label {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.hxl-want {
		flex: none;
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-2);
		white-space: nowrap;
	}
	.hxl-note {
		margin: 0;
		font-size: var(--fs-caption);
		color: var(--text-1);
	}
	@media (max-width: 480px) {
		.hxl-item {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.15rem;
		}
	}
</style>
