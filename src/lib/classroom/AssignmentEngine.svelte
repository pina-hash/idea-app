<script lang="ts">
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
	import RubricView from '$lib/classroom/RubricView.svelte';
	import SubmissionFileList from '$lib/classroom/SubmissionFileList.svelte';
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
		type SubmissionFileRow,
		type UnmetEntry
	} from '$lib/classroom/assignment-spec';
	import type { ClassroomItem } from '$lib/classroom/classroom';

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

	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let saveError = $state<string | null>(null);
	let busy = $state(false);
	let notice = $state<string | null>(null);
	let serverUnmet = $state<UnmetEntry[] | null>(null);
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
	// Autosave: one debounced timer per block, flushed before submit. The
	// FSP tools' ~800ms debounce convention.
	// ------------------------------------------------------------------
	const timers = new Map<string, ReturnType<typeof setTimeout>>();
	const inflight = new Set<string>();

	function queueSave(blockId: string, value: ResponseValue) {
		values[blockId] = value;
		serverUnmet = null;
		const existing = timers.get(blockId);
		if (existing) clearTimeout(existing);
		timers.set(
			blockId,
			setTimeout(() => {
				timers.delete(blockId);
				void writeBlock(blockId);
			}, 800)
		);
		saveStatus = 'saving';
	}

	async function writeBlock(blockId: string) {
		inflight.add(blockId);
		const value = values[blockId];
		const res = await transports.saveResponse(item.id, blockId, value);
		inflight.delete(blockId);
		if (!res.ok) {
			saveStatus = 'error';
			saveError = res.message;
			return;
		}
		if (res.data.ok === false) {
			saveStatus = 'error';
			saveError =
				res.data.reason === 'locked'
					? 'This is submitted, so edits are locked. Unsubmit to keep working.'
					: res.data.reason === 'approval_pending'
						? 'That module is still locked -- ask your teacher to approve your earlier work.'
						: 'That change was not saved.';
			return;
		}
		if (timers.size === 0 && inflight.size === 0) {
			saveStatus = 'saved';
			saveError = null;
		}
	}

	/** Write out everything still pending (before submit). */
	async function flushSaves() {
		const pending = [...timers.keys()];
		for (const id of pending) {
			const t = timers.get(id);
			if (t) clearTimeout(t);
			timers.delete(id);
		}
		await Promise.all(pending.map((id) => writeBlock(id)));
	}

	async function setDeclaration(checked: boolean) {
		values[DECLARATION_BLOCK_ID] = { checked: [checked] };
		saveStatus = 'saving';
		await writeBlock(DECLARATION_BLOCK_ID);
	}

	// ------------------------------------------------------------------
	// Files
	// ------------------------------------------------------------------
	/** Live progress for whichever file is uploading right now (uploads here
	 *  run one at a time), shown beside the block it belongs to -- the plain
	 *  "Your files" list (blockId null) or an imageZone in SpecRenderer. */
	let uploadingProgress = $state<{ blockId: string | null; name: string; fraction: number } | null>(
		null
	);

	async function uploadFiles(blockId: string | null, list: File[]) {
		uploadError = null;
		try {
			for (const file of list) {
				uploadingProgress = { blockId, name: file.name, fraction: 0 };
				const res = await transports.uploadSubmissionFile(item.id, file, blockId, null, (frac) => {
					uploadingProgress = { blockId, name: file.name, fraction: frac };
				});
				if (!res.ok) {
					uploadError = res.message;
					return;
				}
				if (res.data.reason) {
					uploadError =
						res.data.reason === 'locked'
							? 'This is submitted, so files are locked. Unsubmit to keep working.'
							: 'That file was not accepted.';
					return;
				}
				if (res.data.file) {
					engine.files = [...engine.files, res.data.file as SubmissionFileRow];
				}
			}
		} finally {
			uploadingProgress = null;
		}
	}

	function pickFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const picked = Array.from(input.files ?? []);
		input.value = '';
		if (picked.length) void uploadFiles(null, picked);
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
		}
	}

	async function submit() {
		busy = true;
		notice = null;
		serverUnmet = null;
		await flushSaves();
		const res = await transports.submitAssignment(item.id);
		busy = false;
		if (!res.ok) {
			notice = res.message;
			return;
		}
		if (res.data.ok === false) {
			if (res.data.reason === 'incomplete') {
				serverUnmet = res.data.unmet ?? [];
			} else if (res.data.reason === 'nothing_attached') {
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
		notice = 'Unsubmitted -- you can keep working and submit again.';
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
			<span class="status-meta save-state {saveStatus}">
				{#if saveStatus === 'saving'}Saving…{:else if saveStatus === 'saved'}All changes saved{:else if saveStatus === 'error'}{saveError ?? 'Save failed'}{/if}
			</span>
		{/if}
	</div>

	{#if notice}<p class="feedback ok">{notice}</p>{/if}

	<!-- Returned grade -->
	{#if returned && submission}
		<section class="card grade-card">
			<h3 class="grade-head">
				Returned{submission.score != null ? ` -- ${submission.score} / ${outOf} pts` : ''}
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
				files={engine.files}
				locked={!editable}
				{approved}
				{uploadEnabled}
				{uploadingProgress}
				onvalue={queueSave}
				onupload={(blockId, list) => uploadFiles(blockId, list)}
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
		{#if uploadingProgress && uploadingProgress.blockId === null}
			<p class="upload-status">
				Uploading {uploadingProgress.name}...
				<span class="upload-bar" role="progressbar" aria-valuenow={Math.round(uploadingProgress.fraction * 100)} aria-valuemin="0" aria-valuemax="100">
					<span class="upload-bar-fill" style={`width: ${Math.round(uploadingProgress.fraction * 100)}%`}></span>
				</span>
				{Math.round(uploadingProgress.fraction * 100)}%
			</p>
		{/if}
		{#if editable}
			{#if uploadEnabled}
				<div class="file-actions">
					<label class="btn secondary tiny">
						Take a photo
						<input type="file" accept="image/*" capture="environment" hidden onchange={pickFiles} />
					</label>
					<label class="btn secondary tiny">
						Choose files
						<input type="file" multiple hidden onchange={pickFiles} />
					</label>
				</div>
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

	<!-- Preflight + submit -->
	{#if editable}
		{@const shown = serverUnmet ?? liveUnmet}
		{#if spec && shown.length}
			<section class="card preflight-card" class:server={serverUnmet != null}>
				<h3 class="section-label">
					{serverUnmet != null ? 'The submission was refused -- still needed:' : 'Before you can submit'}
				</h3>
				<ul class="unmet-list">
					{#each shown as entry, i (i)}
						<li>{unmetLabel(spec, entry)}</li>
					{/each}
				</ul>
			</section>
		{/if}
		<div class="submit-row">
			<button type="button" class="btn" disabled={busy} onclick={submit}>
				{subState === 'returned' ? 'Resubmit' : 'Submit'}
			</button>
			{#if spec}
				<span class="submit-hint">
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
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.7rem;
	}
	.state-chip {
		font-family: 'Share Tech Mono', monospace;
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
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.save-state.saving {
		color: var(--amber);
	}
	.save-state.saved {
		color: var(--green);
	}
	.save-state.error {
		color: var(--crimson);
	}
	.card {
		margin-bottom: 0.9rem;
	}
	.section-label {
		margin: 0 0 var(--space-2);
		font-size: 0.8rem;
		font-family: 'Share Tech Mono', monospace;
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
		font-family: 'Share Tech Mono', monospace;
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
	.file-actions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.file-actions label {
		cursor: pointer;
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
	.preflight-card.server .section-label {
		color: var(--amber);
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
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.note {
		color: var(--text-2);
		font-size: 0.82rem;
		margin: 0 0 0.4rem;
	}
	.upload-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.4rem 0;
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.upload-bar {
		display: inline-block;
		width: 6rem;
		height: 0.4rem;
		border-radius: 999px;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		overflow: hidden;
	}
	.upload-bar-fill {
		display: block;
		height: 100%;
		background: var(--green);
		transition: width 0.15s ease-out;
	}
</style>
