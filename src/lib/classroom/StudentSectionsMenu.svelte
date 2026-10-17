<script lang="ts">
	/**
	 * THE SECTIONS KEY ON ONE STUDENT'S PAGE (report bd38fa25): one compact
	 * menu in the page header that shows or hides whole sections, for every
	 * student page this teacher opens. Mounted only by `StudentOverview`.
	 *
	 * PROPS AND ONE CALLBACK. The hidden list comes from the classroom
	 * preference store (an account group, so it follows the teacher) and each
	 * tick hands the whole next list back through `onchange`; the store writes
	 * it, read-first and debounced. Nothing here stores or fetches anything.
	 *
	 * A POPOVER, NOT A DISCLOSURE: a worded key carrying `aria-expanded`, lit
	 * (`.on`) while open, over a panel placed by `$lib/shell/anchored` so no
	 * card's overflow can clip it. A press anywhere else closes it (on
	 * POINTERDOWN, ignoring a detached target, so the press that opens it is
	 * not the press that closes it), Escape closes it and puts focus back on
	 * the key, and focus moving to anything outside it (a Tab past Done)
	 * closes it without moving focus, so a keyboard never lands on a control
	 * the panel is drawn over. Each section is a real checkbox in a label,
	 * 44px tall.
	 *
	 * IT STAYS ON ITS KEY AFTER EVERY TICK. Hiding the grade, Coming up or the
	 * pictures moves the key itself (they sit above it), and `anchored` only
	 * re-places on a scroll, a resize or a change of its params; so the params
	 * carry the hidden list (`layout`), and a tick re-places the panel against
	 * the key's new box (once at once, and once after layout settles).
	 *
	 * AND IT NEVER COVERS ITS KEY. On a phone the thirteen rows are taller than
	 * the room on either side of the key, and a clamped panel was drawn over
	 * the key it opened from. So the panel opens on the side with more room and
	 * is never taller than that room (`room`, re-measured on every scroll,
	 * resize and tick while open); the heading and the Show all and Done keys
	 * keep their place and the LIST scrolls. There is no fixed floor any more
	 * (polish round: a 300px floor still covered half the key in a 960x600
	 * window with the key mid-screen, where each side had about 260px), so in a
	 * short window it simply shows fewer rows. Three steps, each measured off
	 * the panel's own parts rather than written down:
	 *   - room for the note and two rows of boxes: everything shows;
	 *   - less than that: the note steps out of sight (it stays in the panel for
	 *     a screen reader) so the boxes keep the room (`tight`);
	 *   - not even one row of boxes on either side (a phone on its side with the
	 *     key mid-screen): opening scrolls the page just far enough that one
	 *     side has room, once, on open (never while the teacher scrolls).
	 * Only a window too short for the heading, one row and the two keys at all
	 * is held on screen over the key, and no browser window is that short.
	 *
	 * A LIST THAT SCROLLS SAYS SO (report bd38fa25, round 2). A phone shows a
	 * scrollbar only while it moves and this list showed three of its thirteen
	 * rows with a 4px sliver of the fourth as the only sign of the rest. While
	 * rows sit below the list's edge, its foot fades and the footer says how
	 * many in words ("10 more below": `below`, counted from the rows' own
	 * boxes on open, on every scroll of the list and on every re-measure); the
	 * words go once the last row is in view. They are short so the footer keeps
	 * one line at 375 and the list keeps its height.
	 */
	import { untrack } from 'svelte';
	import { anchored, anchorPosition, clearBottom, cornerReserve, type AnchoredParams } from '$lib/shell/anchored';
	import {
		STUDENT_PAGE_SECTIONS,
		setStudentSectionShown,
		studentHiddenCountWords,
		studentSectionsMenuFit,
		type StudentPageSectionId
	} from './student-sections';

	let {
		hidden,
		onchange
	}: {
		hidden: readonly StudentPageSectionId[];
		onchange: (next: StudentPageSectionId[]) => void;
	} = $props();

	let open = $state(false);
	let root = $state<HTMLElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	const hiddenSet = $derived(new Set<string>(hidden));
	const countWords = $derived(studentHiddenCountWords(hidden));
	/* Stable across the server render and hydration, so the key's
	   `aria-controls` always names the panel it opens. */
	const propsId = $props.id();
	const uid = `ssm-${propsId}`;

	const GAP = 6;
	const MARGIN = 12;
	/** The panel's height cap in px while open (the larger room beside the key); null while closed. */
	let room = $state<number | null>(null);
	/** True while the room is too short for the note and two rows: the note steps out of sight. */
	let tight = $state(false);
	let panel = $state<HTMLElement | null>(null);
	let note = $state<HTMLElement | null>(null);
	let list = $state<HTMLUListElement | null>(null);
	/** How many rows sit wholly or partly below the list's visible edge, while open. */
	let below = $state(0);
	/** The note's height with its margin and one gap, measured while it shows. */
	let noteSpace = 0;
	/** Whether the panel was already open last time the effect ran, so only an OPEN may scroll the page. */
	let wasOpen = false;

	const px = (v: string) => {
		const n = parseFloat(v);
		return Number.isFinite(n) ? n : 0;
	};

	/** The panel's parts other than the list and the note (padding, heading, footer, gaps), and one row's height. */
	function panelParts(): { chrome: number; row: number } {
		if (!panel || !list) return { chrome: 0, row: 44 };
		const gap = px(getComputedStyle(panel).rowGap);
		if (!tight && note) noteSpace = note.getBoundingClientRect().height + px(getComputedStyle(note).marginBottom) + gap;
		const chrome = panel.getBoundingClientRect().height - list.getBoundingClientRect().height - (tight ? 0 : noteSpace);
		const row = (list.firstElementChild as HTMLElement | null)?.getBoundingClientRect().height || 44;
		return { chrome: Math.max(0, chrome), row };
	}

	/**
	 * The rooms above and below the key, each less the margin and the gap.
	 * BELOW ENDS AT THE FEEDBACK BUTTON where the panel's columns cross it
	 * (ledger 0396): the panel is drawn inside `main`, so the button paints over
	 * it, and on a phone it covered Show all and Done and a tap on Done opened
	 * the feedback window. `clearBottom` is the same floor `anchored` places the
	 * panel against, so the cap and the placement agree.
	 */
	function rooms() {
		const k = (trigger as HTMLElement).getBoundingClientRect();
		const width = panel?.getBoundingClientRect().width ?? 0;
		const viewport = { width: window.innerWidth, height: window.innerHeight };
		const { left } = anchorPosition(k, { width, height: 0 }, viewport, { align: 'start', margin: MARGIN });
		const floor = clearBottom({ left, right: left + width }, viewport.height, cornerReserve());
		return { above: k.top - MARGIN - GAP, under: floor - k.bottom - MARGIN - GAP };
	}

	/** The nearest box that scrolls the key, or the page. */
	function scroller(): Element | null {
		for (let el = trigger?.parentElement ?? null; el && el !== document.body; el = el.parentElement) {
			const y = getComputedStyle(el).overflowY;
			if ((y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight) return el;
		}
		return document.scrollingElement;
	}

	/*
	 * NOT EVEN ONE ROW ON EITHER SIDE: scroll the page so the larger side grows
	 * to `least`, and if the page ends first, the other side. `instant`, because
	 * the site's stylesheet asks every scroll to be smooth and the panel is
	 * placed against where the key is now.
	 */
	function makeRoom(least: number) {
		const box = scroller();
		if (!box) return;
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const r = rooms();
			if (Math.max(r.above, r.under) >= least) return;
			const growUnder = attempt === 0 ? r.under >= r.above : r.under < r.above;
			const need = Math.ceil(least - (growUnder ? r.under : r.above));
			box.scrollBy({ top: growUnder ? need : -need, behavior: 'instant' });
		}
	}

	function measureRoom(opening = false) {
		if (!trigger) return;
		const { chrome, row } = panelParts();
		const fit = () => studentSectionsMenuFit({ ...rooms(), chrome, note: noteSpace, row });
		let f = fit();
		if (opening && f.short > 0) {
			makeRoom(f.least);
			f = fit();
		}
		if (f.tight !== tight) tight = f.tight;
		if (f.room !== room) room = f.room;
		countBelow();
	}

	/* A row counts as below once more than a quarter of it is past the edge:
	   the sliver the report saw is a row nobody can read. */
	function countBelow() {
		if (!list) return;
		const edge = list.getBoundingClientRect().bottom;
		let n = 0;
		for (const row of list.children) {
			const r = row.getBoundingClientRect();
			if (r.height > 0 && r.bottom - edge > r.height * 0.25) n += 1;
		}
		if (n !== below) below = n;
	}

	$effect(() => {
		if (!open) {
			room = null;
			tight = false;
			below = 0;
			wasOpen = false;
			return;
		}
		// A tick moves the key (the sections above it come and go), and so does a scroll.
		void hidden;
		const opening = !wasOpen;
		wasOpen = true;
		untrack(() => measureRoom(opening));
		// The cap above lands on the next frame; count again once it has.
		const settle = setTimeout(() => countBelow(), 60);
		const run = () => measureRoom();
		window.addEventListener('scroll', run, true);
		window.addEventListener('resize', run);
		return () => {
			clearTimeout(settle);
			window.removeEventListener('scroll', run, true);
			window.removeEventListener('resize', run);
		};
	});

	/*
	 * `layout` is not a placement option: it is here so the action's update runs
	 * whenever the page above the key reflows because a section came or went,
	 * or the panel's own height cap moved.
	 */
	const placement: AnchoredParams & { layout: string } = $derived({
		anchor: trigger,
		open,
		prefer: 'below',
		align: 'start',
		gap: GAP,
		margin: MARGIN,
		layout: `${hidden.join(',')}|${room ?? ''}|${tight}`
	});

	function close(refocus: boolean) {
		open = false;
		if (refocus) trigger?.focus();
	}

	function onPointerDown(event: PointerEvent) {
		if (!open) return;
		const target = event.target as Node | null;
		if (!target || !target.isConnected) return;
		if (!root?.contains(target)) open = false;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') {
			event.preventDefault();
			close(true);
		}
	}

	/* Focus left for something outside the menu (a null target is a click on
	   the panel's own blank space or the window losing focus, and keeps it). */
	function onFocusOut(event: FocusEvent) {
		if (!open) return;
		const next = event.relatedTarget as Node | null;
		if (next && !root?.contains(next)) open = false;
	}

	function toggle(id: StudentPageSectionId, shown: boolean) {
		onchange(setStudentSectionShown(hidden, id, shown));
	}

	function showAll() {
		if (hidden.length) onchange([]);
	}
</script>

<svelte:document onpointerdown={onPointerDown} onkeydown={onKeyDown} />

<div class="ssm" bind:this={root} onfocusout={onFocusOut}>
	<button
		type="button"
		class="btn secondary tiny ssm-trigger"
		class:on={open}
		aria-expanded={open}
		aria-controls="{uid}-panel"
		bind:this={trigger}
		onclick={() => (open = !open)}
		data-testid="so-sections"
	>
		<svg class="ssm-glyph" viewBox="0 0 24 24" aria-hidden="true"
			><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="7" cy="18" r="2" /></svg
		>
		<span>Sections</span>
		{#if countWords}<span class="ssm-count" data-testid="so-sections-count">{countWords}</span>{/if}
	</button>
	<div
		id="{uid}-panel"
		class="ssm-panel"
		class:ssm-tight={tight}
		bind:this={panel}
		role="group"
		aria-labelledby="{uid}-head"
		hidden={!open}
		style:max-height={room === null ? null : `min(${room}px, calc(100dvh - ${MARGIN * 2}px))`}
		use:anchored={placement}
		data-testid="so-sections-panel"
	>
		<p class="ssm-head" id="{uid}-head">Show on every student page</p>
		<p class="ssm-note" bind:this={note}>
			Saved to your account, for every student you open. A hidden section is left off the page and off the
			printout.
		</p>
		<ul
			class="ssm-list"
			class:ssm-list-more={below > 0}
			bind:this={list}
			onscroll={countBelow}
			data-below={below}
		>
			{#each STUDENT_PAGE_SECTIONS as s (s.id)}
				<li>
					<label class="ssm-row">
						<input
							type="checkbox"
							checked={!hiddenSet.has(s.id)}
							onchange={(e) => toggle(s.id, e.currentTarget.checked)}
							data-section={s.id}
						/>
						<span>{s.label}</span>
					</label>
				</li>
			{/each}
		</ul>
		<div class="ssm-foot">
			{#if below > 0}
				<span class="ssm-more" data-testid="so-sections-more">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v13M6 12l6 6 6-6" /></svg>
					{below} more below
				</span>
			{/if}
			<button
				type="button"
				class="btn secondary tiny"
				aria-disabled={hidden.length === 0}
				onclick={showAll}
				data-testid="so-sections-all"
			>
				Show all
			</button>
			<button type="button" class="btn tiny" onclick={() => close(true)} data-testid="so-sections-done">Done</button>
		</div>
	</div>
</div>

<style>
	.ssm {
		display: inline-flex;
	}
	.ssm-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
	}
	.ssm-glyph {
		flex: none;
		width: 1rem;
		height: 1rem;
		fill: var(--surface-1, var(--bg1));
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
	}
	.ssm-count {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		padding: 0.05rem 0.4rem;
		border: 1px solid currentColor;
		border-radius: 999px;
		white-space: nowrap;
	}
	/* The panel sits over the cards below the header; `main` is the stacking
	   context it is drawn in (CLAUDE.md's DOM trap), so this only has to beat
	   the page's own positioned boxes, the grade's glow among them. */
	.ssm-panel {
		z-index: 30;
		box-sizing: border-box;
		width: min(32rem, calc(100vw - 24px));
		/* Never taller than the window, so `anchored` can always keep it on
		   screen; on a short window the LIST scrolls and the heading and the
		   Show all and Done keys stay in view (a footer scrolled out of reach
		   is a menu nobody can close by its own key). */
		max-height: calc(100dvh - 24px);
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.85rem 1rem 0.75rem;
		background: var(--surface-1, var(--bg1));
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 10px);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
		font-size: 1rem;
		line-height: 1.4;
	}
	.ssm-panel[hidden] {
		display: none;
	}
	.ssm-head {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-1);
	}
	.ssm-note {
		margin: 0 0 0.25rem;
		font-size: 0.88rem;
		color: var(--text-2);
	}
	/* A short window: out of sight but still in the panel, so a screen reader
	   still hears what the choice does. */
	.ssm-tight .ssm-note {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	/* In page order, down one column and on into the next where there is room
	   (multicol, never a grid: CLAUDE.md's column rule). */
	.ssm-list {
		list-style: none;
		margin: 0;
		padding: 0;
		columns: 13rem 2;
		column-gap: 1rem;
		flex: 0 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		/* A row reached by Tab is scrolled clear of the fade below. */
		scroll-padding-bottom: 2.2rem;
	}
	.ssm-list li {
		break-inside: avoid;
	}
	/* The fade is a mask over the list's own box (it stays put while the rows
	   scroll under it), so it needs no colour matched to the panel in any
	   theme. */
	.ssm-list-more {
		-webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 2.2rem), transparent);
		mask-image: linear-gradient(to bottom, #000 calc(100% - 2.2rem), transparent);
	}
	/* The words take the note's own ink (`--text-2` on the panel), measured
	   with the note in every theme's sections pass. */
	.ssm-more {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		margin-right: auto;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.02em;
		color: var(--text-2);
	}
	.ssm-more svg {
		flex: none;
		width: 0.95rem;
		height: 0.95rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.ssm-row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 44px;
		cursor: pointer;
		color: var(--text-1);
	}
	.ssm-row input {
		flex: none;
		width: 1.15rem;
		height: 1.15rem;
		margin: 0;
		accent-color: var(--green);
	}
	.ssm-foot {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--hairline);
	}
	.ssm-foot .btn {
		min-height: 44px;
	}
	.ssm-foot [aria-disabled='true'] {
		opacity: 0.55;
		cursor: default;
	}
	@media print {
		.ssm {
			display: none !important;
		}
	}
</style>
