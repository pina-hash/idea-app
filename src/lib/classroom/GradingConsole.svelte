<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import { rosterSubject } from '$lib/avatars';
	import { tick, untrack } from 'svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState, type SaveOutcome } from '$lib/save-state.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
	import SubmissionFileList from '$lib/classroom/SubmissionFileList.svelte';
	import { anchored } from '$lib/shell/anchored';
	import { isTypingTarget, keyAction, type KeyBinding } from '$lib/shell/keys';
	import Pending from '$lib/Pending.svelte';
	import {
		criterionIncomplete,
		criterionMax,
		filesByBlockCount,
		gateApproved,
		gradesCsv,
		isOverrideScore,
		levelIndexForScore,
		levelShort,
		responsesMap,
		rubricTotal,
		scoresTotal,
		specUnmet,
		submissionStateLabel,
		unmetLabel,
		type AssignmentSpec,
		type AssignmentTeacherTransports,
		type GradingData,
		type RubricCriterion,
		type StudentWork,
		type UnmetEntry,
		studentWorkRows
	}	from '$lib/classroom/assignment-spec';
	import {
		itemTitle,
		sectionTitle,
		type ClassroomItem,
		type ClassroomSection
	} from '$lib/classroom/classroom';
	import {
		BULK_PRESET_LABEL,
		applyPreset,
		bulkCanSend,
		bulkOutcome,
		bulkPlan,
		groupBySection,
		sectionOfStudent,
		selectionSummary,
		type BulkGradingTransports,
		type BulkOutcome,
		type BulkPreset
	} from '$lib/classroom/grading-bulk';
	import {
		IDENTITY_NOTE,
		buildGradingExport,
		gradingExportFilename,
		gradingExportJson,
		gradingExportSheets,
		type ExportIdentity,
		type ExportScope,
		postGradeChange,
		postGradeChangeLabel,
		type PostGradeChange
	} from '$lib/classroom/grading-export';
	import { buildXlsx } from '$lib/xlsx';

	/**
	 * The grading console for one assignment in one section: the roster with
	 * submission status at a glance, each student's files and rendered spec
	 * responses read-only, rubric scoring with a live total and a private
	 * comment, save-as-draft then return-to-student, and the FACTS-ready CSV.
	 *
	 * IT IS AN APPLICATION SURFACE, not a reading column. Above 1024px the room
	 * is the viewport (`.cr-app` on the classroom wrapper, this `main` as its
	 * body) and the three regions -- roster, response, rubric -- are one row that
	 * fills what is left under the chrome, each scrolling on its own. The page
	 * itself does not scroll. Below that breakpoint it is the document's own
	 * single scroll and the columns stack exactly as they did.
	 *
	 * The RPCs are the boundary (classroom_grade_submission /
	 * classroom_approve_module re-check classroom_can_review_submission);
	 * everything visual here is convenience over what RLS already scoped.
	 */
	let {
		section,
		item,
		spec = null,
		rubric = null,
		transports,
		basePath = '/classroom',
		bulk = null
	}: {
		section: ClassroomSection;
		item: ClassroomItem;
		spec: AssignmentSpec | null;
		rubric: RubricCriterion[] | null;
		transports: AssignmentTeacherTransports;
		basePath?: string;
		/**
		 * GRADING AT SCALE, AND ABSENCE IS THE MECHANISM.
		 *
		 * Handed in, this console reads the assignment across EVERY class the
		 * caller teaches it in, groups the roster by section, offers a tick box
		 * per student and a batch bar, and commits through one statement (0175).
		 * Omitted -- which is the per-section route at
		 * `/classroom/<section>/item/<item>/grade` -- none of that markup exists:
		 * there are no checkboxes to leave unchecked, no batch bar to disable and
		 * no cross-section read to scope down. Single-section is structural here,
		 * not a mode.
		 */
		bulk?: BulkGradingTransports | null;
	} = $props();

	let data = $state<GradingData | null>(null);
	let loadError = $state<string | null>(null);
	let selectedEmail = $state<string | null>(null);
	let scores = $state<Record<string, number | null>>({});
	/** Per-criterion comments. The server REQUIRES one on every override. */
	let critComments = $state<Record<string, string>>({});
	/** Which criteria have the between-levels input open (UI only). */
	let overrideOpen = $state<Record<string, boolean>>({});
	/** Criterion ids the server refused for a missing override comment. */
	let needComment = $state<string[]>([]);
	let comment = $state('');
	let busy = $state(false);
	let gradeError = $state<string | null>(null);
	let gradeNotice = $state<string | null>(null);

	const work = $derived(
		data
			? studentWorkRows(data)
			: { rows: [] as StudentWork[], offRoster: [] as string[], managers: [] as string[] }
	);
	const students = $derived(work.rows);
	/**
	 * Response sets that belong to nobody on THIS section's roster (another
	 * section this item is posted to, or an enrollment that was never made).
	 * They are out of the list, the counts and the CSV -- and SAID, because a
	 * silent drop hides a real enrollment mistake as well as it hides anything
	 * else.
	 */
	const offRosterCount = $derived(work.offRoster.length);
	/**
	 * Roster rows dropped because that person can MANAGE this class (0138): an
	 * instructor who enrolled themselves to see the class from a student's
	 * chair, or a roster import that swept them in.
	 *
	 * ITS OWN LINE, WITH ITS OWN LABEL, and never folded into the one above.
	 * They are different findings and only one of them is an error: an
	 * off-roster response set means work arrived with no enrollment behind it,
	 * which somebody should look at; a manager exclusion is the roster working
	 * exactly as it should. One sentence covering both would make the working
	 * case read as a fault every time a teacher opened the console.
	 */
	const managerCount = $derived(work.managers.length);
	const selected = $derived(students.find((s) => s.email === selectedEmail) ?? null);
	const outOf = $derived(rubric ? rubricTotal(rubric) : (item.points ?? 0));
	const liveTotal = $derived(
		rubric ? scoresTotal(rubric, scores as Record<string, number>) : 0
	);
	const gateModule = $derived(spec?.approvalGate?.afterModule ?? null);

	/**
	 * DID THIS WORK CHANGE AFTER IT WAS GRADED. Derived per student through the
	 * ONE implementation in grading-export.ts, which the export also reads, so a
	 * chip on screen and a cell in a spreadsheet cannot disagree about the same
	 * fact. Nothing here re-states the rule.
	 */
	const changedFor = $derived(
		new Map(
			students.map((s) => [s.email, postGradeChange(s)] as const)
		) as Map<string, PostGradeChange | null>
	);
	const selectedChange = $derived(selected ? (changedFor.get(selected.email) ?? null) : null);
	const changedCount = $derived([...changedFor.values()].filter(Boolean).length);

	/**
	 * IS EXTRA CREDIT AVAILABLE AT ALL. The payload's own answer (0171's column
	 * came back), never a guess: on a deployment sitting before the migration the
	 * control is withheld and says why, rather than sending an award into an
	 * arity that has no parameter for it.
	 */
	const extraCreditReady = $derived(data?.extraCreditReady === true);
	/**
	 * The award being edited, as a string because `bind:value` on a number input
	 * COERCES and `.trim()` then throws (the trap this repo has hit three times).
	 */
	let extraCredit = $state('');
	const extraCreditNumber = $derived.by(() => {
		const raw = String(extraCredit ?? '').trim();
		if (!raw) return null;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	});
	const extraCreditInvalid = $derived(
		String(extraCredit ?? '').trim() !== '' && (extraCreditNumber == null || extraCreditNumber < 0)
	);
	/** The rubric sum plus whatever is typed -- what the server will stamp. */
	const liveAwarded = $derived(liveTotal + (extraCreditNumber ?? 0));

	// -----------------------------------------------------------------------
	// ACROSS CLASSES (0175's read half).
	//
	// AN ASSIGNMENT IS ONE ROW. `classroom_items` is canonical and
	// `classroom_postings` is the join, so "the same assignment in three
	// classes" is one item posted three times -- and `classroom_submissions` is
	// keyed `(item_id, student_email)` with NO section column at all. So the
	// work was never section-scoped: the ROSTER is what says which class a
	// student is in, and grading across classes means widening that one read.
	// The transport does it (`classroom_section_roster(null)`, intersected with
	// the item's postings); everything below only has to keep the answer
	// visible.
	// -----------------------------------------------------------------------
	let sections = $state<ClassroomSection[]>([]);
	/**
	 * The sections in play. The single-section console has exactly one and it is
	 * the one the route named, so the grouping code below has no second branch.
	 */
	const activeSections = $derived(sections.length ? sections : [section]);
	const sectionTitles = $derived(
		new Map(activeSections.map((s) => [s.id, sectionTitle(s)] as const))
	);
	/**
	 * FROM THE ROSTER, NEVER FROM THE WORK. `sectionOfStudent` is the one
	 * implementation and it is in the pure module, because the export reads it
	 * too and a card and a spreadsheet must not disagree about whose class
	 * somebody is in.
	 */
	const sectionOf = $derived(sectionOfStudent(data?.roster ?? []));

	/**
	 * THE FACE FOR THE STUDENT ON SCREEN, looked up on the ROSTER rather than
	 * carried on `StudentWork`.
	 *
	 * `studentWorkRows` builds each row field by field in
	 * `$lib/classroom/assignment-spec.ts` and does not copy the avatar
	 * columns across. Threading them through would mean widening that shape
	 * for every caller of it -- the CSV export, the bulk plan, the outcome
	 * tables -- to serve one heading. The roster rows are right here and are
	 * the SAME rows those work rows were built from, so the lookup is by the
	 * key they already share.
	 *
	 * Absent columns (0179 unapplied) and "chose no picture" are the same
	 * answer: an initials tile.
	 */
	const avatarByEmail = $derived(
		new Map((data?.roster ?? []).map((e) => [e.student_email, rosterSubject(e)]))
	);
	/** More than one class on screen: the state every section label exists for. */
	const crossClass = $derived(!!bulk && activeSections.length > 1);

	async function load() {
		// ONE BRANCH, at the read. Everything downstream reads `data` and
		// `sections` without asking which one filled them.
		if (bulk) {
			const res = await bulk.loadAcross(item.id);
			if (!res.ok) {
				loadError = res.message;
				return;
			}
			loadError = null;
			sections = res.data.sections;
			data = res.data.data;
			return;
		}
		const res = await transports.loadGrading(item.id, section.id);
		if (!res.ok) {
			loadError = res.message;
			return;
		}
		loadError = null;
		data = res.data;
	}
	$effect(() => {
		// Deferred out of the effect body (the ClassPage state_unsafe_mutation
		// lesson): the transport writes state synchronously before its first
		// await in the dev harness.
		queueMicrotask(() => void load());
	});

	// -----------------------------------------------------------------------
	// UNSAVED GRADING IS NOT DISCARDED SILENTLY.
	//
	// Selecting a student overwrites every score, every criterion comment and
	// the override state with the newly selected row's. That is correct -- the
	// form IS the selected student -- but it used to happen with no check at
	// all, so a click on the next name threw away a rubric somebody had just
	// filled in, with nothing said and nothing to undo it. The baseline is what
	// the current student's row held when it was selected (or last saved);
	// anything that differs from it is unsaved work.
	// -----------------------------------------------------------------------
	interface GradeSnapshot {
		scores: Record<string, number | null>;
		critComments: Record<string, string>;
		comment: string;
		/** As typed, so "3" and "3.0" are the same edit and "" is none. */
		extraCredit: string;
	}
	let baseline = $state<GradeSnapshot | null>(null);
	/** A selection waiting on the confirm. `null` in `next` means "close". */
	let pending = $state<{ next: StudentWork | null } | null>(null);

	function currentSnapshot(): GradeSnapshot {
		return {
			scores: { ...$state.snapshot(scores) },
			critComments: { ...$state.snapshot(critComments) },
			comment,
			extraCredit: String(extraCredit ?? '').trim()
		};
	}

	/** Which criteria differ from the baseline, and whether the comment does. */
	const changed = $derived.by(() => {
		const base = baseline;
		if (!base) return { criteria: [] as string[], comment: false, extraCredit: false };
		const ids = new Set([...Object.keys(base.scores), ...Object.keys(scores)]);
		const criteria: string[] = [];
		for (const id of ids) {
			const wasScore = base.scores[id] ?? null;
			const nowScore = scores[id] ?? null;
			const wasNote = (base.critComments[id] ?? '').trim();
			const nowNote = (critComments[id] ?? '').trim();
			if (Number(wasScore) !== Number(nowScore) || wasScore !== nowScore || wasNote !== nowNote) {
				criteria.push(id);
			}
		}
		return {
			criteria,
			comment: (base.comment ?? '').trim() !== comment.trim(),
			extraCredit: (base.extraCredit ?? '') !== String(extraCredit ?? '').trim()
		};
	});
	const dirty = $derived(changed.criteria.length > 0 || changed.comment || changed.extraCredit);

	/** What the confirm has to name, in the grader's terms and with real counts. */
	const dirtyCost = $derived.by(() => {
		const parts: string[] = [];
		const n = changed.criteria.length;
		if (n) parts.push(`${n} criteri${n === 1 ? 'on' : 'a'}`);
		if (changed.comment) parts.push('the comment to the student');
		if (changed.extraCredit) parts.push('the extra credit');
		return parts.join(' and ');
	});

	/**
	 * THE UNSAVED MARKER IS LIVE, not something you find out about by trying to
	 * leave.
	 *
	 * The dirty guard (7e6cfd7) already refused to swap students over unsaved
	 * grading, and that is still the boundary. What it did not do was SAY
	 * anything: a grader filled in a rubric, looked at a console that showed no
	 * difference from a saved one, and only learned there was unsaved work when
	 * a confirm appeared over a click they had already decided on.
	 *
	 * `autosave: false` because grading is not typing: a draft save is an act,
	 * with an explicit control, and a debounce would push half-entered rubrics
	 * at the server on the way through. The machine still tracks `dirty` off the
	 * same baseline the guard uses, so the two cannot disagree.
	 */
	const save = new SaveState({
		autosave: false,
		fallbackMessage: 'The grade was not saved.',
		save: () => grade(false)
	});

	$effect(() => save.attach());

	// `untrack`: markDirty READS the phase it may then write, so a tracked call
	// would re-run this effect on every transition of the machine.
	$effect(() => {
		const isDirty = dirty;
		untrack(() => {
			if (isDirty) save.markDirty();
			// `saved` and `failed` are reports of a WRITE and are left standing;
			// only an unsaved marker with nothing behind it is cleared here.
			else if (save.phase === 'dirty') save.reset();
		});
	});

	/**
	 * THE ONE WAY IN. Every path that changes who is selected -- a roster click,
	 * Close, the keyboard -- goes through here, so the guard cannot be routed
	 * around by adding a fourth.
	 */
	function requestSelect(next: StudentWork | null) {
		if (next?.email && next.email === selectedEmail) return;
		// EXEMPT WHEN NOTHING CHANGED: a confirm on every click is a confirm
		// nobody reads.
		if (!selected || !dirty) {
			applySelect(next);
			return;
		}
		pending = { next };
	}

	function applySelect(next: StudentWork | null) {
		pending = null;
		armReturn = false;
		gradeError = null;
		gradeNotice = null;
		needComment = [];
		if (!next) {
			selectedEmail = null;
			baseline = null;
			return;
		}
		selectedEmail = next.email;
		comment = next.submission?.teacher_comment ?? '';
		// Null and undefined both open EMPTY, which reads as "none awarded" -- a
		// pre-0171 payload and a row nobody has awarded anything on are the same
		// thing to a grader, and the difference is what `extraCreditReady` is for.
		extraCredit =
			next.submission?.extra_credit == null ? '' : String(next.submission.extra_credit);
		const saved = next.submission?.rubric_scores ?? {};
		const notes = next.submission?.criterion_comments ?? {};
		scores = Object.fromEntries((rubric ?? []).map((c) => [c.id, saved[c.id] ?? null]));
		critComments = Object.fromEntries((rubric ?? []).map((c) => [c.id, notes[c.id] ?? '']));
		// A saved score that matches no level IS an override, so its input opens
		// on its own -- the state is read back from the number, never stored.
		overrideOpen = Object.fromEntries(
			(rubric ?? []).map((c) => [c.id, isOverrideScore(c, saved[c.id])])
		);
		baseline = currentSnapshot();
		critIndex = 0;
	}

	async function saveThenSwitch() {
		const next = pending?.next ?? null;
		await save.saveNow();
		// The switch only happens on the ACKNOWLEDGEMENT: a failed draft save
		// that then swapped the student would discard the very rubric the
		// confirm was asking about.
		if (save.dirty) return;
		applySelect(next);
	}

	function pickLevel(c: RubricCriterion, points: number) {
		scores = { ...scores, [c.id]: points };
		overrideOpen = { ...overrideOpen, [c.id]: false };
		needComment = needComment.filter((id) => id !== c.id);
	}

	function toggleOverride(c: RubricCriterion) {
		const open = !overrideOpen[c.id];
		overrideOpen = { ...overrideOpen, [c.id]: open };
		if (!open && isOverrideScore(c, scores[c.id])) {
			// Closing the override clears the off-level score rather than leaving
			// a number behind that no level explains.
			scores = { ...scores, [c.id]: null };
			needComment = needComment.filter((id) => id !== c.id);
		}
	}

	/**
	 * WHAT THE SPEC STILL ASKS FOR, FOR ONE STUDENT, COMPUTED HERE AND STORED
	 * NOWHERE (0160).
	 *
	 * `classroom_submit_assignment` used to refuse a submission whose spec
	 * checks were not all met; since 0160 it ACCEPTS it and returns the unmet
	 * list alongside `ok: true`. That is deliberate -- sometimes the assignment
	 * is wrong and sometimes an automated check is wrong, and a student must
	 * never be trapped at 11pm by a defect in the instrument -- and it means
	 * incomplete work now reaches this console. Rendering it identically to
	 * finished work is what would make the first such hand-in get graded as
	 * though it were finished.
	 *
	 * NO COLUMN AND NO RPC. `specUnmet` is the pure mirror of
	 * `_classroom_spec_unmet`, and `StudentWork` already carries the three
	 * things it reads -- responses, files and approvals -- beside the spec this
	 * component is handed. A stored flag would be a second answer to a question
	 * that already has one, and it is the copy that goes stale the moment a
	 * RETURNED student edits and hands in again.
	 */
	function unmetFor(s: StudentWork): UnmetEntry[] {
		if (!spec) return [];
		return specUnmet(spec, responsesMap(s.responses), filesByBlockCount(s.files), s.approvals);
	}

	/**
	 * ONLY WORK THAT WAS ACTUALLY HANDED IN CARRIES THE MARK.
	 *
	 * Every student still working is unfinished by definition -- that is what
	 * `In progress` already says -- so marking them too would light the whole
	 * roster up on day one and the signal would mean nothing by the time it
	 * mattered. A RETURNED row keeps it: the student may edit and resubmit, so
	 * the count is live rather than a snapshot, and a grader reopening the row
	 * should see what it says now.
	 */
	function handedIn(s: StudentWork): boolean {
		const state = s.submission?.state ?? null;
		return state === 'submitted' || state === 'returned';
	}

	/** How many spec checks this student's handed-in work leaves unmet. 0 = none. */
	function incompleteCount(s: StudentWork): number {
		return handedIn(s) ? unmetFor(s).length : 0;
	}

	const selectedUnmet = $derived(selected && handedIn(selected) ? unmetFor(selected) : []);

	/**
	 * One spelling of an instant, matching the submitted stamp beside it. Two
	 * date formats on one line is how a reader stops being able to compare them,
	 * which is the entire job of the sentence this appears in.
	 */
	function stamp(iso: string): string {
		return new Date(iso).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function statusChip(s: StudentWork): { label: string; cls: string } {
		const state = s.submission?.state ?? null;
		if (state === 'returned') {
			return { label: `Returned · ${s.submission?.score ?? '—'}/${outOf}`, cls: 'returned' };
		}
		if (state === 'submitted') return { label: 'Submitted', cls: 'submitted' };
		if (s.responses.length || s.files.length) return { label: 'In progress', cls: 'progress' };
		return { label: 'Not submitted', cls: 'none' };
	}

	async function grade(release: boolean): Promise<SaveOutcome> {
		if (!selected || !rubric) return { ok: true };
		gradeError = null;
		gradeNotice = null;
		needComment = [];
		const payload: Record<string, number> = {};
		const notes: Record<string, string> = {};
		for (const c of rubric) {
			const v = scores[c.id];
			if (v != null && !Number.isNaN(Number(v))) payload[c.id] = Number(v);
			const note = (critComments[c.id] ?? '').trim();
			if (note) notes[c.id] = note;
		}
		// REFUSED HERE AS WELL AS THERE. The column's CHECK and the RPC both
		// refuse a negative, and this says so where the grader is working rather
		// than after a round trip.
		if (extraCreditInvalid) {
			gradeError = 'Extra credit must be a number of 0 or more. Leave it blank to award none.';
			return { ok: false, retryable: false, message: gradeError };
		}
		busy = true;
		try {
			const res = await transports.gradeSubmission(
				item.id,
				selected.email,
				payload,
				comment.trim() || null,
				release,
				notes,
				// UNDEFINED WHERE THE COLUMN IS NOT THERE, so the transport omits the
				// parameter entirely and binds to the arity that has always existed.
				// Blank is 0 rather than null, because a grader who cleared the box
				// meant to take the award back and null means LEAVE IT ALONE.
				extraCreditReady ? (extraCreditNumber ?? 0) : undefined
			);
			if (!res.ok) {
				gradeError = res.message;
				// The request did not reach the server: another attempt can
				// still change the answer.
				return { ok: false, retryable: true, message: res.message };
			}
			if (res.data.ok === false) {
				if (res.data.reason === 'override_needs_comment') {
					needComment = res.data.missing ?? [];
					gradeError =
						needComment.length === 1
							? 'Say why you scored between levels (1 criterion still needs a comment).'
							: `Say why you scored between levels (${needComment.length} criteria still need a comment).`;
					// A refusal, not a failure: the server considered this and said
					// no, so retrying it five times arrives at the same answer.
					return { ok: false, retryable: false, message: gradeError };
				}
				gradeError =
					res.data.reason === 'incomplete_scores'
						? `Score every criterion before returning (${res.data.missing?.length ?? 0} left).`
						: 'The grade was refused.';
				return { ok: false, retryable: false, message: gradeError };
			}
			gradeNotice = release
				? `Returned to ${selected.displayName} -- they can see the score and comment now.`
				: 'Draft saved. Nothing is released until you return it.';
			// WHAT IS ON SCREEN IS NOW WHAT IS STORED, so it is the new baseline:
			// switching students after a save must not ask about work that landed.
			baseline = currentSnapshot();
			await load();
			return { ok: true };
		} finally {
			// IN A `finally`: a transport that throws rather than resolving
			// `{ok:false}` otherwise left every control on the console disabled,
			// with a filled-in rubric and no way to save it but a reload.
			busy = false;
		}
	}

	// -----------------------------------------------------------------------
	// THE BATCH.
	//
	// THE RUBRIC FORM IS THE BATCH. There is no second scoring surface and there
	// must not be: the scores, the per-criterion notes, the shared comment and
	// the award being applied to a group are the ones already on screen for the
	// student who is open, which is what keeps "the instructor sees the work
	// while they grade it" true of the bulk path as well as the single one. A
	// separate batch form would be a spreadsheet with the work hidden behind it,
	// which is the failure this whole surface is shaped to avoid.
	//
	// SELECTION IS SEPARATE FROM WHO IS OPEN. Ticking a name changes nothing
	// about the detail pane, so an instructor reads one student's work, scores
	// it, then ticks everyone who earned the same and commits -- and can open any
	// of them on the way past without losing the selection.
	// -----------------------------------------------------------------------
	/** The presets offered, in the order they are shown. */
	const BULK_PRESETS: BulkPreset[] = ['all', 'submitted', 'ungraded', 'none'];
	let picked = $state<string[]>([]);
	let batchBusy = $state(false);
	let outcome = $state<BulkOutcome | null>(null);
	/** Two-step: the plan is on screen, then it is committed. */
	let armedRelease = $state<boolean | null>(null);

	const pickedSet = $derived(new Set(picked));
	/**
	 * RE-DERIVED FROM THE CURRENT LIST EVERY READ, never captured at tick time:
	 * the roster reloads after every commit, so a snapshot would describe the
	 * class as it was before the thing just saved to it. A name that has left
	 * the roster simply stops being selected.
	 */
	const pickedStudents = $derived(students.filter((s) => pickedSet.has(s.email)));
	const pickedSummary = $derived(selectionSummary(pickedStudents, sectionOf, sectionTitles));

	/**
	 * WHAT IS ABOUT TO BE WRITTEN. The preview AND the payload, from one call:
	 * `plan.rows` is the table on screen and `plan.grades` is the request body,
	 * so a surface cannot show a total it is not about to send.
	 */
	const plan = $derived(
		bulkPlan({
			selected: pickedStudents,
			rubric,
			scores,
			criterionComments: critComments,
			comment,
			extraCredit: String(extraCredit ?? ''),
			extraCreditReady,
			sectionOf,
			sectionTitles,
			release: armedRelease === true
		})
	);
	/** ONE PREDICATE, read by the control and by the handler. */
	const canSend = $derived(bulkCanSend(plan));

	function setPreset(preset: BulkPreset) {
		picked = applyPreset(preset, students);
		armedRelease = null;
		outcome = null;
	}

	function togglePick(email: string) {
		picked = pickedSet.has(email) ? picked.filter((e) => e !== email) : [...picked, email];
		// Arming describes a plan; changing who is in it un-arms, so the two-step
		// confirm can never commit a batch nobody looked at.
		armedRelease = null;
		outcome = null;
	}

	/**
	 * Every criterion scored, so the release-time check has something to say
	 * about a group rather than about the one student who is open.
	 */
	function armBatch(release: boolean) {
		outcome = null;
		armedRelease = release;
	}

	async function commitBatch() {
		if (!bulk || armedRelease == null) return;
		const release = armedRelease;
		// THE HANDLER ASKS THE SAME PREDICATE THE CONTROL DOES. Two spellings of
		// "is this ready" is what produces a press that does nothing.
		if (!canSend) return;
		const sent = plan.grades;
		const roster = pickedStudents;
		batchBusy = true;
		try {
			const res = await bulk.gradeMany(item.id, sent, release);
			if (!res.ok) {
				// 0175 only RAISES on shapes it checked before writing anything, so
				// this genuinely means nothing landed.
				outcome = {
					total: sent.length,
					succeeded: 0,
					refused: sent.length,
					released: release,
					headline: `Nothing was graded. ${res.message}`,
					rows: []
				};
				return;
			}
			outcome = bulkOutcome(res.data, roster, sectionOf, sectionTitles, release);
			armedRelease = null;
			// WHAT LANDED IS CLEARED AND WHAT DID NOT STAYS SELECTED, so pressing
			// again retries exactly the rest. A batch that cleared everything
			// would make an instructor rebuild the selection from the report.
			const failed = new Set(res.data.results.filter((r) => !r.ok).map((r) => r.email));
			picked = picked.filter((e) => failed.has(e));
			// The form on screen is now what is stored for everyone who landed,
			// so switching students must not ask about work that saved.
			baseline = currentSnapshot();
			await load();
		} finally {
			batchBusy = false;
		}
	}

	async function setGate(approvedNow: boolean) {
		if (!selected || !gateModule) return;
		busy = true;
		try {
			const res = await transports.approveModule(item.id, selected.email, gateModule, approvedNow);
			if (!res.ok) {
				gradeError = res.message;
				return;
			}
			await load();
		} finally {
			busy = false;
		}
	}

	/** The ONE download path on this surface, so three exports cannot end up with
	 *  three different ideas of how a file leaves the browser. */
	function download(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	// -----------------------------------------------------------------------
	// AN EXPORT IS ALWAYS ONE CLASS.
	//
	// `gradesCsv` writes Last, First, Score, Out of -- a FACTS gradebook import,
	// which is a per-class document by definition -- and every filename here
	// ends in a section slug. On a console holding three classes an export of
	// "the whole class" would be three classes in a file that names one, which
	// is a wrong gradebook import that looks exactly like a right one. So the
	// panel picks a section, defaulting to the one the route named, and every
	// export below reads THAT section and only its students.
	// -----------------------------------------------------------------------
	// THE INITIAL VALUE IS THE POINT: the route's own section is where the panel
	// starts, and the instructor moves it from there. Re-deriving it from the prop
	// would put the picker back on Period 1 every time the roster reloaded.
	// svelte-ignore state_referenced_locally
	let exportSectionId = $state(section.id);
	const exportSection = $derived(
		activeSections.find((s) => s.id === exportSectionId) ?? activeSections[0] ?? section
	);
	/** The roster of the section being exported, which in single-class mode is all of it. */
	const exportRoster = $derived(
		crossClass ? students.filter((s) => sectionOf.get(s.email) === exportSection.id) : students
	);

	function exportCsv() {
		const rows = exportRoster.map((s) => ({
			displayName: s.displayName,
			email: s.email,
			score: s.submission?.state === 'returned' ? (s.submission.score ?? null) : null,
			outOf
		}));
		const csv = gradesCsv(rows);
		const label = (item.title ?? 'assignment').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		download(
			new Blob([csv], { type: 'text/csv;charset=utf-8' }),
			`grades-${label}-${sectionSlug()}.csv`
		);
	}

	// -----------------------------------------------------------------------
	// THE GRADED-WORK EXPORT: the same rows this console is already showing,
	// written out whole so a language model can read what was asked, what came
	// back, and how it was scored.
	//
	// IT ADDS NO READ AND NO RPC. `buildGradingExport` is handed `students` --
	// which is `studentWorkRows(data)`, the payload `loadGrading` already
	// returned -- so the export is by construction exactly what this caller can
	// already see on this page. Widening it would mean widening the console.
	//
	// IDENTITY IS A DELIBERATE ACT, DEFAULTED ON. The file carries names and
	// addresses because that is what the teacher of record asked for, but it
	// leaves the school's systems the moment it is pasted somewhere, so the
	// state is a control here and a top-level field inside the file rather than
	// a property of the format that nobody can see.
	// -----------------------------------------------------------------------
	let identity = $state<ExportIdentity>('included');
	let exportNote = $state<string | null>(null);
	let exporting = $state(false);

	function payloadFor(scope: ExportScope) {
		return buildGradingExport({
			section: exportSection,
			item,
			spec,
			rubric,
			roster: exportRoster,
			selectedEmail,
			scope,
			identity,
			// Threaded from the click, never read inside the pure module.
			now: new Date()
		});
	}

	function exportJson(scope: ExportScope) {
		if (scope === 'student' && !selected) {
			exportNote = 'Choose a student in the roster first, then export their work.';
			return;
		}
		// AND THE OPEN STUDENT HAS TO BE IN THE CLASS BEING EXPORTED. Otherwise
		// the file names one section and carries a student from another, which is
		// the cross-class version of the wrong-gradebook mistake.
		if (scope === 'student' && !exportRoster.some((s) => s.email === selected?.email)) {
			exportNote = `${selected?.displayName} is not in ${sectionTitle(exportSection)}. Switch the class above, or open a student in it.`;
			return;
		}
		const payload = payloadFor(scope);
		download(
			new Blob([gradingExportJson(payload)], { type: 'application/json;charset=utf-8' }),
			gradingExportFilename(payload, 'json')
		);
		exportNote = exportNoteFor(payload.export.counts.students);
	}

	async function exportWorkbook() {
		if (exporting) return;
		exporting = true;
		try {
			const payload = payloadFor('section');
			const bytes = await buildXlsx(gradingExportSheets(payload));
			download(
				new Blob([bytes as unknown as BlobPart], {
					type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
				}),
				gradingExportFilename(payload, 'xlsx')
			);
			exportNote = `${exportNoteFor(payload.export.counts.students)} Open it in Google Sheets by dropping it into Drive.`;
		} catch (err) {
			exportNote = `The spreadsheet could not be built: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			// IN A `finally`, the console's own convention: a throw here
			// otherwise leaves the control disabled with no way back but a reload.
			exporting = false;
		}
	}

	function exportNoteFor(count: number): string {
		const who = count === 1 ? '1 student' : `${count} students`;
		return identity === 'included'
			? `Exported ${who}, with names and email addresses.`
			: `Exported ${who}, with names and email addresses left out.`;
	}
	function sectionSlug(): string {
		return sectionTitle(exportSection)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}

	const returnedCount = $derived(
		students.filter((s) => s.submission?.state === 'returned').length
	);

	// -----------------------------------------------------------------------
	// THE LEVEL CONTROL: A SHORT FORM ON SCREEN, THE FULL DESCRIPTOR ON DEMAND.
	//
	// A level's descriptor is a sentence or two of grading policy; four of them
	// per criterion, times five criteria, is a wall nobody reads while deciding.
	// The control shows the one-line form (`levelShort`, which falls back to the
	// spec's and then to the descriptor itself) and the FULL descriptor is a tip
	// on the level's own button -- never truncated, never a second page.
	//
	// The panel is positioned against the VIEWPORT ($lib/shell/anchored): the
	// rubric column is a scroll container and an absolutely positioned panel
	// would be clipped by it.
	// -----------------------------------------------------------------------
	let hoveredLevel = $state<string | null>(null);
	let levelEls = $state<Record<string, HTMLElement | null>>({});
	const levelKey = (ci: number, li: number) => `${ci}:${li}`;

	// -----------------------------------------------------------------------
	// THE KEYBOARD LOOP.
	//
	// Grading is the same motion a hundred times: read, pick a level per
	// criterion, save, next student. Reaching for the mouse between every one of
	// those is the cost this removes. The generic half of the machinery is
	// $lib/shell/keys (the binding shape, the modifier rule, the typing guard),
	// shared with the notebook's review console; the actions below are this
	// surface's own.
	// -----------------------------------------------------------------------
	type GradeAction =
		| 'level-1'
		| 'level-2'
		| 'level-3'
		| 'level-4'
		| 'crit-prev'
		| 'crit-next'
		| 'level-prev'
		| 'level-next'
		| 'student-prev'
		| 'student-next'
		| 'save'
		| 'return'
		| 'close';

	/**
	 * THE LEGEND AND THE HANDLER ARE ONE LIST, so a key that stops working stops
	 * being advertised.
	 *
	 * WHY THESE KEYS:
	 *   * 1-4 pick a level directly. A criterion may hold at most four levels
	 *     (the SQL constraint), so the digits cover every rubric exactly, and
	 *     "the top level is 1" matches the order they are printed in.
	 *   * Up/down move between criteria, left/right between levels inside one --
	 *     the axes the grid on screen already has.
	 *   * TAB is the browser's, not ours. Each criterion's level group is a
	 *     roving tabindex with exactly one tabbable button, so Tab lands on the
	 *     next criterion by native focus order. Swallowing Tab would trap focus
	 *     in the rubric with no way out, which is a worse bargain than any
	 *     shortcut is worth.
	 *   * N and P are next and previous student: the pager convention, single
	 *     letters that do not collide with the digits, and both readable as
	 *     words in the legend.
	 *   * S saves a draft, which is safe and reversible.
	 *   * R RETURNS THE GRADE TO THE STUDENT, which is neither, so it is armed
	 *     first and confirmed by a second R -- the same two-step every other
	 *     irreversible control on the site uses. Escape or any other key
	 *     disarms.
	 *   * Escape closes the student and goes back to the roster (and is caught
	 *     by the dirty guard like every other way out).
	 */
	const GRADE_KEYS: KeyBinding<GradeAction>[] = [
		{
			keys: '1 – 4',
			label: 'Pick level',
			action: 'level-1',
			dispatch: { '1': 'level-1', '2': 'level-2', '3': 'level-3', '4': 'level-4' }
		},
		{
			keys: '↑ ↓',
			label: 'Criterion',
			action: 'crit-next',
			dispatch: { ArrowUp: 'crit-prev', ArrowDown: 'crit-next' }
		},
		{
			keys: '← →',
			label: 'Level',
			action: 'level-next',
			dispatch: { ArrowLeft: 'level-prev', ArrowRight: 'level-next' }
		},
		{ keys: 'Tab', label: 'Next criterion', native: true },
		{
			keys: 'N / P',
			label: 'Next / previous student',
			action: 'student-next',
			dispatch: { n: 'student-next', p: 'student-prev' }
		},
		{ keys: 'S', label: 'Save draft', action: 'save', dispatch: { s: 'save' } },
		{ keys: 'R R', label: 'Return to student', action: 'return', dispatch: { r: 'return' } },
		{ keys: 'Esc', label: 'Back to roster', action: 'close', dispatch: { Escape: 'close' } }
	];

	/** Which criterion the keys act on. Follows focus and every key that moves. */
	let critIndex = $state(0);
	/** The second R is the confirm; the first only arms it. */
	let armReturn = $state(false);
	let keyNote = $state<string | null>(null);

	const criteria = $derived(rubric ?? []);

	/** The level a criterion currently sits on, or -1 for none and for overrides. */
	function chosenIndex(ci: number): number {
		const c = criteria[ci];
		return c ? levelIndexForScore(c, scores[c.id]) : -1;
	}
	/** The ONE tabbable button in a criterion's group (roving tabindex). */
	function roveIndex(ci: number): number {
		const chosen = chosenIndex(ci);
		return chosen >= 0 ? chosen : 0;
	}

	async function focusLevel(ci: number, li: number) {
		await tick();
		const el = document.querySelector<HTMLElement>(
			`[data-grade-level="${ci}:${Math.max(0, li)}"]`
		);
		el?.focus();
		// `instant`: app.css sets a global smooth scroll-behavior, and a level
		// picked by keyboard should be under the eye now, not in 300ms.
		el?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
	}

	function setLevel(ci: number, li: number) {
		const c = criteria[ci];
		const level = c?.levels?.[li];
		if (!c || !level) {
			keyNote = `That criterion has ${c?.levels?.length ?? 0} levels.`;
			return;
		}
		critIndex = ci;
		pickLevel(c, level.points);
		keyNote = null;
		void focusLevel(ci, li);
	}

	function moveStudent(step: -1 | 1) {
		if (!students.length) return;
		const at = students.findIndex((s) => s.email === selectedEmail);
		const next = students[Math.min(students.length - 1, Math.max(0, at + step))];
		if (!next || next.email === selectedEmail) {
			keyNote = step > 0 ? 'Last student on the roster.' : 'First student on the roster.';
			return;
		}
		keyNote = null;
		requestSelect(next);
		// The loop lands somewhere DEFINED and visible: the first criterion's
		// level control, which is where the next decision is made.
		if (criteria.length) void focusLevel(0, roveIndex(0));
	}

	function runAction(action: GradeAction) {
		if (action !== 'return' && action !== 'close') armReturn = false;
		switch (action) {
			case 'level-1':
			case 'level-2':
			case 'level-3':
			case 'level-4':
				setLevel(critIndex, Number(action.slice(-1)) - 1);
				return;
			case 'crit-prev':
			case 'crit-next': {
				if (!criteria.length) return;
				const at = Math.min(
					criteria.length - 1,
					Math.max(0, critIndex + (action === 'crit-next' ? 1 : -1))
				);
				critIndex = at;
				void focusLevel(at, roveIndex(at));
				return;
			}
			case 'level-prev':
			case 'level-next': {
				const c = criteria[critIndex];
				if (!c?.levels?.length) return;
				const from = chosenIndex(critIndex);
				const step = action === 'level-next' ? 1 : -1;
				// From "nothing picked" the first press lands on the top level
				// rather than on level two.
				const at =
					from < 0
						? step > 0
							? 0
							: c.levels.length - 1
						: Math.min(c.levels.length - 1, Math.max(0, from + step));
				setLevel(critIndex, at);
				return;
			}
			case 'student-next':
				moveStudent(1);
				return;
			case 'student-prev':
				moveStudent(-1);
				return;
			case 'save':
				if (!busy) void save.saveNow();
				return;
			case 'return':
				if (busy) return;
				if (!armReturn) {
					armReturn = true;
					keyNote = 'Press R again to return this grade to the student.';
					return;
				}
				armReturn = false;
				keyNote = null;
				void grade(true);
				return;
			case 'close':
				if (armReturn) {
					armReturn = false;
					keyNote = null;
					return;
				}
				requestSelect(null);
				return;
		}
	}

	function onWindowKey(event: KeyboardEvent) {
		if (!data || pending) return;
		const target = event.target as (HTMLElement & { isContentEditable?: boolean }) | null;
		// NOTHING FIRES WHILE SOMEBODY IS TYPING. The console has a comment box,
		// a per-criterion comment box and a numeric override field; a grader
		// writing "no rubric level fits this" must never set a rubric level.
		if (target && isTypingTarget(target)) return;
		if (typeof document !== 'undefined' && document.querySelector('dialog[open]')) return;
		const action = keyAction(event, GRADE_KEYS);
		if (!action) return;
		event.preventDefault();
		runAction(action);
	}
</script>

<svelte:window onkeydown={onWindowKey} />

<svelte:head>
	<title>Grading // {itemTitle(item)}</title>
</svelte:head>

<!--
	NO MASTHEAD HERE. Every /classroom page renders inside the persistent shell
	(src/routes/classroom/+layout.svelte), which owns the logo, the section
	switcher and the breadcrumb trail back up.

	`cr-app-body` is this element's half of the application frame: the layout
	puts `.cr-app` on the room (decided from nav.ts's `console` measure, not from
	any class here), the chrome above measures itself, and this takes the rest.
	`cr-console` is a plain hook for the room-level rules that have to reach
	inside the classroom's own stylesheet -- the 44px control sizing, which
	cannot be written in a scoped block because `.btn` is an app-shell class.
-->
<main class="grading-page cr-console cr-app-body">
	<section class="hero console-hero">
		<div class="eyebrow">Grading</div>
		<h1>{itemTitle(item)}</h1>
		<p class="meta-line">{sectionTitle(section)} · out of {outOf} pts</p>
	</section>

	{#if loadError}
		<p class="feedback error">{loadError}</p>
	{:else if !data}
		<Pending label="Loading the roster" />
	{:else}
		{#if !rubric?.length}
			<section class="card warn-card">
				<p class="warn-line">
					This assignment has no rubric yet, so nothing can be scored. Build one on the
					assignment page (or generate it from the spec), then come back.
				</p>
			</section>
		{/if}

		<div class="console" class:split={!!selected}>
			<section class="roster card">
				<div class="roster-head">
					<h2 class="section-label">Roster</h2>
					<button type="button" class="btn secondary tiny" onclick={exportCsv}>
						Export CSV
					</button>
				</div>
				<!--
					THE GRADED-WORK EXPORTS, BESIDE THE CSV RATHER THAN INSTEAD OF IT.
					The CSV is a gradebook import and is four columns wide on purpose;
					these three carry the work itself. Every word on a control says
					what it produces and for whom, because the difference between
					"one student" and "the whole class" is the difference between one
					person's writing leaving the building and thirty.
				-->
				<div class="work-export" data-testid="work-export">
					<p class="work-export-label">Export graded work</p>
					{#if crossClass}
						<!--
							ONE CLASS PER FILE. A gradebook import that named Period 1 and
							carried Period 2's students as well would be accepted by FACTS
							without complaint, so the section is chosen here rather than
							inferred, and the choice reaches the filename, the CSV rows, the
							JSON and the workbook through one derived roster.
						-->
						<label class="export-section" data-testid="export-section">
							<span class="export-section-label">Class to export</span>
							<select
								class="tap-44"
								bind:value={exportSectionId}
								onchange={() => (exportNote = null)}
							>
								{#each activeSections as s (s.id)}
									<option value={s.id}>{sectionTitles.get(s.id) ?? sectionTitle(s)}</option>
								{/each}
							</select>
						</label>
					{/if}
					<div class="work-export-row">
						<button
							type="button"
							class="btn secondary tiny"
							aria-disabled={!selected}
							data-testid="export-json-student"
							onclick={() => exportJson('student')}
						>
							JSON: this student
						</button>
						<button
							type="button"
							class="btn secondary tiny"
							data-testid="export-json-class"
							onclick={() => exportJson('section')}
						>
							JSON: whole class
						</button>
						<button
							type="button"
							class="btn secondary tiny"
							data-testid="export-workbook"
							onclick={exportWorkbook}
						>
							{exporting ? 'Building spreadsheet' : 'Spreadsheet: whole class'}
						</button>
					</div>
					<label class="identity-toggle" data-testid="export-identity">
						<input
							type="checkbox"
							checked={identity === 'included'}
							onchange={(e) => {
								identity = e.currentTarget.checked ? 'included' : 'omitted';
								exportNote = null;
							}}
						/>
						<span>Include student names and email addresses</span>
					</label>
					<p class="identity-note" data-testid="export-identity-note">
						{IDENTITY_NOTE[identity]}
					</p>
					{#if exportNote}
						<p class="export-note" data-testid="export-note">{exportNote}</p>
					{/if}
				</div>
				{#if returnedCount < students.length}
					<p class="csv-hint">
						CSV scores fill in as work is returned ({returnedCount}/{students.length} returned{crossClass
							? ', across every class shown'
							: ''}).
					</p>
				{/if}
				{#if offRosterCount > 0}
					<p class="off-roster" data-testid="off-roster-notice">
						{offRosterCount} response {offRosterCount === 1 ? 'set' : 'sets'} on this assignment
						{offRosterCount === 1 ? 'belongs' : 'belong'} to somebody who is not on this class
						roster, so {offRosterCount === 1 ? 'it is' : 'they are'} not listed, counted or
						exported here. Check the roster on the People tab if that is unexpected.
					</p>
				{/if}
				{#if managerCount > 0}
					<p class="manager-note" data-testid="manager-notice">
						{managerCount}
						{managerCount === 1 ? 'person on this roster' : 'people on this roster'} can manage this
						class, so {managerCount === 1 ? 'their row is' : 'their rows are'} not listed, counted or
						exported as student work: {work.managers.join(', ')}. Remove the enrollment on the People
						tab to take {managerCount === 1 ? 'it' : 'them'} off the roster entirely.
					</p>
				{/if}
				<!--
					ONE ROW, ONE SNIPPET, whichever list it lands in. The flat roster and
					the per-section groups render the identical markup, because a second
					copy of a roster row is where a chip, a status or a tap target stops
					matching between the two surfaces that both call themselves "the
					grading console".

					No tabindex on the lists: every row is a real button, so the roster is
					already reachable and scrollable from the keyboard.
				-->
				{#snippet rosterRow(s: StudentWork)}
					{@const chip = statusChip(s)}
					{@const short = incompleteCount(s)}
					<li class="roster-item" class:pickable={!!bulk}>
						{#if bulk}
							<!--
								OUTSIDE THE BUTTON, and not only because a checkbox inside a
								button is invalid: ticking a name and opening their work are
								two different acts, and one control doing both would mean an
								instructor could not read a student's work without adding them
								to the batch.
							-->
							<label class="roster-pick tap-44" data-testid="roster-pick">
								<input
									type="checkbox"
									checked={pickedSet.has(s.email)}
									disabled={batchBusy}
									onchange={() => togglePick(s.email)}
								/>
								<span class="visually-hidden">Grade {s.displayName} in this batch</span>
							</label>
						{/if}
						<button
							type="button"
							class="roster-row"
							class:active={selectedEmail === s.email}
							class:inactive={!s.active}
							onclick={() => requestSelect(s)}
						>
							<!-- THE FACE ON THE ROSTER ROW, and the audience for it is the
							     audience for the name it sits beside -- which is this same
							     row, already printing `s.displayName`, plus the chips. Both
							     grading routes refuse a caller who does not manage the
							     section before any of this renders (the per-section load
							     redirects on `classroom_manages_section`, the cross-section
							     one 404s on an empty managed set), and underneath them
							     `classroom_can_review_submission` gates every row RLS
							     returns. Looked up on the ROSTER by the key the work row
							     already shares with it; see `avatarByEmail`.

							     SMALLER THAN THE IDENTITY ROW'S 40px, deliberately: this is
							     a scanning list of thirty, and the picture is a way of
							     finding the name faster rather than a portrait. It sits
							     INSIDE the button, so the whole row stays one target and
							     nothing new is tabbable. -->
							<Avatar
								subject={avatarByEmail.get(s.email) ?? null}
								tintKey={s.email}
								size={28}
							/>
							<span class="roster-name">{s.displayName}</span>
							<span class="roster-chips">
								<!--
									THE SECTION, ON THE ROW, whenever more than one is on screen.
									The group heading above is not enough on its own: it scrolls
									away, and grading the wrong class's student is a silent
									failure -- nothing refuses it, because the instructor teaches
									both. It is FIRST in the chip list for the same reason.
								-->
								{#if crossClass}
									<span class="roster-chip section" data-testid="roster-section">
										{sectionTitles.get(sectionOf.get(s.email) ?? '') ?? 'No class'}
									</span>
								{/if}
								<span class="roster-chip {chip.cls}">{chip.label}</span>
								<!--
									A SECOND CHIP, NOT A SECOND WORD IN THE FIRST ONE.
									"Did this arrive" and "was it finished when it arrived"
									are two questions, and a row can answer them
									independently: a returned 9/20 may have come in
									incomplete and a submitted one may not have. Folding the
									count into the state chip would make one mark stand for
									both and there would be no way to read either.
								-->
								{#if short > 0}
									<span class="roster-chip incomplete" data-testid="roster-incomplete">
										Incomplete &middot; {short}
									</span>
								{/if}
								<!--
									A THIRD CHIP, for the same reason there is a second one.
									"Did this arrive", "was it finished when it arrived" and
									"has it moved since I graded it" are three independent
									questions, and a row can answer them in any combination.
									This one NAMES THE ACT rather than saying "changed":
									resubmitting is a student asking to be looked at again and
									an edit is the graded artefact quietly ceasing to be the
									graded artefact, and an instructor answers those
									differently.
								-->
								{#if changedFor.get(s.email)}
									<span class="roster-chip changed" data-testid="roster-changed">
										{postGradeChangeLabel(changedFor.get(s.email)!)}
									</span>
								{/if}
							</span>
						</button>
					</li>
				{/snippet}

				{#if bulk}
					<!--
						THE PRESETS ARE THE POINT OF THE BULK PATH. Ticking thirty boxes
						is not faster than grading thirty students; "everyone who handed
						in" and "everyone not graded yet" are the two selections an
						instructor actually makes, and the second is the one they reach
						for after a partial pass.
					-->
					<div class="pick-presets" data-testid="pick-presets">
						<span class="pick-presets-label">Select</span>
						{#each BULK_PRESETS as preset (preset)}
							<button
								type="button"
								class="btn secondary tiny"
								data-preset={preset}
								disabled={batchBusy}
								onclick={() => setPreset(preset)}
							>
								{BULK_PRESET_LABEL[preset]}
							</button>
						{/each}
					</div>
					{@const grouped = groupBySection(students, activeSections, sectionOf)}
					{#each grouped.groups as group (group.section.id)}
						<div class="roster-group" data-testid="roster-group">
							<h3 class="roster-group-head">
								<span class="roster-group-name">{group.title}</span>
								<span class="roster-group-count">
									{group.students.length}
									{group.students.length === 1 ? 'student' : 'students'}
								</span>
							</h3>
							<ul class="roster-list">
								{#each group.students as s (s.email)}
									{@render rosterRow(s)}
								{/each}
								{#if group.students.length === 0}
									<li class="note">Nobody is enrolled in this class yet.</li>
								{/if}
							</ul>
						</div>
					{/each}
					{#if grouped.unplaced.length}
						<!--
							NOT FILED UNDER THE FIRST CLASS. A row the roster read could not
							place is shown as exactly that: putting it in a class it may not
							be in is the mistake the grouping exists to prevent, and it would
							be invisible.
						-->
						<div class="roster-group" data-testid="roster-unplaced">
							<h3 class="roster-group-head">
								<span class="roster-group-name">No class on the roster</span>
								<span class="roster-group-count">{grouped.unplaced.length}</span>
							</h3>
							<ul class="roster-list">
								{#each grouped.unplaced as s (s.email)}
									{@render rosterRow(s)}
								{/each}
							</ul>
						</div>
					{/if}
					{#if students.length === 0}
						<p class="note">Nobody is enrolled in any class this assignment is posted to.</p>
					{/if}
				{:else}
					<ul class="roster-list">
						{#each students as s (s.email)}
							{@render rosterRow(s)}
						{/each}
						{#if students.length === 0}
							<li class="note">No students enrolled in this section.</li>
						{/if}
					</ul>
					<!--
						THE WAY ACROSS. This console is one class; the same assignment is
						routinely posted to two or three, and grading it from three
						different URLs is the second of the two complaints this bundle
						exists for. The link is unconditional because the only thing that
						could make it conditional is a count this page does not have, and a
						path nobody can find is a path that was not built.
					-->
					<p class="cross-class-link">
						<!-- `.tap-44` and not a bare inline link: the prose exemption is for a
						     link INSIDE a sentence, where a 44px reach would overlap the lines
						     above and below. This is a standalone navigation control in a
						     panel, and it is the only route to the cross-class console --
						     measured at 18px tall before this. -->
						<a
							class="tap-44"
							href="{basePath}/grading/{item.id}"
							data-testid="cross-class-link"
						>
							Grade this assignment across every class you teach it in
						</a>
					</p>
				{/if}
			</section>

			{#if selected}
				<section class="work">
					<div class="card work-head">
						<div class="work-who">
							<!-- THE STUDENT IDENTITY ROW, and the audience for the face is
							     the audience for the name that is already here. Both
							     grading routes refuse a student before this renders (the
							     per-section load redirects on `classroom_manages_section`,
							     the cross-section one 404s on an empty managed set), and
							     underneath them `classroom_can_review_submission` gates
							     every row RLS returns. The heading beside this avatar
							     prints the student's display name and the line under it
							     prints their address. -->
							<Avatar
								subject={avatarByEmail.get(selected.email) ?? null}
								tintKey={selected.email}
								size={40}
							/>
							<div class="work-ident">
							<h2 class="work-name">{selected.displayName}</h2>
							<p class="work-meta">
								{selected.email}
								{#if selected.submission?.submitted_at}
									· submitted {new Date(selected.submission.submitted_at).toLocaleString(undefined, {
										month: 'short',
										day: 'numeric',
										hour: 'numeric',
										minute: '2-digit'
									})}
								{/if}
								· {submissionStateLabel(selected.submission?.state)}
							</p>
							<!--
								IT NAMES WHEN, NOT JUST THAT. A bare flag sends the instructor
								hunting through a submission for what moved; the instant is the
								whole difference between "look at this" and "look for this".
								Both timestamps are shown because the comparison IS the claim.
							-->
							{#if selectedChange}
								<p class="changed-line" data-testid="changed-after-grading">
									<strong>{postGradeChangeLabel(selectedChange)}.</strong>
									Graded {stamp(selectedChange.gradedAt)}, work last touched
									{stamp(selectedChange.at)}. Grading again clears this.
								</p>
							{/if}
							</div>
						</div>
						<button type="button" class="btn secondary tiny" onclick={() => requestSelect(null)}>
							Close
						</button>
					</div>

					{#if pending}
						<!-- THE CONFIRM NAMES WHAT IT COSTS, with the real counts, before
						     anything is thrown away. It renders where the grader was
						     working rather than in a browser dialog. -->
						<div class="card dirty-bar" role="alertdialog" aria-label="Unsaved grading">
							<p class="dirty-line">
								{selected.displayName} has unsaved grading: {dirtyCost}. Switching now
								discards it.
							</p>
							<span class="dirty-actions">
								<button type="button" class="btn tiny" disabled={busy} onclick={saveThenSwitch}>
									Save draft, then switch
								</button>
								<button
									type="button"
									class="btn secondary tiny danger"
									disabled={busy}
									onclick={() => applySelect(pending?.next ?? null)}
								>
									Discard and switch
								</button>
								<button
									type="button"
									class="btn secondary tiny"
									disabled={busy}
									onclick={() => (pending = null)}
								>
									Stay here
								</button>
							</span>
						</div>
					{/if}

					<!--
						SIDE BY SIDE: the work (left) and the rubric (right) each scroll
						on their own, so scoring never means scrolling away from what is
						being scored. Below ~900px this collapses to one stacked column
						(the .console.split breakpoint's own convention).
					-->
					<div class="work-split" class:has-rubric={!!rubric?.length}>
						<!--
							THE ONE SCROLL REGION WITH NOTHING FOCUSABLE IN IT. Above the
							breakpoint this column scrolls on its own, and its content is a
							READ-ONLY render of the student's spec responses -- so without a
							tab stop of its own there is no way to scroll it without a mouse
							(WCAG 2.1.1). `tabindex="0"` on a labelled region is the standard
							remedy. The roster and the rubric need none: both are full of
							buttons.
						-->
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<div class="work-col work-left" tabindex="0" role="region" aria-label="Work handed in">
							<!--
								WHAT CAME IN UNFINISHED, NAMED (0160).

								The count on the roster says THAT something is missing; a
								grader needs to know WHAT, and needs it before they read the
								responses rather than after. The sentences are `unmetLabel`'s
								own -- byte for byte the ones the student read on the
								assignment before they pressed Submit -- so the two sides are
								looking at the same list and neither has to be told what the
								other saw.

								IT IS NEUTRAL BY CONSTRUCTION. Turning in unfinished work is
								something the database now allows on purpose, so this is a
								note about the work and never a finding about the student, and
								it changes no score: there is no control in this card, nothing
								here reaches the rubric, the total, the override path or the
								return flow, and grading an incomplete submission works
								exactly as grading any other one does.
							-->
							{#if selectedUnmet.length > 0}
								<div class="card incomplete-card" data-testid="incomplete-card">
									<h3 class="section-label incomplete-head">
										Handed in with {selectedUnmet.length}
										{selectedUnmet.length === 1 ? 'requirement' : 'requirements'} unfinished
									</h3>
									<p class="incomplete-note">
										Work can be turned in before everything is finished, so this is a note
										about the work and not a flag on the student.
										{selectedUnmet.length === 1
											? 'This is the same note the student saw before submitting.'
											: 'These are the same notes the student saw before submitting.'}
										Score and return it as you would any other submission.
									</p>
									<ul class="incomplete-list" data-testid="incomplete-list">
										{#each selectedUnmet as entry, i (i)}
											<li>{unmetLabel(spec, entry)}</li>
										{/each}
									</ul>
								</div>
							{/if}

							{#if spec && gateModule}
								{@const approved = gateApproved(spec, selected.approvals)}
								<div class="card gate-row" class:approved>
									<span class="gate-text">
										{spec.approvalGate?.label ?? 'Instructor approval'}:
										{approved ? ' approved' : ' not yet approved'}
									</span>
									<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => setGate(!approved)}>
										{approved ? 'Withdraw approval' : 'Approve'}
									</button>
								</div>
							{/if}

							{#if selected.files.filter((f) => !f.block_id).length}
								<div class="card">
									<h3 class="section-label">Files handed in</h3>
									<SubmissionFileList files={selected.files.filter((f) => !f.block_id)} />
								</div>
							{/if}

							{#if spec}
								<h3 class="section-label responses-label">Responses</h3>
								{#key selected.email}
									<SpecRenderer
										{spec}
										initialValues={Object.fromEntries(
											selected.responses.map((r) => [r.block_id, r.value ?? {}])
										)}
										attachments={item.attachments}
										files={selected.files}
										readonly
										approved={gateApproved(spec, selected.approvals)}
									/>
								{/key}
							{:else if !selected.files.length}
								<p class="note card">Nothing handed in yet.</p>
							{/if}
						</div>

						{#if rubric?.length}
							<div class="work-col work-right" role="region" aria-label="Rubric">
								<div class="card score-card">
									<h3 class="section-label">Rubric score</h3>
									<!--
										THE KEYS, PRINTED. The same array the handler dispatches
										from (GRADE_KEYS), so a key that stops working stops being
										advertised. The Tab row is marked native: the browser
										moves focus, this component does not swallow it.
									-->
									<ul class="key-legend" data-testid="grade-key-legend">
										{#each GRADE_KEYS as k (k.keys)}
											<li><kbd>{k.keys}</kbd> {k.label}</li>
										{/each}
									</ul>
									{#if keyNote}<p class="key-note" role="status">{keyNote}</p>{/if}
									<!-- Grading is a LEVEL CHOICE, not a typed number: every level's
									     descriptor stays reachable so the decision is made against the
									     written standard, and the level's points are what apply. -->
									{#each criteria as c, ci (c.id)}
										{@const max = criterionMax(c)}
										{@const chosen = chosenIndex(ci)}
										{@const rove = roveIndex(ci)}
										{@const override = isOverrideScore(c, scores[c.id])}
										{@const missingNote = needComment.includes(c.id)}
										<div
											class="score-row"
											class:override
											class:flagged={missingNote}
											class:focused={ci === critIndex}
										>
											<div class="score-head">
												<span class="score-crit">{c.criterion}</span>
												<span class="score-value" class:override>
													{scores[c.id] ?? '—'} / {max}
													{#if override}<span class="override-chip">Override</span>{/if}
												</span>
											</div>
											{#if criterionIncomplete(c)}
												<p class="score-unfinished">
													This criterion’s levels are unfinished, so most scores need an override.
												</p>
											{/if}
											<div class="level-picker" role="group" aria-label={`Levels for ${c.criterion}`}>
												{#each c.levels ?? [] as level, li (li)}
													{@const key = levelKey(ci, li)}
													{@const short = levelShort(level, c.id, spec)}
													{@const full = level.descriptor?.trim() ?? ''}
													{@const hasTip = !!full && full !== short}
													{@const tipId = `grade-tip-${c.id}-${li}`}
													<div class="level-slot">
														<button
															type="button"
															class="level-btn"
															class:picked={li === chosen}
															aria-pressed={li === chosen}
															aria-describedby={hasTip ? tipId : undefined}
															tabindex={li === rove ? 0 : -1}
															data-grade-level={key}
															bind:this={levelEls[key]}
															onclick={() => {
																critIndex = ci;
																pickLevel(c, level.points);
															}}
															onpointerenter={() => (hoveredLevel = key)}
															onpointerleave={() => {
																if (hoveredLevel === key) hoveredLevel = null;
															}}
															onfocus={() => {
																critIndex = ci;
																hoveredLevel = key;
															}}
															onblur={() => {
																if (hoveredLevel === key) hoveredLevel = null;
															}}
														>
															<span class="level-top">
																<span class="level-points">{level.points}</span>
																<span class="level-label">{level.label}</span>
															</span>
															{#if short}
																<span class="level-short">{short}</span>
															{/if}
														</button>
														{#if hasTip}
															<span
																class="level-tip"
																class:shown={hoveredLevel === key}
																role="tooltip"
																id={tipId}
																use:anchored={{
																	anchor: levelEls[key],
																	open: hoveredLevel === key,
																	prefer: 'above',
																	align: 'end'
																}}>{full}</span
															>
														{/if}
													</div>
												{/each}
											</div>
											<button type="button" class="override-toggle" onclick={() => toggleOverride(c)}>
												{overrideOpen[c.id] ? 'Use a level instead' : 'Score between levels'}
											</button>
											{#if overrideOpen[c.id]}
												<div class="override-box">
													<span class="score-input">
														<input
															type="number"
															min="0"
															max={max}
															step="0.5"
															bind:value={scores[c.id]}
															aria-label={`Score for ${c.criterion}`}
														/>
														<span class="score-out">/ {max}</span>
													</span>
													<textarea
														class="crit-comment"
														rows="2"
														placeholder="Why this score and not a level? (required)"
														aria-label={`Comment on ${c.criterion}`}
														bind:value={critComments[c.id]}
													></textarea>
												</div>
											{:else if critComments[c.id]}
												<p class="score-note">{critComments[c.id]}</p>
											{/if}
											{#if missingNote}
												<p class="score-flag">A comment is required to score between levels.</p>
											{/if}
										</div>
									{/each}
									<!--
										EXTRA CREDIT IS ITS OWN LINE, never a criterion. A rubric
										criterion's maximum is its top level's points and the maxima
										sum to the module total, so a criterion holding an award
										would be a rubric that no longer describes the grading --
										and 0095's override machinery would read every award as an
										unexplained off-level score forever.
									-->
									{#if extraCreditReady}
										<div class="extra-credit">
											<label class="ec-label" for="grade-extra-credit">Extra credit</label>
											<input
												id="grade-extra-credit"
												class="ec-input tap-44"
												type="number"
												min="0"
												step="0.5"
												placeholder="0"
												bind:value={extraCredit}
											/>
											<span class="ec-note">
												Points beyond the rubric. Blank or 0 awards none.
											</span>
										</div>
										{#if extraCreditInvalid}
											<p class="score-flag" data-testid="extra-credit-invalid">
												Extra credit must be a number of 0 or more. To lower a score, score
												the rubric criteria lower.
											</p>
										{/if}
									{:else}
										<!--
											THE CAPABILITY, SAID OUT LOUD. The payload came back
											without 0171's column, so this deployment cannot record an
											award; offering the control here would send one into an
											arity that has no parameter for it. Turning off exactly
											what is missing and saying so beats blanking the form.
										-->
										<p class="ec-unavailable" data-testid="extra-credit-unavailable">
											Extra credit is not available on this deployment yet.
										</p>
									{/if}
									<div class="score-total">
										Total: {liveAwarded} / {outOf} pts{#if extraCreditReady && (extraCreditNumber ?? 0) > 0}
											&nbsp;<span class="ec-part"
												>({liveTotal} rubric + {extraCreditNumber} extra credit)</span
											>{/if}
									</div>
									<label class="comment-label" for="grade-comment">Comment to the student</label>
									<textarea id="grade-comment" class="comment" rows="3" bind:value={comment}></textarea>
									{#if gradeError}<p class="feedback error">{gradeError}</p>{/if}
									{#if gradeNotice}<p class="feedback ok">{gradeNotice}</p>{/if}
									<span class="grade-actions">
										<button
											type="button"
											class="btn secondary tiny"
											disabled={busy}
											onclick={() => void save.saveNow()}
										>
											Save draft
										</button>
										<button
											type="button"
											class="btn tiny"
											class:armed={armReturn}
											disabled={busy}
											onclick={() => grade(true)}
										>
											{armReturn ? 'Press R again to return' : 'Return to student'}
										</button>
										<!-- The live unsaved marker, in the same words the other three
										     surfaces use. It reports the acknowledgement, so "Saved" here
										     means the draft is stored, never that a request went out. -->
										<SaveIndicator state={save} />
									</span>

									{#if bulk}
										<!--
											THE BATCH, UNDER THE RUBRIC THAT FEEDS IT.
											It is here and not in a panel of its own because the scores
											above ARE what it sends: an instructor reads this student's
											work, scores it, and then says "and everyone else I ticked
											earned that too". A separate batch form would be a
											spreadsheet with the work hidden behind it, which produces
											worse grades faster.
										-->
										<div class="batch" data-testid="batch-bar">
											<p class="batch-count" data-testid="batch-count">{pickedSummary}</p>
											{#if picked.length === 0}
												<p class="batch-hint">
													Tick names in the roster to score them all with the rubric
													above. Nothing is written until you press a button here.
												</p>
											{:else}
												{#if plan.problems.length}
													<!-- A REFUSAL RENDERS WHERE THE GRADER IS WORKING, in the
													     same list as every other problem, and before a round
													     trip rather than after thirty identical ones. -->
													<ul class="batch-problems" data-testid="batch-problems">
														{#each plan.problems as p, i (i)}
															<li><strong>{p.label}.</strong> {p.message}</li>
														{/each}
													</ul>
												{/if}
												{#if plan.skipped.length}
													<p class="batch-skipped" data-testid="batch-skipped">
														{plan.skipped.length}
														{plan.skipped.length === 1 ? 'student is' : 'students are'} in the
														selection but will not be written: {plan.skipped
															.map((x) => x.displayName)
															.join(', ')}. Score at least one criterion above first.
													</p>
												{/if}
												{#if armedRelease == null}
													<div class="batch-actions">
														<button
															type="button"
															class="btn secondary tiny"
															data-testid="batch-arm-draft"
															aria-disabled={plan.grades.length === 0}
															disabled={batchBusy}
															onclick={() => armBatch(false)}
														>
															Save drafts for {picked.length}
														</button>
														<button
															type="button"
															class="btn tiny"
															data-testid="batch-arm-return"
															aria-disabled={plan.grades.length === 0}
															disabled={batchBusy}
															onclick={() => armBatch(true)}
														>
															Return to {picked.length}
														</button>
													</div>
												{:else}
													<!--
														NOTHING IS WRITTEN UNTIL IT IS COMMITTED, AND WHAT WILL
														BE WRITTEN IS ON SCREEN FIRST. `plan.rows` and
														`plan.grades` come out of ONE call, so this table cannot
														describe a batch other than the one about to be sent.
													-->
													<div class="batch-plan" data-testid="batch-plan">
														<p class="batch-plan-head">
															About to {armedRelease ? 'return' : 'save as drafts'}
															{plan.rows.length}
															{plan.rows.length === 1 ? 'grade' : 'grades'}, out of {plan.outOf} pts.
														</p>
														{#if plan.rows.length}
															<table class="plan-table">
																<thead>
																	<tr>
																		<th scope="col">Student</th>
																		{#if crossClass}<th scope="col">Class</th>{/if}
																		<th scope="col">Was</th>
																		<th scope="col">Becomes</th>
																	</tr>
																</thead>
																<tbody>
																	{#each plan.rows as row (row.email)}
																		<tr data-plan-row={row.email}>
																			<td>{row.displayName}</td>
																			{#if crossClass}<td class="plan-section">{row.sectionTitle}</td>{/if}
																			<td class="plan-was">
																				{row.previous == null ? 'Not graded' : `${row.previous}`}
																			</td>
																			<td class="plan-becomes">
																				{row.awarded}{#if row.extraCredit}
																					<span class="plan-ec"
																						>({row.rubricPoints} + {row.extraCredit})</span
																					>{/if}
																			</td>
																		</tr>
																	{/each}
																</tbody>
															</table>
														{/if}
														{#if plan.rows.some((r) => r.regrade)}
															<p class="batch-regrade" data-testid="batch-regrade">
																{plan.rows.filter((r) => r.regrade).length} of these already have
																a grade. Committing replaces it, and stamps the work as graded
																again, which clears any "changed after grading" mark.
															</p>
														{/if}
														<div class="batch-actions">
															<button
																type="button"
																class="btn tiny"
																data-testid="batch-commit"
																aria-disabled={!canSend}
																disabled={batchBusy}
																onclick={() => void commitBatch()}
															>
																{batchBusy
																	? 'Writing'
																	: armedRelease
																		? `Yes, return ${plan.rows.length}`
																		: `Yes, save ${plan.rows.length} drafts`}
															</button>
															<button
																type="button"
																class="btn secondary tiny"
																data-testid="batch-cancel"
																disabled={batchBusy}
																onclick={() => (armedRelease = null)}
															>
																Cancel
															</button>
														</div>
													</div>
												{/if}
											{/if}
											{#if outcome}
												<!--
													PER STUDENT, BY NAME, ALWAYS. "27 of 30 saved" sends an
													instructor hunting; the three names say what to do. The
													refused rows sort FIRST and keep their class, because on a
													cross-class surface the likeliest reason a row is refused is
													that it belongs to a class somebody else teaches.
												-->
												<div class="batch-outcome" data-testid="batch-outcome">
													<p
														class="batch-headline"
														class:bad={outcome.refused > 0}
														data-testid="batch-headline"
													>
														{outcome.headline}
													</p>
													<ul class="outcome-list">
														{#each outcome.rows as row (row.email)}
															<li class:refused={!row.ok} data-outcome-row={row.email}>
																<span class="outcome-name">{row.displayName}</span>
																{#if crossClass && row.sectionTitle}
																	<span class="outcome-section">{row.sectionTitle}</span>
																{/if}
																<span class="outcome-sentence">{row.sentence}</span>
															</li>
														{/each}
													</ul>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</section>
			{/if}
		</div>
	{/if}

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	/* Spacing only: the look lives in classroom.css. */
	.feedback {
		margin: 0.4rem 0;
	}

	.grading-page {
		max-width: var(--cr-measure, var(--measure-console));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
		/* EXPLICIT, because `margin: 0 auto` cancels the stretch this would
		   otherwise get as a flex item of the application frame: auto margins eat
		   the free space instead and the box falls back to shrink-to-fit. Measured
		   without it: 409px of console in a 1440px window. (split.css carries the
		   same note for the same reason.) */
		width: 100%;
	}
	/* THE HERO IS CHROME HERE, not an opening. app.css gives `.hero` 4rem of
	   top padding and centres it, which is right for a page somebody arrives at
	   and reads down; on a console that never scrolls it is 104px of the
	   working area spent on a title. Left-aligned so it sits on the same line as
	   the roster and the breadcrumb above it. */
	.console-hero {
		text-align: left;
		padding: var(--space-3) 0 var(--space-3);
	}
	/* Measured as a set with the rest of the console's rhythm: the eyebrow's
	   24px trailing margin and a 38px title cost 132px of a 900px window before
	   any grading happened. Neither number is decoration -- they are the page's
	   own identity -- so they are tightened rather than dropped, and the title is
	   still the largest thing on the screen. */
	.console-hero .eyebrow {
		margin-bottom: var(--space-1);
	}
	.console-hero h1 {
		font-size: 1.75rem;
		line-height: 1.15;
	}
	.meta-line {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		margin: 0.2rem 0 0;
	}
	.console {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.9rem;
		align-items: start;
	}
	.console.split {
		grid-template-columns: minmax(15rem, 20rem) minmax(0, 1fr);
	}
	@media (max-width: 800px) {
		.console.split {
			grid-template-columns: 1fr;
		}
	}
	.section-label {
		margin: 0 0 var(--space-2);
		font-size: 0.8rem;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.roster {
		min-width: 0;
	}
	.roster-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-2);
	}
	.csv-hint {
		margin: 0 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--text-2);
	}
	/* Its own boxed group rather than three more chips on the roster heading:
	   these three write a file carrying somebody's writing out of the building,
	   and the identity switch has to read as belonging to them. */
	.work-export {
		margin: 0 0 var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2);
	}
	.work-export-label {
		margin: 0 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	/* WRAPS RATHER THAN SCROLLS. The roster column is 260px at the narrow end
	   and these are three real words each, so a nowrap row is what pushes the
	   page wider than a 375px viewport. */
	.work-export-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		min-width: 0;
	}
	/* MEASURED AT THE LABEL, which is what a finger hits: the input inside it
	   is ~13px and no amount of sizing on the box would change that. */
	.identity-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 44px;
		margin-top: var(--space-2);
		font-size: 0.76rem;
		line-height: 1.4;
		color: var(--text-1);
		cursor: pointer;
	}
	.identity-toggle input {
		flex: none;
		width: 18px;
		height: 18px;
		accent-color: var(--green);
	}
	.identity-note {
		margin: var(--space-1) 0 0;
		font-size: 0.68rem;
		line-height: 1.45;
		color: var(--text-2);
	}
	.export-note {
		margin: var(--space-2) 0 0;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		line-height: 1.45;
		color: var(--green);
	}
	/* Amber, not crimson: an off-roster response set is something to look at,
	   not an error, and crimson stays reserved for live / rec / error. */
	.off-roster {
		margin: 0 0 var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--amber);
		border-radius: var(--radius-card);
		font-size: 0.76rem;
		line-height: 1.45;
		color: var(--text-1);
	}
	/* NOT --amber. The off-roster line above is a WARNING -- work with no
	   enrollment behind it -- and this one is a statement of fact about a
	   roster that is behaving correctly. Giving them the same edge would say
	   they are the same kind of finding, which is exactly what keeping them
	   apart is for. --boundary is the load-bearing neutral. */
	.manager-note {
		margin: 0 0 var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		font-size: 0.76rem;
		line-height: 1.45;
		color: var(--text-2);
	}
	.roster-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-1);
	}
	/* NOTHING OPEN IS ONE PANE, and the list is what has to USE the width it is
	   then given. A single 20rem column centred in 1376px of roster is the same
	   defect one level in. The column is measured, not round: a row is a name
	   and a status chip on one line, and below ~22rem the longer names start
	   ellipsising against the chip. `auto-fit` (not `auto-fill`) so a class of
	   four students gets four cells rather than four and a void, and
	   `min(22rem, 100%)` so the same rule is the single narrow column with no
	   breakpoint of its own. */
	.console:not(.split) .roster-list {
		grid-template-columns: repeat(auto-fit, minmax(min(22rem, 100%), 1fr));
		gap: var(--space-2);
	}
	.roster-row {
		appearance: none;
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2);
		background: var(--surface-2);
		/* THE BOUNDARY IS THE AFFORDANCE on an option control, so it is measured
		   like one: `--hairline` was 1.22:1 against the card it sits on, and the
		   row's own fill is 1.06:1, so with a boundary that faint there was
		   nothing saying where one option ends and the next begins.

		   This was a LOCAL `--text-3` override, taken at the time as 3.13:1.
		   That number was measured against `--surface-1`; these controls fill
		   themselves with `--surface-2`, where the same ink is 2.95:1 and does
		   not clear the 3:1 floor at all. It now reads the shared token, which
		   is measured against every ground it can land on (4.62:1 here). */
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.9rem;
		/* 44px, and the padding is what carries it rather than a token that
		   happens to land near: a roster row is the most-clicked control on the
		   surface and it measured 35px. */
		min-height: 44px;
		padding: var(--space-2) 0.6rem;
		cursor: pointer;
		text-align: left;
	}
	.roster-row:hover,
	.roster-row.active {
		border-color: var(--line-strong);
	}
	.roster-row.active {
		background: var(--surface-0);
	}
	/* 0.6 PUT EVERY WORD IN THE ROW UNDER THE BAR, including the work chip:
	   --text-2 at 0.6 measured 3.29:1. A group opacity dims the state signal and
	   the content it describes by exactly the same amount, so the only lever is
	   the number. 0.8 is the lowest step that clears 4.5 on both grounds this
	   row lands on (4.81 on --surface-2, 5.17 on --surface-0) and is still a
	   plainly visible step down from an active row. */
	.roster-row.inactive {
		opacity: 0.8;
	}
	.roster-name {
		min-width: 0;
		overflow-wrap: anywhere;
		/* THE NAME TAKES THE SLACK, which is what keeps the face beside it.
		   `.roster-row` is `space-between`, so with three children the middle
		   one would otherwise float free and leave a gap between the picture
		   and the name it belongs to. Growing the name instead puts the pair
		   hard left and leaves the chips hard right, which is byte-identical
		   to the two-child arrangement this row had before there was a
		   picture in it. `text-align` is stated rather than inherited because
		   a grown box is the first place a centred ancestor would show. */
		flex: 1 1 auto;
		text-align: left;
	}
	/* -------------------------------------------------------------------
	   GRADING AT SCALE. Everything below renders only when the bulk transport
	   is handed in, so the per-section console's box model is byte-identical
	   to what it was.
	   ------------------------------------------------------------------- */
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	/* The tick box and the row are two controls on one line, and the row keeps
	   the rest of the measure: a name that shrank to make room for a checkbox
	   would ellipsise the one thing the row is for. */
	.roster-item {
		display: block;
	}
	.roster-item.pickable {
		display: flex;
		align-items: stretch;
		gap: var(--space-1);
	}
	.roster-item.pickable .roster-row {
		flex: 1 1 auto;
		min-width: 0;
	}
	/* `.tap-44` in the markup carries the height; this carries the width, so the
	   target is square rather than a 44px-tall sliver. It is a control of its
	   own beside another control, so it takes the load-bearing boundary. */
	.roster-pick {
		flex: 0 0 auto;
		justify-content: center;
		min-width: 44px;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2);
		cursor: pointer;
	}
	.roster-pick input {
		width: 1.05rem;
		height: 1.05rem;
		accent-color: var(--green);
		cursor: pointer;
	}
	/* THE CLASS, ON EVERY ROW, and NEUTRAL on purpose. The other chips carry a
	   verdict about the work (gold: special, amber: warning, cyan/green: state);
	   a class name is an identity and inventing a hue for it would put a
	   sixth semantic colour on a row that already has five. The WORD is the
	   whole signal here, so it takes the body ink and the load-bearing edge and
	   is simply the most legible chip in the row -- which is what it should be,
	   since grading the wrong class's student is the silent failure. */
	.roster-chip.section {
		color: var(--text-1);
		border-color: var(--boundary);
		background: var(--surface-0);
	}
	.roster-group + .roster-group {
		margin-top: var(--space-3);
	}
	.roster-group-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
		margin: 0 0 var(--space-1);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-1);
		border-bottom: 1px solid var(--boundary);
		padding-bottom: 0.25rem;
	}
	.roster-group-count {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-2);
	}
	.pick-presets {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
	}
	.pick-presets-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.cross-class-link {
		margin: var(--space-2) 0 0;
		font-size: 0.85rem;
	}
	.cross-class-link a {
		/* `.tap-44` gives the height; this gives the box something to be tall
		   with, so the target is a control rather than a line of text with air
		   claimed around it. */
		padding: 0 0.2rem;
	}
	.export-section {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin-bottom: var(--space-2);
	}
	.export-section-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.export-section select {
		background: var(--surface-2);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		font-family: var(--font-display);
		font-size: 0.85rem;
		padding: 0 0.5rem;
	}
	.batch {
		margin-top: var(--space-3);
		padding-top: var(--space-2);
		border-top: 1px solid var(--boundary);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.batch-count {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-1);
	}
	.batch-hint,
	.batch-skipped,
	.batch-regrade {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.batch-regrade {
		color: var(--amber);
	}
	.batch-problems {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.82rem;
		color: var(--amber);
		display: grid;
		gap: 0.3rem;
	}
	.batch-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.batch-plan {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		background: var(--surface-0);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		padding: var(--space-2);
	}
	.batch-plan-head {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-1);
	}
	/* Its own scroller: a plan with a class column is wider than a narrow pane,
	   and the page body must never scroll sideways to show it. */
	.plan-table {
		display: block;
		max-width: 100%;
		overflow-x: auto;
		border-collapse: collapse;
		font-size: 0.8rem;
	}
	.plan-table th,
	.plan-table td {
		text-align: left;
		padding: 0.25rem 0.5rem 0.25rem 0;
		border-bottom: 1px solid var(--hairline);
		white-space: nowrap;
	}
	.plan-table th {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-2);
	}
	.plan-was {
		color: var(--text-2);
	}
	.plan-becomes {
		font-family: var(--font-mono);
		color: var(--text-1);
	}
	.plan-section {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-1);
	}
	.plan-ec {
		color: var(--text-2);
		margin-left: 0.3rem;
	}
	.batch-outcome {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.batch-headline {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--green);
	}
	.batch-headline.bad {
		color: var(--amber);
	}
	.outcome-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.25rem;
		font-size: 0.8rem;
	}
	.outcome-list li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: baseline;
		color: var(--text-2);
	}
	.outcome-name {
		color: var(--text-1);
	}
	.outcome-section {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	/* THE REFUSALS ARE THE ONES TO READ, and they sort first as well as
	   colouring differently -- the sentence beside the name is what says what to
	   do, so colour is never doing the work on its own. */
	.outcome-list li.refused .outcome-sentence {
		color: var(--amber);
	}
	.roster-chip {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.06rem 0.45rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.roster-chip.submitted {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.roster-chip.returned {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.roster-chip.progress {
		color: var(--teal);
		border-color: var(--teal);
	}
	/* --gold, and the two tokens it is NOT are the argument.

	   --amber is this file's warning edge (the off-roster line), and an
	   incomplete hand-in is not a warning: since 0160 it is a thing the database
	   accepts on purpose, so an amber pill would tell a grader who has never met
	   the distinction that a student did something wrong. --boundary is this
	   file's neutral edge (the manager note), and that is too quiet for the one
	   instructor this exists for -- a mark he has to already know about to
	   notice is not a mark. --gold is the register's special-callout token:
	   loud enough to be read at a glance, and carrying no verdict. --crimson is
	   reserved for live / rec / error and is not a candidate.

	   Measured on both grounds this pill lands on: 7.94:1 on --surface-2 (the
	   row's own fill) and 8.55:1 on --surface-0 (an active row). The WORD carries
	   the meaning either way -- colour is never the only signal. */
	/* --amber, and it is THIS FILE'S OWN WARNING EDGE (the off-roster line
	   uses it), which is exactly what this is. The distinction from --gold one
	   rule down is the argument: an incomplete hand-in is a thing the database
	   accepts on purpose since 0160, so gold says "special, look at this"; work
	   that moved after it was graded is a grade that may no longer describe what
	   is there, which is a warning in the ordinary sense of the word. */
	.roster-chip.changed {
		color: var(--amber);
		border-color: var(--amber);
	}
	.roster-chip.incomplete {
		color: var(--gold);
		border-color: var(--gold);
	}
	/* The two chips are their own group so a long name shrinks against the pair
	   rather than shoving the second one out of the row, and so they wrap
	   together at 375px instead of one at a time. */
	.roster-chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-items: center;
		gap: 0.25rem;
	}
	/* Same shape as .off-roster and .manager-note above -- this is the third
	   member of that family -- with the callout token rather than either of
	   theirs, for the reason written on .roster-chip.incomplete. */
	.incomplete-card {
		border-color: var(--gold);
	}
	.incomplete-head {
		color: var(--gold);
	}
	.incomplete-note {
		margin: 0 0 var(--space-2);
		font-size: 0.76rem;
		line-height: 1.45;
		color: var(--text-1);
	}
	.incomplete-list {
		margin: 0;
		padding-left: 1.1rem;
		display: grid;
		gap: 0.3rem;
		font-size: 0.8rem;
		line-height: 1.45;
		color: var(--text-1);
	}
	.work {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.card {
		/* ONE margin, not app.css's 1.25rem above and this component's 0.9rem
		   below: the two disagreed, and on a surface where every row of pixels is
		   working area the top one was 20px of nothing between stacked cards. */
		margin: 0 0 var(--space-3);
	}
	.work-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.6rem;
	}
	/* THE AVATAR AND THE NAME ARE ONE ROW, and the name is the half that
	   gives. `align-items: start` rather than centre because the block beside
	   the picture is three lines deep on a graded submission and centring it
	   would float the face against the middle of a paragraph. `min-width: 0`
	   on the text column is what lets a long name wrap instead of forcing the
	   card wider (CLAUDE.md's min-width rule); the avatar's own
	   `flex-shrink: 0` is what stops it being the thing that gives. */
	.work-who {
		display: flex;
		align-items: start;
		gap: 0.65rem;
	}
	.work-ident {
		min-width: 0;
	}
	.work-name {
		margin: 0;
		font-size: 1.05rem;
	}
	.work-meta {
		margin: 0.15rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.dirty-bar {
		border-color: var(--amber);
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
	}
	.dirty-line {
		margin: 0;
		font-size: 0.88rem;
		color: var(--amber);
	}
	.dirty-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	/* Side by side: the work (left) and the rubric (right), each independently
	   scrollable, so scoring never means losing sight of the other. Without a
	   rubric yet this stays one column (has-rubric is off), matching the old
	   single-column layout exactly. */
	.work-split {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.work-split.has-rubric {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
		gap: 0.9rem;
		align-items: start;
	}
	.work-col {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	@media (max-width: 900px) {
		.work-split.has-rubric {
			grid-template-columns: 1fr;
		}
	}

	/* --- THE APPLICATION FRAME ---------------------------------------------
	   Above the shell's own breakpoint the room is the viewport (`.cr-app` on
	   the classroom wrapper, set by the layout from nav.ts's `console`
	   measure), and this is its body: three regions in one row that fill what
	   is left under the chrome, each scrolling on its own, with the DOCUMENT
	   not scrolling at all.

	   WHAT THIS REPLACES is `max-height: calc(100vh - 11rem)` on the two work
	   columns. That named a chrome height nobody can keep true -- a breadcrumb
	   that wraps, a notice, a hero that grows -- so the page scrolled as one
	   column WHILE the panes scrolled inside it, and the roster had no overflow
	   rule at all: a class of thirty made the page taller instead. Nothing here
	   names a height; the frame measures itself and this takes the rest.

	   BELOW THE BREAKPOINT none of it applies: the document owns the scroll,
	   the columns stack at 900px and the roster at 800px exactly as before.
	   ---------------------------------------------------------------------- */
	@media (min-width: 1024px) {
		.grading-page {
			display: flex;
			flex-direction: column;
			min-height: 0;
			/* The 3rem tail is for a page that ends; this one does not. */
			padding-bottom: var(--space-3);
		}
		.console {
			flex: 1 1 auto;
			min-height: 0;
			align-items: stretch;
		}
		.roster {
			display: flex;
			flex-direction: column;
			min-height: 0;
			/* The heading and Export CSV stay put; the NAMES scroll. */
			overflow: hidden;
		}
		.roster-list {
			min-height: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
		}
		.work {
			min-height: 0;
		}
		.work-split {
			flex: 1 1 auto;
			min-height: 0;
		}
		/* THE ROW IS THE PANE, not the taller of its two columns. `align-items:
		   start` (correct while the document scrolls) sizes each column to its own
		   content, so the two scroll containers below were 1234px and 1408px tall
		   inside a 532px box and neither of them ever scrolled -- measured. An
		   explicit single `1fr` row plus `stretch` is what bounds them; `minmax(0,
		   1fr)` rather than `1fr` so the row can be SMALLER than its content, which
		   is the whole point. */
		.work-split.has-rubric {
			grid-template-rows: minmax(0, 1fr);
			align-items: stretch;
		}
		.work-split.has-rubric .work-col {
			min-height: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
			padding-right: 0.3rem;
		}
		/* Without a rubric there is one column and it is the one that scrolls. */
		.work-split:not(.has-rubric) {
			min-height: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
		}
		.page-footer {
			flex: none;
		}
	}
	.gate-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		border-color: var(--gold);
	}
	.gate-row.approved {
		border-color: var(--line-strong);
	}
	.gate-text {
		font-size: 0.88rem;
	}
	.responses-label {
		margin: 0.2rem 0 0.5rem;
	}
	.score-card {
		border-color: var(--line-strong);
	}
	/* THE KEYS, PRINTED, where they are used. */
	.key-legend {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		margin: 0 0 var(--space-3);
		padding: 0;
		font-family: var(--font-display);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.key-legend li {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.key-legend kbd {
		padding: 0.1em 0.35em;
		border: 1px solid var(--line-strong);
		border-radius: 3px;
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-1);
	}
	.key-note {
		margin: 0 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--amber);
	}
	.score-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: var(--space-2) 0 var(--space-3);
		border-bottom: 1px solid var(--boundary);
		border-left: 2px solid transparent;
	}
	/* WHICH CRITERION THE KEYS ACT ON, said in the interface rather than left
	   for the grader to infer from where the caret went. */
	.score-row.focused {
		border-left-color: var(--cyan);
		padding-left: var(--space-2);
	}
	.score-row.override {
		border-left-color: var(--amber);
		padding-left: var(--space-2);
	}
	.score-row.flagged {
		border-left-color: var(--crimson);
		padding-left: var(--space-2);
	}
	.score-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.6rem;
	}
	.score-crit {
		font-size: 0.88rem;
		min-width: 0;
	}
	.score-value {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-1);
		white-space: nowrap;
	}
	.score-value.override {
		color: var(--amber);
	}
	.override-chip {
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 1px solid var(--amber);
		border-radius: 999px;
		padding: 0.05rem 0.4rem;
		margin-left: 0.3rem;
	}
	.level-picker {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.level-slot {
		display: flex;
		min-width: 0;
	}
	.level-btn {
		appearance: none;
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
		width: 100%;
		min-width: 0;
		text-align: left;
		background: var(--surface-2);
		/* Same boundary as the roster row above, and the same token. */
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		padding: 0.4rem 0.55rem;
		min-height: 44px;
		cursor: pointer;
	}
	.level-btn:hover {
		border-color: var(--line-strong);
	}
	/* THE FILL IS PINNED, and the ink does not move. A picked level derived its
	   background from its own ink would hand most of the added contrast straight
	   back; the surface token is a fixed step darker and the green edge is what
	   carries the state, beside the pressed word the button already exposes. */
	.level-btn.picked {
		border-color: var(--green);
		background: var(--surface-0);
	}
	.level-top {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}
	.level-points {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--gold);
		min-width: 1.6rem;
	}
	.level-label {
		font-size: 0.85rem;
	}
	.level-short {
		font-size: 0.76rem;
		color: var(--text-2);
	}
	/* The full descriptor, positioned against the viewport so the rubric
	   column's own scrolling cannot clip it. Never truncated: it wraps to
	   whatever height it needs. */
	.level-tip {
		position: fixed;
		left: 0;
		top: 0;
		z-index: 60;
		min-width: 12rem;
		max-width: 24rem;
		padding: var(--space-2) 0.65rem;
		border-radius: var(--radius-card);
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.8rem;
		line-height: 1.45;
		white-space: normal;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
	}
	@media (prefers-reduced-motion: no-preference) {
		.level-tip {
			transition: opacity 0.12s ease;
		}
	}
	.level-tip.shown {
		opacity: 1;
		visibility: visible;
	}
	@media print {
		/* On paper there is no hover, so the standard has to just BE there. */
		.level-tip {
			position: static !important;
			left: auto !important;
			top: auto !important;
			display: block;
			max-width: none;
			border: none;
			background: none;
			box-shadow: none;
			padding: 0.1rem 0 0;
			opacity: 1 !important;
			visibility: visible !important;
		}
		.level-slot {
			display: block;
		}
	}
	.override-toggle {
		appearance: none;
		background: none;
		border: none;
		color: var(--cyan);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-align: left;
		padding: var(--space-2) 0;
		/* 44px: it measured 21px, which is a real control on a surface that is
		   used with a finger as often as with a mouse. */
		min-height: 44px;
		cursor: pointer;
	}
	.override-box {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.crit-comment {
		width: 100%;
		box-sizing: border-box;
		background: var(--surface-0);
		border: 1px solid var(--amber);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.85rem;
		padding: 0.35rem 0.5rem;
	}
	.score-note {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.score-flag {
		margin: 0;
		font-size: 0.76rem;
		color: var(--crimson);
	}
	.score-unfinished {
		margin: 0;
		font-size: 0.74rem;
		color: var(--amber);
	}
	.score-input {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
	}
	.score-input input {
		width: 4.2rem;
		background: var(--surface-0);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		min-height: 44px;
		padding: 0.25rem 0.35rem;
	}
	.score-input input:focus {
		outline: none;
		border-color: var(--line-strong);
	}
	.score-out {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.score-total {
		margin: 0.6rem 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--gold);
	}
	.comment-label {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
		margin-bottom: var(--space-1);
	}
	.comment {
		width: 100%;
		box-sizing: border-box;
		background: var(--surface-0);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.9rem;
		padding: 0.4rem 0.55rem;
		margin-bottom: var(--space-2);
	}
	.grade-actions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	/* ARMED: the first R only arms the return, and the button says so in words.
	   The amber edge is the second signal beside the changed label, never the
	   only one. */
	.grade-actions .armed {
		border-color: var(--amber);
		color: var(--amber);
	}
	.warn-card {
		border-color: var(--amber);
	}
	.warn-line {
		margin: 0;
		color: var(--amber);
		font-size: 0.88rem;
	}
	.note {
		color: var(--text-2);
		font-size: 0.85rem;
	}
	.page-footer {
		margin-top: var(--space-3);
		display: flex;
		justify-content: center;
	}
	/* The post-grade sentence, in the detail head under the meta line. */
	.changed-line {
		margin: 0.35rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1.5;
		color: var(--amber);
		max-width: 60ch;
	}
	.changed-line strong {
		font-weight: 700;
	}

	.extra-credit {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.6rem 0 0.2rem;
	}
	.ec-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-2);
	}
	.ec-input {
		/* min-width AND a width: a number input's default size is wide enough to
		   push the note onto its own line at 375px for no reason. */
		width: 5.5rem;
		min-width: 0;
		font-family: var(--font-display);
		background: var(--surface-2);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		padding: 0.25rem 0.5rem;
	}
	.ec-note,
	.ec-unavailable {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.ec-unavailable {
		display: block;
		margin: 0.6rem 0 0.2rem;
	}
	.ec-part {
		font-size: 0.72rem;
		color: var(--text-2);
	}
</style>
