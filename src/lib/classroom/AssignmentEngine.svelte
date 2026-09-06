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
	import { serializeForBaseline } from '$lib/edit-baseline.svelte';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import {
		ASSIGNMENT_MIRROR_DEBOUNCE_MS,
		ASSIGNMENT_MIRROR_UNAVAILABLE,
		assignmentMirrorKey,
		assignmentRestoreMessage,
		baselineOf,
		blockById,
		clearAssignmentMirror,
		mirrorBlockLabel,
		mirrorValueLines,
		planAssignmentRestore,
		readAssignmentMirror,
		sweepAssignmentMirrors,
		writeAssignmentMirror,
		type AssignmentMirror,
		type MirrorConflict
	} from '$lib/classroom/assignment-draft-mirror';

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

	/**
	 * WHAT THE SERVER HAS ACKNOWLEDGED, PER BLOCK, through `serializeForBaseline`
	 * -- the same serializer `EditBaseline` uses, so "the same value" means one
	 * thing across this component and the mirror rather than two.
	 *
	 * `dirtyBlocks` says which blocks still OWE a write and is enough for the
	 * write loop. It is not enough for the mirror: a restore has to tell an
	 * answer the server never received from one the server has since replaced,
	 * and only a recorded baseline separates those. See
	 * `planAssignmentRestore`'s three-cornered comparison.
	 */
	function ackedFrom(rows: { block_id: string; value: ResponseValue | null }[]) {
		return baselineOf(Object.fromEntries(rows.map((r) => [r.block_id, r.value ?? {}])));
	}
	// svelte-ignore state_referenced_locally
	let acked = $state<Record<string, string>>(ackedFrom(data.responses));

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
				// THE VALUE THAT GOES OUT IS THE ONE THE ACKNOWLEDGEMENT IS ABOUT.
				// Read once, here, and remembered: an edit landing while this
				// request is in flight makes `values[id]` a NEWER answer than the
				// server agreed to, and stamping that as acknowledged would make
				// the mirror treat a genuinely unsaved edit as already saved.
				const sent = ($state.snapshot(values[id] ?? {}) ?? {}) as ResponseValue;
				const res = await transports.saveResponse(item.id, id, sent);
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
				acked = { ...acked, [id]: serializeForBaseline(sent) };
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

	// ------------------------------------------------------------------
	// THE LOCAL DRAFT MIRROR.
	//
	// Measured against this component before it existed: sixty characters typed
	// at 110ms a character produced ZERO dispatches over 6694ms and ZERO bytes
	// in `localStorage` -- every keystroke cancels and re-arms the 800ms
	// debounce, so the window is the whole of the typing plus 800ms, and the
	// answer lived in `values` and nowhere else. See
	// `$lib/classroom/assignment-draft-mirror.ts` for why the durability net is
	// not the answer to that.
	// ------------------------------------------------------------------

	/**
	 * WHO IS LOOKING AT THIS PAGE, read here rather than threaded through a
	 * prop -- the `Disclosure` rule, for the same reason: "per person" is then
	 * one rule in one place and no caller can forget it.
	 *
	 * NO VIEWER MEANS NO MIRROR AT ALL, which is where this departs from
	 * `Disclosure`'s `anon` fallback and has to. What a disclosure remembers is
	 * whether a panel was open; what this holds is a student's answers, and a
	 * shared `anon` slot on a school desktop would hand one student another's
	 * work. `/classroom` is in `authedPrefixes`, so a viewer is always there on
	 * the real surface and this branch is a fail-closed guard rather than a
	 * supported state.
	 */
	const viewerId = $derived((page.data?.claims as { sub?: string } | undefined)?.sub ?? null);
	const mirrorKey = $derived(viewerId ? assignmentMirrorKey(viewerId, item.id) : null);

	/** The restore pass has run. Nothing is written before it has. */
	let mirrorChecked = $state(false);
	/** What was recovered, in words. Null when there was nothing to recover. */
	let mirrorNote = $state<string | null>(null);
	/** Answers NOT put back because the saved answer is newer. */
	let mirrorConflicts = $state<MirrorConflict[]>([]);
	/** Storage refused the mirror, so the student is told the net is not there. */
	let mirrorBlocked = $state(false);
	/** Which conflicted answer was last copied, so the control can acknowledge. */
	let copied = $state<string | null>(null);
	let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
	/**
	 * THE SLOT AS IT WOULD BE WRITTEN RIGHT NOW, or null when there is nothing
	 * unacknowledged to keep.
	 *
	 * A PLAIN FIELD AND NOT `$state`, deliberately: nothing renders it, and the
	 * one thing that reads it is an event handler that must see the newest value
	 * without waiting for a render to settle.
	 */
	let mirrorPending: AssignmentMirror | null = null;

	function cancelMirrorTimer() {
		if (mirrorTimer !== null) {
			clearTimeout(mirrorTimer);
			mirrorTimer = null;
		}
	}

	/** Forget the slot and everything the restore pass put on screen about it. */
	function dropMirror() {
		cancelMirrorTimer();
		mirrorPending = null;
		if (mirrorKey) clearAssignmentMirror(mirrorKey);
	}

	/**
	 * PUT BACK WHAT THIS BROWSER KEPT, once.
	 *
	 * `viewerId` and `editable` are read TRACKED, because the pass must not
	 * latch on a frame where either is not settled yet; everything it DOES is
	 * inside `untrack`, because it writes most of the state it reads and a
	 * tracked write of that is how an effect re-enters itself.
	 */
	$effect(() => {
		const who = viewerId;
		const key = mirrorKey;
		const canEdit = editable;
		untrack(() => {
			if (mirrorChecked || !who || !key) return;
			mirrorChecked = true;
			// A LOCKED ASSIGNMENT IS NOT RESTORED AND ITS SLOT IS DROPPED. There is
			// no write to make on a submitted assignment, so putting an answer back
			// into a locked field would show work that can never be saved.
			if (!canEdit) {
				clearAssignmentMirror(key);
				return;
			}
			const now = Date.now();
			// Housekeeping first, and it only ever drops EXPIRED slots: a live one
			// belonging to another assignment is somebody's answer, not litter.
			sweepAssignmentMirrors(key, now);
			const found = readAssignmentMirror(key, now);
			if (!found) return;
			if (found.itemId !== item.id) {
				// The key names this assignment, so a slot that names another is a
				// shape nothing in this module writes. Drop it rather than read it.
				clearAssignmentMirror(key);
				return;
			}
			const server = Object.fromEntries(engine.responses.map((r) => [r.block_id, r.value ?? {}]));
			const plan = planAssignmentRestore(found, server);
			if (plan.action === 'drop') {
				clearAssignmentMirror(key);
				return;
			}
			for (const id of plan.restoredIds) {
				values[id] = plan.restore[id];
				dirtyBlocks.add(id);
			}
			if (plan.restoredIds.length) {
				// SpecRenderer seeds `initialValues` once, at mount, so a restored
				// answer reaches a field only through the remount `rendererKey`
				// already exists for.
				rendererKey += 1;
				// AND IT IS DIRTY, which is what actually saves it. A restore that
				// only put text on screen would leave the student looking at an
				// answer the server still does not have.
				save.markDirty();
			}
			mirrorConflicts = plan.conflicts;
			mirrorNote = assignmentRestoreMessage(plan);
		});
	});

	/**
	 * MIRROR THE ANSWERS, DEBOUNCED, WHILE THE SERVER HAS NOT ACKNOWLEDGED THEM.
	 *
	 * The gate is `save.dirty` -- the SAME signal the navigation guard reads --
	 * so the slot exists exactly while there is something to lose. That is one
	 * comparison rather than a second idea of what "unsaved" means, and it is
	 * why the clear below is not a "clear on dispatch": `dirty` stays true
	 * through `writing` and through `failed`, and only an acknowledgement ends
	 * it.
	 *
	 * THE CLEAR IS IMMEDIATE AND ONLY THE WRITE IS DEBOUNCED. Debouncing the
	 * write is what stops a keystroke costing a storage round trip; debouncing
	 * the clear would leave a student's answers sitting in a shared machine's
	 * storage for no reason at all.
	 */
	$effect(() => {
		if (!mirrorChecked) return;
		const key = mirrorKey;
		const canEdit = editable;
		const due = save.dirty;
		const snapshot = $state.snapshot(values) as Record<string, ResponseValue>;
		const baseline = { ...acked };
		const id = item.id;
		if (!key || !canEdit) return;
		if (!due) {
			cancelMirrorTimer();
			mirrorPending = null;
			clearAssignmentMirror(key);
			return;
		}
		mirrorPending = { v: 1, at: Date.now(), itemId: id, values: snapshot, baseline };
		cancelMirrorTimer();
		mirrorTimer = setTimeout(() => {
			mirrorTimer = null;
			writeMirrorNow(key);
		}, ASSIGNMENT_MIRROR_DEBOUNCE_MS);
		return cancelMirrorTimer;
	});

	/** Put the pending slot down, now, and report whether storage took it. */
	function writeMirrorNow(key: string) {
		if (!mirrorPending) return;
		const result = writeAssignmentMirror(key, { ...mirrorPending, at: Date.now() });
		// SAY SO WHEN THE NET IS NOT THERE. A safety net nobody knows is missing
		// is worse than none, because the student goes on typing a long answer
		// under an assumption that stopped being true.
		mirrorBlocked = result !== 'ok';
	}

	/**
	 * THE DURABILITY NET FOR THE MIRROR, AND IT IS THE HALF THAT CLOSES THE
	 * WINDOW RATHER THAN NARROWING IT.
	 *
	 * `SaveState.attach()` already flushes the SAVE on these two events, and
	 * that flush is an ordinary `fetch` a freezing page is free to abandon --
	 * which is the whole reason this module exists. `localStorage.setItem` is
	 * SYNCHRONOUS: it has completed before the handler returns, so a tab
	 * reclaimed after being backgrounded keeps the answers whatever happens to
	 * the request. The debounce below it covers only the case with no event at
	 * all, which is a hard kill.
	 *
	 * Registered once, and it reads `mirrorPending` rather than closing over a
	 * snapshot, so the newest answers are what goes down.
	 */
	$effect(() => {
		if (typeof document === 'undefined' || typeof window === 'undefined') return;
		const flush = () => {
			const key = mirrorKey;
			if (!key) return;
			cancelMirrorTimer();
			if (mirrorPending) writeMirrorNow(key);
			else clearAssignmentMirror(key);
		};
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') flush();
		};
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pagehide', flush);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pagehide', flush);
		};
	});

	/** The browser's copy of one conflicted answer, as the lines on screen. */
	function conflictLines(c: MirrorConflict): string[] {
		return mirrorValueLines(c.local, blockById(spec, c.blockId));
	}

	async function copyConflict(c: MirrorConflict) {
		const text = conflictLines(c).join('\n');
		try {
			await navigator.clipboard.writeText(text);
			copied = c.blockId;
		} catch {
			// A refused clipboard is not a failure worth a message: the lines are
			// selectable text a few pixels away, which is what the control is a
			// shortcut for.
			copied = null;
		}
	}

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
			acked = ackedFrom(res.data.responses);
			save.markSaved();
			// AND THE SLOT GOES WITH THEM. What is on screen is now what the server
			// holds, so a mirror surviving this would claim to be unsaved work and
			// would be offered back on the next load as a recovery of nothing.
			dropMirror();
			mirrorNote = null;
			mirrorConflicts = [];
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

	{#if mirrorBlocked}
		<p class="feedback warn" data-testid="engine-mirror-blocked">{ASSIGNMENT_MIRROR_UNAVAILABLE}</p>
	{/if}

	<!--
		WHAT THIS BROWSER PUT BACK, AND WHAT IT DID NOT.

		Two outcomes, so two sentences, and the second half is the one a student
		has to act on: an answer that was NOT put back is one whose only
		remaining copy is the lines in this card. It is rendered as selectable
		text with a Copy control beside it, because the next thing that happens
		to a recovered answer is being pasted back into the field it came from.
	-->
	{#if mirrorNote}
		<section class="card mirror-card" data-testid="engine-mirror-note">
			<h3 class="section-label">Recovered from this browser</h3>
			<p class="mirror-line">{mirrorNote}</p>
			{#if mirrorConflicts.length}
				<ul class="conflict-list" data-testid="engine-mirror-conflicts">
					{#each mirrorConflicts as c (c.blockId)}
						<li class="conflict">
							<p class="conflict-where">{mirrorBlockLabel(spec, c.blockId)}</p>
							<div class="conflict-copy">
								{#each conflictLines(c) as line, i (i)}
									<p class="conflict-text">{line}</p>
								{/each}
							</div>
							<button
								type="button"
								class="btn secondary tiny tap-44"
								data-testid="engine-mirror-copy"
								onclick={() => void copyConflict(c)}
							>
								{copied === c.blockId ? 'Copied' : 'Copy'}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

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
	.mirror-card {
		border-color: var(--cyan);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.mirror-line {
		margin: 0;
		font-size: 0.88rem;
		color: var(--text-1);
	}
	.conflict-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.conflict {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		/* `--boundary` and not `--hairline`: this rule is the only separator
		   between two adjacent recovered answers, each of which carries its own
		   control. */
		border-top: 1px solid var(--boundary);
		padding-top: var(--space-2);
	}
	.conflict-where {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--cyan);
	}
	.conflict-copy {
		width: 100%;
		/* The lines are the only remaining copy, so they are selectable text on
		   a plate of their own rather than a quiet aside. */
		background: var(--bg2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		/* A long answer scrolls inside its own box; the page never does. */
		max-height: 14rem;
		overflow-y: auto;
	}
	.conflict-text {
		margin: 0;
		font-size: 0.85rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		/* `min-width: 0` is not enough on its own for an unbroken paste. */
		min-width: 0;
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
