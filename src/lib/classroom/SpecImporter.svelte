<script lang="ts">
	import ReferenceDoc from '$lib/classroom/ReferenceDoc.svelte';
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
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
		};
	});

	async function pickFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		raw = await file.text();
		// An upload is a single deliberate action, so it answers immediately
		// rather than making the reader wait out a debounce they did not cause.
		flushValidation();
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
	}

	async function publish() {
		flushValidation();
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
				? 'No reference document -- this material shows its written details instead.'
				: 'No interactive spec -- students see a plain file hand-in.'}
		</p>
	{/if}

	<span class="tool-actions">
		<button type="button" class="btn secondary tiny" onclick={() => (open = !open)}>
			{open ? 'Close import' : shown ? `Replace ${words.noun}` : `Import ${words.noun}`}
		</button>
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

	{#if open}
		<div class="import-body">
			<p class="note import-hint">
				Paste or upload the JSON. It is checked as you go, and the preview below is what students
				will actually see.
				{#if shown}Publishing replaces the current {words.noun}; the old one is kept in this item's
					history.{/if}
			</p>
			<label class="btn secondary tiny file-pick">
				Upload .json
				<input type="file" accept=".json,application/json" hidden onchange={pickFile} />
			</label>
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
					Valid: "{parsed.meta.title}" -- {previewMeta}.
				</p>
			{/if}

			<span class="tool-actions">
				<button
					type="button"
					class="btn tiny"
					data-testid="spec-publish"
					disabled={!parsed || busy}
					onclick={publish}
				>
					{stagingMode ? `Use this ${words.noun}` : words.publish}
				</button>
			</span>

			{#if parsed}
				<div class="preview" data-testid="spec-preview">
					<p class="mini-label preview-label">Preview -- what students see</p>
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
	}
</style>
