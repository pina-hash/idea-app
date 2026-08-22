<script lang="ts">
	import { untrack } from 'svelte';
	import RichTextEditor from '$lib/classroom/RichTextEditor.svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import {
		GUIDANCE_WORD_TARGET,
		guidanceCountLabel,
		guidanceState,
		guidanceWordCount,
		type GuidanceSaveResult
	} from '$lib/check-in-guidance';
	import type { ItemDoc } from '$lib/classroom/classroom-doc';
	import type { TiptapNode } from '$lib/rich-text';

	/**
	 * THE GUIDANCE PROMPT FIELD: one editor, one counter, three mounts.
	 *
	 * It is the same field staged in the composer before the check-in exists,
	 * offered on the item page once it does, and offered again in the review
	 * console where a check-in's date, label and classes are edited today. A
	 * field authorable in two of three places is the split that produces "why
	 * can't I change this here", so there is one component and three callers.
	 *
	 * IT WRITES ON THE CLASSROOM RICH-TEXT CONTRACT AND INVENTS NO THIRD ONE.
	 * `RichTextEditor` is the item-body editor, configured with
	 * `ITEM_SCHEMA_OPTIONS` -- the same closed schema, the same paste filter,
	 * the same `_classroom_doc_ok` on the far end (0123 CALLS that function
	 * rather than cloning it). Nothing about this feature is a new document
	 * shape.
	 *
	 * TWO MODES, DECIDED BY THE ABSENCE OF A TRANSPORT, which is this repo's
	 * mechanism rather than a flag:
	 *
	 *   - `onsave` ABSENT  -- a STAGING field. The check-in does not exist yet
	 *                         (item creation), so there is nothing to write to;
	 *                         the parent holds the document and applies it in
	 *                         the same action that creates the check-in.
	 *   - `onsave` PRESENT -- a SAVING field, on a check-in that exists. It owns
	 *                         a `SaveState`, so the five states, the debounce,
	 *                         the backoff and the hide/pagehide net are the
	 *                         platform's one machine and not a sixth variant.
	 *
	 * A REFUSAL IS REPORTED ONCE AND NEVER RETRIED. `saveSessionGuidance`
	 * answers `{ok:false}` for a server that considered the document and said
	 * no, and this hands that up as `retryable: false` -- so an instructor who
	 * is not the teacher of record for every class the check-in runs in is told
	 * so once, in the words the database used, rather than watching five
	 * identical attempts.
	 *
	 * THE COUNTER NEVER GATES ANYTHING. It goes amber past the target and that
	 * is the whole of its authority; see `$lib/check-in-guidance` for why.
	 */
	let {
		value = null,
		onchange,
		onsave = null,
		disabled = false,
		label = 'Guidance for students',
		hint = null,
		testId = null
	}: {
		/** The stored prompt this field opens on, or null for a new one. */
		value?: ItemDoc | null;
		/** Every keystroke, as the editor's own document. */
		onchange: (doc: TiptapNode | null) => void;
		/**
		 * Persist the current document. ABSENT removes the save machinery
		 * entirely -- there is no write to execute, which is what makes the
		 * staging mode structural rather than a discipline.
		 */
		onsave?: ((doc: TiptapNode | null) => Promise<GuidanceSaveResult>) | null;
		disabled?: boolean;
		label?: string;
		hint?: string | null;
		testId?: string | null;
	} = $props();

	/**
	 * The editor's current document. Seeded by `onready` rather than from
	 * `value`, so the thing counted and the thing saved are both what the
	 * editor itself serialized.
	 */
	let current = $state<TiptapNode | null>(null);

	/**
	 * THE LAST DOCUMENT THE SERVER IS KNOWN TO HOLD. Every incoming change is
	 * COMPARED against it before anything is called dirty.
	 *
	 * WITHOUT THIS THE FIELD AUTOSAVES ITSELF FOREVER -- 151 writes in a few
	 * seconds, measured here first. `$lib/edit-baseline` carries the full
	 * account and is now the ONE implementation of the comparison; this
	 * component, `EntryNotes` and `ContentComposer` all read it, because three
	 * copies of "has this actually been edited" is three things that can stop
	 * agreeing.
	 */
	const baseline = new EditBaseline();

	const words = $derived(guidanceWordCount(current));
	const countState = $derived(guidanceState(words));

	/**
	 * ONE INSTANCE PER MOUNT, never a shared or shell-level one: a review
	 * console listing eight check-ins holds eight fields, and one indicator
	 * reading "saved" while a sibling holds a failed write is the false
	 * negative the per-instance rule exists to prevent.
	 */
	// `untrack`ed on purpose: whether this field can SAVE is a mount-time fact,
	// not something that toggles. An omitted transport removes the control, so a
	// mount either owns a machine for its whole life or has none at all.
	const write = untrack(() => onsave);
	const save = write
		? new SaveState({
				save: async () => {
					const res = await write(current);
					// A server that considered the document and refused is answered
					// once. Only a transport failure is worth sending again, and
					// `saveSessionGuidance` has already turned one into a message.
					return res.ok ? { ok: true } : { ok: false, retryable: false, message: res.message };
				},
				fallbackMessage: 'That guidance was not saved.'
			})
		: null;

	$effect(() => {
		if (!save) return;
		return save.attach();
	});
</script>

<div class="gd" data-testid={testId}>
	<div class="gd-head">
		<span class="gd-label">{label}</span>
		{#if save}
			<SaveIndicator state={save} />
		{/if}
	</div>

	<RichTextEditor
		{value}
		{disabled}
		compact
		{label}
		placeholder="What should they photograph, and what should they write about it?"
		onready={(doc) => {
			current = doc;
			baseline.seed(doc);
			onchange(doc);
			// The baseline, NOT a write: what is on screen is what the server
			// already holds. Without this the field opens `clean` and the first
			// keystroke is the only thing that has ever been true about it.
			save?.markSaved();
		}}
		onchange={(doc) => {
			current = doc;
			onchange(doc);
			// A transaction that did not change the document is not an edit. See
			// `$lib/edit-baseline` for what happens when this is skipped.
			if (!baseline.changed(doc)) return;
			baseline.advance(doc);
			save?.markDirty();
		}}
	/>

	<p class="gd-foot">
		<span class="gd-count" data-state={countState} data-testid="guidance-word-count">
			{guidanceCountLabel(words)}
		</span>
		{#if countState === 'over'}
			<span class="gd-note">
				Past {GUIDANCE_WORD_TARGET} words this stops being the thing in front of a student and
				starts being in the way. It still saves.
			</span>
		{:else if hint}
			<span class="gd-note">{hint}</span>
		{/if}
	</p>
</div>

<style>
	/* `gd-` prefixed: app.css owns a global `.field`, `.row` and `.note`, and an
	   unprefixed class here would inherit a layout nothing asked for. */
	.gd {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.gd-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.gd-label {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.gd-foot {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.gd-count {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.04em;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	/* Read at the POINT OF USE with a fallback, the way Disclosure reads its
	   two room hooks: a declaration on `.gd` would sit on a DESCENDANT of the
	   notebook's wrapper and beat the room's own corrected amber. */
	.gd-count[data-state='over'] {
		color: var(--gd-warn, var(--amber));
	}
	.gd-count[data-state='empty'] {
		color: var(--text-3);
	}
	.gd-note {
		min-width: 0;
	}
	/* AN EDITOR IS NOT PART OF A HANDOUT. The prompt itself prints where it is
	   READ (Disclosure keeps its region in the DOM and prints it); the box
	   somebody types it into, its word counter and its save indicator are
	   chrome. Inert on the notebook side today, where nothing prints. */
	@media print {
		.gd {
			display: none;
		}
	}
</style>
