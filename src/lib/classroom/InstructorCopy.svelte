<script lang="ts">
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { guardSaveNavigation } from '$lib/save-guard.svelte';
	import {
		instructorKeyByline,
		INSTRUCTOR_COPY_HEADING,
		INSTRUCTOR_COPY_NOTE,
		INSTRUCTOR_COPY_UPLOAD_NOTE,
		INSTRUCTOR_KEY_DESIGNATE,
		INSTRUCTOR_KEY_UNDESIGNATE,
		type AssignmentSpec,
		type InstructorCopyData,
		type InstructorCopyTransports,
		type ResponseValue
	} from '$lib/classroom/assignment-spec';
	import type { ClassroomAttachment } from '$lib/classroom/classroom';

	/**
	 * THE INSTRUCTOR WORKING COPY (0128): an instructor fills the assignment out
	 * themselves, on the same renderer the student uses, and the answers autosave
	 * through the same primitive.
	 *
	 * IT IS UNMISTAKABLY NOT A SUBMISSION, and that is structural rather than a
	 * matter of wording. There is no state chip, no submitted/returned machine,
	 * no due state, no grade card, no rubric score, no declaration, no preflight
	 * and no submit control -- not hidden ones, ABSENT ones, because there is no
	 * classroom_submissions row for an instructor and nothing here could create
	 * one. What is left is the work surface plus one banner that says whose copy
	 * this is and what it is for.
	 *
	 * FILE BLOCKS ARE OUT OF THIS VERSION. There is no instructor-side
	 * counterpart to classroom_submission_files, so SpecRenderer's `fileNotice`
	 * renders the block with a stated absence instead of a control that would
	 * do nothing (and the module progress chip stops counting them, so it can
	 * still reach complete).
	 *
	 * THE KEY. One copy per item can be designated the answer key, and every
	 * instructor on the item can then read it. When somebody ELSE'S copy is the
	 * key it renders BELOW this one, read-only and labelled with whose it is --
	 * the same component, `readonly`, with no transports wired to it, so
	 * read-only is the absence of a write path rather than a discipline.
	 */
	let {
		itemId,
		spec,
		attachments = [],
		data,
		transports
	}: {
		itemId: string;
		spec: AssignmentSpec;
		attachments?: ClassroomAttachment[];
		data: InstructorCopyData;
		transports: InstructorCopyTransports;
	} = $props();

	// Seeded ONCE, then owned here and refreshed through `reload` -- the
	// AssignmentEngine contract, for the same reason: the page does not reload
	// under a working instructor.
	// svelte-ignore state_referenced_locally
	let copy = $state<InstructorCopyData>(data);
	// svelte-ignore state_referenced_locally
	let values = $state<Record<string, ResponseValue>>(
		Object.fromEntries(data.mine.map((r) => [r.block_id, r.value ?? {}]))
	);
	let rendererKey = $state(0);
	let busy = $state(false);
	let notice = $state<string | null>(null);

	const key = $derived(copy.key);
	const keyIsMine = $derived(!!key && key.instructor_email === copy.myEmail);
	const keyValues = $derived(
		Object.fromEntries(copy.keyResponses.map((r) => [r.block_id, r.value ?? {}]))
	);

	const dirtyBlocks = new Set<string>();

	const save = new SaveState({
		fallbackMessage: 'That change was not saved.',
		async save() {
			const ids = [...dirtyBlocks];
			if (!ids.length) return { ok: true } as const;
			let transportFail: string | null = null;
			let refusal: string | null = null;
			for (const id of ids) {
				const res = await transports.saveResponse(itemId, id, values[id] ?? {});
				if (!res.ok) {
					// Stays dirty, so the retry re-sends it, and nothing typed comes
					// off the screen -- `values` is still what the field renders from.
					transportFail = res.message;
					continue;
				}
				if (res.data.ok === false) {
					refusal = 'That change was not saved.';
					continue;
				}
				dirtyBlocks.delete(id);
			}
			if (transportFail) return { ok: false, retryable: true, message: transportFail } as const;
			if (refusal) return { ok: false, retryable: false, message: refusal } as const;
			return { ok: true } as const;
		}
	});

	$effect(() => save.attach());

	guardSaveNavigation(save, {
		warning: 'Your last answer has not been saved yet, and leaving now will lose it.'
	});

	function queueSave(blockId: string, value: ResponseValue) {
		values[blockId] = value;
		dirtyBlocks.add(blockId);
		notice = null;
		save.markDirty();
	}

	async function refresh() {
		const res = await transports.reload(itemId);
		if (res.ok) {
			copy = res.data;
			values = Object.fromEntries(res.data.mine.map((r) => [r.block_id, r.value ?? {}]));
			rendererKey += 1;
			// What is on screen is now what the server holds, so nothing is owed.
			dirtyBlocks.clear();
			save.markSaved();
		}
	}

	async function designate() {
		busy = true;
		notice = null;
		// Everything pending goes first: designating a copy the server has not
		// been told about yet would publish a key missing the last answer typed.
		await save.saveNow();
		const res = await transports.designateKey(itemId);
		busy = false;
		if (!res.ok) {
			notice = res.message;
			return;
		}
		if (res.data.ok === false) {
			notice =
				res.data.reason === 'empty_copy'
					? 'Fill in at least one answer before designating this as the answer key.'
					: 'That was refused.';
			return;
		}
		notice = 'This is now the answer key for this assignment.';
		await refresh();
	}

	async function undesignate() {
		busy = true;
		notice = null;
		const res = await transports.undesignateKey(itemId);
		busy = false;
		if (!res.ok) {
			notice = res.message;
			return;
		}
		if (res.data.ok === false) {
			notice =
				res.data.reason === 'not_yours'
					? 'That key was designated by somebody else, so only they can withdraw it. Designating yours replaces it.'
					: 'There is no answer key designated on this assignment.';
			return;
		}
		notice = 'The answer key designation was withdrawn.';
		await refresh();
	}
</script>

<div class="icopy" data-testid="instructor-copy">
	<div class="banner">
		<div class="banner-text">
			<h3 class="banner-head">{INSTRUCTOR_COPY_HEADING}</h3>
			<p class="banner-note">{INSTRUCTOR_COPY_NOTE}</p>
		</div>
		<SaveIndicator state={save} onsave={() => void save.saveNow()} saveLabel="Save now" />
	</div>

	<div class="key-row">
		{#if keyIsMine && key}
			<span class="key-chip mine">{instructorKeyByline(key, copy.myEmail)}</span>
			<button type="button" class="btn secondary tiny tap-44" disabled={busy} onclick={undesignate}>
				{INSTRUCTOR_KEY_UNDESIGNATE}
			</button>
		{:else}
			{#if key}
				<span class="key-chip">{instructorKeyByline(key, copy.myEmail)}</span>
			{:else}
				<span class="key-chip none">No answer key designated yet</span>
			{/if}
			<!-- NOT disabled on an empty copy. The server owns that rule
			     (`empty_copy`) and answers it where the instructor is working; a
			     second copy of it here would be a control that refuses without
			     being able to say why, since a disabled control swallows the
			     pointer event a cue would have to fire from. -->
			<button type="button" class="btn secondary tiny tap-44" disabled={busy} onclick={designate}>
				{INSTRUCTOR_KEY_DESIGNATE}
			</button>
		{/if}
	</div>
	{#if key && !keyIsMine}
		<p class="key-hint">
			Designating yours replaces theirs. Only {key.instructor_email} can withdraw it without
			replacing it.
		</p>
	{/if}
	{#if notice}<p class="feedback ok">{notice}</p>{/if}

	{#key rendererKey}
		<SpecRenderer
			{spec}
			initialValues={values}
			{attachments}
			approved
			uploadEnabled={false}
			fileNotice={INSTRUCTOR_COPY_UPLOAD_NOTE}
			onvalue={queueSave}
		/>
	{/key}

	{#if key && !keyIsMine}
		<section class="key-copy" aria-label={instructorKeyByline(key, copy.myEmail)}>
			<h3 class="key-head">{instructorKeyByline(key, copy.myEmail)}</h3>
			<p class="key-note">
				Read-only. Designated {new Date(key.designated_at).toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				})}.
			</p>
			<!-- No transports at all: there is no write to execute here, rather
			     than one that is merely hidden. -->
			<SpecRenderer
				{spec}
				initialValues={keyValues}
				{attachments}
				approved
				readonly
				uploadEnabled={false}
				fileNotice={INSTRUCTOR_COPY_UPLOAD_NOTE}
			/>
		</section>
	{/if}
</div>

<style>
	/* Spacing only: the look lives in classroom.css. */
	.icopy {
		display: flex;
		flex-direction: column;
	}
	/* GOLD AND DASHED, this module's instructor-only marking (the inspector's
	   own treatment), so this can never be read as a card of student work. */
	.banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin-bottom: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px dashed var(--gold);
		border-radius: var(--radius-card);
		background: var(--surface-2);
	}
	.banner-text {
		min-width: 0;
	}
	.banner-head {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gold);
	}
	.banner-note {
		margin: 0.2rem 0 0;
		font-size: 0.84rem;
		color: var(--text-2);
	}
	.key-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: var(--space-2);
	}
	.key-chip {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		border: 1px solid var(--boundary);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
		color: var(--text-2);
	}
	.key-chip.mine {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.key-chip.none {
		color: var(--text-3);
	}
	.key-hint,
	.key-note {
		margin: 0 0 var(--space-2);
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.feedback {
		margin: 0 0 0.8rem;
	}
	.key-copy {
		margin-top: var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px solid var(--boundary);
	}
	.key-head {
		margin: 0 0 0.2rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
</style>
