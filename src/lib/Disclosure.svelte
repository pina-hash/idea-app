<script lang="ts">
	import { page } from '$app/state';
	import {
		disclosureKey,
		disclosureLatch,
		disclosureOpen,
		readDisclosure,
		writeDisclosure,
		type DisclosureLatch,
		type DisclosureStored
	} from '$lib/disclosure';
	import { untrack, type Snippet } from 'svelte';

	/**
	 * THE ONE DISCLOSURE. A labelled button and the region it hides.
	 *
	 * There are two dozen hand-rolled versions of this shape in the repo, in two
	 * families -- native `<details>`, and a button with `aria-controls` driving
	 * a `max-height` rule -- and they disagree about the parts nobody looks at:
	 * whether the region is announced, whether the trigger says a word or only
	 * draws a caret, whether the state is remembered, whether it survives print.
	 * This is the component they should all become. It converts none of them
	 * today; see the bundle's history entry for which are the same shape.
	 *
	 * DELIBERATELY NOT SHAPED AROUND THE ITEM PAGE. It is the item page's
	 * instructions panel today and an instructor's guidance panel on a notebook
	 * check-in next, so it assumes no card, no heading level, no theme and no
	 * classroom vocabulary: everything it draws comes from `label`, the two
	 * snippets, and the SHARED tokens both rooms already alias
	 * (IDEA_INTERFACE_STANDARDS 1, "Where this shape appears on more than one
	 * surface it is one component with one behaviour").
	 *
	 * COLLAPSING HIDES, IT NEVER REMOVES. The region stays in the DOM and is
	 * hidden in CSS, so the material is one press away rather than one load
	 * away -- and a printed copy carries it whatever the screen was showing,
	 * which is the same reason every printable section stays mounted elsewhere
	 * in this app.
	 *
	 * THE DEFAULT IS EXPANDED, FOR EVERYBODY. `collapseWhen` is the caller's
	 * signal that the reading is no longer the thing in front of this person --
	 * on an assignment, that they have started the work. There is no role prop
	 * and there must not be one: an instructor opening the item they wrote sees
	 * the panel a student sees, in the state a student sees it in.
	 *
	 * AND IT IS AN ARRIVAL CONDITION, NOT A LIVE INSTRUCTION TO CLOSE. It is
	 * LATCHED here (`disclosureLatch`), so it can fall and never rise: an open
	 * panel is closed by this person's press and by nothing else. Read live it
	 * folded itself away mid-keystroke, and because the region is hidden with
	 * `display: none` that took the caret and the page's height with it. See
	 * `$lib/disclosure` for the whole argument, and
	 * `tools/browser-verify/routes/classroom-interaction-case-typing.mjs` for
	 * the measurement.
	 *
	 * WHAT IS REMEMBERED IS THE MANUAL CHOICE ONLY. See `$lib/disclosure` for
	 * why storing the live state instead would freeze the first render forever.
	 */
	let {
		label,
		children,
		meta = null,
		scope = null,
		collapseWhen = false,
		heading = null,
		testId = null,
		bodyClass = ''
	}: {
		/** The visible word on the trigger. A glyph alone is not a control. */
		label: string;
		children: Snippet;
		/** Optional trailing content in the trigger row: a count, a chip, a time. */
		meta?: Snippet | null;
		/**
		 * What this panel is, for the purpose of remembering a manual toggle:
		 * per item, per module, per whatever the caller means by "the same
		 * panel next time". Null (the default) remembers nothing at all, which
		 * is the right answer for a preview or a harness -- there is no item to
		 * remember it against. The viewer's own id is added here, not by the
		 * caller, so "per person" is one rule in one place.
		 */
		scope?: string | null;
		/** True once the reading is no longer what this person came back for. */
		collapseWhen?: boolean;
		/**
		 * Wrap the trigger in a heading of this level, when the panel is
		 * replacing one. The button stays the control either way; this only
		 * decides whether it is also a landmark in the document outline.
		 */
		heading?: 2 | 3 | 4 | null;
		testId?: string | null;
		bodyClass?: string;
	} = $props();

	/** `aria-controls` needs a real id, and two panels on one page need two. */
	const uid = $props.id();
	const bodyId = `disclosure-${uid}`;

	const viewer = $derived((page.data?.claims?.sub as string | undefined) ?? null);
	const storageKey = $derived(disclosureKey(viewer, scope));

	/**
	 * The person's own choice, once they make one.
	 *
	 * `stored` is a plain derived read rather than an effect, so the very first
	 * client render already has the remembered answer and nothing flips a frame
	 * later. It cannot see its own write (localStorage is not reactive), which
	 * is what `override` is for -- and keying the override to the key it was
	 * made under is what makes a caller that swaps `scope` (opening a different
	 * item without remounting) fall straight back to the new panel's own
	 * memory instead of carrying the last one's.
	 */
	const stored = $derived<DisclosureStored>(readDisclosure(storageKey));
	let override = $state<{ key: string | null; open: boolean } | null>(null);
	const chosen = $derived<DisclosureStored>(
		override && override.key === storageKey ? override.open : stored
	);

	/**
	 * THE COLLAPSE SIGNAL, LATCHED, AND THE LATCH IS KEYED EXACTLY AS
	 * `override` IS.
	 *
	 * `collapseWhen` says how this panel should ARRIVE. Read live it also
	 * closes a panel somebody is already inside, which is the reported defect
	 * (see `$lib/disclosure`); latched, it can fall and never rise, so nothing
	 * but this person's own press ever folds an open panel.
	 *
	 * NO SEED IN THE INITIALIZER, AND THAT IS NOT A STYLE CHOICE. Reading
	 * `storageKey` or `collapseWhen` there is a `state_referenced_locally`
	 * warning apiece -- two more than this tree's 37 -- and the fallback below
	 * makes the seed unnecessary anyway: an unsampled latch and a latch from
	 * another panel are the same answer, so the live signal IS the first
	 * frame. That is also what makes `svelte/server` correct with no effects
	 * run at all, and what keeps a `scope` swap from showing one frame of the
	 * previous panel's state.
	 *
	 * The inputs are read TRACKED at the top of the effect and only the
	 * latch's own read-and-write is `untrack`ed, so an effect that writes what
	 * it reads cannot re-trigger itself.
	 */
	let latch = $state<DisclosureLatch | null>(null);
	$effect(() => {
		const key = storageKey;
		const signal = collapseWhen;
		untrack(() => {
			latch = disclosureLatch(latch, key, signal);
		});
	});
	const collapsed = $derived(
		latch && latch.key === storageKey ? latch.collapsed : collapseWhen
	);

	const open = $derived(disclosureOpen(chosen, collapsed));

	function toggle() {
		const next = !open;
		override = { key: storageKey, open: next };
		writeDisclosure(storageKey, next);
	}
</script>

{#snippet trigger()}
	<button
		type="button"
		class="disc-trigger"
		aria-expanded={open}
		aria-controls={bodyId}
		data-testid={testId}
		onclick={toggle}
	>
		<span class="disc-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
		<span class="disc-label">{label}</span>
		{#if meta}<span class="disc-meta">{@render meta()}</span>{/if}
		<!-- The word, not only the caret: a tooltip is not discoverable and a
		     phone cannot hover. It is also what tells a reader that the hidden
		     material is still there. -->
		<span class="disc-action">{open ? 'Hide' : 'Show'}</span>
	</button>
{/snippet}

<div class="disc" class:is-open={open}>
	{#if heading === 2}
		<h2 class="disc-heading">{@render trigger()}</h2>
	{:else if heading === 3}
		<h3 class="disc-heading">{@render trigger()}</h3>
	{:else if heading === 4}
		<h4 class="disc-heading">{@render trigger()}</h4>
	{:else}
		{@render trigger()}
	{/if}

	<!-- IN THE DOM WHETHER OR NOT IT IS SHOWING. Hidden in CSS, so it prints,
	     and so re-opening it costs nothing. -->
	<div class="disc-body {bodyClass}" id={bodyId} data-open={open}>
		{@render children()}
	</div>
</div>

<style>
	.disc {
		display: block;
	}

	/* A heading here is a document-outline decision, never a type decision:
	   the trigger inside it is what carries the look, so the heading itself
	   contributes no size, weight or spacing of its own. */
	.disc-heading {
		margin: 0;
		font: inherit;
		font-weight: inherit;
		letter-spacing: inherit;
		text-transform: none;
		color: inherit;
	}
	/* The classroom shell puts a green `// ` on every h2. This is a control,
	   not a section label, so it takes neither. */
	.disc-heading::before {
		content: none;
	}

	.disc-trigger {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		/* 44px: this is a student-facing control on a surface a phone reaches
		   (IDEA_INTERFACE_STANDARDS 10). */
		min-height: 44px;
		margin: 0;
		padding: var(--space-2) 0;
		border: none;
		background: none;
		text-align: left;
		cursor: pointer;
		color: var(--text-1);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	/* TWO ROOM HOOKS, read at the POINT OF USE with a fallback rather than
	   declared as tokens on `.disc` itself. A declaration here would sit on a
	   DESCENDANT of the room's wrapper and beat the room's own value, which is
	   the var()-resolves-where-declared trap in reverse. Written this way,
	   `.nb-root` simply declares them and the paper room gets its brass
	   accent; anywhere that declares nothing gets the portal's. */
	.disc-trigger:hover .disc-label,
	.disc-trigger:hover .disc-action {
		color: var(--disc-accent, var(--green));
	}
	.disc-trigger:focus-visible {
		outline: 2px solid var(--disc-focus, var(--focus-ring));
		outline-offset: 2px;
	}

	.disc-caret {
		flex: none;
		width: 0.9em;
		color: var(--text-2);
	}
	.disc-label {
		flex: none;
	}
	.disc-meta {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-2);
		text-transform: none;
		letter-spacing: 0.02em;
	}
	.disc-action {
		flex: none;
		margin-left: auto;
		color: var(--text-2);
		font-size: 0.72rem;
	}
	/* `--disc-meta` grows into the space when there is no meta snippet, so the
	   word stays hard right in both cases. */
	.disc-trigger > .disc-label + .disc-action {
		margin-left: auto;
	}

	.disc-body[data-open='false'] {
		display: none;
	}
	.disc-body[data-open='true'] {
		padding-top: var(--space-1);
	}

	/* A section that never rendered cannot print, and a section hidden on
	   screen is still part of the handout. */
	@media print {
		.disc-body[data-open='false'] {
			display: block;
		}
		.disc-trigger {
			display: none;
		}
	}
</style>
