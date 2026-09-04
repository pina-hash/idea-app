<script lang="ts">
	import Disclosure from '$lib/Disclosure.svelte';
	import ReferenceDoc from '$lib/classroom/ReferenceDoc.svelte';
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import { dropTarget, matchesAccept } from '$lib/file-drop';
	import {
		validateSpec,
		type AssignmentSpec,
		type AssignmentTeacherTransports
	} from '$lib/classroom/assignment-spec';
	import {
		referenceHref,
		validateReferenceSpec,
		type ReferenceSpec,
		type ReferenceTransports
	} from '$lib/classroom/reference-spec';

	/**
	 * ONE importer for both kinds of spec: the interactive assignment spec and
	 * the reference document.
	 *
	 * WHAT THIS REPLACED. SpecImport and ReferenceTools were near-identical
	 * files -- the same paste box, the same upload control, the same validate
	 * step, the same error list, the same summary line, the same remove
	 * confirm, and about a hundred lines of the same CSS each -- differing only
	 * in which validator they called and which RPC they wrote through. Two
	 * copies of one flow is how one of them quietly stops matching the other,
	 * and they had already started to (one said "Attach spec", the other
	 * "Attach document"; one carried a staging mode the other did not). They
	 * are gone; `kind` is the difference now.
	 *
	 * WHAT `kind` ACTUALLY SWITCHES, and it is deliberately little: which
	 * validator runs, which RPC commits, which renderer previews, and the
	 * vocabulary. Everything else -- the debounce, the problem list, the
	 * preview, the commit, the remove confirm -- is one implementation.
	 *
	 * ONE ACTION, NOT THREE. Paste or upload; validation runs on its own after
	 * a short pause; problems appear inline as you type; a live preview renders
	 * below; Publish commits. The old flow made you press Validate, and then --
	 * this is the part that made it hostile -- disabled the commit button again
	 * on the next keystroke, so fixing a typo you noticed after validating meant
	 * pressing Validate a second time before you could save at all. There is no
	 * Validate button here and no such state: the button reflects whether what
	 * is in the box is publishable RIGHT NOW.
	 *
	 * THE PREVIEW IS THE REAL RENDERER. SpecRenderer in readonly mode for an
	 * assignment, ReferenceDoc in preview mode for a document -- the same
	 * components students read, not a summary of them. A preview drawn by
	 * anything else would agree with the real page right up until it did not.
	 *
	 * THE SERVER IS STILL THE BOUNDARY. _classroom_check_spec and
	 * _classroom_check_reference_spec re-validate everything in SQL on every
	 * write, unchanged; both RPCs are granted to `authenticated` and reachable
	 * straight through PostgREST, so this component is a courtesy that shows
	 * every problem at once rather than a gate. A server refusal renders into
	 * the SAME inline problem list -- there is one place problems appear, and a
	 * teacher does not have to learn which kind of problem shows up where.
	 *
	 * THE LIST CARRIES TWO TIERS, AND ONLY ONE OF THEM GATES. An ERROR means
	 * the spec is not publishable and the button is off. A WARNING is advice --
	 * an instructions module over the 250-word authoring target is the first of
	 * them -- and it changes nothing about whether Publish works: the "Valid:"
	 * line still renders beside it, so a teacher can see at a glance that they
	 * are being told something rather than stopped. The two are told apart by a
	 * WORD as well as a colour, because colour is never the only signal.
	 *
	 * THE APP IS A ROUTE TO ITS OWN DATA. Until this bundle it was not: the
	 * attached spec was described by a summary line (title, id, module count,
	 * points) and the JSON itself was rendered NOWHERE in the application. The
	 * only way to read it was the GitHub export under `materials/`, which an
	 * instructor teaching the course does not necessarily have and which
	 * nothing on screen mentions. So a teacher who did not author a spec could
	 * not read it, could not copy it, and -- because "Replace spec" opened an
	 * EMPTY box -- could not change one word of it without first finding the
	 * original somewhere outside the app. Three things follow from that, and
	 * they are one feature rather than three:
	 *
	 *   1. THE JSON IS ON THE PAGE, in a collapsed Disclosure under the summary
	 *      line. Collapsed because a spec is tens of kilobytes and the person is
	 *      here to manage an item, not to read JSON; present because "there is a
	 *      document here and this is it" is the whole defect.
	 *   2. ONE PRESS COPIES IT, from the always-visible action row rather than
	 *      from inside the panel, so reading it and taking it are separate jobs.
	 *   3. THE EDITOR OPENS ON WHAT IS ATTACHED, so replacing a spec starts from
	 *      the spec rather than from nothing.
	 *
	 * IT IS SERIALIZED FROM THE STORED OBJECT, WHICH IS NOT THE AUTHORED BYTES.
	 * `spec` arrives as the row's jsonb, so key order and whitespace are
	 * Postgres's rather than the author's. It is the same document -- it
	 * validates, it republishes, it is what an AI tool should be handed -- but
	 * it is not a byte-for-byte copy of the file somebody once pasted, and
	 * nothing here should claim otherwise.
	 *
	 * SEEDING MAKES AN ACCIDENTAL REPUBLISH POSSIBLE, SO ONE IS REFUSED. An
	 * empty box could not overwrite anything by accident; a seeded one is one
	 * stray click away from writing a revision that changes nothing, which is
	 * exactly the "a save that changed nothing is not an edit" case the item
	 * page already cares about. The guard is a COMPARISON and not a flag:
	 * `EditBaseline` records what the box opened on and answers whether it has
	 * moved off it, so "is there content in here" can never be mistaken for
	 * "has this been edited" (the presence-of-state bug, which is why that class
	 * exists). ONE predicate -- `publishReady` -- drives both the control and
	 * the handler, and the control is `aria-disabled` rather than `disabled` so
	 * that pressing it explains itself instead of doing nothing.
	 */

	type ImporterKind = 'assignment' | 'reference';
	type AnySpec = AssignmentSpec | ReferenceSpec;

	let {
		kind,
		itemId = null,
		spec = null,
		staged = null,
		transports = null,
		isPublic = false,
		attachmentCount = 0,
		onstage = null,
		onchanged = null
	}: {
		kind: ImporterKind;
		/**
		 * Null means STAGING: the item does not exist yet (the composer, creating
		 * something), so there is nothing to attach to. The validated JSON is
		 * handed back through `onstage` and the composer attaches it the moment
		 * the create call returns an id.
		 */
		itemId?: string | null;
		/** The currently attached spec, if any. */
		spec?: AnySpec | null;
		/** A spec already staged for the next save, in staging mode. */
		staged?: AnySpec | null;
		transports?: AssignmentTeacherTransports | ReferenceTransports | null;
		/** Reference only: the public flag, and what the confirm has to name. */
		isPublic?: boolean;
		attachmentCount?: number;
		onstage?: ((raw: unknown | null) => void) | null;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	const isReference = $derived(kind === 'reference');
	const stagingMode = $derived(!itemId);
	/** What the summary line describes: attached, or waiting to be. */
	const shown = $derived(staged ?? spec);

	const words = $derived(
		isReference
			? { noun: 'document', Noun: 'Document', publish: 'Publish document' }
			: { noun: 'spec', Noun: 'Spec', publish: 'Publish spec' }
	);

	let open = $state(false);
	let raw = $state('');
	/** One line in the inline list. `tone` is the only thing that differs. */
	type Problem = { tone: 'error' | 'warning'; text: string };

	let problems = $state<Problem[]>([]);
	/** Errors alone decide whether anything is publishable. Warnings never do. */
	const blocking = $derived(problems.some((p) => p.tone === 'error'));
	let parsed = $state<AnySpec | null>(null);
	let busy = $state(false);
	let notice = $state<string | null>(null);
	let armRemove = $state(false);
	let armPublic = $state(false);

	/**
	 * THE ATTACHED DOCUMENT AS TEXT -- the one serialization, read by the
	 * viewer, the copy control and the seed alike. Three spellings of "the
	 * spec as JSON" is how the panel comes to show one thing and the clipboard
	 * to carry another.
	 */
	const specJsonText = $derived(shown ? JSON.stringify(shown, null, 2) : '');
	const specJsonStats = $derived.by(() => {
		if (!specJsonText) return '';
		const lines = specJsonText.split('\n').length;
		const kb = specJsonText.length / 1024;
		return `${lines} lines · ${kb < 1 ? `${specJsonText.length} chars` : `${kb.toFixed(1)} kB`}`;
	});

	/** What the box opened on, so a real edit can be told from a seeding. */
	const baseline = new EditBaseline();
	/** Seeded, and not yet moved off the seed: publishing would change nothing. */
	const seededUnchanged = $derived(baseline.seeded && !baseline.changed(raw));
	/**
	 * The ONE answer to "would pressing Publish do anything". The button reads
	 * it and so does the handler; two spellings of this is what produces a
	 * click that silently does nothing.
	 */
	const publishReady = $derived(!!parsed && !busy && !seededUnchanged);

	type CopyNote = { tone: 'ok' | 'error'; text: string };
	let copyNote = $state<CopyNote | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;
	/**
	 * A clipboard the browser refused. It opens the JSON panel, because the
	 * refusal's advice -- select it yourself -- is only true if the text is
	 * actually on screen. It survives until the next copy attempt: a refusal
	 * that faded out would leave a reader who looked away believing the copy
	 * worked.
	 */
	let copyRefused = $state(false);

	// The flag lives on the row, but the toggle has to reflect a just-made
	// change before the page reloads, so it tracks locally from the RPC's answer.
	let publicNow = $state(isPublic);
	$effect(() => {
		publicNow = isPublic;
	});

	/**
	 * Validation runs on a short debounce rather than per keystroke.
	 *
	 * A real spec is tens of kilobytes of JSON and the reference validator walks
	 * every block of every section, so validating mid-paste on each input event
	 * is work nobody is waiting for. 250ms is long enough that typing does not
	 * fight it and short enough that it feels like the box is answering rather
	 * than being asked.
	 */
	const VALIDATE_DEBOUNCE_MS = 250;
	let timer: ReturnType<typeof setTimeout> | null = null;

	function validateNow(text: string) {
		notice = null;
		const trimmed = text.trim();
		if (!trimmed) {
			problems = [];
			parsed = null;
			return;
		}
		let json: unknown;
		try {
			json = JSON.parse(trimmed);
		} catch (e) {
			problems = [{ tone: 'error', text: `Not valid JSON: ${(e as Error).message}` }];
			parsed = null;
			return;
		}
		const result = isReference ? validateReferenceSpec(json) : validateSpec(json);
		// Errors first: what stops the publish is what a teacher should read
		// first, and a warning under it reads as the aside it is. The reference
		// validator has no warning tier yet, so `?? []` is its normal answer
		// rather than a defensive guard.
		const warnings = 'warnings' in result ? (result.warnings ?? []) : [];
		problems = [
			...result.errors.map((text): Problem => ({ tone: 'error', text })),
			...warnings.map((text): Problem => ({ tone: 'warning', text }))
		];
		parsed = (result.spec as AnySpec | null) ?? null;
	}

	function queueValidate() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			validateNow(raw);
		}, VALIDATE_DEBOUNCE_MS);
	}

	/**
	 * Everything the debounce is still holding, applied at once.
	 *
	 * Publish calls this first: a teacher who pastes and immediately presses
	 * the button must not be told there is nothing to publish because a 250ms
	 * timer has not fired yet.
	 */
	function flushValidation() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		validateNow(raw);
	}

	$effect(() => {
		return () => {
			if (timer) clearTimeout(timer);
			if (copyTimer) clearTimeout(copyTimer);
		};
	});

	/**
	 * WHAT THIS IMPORT ACCEPTS, WRITTEN ONCE -- the same string is the
	 * `<input accept>` and the drop rule, so the picker and the drop cannot
	 * come to disagree about what a spec file is.
	 */
	const SPEC_ACCEPT = '.json,application/json';
	/** Said out loud when a drop was refused, so nothing appears to do nothing. */
	let dropNote = $state<string | null>(null);
	let dropActive = $state(false);

	/**
	 * ONE FILE, READ AS TEXT INTO THE BOX, whichever way it arrived, so a
	 * dragged spec is checked, previewed and published through exactly the path
	 * an uploaded one already was.
	 */
	async function takeSpecFile(file: File) {
		raw = await file.text();
		dropNote = null;
		// An upload is a single deliberate action, so it answers immediately
		// rather than making the reader wait out a debounce they did not cause.
		flushValidation();
	}

	async function pickFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		await takeSpecFile(file);
	}

	/**
	 * A DROP OF A SPEC FILE. First file only: there is one box, and a second
	 * file would silently replace the first.
	 *
	 * NO PASTE PATH, DELIBERATELY, AND IT MATTERS MOST HERE. This component is
	 * mounted INSIDE `ContentComposer`, whose own `onpaste` stages a pasted
	 * screenshot onto the item's attachments. A paste bubbles, and `claimPaste`
	 * makes the first handler to ask the OWNER of the event -- so a drop target
	 * here that claimed an image and then refused it for not being JSON would
	 * silently swallow screenshots pasted anywhere inside this panel. It cannot:
	 * `filesFromClipboard` yields `image/*` items only, `accept` refuses every
	 * one of them, and the controller does not claim an event with nothing left
	 * in it. Pasting spec TEXT into the textarea is untouched -- it is the
	 * primary way to use this surface and the placeholder says so.
	 */
	function droppedSpec(files: File[]) {
		if (files.length > 0) void takeSpecFile(files[0]);
		if (files.length > 1) {
			dropNote = `Read ${files[0].name}. Drop one file at a time; the others were ignored.`;
		}
	}

	function refusedSpec(files: File[]) {
		const names = files.map((f) => f.name).filter(Boolean);
		dropNote =
			names.length === 1
				? `${names[0]} is not a .json file. Drop the spec JSON, or paste it into the box.`
				: `Those ${files.length} files are not .json. Drop the spec JSON, or paste it into the box.`;
	}

	function commitSpec(value: unknown): Promise<{ ok: boolean; message?: string }> {
		if (isReference) {
			return (transports as ReferenceTransports).setReferenceSpec(
				itemId as string,
				value as ReferenceSpec | null
			) as Promise<{ ok: boolean; message?: string }>;
		}
		return (transports as AssignmentTeacherTransports).setSpec(
			itemId as string,
			value as AssignmentSpec | null
		) as Promise<{ ok: boolean; message?: string }>;
	}

	function clearEditor() {
		open = false;
		raw = '';
		parsed = null;
		problems = [];
		// The box no longer holds what it opened on, so there is nothing to
		// compare against. Leaving a stale baseline standing would make the
		// NEXT thing typed in here look unchanged from a document it never
		// opened on.
		baseline.clear();
	}

	/**
	 * OPEN THE EDITOR ON WHAT IS ATTACHED.
	 *
	 * Only when the box is EMPTY. Closing the editor has never discarded a
	 * draft, and seeding over one would throw away work somebody left there on
	 * purpose -- the seed is for opening on nothing, which is the case the
	 * defect was about.
	 *
	 * `flushValidation` rather than `queueValidate`: this is a single
	 * deliberate press, so the box answers immediately rather than making the
	 * reader wait out a debounce they did not cause, exactly as an upload does.
	 */
	function toggleEditor() {
		if (open) {
			open = false;
			return;
		}
		open = true;
		if (!specJsonText || raw.trim()) return;
		raw = specJsonText;
		flushValidation();
		baseline.seed(specJsonText);
	}

	/**
	 * A LAST RESORT, NOT A PREFERENCE. The async clipboard is refused on an
	 * insecure origin and by a dismissed permission prompt, both of which are
	 * ordinary; a selected off-screen textarea is still reachable in several
	 * of those cases. Returns whether it actually worked, because the whole
	 * point here is that a copy which did not happen must not be reported as
	 * one.
	 */
	function copyBySelection(text: string): boolean {
		if (typeof document === 'undefined') return false;
		const scratch = document.createElement('textarea');
		scratch.value = text;
		scratch.setAttribute('readonly', '');
		scratch.style.position = 'fixed';
		scratch.style.top = '0';
		scratch.style.opacity = '0';
		document.body.appendChild(scratch);
		let ok = false;
		try {
			scratch.select();
			ok = document.execCommand('copy') === true;
		} catch {
			ok = false;
		}
		document.body.removeChild(scratch);
		return ok;
	}

	/**
	 * THE REFUSAL IS THE INTERESTING HALF. A copy control that silently does
	 * nothing where the clipboard is unavailable is worse than no control at
	 * all: the reader walks away believing they are holding the spec. So every
	 * path here ends in a sentence -- the success one times out, the refusal
	 * one does not, and the refusal also opens the panel so that "select it
	 * yourself" names something the reader can actually see.
	 */
	async function copyJson() {
		if (!specJsonText) return;
		if (copyTimer) {
			clearTimeout(copyTimer);
			copyTimer = null;
		}
		let ok = false;
		try {
			if (navigator?.clipboard?.writeText) {
				await navigator.clipboard.writeText(specJsonText);
				ok = true;
			}
		} catch {
			ok = false;
		}
		if (!ok) ok = copyBySelection(specJsonText);

		if (ok) {
			copyRefused = false;
			copyNote = { tone: 'ok', text: `Copied. ${specJsonStats}.` };
			copyTimer = setTimeout(() => (copyNote = null), 2500);
			return;
		}
		copyRefused = true;
		copyNote = {
			tone: 'error',
			text: `This browser did not let the page use the clipboard. The ${words.noun} JSON is shown below instead: select it and copy it yourself.`
		};
	}

	/**
	 * WHY THE PRESS DID NOTHING, in the one list problems already appear in.
	 *
	 * The unchanged case is a WARNING rather than an error: nothing is wrong
	 * with the document, and the "Valid:" line beside it stays, which is what
	 * makes "you are being told something, not stopped" legible without a
	 * sentence explaining it. The blank-box case is an error because there
	 * genuinely is nothing. A box with content that failed to parse needs
	 * nothing added -- `flushValidation` has just filled the list with the
	 * actual reasons.
	 */
	function explainRefusal() {
		if (busy) return;
		if (seededUnchanged) {
			problems = [
				{
					tone: 'warning',
					text: `This is the ${words.noun} already attached, unchanged. Edit it before publishing, or close the editor to leave it as it is.`
				}
			];
			return;
		}
		if (!parsed && !raw.trim()) {
			problems = [
				{ tone: 'error', text: `Nothing to publish: paste or upload a ${words.noun} first.` }
			];
		}
	}

	async function publish() {
		flushValidation();
		// ONE predicate, read after the flush so a teacher who pastes and
		// presses immediately is judged on what is in the box rather than on
		// what a 250ms timer had got round to.
		if (!publishReady) {
			explainRefusal();
			return;
		}
		if (!parsed) return;

		// Staging: nothing exists to attach TO yet.
		if (!itemId || !transports) {
			onstage?.(JSON.parse(raw));
			notice = `${words.Noun} ready. It attaches when you save.`;
			clearEditor();
			return;
		}

		busy = true;
		notice = null;
		const res = await commitSpec(JSON.parse(raw));
		busy = false;
		if (!res.ok) {
			// The server's own refusal, into the same list as everything else.
			// It is always an ERROR: the write did not happen.
			problems = [{ tone: 'error', text: res.message ?? 'Something went wrong.' }];
			return;
		}
		notice = isReference
			? 'Reference document published. Students see the structured document now.'
			: 'Spec published. Students see the interactive assignment now.';
		clearEditor();
		await onchanged?.();
	}

	async function remove() {
		if (!armRemove) {
			armRemove = true;
			return;
		}
		armRemove = false;

		if (!itemId || !transports) {
			onstage?.(null);
			notice = `${words.Noun} removed.`;
			return;
		}

		busy = true;
		const res = await commitSpec(null);
		busy = false;
		if (!res.ok) {
			notice = res.message ?? 'Something went wrong.';
			return;
		}
		notice = `${words.Noun} removed. It is kept in this item's history.`;
		await onchanged?.();
	}

	/**
	 * THE PUBLIC TOGGLE IS TWO GESTURES ON PURPOSE, and the copy is unchanged
	 * from ReferenceTools. Turning it ON is the one action here that changes who
	 * may read this, and "who" includes people with no account at all -- so the
	 * confirm names exactly what becomes visible AND what does not, rather than
	 * asking "are you sure?" about something the teacher would have to reason
	 * out themselves. Turning it OFF is immediate: closing access is never the
	 * risky direction.
	 */
	async function togglePublic() {
		if (!publicNow && !armPublic) {
			armPublic = true;
			return;
		}
		armPublic = false;
		busy = true;
		notice = null;
		const next = !publicNow;
		const res = await (transports as ReferenceTransports).setPublic(itemId as string, next);
		busy = false;
		if (!res.ok) {
			notice = res.message ?? 'Something went wrong.';
			return;
		}
		publicNow = res.data?.is_public ?? next;
		notice = publicNow
			? 'Anyone with the link can read this document now.'
			: 'This document is back to enrolled students only.';
		await onchanged?.();
	}

	const attachedMeta = $derived.by(() => {
		if (!shown) return '';
		if (isReference) {
			const s = shown as ReferenceSpec;
			const n = s.sections.length;
			return `${s.meta.referenceId} · ${n} section${n === 1 ? '' : 's'} · ${s.navigation ?? 'tabs'}`;
		}
		const s = shown as AssignmentSpec;
		const n = s.modules.length;
		return `${s.meta.assignmentId} · ${n} module${n === 1 ? '' : 's'} · ${s.meta.totalPoints} pts`;
	});

	const previewMeta = $derived.by(() => {
		if (!parsed) return '';
		if (isReference) {
			const s = parsed as ReferenceSpec;
			return `${s.sections.length} section${s.sections.length === 1 ? '' : 's'}`;
		}
		const s = parsed as AssignmentSpec;
		const bits = [
			`${s.modules.length} module${s.modules.length === 1 ? '' : 's'}`,
			`${s.meta.totalPoints} points`
		];
		if (s.approvalGate) bits.push('approval gate');
		if (s.declarations?.academicIntegrity) bits.push('integrity declaration');
		return bits.join(' · ');
	});
</script>

<div class="importer">
	{#if shown}
		<p class="spec-line">
			<span class="ok-dot"></span>
			{staged
				? `${words.Noun} ready:`
				: isReference
					? 'Reference document attached:'
					: 'Interactive spec attached:'}
			<strong>{shown.meta.title}</strong>
			<span class="spec-meta">
				{attachedMeta}{staged ? ' · attaches on save' : ''}
			</span>
		</p>
		{#if isReference && itemId}
			<p class="slug-line">
				Deep links:
				{#each (shown as ReferenceSpec).sections as section (section.slug)}
					<a href={referenceHref(itemId, section.slug)} target="_blank" rel="noopener noreferrer">
						#{section.slug}
					</a>
				{/each}
			</p>
		{/if}
	{:else}
		<p class="spec-line none">
			{isReference
				? 'No reference document. This material shows its written details instead.'
				: 'No interactive spec. Students see a plain file hand-in.'}
		</p>
	{/if}

	<span class="tool-actions">
		<button
			type="button"
			class="btn secondary tiny"
			data-testid="spec-open-editor"
			onclick={toggleEditor}
		>
			{open ? 'Close import' : shown ? `Replace ${words.noun}` : `Import ${words.noun}`}
		</button>
		{#if shown}
			<!-- IN THE ALWAYS-VISIBLE ROW, not inside the panel below: reading the
			     document and taking it are different jobs, and the common one is
			     handing the JSON to something else. -->
			<button
				type="button"
				class="btn secondary tiny"
				data-testid="spec-copy"
				onclick={copyJson}
			>
				Copy JSON
			</button>
		{/if}
		{#if shown && isReference && itemId}
			<a
				class="btn secondary tiny"
				href={referenceHref(itemId)}
				target="_blank"
				rel="noopener noreferrer">Open reader</a
			>
		{/if}
		{#if shown}
			<button type="button" class="btn secondary tiny danger" disabled={busy} onclick={remove}>
				{armRemove ? 'Really remove?' : `Remove ${words.noun}`}
			</button>
		{/if}
	</span>

	{#if notice}<p class="feedback ok">{notice}</p>{/if}
	{#if copyNote}
		<p class="feedback {copyNote.tone}" data-testid="spec-copy-note" data-tone={copyNote.tone}>
			{copyNote.text}
		</p>
	{/if}

	{#if shown}
		<!--
			THE DOCUMENT ITSELF, on the page.

			COLLAPSED BY DEFAULT (`collapseWhen`), because a spec is tens of
			kilobytes and nobody opens an item page to read JSON -- but present,
			in the DOM, hidden in CSS rather than removed, so it prints and so
			opening it costs nothing. A refused clipboard flips `collapseWhen`,
			which is the one moment the reading IS what this person came for.

			`scope` is null in staging mode on purpose: a manual open/closed
			choice is remembered per item, and an item that does not exist yet
			has nothing to remember it against.
		-->
		<Disclosure
			label={`${words.Noun} JSON`}
			testId="spec-json-toggle"
			collapseWhen={!copyRefused}
			scope={itemId ? `spec-json:${kind}:${itemId}` : null}
		>
			{#snippet meta()}{specJsonStats}{/snippet}
			<p class="note json-note">
				This is what is stored. Key order and spacing are the database's, not the author's, so it
				is the same document rather than a copy of the original file.
			</p>
			<pre class="json-view" data-testid="spec-json">{specJsonText}</pre>
		</Disclosure>
	{/if}

	{#if open}
		<div
			class="import-body"
			class:import-dragging={dropActive}
			use:dropTarget={{
				onfiles: droppedSpec,
				onrejected: refusedSpec,
				onactive: (active) => (dropActive = active),
				accept: (f) => matchesAccept(f, SPEC_ACCEPT)
			}}
		>
			<p class="note import-hint">
				{#if shown}The attached {words.noun} is already in the box. Edit it, or paste and upload over
					it. It is checked as you go, and the preview below is what students will actually see.
					Publishing replaces the current {words.noun}; the old one is kept in this item's history.
				{:else}Paste or upload the JSON. It is checked as you go, and the preview below is what
					students will actually see.{/if}
			</p>
			<label class="btn secondary tiny file-pick">
				Upload .json
				<input type="file" accept={SPEC_ACCEPT} hidden onchange={pickFile} />
			</label>
			{#if dropNote}
				<p class="feedback error" data-testid="spec-drop-note">{dropNote}</p>
			{/if}
			<textarea
				class="paste"
				rows="8"
				data-testid="spec-paste"
				placeholder={isReference
					? "Paste the reference document's spec JSON here"
					: "Paste the assignment's spec JSON here"}
				bind:value={raw}
				oninput={queueValidate}
			></textarea>

			{#if problems.length}
				<ul class="problem-list" data-testid="spec-problems">
					{#each problems as p, i (i)}
						<li class={p.tone} data-tone={p.tone}>
							<!-- The word, so the two tiers are told apart without
							     relying on the colour. -->
							<span class="problem-tag">{p.tone === 'error' ? 'Error' : 'Warning'}</span>
							<span class="problem-text">{p.text}</span>
						</li>
					{/each}
				</ul>
			{/if}
			<!-- NOT AN `{:else}`. A warned spec is a valid spec, so it still says
			     so -- next to the warning, which is what makes "this does not stop
			     you" legible without a sentence explaining it. -->
			{#if parsed && !blocking}
				<p class="valid-line" data-testid="spec-valid">
					Valid: "{parsed.meta.title}", {previewMeta}.
				</p>
			{/if}

			<span class="tool-actions">
				<!-- `aria-disabled`, never `disabled`: a genuinely disabled control
				     swallows the press, so it can never say why it refused. The
				     unchanged-from-attached case is the one that most needs to. -->
				<button
					type="button"
					class="btn tiny"
					data-testid="spec-publish"
					aria-disabled={!publishReady}
					onclick={publish}
				>
					{stagingMode ? `Use this ${words.noun}` : words.publish}
				</button>
			</span>

			{#if parsed}
				<div class="preview" data-testid="spec-preview">
					<p class="mini-label preview-label">Preview: what students see</p>
					<div class="preview-frame">
						{#key parsed}
							{#if isReference}
								<ReferenceDoc spec={parsed as ReferenceSpec} preview showHeader={false} />
							{:else}
								<SpecRenderer
									spec={parsed as AssignmentSpec}
									initialValues={{}}
									readonly
									uploadEnabled={false}
								/>
							{/if}
						{/key}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	{#if isReference && itemId}
		<hr class="tool-rule" />

		<div class="public-block" class:live={publicNow}>
			<p class="public-state">
				<span class="state-tag" class:on={publicNow}>{publicNow ? 'Public' : 'Class only'}</span>
				{#if publicNow}
					Anyone with the link can read this document -- no sign-in.
				{:else}
					Only students enrolled in this class can read this.
				{/if}
			</p>

			{#if armPublic}
				<div class="confirm">
					<p class="confirm-head">Make this readable by anyone with the link?</p>
					<p class="confirm-body">
						<strong>Becomes visible to anyone, signed in or not:</strong> this material's title, its
						reference document{#if attachmentCount}, and its {attachmentCount} attached
							file{attachmentCount === 1 ? '' : 's'}{/if}.
					</p>
					<p class="confirm-body">
						<strong>Stays private:</strong> your class roster, every student's name, work and grades,
						every other post, assignment and material, who is enrolled where, and anything marked
						instructor-only. None of it is reachable from the public page.
					</p>
					<span class="tool-actions">
						<button type="button" class="btn tiny" disabled={busy} onclick={togglePublic}>
							Yes, make it public
						</button>
						<button type="button" class="btn secondary tiny" onclick={() => (armPublic = false)}>
							Cancel
						</button>
					</span>
				</div>
			{:else}
				<button type="button" class="btn secondary tiny" disabled={busy} onclick={togglePublic}>
					{publicNow ? 'Make class-only' : 'Make public…'}
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Layout only: .spec-line, .ok-dot, .spec-meta, .paste, .problem-list,
	   .tool-actions and .tool-rule all live in classroom.css now. */
	.importer {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.slug-line {
		margin: 0;
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.import-body {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.json-note {
		margin: 0 0 0.35rem;
	}
	/* THE DOCUMENT, SELECTABLE AND BOUNDED.

	   `white-space: pre` and not `pre-wrap`: a spec carries long single-line
	   strings, and wrapping them re-flows the indentation that makes JSON
	   readable in the first place. Long lines scroll HERE, inside this box,
	   which is what keeps the page itself from ever scrolling sideways --
	   `min-width: 0` is the half of that which is easy to forget, because a
	   grid/flex child's automatic minimum is its min-content and `overflow`
	   alone does not reduce it.

	   The scrollbar is left alone. A region that scrolls says so. */
	.json-view {
		margin: 0;
		max-height: 22rem;
		min-width: 0;
		overflow: auto;
		white-space: pre;
		tab-size: 2;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		background: var(--surface-0);
		padding: 0.6rem 0.7rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.55;
		color: var(--text-2);
		/* Selecting the whole document by dragging is the fallback the refusal
		   sentence points at, so it must actually be selectable. */
		user-select: text;
	}
	/*
	 * The dragover feedback is an OUTLINE, never a border: neither occupies
	 * layout space, so nothing in the panel moves when a file crosses it.
	 */
	.import-body.import-dragging {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.import-hint {
		margin: 0;
	}
	.file-pick {
		align-self: flex-start;
		cursor: pointer;
	}
	.valid-line {
		margin: 0;
		font-size: 0.82rem;
		color: var(--green);
	}

	/* The preview is bounded and scrolls in its own box. A real spec is longer
	   than the page it is being pasted into, and pushing the Publish button
	   several screens below the editor would make the one action this flow has
	   the hardest thing on it to reach -- which is why the button sits ABOVE
	   this block in the markup, not under it. */
	.preview {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.preview-label {
		margin: 0;
	}
	.preview-frame {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		background: var(--surface-0);
		padding: 0.75rem;
		max-height: 32rem;
		overflow-y: auto;
	}
	.public-block {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		align-items: flex-start;
	}
	.public-state {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-2);
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.state-tag {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.06rem 0.5rem;
		color: var(--text-2);
	}
	.state-tag.on {
		color: var(--gold);
		border-color: var(--gold);
	}
	.confirm {
		border: 1px solid var(--gold);
		border-radius: var(--radius-card);
		padding: 0.65rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		width: 100%;
		box-sizing: border-box;
	}
	.confirm-head {
		margin: 0;
		font-size: 0.9rem;
		color: var(--gold);
	}
	.confirm-body {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-2);
	}
	.confirm-body strong {
		color: var(--text-1);
	}

	@media (max-width: 32rem) {
		.preview-frame {
			max-height: 24rem;
			padding: 0.5rem;
		}
		.json-view {
			max-height: 18rem;
			padding: 0.5rem;
		}
	}
</style>
