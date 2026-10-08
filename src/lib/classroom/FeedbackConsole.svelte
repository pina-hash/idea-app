<script lang="ts">
	// THE EAGER HALF OF THE VERSION SUBSTRATE ONLY. `deploy` is a handful of
	// fields and is already on every route through the root layout; the commit
	// LOG it is compared against is `virtual:site-changelog`, which is imported
	// lazily inside the export handler for the reason stated there.
	import { deploy } from 'virtual:site-versions';
	import { onDestroy } from 'svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import { runBulk } from '$lib/classroom/classroom';
	import Disclosure from '$lib/Disclosure.svelte';
	import FeedbackEditForm from '$lib/feedback/FeedbackEditForm.svelte';
	import { saveBytes, saveText } from '$lib/feedback/download';
	import { REPORT_LABEL } from '$lib/feedback/context';
	import {
		FEEDBACK_KINDS,
		FEEDBACK_STATUSES,
		type FeedbackEdit,
		type FeedbackEditDraft,
		type FeedbackEditTransport,
		type FeedbackHorizon,
		type FeedbackRow,
		type FeedbackStatus
	} from '$lib/feedback/feedback';
	import {
		buildFeedbackArchive,
		type FeedbackScreenshotSource
	} from '$lib/feedback/archive';
	import {
		EMPTY_FEEDBACK_FILTER,
		FEEDBACK_UNDO_MS,
		facetValues,
		feedbackBulkSummary,
		feedbackExportName,
		feedbackJson,
		feedbackMarkdown,
		feedbackRowLabel,
		feedbackUndoFor,
		feedbackUndoLabel,
		feedbackUndoSummary,
		filterFeedback,
		type FeedbackBulkOutcome,
		type FeedbackUndo,
		rowBuild,
		rowContact,
		rowDistinctPath,
		rowEdit,
		rowErrorId,
		rowHorizon,
		rowIsAnonymous,
		rowKind,
		rowMessage,
		rowMetaExtras,
		rowOriginal,
		rowRole,
		rowRoute,
		rowSection,
		rowScreenshotPath,
		rowStatusCode,
		rowTried,
		rowUserAgentSummary,
		rowViewport,
		resolveSectionId,
		splitByHorizon,
		type ClassroomSectionInfo,
		type FeedbackFilter
	} from '$lib/feedback/console';

	/**
	 * The admin feedback queue: everything sent from anywhere in the portal,
	 * with the context it was captured with, who sent it, when, and a three-step
	 * status.
	 *
	 * SITE-WIDE SINCE THE SHELL STARTED CARRYING THE AFFORDANCE. It used to read
	 * only `app = 'classroom'`, which was right when the classroom was the only
	 * place with a Feedback button. Now every route has one, so a queue that
	 * filtered to one app would silently hide most of what arrives.
	 *
	 * AN ANONYMOUS REPORT IS VISIBLY ANONYMOUS. 0126 made an authorless row
	 * possible and this queue is the only place one is ever read, so the word is
	 * on the row rather than inferred from an empty name. What it carries
	 * INSTEAD of a name is a contact string the reporter typed, and that is
	 * rendered as exactly what it is: unverified text, never a name, never an
	 * address the console can vouch for. The reporter hash is not in this
	 * payload at all -- 0127 does not return it, deliberately -- so there is
	 * nothing here that could put it on a screen, in an export, or in a
	 * screenshot.
	 *
	 * FILTER FIRST, EXPORT SECOND. The export buttons act on what is on screen,
	 * never on the whole load: what leaves is the ten reports that matter rather
	 * than the semester. The markdown bundle is sized to paste into a chat and
	 * SAYS SO when the budget cut anything -- a silent truncation reads as "that
	 * is all of them".
	 *
	 * Presentation + callbacks only (the DecalReviewQueue / ReviewConsole
	 * convention), so /dev/classroom drives the identical component against an
	 * in-memory store. The gate is the DATABASE's: app_feedback_admin_list and
	 * app_feedback_set_status both open with is_admin(), so the route's 404 is
	 * convenience and the RPCs are the boundary.
	 */
	let {
		ready = true,
		rows,
		classroomSections = [],
		screenshotUrls = {},
		fetchScreenshot,
		setStatus,
		setHorizon,
		horizonUnavailable = null,
		editFeedback,
		now = () => Date.now(),
		undoMs = FEEDBACK_UNDO_MS
	}: {
		ready?: boolean;
		rows: FeedbackRow[];
		/** Live `classroom_sections` rows for every id these rows' `meta.section` names. */
		classroomSections?: ClassroomSectionInfo[];
		/**
		 * A short-lived signed URL per screenshot KEY, minted server-side by the
		 * page load as the admin themselves.
		 *
		 * MINTED THERE AND NOT HERE, and that is the authorization argument
		 * rather than a convenience: the bucket is private and the only readers
		 * are the object's own uploader and an admin, both by storage policy. The
		 * load runs on `locals.supabase`, the caller's own client, so the policy
		 * is what answers -- exactly as it would for a browser. A client that
		 * minted its own would still be the same caller, but the key would then
		 * have to be a URL somewhere, and a URL is the thing that outlives the
		 * screen it was on.
		 *
		 * A KEY WITH NO ENTRY HERE IS A NORMAL STATE, not an error: the mint fails
		 * soft (a backend before 0170 has no bucket at all), and the row then
		 * renders the same sentence a broken thumbnail does.
		 */
		screenshotUrls?: Record<string, string>;
		/**
		 * HOW THE ARCHIVE GETS A SCREENSHOT'S BYTES, or undefined.
		 *
		 * ABSENCE REMOVES THE CONTROL, which is this repo's mechanism rather than
		 * a flag: with no source there is no way to put an image in a zip, and an
		 * archive of reports whose screenshots are all "could not be read" is the
		 * export doing the opposite of what it exists for. So the button is not
		 * rendered at all and the two existing downloads are untouched.
		 *
		 * IT IS A TRANSPORT AND NOT A CLIENT for the ordinary reason: this
		 * component fetches nothing and knows about no bucket. The page wires it
		 * to the admin's own browser client, so the storage policy answers exactly
		 * as it does for the thumbnail already on screen -- `feedback media admin
		 * read` (0170) -- and nothing here had to be widened to get the bytes.
		 *
		 * NOT THE SIGNED URLS ABOVE, DELIBERATELY. Those are minted by the page
		 * load and last five minutes; a queue is worked through for longer than
		 * that, so an export pressed twenty minutes in would fetch a set of
		 * expired links and produce an archive with no images in it and no reason
		 * anybody could see. Asking the store at the moment of the press cannot
		 * go stale.
		 */
		fetchScreenshot?: FeedbackScreenshotSource;
		setStatus: (id: string, status: FeedbackStatus) => Promise<{ ok: boolean; message?: string }>;
		/**
		 * MOVE A REPORT BETWEEN "FIX SOON" AND "LONG-TERM IDEAS" (0230's
		 * `app_feedback_set_horizon`), or undefined. ABSENCE REMOVES THE CONTROL
		 * on every row, which is this console's mechanism for every write it
		 * makes: a backend before 0230 has no such function, and a button whose
		 * only outcome is a refusal must not be offered.
		 */
		setHorizon?: (id: string, horizon: FeedbackHorizon) => Promise<{ ok: boolean; message?: string }>;
		/**
		 * WHY THERE IS NO MOVE CONTROL, when there is none for a reason the page
		 * knows (the database update has not been applied). A control absent for
		 * a reason says the reason, once, above the list.
		 */
		horizonUnavailable?: string | null;
		/**
		 * CORRECT A FILED REPORT'S KIND, MESSAGE AND "TRIED" (0233's
		 * `app_feedback_edit`, report d362bfb3), or undefined. ABSENCE REMOVES
		 * THE EDIT CONTROL ON EVERY ROW: the page hands it in only when its load
		 * saw the `edit` key the 0233 read adds, so a deployment that could only
		 * refuse an edit is never offered one.
		 */
		editFeedback?: FeedbackEditTransport;
		/** Injectable clock, so a harness can pin the export stamp. */
		now?: () => number;
		/**
		 * How long the last move stays undoable. The route never passes it, so
		 * production is always `FEEDBACK_UNDO_MS`; a harness holds it open so a
		 * browser pass can measure the control without racing ten seconds.
		 */
		undoMs?: number;
	} = $props();

	const sectionMap = $derived(new Map(classroomSections.map((s) => [s.id, s])));

	/**
	 * WHATEVER ELSE IS IN A ROW'S `meta`, read through `rowMetaExtras` in
	 * `$lib/feedback/console` -- the export's own reader. This file used to
	 * carry a second, identical copy of that reader and of its list of keys the
	 * named fields already print, which is two lists a new named field (0230's
	 * `horizon` is the latest) has to be added to. One reader, one list.
	 * STUDENT-SUPPLIED TEXT goes through the same escaping every other field on
	 * this card uses: plain Svelte text interpolation, nothing raw-rendered.
	 */
	const metaExtras = rowMetaExtras;

	/**
	 * THE ONE LIST, AND EVERY STATUS CONTROL IS DERIVED FROM IT -- the per-row
	 * buttons, the bulk bar, and the filter tabs below. Adding `spam` (`0188`)
	 * touched exactly this array, which is the point of it being one.
	 *
	 * SPAM IS NOT A DELETE AND ITS UNDO IS THE ROW BESIDE IT. Every row renders
	 * a button for every status it is not currently in, so a report marked spam
	 * carries New, Seen and Resolved -- the reversal is the same control, in the
	 * same place, with no separate restore path to find. That is the whole
	 * reason this is a status rather than a removal: there is nothing to undo
	 * FROM, because nothing was destroyed.
	 */
	const STATUSES = FEEDBACK_STATUSES;

	// --- Edits (0233, report d362bfb3) ---------------------------------------
	//
	// OPTIMISTIC, THE `moved` SHAPE: a correction that landed shows before the
	// page reloads, and wins only while its revision is newer than the row's
	// own, so the reload's answer (which carries who edited it) takes over the
	// moment it arrives.
	let edited = $state<Record<string, FeedbackEdit>>({});
	let editingId = $state<string | null>(null);
	/**
	 * THE OPEN EDIT'S UNSAVED WORDS, held HERE rather than in the form. A
	 * filter change or a bulk move can hide the report being edited, which
	 * moves its card from the list to "Being edited" below and remounts the
	 * form; the new mount opens on these. Null means nothing is unsaved.
	 */
	let editDraft = $state<FeedbackEditDraft | null>(null);
	let editNote = $state<string | null>(null);

	function withEdit(row: FeedbackRow): FeedbackRow {
		const mine = edited[row.id];
		if (!mine) return row;
		return mine.revision > (rowEdit(row)?.revision ?? 0) ? { ...row, edit: mine } : row;
	}

	/**
	 * THE ROWS AS THEY READ NOW, corrections included. Everything below reads
	 * this rather than `rows`, so a correction reaches the card, the facets, the
	 * filter and every export in the same frame.
	 */
	const liveRows = $derived(rows.map(withEdit));

	/**
	 * THE REPORT BEING EDITED, wherever it is. Null when nothing is open, or
	 * when the report is no longer among the rows at all, which reads exactly
	 * as "closed": a form that cannot be put on screen must not hold the Edit
	 * keys hostage.
	 */
	const editingRow = $derived(
		editingId === null || !editFeedback
			? null
			: (liveRows.find((r) => r.id === editingId) ?? null)
	);

	function openEdit(row: FeedbackRow) {
		if (editingId === row.id) return;
		// THE OPEN FORM IS ALWAYS ON SCREEN -- in its place, or under "Being
		// edited" when the filters hide it -- so this refusal always names a
		// form the admin can see and finish.
		if (editingRow && editDraft) {
			error = `Save or discard your edit to ${feedbackRowLabel(editingRow)} first.`;
			return;
		}
		error = null;
		editDraft = null;
		editingId = row.id;
	}

	function closeEdit() {
		editingId = null;
		editDraft = null;
	}

	function editSaved(row: FeedbackRow, edit: FeedbackEdit | null) {
		if (edit) {
			edited = { ...edited, [row.id]: edit };
			editNote = `Saved your edit to ${feedbackRowLabel({ ...row, edit })}. The reporter's own words are kept under As sent.`;
		} else {
			editNote = `Nothing changed on ${feedbackRowLabel(row)}, so no revision was added.`;
		}
		closeEdit();
	}

	/**
	 * WHO CORRECTED IT AND WHEN, as one string so no template whitespace rule
	 * can run the words together ("Editedby ...on").
	 */
	function editedLine(edit: FeedbackEdit | null): string {
		if (!edit) return '';
		const who = edit.edited_by ? ` by ${edit.edited_by}` : '';
		const when = whenLabel(edit.edited_at);
		return `Edited${who}${when ? ` on ${when}` : ''} (revision ${edit.revision})`;
	}

	/** A kind's word, the box's own ("Liked it" for praise), or the stored value. */
	function kindWord(kind: string): string {
		return FEEDBACK_KINDS.find((k) => k.id === kind)?.label ?? kind;
	}

	// OPENS ON NEW REPORTS THAT ARE DUE SOON (0230): a long-term idea is one
	// press away under its own tab, never in the way of this week's triage.
	let filter = $state<FeedbackFilter>({ ...EMPTY_FEEDBACK_FILTER, status: 'new', horizon: 'now' });
	let busyId = $state<string | null>(null);
	let error = $state<string | null>(null);
	/** Optimistic status, so a click lands before the parent reloads. */
	let moved = $state<Record<string, FeedbackStatus>>({});
	/**
	 * Rows whose thumbnail failed to decode, by row id. A screenshot that will
	 * not draw must not leave a broken image icon on a queue: the row falls back
	 * to the link, which still opens the bytes.
	 */
	let brokenShots = $state<Record<string, boolean>>({});

	function statusOf(row: FeedbackRow) {
		return moved[row.id] ?? row.status;
	}

	/** Optimistic horizon, the `moved` shape: a switch lands before the reload. */
	let horizonMoved = $state<Record<string, FeedbackHorizon>>({});
	function horizonOf(row: FeedbackRow): FeedbackHorizon {
		return horizonMoved[row.id] ?? rowHorizon(row);
	}

	// New first is the working order: the queue exists to be worked through,
	// and a resolved note is history.
	const visible = $derived(filterFeedback(liveRows, filter, statusOf, horizonOf));
	/** The report being edited when the filters hide it, or null. */
	const editingHiddenRow = $derived(
		editingRow && !visible.some((r) => r.id === editingRow.id) ? editingRow : null
	);
	/** The two lists the "Both" view renders, from the same filtered set. */
	const split = $derived(splitByHorizon(visible, horizonOf));

	/**
	 * THE ROWS IN THE CHOSEN HORIZON, before any status. The status tabs count
	 * these, so "New (4)" under Long-term ideas means four new long-term ideas
	 * and not four new reports somewhere else on the site.
	 */
	const inHorizon = $derived(
		filter.horizon ? liveRows.filter((r) => horizonOf(r) === filter.horizon) : liveRows
	);
	const horizonCounts = $derived({
		now: liveRows.filter((r) => horizonOf(r) === 'now').length,
		long_term: liveRows.filter((r) => horizonOf(r) === 'long_term').length
	});
	const HORIZON_TABS: { id: '' | FeedbackHorizon; label: string }[] = [
		{ id: 'now', label: 'Fix soon' },
		{ id: 'long_term', label: 'Long-term ideas' },
		{ id: '', label: 'Both' }
	];
	/**
	 * A COUNT PER STATUS, DERIVED FROM `STATUSES` RATHER THAN SPELLED OUT. The
	 * three keys used to be written here by hand, which is one of the two places
	 * a fourth status had to be remembered; now there are none.
	 */
	const counts = $derived(
		Object.fromEntries(
			STATUSES.map((s) => [s.id, inHorizon.filter((r) => statusOf(r) === s.id).length])
		) as Record<FeedbackStatus, number>
	);
	const roles = $derived(facetValues(liveRows, rowRole));
	const sections = $derived(facetValues(liveRows, rowSection));
	/**
	 * THE KINDS PRESENT, READ OFF THE ROWS rather than from `FEEDBACK_KINDS`.
	 *
	 * `app_feedback.kind` is text and this queue reads every app, so the box's
	 * own four are not the whole set: VANGUARD's in-game composer writes its own
	 * rows, and a kind added to the box reaches this queue before anything here
	 * is recompiled. This is the same argument the generic meta pass above is
	 * built on -- a queue that reads its own rows cannot fall behind its own
	 * producers -- and it is why the picker never offers a kind that would
	 * filter to nothing.
	 */
	const kinds = $derived(facetValues(liveRows, (r) => (rowKind(r) ?? '').trim() || null));
	/** How many of the loaded rows carry a screenshot, so the facet says what it would find. */
	const withShots = $derived(liveRows.filter((r) => rowScreenshotPath(r) !== null).length);

	function whenLabel(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	async function move(row: FeedbackRow, status: FeedbackStatus) {
		// A CARD WITH ITS EDIT FORM OPEN DOES NOT MOVE, so the form stays where
		// the admin is typing; the card says so beside its keys.
		if (busyId || undoBusy || editingId === row.id) return;
		// READ BEFORE THE WRITE. `moved` takes the new status the moment the
		// write lands, so asked afterwards the "previous" status would be the one
		// just pressed and the Undo would put the report back where it now is.
		const prev = statusOf(row);
		busyId = row.id;
		error = null;
		const res = await setStatus(row.id, status);
		busyId = null;
		if (!res.ok) {
			// A move that did not land changed nothing, so the Undo on offer (if
			// any) is still about the last move that did.
			error = res.message ?? 'Could not update that.';
			return;
		}
		moved = { ...moved, [row.id]: status };
		// A single move says what moved, the way a bulk one does: the report has
		// usually just left the tab it was on, and the Undo beside this sentence
		// is the way back to it (report R02).
		const landed: FeedbackBulkOutcome[] = [{ row, ok: true }];
		bulkNote = feedbackBulkSummary(status, landed);
		offerUndo(feedbackUndoFor(status, landed, () => prev));
	}

	// --- Horizon (0230) ------------------------------------------------------
	//
	// FILING, NOT REVIEWING: the function leaves status, `reviewed_at` and
	// `reviewed_by` alone, so moving a report between the two lists says nothing
	// about whether anybody has read it. One row at a time, through the one
	// transport; the busy flag clears in `finally` so a throw cannot strand it.
	let horizonBusyId = $state<string | null>(null);
	let horizonNote = $state<string | null>(null);

	async function moveHorizon(row: FeedbackRow, next: FeedbackHorizon) {
		if (!setHorizon || horizonBusyId || editingId === row.id) return;
		horizonBusyId = row.id;
		error = null;
		try {
			const res = await setHorizon(row.id, next);
			if (!res.ok) {
				error = res.message ?? 'Could not move that report.';
				return;
			}
			horizonMoved = { ...horizonMoved, [row.id]: next };
			// SAID ABOVE THE LIST, NOT ON THE ROW: under "Fix soon" the report has
			// just left the list it was on, and a note on its own card would leave
			// with it.
			horizonNote = `Moved ${feedbackRowLabel(row)} to ${next === 'long_term' ? 'Long-term ideas' : 'Fix soon'}.`;
		} catch (e) {
			error = (e as Error).message || 'Could not move that report.';
		} finally {
			horizonBusyId = null;
		}
	}

	// --- Undo (report R02) --------------------------------------------------
	//
	// THE LAST MOVE ONLY, FOR `FEEDBACK_UNDO_MS`. Each report goes back through
	// the SAME `setStatus` transport the move used -- `app_feedback_set_status`,
	// whose own header says a status change is reversed by the same call -- so
	// there is no second write path and no restore RPC. What that costs, said
	// here so nobody reads it as a bug: the database stamps `reviewed_at` and
	// `reviewed_by` on EVERY call (0188), so an undone report records this undo
	// as its last review rather than the review before the mistake.
	//
	// THE TIMER IS `setTimeout`, never an animation frame: a backgrounded tab
	// never ticks one, and an Undo that outlived its window because the tab was
	// hidden would reach back past moves made since.
	let undo = $state<FeedbackUndo | null>(null);
	let undoBusy = $state(false);
	let undoTimer: ReturnType<typeof setTimeout> | null = null;

	/** Offer this undo (or none), replacing whatever was on offer. */
	function offerUndo(next: FeedbackUndo | null) {
		if (undoTimer !== null) clearTimeout(undoTimer);
		undoTimer = null;
		undo = next;
		if (next) {
			undoTimer = setTimeout(() => {
				undoTimer = null;
				undo = null;
			}, undoMs);
		}
	}

	async function runUndo() {
		const current = undo;
		if (!current || undoBusy || bulkBusy || busyId) return;
		// Taken off the screen before the writes start: pressing it twice must
		// not send the batch twice, and nothing here is undoable in turn.
		offerUndo(null);
		undoBusy = true;
		error = null;
		const prevById = new Map(current.entries.map((e) => [e.row.id, e.prev]));
		try {
			const outcome = await runBulk(
				current.entries.map((e) => e.row.id),
				(id) => setStatus(id, prevById.get(id) ?? current.status)
			);
			const back = new Set(outcome.succeededIds);
			const next = { ...moved };
			for (const id of outcome.succeededIds) {
				const prev = prevById.get(id);
				if (prev) next[id] = prev;
			}
			moved = next;
			bulkNote = feedbackUndoSummary(
				current,
				current.entries.map((e) => ({
					row: e.row,
					ok: back.has(e.row.id),
					message: back.has(e.row.id) ? null : outcome.firstFailureMessage
				}))
			);
		} catch (e) {
			// A THROW SAYS NOTHING ABOUT WHICH WRITES LANDED, the bulk bar's rule.
			error = `${(e as Error).message || 'That undo failed.'} Some of the reports may already be back -- reload before moving them again.`;
		} finally {
			undoBusy = false;
		}
	}

	onDestroy(() => {
		if (undoTimer !== null) clearTimeout(undoTimer);
		undoTimer = null;
	});

	// --- Bulk status ------------------------------------------------------
	//
	// THE SAME SELECTION PATTERN THE CLASS STREAM ALREADY USES: a checkbox per
	// row, a bar that appears only while something is checked, and `runBulk`
	// for the writes -- the shared implementation, so one refusal never
	// obscures whether the rest landed and a partial result leaves exactly the
	// refused ids selected for the retry.
	//
	// THERE IS NO BULK RPC AND THIS DOES NOT WANT ONE. `app_feedback_set_status`
	// takes a single id, so a batch is N independent writes that cannot be
	// atomic; the answer the constraint calls for is a PER-ITEM OUTCOME, which
	// is what `feedbackBulkSummary` reports.
	let selected = $state<Set<string>>(new Set());
	let bulkBusy = $state(false);
	let bulkNote = $state<string | null>(null);

	/**
	 * WHAT A BULK ACTION WOULD ACTUALLY TOUCH, and every count, label and write
	 * below reads it rather than `selected` itself.
	 *
	 * A BULK ACTION OVER ROWS NOBODY CAN SEE is the failure this queue is least
	 * able to report: the filters here are the working surface (filter first,
	 * then act), so ids checked under one filter are routinely off screen under
	 * the next. Intersecting with `visible` at the point of use means a hidden
	 * row can never be moved by a press, while narrowing a facet and widening
	 * it again does not silently throw the selection away.
	 */
	const selectedRows = $derived(visible.filter((r) => selected.has(r.id)));
	const allShownSelected = $derived(
		visible.length > 0 && visible.every((r) => selected.has(r.id))
	);

	function toggleSelected(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	function selectAllShown() {
		selected = new Set(visible.map((r) => r.id));
		bulkNote = null;
	}

	function clearSelection() {
		selected = new Set();
		bulkNote = null;
	}

	async function bulkMove(status: FeedbackStatus) {
		const batch = selectedRows;
		if (bulkBusy || undoBusy || batch.length === 0) return;
		// READ BEFORE THE WRITES, for the reason `move` states.
		const prevById = new Map(batch.map((r) => [r.id, statusOf(r)]));
		bulkBusy = true;
		error = null;
		bulkNote = null;
		// THE BUSY FLAG CLEARS IN `finally`. `runBulk` is a `Promise.all`, so a
		// transport that THROWS rather than answering `{ok:false}` rejects the
		// whole batch -- and a busy flag left set disables every control in this
		// bar for the rest of the session, over a queue somebody is part-way
		// through moving.
		try {
			const outcome = await runBulk(
				batch.map((r) => r.id),
				(id) => setStatus(id, status)
			);
			const landed = new Set(outcome.succeededIds);
			// Optimistic, exactly as the single-row move is: what landed shows its
			// new status before the parent reloads.
			const next = { ...moved };
			for (const id of outcome.succeededIds) next[id] = status;
			moved = next;
			const outcomes: FeedbackBulkOutcome[] = batch.map((row) => ({
				row,
				ok: landed.has(row.id),
				message: landed.has(row.id) ? null : outcome.firstFailureMessage
			}));
			bulkNote = feedbackBulkSummary(status, outcomes);
			// Only what LANDED can be taken back; a refused row never moved.
			offerUndo(feedbackUndoFor(status, outcomes, (r) => prevById.get(r.id) ?? r.status));
			// Only what did NOT move stays checked, so pressing again retries the
			// rest rather than re-sending the ones already through.
			selected = new Set(outcome.failedIds);
		} catch (e) {
			// A THROW SAYS NOTHING ABOUT WHICH WRITES LANDED, so the selection is
			// left exactly as it was and the sentence says so rather than
			// implying none of them did. No Undo is offered for a batch nobody can
			// account for, and the one before it is withdrawn: it would reach back
			// past a move that may have half landed.
			offerUndo(null);
			error = `${(e as Error).message || 'That batch failed.'} Some of the selected reports may already have moved -- reload before pressing again.`;
		} finally {
			bulkBusy = false;
		}
	}

	let exportNote = $state<string | null>(null);

	/**
	 * WHETHER THE NAMES LEAVE WITH THE BUNDLE, decided HERE rather than noticed
	 * afterwards. Included by default: knowing who to go and ask is most of what
	 * makes a report actionable, and a queue that quietly anonymised everything
	 * would be answering a question nobody asked. The bundle states which way
	 * this was set, so a bundle with no names cannot be read as a bundle from
	 * nobody.
	 */
	let includeSubmitter = $state(true);
	const identityNote = $derived(
		includeSubmitter
			? ''
			: ' Submitter names, addresses and anonymous contact strings were withheld.'
	);

	/**
	 * The download, through the ONE implementation of the click
	 * (`$lib/feedback/download`), which the Armory consoles share.
	 */
	const download = saveText;
	const downloadBytes = saveBytes;

	function exportMarkdown() {
		const stamp = new Date(now()).toISOString();
		// VISIBLE ROWS, NOT `rows`: filtering happens before export.
		const bundle = feedbackMarkdown(visible, {
			filter,
			generatedAt: stamp,
			includeSubmitter,
			classroomSections: sectionMap
		});
		download(feedbackExportName('md', stamp.slice(0, 19)), bundle.text, 'text/markdown');
		const shape = bundle.grouped ? ' Grouped by route.' : '';
		exportNote =
			bundle.dropped > 0
				? `Exported ${bundle.included} of ${visible.length} filtered reports as markdown. ${bundle.dropped} did not fit the pasteable budget and are named at the end of the file.${shape}${identityNote}`
				: `Exported ${bundle.included} filtered report${bundle.included === 1 ? '' : 's'} as markdown.${shape}${identityNote}`;
	}

	function exportJson() {
		const stamp = new Date(now()).toISOString();
		const text = feedbackJson(visible, {
			filter,
			generatedAt: stamp,
			includeSubmitter,
			classroomSections: sectionMap
		});
		download(feedbackExportName('json', stamp.slice(0, 19)), text, 'application/json');
		exportNote = `Exported ${visible.length} filtered report${visible.length === 1 ? '' : 's'} as JSON.${identityNote}`;
	}

	/**
	 * THE ARCHIVE. A zip with every filtered report, its own markdown, and the
	 * bytes of its screenshot sitting in the same folder.
	 *
	 * IT IS BUILT IN THE BROWSER, FROM WHAT THIS CONSOLE ALREADY HOLDS, and a
	 * server route was the rejected alternative. The rows are on screen, the
	 * two existing exports are already assembled here, and `buildZip` is the
	 * same writer the Foundry submit path runs in a browser tab -- so a route
	 * would re-derive rows it was handed, add a second surface holding an admin
	 * payload, and buy nothing. What it would COST is real: the bytes would make
	 * two trips instead of one, and the route would be a second place the
	 * storage policy had to be satisfied.
	 *
	 * THE COMMIT LOG IS IMPORTED LAZILY AND THAT IS A PAYLOAD BOUNDARY, not a
	 * performance tweak. `virtual:site-changelog`'s own declaration says to
	 * reach it only through `await import()`, and only on a surface about to
	 * render the log: it is the full commit history, and a static import here
	 * would put it in whatever shared chunk this console lands in. A press is
	 * exactly the moment it is about to be read.
	 *
	 * IT FAILS SOFT AND SAYS SO. Nothing on this page depends on the archive, so
	 * a throw anywhere in it reports a sentence beside the button rather than
	 * taking the queue down mid-triage.
	 */
	let archiveBusy = $state(false);

	async function exportArchive() {
		if (!fetchScreenshot || archiveBusy) return;
		archiveBusy = true;
		exportNote = null;
		try {
			const stamp = new Date(now()).toISOString();
			const { entries } = await import('virtual:site-changelog');
			const archive = await buildFeedbackArchive(visible, fetchScreenshot, {
				filter,
				generatedAt: stamp,
				includeSubmitter,
				classroomSections: sectionMap,
				commitLog: entries,
				head: deploy
			});
			downloadBytes(archive.name, archive.bytes);
			// EVERY NUMBER THE ARCHIVE KNOWS, INCLUDING THE ONES THAT ARE ZERO. A
			// count of images left out is exactly the figure somebody would
			// otherwise discover by unzipping and finding nothing there.
			// BYTES UNDER A KILOBYTE ARE PRINTED AS BYTES. Rounded to KB, a real
			// 74-byte fixture reported "1 screenshot (0 KB)", which reads as an
			// image that did not make it.
			const size =
				archive.imageBytes < 1024
					? `${archive.imageBytes} bytes`
					: archive.imageBytes < 1024 * 1024
						? `${Math.round(archive.imageBytes / 1024)} KB`
						: `${(archive.imageBytes / 1024 / 1024).toFixed(1)} MB`;
			const shots = `${archive.images} screenshot${archive.images === 1 ? '' : 's'} (${size})`;
			const left = archive.missing.length
				? ` ${archive.missing.length} screenshot${archive.missing.length === 1 ? '' : 's'} could not be included; each report says which and why.`
				: '';
			exportNote = `Exported ${archive.reports} filtered report${archive.reports === 1 ? '' : 's'} as an archive, with ${shots}.${left}${identityNote}`;
		} catch (e) {
			exportNote = null;
			error = `That archive could not be built: ${(e as Error).message || 'unknown failure'}. The markdown and JSON exports are unaffected.`;
		} finally {
			archiveBusy = false;
		}
	}

	function clearFilter() {
		filter = { ...EMPTY_FEEDBACK_FILTER };
		exportNote = null;
	}
</script>

<svelte:head>
	<title>Feedback // IDEA</title>
</svelte:head>

<!--
	NO MASTHEAD HERE: the page that mounts the console owns its chrome. Since
	report R03 that is /admin/feedback, which puts the portal's own app header
	above it; the console is site-wide, so it no longer lives inside the
	classroom shell. It also no longer sits inside the classroom's `.cr-root`
	room, so nothing below may lean on classroom.css: every class it styles is
	its own, the site's (`.card`, `.btn`, `.hero`), or the site plate's.
-->
<main class="fb-page cr-instructor-surface">
	<section class="hero">
		<div class="eyebrow">IDEA // Admin</div>
		<h1>Feedback</h1>
		<p class="lead">
			Everything sent from the {REPORT_LABEL} control, anywhere in the portal, with the route,
			role, section and build it was captured with.
		</p>
	</section>

	{#if !ready}
		<section class="card">
			<p class="feedback error">
				The feedback queue is not available yet -- migration 0085 does not appear to be applied.
			</p>
		</section>
	{:else}
		{#if error}
			<p class="feedback error">{error}</p>
		{/if}

		<!--
			WHEN EACH REPORT IS FOR (0230), above the status tabs because it is the
			coarser cut: "Fix soon" is what a round works from, "Long-term ideas"
			is the list of big ideas for later, and "Both" shows the two as two
			lists. The same keys as the status tabs below.
		-->
		<div class="filters fbc-horizons" role="tablist" aria-label="When each report is for">
			{#each HORIZON_TABS as h (h.id)}
				<button
					type="button"
					role="tab"
					class="fbc-control filter"
					class:active={filter.horizon === h.id}
					aria-selected={filter.horizon === h.id}
					data-testid="fbc-horizon-{h.id || 'both'}"
					onclick={() => (filter = { ...filter, horizon: h.id })}
				>
					{h.label} ({h.id ? horizonCounts[h.id] : liveRows.length})
				</button>
			{/each}
		</div>
		{#if horizonUnavailable && !setHorizon}
			<p class="note fbc-horizon-unavailable">{horizonUnavailable}</p>
		{/if}

		<div class="filters" role="tablist" aria-label="Status filter">
			<!--
				THE TABS ARE `STATUSES` PLUS `all`, in that order, so a status added
				to the one list gets its tab with nothing else to remember. `all`
				stays LAST and stays LITERAL: it means every status, spam included,
				and the export header prints `status: all` for it -- so nothing this
				console can be pointed at silently omits a row.
			-->
			{#each [...STATUSES.map((s) => ({ id: s.id, label: `${s.label} (${counts[s.id]})` })), { id: 'all' as const, label: `All (${inHorizon.length})` }] as f (f.id)}
				<button
					type="button"
					role="tab"
					class="fbc-control filter"
					class:active={filter.status === f.id}
					aria-selected={filter.status === f.id}
					onclick={() => (filter = { ...filter, status: f.id })}
				>
					{f.label}
				</button>
			{/each}
		</div>

		<section class="card facets">
			<div class="facet">
				<label class="facet-label" for="fbc-route">Route</label>
				<input
					id="fbc-route"
					class="fbc-control fbc-input"
					type="search"
					placeholder="/notebook"
					bind:value={filter.route}
				/>
			</div>
			<div class="facet">
				<label class="facet-label" for="fbc-role">Role</label>
				<select id="fbc-role" class="fbc-control fbc-input" bind:value={filter.role}>
					<option value="">Any role</option>
					{#each roles as r (r)}<option value={r}>{r}</option>{/each}
				</select>
			</div>
			<div class="facet">
				<label class="facet-label" for="fbc-section">Section</label>
				<select id="fbc-section" class="fbc-control fbc-input" bind:value={filter.section}>
					<option value="">Any section</option>
					{#each sections as sec (sec)}<option value={sec}>{sec}</option>{/each}
				</select>
			</div>
			<!--
				KIND AND SCREENSHOT SIT WITH THE OTHER FACETS, not in a second row
				of their own: they are the same kind of narrowing and the same
				control shape, and `.fbc-control` is where the 44px floor is
				stated once for all of them.
			-->
			<div class="facet">
				<label class="facet-label" for="fbc-kind">Kind</label>
				<select id="fbc-kind" class="fbc-control fbc-input" bind:value={filter.kind}>
					<option value="">Any kind</option>
					{#each kinds as k (k)}<option value={k}>{k}</option>{/each}
				</select>
			</div>
			<div class="facet">
				<label class="facet-label" for="fbc-shot">Screenshot</label>
				<select id="fbc-shot" class="fbc-control fbc-input" bind:value={filter.shot}>
					<option value="">Any</option>
					<!-- THE COUNT IS IN THE LABEL because a facet that would find
					     nothing should say so before it is chosen, not after. -->
					<option value="with">With one ({withShots})</option>
					<option value="without">Without one ({liveRows.length - withShots})</option>
				</select>
			</div>
			<div class="facet">
				<label class="facet-label" for="fbc-from">From</label>
				<input id="fbc-from" class="fbc-control fbc-input" type="date" bind:value={filter.from} />
			</div>
			<div class="facet">
				<label class="facet-label" for="fbc-to">To</label>
				<input id="fbc-to" class="fbc-control fbc-input" type="date" bind:value={filter.to} />
			</div>
			<div class="facet facet-actions">
				<button type="button" class="fbc-control btn secondary" onclick={clearFilter}>
					Clear filters
				</button>
			</div>
		</section>

		<div class="export-row">
			<span class="export-count">
				{visible.length} of {liveRows.length} shown
			</span>
			<!-- FILTER FIRST, THEN SELECT. It sits beside the count it acts on
			     rather than in the bulk bar below, because the bulk bar appears
			     only once something is checked and a select-all inside it would
			     be a control you can only reach after doing its job by hand. -->
			<button
				type="button"
				class="fbc-control btn secondary"
				disabled={visible.length === 0 || allShownSelected}
				data-testid="fbc-select-all"
				onclick={selectAllShown}
			>
				Select all shown
			</button>
			<label class="export-identity" for="fbc-identity">
				<input
					id="fbc-identity"
					class="fbc-control"
					type="checkbox"
					bind:checked={includeSubmitter}
				/>
				<!-- A contact string is the only thing on an anonymous row that can
				     name a person, so it travels with this decision rather than
				     beside it. -->
				<span>Include submitter names and contacts</span>
			</label>
			<button
				type="button"
				class="fbc-control btn secondary"
				disabled={visible.length === 0}
				onclick={exportMarkdown}
			>
				Export markdown
			</button>
			<button
				type="button"
				class="fbc-control btn secondary"
				disabled={visible.length === 0}
				onclick={exportJson}
			>
				Export JSON
			</button>
			<!--
				A THIRD OPTION BESIDE THE OTHER TWO, never a replacement for them.
				It is rendered only where a screenshot source was handed in:
				absence removes the control, so an archive whose every image says
				"could not be read" is not something this console can produce.
			-->
			{#if fetchScreenshot}
				<button
					type="button"
					class="fbc-control btn secondary"
					disabled={visible.length === 0 || archiveBusy}
					data-testid="fbc-export-archive"
					onclick={exportArchive}
				>
					{archiveBusy ? 'Building archive...' : 'Export archive (zip)'}
				</button>
			{/if}
		</div>
		{#if exportNote}
			<p class="note export-note" aria-live="polite">{exportNote}</p>
		{/if}

		<!-- THE BULK BAR, on the class stream's own terms: it appears only while
		     something is checked, it sits above the list it acts on, and its
		     controls carry the 44px floor because a mis-hit here moves somebody
		     else's reports. -->
		{#if selectedRows.length > 0}
			<div class="bulk-bar" data-testid="fbc-bulk-bar">
				<span class="bulk-count" data-testid="fbc-bulk-count">
					{selectedRows.length} selected
				</span>
				{#each STATUSES as s (s.id)}
					<button
						type="button"
						class="fbc-control btn secondary"
						disabled={bulkBusy || undoBusy}
						data-testid="fbc-bulk-{s.id}"
						onclick={() => bulkMove(s.id)}
					>
						{s.label}
					</button>
				{/each}
				<button
					type="button"
					class="fbc-control btn secondary"
					disabled={bulkBusy || undoBusy}
					data-testid="fbc-bulk-clear"
					onclick={clearSelection}
				>
					Clear selection
				</button>
			</div>
		{/if}
		{#if bulkNote || undo}
			<!-- NAMED, NOT COUNTED. A partial batch has to say which reports
			     moved, or the next press repeats the half that already did.
			     THE UNDO SITS BESIDE WHAT IT UNDOES (report R02) and says where it
			     puts the reports in its own words, so it still reads right if the
			     sentence beside it has been cleared by a selection change. -->
			<div class="bulk-note-row">
				{#if bulkNote}
					<p class="note bulk-note" id="fbc-bulk-note" aria-live="polite" data-testid="fbc-bulk-note">
						{bulkNote}
					</p>
				{/if}
				{#if undo}
					<button
						type="button"
						class="fbc-control btn secondary bulk-undo"
						data-testid="fbc-undo"
						aria-describedby={bulkNote ? 'fbc-bulk-note' : undefined}
						disabled={undoBusy || bulkBusy || busyId !== null}
						onclick={runUndo}
					>
						{feedbackUndoLabel(undo)}
					</button>
				{/if}
			</div>
		{/if}

		{#if horizonNote}
			<p class="note fbc-horizon-note" aria-live="polite" data-testid="fbc-horizon-note">
				{horizonNote}
			</p>
		{/if}
		{#if editNote}
			<!-- SAID ABOVE THE LIST, like the horizon note: an edit that changed
			     the kind can take the report off the list it was on. -->
			<p class="note fbc-edit-note" aria-live="polite" data-testid="fbc-edit-note">{editNote}</p>
		{/if}

		{#snippet reportRow(row: FeedbackRow)}
			<article class="card fb-row" class:resolved={statusOf(row) === 'resolved'}>
				<div class="fb-head">
					<input
						type="checkbox"
						class="fbc-control fb-select"
						checked={selected.has(row.id)}
						aria-label="Select the report from {rowRoute(row)}"
						data-testid="fbc-select-{row.id}"
						onchange={() => toggleSelected(row.id)}
					/>
					<span class="fb-kind">{rowKind(row)}</span>
					<span class="fb-route">{rowRoute(row)}</span>
					<span class="fb-when">{whenLabel(row.created_at)}</span>
					<span class="fb-status status-{statusOf(row)}">{statusOf(row)}</span>
					{#if horizonOf(row) === 'long_term'}
						<!-- A RECESSED TAG with the word in it, on every long-term row in
						     every view: the list heading is not on screen once a long
						     list has scrolled. -->
						<span class="chip fb-horizon-chip" data-testid="fbc-long-term-chip">Long-term</span>
					{/if}
					{#if rowEdit(row)}
						<!-- THE WORD, NOT A COLOUR: a corrected report says it is one on
						     its own card, in every view, whatever list it sits in. -->
						<span class="chip fb-horizon-chip fb-edited-chip" data-testid="fbc-edited-chip">Edited</span>
					{/if}
				</div>
				{#if editFeedback && editingId === row.id}
					<FeedbackEditForm
						{row}
						{editFeedback}
						{now}
						draft={editDraft}
						ondraft={(d) => (editDraft = d)}
						onsaved={(edit) => editSaved(row, edit)}
						oncancel={closeEdit}
					/>
				{:else}
					<p class="fb-message">{rowMessage(row)}</p>
					{#if rowTried(row)}
						<!-- WHAT THEY TRIED, LABELLED AND SET APART FROM THE MESSAGE.
						     Two pieces of prose run together read as one, and the whole
						     point of this field is that it answers a different question
						     from the one above it. Plain text interpolation, like every
						     other field on this card: this component raw-renders
						     nothing, so there is no second escaping decision here. -->
						<div class="fb-tried">
							<span class="fb-tried-label">Tried first</span>
							<p class="fb-tried-text">{rowTried(row)}</p>
						</div>
					{/if}
				{/if}
				{#if rowEdit(row)}
					{@const edit = rowEdit(row)}
					{@const original = rowOriginal(row)}
					<p class="fb-edited" data-testid="fbc-edited-line">{editedLine(edit)}</p>
					<!-- THE REPORTER'S OWN WORDS, ONE PRESS AWAY: closed by default
					     and remembering nothing, as plain text like every other
					     field on this card. -->
					<div class="fb-as-sent" data-testid="fbc-as-sent">
						<Disclosure label="As sent" collapseWhen={true} testId="fbc-as-sent-toggle">
							<dl class="fb-as-sent-list">
								<dt>Kind</dt>
								<dd>{kindWord(original.kind)}</dd>
								<dt>Message</dt>
								<dd class="fb-as-sent-text">{original.message}</dd>
								<dt>Tried first</dt>
								<dd class="fb-as-sent-text">{original.tried ?? 'Nothing given'}</dd>
							</dl>
						</Disclosure>
					</div>
				{/if}
				{#if rowScreenshotPath(row)}
					<div class="fb-shot">
						{#if screenshotUrls[rowScreenshotPath(row) ?? '']}
							<!--
								A THUMBNAIL, AND THE LINK BESIDE IT IS THE SAME URL. An
								`<img>` is not a navigation: the element decodes an image
								or fails, script does not run in it, and the bucket admits
								no SVG in the first place. The URL carries `download=`, so
								a person who follows the link saves the file rather than
								having the reporter's bytes rendered as a document on a
								host of ours -- which is the property the classroom file
								rule is actually about.

								IF IT WILL NOT DECODE, THE ROW FALLS BACK TO THE LINK,
								through the img's own `onerror`. A broken image icon on a
								triage queue is a defect nobody can act on.
							-->
							<a
								class="fb-shot-link"
								href={screenshotUrls[rowScreenshotPath(row) ?? '']}
								target="_blank"
								rel="noopener"
							>
								{#if !brokenShots[row.id]}
									<img
										class="fb-shot-thumb"
										src={screenshotUrls[rowScreenshotPath(row) ?? '']}
										alt="Screenshot attached to this report"
										loading="lazy"
										onerror={() => (brokenShots = { ...brokenShots, [row.id]: true })}
									/>
								{/if}
								<span class="fb-shot-word">
									{brokenShots[row.id]
										? 'Screenshot (this browser could not display it, open it here)'
										: 'Open the screenshot'}
								</span>
							</a>
						{:else}
							<!-- A key with no URL. Said plainly rather than rendered as a
							     broken picture: the object may be gone, or this backend
							     may not have the bucket at all. -->
							<p class="fb-shot-missing">
								A screenshot is attached, but no link could be made for it.
							</p>
						{/if}
					</div>
				{/if}
				<ul class="fb-context">
					{#if rowDistinctPath(row)}<li>path {rowDistinctPath(row)}</li>{/if}
					{#if rowRole(row)}<li>role {rowRole(row)}</li>{/if}
					{#if rowSection(row)}<li>section {resolveSectionId(rowSection(row), sectionMap)?.label}</li>{/if}
					{#if rowViewport(row)}<li>viewport {rowViewport(row)}</li>{/if}
					{#if rowUserAgentSummary(row)}<li>{rowUserAgentSummary(row)}</li>{/if}
					{#if rowStatusCode(row) !== null}<li>http {rowStatusCode(row)}</li>{/if}
					{#if rowErrorId(row)}<li>error id {rowErrorId(row)}</li>{/if}
					{#each metaExtras(row) as extra (extra.key)}<li>{extra.key} {extra.value}</li>{/each}
				</ul>
				{#if rowBuild(row)}
					<!-- THE VALUE NEVER TRAVELS WITHOUT WHAT IT MEANS. Neither
					     available identifier is a hash of the built artifact, and a
					     bare hex string in this position gets read as one. -->
					<p class="fb-build">
						<span class="fb-build-value">{rowBuild(row)?.value}</span>
						<span class="fb-build-means">{rowBuild(row)?.means}</span>
					</p>
				{/if}
				<div class="fb-foot">
					<span class="fb-who">
						{#if rowIsAnonymous(row)}
							<!-- THE WORD, not a colour and not a blank. -->
							<span class="fb-anon">Anonymous</span>
							{#if rowContact(row)}
								<span class="fb-contact">
									asked to be reached at "{rowContact(row)}"
								</span>
								<span class="fb-contact-warn">
									typed by the reporter, nothing verified it
								</span>
							{:else}
								<span class="fb-contact-warn">left no way to be reached</span>
							{/if}
						{:else}
							{row.submitter_name || row.submitter_email || 'unknown'}
							{#if row.submitter_email}<span class="fb-email">{row.submitter_email}</span>{/if}
						{/if}
					</span>
					<span class="fb-actions">
						{#each STATUSES as s (s.id)}
							<button
								type="button"
								class="fbc-control btn secondary"
								disabled={busyId === row.id || undoBusy || statusOf(row) === s.id}
								aria-disabled={editingId === row.id ? 'true' : undefined}
								aria-describedby={editingId === row.id ? `fb-edit-hold-${row.id}` : undefined}
								onclick={() => move(row, s.id)}
							>
								{s.label}
							</button>
						{/each}
						{#if setHorizon}
							<button
								type="button"
								class="fbc-control btn secondary fb-horizon-move"
								data-testid="fbc-horizon-move-{row.id}"
								disabled={horizonBusyId === row.id}
								aria-disabled={editingId === row.id ? 'true' : undefined}
								aria-describedby={editingId === row.id ? `fb-edit-hold-${row.id}` : undefined}
								onclick={() =>
									moveHorizon(row, horizonOf(row) === 'long_term' ? 'now' : 'long_term')}
							>
								{horizonOf(row) === 'long_term' ? 'Move to fix soon' : 'Move to long-term'}
							</button>
						{/if}
						<!-- LAST IN THE ROW, so the status keys keep their places. Absent
						     with no transport (a deployment before 0233), and absent on
						     the row whose form is open, which carries its own Cancel. -->
						{#if editFeedback && editingId !== row.id}
							<button
								type="button"
								class="fbc-control btn secondary fb-edit"
								data-testid="fbc-edit-{row.id}"
								onclick={() => openEdit(row)}
							>
								Edit
							</button>
						{/if}
					</span>
				</div>
				{#if editFeedback && editingId === row.id}
					<!-- WHY THE KEYS ABOVE ARE UNLIT, in words, and named by each of
					     them: aria-disabled rather than disabled, so a press reaches
					     a control that can explain itself. -->
					<p class="fb-edit-hold" id="fb-edit-hold-{row.id}" data-testid="fbc-edit-hold">
						Save or discard the edit to move this report.
					</p>
				{/if}
				{#if row.reviewed_by && statusOf(row) === row.status}
					<p class="fb-review">
						Last moved by {row.reviewed_by}{#if row.reviewed_at} on {whenLabel(row.reviewed_at)}{/if}
					</p>
				{/if}
			</article>
		{/snippet}

		{#if editingHiddenRow}
			<!--
				AN OPEN EDIT THE FILTERS NOW HIDE STAYS ON SCREEN. A filter change or a
				bulk move can take the report being edited off the list; dropping its
				card would drop the typing with it and leave the Edit keys refusing
				over a form nobody can see. So it sits here, above the list, with the
				words it held, until it is saved or discarded. It is not in any count
				or export: those are the filtered list's.
			-->
			<section class="fbc-group fbc-editing" aria-labelledby="fbc-editing-title" data-testid="fbc-editing-hidden">
				<h2 class="fbc-group-title" id="fbc-editing-title">Being edited</h2>
				<p class="note fbc-editing-note">
					These filters hide this report. It stays here with your edit until you save or discard it.
				</p>
				{@render reportRow(editingHiddenRow)}
			</section>
		{/if}

		{#if filter.horizon === ''}
			<!--
				BOTH, AS TWO LISTS (0230): the long-term ideas in their own list
				under their own heading, so a reader sees which is which without
				reading a chip on every card. Each list says when it is empty.
			-->
			{#each [{ id: 'now', title: 'Fix soon', list: split.now }, { id: 'long_term', title: 'Long-term ideas', list: split.longTerm }] as group (group.id)}
				<section class="fbc-group" aria-labelledby="fbc-group-{group.id}" data-testid="fbc-group-{group.id}">
					<h2 class="fbc-group-title" id="fbc-group-{group.id}">
						{group.title} ({group.list.length})
					</h2>
					{#if group.list.length === 0}
						<section class="card">
							<p class="note">Nothing here matches those filters.</p>
						</section>
					{:else}
						{#each group.list as row (row.id)}
							{@render reportRow(row)}
						{/each}
					{/if}
				</section>
			{/each}
		{:else if visible.length === 0}
			<section class="card">
				<p class="note">Nothing matches those filters.</p>
			</section>
		{:else}
			{#each visible as row (row.id)}
				{@render reportRow(row)}
			{/each}
		{/if}
	{/if}

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	/*
		THE ERROR LINE IS STATED HERE because the console left the classroom room
		(report R03): classroom.css styles `.feedback.error` only under
		`.cr-root`, and /admin/feedback is not inside one, so without this a
		refusal rendered as an unmarked paragraph. The same look, read from the
		same site tokens: amber is the register's warning ink, never crimson,
		and the word carries the meaning, not the colour. Computed from the token
		values (not a browser reading): amber is 5.74:1 on the site plate's page
		ground (#161918) and 4.90:1 on an unplated --bg1.
	*/
	.feedback {
		margin: 0 0 0.8rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
		padding: var(--space-2) 0.65rem;
		border-radius: var(--radius-card);
		border: 1px solid var(--hairline);
	}
	.feedback.error {
		color: var(--amber);
		border-color: var(--amber);
	}

	.fb-page {
		max-width: var(--cr-measure, var(--measure-form));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}

	/*
		THE TAP-TARGET FLOOR, IN ONE PLACE. Every interactive control on this page
		carries `.fbc-control`, so the status buttons (which measured 22.9px, under
		even the 24px absolute floor) and everything standing beside them are one
		rule rather than several that can drift apart. One compliant control next
		to a non-compliant one reads as a broken row, which is why the filter
		pills, the facet inputs and the export buttons are in the same set.
		Nothing here sits inside a locked density contract, so there is nothing to
		trade against.
	*/
	.fbc-control {
		min-height: 44px;
		min-width: 44px;
	}

	.filters {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-bottom: var(--space-3);
	}
	.filter {
		appearance: none;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		padding: 0 0.9rem;
		cursor: pointer;
	}
	.filter.active {
		color: var(--green);
		border-color: var(--line-strong);
	}

	/* The horizon tabs sit tighter to the status tabs than the status tabs sit
	   to the facets: the two rows are one filter, read top down. */
	.fbc-horizons {
		margin-bottom: var(--space-2);
	}
	.fbc-horizon-unavailable,
	.fbc-horizon-note {
		margin: 0 0 var(--space-3);
	}
	.fbc-group {
		margin-bottom: var(--space-3);
	}
	/* A list heading, in the page's own label voice: the mono tier at the
	   11px floor and up, never a status hue. */
	.fbc-group-title {
		margin: var(--space-3) 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 400;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-1);
	}
	.fbc-group-title::before {
		content: none;
	}
	/* THE LONG-TERM TAG. Under the plate it is the shared recessed `.chip`;
	   unplated it is an outlined tag. Its word is the signal, in the body ink,
	   so it reads on every ground the card can be (`--text-1`, not a hue). */
	.fb-horizon-chip {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
	}

	.facets {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		align-items: end;
		margin-bottom: var(--space-3);
	}
	.facet {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		/* An item's automatic minimum is its min-content, so without this a date
		   input pushes the row wider than the page. */
		min-width: 0;
		flex: 1 1 9rem;
	}
	.facet-actions {
		flex: 0 0 auto;
		justify-content: flex-end;
	}
	.facet-label {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.fbc-input {
		width: 100%;
		box-sizing: border-box;
		padding: 0 0.6rem;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.88rem;
	}
	.fbc-input:focus-visible {
		outline: 1px solid var(--green);
		outline-offset: 1px;
	}

	.export-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: var(--space-3);
	}
	.export-count {
		flex: 1;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.export-note {
		margin: 0 0 var(--space-3);
	}
	/* THE BULK BAR: a peer of the export row above it, appearing only while
	   something is checked, and sitting above the list it acts on. Its
	   controls carry `.fbc-control` like every other control on this page, so
	   the 44px floor is stated once rather than re-derived per bar. */
	.bulk-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
	}
	.bulk-count {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		margin-right: var(--space-1);
	}
	/* The note and its Undo share one row; the row carries the spacing the note
	   used to, and the note takes the width so a long sentence wraps beside the
	   control rather than pushing it off a phone's edge. */
	.bulk-note-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
	}
	.bulk-note {
		flex: 1 1 16rem;
		min-width: 0;
		margin: 0;
	}
	.bulk-undo {
		flex: none;
	}
	/* The checkbox leads the row's head line; `flex: none` keeps it from being
	   stretched by the wrapping row around it. */
	.fb-select {
		flex: none;
	}
	.export-identity {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
		cursor: pointer;
	}

	.fb-row {
		margin-bottom: 0.8rem;
	}
	.fb-row.resolved {
		opacity: 0.72;
	}
	.fb-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.fb-kind,
	.fb-status {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.02rem 0.5rem;
		color: var(--text-2);
	}
	.fb-status.status-new {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.fb-status.status-seen {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	/*
	   SPAM IS AMBER, NOT CRIMSON. `--crimson` is reserved for live/rec/error and
	   a spam report is neither an error nor an identity -- it is a warning about
	   the row's contents, which is exactly what `--amber` means in this register.
	   THE HUE IS NEVER THE ONLY SIGNAL: the chip prints the word, as every other
	   status chip does, and the row's own buttons say which state it is in.
	   `resolved` deliberately keeps no rule and falls to the base `--text-2`,
	   which is what makes a worked-through row the quiet one.
	*/
	.fb-status.status-spam {
		color: var(--amber);
		border-color: var(--amber);
	}
	/* THE ROUTE A REPORT CAME FROM. This was `.fb-page`, the same class as the
	   page's own `<main>`, and a scoped rule matches every element carrying its
	   class: the main took this mono gold 0.68rem (so any text that sets no
	   colour or size of its own inherited it), and this label took the main's
	   page measure, auto margins and a 3rem bottom padding. Renamed so each
	   rule reaches the one element it was written for. */
	.fb-route {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--gold);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.fb-when {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-2);
		margin-left: auto;
	}
	.fb-message {
		margin: 0 0 var(--space-2);
		white-space: pre-wrap;
		line-height: 1.55;
		font-size: 0.95rem;
	}
	/* WHAT THEY TRIED. Set apart from the message with a label and a rule, so two
	   pieces of prose answering two questions do not read as one. */
	.fb-tried {
		margin: 0 0 var(--space-2);
		padding-left: var(--space-2);
		border-left: 2px solid var(--hairline);
	}
	.fb-tried-label {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.fb-tried-text {
		margin: 0.15rem 0 0;
		white-space: pre-wrap;
		line-height: 1.5;
		font-size: 0.88rem;
	}
	/* AN ADMIN'S CORRECTION: who and when, in the meta voice, and the
	   reporter's own words one press away. --text-2, never --text-3, because
	   this is read. */
	.fb-edited {
		margin: 0 0 var(--space-1, 0.25rem);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--text-2);
	}
	.fb-as-sent {
		margin: 0 0 var(--space-2);
		min-width: 0;
	}
	/* Why the card's keys are unlit while its form is open: read, so the
	   secondary text tier, never a status hue. */
	.fb-edit-hold {
		margin: var(--space-1, 0.25rem) 0 0;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.fbc-editing .fbc-editing-note {
		margin: 0 0 var(--space-2);
	}
	.fb-as-sent-list {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 0.25rem 0.75rem;
		margin: var(--space-1, 0.25rem) 0 0;
	}
	.fb-as-sent-list dt {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.fb-as-sent-list dd {
		margin: 0;
		min-width: 0;
		font-size: 0.88rem;
	}
	.fb-as-sent-text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.fbc-edit-note {
		margin: 0 0 var(--space-3);
	}
	.fb-shot {
		margin: 0 0 var(--space-2);
	}
	.fb-shot-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		/* The 44px floor: this is a control that owns its row, not a link inside
		   a sentence, so it takes the target rather than the prose exemption. */
		min-height: 44px;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.fb-shot-thumb {
		width: 5.5rem;
		height: 3.5rem;
		/* CONTAIN: a cropped thumbnail hides the edge of the thing being reported. */
		object-fit: contain;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
	}
	.fb-shot-missing {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--text-2);
	}

	.fb-context {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.8rem;
		list-style: none;
		margin: 0 0 var(--space-2);
		padding: 0;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--text-2);
	}
	.fb-context li {
		/* A key nobody anticipated carries a value nobody bounded either: this
		   list renders whatever is in meta beyond the named fields above it. */
		overflow-wrap: anywhere;
		max-width: 100%;
	}
	.fb-build {
		margin: 0 0 var(--space-2);
		font-size: 0.62rem;
		color: var(--text-2);
	}
	.fb-build-value {
		font-family: var(--font-mono);
		color: var(--cyan);
		margin-right: 0.5rem;
	}
	.fb-build-means {
		font-family: var(--font-display);
	}
	.fb-foot {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.fb-who {
		display: flex;
		flex-direction: column;
		font-size: 0.82rem;
	}
	.fb-email {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--text-2);
	}
	/* THE WORD CARRIES IT, not the colour: --text-2 is the same tone the row's
	   other metadata uses, so nothing here reads as a status. */
	.fb-anon {
		font-family: var(--font-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.fb-contact {
		font-size: 0.78rem;
		/* A reporter's own words, so they get the reading face the message has. */
		color: var(--text-1);
	}
	/* A WARNING SOMEBODY HAS TO READ, so it takes the secondary text tier and
	   not `--text-3`, which is decorative. Computed from the token values (not
	   a browser reading): `--text-3` is 2.79:1 on the site plate's card face
	   (#1c1f1d) and 2.53:1 on an unplated --bg1; `--text-2` is 6.47:1 and
	   5.88:1 on the same two. */
	.fb-contact-warn {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--text-2);
	}
	.fb-actions {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.fb-review {
		margin: var(--space-2) 0 0;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--text-2);
	}
	.note {
		color: var(--text-2);
		font-size: 0.9rem;
		margin: 0;
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
	@media (max-width: 560px) {
		.fb-when,
		.fb-actions {
			margin-left: 0;
		}
	}
</style>
