<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import NoteEditor from '$lib/notebook/NoteEditor.svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import Pending from '$lib/Pending.svelte';
	import { SaveState, type SaveOutcome } from '$lib/save-state.svelte';
	import { EditBaseline, serializeForBaseline } from '$lib/edit-baseline.svelte';
	import { anchored } from '$lib/shell/anchored';
	import { holdDeployReload } from '$lib/shell/deploy-safety';
	import { tiptapHasText, type TiptapNode } from '$lib/notebook-notes';
	import {
		DRAFT_MIRROR_DEBOUNCE_MS,
		QUICK_NOTE_RECORD,
		baselineValue,
		clearMirror,
		draftMirrorKey,
		mirrorHeldMessage,
		mirrorVersionFor,
		planMirrorRestore,
		readMirror,
		writeMirror
	} from '$lib/notebook/draft-mirror';
	import { quickNotePayload, type QuickNoteFiling } from '$lib/notebook/quick-note';
	import {
		quickNoteFlushSettled,
		setQuickNoteWritingEntry,
		trackQuickNoteFlush
	} from '$lib/notebook/quick-note-state.svelte';
	import type { QuickNoteTransports } from '$lib/notebook/quick-note-transports';

	/**
	 * THE QUICK NOTE (ledger 0298, R33): one box in the page header that writes a
	 * private draft into the notebook, from any classroom page or the home page.
	 *
	 * PRESENTATION ONLY. Everything it writes goes through `transports` (the real
	 * mount hands it the notebook's own write routes, `/dev/quick-note` answers in
	 * memory), and where the note is filed arrives as `filing`, decided from the
	 * route by `quickNoteFiling` -- never by this component and never by a guess.
	 *
	 * IT IS A NOTEBOOK NOTE, SO IT KEEPS EVERY NOTEBOOK RULE:
	 *   - the one save state and `SaveIndicator`, autosaving into a DRAFT, which
	 *     0118 keeps invisible to staff (CLAUDE.md's exception for autosaving a
	 *     record nobody else can read);
	 *   - `EditBaseline` as the one "has this been edited" comparison, seeded from
	 *     the editor's own serialization;
	 *   - the draft mirror, keyed per viewer under the reserved `quick` record, so
	 *     a tab that dies takes nothing with it, with the vocabulary check the
	 *     notebook composer runs;
	 *   - a deploy-reload hold while there is writing the server has not got.
	 *
	 * SAVE FINISHES A NOTE; CLOSE DOES NOT. Save flushes, stamps a revision
	 * boundary (`notebook_seal_notes`) and shows where the note went, and the next
	 * one starts fresh. Closing the panel keeps the note in the box and the draft
	 * it is writing into, so a panel closed by accident loses nothing; the note is
	 * already autosaved either way.
	 */
	let {
		viewerId,
		transports,
		filing,
		notebookHref,
		onHide = null,
		onSaved = null,
		triggerClass = '',
		place = 'classroom',
		anchorFallback = null
	}: {
		viewerId: string;
		transports: QuickNoteTransports;
		/** Where a NEW note from this page is filed. A note already being written keeps its own. */
		filing: QuickNoteFiling;
		/** The notebook's Inbox, where every quick note lands. */
		notebookHref: string;
		/** Hides the header control for this viewer. Absent removes the control that does it. */
		onHide?: (() => void) | null;
		/** After Save lands, so a page that lists notebook entries can re-read them. */
		onSaved?: (() => void) | null;
		/** A mount's own header class for the trigger (the home header's `auth-link`). */
		triggerClass?: string;
		place?: 'classroom' | 'home';
		/**
		 * What the panel hangs from when the trigger itself is not on screen --
		 * the classroom header folds the Note control into its Menu on a phone,
		 * and the panel then opens under the Menu button instead of at (0, 0).
		 */
		anchorFallback?: (() => HTMLElement | null | undefined) | null;
	} = $props();

	const panelId = `qn-panel-${Math.random().toString(36).slice(2, 9)}`;
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let panelEl = $state<HTMLElement | null>(null);
	/** Where the panel is hanging from this time: the trigger, or whatever opened it when the trigger is folded away. */
	let anchorEl = $state<HTMLElement | null>(null);

	function onScreen(el: HTMLElement | null | undefined): el is HTMLElement {
		return !!el && el.getClientRects().length > 0;
	}

	let open = $state(false);
	/** The editor is a separate download; it is fetched on the first open, then kept. */
	let everOpened = $state(false);
	let editorKey = $state(0);

	/** The editor's document as it stands, and what to seed a fresh editor with. */
	let doc = $state<TiptapNode | null>(null);
	let seedDoc = $state<TiptapNode | null>(null);
	const baseline = new EditBaseline();

	/**
	 * THE DRAFT THIS NOTE IS WRITING INTO, once the first write has made one.
	 * `filedTo` is captured at that write: a note keeps the class it was started
	 * in even if the student moves to another class before pressing Save.
	 */
	let handle = $state<{ entryId: string; noteId: string | null; unsealed: boolean; adopted: boolean } | null>(null);
	let filedTo = $state<QuickNoteFiling | null>(null);
	/** After Save: where the note went, until the next note is started. */
	let finished = $state<{ where: string } | null>(null);

	let notice = $state<string | null>(null);
	let errorMsg = $state<string | null>(null);
	let busy = $state(false);
	let hideArmed = $state(false);

	const hasText = $derived(tiptapHasText(doc));
	/** Writing the server has not acknowledged: the ONE comparison, against the baseline. */
	const unsaved = $derived(hasText && baseline.changed(doc));
	const where = $derived((filedTo ?? filing).where);

	// ---- the write ------------------------------------------------------------

	function failed(res: { error: string; retryable?: boolean }): SaveOutcome {
		return res.retryable === false
			? { ok: false, retryable: false, message: res.error }
			: { ok: false, retryable: true, message: res.error };
	}

	/**
	 * A RESTORED MIRROR NAMING A DRAFT is adopted only once `draftOpen` answers
	 * (see the restore below). A write that starts before that answer waits for
	 * it, or it would make a second draft of the same words.
	 */
	let adopting: Promise<void> | null = null;

	/** How many times this note has moved to a new draft, and the most it may. */
	let reopened = 0;
	const REOPEN_LIMIT = 3;
	/** Bumped when a note is finished, so an answer about the last one cannot land on the next. */
	let generation = 0;

	/**
	 * IS THE DRAFT THIS NOTE WRITES INTO STILL AN OPEN DRAFT? Asked before every
	 * write into one that already exists (ledger 0298 review). The quick note
	 * keeps its draft until Save, and that same draft sits in the notebook's own
	 * list with a Turn in button. Once it is turned in it is visible to staff, and
	 * an autosave into it appends a staff-visible revision on every burst -- the
	 * one thing CLAUDE.md refuses an autosave -- with the quick note's newest
	 * words becoming the turned-in entry's current content. Deleted, or filed
	 * from the Inbox in another tab, it is in Recently deleted, where the writing
	 * would go on landing unseen. So `false` moves the writing to a new draft;
	 * `'unknown'` writes where it was, and that write reports its own failure.
	 *
	 * Not asked while the page is hidden: that is the pagehide flush, which must
	 * start its request at once. And the limit is a circuit breaker for the one
	 * way this could go wrong systematically (a check that always answered no
	 * would otherwise mint a draft per autosave): past it the note writes where
	 * it is.
	 */
	async function draftStillOpen(entryId: string): Promise<boolean> {
		if (reopened >= REOPEN_LIMIT) return true;
		if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return true;
		return (await transports.draftOpen(entryId)) !== false;
	}

	/**
	 * ONE WRITE OF WHATEVER IS IN THE BOX NOW. The first creates the draft,
	 * every later one edits its note chain with `autosave` so the database may
	 * replace the head revision instead of appending one (0129).
	 */
	async function persist(): Promise<SaveOutcome> {
		if (adopting) await adopting;
		const content = doc;
		if (!content || !tiptapHasText(content) || !baseline.changed(content)) return { ok: true };
		if (handle && !(await draftStillOpen(handle.entryId))) {
			reopened += 1;
			handle = null;
			setQuickNoteWritingEntry(null);
			notice =
				'The draft this note was writing into has been turned in or moved, so the note carries on as a new draft.';
		}
		if (!handle) {
			const target = filedTo ?? filing;
			const res = await transports.createNote(quickNotePayload(target, content));
			if (!res.ok) return failed(res);
			filedTo = target;
			handle = { entryId: res.entryId, noteId: res.noteId ?? null, unsealed: true, adopted: false };
			setQuickNoteWritingEntry(res.entryId);
		} else if (!handle.noteId) {
			const res = await transports.addNote(handle.entryId, content, true);
			if (!res.ok) return failed(res);
			handle = { ...handle, noteId: res.noteId ?? null, unsealed: true };
		} else {
			const res = await transports.editNote(handle.noteId, content, true);
			if (!res.ok) {
				/**
				 * A RESTORED HANDLE THE SERVER REFUSES is a draft that stopped being
				 * this note's to write into (turned in, or its note deleted, in another
				 * tab). The writing is kept and goes into a new draft, once; a refusal
				 * of a handle this session made itself is reported as it is.
				 */
				if (res.retryable === false && handle.adopted) {
					handle = null;
					return persist();
				}
				return failed(res);
			}
			handle = { ...handle, unsealed: true };
		}
		baseline.advance(content);
		// THE MIRROR FOLLOWS THE ACKNOWLEDGEMENT AT ONCE, never a debounce later:
		// in that gap a remount would restore words the server already holds and
		// write them into a second draft. This also runs for a write that lands
		// after this instance was unmounted, which is when it matters most.
		syncMirrorNow();
		return { ok: true };
	}

	const save = new SaveState({
		fallbackMessage: 'Your note was not saved.',
		save: persist
	});

	/**
	 * The durability net, living and dying with this instance. LEAVING THE PAGE
	 * THIS HEADER BELONGS TO (the home page for a class, say) unmounts it: what
	 * is owed is sent FIRST -- `saveNow` starts the request synchronously, before
	 * the machine is destroyed -- and the mirror keeps anything it does not land.
	 *
	 * THE MIRROR IS WRITTEN HERE, SYNCHRONOUSLY, BEFORE THAT (ledger 0298 review).
	 * Its own debounce is cancelled by the unmount, so without this line the slot
	 * holds the box as it was up to 400ms ago; the next mount (the classroom
	 * header after the home page's, say) restored those older words and its
	 * autosave then wrote them over the newer ones the flush had just sent. And
	 * the flush is recorded (`trackQuickNoteFlush`) so that next mount reads the
	 * slot only once this write has landed and brought it up to date.
	 *
	 * THE SAME HOLDS WHEN THE TAB GOES AWAY rather than the header: a tab closed
	 * or hidden inside the 400ms leaves a slot older than the flush `attach()`
	 * sends, and the next load's restore would write those older words back
	 * over it. So a hidden tab and a pagehide write the slot at once too, after
	 * that flush has started (its listeners were added first).
	 */
	$effect(() => {
		const detach = save.attach();
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') syncMirrorNow();
		};
		const onPageHide = () => syncMirrorNow();
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pagehide', onPageHide);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pagehide', onPageHide);
			if (unsaved) save.markDirty();
			if (save.dirty) {
				syncMirrorNow();
				trackQuickNoteFlush(save.saveNow());
			}
			detach();
			setQuickNoteWritingEntry(null);
		};
	});

	// Track the one input; untrack the calls, which read the phase they write.
	$effect(() => {
		const due = unsaved;
		untrack(() => {
			if (due) save.markDirty();
			else if (save.phase === 'dirty') save.reset();
		});
	});

	/**
	 * A FULL PAGE LOAD WOULD TAKE THE WRITING WITH IT, so a new version of the
	 * site waits while there is any (CLAUDE.md, deploy safety). The mirror would
	 * put it back; not needing it is better.
	 */
	$effect(() => {
		if (!(unsaved || save.dirty)) return;
		return untrack(() => holdDeployReload('writing a quick note'));
	});

	// ---- the mirror -----------------------------------------------------------

	const mirrorKey = $derived(draftMirrorKey(viewerId, QUICK_NOTE_RECORD));
	let mirrorChecked = $state(false);
	let mirrorHeldKey = $state<string | null>(null);
	let mirrorUnavailable = $state(false);
	let mirrorTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * PUT BACK WHAT THIS BROWSER KEPT, once, on mount -- the composer's own
	 * decision (`planMirrorRestore`), asked with no entry in hand. A mirror
	 * naming a draft keeps writing into it only after `draftOpen` says it is
	 * still this viewer's open draft; otherwise the writing goes into a new one.
	 * The restored writing then saves itself, which is the point.
	 *
	 * IT WAITS FOR A QUICK NOTE THIS TAB JUST UNMOUNTED to finish writing
	 * (`quickNoteFlushSettled`), because that write is what brings the slot up to
	 * date; the editor is not drawn until this pass is done (`mirrorChecked`), so
	 * nothing typed into a fresh box can be replaced by a restore arriving late.
	 */
	onMount(() => {
		let live = true;
		void quickNoteFlushSettled().then(() => {
			if (!live) return;
			restoreFromMirror();
			mirrorChecked = true;
		});
		return () => {
			live = false;
		};
	});

	function restoreFromMirror() {
		const key = mirrorKey;
		const found = readMirror(key, Date.now());
		if (found) {
			const plan = planMirrorRestore(found, undefined);
			if (plan.action === 'drop') clearMirror(key);
			else if (plan.action === 'hold') {
				mirrorHeldKey = key;
				notice = mirrorHeldMessage();
				console.warn('[quick note] a mirror was held rather than restored:', plan.unknown.join(', '));
			} else {
				doc = found.doc;
				seedDoc = found.doc;
				baseline.seed(baselineValue(found));
				filedTo = {
					sectionId: found.sectionId,
					customLabel: found.title || null,
					where:
						found.sectionId && found.sectionId === filing.sectionId
							? filing.where
							: found.sectionId
								? 'the class it was started in'
								: 'your notebook Inbox'
				};
				notice = 'Your unsaved quick note was put back from this browser.';
				const entryId = found.entryId;
				if (entryId) {
					const gen = generation;
					adopting = transports
						.draftOpen(entryId)
						.then(
							(open) => {
								if (open === true && !handle && gen === generation) {
									handle = { entryId, noteId: found.noteId, unsealed: true, adopted: true };
									setQuickNoteWritingEntry(entryId);
								}
							},
							() => undefined
						)
						.then(() => {
							adopting = null;
						});
				}
			}
		}
	}

	/**
	 * THE SLOT, BROUGHT UP TO DATE NOW rather than a debounce later: cleared when
	 * the server holds what is in the box, written (with the draft it names) when
	 * it does not. Called beside every acknowledgement and on the way out. A held
	 * slot is never touched, and nothing is written before the restore pass has
	 * read the slot.
	 */
	function syncMirrorNow() {
		if (!mirrorChecked) return;
		const key = draftMirrorKey(viewerId, QUICK_NOTE_RECORD);
		if (key === mirrorHeldKey) return;
		if (mirrorTimer !== null) clearTimeout(mirrorTimer);
		mirrorTimer = null;
		const d = doc;
		if (!d || !tiptapHasText(d) || !baseline.changed(d)) {
			clearMirror(key);
			return;
		}
		const target = filedTo ?? filing;
		const result = writeMirror(key, {
			v: mirrorVersionFor(d),
			at: Date.now(),
			entryId: handle?.entryId ?? null,
			noteId: handle?.noteId ?? null,
			doc: d,
			baseline: baseline.serial ?? serializeForBaseline(null),
			title: target.customLabel ?? '',
			sessionId: null,
			sectionId: target.sectionId,
			folderId: null
		});
		mirrorUnavailable = result !== 'ok';
	}

	/**
	 * MIRROR THE BOX, DEBOUNCED, WHILE THERE IS WRITING THE SERVER HAS NOT GOT,
	 * and clear the slot the moment there is not. It waits for the restore pass,
	 * or its first run would clear the slot that pass is about to read.
	 */
	$effect(() => {
		if (!mirrorChecked) return;
		const due = unsaved;
		const d = doc;
		const key = mirrorKey;
		const held = mirrorHeldKey;
		const h = handle;
		const target = filedTo ?? filing;
		const serial = baseline.serial;
		if (mirrorTimer !== null) clearTimeout(mirrorTimer);
		mirrorTimer = null;
		if (key === held) return;
		mirrorTimer = setTimeout(() => {
			mirrorTimer = null;
			if (!due || !d) {
				clearMirror(key);
				return;
			}
			const result = writeMirror(key, {
				v: mirrorVersionFor(d),
				at: Date.now(),
				entryId: h?.entryId ?? null,
				noteId: h?.noteId ?? null,
				doc: d,
				baseline: serial ?? serializeForBaseline(null),
				title: target.customLabel ?? '',
				sessionId: null,
				sectionId: target.sectionId,
				folderId: null
			});
			mirrorUnavailable = result !== 'ok';
		}, DRAFT_MIRROR_DEBOUNCE_MS);
		return () => {
			if (mirrorTimer !== null) clearTimeout(mirrorTimer);
			mirrorTimer = null;
		};
	});

	// ---- the editor -----------------------------------------------------------

	function onEditorReady(ready: TiptapNode) {
		// A fresh note: the reference is what the editor opened on. A restored one
		// keeps the reference the mirror recorded, so it still reads as unsaved.
		if (!baseline.seeded) baseline.seed(ready);
		if (!doc) doc = ready;
	}

	function onEditorChange(next: TiptapNode) {
		doc = next;
		errorMsg = null;
	}

	// ---- open, close, finish --------------------------------------------------

	/** Open the panel, hanging it from `from` when that is on screen (a Menu item), else from the trigger. */
	export async function openPanel(from?: HTMLElement | null) {
		anchorEl = [from, triggerEl, anchorFallback?.()].find(onScreen) ?? triggerEl;
		open = true;
		everOpened = true;
		hideArmed = false;
		await tick();
		focusInside();
	}

	function focusInside() {
		const target =
			panelEl?.querySelector<HTMLElement>('.note-input, [data-testid="note-editor-plain"]') ??
			panelEl?.querySelector<HTMLElement>('[data-qn-focus]');
		target?.focus();
	}

	function closePanel() {
		const hadFocus = !!panelEl?.contains(document.activeElement);
		open = false;
		hideArmed = false;
		if (finished) startFresh();
		if (hadFocus) (onScreen(triggerEl) ? triggerEl : anchorEl)?.focus();
	}

	function toggle() {
		if (open) closePanel();
		else void openPanel();
	}

	function startFresh() {
		finished = null;
		handle = null;
		filedTo = null;
		doc = null;
		seedDoc = null;
		notice = null;
		errorMsg = null;
		baseline.clear();
		save.reset();
		editorKey += 1;
		reopened = 0;
		adopting = null;
		generation += 1;
		setQuickNoteWritingEntry(null);
	}

	/**
	 * SAVE: send what is owed, stamp the boundary, and say where it went. A write
	 * that did not land leaves everything where it is, with the indicator saying
	 * why and Retry beside it.
	 */
	async function saveAndFinish() {
		if (busy) return;
		if (!hasText && !handle) {
			errorMsg = 'Write something first.';
			return;
		}
		busy = true;
		errorMsg = null;
		try {
			await save.saveNow();
			if (save.failed || unsaved) return;
			if (handle?.unsealed) {
				// The note is saved whatever this answers; the boundary only stops the
				// next autosave into the same draft writing over this version.
				const sealed = await transports.sealNotes(handle.entryId);
				if (!sealed.ok) console.warn('[quick note] the revision boundary was not stamped:', sealed.error);
			}
			const went = where;
			clearMirror(mirrorKey);
			startFresh();
			finished = { where: went };
			onSaved?.();
			await tick();
			panelEl?.querySelector<HTMLElement>('[data-qn-focus]')?.focus();
		} finally {
			busy = false;
		}
	}

	async function writeAnother() {
		startFresh();
		await tick();
		focusInside();
	}

	function onPanelKey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			closePanel();
		}
	}
</script>

<span class="qn" class:qn-home={place === 'home'} data-testid="quick-note">
	<button
		type="button"
		class="qn-trigger {triggerClass}"
		class:qn-default={!triggerClass}
		aria-expanded={open}
		aria-controls={panelId}
		data-testid="qn-trigger"
		bind:this={triggerEl}
		onclick={toggle}
	>
		<svg class="qn-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" /></svg>
		<span class="qn-word">Note</span>
		{#if save.failed}<span class="qn-flag" aria-hidden="true">!</span><span class="qn-sr">(not saved)</span>{/if}
	</button>

	<div
		class="qn-panel"
		id={panelId}
		role="dialog"
		aria-label="Quick note"
		tabindex="-1"
		hidden={!open}
		data-testid="qn-panel"
		bind:this={panelEl}
		onkeydown={onPanelKey}
		use:anchored={{ anchor: anchorEl ?? triggerEl, open, prefer: 'below', align: 'end' }}
	>
		<div class="qn-head">
			<h2 class="qn-title">Quick note</h2>
			<button type="button" class="qn-btn qn-close" data-testid="qn-close" onclick={closePanel}>Close</button>
		</div>

		{#if finished}
			<p class="qn-done" data-testid="qn-done" role="status">
				Saved to {finished.where}. It stays private until you turn it in.
			</p>
			<div class="qn-actions">
				<button type="button" class="qn-btn qn-primary" data-qn-focus data-testid="qn-another" onclick={writeAnother}>
					Write another
				</button>
				<a class="qn-btn" href={notebookHref} data-testid="qn-open-notebook" onclick={closePanel}>Open notebook</a>
			</div>
		{:else}
			{#if everOpened && !mirrorChecked}
				<Pending label="Opening your note" />
			{:else if everOpened}
				{#key editorKey}
					<NoteEditor
						{viewerId}
						initialDoc={seedDoc}
						label="Quick note"
						placeholder="Write a note..."
						onchange={onEditorChange}
						onready={onEditorReady}
					/>
				{/key}
			{/if}
			<p class="qn-where" data-testid="qn-where">Private draft, saved to {where}</p>
			{#if notice}<p class="qn-note" data-testid="qn-notice">{notice}</p>{/if}
			{#if mirrorUnavailable}
				<p class="qn-note">
					This browser is not keeping a backup copy while you type. Your note still saves as you write.
				</p>
			{/if}
			{#if errorMsg}<p class="qn-error" role="alert" data-testid="qn-error">{errorMsg}</p>{/if}
			<div class="qn-actions">
				<SaveIndicator state={save} />
				<button
					type="button"
					class="qn-btn qn-primary"
					data-testid="qn-save"
					aria-disabled={busy || (!hasText && !handle)}
					onclick={saveAndFinish}
				>
					{busy ? 'Saving...' : 'Save'}
				</button>
				<a class="qn-btn" href={notebookHref} data-testid="qn-open-notebook" onclick={closePanel}>Open notebook</a>
			</div>
		{/if}

		{#if onHide}
			<div class="qn-foot">
				{#if hideArmed}
					<span class="qn-foot-text">Hide the Note button? Turn it back on from your notebook's Inbox.</span>
					<button type="button" class="qn-btn" data-testid="qn-hide-confirm" onclick={() => onHide?.()}>Hide it</button>
					<button type="button" class="qn-btn" onclick={() => (hideArmed = false)}>Keep it</button>
				{:else}
					<button type="button" class="qn-link" data-testid="qn-hide" onclick={() => (hideArmed = true)}>
						Hide this button
					</button>
				{/if}
			</div>
		{/if}
	</div>
</span>

<style>
	.qn {
		display: inline-flex;
		align-items: center;
		flex: none;
	}

	/* THE CLASSROOM HEADER'S TOOL SHAPE, spelled from the same tokens as
	   `.shell-tool`: a glyph and a word, 44px, the load-bearing edge. A mount
	   with its own header class passes it instead (`triggerClass`). */
	.qn-trigger.qn-default {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		padding: 0 0.7rem;
		box-sizing: border-box;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font: inherit;
		font-size: 0.86rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.qn-trigger.qn-default:hover,
	.qn-trigger.qn-default[aria-expanded='true'] {
		border-color: var(--gold);
	}
	.qn-trigger {
		gap: 0.4rem;
	}
	.qn-glyph {
		flex: none;
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.qn-default .qn-glyph {
		color: var(--text-2);
	}
	/* ON A PHONE THE HOME HEADER'S FIRST ROW IS 35px TALL, and a 44px box beside
	   the profile menu grew the whole banner by 10px (measured 106.2 to 116.2 at
	   375). So there it paints 34px, as the profile menu's own trigger does in
	   the same row, and reaches 44 through `.tap-reach-44`, which the mount
	   passes in `triggerClass`. Above 520px the header is one 64px row and the
	   44px box costs nothing. */
	@media (max-width: 520px) {
		.qn-home .qn-trigger {
			min-height: 34px;
		}
	}
	/* AND BETWEEN 521 AND 899px THE HOME HEADER HAS NO ROOM FOR IT AT ALL, so it
	   is not drawn there -- the rule the lines-of-code readout already follows in
	   the same header ("hidden, rather than shipped at a cost the constraint
	   forbids"). Measured on /dev/home-order with one class: the banner went
	   133.1 to 186.7px at 521, 75.5 to 135.5 at 700, 64 to 105 at 871, and held
	   at 64 from 900 up. The actions row there is the class chip (216.9px), Take
	   the tour, and the profile menu; there is nothing to fold it into. Every
	   classroom and notebook page keeps the control at every width. */
	@media (min-width: 521px) and (max-width: 899.98px) {
		.qn-home {
			display: none;
		}
	}
	.qn-home .qn-glyph {
		width: 14px;
		height: 14px;
		margin-right: 0.35rem;
	}
	.qn-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
	.qn-flag {
		font-family: var(--font-mono);
		font-weight: 700;
		color: var(--status-danger, var(--crimson));
	}

	/* THE PANEL: a notepad under the header, never over a row until somebody
	   opens it. `anchored` places it (fixed, flipped and clamped to the
	   viewport); these rules are its size and its ground. */
	.qn-panel {
		position: absolute;
		z-index: 60;
		width: min(26rem, calc(100vw - 16px));
		max-height: min(34rem, calc(100vh - 90px));
		overflow-y: auto;
		box-sizing: border-box;
		padding: var(--space-3, 0.75rem);
		background: var(--surface-1);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		box-shadow: var(--elevation-2);
		text-align: left;
		font-family: var(--font-display);
		letter-spacing: normal;
		text-transform: none;
	}
	.qn-panel[hidden] {
		display: none;
	}
	.qn-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.qn-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-1);
	}
	.qn-where,
	.qn-note,
	.qn-done,
	.qn-error {
		margin: 0.5rem 0 0;
		font-size: 0.86rem;
		line-height: 1.4;
	}
	.qn-where {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.qn-note {
		color: var(--text-2);
	}
	.qn-error {
		color: var(--status-danger, var(--crimson));
	}
	.qn-done {
		color: var(--text-1);
	}
	.qn-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.qn-btn {
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0 0.8rem;
		box-sizing: border-box;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font: inherit;
		font-size: 0.86rem;
		text-decoration: none;
		cursor: pointer;
		white-space: nowrap;
	}
	.qn-btn:hover {
		border-color: var(--gold);
		text-decoration: none;
	}
	.qn-primary {
		border-color: var(--green);
	}
	.qn-btn[aria-disabled='true'] {
		opacity: 0.6;
		cursor: default;
	}
	.qn-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.6rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--hairline);
	}
	.qn-foot-text {
		font-size: 0.8rem;
		color: var(--text-2);
		flex: 1 1 12rem;
	}
	.qn-link {
		appearance: none;
		min-height: 44px;
		padding: 0 0.2rem;
		background: none;
		border: none;
		color: var(--text-2);
		font: inherit;
		font-size: 0.8rem;
		text-decoration: underline;
		text-underline-offset: 0.2em;
		cursor: pointer;
	}
	.qn-link:hover {
		color: var(--text-1);
	}
</style>
