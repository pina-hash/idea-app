<script lang="ts">
	import HtmlAssignmentFrame from '$lib/classroom/html-assignment/HtmlAssignmentFrame.svelte';
	import {
		HTML_INSTRUCTOR_COPY_PURPOSE,
		HTML_INSTRUCTOR_COPY_UPLOAD_NOTE
	} from '$lib/classroom/html-assignment/instructor';
	import type { HtmlAssignmentAnswers } from '$lib/classroom/html-assignment/mount';
	import {
		instructorKeyByline,
		INSTRUCTOR_COPY_HEADING,
		INSTRUCTOR_COPY_NOTE,
		INSTRUCTOR_KEY_DESIGNATE,
		INSTRUCTOR_KEY_UNDESIGNATE,
		type InstructorCopyData,
		type InstructorCopyTransports
	} from '$lib/classroom/assignment-spec';

	/**
	 * THE INSTRUCTOR WORKING COPY OF A PORTED HTML ASSIGNMENT (0199).
	 *
	 * IT IS `InstructorCopy.svelte` WITH THE OTHER ENGINE UNDER IT, deliberately
	 * and visibly: the banner, the key row, the designate and undesignate
	 * sentences, the empty-copy refusal and the read-only rendering of somebody
	 * else's key are that component's, with `SpecRenderer` replaced by
	 * `HtmlAssignmentFrame`. Every string is imported from `assignment-spec.ts`,
	 * where 0128 put them, so a teacher who keeps a working copy of a v1
	 * assignment and one of a ported one reads ONE vocabulary.
	 *
	 * IT IS UNMISTAKABLY NOT A SUBMISSION, structurally rather than by wording.
	 * There is no state chip, no submitted/returned machine, no due state, no
	 * grade card, no rubric score, no declaration, no preflight and no submit
	 * control -- not hidden ones, ABSENT ones, because there is no
	 * `classroom_submissions` row for an instructor and nothing on this surface
	 * could create one.
	 *
	 * ===================================================================
	 * WHY THE SAVE MACHINERY IS NOT HERE
	 * ===================================================================
	 *
	 * `InstructorCopy.svelte` owns a `SaveState`, a dirty set and a navigation
	 * guard because `SpecRenderer` hands it a value at a time and somebody has
	 * to debounce them. The ported engine already has all of that: `HxAnswers`
	 * holds one `SaveState` PER BLOCK, its own debounce, its own backoff, its
	 * own durability net and its own acknowledgement, and the mounting route
	 * owns the guard exactly as it does for a student. So this component takes a
	 * controller and hands its four callbacks to the frame, and a second save
	 * machine here would be a second idea of what "unsaved" means on one page.
	 *
	 * THE CONTROLLER IS REQUIRED, WHICH IS THE WHOLE GATE. A ported instructor
	 * copy that could be mounted without one would be the writable-but-unsaving
	 * worksheet this lane exists to prevent -- so the caller that cannot build a
	 * controller renders the ordinary read-only frame instead and never reaches
	 * this file.
	 *
	 * ===================================================================
	 * PHOTOGRAPHS
	 * ===================================================================
	 *
	 * There is no instructor counterpart to `classroom_submission_files`, so the
	 * controller is built with no file transports and each of the three picture
	 * messages settles a refusal that travels back INTO the document. The
	 * sentence above the frame is the same claim made before the press, because
	 * a document's own camera control is bytes we may not rewrite.
	 */
	let {
		itemId,
		src,
		title,
		fieldToBlockId,
		answers,
		data,
		transports
	}: {
		itemId: string;
		src: string;
		title: string;
		fieldToBlockId: Readonly<Record<string, string>>;
		/** REQUIRED. See the header: an optional one would be the unsaving
		    worksheet. */
		answers: HtmlAssignmentAnswers;
		data: InstructorCopyData;
		transports: InstructorCopyTransports;
	} = $props();

	// Seeded ONCE, then owned here and refreshed through `reload` -- the
	// `InstructorCopy` contract, for the same reason: the page does not reload
	// under a working instructor.
	// svelte-ignore state_referenced_locally
	let copy = $state<InstructorCopyData>(data);
	let busy = $state(false);
	let notice = $state<string | null>(null);

	const key = $derived(copy.key);
	const keyIsMine = $derived(!!key && key.instructor_email === copy.myEmail);

	/**
	 * THE FRAME'S CALLBACKS, CALLED THROUGH THE OBJECT rather than passed as
	 * method references -- `ItemDetail`'s own rule for this controller, and for
	 * its reason: a class-shaped controller torn apart loses `this`. An optional
	 * method that is absent leaves the callback `undefined`, which removes the
	 * behaviour down through the frame.
	 *
	 * THE THREE PICTURE ONES ARE PRESENT HERE, and that is deliberate rather
	 * than an oversight: `HxAnswersStore` exposes all four whatever the
	 * transports hold, so a press reaches the controller and the controller
	 * settles the refusal the document then shows. Withholding them would take
	 * the message away before anything could answer it, which is the silent drop.
	 */
	function onchange(change: { blockId: string; field: string; value: string | boolean }) {
		answers.change(change);
	}
	function onimage(image: { blockId: string; field: string; name: string; bytes: string }) {
		void answers.image?.(image);
	}
	function onimageremove(image: { blockId: string; field: string }) {
		void answers.imageRemove?.(image);
	}
	function onimagecaption(image: { blockId: string; field: string; caption: string }) {
		void answers.imageCaption?.(image);
	}

	async function refresh() {
		const res = await transports.reload(itemId);
		if (res.ok) copy = res.data;
	}

	async function designate() {
		busy = true;
		notice = null;
		// EVERYTHING PENDING GOES FIRST. Designating a copy the server has not
		// been told about yet would publish a key missing the last answer typed,
		// which is `InstructorCopy`'s own rule -- with `flush()` standing in for
		// its `save.saveNow()`, because the machines here are per block.
		await answers.flush?.();
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

<div class="icopy" data-testid="html-instructor-copy">
	<div class="banner">
		<div class="banner-text">
			<h3 class="banner-head">{INSTRUCTOR_COPY_HEADING}</h3>
			<p class="banner-note">{INSTRUCTOR_COPY_NOTE}</p>
			<p class="banner-note">{HTML_INSTRUCTOR_COPY_PURPOSE}</p>
		</div>
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
			<!-- NOT disabled on an empty copy, which is `InstructorCopy`'s own
			     decision: the server owns that rule (`empty_copy`) and answers it
			     where the instructor is working, and a second copy of it here
			     would be a control that refuses without being able to say why,
			     since a disabled control swallows the pointer event a cue would
			     have to fire from. -->
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

	<p class="upload-note">{HTML_INSTRUCTOR_COPY_UPLOAD_NOTE}</p>

	<!--
		NO `{#key}`. The frame's own mount is what starts the document loading and
		it keys everything it holds off `src`; keying on the item id would tear
		down and refetch a running worksheet on any unrelated re-render.

		`lock` IS NULL AND HAS NO MEANING HERE. An instructor has no
		`classroom_submissions` row, so there is no turn-in and no close to
		report -- and 0198's lock notice is addressed to a student whose work was
		shut, which is not this reader.
	-->
	<HtmlAssignmentFrame
		{src}
		{title}
		{fieldToBlockId}
		values={answers.values}
		images={answers.images}
		saved={answers.saved}
		lock={null}
		{onchange}
		{onimage}
		{onimageremove}
		{onimagecaption}
	/>
</div>

<style>
	/* Spacing only: the look lives in classroom.css, and every token below is
	   `InstructorCopy`'s own so the two banners are one treatment. */
	.icopy {
		display: flex;
		flex-direction: column;
	}
	/* GOLD AND DASHED, this module's instructor-only marking, so this can never
	   be read as a card of student work. */
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
	.key-hint {
		margin: 0 0 var(--space-2);
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.upload-note {
		margin: 0 0 var(--space-2);
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.feedback {
		margin: 0 0 0.8rem;
	}
</style>
