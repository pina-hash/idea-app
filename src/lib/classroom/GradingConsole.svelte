<script lang="ts">
	import { tick, untrack } from 'svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState, type SaveOutcome } from '$lib/save-state.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
	import SubmissionFileList from '$lib/classroom/SubmissionFileList.svelte';
	import { anchored } from '$lib/shell/anchored';
	import { isTypingTarget, keyAction, type KeyBinding } from '$lib/shell/keys';
	import {
		criterionIncomplete,
		criterionMax,
		gateApproved,
		gradesCsv,
		isOverrideScore,
		levelIndexForScore,
		levelShort,
		rubricTotal,
		scoresTotal,
		submissionStateLabel,
		type AssignmentSpec,
		type AssignmentTeacherTransports,
		type GradingData,
		type RubricCriterion,
		type StudentWork,
		studentWorkRows
	}	from '$lib/classroom/assignment-spec';
	import {
		itemTitle,
		sectionTitle,
		type ClassroomItem,
		type ClassroomSection
	} from '$lib/classroom/classroom';

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
		basePath = '/classroom'
	}: {
		section: ClassroomSection;
		item: ClassroomItem;
		spec: AssignmentSpec | null;
		rubric: RubricCriterion[] | null;
		transports: AssignmentTeacherTransports;
		basePath?: string;
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
		data ? studentWorkRows(data) : { rows: [] as StudentWork[], offRoster: [] as string[] }
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
	const selected = $derived(students.find((s) => s.email === selectedEmail) ?? null);
	const outOf = $derived(rubric ? rubricTotal(rubric) : (item.points ?? 0));
	const liveTotal = $derived(
		rubric ? scoresTotal(rubric, scores as Record<string, number>) : 0
	);
	const gateModule = $derived(spec?.approvalGate?.afterModule ?? null);

	async function load() {
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
	}
	let baseline = $state<GradeSnapshot | null>(null);
	/** A selection waiting on the confirm. `null` in `next` means "close". */
	let pending = $state<{ next: StudentWork | null } | null>(null);

	function currentSnapshot(): GradeSnapshot {
		return {
			scores: { ...$state.snapshot(scores) },
			critComments: { ...$state.snapshot(critComments) },
			comment
		};
	}

	/** Which criteria differ from the baseline, and whether the comment does. */
	const changed = $derived.by(() => {
		const base = baseline;
		if (!base) return { criteria: [] as string[], comment: false };
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
		return { criteria, comment: (base.comment ?? '').trim() !== comment.trim() };
	});
	const dirty = $derived(changed.criteria.length > 0 || changed.comment);

	/** What the confirm has to name, in the grader's terms and with real counts. */
	const dirtyCost = $derived.by(() => {
		const parts: string[] = [];
		const n = changed.criteria.length;
		if (n) parts.push(`${n} criteri${n === 1 ? 'on' : 'a'}`);
		if (changed.comment) parts.push('the comment to the student');
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
		busy = true;
		try {
			const res = await transports.gradeSubmission(
				item.id,
				selected.email,
				payload,
				comment.trim() || null,
				release,
				notes
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

	function exportCsv() {
		const rows = students.map((s) => ({
			displayName: s.displayName,
			email: s.email,
			score: s.submission?.state === 'returned' ? (s.submission.score ?? null) : null,
			outOf
		}));
		const csv = gradesCsv(rows);
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const label = (item.title ?? 'assignment').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		a.download = `grades-${label}-${sectionSlug()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
	function sectionSlug(): string {
		return sectionTitle(section).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
		<p class="note">Loading the roster…</p>
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
				{#if returnedCount < students.length}
					<p class="csv-hint">
						CSV scores fill in as work is returned ({returnedCount}/{students.length} returned).
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
				<!-- No tabindex here: every row is a real button, so the roster is
				     already reachable and scrollable from the keyboard. -->
				<ul class="roster-list">
					{#each students as s (s.email)}
						{@const chip = statusChip(s)}
						<li>
							<button
								type="button"
								class="roster-row"
								class:active={selectedEmail === s.email}
								class:inactive={!s.active}
								onclick={() => requestSelect(s)}
							>
								<span class="roster-name">{s.displayName}</span>
								<span class="roster-chip {chip.cls}">{chip.label}</span>
							</button>
						</li>
					{/each}
					{#if students.length === 0}
						<li class="note">No students enrolled in this section.</li>
					{/if}
				</ul>
			</section>

			{#if selected}
				<section class="work">
					<div class="card work-head">
						<div>
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
									<div class="score-total">Total: {liveTotal} / {outOf} pts</div>
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
</style>
