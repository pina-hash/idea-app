<script lang="ts">
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
	import RubricView from '$lib/classroom/RubricView.svelte';
	import SubmissionFileList from '$lib/classroom/SubmissionFileList.svelte';
	import FileUploadPanel, { type PanelUpload } from '$lib/classroom/FileUploadPanel.svelte';
	import type { UploadedFileRow } from '$lib/classroom/file-upload';
	import {
		DECLARATION_BLOCK_ID,
		DECLARATION_TEXT,
		filesByBlockCount,
		gateApproved,
		rubricTotal,
		specUnmet,
		submissionEditable,
		submissionStateLabel,
		unmetLabel,
		type AssignmentEngineTransports,
		type ResponseValue,
		type StudentEngineData,
		type SubmissionFileRow
	} from '$lib/classroom/assignment-spec';
	import type { ClassroomItem } from '$lib/classroom/classroom';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { guardSaveNavigation } from '$lib/save-guard.svelte';

	/**
	 * The student half of the assignment engine, mounted in the item detail
	 * page's engine slot: file submission on EVERY assignment, the spec
	 * renderer when the assignment carries one, autosaved responses, the
	 * declaration, the live preflight, submit / unsubmit, and the returned
	 * grade (score, rubric breakdown, comment).
	 *
	 * STATE RULES (0086 enforces every one server-side; this only renders
	 * them): draft = editable, submitted = locked while it waits for grading
	 * (unsubmit undoes it until a grade is saved), returned = released grade,
	 * editable again for resubmission.
	 */
	let {
		item,
		data,
		transports,
		uploadEnabled = true
	}: {
		item: ClassroomItem;
		data: StudentEngineData;
		transports: AssignmentEngineTransports;
		uploadEnabled?: boolean;
	} = $props();

	// Seeded ONCE from the load's data by design: after that this component owns
	// the slice and refreshes it through reloadStudent (the page never reloads
	// under a working student).
	// svelte-ignore state_referenced_locally
	let engine = $state<StudentEngineData>(data);
	// Live working values, seeded from the autosaved rows; the renderer reports
	// every edit here and this is what the live preflight reads.
	// svelte-ignore state_referenced_locally
	let values = $state<Record<string, ResponseValue>>(
		Object.fromEntries(data.responses.map((r) => [r.block_id, r.value ?? {}]))
	);
	let rendererKey = $state(0);

	let busy = $state(false);
	let notice = $state<string | null>(null);
	let uploadError = $state<string | null>(null);

	const spec = $derived(engine.spec);
	const rubric = $derived(engine.rubric);
	const submission = $derived(engine.submission);
	// NOT named `state`: a local called `state` would make every `$state` rune
	// read as a store auto-subscription of it.
	const subState = $derived(submission?.state ?? null);
	const editable = $derived(submissionEditable(subState));
	const approved = $derived(spec ? gateApproved(spec, engine.approvals) : true);
	const plainFiles = $derived(engine.files.filter((f) => !f.block_id));
	const declarationRequired = $derived(spec?.declarations?.academicIntegrity === true);
	const declarationChecked = $derived(values[DECLARATION_BLOCK_ID]?.checked?.[0] === true);
	const liveUnmet = $derived(
		spec
			? specUnmet(
					spec,
					new Map(Object.entries(values)),
					filesByBlockCount(engine.files),
					engine.approvals
				)
			: []
	);
	const returned = $derived(subState === 'returned');

	// ------------------------------------------------------------------
	// AUTOSAVE, on the shared SaveState primitive.
	//
	// WHAT THIS REPLACED, and why it was the urgent one. There was a timer per
	// block, and `saveStatus` went to 'saving' inside queueSave -- BEFORE any
	// network call existed, and 800ms before one would. So the indicator said
	// "Saving..." for a request that had not been made; a failed write was
	// never re-attempted unless the student happened to edit that same block
	// again; and with no beforeNavigate and no unload net, clicking the next
	// item inside the debounce window discarded the last answer in silence.
	// That is the reported defect, and it is the first thing the tests cover.
	//
	// ONE STATE FOR THE WHOLE ENGINE, not one per block. The student is owed a
	// single honest answer to "is my work saved", and N indicators that each
	// speak for one block cannot give it. The dirty SET is what remembers which
	// blocks still owe a write; the run sends all of them.
	// ------------------------------------------------------------------
	const dirtyBlocks = new Set<string>();

	function refusalText(reason: string | undefined): string {
		return reason === 'locked'
			? 'This is submitted, so edits are locked. Unsubmit to keep working.'
			: reason === 'approval_pending'
				? 'That module is still locked, ask your teacher to approve your earlier work.'
				: 'That change was not saved.';
	}

	const save = new SaveState({
		fallbackMessage: 'That change was not saved.',
		async save() {
			const ids = [...dirtyBlocks];
			if (!ids.length) return { ok: true } as const;
			let transportFail: string | null = null;
			let refusal: string | null = null;
			for (const id of ids) {
				const res = await transports.saveResponse(item.id, id, values[id] ?? {});
				if (!res.ok) {
					// STAYS DIRTY, so the retry re-sends it. The value is still in
					// `values`, which is what the field renders from, so nothing the
					// student typed has been taken off the screen either.
					transportFail = res.message;
					continue;
				}
				if (res.data.ok === false) {
					refusal = refusalText(res.data.reason);
					continue;
				}
				dirtyBlocks.delete(id);
			}
			// A transport failure outranks a refusal for RETRYABILITY: if any block
			// failed to reach the server at all, another attempt can still change
			// the answer, and the refusal will simply be reported again with it.
			if (transportFail) return { ok: false, retryable: true, message: transportFail } as const;
			if (refusal) return { ok: false, retryable: false, message: refusal } as const;
			return { ok: true } as const;
		}
	});

	$effect(() => save.attach());

	/**
	 * Pending work is flushed BEFORE the navigation, and only a flush that
	 * cannot land raises a question. See save-guard.svelte.ts.
	 */
	guardSaveNavigation(save, {
		warning:
			'Your last answer has not been saved yet, and leaving now will lose it.'
	});

	function queueSave(blockId: string, value: ResponseValue) {
		values[blockId] = value;
		dirtyBlocks.add(blockId);
		save.markDirty();
	}

	/** Write out everything still pending (before submit, and before leaving). */
	async function flushSaves() {
		await save.saveNow();
	}

	async function setDeclaration(checked: boolean) {
		values[DECLARATION_BLOCK_ID] = { checked: [checked] };
		dirtyBlocks.add(DECLARATION_BLOCK_ID);
		save.markDirty();
		// A tick is a decision, not typing: there is nothing to debounce.
		await save.saveNow();
	}

	// ------------------------------------------------------------------
	// Files
	// ------------------------------------------------------------------
	/**
	 * THE UPLOAD TRANSPORT, HANDED TO THE SHARED PANEL.
	 *
	 * What used to be here was a `for` loop that awaited each file in turn and
	 * `return`ed on the first failure -- so file 2 of 5 failing meant files 3, 4
	 * and 5 were never attempted, with nothing said about them and nothing left
	 * to retry, because the input had already been cleared and the `File` handles
	 * were gone. A student's only recourse was to go and find them again.
	 *
	 * FileUploadPanel owns all of that now, and it is the SAME component an
	 * instructor's composer mounts for a handout: every file attempted, whatever
	 * failed kept with its own reason and its own Retry, progress per file. This
	 * is the one line of glue left.
	 */
	const uploadFile: PanelUpload = async ({ itemId, file, blockId, caption, onProgress }) => {
		const res = await transports.uploadSubmissionFile(itemId, file, blockId, caption, onProgress);
		if (res.ok) return { ok: true, storageKey: '', row: res.data.file as UploadedFileRow };
		return {
			ok: false,
			gate: res.gate ?? 'server',
			message: res.message,
			retryable: res.retryable ?? false
		};
	};

	/** One landed: put it in the list this component owns. */
	function fileLanded(row: UploadedFileRow | undefined) {
		if (!row?.id) return;
		uploadError = null;
		engine.files = [...engine.files, row as SubmissionFileRow];
	}

	async function removeFile(fileId: string) {
		uploadError = null;
		const res = await transports.deleteSubmissionFile(fileId);
		if (!res.ok) {
			uploadError = res.message;
			return;
		}
		if (res.data.ok === false) {
			uploadError = 'This is submitted, so files are locked.';
			return;
		}
		engine.files = engine.files.filter((f) => f.id !== fileId);
	}

	async function setCaption(fileId: string, caption: string) {
		const res = await transports.setFileCaption(fileId, caption);
		if (res.ok && res.data.ok !== false) {
			engine.files = engine.files.map((f) => (f.id === fileId ? { ...f, caption } : f));
		}
	}

	// ------------------------------------------------------------------
	// Submit / unsubmit
	// ------------------------------------------------------------------
	async function refresh() {
		const res = await transports.reloadStudent(item.id);
		if (res.ok) {
			engine = res.data;
			values = Object.fromEntries(res.data.responses.map((r) => [r.block_id, r.value ?? {}]));
			rendererKey += 1;
			// WHAT IS ON SCREEN IS NOW WHAT THE SERVER HOLDS: every field was just
			// re-seeded from its response rows, so any block still marked dirty is
			// naming a local edit that no longer exists. Leaving them marked would
			// make the guard ask about work that is not there.
			dirtyBlocks.clear();
			save.markSaved();
		}
	}

	/**
	 * SINCE 0160 AN UNFINISHED SUBMISSION IS ACCEPTED, so there is no
	 * `incomplete` refusal left to render. `classroom_submit_assignment` still
	 * RUNS `_classroom_spec_unmet` and still returns the answer; it now rides
	 * along with `ok: true` instead of standing in front of it. The migration's
	 * own self-check raises at apply time if the literal `'reason',
	 * 'incomplete'` survives in the function body, so the branch that used to
	 * read it here could not fire again even on a database mid-deploy.
	 *
	 * AND NOTHING READS THE ACCEPTANCE'S `unmet` EITHER, deliberately.
	 * `liveUnmet` is `specUnmet` over the responses this component already
	 * holds, which is the same pure mirror of `_classroom_spec_unmet` the
	 * grading console computes for the teacher, so the two halves read one
	 * answer. A payload copied into a second piece of state would be the copy
	 * that goes stale the moment anything below it is edited.
	 */
	async function submit() {
		busy = true;
		notice = null;
		await flushSaves();
		const res = await transports.submitAssignment(item.id);
		busy = false;
		if (!res.ok) {
			notice = res.message;
			return;
		}
		if (res.data.ok === false) {
			if (res.data.reason === 'nothing_attached') {
				notice = 'Attach at least one file before submitting.';
			} else if (res.data.reason === 'already_submitted') {
				notice = 'Already submitted.';
			} else {
				notice = 'The submission was refused.';
			}
			return;
		}
		notice = 'Submitted. Your teacher can see your work now.';
		await refresh();
	}

	async function unsubmit() {
		busy = true;
		notice = null;
		const res = await transports.unsubmitAssignment(item.id);
		busy = false;
		if (!res.ok) {
			notice = res.message;
			return;
		}
		if (res.data.ok === false) {
			notice =
				res.data.reason === 'graded'
					? 'Your teacher has started grading this, so it can no longer be unsubmitted.'
					: 'This is not currently submitted.';
			return;
		}
		notice = 'Unsubmitted. You can keep working and submit again.';
		await refresh();
	}

	const outOf = $derived(rubric ? rubricTotal(rubric) : (item.points ?? 0));
</script>

<div class="engine">
	<!-- Status -->
	<div class="status-row">
		<span class="state-chip {subState ?? 'none'}">{submissionStateLabel(subState)}</span>
		{#if submission?.submitted_at && subState === 'submitted'}
			<span class="status-meta">
				Submitted {new Date(submission.submitted_at).toLocaleString(undefined, {
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit'
				})}
			</span>
		{/if}
		{#if spec}
			<!--
				THE INDICATOR REPORTS THE ACKNOWLEDGEMENT, not the dispatch, and
				carries the clock time of the last successful write. The explicit
				Save now control reports through the SAME indicator: two controls
				with two answers to "is it saved" is the defect one level along.
			-->
			<SaveIndicator
				state={save}
				onsave={editable ? () => void save.saveNow() : null}
				saveLabel="Save now"
			/>
		{/if}
	</div>

	{#if notice}<p class="feedback ok">{notice}</p>{/if}

	<!-- Returned grade -->
	{#if returned && submission}
		<section class="card grade-card">
			<h3 class="grade-head">
				Returned{submission.score != null ? `: ${submission.score} / ${outOf} pts` : ''}
			</h3>
			{#if rubric?.length}
				<RubricView
					criteria={rubric}
					scores={submission.rubric_scores ?? {}}
					comments={submission.criterion_comments ?? null}
					title="Rubric breakdown"
				/>
			{/if}
			{#if submission.teacher_comment}
				<p class="grade-comment">
					<span class="comment-label">Teacher comment</span>
					{submission.teacher_comment}
				</p>
			{/if}
			<p class="note">You can revise and resubmit; your teacher will see the new version.</p>
		</section>
	{/if}

	{#if subState === 'submitted'}
		<section class="card locked-card">
			<p class="locked-line">
				Your work is in. Editing is locked while it waits for grading.
			</p>
			<button type="button" class="btn secondary tiny" disabled={busy} onclick={unsubmit}>
				Unsubmit to keep working
			</button>
		</section>
	{/if}

	<!-- Spec-driven modules -->
	{#if spec}
		{#key rendererKey}
			<SpecRenderer
				{spec}
				initialValues={values}
				attachments={item.attachments}
				files={engine.files}
				locked={!editable}
				{approved}
				{uploadEnabled}
				itemId={item.id}
				upload={editable ? uploadFile : null}
				onuploaded={fileLanded}
				onvalue={queueSave}
				ondeletefile={removeFile}
				oncaption={setCaption}
			/>
		{/key}
	{/if}

	<!-- Plain file hand-in (every assignment) -->
	<section class="card">
		<h3 class="section-label">{spec ? 'Extra files (optional)' : 'Your files'}</h3>
		<SubmissionFileList
			files={plainFiles}
			onremove={editable ? (f) => removeFile(f.id) : null}
		/>
		{#if editable}
			{#if uploadEnabled}
				<!-- THE SHARED PANEL. Same component, same failure semantics and same
				     words as an instructor attaching a handout. Its plain picker
				     carries NO `accept`: a `.SLDPRT`, a `.STEP`, a `.zip`, a file
				     with no extension at all are all ordinary hand-ins, and the
				     platform used to refuse every one of them. -->
				<FileUploadPanel
					role="submission"
					itemId={item.id}
					upload={uploadFile}
					label={spec ? 'Extra files' : 'Your files'}
					hint="Any file, up to 200 MB each. Uploads as soon as you pick it."
					autoStart
					offerCamera
					showPreviews
					onuploaded={fileLanded}
				/>
			{:else}
				<p class="note">File uploads are not configured on this deployment.</p>
			{/if}
		{/if}
		{#if uploadError}<p class="feedback error">{uploadError}</p>{/if}
	</section>

	<!-- Declaration -->
	{#if declarationRequired && editable}
		<section class="card declaration-card">
			<label class="check-item">
				<input
					type="checkbox"
					checked={declarationChecked}
					onchange={(e) => setDeclaration((e.currentTarget as HTMLInputElement).checked)}
				/>
				<span><strong>Academic integrity.</strong> {DECLARATION_TEXT}</span>
			</label>
		</section>
	{/if}

	<!--
		WHAT IS STILL UNFINISHED, AND IT IS ADVICE RATHER THAN A GATE (0160).
		The heading used to read "Before you can submit", which described a
		refusal the database no longer makes: a student who reads that today
		believes they are blocked when they are not, and the whole point of
		accepting unfinished work is that a wrong assignment or a wrong sentence
		counter must not trap somebody at 11pm.

		IT RENDERS IN BOTH STATES, which is why it sits OUTSIDE the `editable`
		block the submit row keeps. The teacher now sees this same list beside
		the hand-in, and the copy says so; a student who submitted and then saw
		nothing would have no way to know what their teacher is looking at.
	-->
	{#if spec && liveUnmet.length}
		<section class="card preflight-card" data-testid="engine-unfinished">
			<h3 class="section-label">Still unfinished</h3>
			<p class="preflight-note" data-testid="engine-unfinished-note">
				{editable
					? 'You can submit without finishing these. Your teacher sees this same list beside your work.'
					: 'You submitted with these unfinished. Your teacher sees this same list beside your work.'}
			</p>
			<ul class="unmet-list">
				{#each liveUnmet as entry, i (i)}
					<li>{unmetLabel(spec, entry)}</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- Submit -->
	{#if editable}
		<div class="submit-row">
			<button type="button" class="btn" data-testid="engine-submit" disabled={busy} onclick={submit}>
				{subState === 'returned' ? 'Resubmit' : 'Submit'}
			</button>
			{#if spec}
				<span class="submit-hint" data-testid="engine-submit-hint">
					{liveUnmet.length === 0
						? 'Everything required is done.'
						: `${liveUnmet.length} requirement${liveUnmet.length === 1 ? '' : 's'} left.`}
				</span>
			{/if}
		</div>
	{/if}

	<!-- The rubric as a promise (pre-submission; the returned card shows the
	     scored copy above) -->
	{#if rubric?.length && !returned}
		<section class="card">
			<RubricView criteria={rubric} />
		</section>
	{/if}
</div>

<style>
	/* Spacing only: the look lives in classroom.css. */
	.feedback {
		margin: 0 0 0.8rem;
	}

	.engine {
		display: flex;
		flex-direction: column;
	}
	.status-row {
		display: flex;
		/* `center`, not `baseline`: the save indicator carries a real 44px
		   control, and a baseline row hangs it off the chip's text line. */
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.7rem;
	}
	.state-chip {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.1rem 0.55rem;
		color: var(--text-2);
	}
	.state-chip.submitted {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.state-chip.returned {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.status-meta {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.card {
		margin-bottom: 0.9rem;
	}
	.section-label {
		margin: 0 0 var(--space-2);
		font-size: 0.8rem;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.grade-card {
		border-color: var(--line-strong);
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.grade-head {
		margin: 0;
		color: var(--green);
		font-size: 1rem;
	}
	.grade-comment {
		margin: 0;
		font-size: 0.9rem;
		white-space: pre-wrap;
	}
	.comment-label {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
		margin-bottom: 0.15rem;
	}
	.locked-card {
		border-color: var(--cyan);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		align-items: flex-start;
	}
	.locked-line {
		margin: 0;
		font-size: 0.9rem;
	}
	.declaration-card {
		border-color: var(--gold);
	}
	.check-item {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		font-size: 0.88rem;
		cursor: pointer;
	}
	.check-item input {
		margin-top: 0.2rem;
		accent-color: var(--green);
	}
	.preflight-card {
		border-color: var(--amber);
	}
	.preflight-note {
		margin: 0 0 var(--space-2);
		font-size: 0.85rem;
		color: var(--text-1);
	}
	.unmet-list {
		margin: 0;
		padding-left: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.unmet-list li {
		font-size: 0.85rem;
		color: var(--amber);
	}
	.submit-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
		margin-bottom: 0.9rem;
	}
	.submit-hint {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.note {
		color: var(--text-2);
		font-size: 0.82rem;
		margin: 0 0 0.4rem;
	}
</style>
