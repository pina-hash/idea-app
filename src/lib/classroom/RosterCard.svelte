<script lang="ts">
	/**
	 * ONE STUDENT'S DETAIL, BESIDE THEIR NAME, WHILE A GRADER POINTS AT IT OR
	 * FOCUSES IT (ledger 0360, report 7933566a).
	 *
	 * Mr. Pina: each name "takes up way too much space"; the list should be
	 * compact, and "time since active or time active on the assignment ... can
	 * show up when I hover my mouse over their name". So a roster row is one line
	 * (the face, the name, the state) and everything else about the student --
	 * where they are, when they last worked, how long they have worked, what
	 * came in unfinished, what moved after grading, how many links they handed in
	 * -- is HERE, in one card the console draws for whichever name is pointed at
	 * or focused. Opening the student puts the same detail, in full, in the work
	 * head.
	 *
	 * ONE CARD, NOT ONE PER ROW. Thirty hidden cards are thirty copies of the
	 * presence line in the DOM for one that is ever on screen, and a row-level
	 * popover is clipped by the roster's own scroll container. This one is
	 * `position: fixed`, placed with `anchorPosition` against the row's RIGHT
	 * edge (the pure arithmetic `$lib/shell/anchored` is built on; the action
	 * itself only places above or below its anchor), so it opens over the work
	 * pane rather than over the next names.
	 *
	 * IT IS A TOOLTIP, NOT A CONTROL. `role="tooltip"`, no focusable content, and
	 * `pointer-events: none`, so it can never take a click meant for the row
	 * under it or the work beside it. The row points at it with
	 * `aria-describedby` exactly while it is shown, which is what a screen reader
	 * announces after the name. Absent at rest: `open` false renders nothing.
	 */
	import PresenceLine from '$lib/classroom/presence/PresenceLine.svelte';
	import { anchorPosition } from '$lib/shell/anchored';
	import type { PresenceLimits, PresenceRow } from '$lib/classroom/presence/state';

	let {
		id,
		open,
		anchor,
		name,
		chip,
		sectionLabel = null,
		incomplete = 0,
		changedLabel = null,
		presence = null,
		linkCount = 0,
		keyboard = false
	}: {
		/** The element id the row's `aria-describedby` names. */
		id: string;
		open: boolean;
		/** The row the card stands beside. */
		anchor: HTMLElement | null;
		name: string;
		/** The row's own state chip, word and tone, from `statusChip`. */
		chip: { label: string; cls: string };
		/** The class, when more than one is on screen. */
		sectionLabel?: string | null;
		/** Requirements a hand-in left unfinished (`incompleteCount`). */
		incomplete?: number;
		/** `postGradeChangeLabel`'s words, or null. */
		changedLabel?: string | null;
		/** Presence for this student, or null when the region is absent. */
		presence?: {
			row: PresenceRow | null;
			now: number;
			limits: PresenceLimits;
			loaded: boolean;
			workArrived: boolean;
		} | null;
		/** How many working links are in this student's answers. */
		linkCount?: number;
		/** Shown by keyboard focus, so the card names the keys. */
		keyboard?: boolean;
	} = $props();

	/**
	 * PLACE THE CARD BESIDE THE ROW. The anchor box is a zero-width line down the
	 * row's right edge, so "below, aligned to the start" means "starting level
	 * with the row, to its right" -- and `anchorPosition` flips it to the row's
	 * other side, or clamps it into the viewport, when there is no room there. A
	 * `DOMRect`'s sides are prototype getters, so the fields are copied by name
	 * (a spread copies nothing; CLAUDE.md's DOM trap).
	 */
	function place(node: HTMLElement, el: HTMLElement | null) {
		const run = (anchorEl: HTMLElement | null) => {
			if (!anchorEl || typeof window === 'undefined') return;
			const r = anchorEl.getBoundingClientRect();
			const panel = node.getBoundingClientRect();
			const at = anchorPosition(
				{ left: r.right, right: r.right, top: r.top, bottom: r.top, width: 0, height: 0 },
				{ width: panel.width, height: panel.height },
				{ width: window.innerWidth, height: window.innerHeight },
				{ prefer: 'below', align: 'start', gap: 8 }
			);
			node.style.left = `${Math.round(at.left)}px`;
			node.style.top = `${Math.round(at.top)}px`;
		};
		run(el);
		return {
			update(next: HTMLElement | null) {
				run(next);
			}
		};
	}
</script>

{#if open}
	<div class="roster-card info-tip-panel" role="tooltip" {id} data-testid="roster-card" use:place={anchor}>
		<p class="rc-name">{name}</p>
		{#if sectionLabel}<p class="rc-section" data-testid="roster-card-section">{sectionLabel}</p>{/if}
		<p class="rc-line">
			<span class="roster-chip {chip.cls}" data-testid="roster-card-state">{chip.label}</span>
		</p>
		{#if incomplete > 0}
			<p class="rc-line" data-testid="roster-card-incomplete">
				Handed in with {incomplete}
				{incomplete === 1 ? 'requirement' : 'requirements'} unfinished
			</p>
		{/if}
		{#if changedLabel}
			<p class="rc-line" data-testid="roster-card-changed">{changedLabel}</p>
		{/if}
		{#if presence}
			<div class="rc-presence">
				<PresenceLine
					row={presence.row}
					now={presence.now}
					limits={presence.limits}
					loaded={presence.loaded}
					workArrived={presence.workArrived}
				/>
			</div>
		{/if}
		{#if linkCount > 0}
			<p class="rc-line" data-testid="roster-card-links">
				{linkCount}
				{linkCount === 1 ? 'link' : 'links'} in their answers
			</p>
		{/if}
		<p class="rc-hint">
			{keyboard
				? 'Enter opens their work. Up and Down move between names.'
				: 'Click to open their work.'}
		</p>
	</div>
{/if}

<style>
	/* THE HOUSING IS THE PLATE'S INFO-TIP PANEL (`.info-tip-panel` is on the
	   plate's floating-panel list), so this card reads as the same kind of
	   object as every other tip on the site; these rules are the geometry and
	   the off-plate fallback. */
	.roster-card {
		position: fixed;
		left: 0;
		top: 0;
		z-index: 60;
		width: min(18rem, calc(100vw - 16px));
		padding: 0.55rem 0.7rem;
		border-radius: var(--radius-card);
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.8rem;
		line-height: 1.4;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
		/* A TOOLTIP NEVER TAKES A CLICK. It opens over the work pane, beside the
		   name it describes, and a card that ate the pointer would be a dead
		   patch over somebody's answers. */
		pointer-events: none;
	}
	:global(:root[data-theme='space-white']) .roster-card {
		box-shadow: var(--elevation-2);
	}
	.rc-name {
		margin: 0 0 0.2rem;
		font-weight: 600;
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}
	.rc-section {
		margin: 0 0 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.rc-line {
		margin: 0.2rem 0 0;
		color: var(--text-1);
	}
	.rc-presence {
		margin-top: 0.35rem;
	}
	.rc-hint {
		margin: 0.45rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
</style>
