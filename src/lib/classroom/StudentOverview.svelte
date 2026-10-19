<script lang="ts">
	import { onMount } from 'svelte';
	import Avatar from '$lib/Avatar.svelte';
	import { rosterSubject } from '$lib/avatars';
	import CoinTransactionRows from '$lib/coin-balance/CoinTransactionRows.svelte';
	import { coins as coinAmount } from '$lib/coin-format';
	import { formatDue, sectionTitle, type ClassroomSection } from '$lib/classroom/classroom';
	import {
		hallPassClockLabel,
		hallPassDurationLabel,
		hallPassLimitSummary,
		hallPassOverrideLabel,
		type HallPassState
	} from '$lib/classroom/hall-pass';
	import {
		PRESENCE_NEVER_OPENED,
		PRESENCE_UNKNOWN,
		presenceActiveLabel,
		presenceCoverageNote
	} from '$lib/classroom/presence/state';
	import { laCalendarDay } from '$lib/classroom/school-calendar';
	import { timelineDayLabel } from '$lib/notebook/timeline';
	import { ICONS } from '$lib/shell/commands';
	import StudentWorkSlideshow from './StudentWorkSlideshow.svelte';
	import CountFigure from '$lib/CountFigure.svelte';
	import AvatarHoldControl from '$lib/AvatarHoldControl.svelte';
	import type { AvatarModerationTransports } from '$lib/avatar-moderation';
	import { classroomPreferences, reactivePreferences } from '$lib/preferences/context';
	import StudentSectionsMenu from './StudentSectionsMenu.svelte';
	import {
		STUDENT_DUO_SECTIONS,
		STUDENT_PANEL_SECTIONS,
		studentColumns,
		studentDuoStacks,
		studentEverySectionHidden,
		studentGalleryFor,
		studentPageLayout,
		studentHiddenFor,
		withStudentHidden,
		withStudentScope,
		type StudentPagePrefs,
		type StudentPageScope,
		studentTileColumns,
		type StudentPageSectionId,
		type StudentPrintableSection
	} from './student-sections';
	import {
		foundryAppHref,
		gradeBand,
		gradeBandWord,
		isStudentAssignmentSortKey,
		sortStudentAssignments,
		studentAssignmentSortStartDir,
		STUDENT_ASSIGNMENT_DEFAULT_SORT,
		STUDENT_ASSIGNMENT_SORTS,
		STUDENT_GRADE_NOTE,
		STUDENT_OVERVIEW_ERROR_NOTE,
		STUDENT_OVERVIEW_PENDING_NOTE,
		type StudentAssignmentSortDir,
		type StudentAssignmentSortKey,
		type StudentPageData
	} from '$lib/classroom/student-overview';

	/**
	 * ONE STUDENT'S PAGE IN ONE CLASS (the 2026-10-07 round, reports 792eb6b1
	 * and 63fb1c49): everything this class holds about one student, for the
	 * teacher, and a printout for a parent conference.
	 *
	 * PROPS ONLY, NO FETCHING AND NO WRITE OF ITS OWN (the one write, an admin
	 * turning a profile picture off, goes through the injected
	 * `avatarModeration` transport). The route and `/dev/classroom-student`
	 * mount this identical component with the page `buildStudentPage` made, so
	 * the harness measures the real projection. There is no poll and no live
	 * subscription: a page opened for a conference is read, not watched.
	 *
	 * NOTHING HERE NAMES ANOTHER STUDENT. The data was reduced to this one
	 * student on the server; a team is a name and a size, never its members.
	 *
	 * PRINTING. The Print key and Ctrl+P go through the same two events:
	 * `beforeprint` puts the page on Space White for the length of the print
	 * (paper is white, and a dark theme's light ink would print pale), and
	 * `afterprint` restores exactly what was there. The site chrome, the keys and
	 * every section whose "Include when printing" box is cleared are left off the
	 * paper, the section's At a glance tile with it. Those boxes start ticked on
	 * every visit and are not remembered: what goes to a meeting is decided for
	 * that meeting.
	 *
	 * HIDDEN SECTIONS (report bd38fa25). The Sections key in the header shows or
	 * hides whole sections, saved to the teacher's account (the classroom store's
	 * `studentPage` group) and applied to every student page they open. A hidden
	 * section is NOT RENDERED: it leaves no gap, it is not on the paper, and its
	 * tile and everything else that belongs to it go with it
	 * (`studentPageLayout`, the one decision of what is drawn and what prints).
	 * Without the store in context (nothing but a bare mount) there is no key
	 * and every section shows.
	 */
	let {
		section,
		data,
		today,
		peopleHref,
		itemHref,
		gradeHref = null,
		workHref = null,
		notebookHref = null,
		avatarModeration = null
	}: {
		section: ClassroomSection;
		data: StudentPageData;
		/** The section load's one LA calendar day. */
		today: string;
		peopleHref: string;
		itemHref: (itemId: string) => string;
		/**
		 * THE GRADING CONSOLE WITH THIS STUDENT ALREADY OPEN (report 5464ceb2),
		 * or null for an item it cannot name; an absent prop removes the key
		 * from every row (absence is the mechanism).
		 */
		gradeHref?: ((itemId: string) => string | null) | null;
		/**
		 * A SITE ADMIN'S PROFILE PICTURE CONTROL (ledger 0392, migration 0267).
		 * The route hands it in only for an admin; absent, there is no control.
		 */
		avatarModeration?: AvatarModerationTransports | null;
		/** Their filled assignment alone, on a full-screen page. Absent removes the key. */
		workHref?: ((itemId: string) => string) | null;
		/**
		 * The student's whole notebook, read-only. NULL removes the link and says
		 * why: it opens only while they are on the live roster (or for an admin),
		 * because the notebook's own reviewer gate asks for an active enrollment.
		 */
		notebookHref?: string | null;
	} = $props();

	type SectionId = StudentPrintableSection;

	let printing = $state<Record<SectionId, boolean>>({
		gallery: true,
		attention: true,
		scores: true,
		assignments: true,
		notebook: true,
		activity: true,
		'hall-passes': true,
		teams: true,
		coins: true,
		models: true
	});

	/**
	 * THE ASSIGNMENTS TABLE'S ORDER (report 5464ceb2). The column headers and
	 * the Sort by control are two spellings of ONE state; `sortStudentAssignments`
	 * is the one comparator. It starts on the page's own order and is never
	 * stored: a conference is read in the order the teacher asks for that day.
	 */
	let sortKey = $state<StudentAssignmentSortKey>(STUDENT_ASSIGNMENT_DEFAULT_SORT.key);
	let sortDir = $state<StudentAssignmentSortDir>(STUDENT_ASSIGNMENT_DEFAULT_SORT.dir);
	const SORT_COLUMNS: { key: StudentAssignmentSortKey; label: string }[] = [
		{ key: 'title', label: 'Assignment' },
		{ key: 'due', label: 'Due' },
		{ key: 'status', label: 'Status' },
		{ key: 'turnedIn', label: 'Turned in' },
		{ key: 'score', label: 'Score' },
		{ key: 'working', label: 'Working time' },
		{ key: 'lastTyped', label: 'Last typed' },
		{ key: 'lastOpened', label: 'Last opened' }
	];
	const sortedAssignments = $derived(sortStudentAssignments(data.assignments, sortKey, sortDir));
	function sortBy(key: StudentAssignmentSortKey) {
		if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortKey = key;
			sortDir = studentAssignmentSortStartDir(key);
		}
	}
	function pickSort(event: Event) {
		// The select's own value goes through the predicate before it becomes
		// state, so no value can put the control into a state with no option.
		const value = (event.currentTarget as HTMLSelectElement).value;
		if (isStudentAssignmentSortKey(value)) {
			sortKey = value;
			sortDir = studentAssignmentSortStartDir(value);
		}
	}
	function ariaSort(key: StudentAssignmentSortKey): 'ascending' | 'descending' | undefined {
		return sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined;
	}

	const name = $derived(data.student.display_name || data.student.email);
	const totals = $derived(data.totals);
	const coverage = $derived(presenceCoverageNote(data.presenceLimits));
	const overviewNote = $derived(
		data.sources.overview === 'unavailable'
			? STUDENT_OVERVIEW_PENDING_NOTE
			: data.sources.overview === 'error'
				? STUDENT_OVERVIEW_ERROR_NOTE
				: null
	);
	const limitsLine = $derived(
		data.hallPasses?.limits
			? hallPassLimitSummary({ limits: data.hallPasses.limits } as unknown as HallPassState)
			: null
	);
	const hasModels = $derived(data.ideacad.length > 0 || data.foundry.length > 0);
	const grade = $derived(data.grade);
	const band = $derived(gradeBand(grade.percent));
	/** True once an admin turned the picture off on this page (or the hold was already there): draw initials. */
	let pictureHidden = $state(false);
	const pictureSubject = $derived(
		rosterSubject({
			...data.student,
			...(pictureHidden ? { avatar: null, avatar_url: null } : {}),
			student_email: data.student.email
		})
	);
	const bandWord = $derived(gradeBandWord(grade.percent));
	/** Missing work and late hand-ins, oldest due first: what a conference talks about first. */
	const attention = $derived(
		data.assignments
			.filter((r) => r.chip.missing || r.late)
			.slice()
			.sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity))
	);
	function pct(n: number): string {
		return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
	}
	/** A counting percent keeps its final figure's decimal places all the way, so it never changes width mid-count. */
	function pctOf(final: number): (n: number) => string {
		const places = Number.isInteger(final) ? 0 : 1;
		return (n) => `${n.toFixed(places)}%`;
	}
	/*
	 * THE SECTIONS THIS TEACHER SHOWS. The classroom store is in context on the
	 * real route (the classroom layout provides it) and in the harness; the
	 * write is the store's own, read-first and debounced into the account.
	 */
	const prefStore = classroomPreferences();
	const prefs = prefStore ? reactivePreferences(prefStore) : null;
	/* THIS CLASS'S LIST OR EVERY CLASS'S (ledger 0416): the switch in the
	   Sections menu decides which list this page reads and writes. */
	const pagePrefs = $derived<StudentPagePrefs>(prefs ? prefs.current.studentPage : { hidden: [], scope: 'everywhere', byClass: {} });
	const hidden = $derived<readonly StudentPageSectionId[]>(studentHiddenFor(pagePrefs, section.id));
	function setHidden(next: StudentPageSectionId[]) {
		prefStore?.set('studentPage', withStudentHidden(pagePrefs, section.id, next));
	}
	function setScope(next: StudentPageScope) {
		prefStore?.set('studentPage', withStudentScope(pagePrefs, next, section.id));
	}
	const layout = $derived(studentPageLayout(hidden, printing));
	/** The models card is drawn only with something to say (unchanged from 0392). */
	const modelsDrawn = $derived(layout.shown.models && (hasModels || !data.sources.ideacad));
	const panelIds = $derived(
		STUDENT_PANEL_SECTIONS.filter((id) => (id === 'models' ? modelsDrawn : layout.shown[id]))
	);
	const duoIds = $derived(STUDENT_DUO_SECTIONS.filter((id) => layout.shown[id]));
	/*
	 * A GROUP OF CARDS TAKES AS MANY COLUMNS AS IT HAS CARDS, UP TO TWO, on the
	 * screen and on the paper alike, so a group left with one card after a hide
	 * (or a cleared print box) gives it the whole width instead of a column with
	 * nothing in the other one.
	 */
	const duoCols = $derived(studentColumns(duoIds.length));
	const duoPrintCols = $derived(studentColumns(duoIds.filter((id) => layout.printed[id]).length));
	const panelCols = $derived(studentColumns(panelIds.length));
	const panelPrintCols = $derived(studentColumns(panelIds.filter((id) => layout.printed[id]).length));
	/* Notebook photos go with the Notebook section (`studentGalleryFor`). */
	const galleryItems = $derived(studentGalleryFor(data.gallery, layout.notebookExtras));
	const everyHidden = $derived(studentEverySectionHidden(hidden));
	/** The screen's tile count, for the balanced At a glance row. */
	const tilesShown = $derived(
		(layout.tiles.assignments.shown ? 4 : 0) +
			(layout.tiles.notebook.shown ? 1 : 0) +
			(layout.tiles['hall-passes'].shown ? 1 : 0) +
			(layout.tiles.coins.shown ? 1 : 0)
	);
	/*
	 * THE AT A GLANCE ROW SHARES ITS ROWS EVENLY (`studentTileColumns`), from
	 * the row's own measured width and the tile minimum and gap its stylesheet
	 * sets, read back rather than restated. Before the first measurement (the
	 * server render) the stylesheet's auto-fit lays it out, and the count of
	 * rows is the same either way, so nothing jumps.
	 */
	let glanceEl = $state<HTMLElement | null>(null);
	let glanceWidth = $state(0);
	const tileCols = $derived.by(() => {
		const el = glanceEl;
		if (!el || glanceWidth <= 0 || typeof getComputedStyle !== 'function') return null;
		const style = getComputedStyle(el);
		const gap = parseFloat(style.columnGap);
		const min = cssPixels(style.getPropertyValue('--so-tile-min'));
		return studentTileColumns(tilesShown, glanceWidth, min, Number.isFinite(gap) ? gap : 0);
	});
	/** A custom property's length in pixels (it is not computed to px, so `9rem` arrives as written). */
	function cssPixels(value: string): number {
		const v = value.trim();
		const n = parseFloat(v);
		if (!Number.isFinite(n)) return NaN;
		if (v.endsWith('rem')) return n * parseFloat(getComputedStyle(document.documentElement).fontSize);
		return v.endsWith('px') || /^[\d.]+$/.test(v) ? n : NaN;
	}
	/** The paper's tile row is as many tiles as print, up to the seven the page has. */
	const tilesPrinted = $derived(
		(layout.tiles.assignments.prints ? 4 : 0) +
			(layout.tiles.notebook.prints ? 1 : 0) +
			(layout.tiles['hall-passes'].prints ? 1 : 0) +
			(layout.tiles.coins.prints ? 1 : 0)
	);
	/* A hidden notebook takes its check-ins out of Needs attention too: a teacher
	   who does not use the notebook hid it so it would stop asking about it. */
	const flaggedCheckIns = $derived(
		data.notebook && layout.notebookExtras
			? data.notebook.checkIns.filter((c) => c.display === 'flagged' || c.display === 'missing')
			: []
	);
	/* Side by side only while the two are about the same height; otherwise each
	   takes the whole width (`studentDuoStacks`). The paper keeps two columns. */
	const duoStacked = $derived(
		duoIds.length === 2 &&
			studentDuoStacks({ attention: attention.length, checkIns: flaggedCheckIns.length, scores: data.scoreBars.length })
	);
	/** A wide Scores card lays its bars in up to three columns, never more than it has bars. */
	const barCols = $derived(studentColumns(data.scoreBars.length, 3));


	function day(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : timelineDayLabel(laCalendarDay(d), today);
	}
	function when(iso: string | null): string {
		return iso ? formatDue(iso, today) : '';
	}
	function minutes(n: number): string {
		return n === 1 ? '1 minute' : `${n} minutes`;
	}
	function plural(n: number, one: string, many: string): string {
		return `${n} ${n === 1 ? one : many}`;
	}

	onMount(() => {
		const root = document.documentElement;
		let saved: string | null = null;
		let swapped = false;
		const before = () => {
			if (swapped) return;
			saved = root.getAttribute('data-theme');
			swapped = true;
			root.setAttribute('data-theme', 'space-white');
		};
		const after = () => {
			if (!swapped) return;
			swapped = false;
			if (saved === null) root.removeAttribute('data-theme');
			else root.setAttribute('data-theme', saved);
		};
		window.addEventListener('beforeprint', before);
		window.addEventListener('afterprint', after);
		return () => {
			window.removeEventListener('beforeprint', before);
			window.removeEventListener('afterprint', after);
			after();
		};
	});
</script>

{#snippet printToggle(id: SectionId, label: string)}
	<label class="so-print-toggle" data-testid="so-print-toggle">
		<input type="checkbox" bind:checked={printing[id]} aria-label="Include when printing: {label}" />
		<span>Include when printing</span>
	</label>
{/snippet}

<!-- WHERE ELSE AN ASSIGNMENT OPENS (report 5464ceb2): the assignment is its
     title's link; these open the same student in the grading console, or their
     filled assignment alone on one full-screen page. ONE SNIPPET, rendered on
     the assignments row and on its Needs attention row (report 08bafda7), so the
     two keys are the same keys, in the same order, going to the same places. -->
{#snippet rowKeys(itemId: string)}
	{#if gradeHref || workHref}
		{@const grade = gradeHref ? gradeHref(itemId) : null}
		<span class="so-row-keys so-noprint-always">
			{#if grade}<a class="so-row-key tap-reach-44" href={grade} data-testid="so-grade-link">Grade</a>{/if}
			{#if workHref}<a class="so-row-key tap-reach-44" href={workHref(itemId)} data-testid="so-work-link">Full screen</a>{/if}
		</span>
	{/if}
{/snippet}

{#snippet presenceCell(row: StudentPageData['assignments'][number])}
	{#if row.presence === 'row'}
		<span class="so-figure"><CountFigure value={row.activeSeconds ?? 0} format={presenceActiveLabel} /></span>
	{:else if row.presence === 'unknown'}
		<span class="so-quiet">{PRESENCE_UNKNOWN}</span>
	{:else if row.presence === 'never-opened'}
		<span class="so-quiet" data-testid="so-not-opened">{PRESENCE_NEVER_OPENED}</span>
	{/if}
{/snippet}

<main class="classroom-page cr-instructor-surface so-root" data-testid="student-overview">
	<header class="card so-identity" data-testid="so-identity">
		<p class="so-print-only so-print-line">
			IDEA Classroom &middot; {sectionTitle(section)} &middot; as of {when(data.at)}
		</p>
		<div
			class="so-hero"
			class:so-hero-solo={layout.hero === 'solo'}
			class:so-hero-stack={layout.hero === 'stack'}
			data-hero={layout.hero}
		>
			<div class="so-hero-main" class:so-hero-duo={layout.hero === 'stack' && layout.heroFigures}>
				<div class="so-id-row">
					<span class="so-avatar">
						<Avatar subject={pictureSubject} tintKey={data.student.email} size={72} />
					</span>
					<div class="so-id-text">
						<h1 class="so-name person-name" title={name}>{name}</h1>
						<p class="so-email">{data.student.email}</p>
						<p class="so-class">{sectionTitle(section)}</p>
						<p class="so-id-chips">
							{#if data.student.active}
								<span class="chip tone-good" data-testid="so-roster-chip">On the class roster</span>
							{:else}
								<span class="chip tone-attention" data-testid="so-roster-chip">Not on the live roster</span>
							{/if}
							{#if data.student.has_account === false}
								<span class="chip tone-muted" data-testid="so-no-account">Has not signed in yet</span>
							{/if}
							{#if data.student.enrolled_at}
								<span class="so-meta">On this roster since {day(data.student.enrolled_at)}</span>
							{/if}
						</p>
						{#if avatarModeration}
							<AvatarHoldControl
								email={data.student.email}
								{name}
								transports={avatarModeration}
								onchange={(hidden) => (pictureHidden = hidden)}
							/>
						{/if}
					</div>
				</div>
				{#if layout.grade.shown || layout.upcoming.shown}
					<div class="so-hero-figures" data-testid="so-hero-figures">
						{#if layout.grade.shown}
							<!-- THE GRADE, FIRST AND LARGEST (ledger 0392, Mr. Pina: "I want to
							     see a grade"). Points on returned work, said in words beside it. -->
							<div
								class="so-grade"
								class:so-noprint={!layout.grade.prints}
								data-band={band ?? 'none'}
								data-testid="so-grade"
							>
								<span class="so-grade-glow" aria-hidden="true"></span>
								<span class="so-grade-head">
									<span class="so-grade-label">Grade so far</span>
									{#if bandWord}
										<span class="so-band" data-testid="so-grade-band">
											<svg class="so-band-mark" viewBox="0 0 24 24" aria-hidden="true"
												><path d={band === 'low' ? ICONS.missing : band === 'fair' ? 'M6 12h12' : ICONS.done} /></svg
											>{bandWord}
										</span>
									{/if}
								</span>
								<span class="so-grade-figure" data-testid="so-grade-figure">
									{#if grade.percent === null}Nothing graded yet{:else}<CountFigure value={grade.percent} places={Number.isInteger(grade.percent) ? 0 : 1} format={pctOf(grade.percent)} />{/if}
								</span>
								{#if grade.percent !== null}
									<span class="so-grade-meter" aria-hidden="true"
										><span class="so-grade-meter-fill" style="width: {Math.min(100, Math.max(0, grade.percent))}%"></span></span
									>
									<span class="so-grade-sub">
										<CountFigure value={grade.earned} /> of {grade.possible} points on {plural(grade.counted, 'returned assignment', 'returned assignments')}
									</span>
								{/if}
								<span class="so-grade-note">{STUDENT_GRADE_NOTE}</span>
							</div>
						{/if}
						{#if layout.upcoming.shown}
							<!-- COMING UP: the next work still to do, soonest first, so a
							     conference can end on what is next (ledger 0392). -->
							<div class="so-upcoming" class:so-noprint={!layout.upcoming.prints} data-testid="so-upcoming">
								<span class="so-grade-label">Coming up</span>
								{#if data.upcoming.length}
									<ul class="so-upcoming-list">
										{#each data.upcoming as row (row.itemId)}
											<li class="so-upcoming-row" data-testid="so-upcoming-row">
												<a class="so-link tap-44 so-upcoming-title" href={itemHref(row.itemId)}>{row.title}</a>
												<span class="so-meta">Due {when(row.dueAt as string)}</span>
											</li>
										{/each}
									</ul>
								{:else}
									<p class="so-upcoming-none" data-testid="so-upcoming-none">Nothing with a due date ahead right now.</p>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
				<div class="so-actions">
					<button type="button" class="btn tiny" data-testid="so-print" onclick={() => window.print()}>Print</button>
					{#if prefStore}
						<StudentSectionsMenu {hidden} onchange={setHidden} scope={pagePrefs.scope} onscope={setScope} className={sectionTitle(section)} />
					{/if}
					<a class="btn secondary tiny" href={peopleHref}>Back to People</a>
					{#if notebookHref && layout.notebookExtras}
						<a class="btn secondary tiny" href={notebookHref} data-testid="so-notebook-link">Open full notebook</a>
					{/if}
				</div>
				{#if everyHidden}
					<p class="note so-all-hidden so-noprint-always" data-testid="so-all-hidden">
						Every section of this page is hidden, so only their name shows. Press Sections to choose what to show.
					</p>
				{/if}
				{#if !notebookHref && layout.notebookExtras}
					<p class="note so-actions" data-testid="so-notebook-closed">
						Their full notebook opens only while they are on the live roster. Their check-ins in this class
						are listed below.
					</p>
				{/if}
			</div>
			{#if layout.shown.gallery}
				<div class="so-hero-gallery" class:so-noprint={!layout.printed.gallery}>
					<div class="so-gallery-head so-noprint-always">
						<span class="so-gallery-title">Their work</span>
						{@render printToggle('gallery', 'Work pictures')}
					</div>
					<p class="so-print-only so-print-label">Their work</p>
					{#if data.sources.gallery}
						<StudentWorkSlideshow items={galleryItems} {name} {day} notebook={layout.notebookExtras} />
					{:else}
						<p class="note" data-testid="so-gallery-error">Could not load pictures of their work just now.</p>
					{/if}
				</div>
			{/if}
		</div>
	</header>

	<!-- EACH TILE FOLLOWS ITS SECTION'S PRINT BOX, so a section cleared for a
	     meeting leaves the paper whole: its card AND its figure up here. With
	     every box cleared the row itself is left off. -->
	{#if layout.glance.shown}
		<section
			class="so-glance"
			class:so-noprint={!layout.glance.prints}
			class:so-glance-balanced={tileCols !== null}
			style="--so-tiles-print: {Math.max(1, tilesPrinted)}; --so-tile-cols: {tileCols ?? 'auto'}"
			aria-label="At a glance"
			data-testid="so-glance"
			data-cols={tileCols ?? undefined}
			bind:this={glanceEl}
			bind:clientWidth={glanceWidth}
		>
			{#if layout.tiles.assignments.shown}
				<div class="so-tile" class:so-noprint={!layout.tiles.assignments.prints} data-tile="assignments">
					<span class="so-tile-label">Assignments done</span>
					<span class="so-tile-figure"><CountFigure value={totals.done} /> of {totals.assigned}</span>
					<span class="so-tile-sub">{totals.todo} still to do</span>
				</div>
				<div class="so-tile" class:so-tile-alert={totals.missing > 0} class:so-noprint={!layout.tiles.assignments.prints} data-tile="assignments" data-testid="so-tile-missing">
					<span class="so-tile-label">Missing</span>
					<span class="so-tile-figure">
						{#if totals.missing > 0}<svg class="so-tile-mark" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.missing} /></svg>{/if}<CountFigure value={totals.missing} />
					</span>
					<span class="so-tile-sub">{totals.missing === 0 ? 'Nothing past due' : 'Past due with nothing turned in'}</span>
				</div>
				<div class="so-tile" class:so-noprint={!layout.tiles.assignments.prints} data-tile="assignments">
					<span class="so-tile-label">Waiting for grading</span>
					<span class="so-tile-figure"><CountFigure value={totals.awaitingGrade} /></span>
					<span class="so-tile-sub">{plural(totals.returned, 'returned', 'returned')} so far</span>
				</div>
			{/if}
			{#if layout.tiles.notebook.shown}
				<div class="so-tile" class:so-noprint={!layout.tiles.notebook.prints} data-tile="notebook">
					<span class="so-tile-label">Notebook check-ins</span>
					<span class="so-tile-figure">
						{#if data.notebook}<CountFigure value={data.notebook.covered} /> of {data.notebook.total}{:else}Not known{/if}
					</span>
					<span class="so-tile-sub">
						{#if data.streak !== null}{plural(data.streak, 'class day', 'class days')} in a row{:else}Streak not known{/if}
					</span>
				</div>
			{/if}
			{#if layout.tiles.assignments.shown}
				<div class="so-tile" class:so-noprint={!layout.tiles.assignments.prints} data-tile="assignments">
					<span class="so-tile-label">Working time</span>
					<span class="so-tile-figure">{#if data.workingSeconds === null}None recorded{:else}<CountFigure value={data.workingSeconds} format={presenceActiveLabel} />{/if}</span>
					<span class="so-tile-sub">See the note under Assignments.</span>
				</div>
			{/if}
			{#if layout.tiles['hall-passes'].shown}
				<div class="so-tile" class:so-noprint={!layout.tiles['hall-passes'].prints} data-tile="hall-passes">
					<span class="so-tile-label">Hall passes</span>
					<span class="so-tile-figure">{#if data.hallPasses}<CountFigure value={data.hallPasses.summary.total} />{:else}Not known{/if}</span>
					<span class="so-tile-sub">
						{#if !data.hallPasses}See Hall passes{:else if data.hallPasses.summary.shown < data.hallPasses.summary.total}{minutes(data.hallPasses.summary.minutesTotal)} out over the newest {data.hallPasses.summary.shown}{:else}{minutes(data.hallPasses.summary.minutesTotal)} out in all{/if}
					</span>
				</div>
			{/if}
			{#if layout.tiles.coins.shown}
				<div class="so-tile" class:so-noprint={!layout.tiles.coins.prints} data-tile="coins">
					<span class="so-tile-label">IDEA Coins</span>
					<span class="so-tile-figure">{#if data.coins}<CountFigure value={data.coins.balance} format={coinAmount} />{:else}Not known{/if}</span>
					<span class="so-tile-sub">Across all classes</span>
				</div>
			{/if}
		</section>
	{/if}

	{#if duoIds.length}
		<div
			class="so-duo"
			class:so-duo-stacked={duoStacked}
			style="--so-cols: {duoStacked ? 1 : duoCols}; --so-cols-print: {duoPrintCols}"
			data-testid="so-duo"
			data-arrangement={duoIds.length < 2 ? 'single' : duoStacked ? 'stacked' : 'side'}
		>
			{#if layout.shown.attention}
				<section class="card so-card" class:so-noprint={!layout.printed.attention} data-testid="so-attention" aria-labelledby="so-h-attention">
					<div class="so-card-head">
						<h2 id="so-h-attention">Needs attention</h2>
						{@render printToggle('attention', 'Needs attention')}
					</div>
					{#if attention.length || flaggedCheckIns.length}
						<ul class="so-list so-attention-list">
							{#each attention as row (row.itemId)}
								<li class="so-list-row so-attention-item" data-testid="so-attention-row">
									<span class="so-attention-mark">
										<span class="chip work-chip tone-{row.chip.tone}">
											{#if row.chip.missing}<svg class="chip-mark" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.missing} /></svg>{/if}
											{row.chip.missing ? 'Missing' : 'Late'}
										</span>
									</span>
									<span class="so-list-main so-attention-title">
										<a class="so-link tap-44" href={itemHref(row.itemId)}>{row.title}</a>
										{@render rowKeys(row.itemId)}
									</span>
									<span class="so-meta">{row.dueAt ? `Due ${when(row.dueAt)}` : 'No due date'}</span>
								</li>
							{/each}
							{#each flaggedCheckIns as c (c.sessionId)}
								<li class="so-list-row so-attention-checkin" data-testid="so-attention-checkin">
									<span class="so-cell so-cell-{c.display}" aria-hidden="true">{c.glyph}</span>
									<span class="so-list-main">Notebook: {c.label}, {c.word.toLowerCase()}</span>
									<span class="so-meta">{timelineDayLabel(c.date, today)}</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="so-line so-all-clear" data-testid="so-all-clear">
							<svg class="chip-mark" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.done} /></svg>
							{layout.notebookExtras ? 'Nothing missing or late, and no notebook check-in waiting.' : 'Nothing missing or late.'}
						</p>
					{/if}
				</section>
			{/if}

			{#if layout.shown.scores}
				<section class="card so-card" class:so-noprint={!layout.printed.scores} data-testid="so-scores" aria-labelledby="so-h-scores">
					<div class="so-card-head">
						<h2 id="so-h-scores">Scores on returned work</h2>
						{@render printToggle('scores', 'Scores')}
					</div>
					{#if data.scoreBars.length}
						<ul class="so-bars" style="--so-bar-cols: {barCols}">
							{#each data.scoreBars as b (b.itemId)}
								<li class="so-bar-row" data-testid="so-score-bar">
									<span class="so-bar-title" title={b.title}>{b.title}</span>
									<span class="so-bar-track" aria-hidden="true">
										<span class="so-bar-fill" data-band={gradeBand(b.percent)} style="width: {Math.min(100, Math.max(0, b.percent))}%"></span>
									</span>
									<span class="so-bar-figure"
										><CountFigure value={b.score} /> of {b.points} <span class="so-meta">(<CountFigure value={b.percent} places={Number.isInteger(b.percent) ? 0 : 1} format={pctOf(b.percent)} />)</span></span
									>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="note">No graded work has been returned yet.</p>
					{/if}
				</section>
			{/if}
		</div>
	{/if}

	{#if layout.shown.assignments}
		<section class="card so-card so-assignments-card" class:so-noprint={!layout.printed.assignments} data-testid="so-assignments" aria-labelledby="so-h-assignments">
			<div class="so-card-head">
				<h2 id="so-h-assignments">Assignments</h2>
				{@render printToggle('assignments', 'Assignments')}
			</div>
			{#if data.assignments.length > 1}
				<div class="so-sort-row so-noprint-always" data-testid="so-sort">
					<label class="so-sort-label">
						<span>Sort by</span>
						<select class="so-sort-select" value={sortKey} onchange={pickSort} data-testid="so-sort-select">
							{#each STUDENT_ASSIGNMENT_SORTS as opt (opt.id)}
								<option value={opt.id}>{opt.label}</option>
							{/each}
						</select>
					</label>
					<button
						type="button"
						class="btn secondary tiny so-sort-dir"
						aria-pressed={sortDir === 'desc'}
						onclick={() => (sortDir = sortDir === 'asc' ? 'desc' : 'asc')}
						data-testid="so-sort-dir"
					>
						<span aria-hidden="true">{sortDir === 'asc' ? '↑' : '↓'}</span>
						{sortDir === 'asc' ? 'Ascending' : 'Descending'}
					</button>
				</div>
			{/if}
			{#if !data.sources.submissions}
				<p class="note so-source-note" data-testid="so-source-note">Could not load their hand-ins just now, so every status below is a guess. Reload to try again.</p>
			{/if}
			{#if data.assignments.length}
				<div class="so-table-wrap">
					<table class="so-table">
						<thead>
							<tr>
								{#each SORT_COLUMNS as col (col.key)}
									<th scope="col" aria-sort={ariaSort(col.key)}>
										<!-- EVERY HEADER IS A SORT KEY: the word, and the direction as a
										     glyph only while this column orders the rows. -->
										<button type="button" class="so-sort-key" class:on={sortKey === col.key} onclick={() => sortBy(col.key)}>
											{col.label}
											{#if sortKey === col.key}<span aria-hidden="true">{sortDir === 'asc' ? '↑' : '↓'}</span>{/if}
										</button>
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each sortedAssignments as row (row.itemId)}
								<tr data-testid="so-assignment-row" data-item={row.itemId}>
									<th scope="row" class="so-col-title" data-label="Assignment">
										<a class="so-link tap-44" href={itemHref(row.itemId)}>{row.title}</a>
										{#if !row.posted}<span class="chip tone-muted">Not posted now</span>{/if}
										{@render rowKeys(row.itemId)}
									</th>
									<td class="so-when" data-label="Due">{row.dueAt ? when(row.dueAt) : 'No due date'}</td>
									<td data-label="Status">
										<span class="chip work-chip tone-{row.chip.tone}" data-testid="so-status" data-missing={row.chip.missing ? 'true' : undefined}>
											{#if row.chip.missing}
												<svg class="chip-mark" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.missing} /></svg>
											{:else if row.chip.done}
												<svg class="chip-mark" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.done} /></svg>
											{/if}
											{row.chip.label}
										</span>
										{#if row.awaitingGrade}<span class="so-meta">Waiting for grading</span>{/if}
									</td>
									<td class="so-when" data-label="Turned in">
										{#if row.turnedInAt}
											{when(row.turnedInAt)}{#if row.late}<span class="so-late">, late</span>{/if}
										{/if}
									</td>
									<td data-label="Score">
										{#if row.score !== null}<CountFigure value={row.score} />{#if row.points !== null}{' '}of {row.points}{/if}{/if}
									</td>
									<td data-label="Working time">{@render presenceCell(row)}</td>
									<td class="so-when" data-label="Last typed">
										{#if row.presence === 'row'}{row.lastWorkedAt ? when(row.lastWorkedAt) : 'No typing yet'}{/if}
									</td>
									<td class="so-when" data-label="Last opened">
										{row.lastOpenedAt ? when(row.lastOpenedAt) : data.sources.overview === 'ready' ? 'No open recorded' : ''}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="note">No assignments are posted to this class yet.</p>
			{/if}
			<!-- THE ONE SENTENCE, VERBATIM, directly under the rows its last clause
			     points at ("What they handed in is on the row above it"). Printed in
			     full rather than behind a tip, because paper has no hover. -->
			<p class="note so-coverage" data-testid="so-coverage">{coverage}</p>
		</section>
	{/if}

	{#if panelIds.length}
		<div class="so-panels" style="--so-cols: {panelCols}; --so-cols-print: {panelPrintCols}">
			{#if layout.shown.notebook}
				<section class="card so-card" class:so-noprint={!layout.printed.notebook} data-testid="so-notebook" aria-labelledby="so-h-notebook">
					<div class="so-card-head">
						<h2 id="so-h-notebook">Notebook</h2>
						{@render printToggle('notebook', 'Notebook')}
					</div>
					{#if data.notebook}
						<p class="so-line">
							Check-ins covered: <strong>{data.notebook.covered} of {data.notebook.total}</strong>.
							{#if data.notebook.excused}Excused: {data.notebook.excused}.{/if}
							{#if data.notebook.flagged}Flagged: {data.notebook.flagged}.{/if}
							{#if data.notebook.scheduled}Not due yet: {data.notebook.scheduled}.{/if}
						</p>
						{#if data.streak !== null}
							<p class="so-line" data-testid="so-streak">
								{plural(data.streak, 'class day', 'class days')} in a row with a turned-in entry.
								{#if data.entriesFiled !== null}{plural(data.entriesFiled, 'entry', 'entries')} turned in to this class.{/if}
							</p>
						{/if}
						{#if data.notebook.checkIns.length}
							<ul class="so-list">
								{#each data.notebook.checkIns as c (c.sessionId)}
									<li class="so-list-row" data-testid="so-check-in">
										<span class="so-cell so-cell-{c.display}" aria-hidden="true">{c.glyph}</span>
										<span class="so-word">{c.word}</span>
										<span class="so-list-main">{c.label}</span>
										<span class="so-meta">{timelineDayLabel(c.date, today)}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="note">This class has no notebook check-ins yet.</p>
						{/if}
					{:else if data.sources.notebook === 'ready'}
						<p class="note">They have no row on this class's notebook grid.</p>
					{:else if data.sources.notebook === 'unavailable'}
						<p class="note">The notebook is not set up on this deployment.</p>
					{:else}
						<p class="note">Could not load the notebook for this class just now.</p>
					{/if}
				</section>
			{/if}

			{#if layout.shown.activity}
				<section class="card so-card" class:so-noprint={!layout.printed.activity} data-testid="so-activity" aria-labelledby="so-h-activity">
					<div class="so-card-head">
						<h2 id="so-h-activity">Activity</h2>
						{@render printToggle('activity', 'Activity')}
					</div>
					{#if overviewNote}
						<p class="note" data-testid="so-overview-note">{overviewNote}</p>
					{:else if data.materials.length}
						<p class="so-line">When they last opened each handout and announcement in this class.</p>
						<ul class="so-list">
							{#each data.materials as m (m.itemId)}
								<li class="so-list-row" data-testid="so-material">
									<a class="so-list-main so-link tap-44" href={itemHref(m.itemId)}>{m.title}</a>
									<span class="so-meta">{m.lastOpenedAt ? `Last opened ${when(m.lastOpenedAt)}` : 'No open recorded'}</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="note">This class has no handouts or announcements yet.</p>
					{/if}
				</section>
			{/if}

			{#if layout.shown['hall-passes']}
				<section class="card so-card" class:so-noprint={!layout.printed['hall-passes']} data-testid="so-hall-passes" aria-labelledby="so-h-passes">
					<div class="so-card-head">
						<h2 id="so-h-passes">Hall passes</h2>
						{@render printToggle('hall-passes', 'Hall passes')}
					</div>
					{#if data.hallPasses}
						{@const s = data.hallPasses.summary}
						{#if s.total === 0}
							<p class="so-line">No hall passes in this class.</p>
						{:else}
							<!-- The minutes, the longest and the teacher-sent count are summed over
							     the passes this page holds; the count is the database's own total.
							     When those differ, the sentence says which passes it added up. -->
							<p class="so-line" data-testid="so-hall-pass-summary">
								{#if s.shown < s.total}
									{plural(s.total, 'pass', 'passes')} in this class. The newest {s.shown}: {minutes(s.minutesTotal)} out
									in all, the longest {minutes(s.longestMinutes)}.{#if s.overrides}{' '}{plural(s.overrides, 'was', 'were')} sent by a teacher.{/if}{#if s.openNow}{' '}Out now.{/if}
								{:else}
									{plural(s.total, 'pass', 'passes')} in this class, {minutes(s.minutesTotal)} out in all, the longest
									{minutes(s.longestMinutes)}.{#if s.overrides}{' '}{plural(s.overrides, 'was', 'were')} sent by a teacher.{/if}{#if s.openNow}{' '}Out now.{/if}
								{/if}
							</p>
							{#if s.shown < s.total}
								<p class="note">Showing the newest {s.shown} of {s.total}.</p>
							{/if}
							<ul class="so-list">
								{#each data.hallPasses.entries as e (e.pass_id)}
									{@const override = hallPassOverrideLabel(e)}
									<li class="so-list-row" data-testid="so-hall-pass">
										<span class="so-list-main">{day(e.opened_at)}, {hallPassClockLabel(e.opened_at)}</span>
										<span class="so-figure">{e.closed_at ? hallPassDurationLabel(e) : 'Still out'}</span>
										{#if override}<span class="so-meta">{override}</span>{/if}
									</li>
								{/each}
							</ul>
						{/if}
						{#if limitsLine}<p class="note">{limitsLine}</p>{/if}
					{:else}
						<p class="note" data-testid="so-overview-note">{overviewNote}</p>
					{/if}
				</section>
			{/if}

			{#if layout.shown.teams}
				<section class="card so-card" class:so-noprint={!layout.printed.teams} data-testid="so-teams" aria-labelledby="so-h-teams">
					<div class="so-card-head">
						<h2 id="so-h-teams">Teams</h2>
						{@render printToggle('teams', 'Teams')}
					</div>
					{#if data.sources.teams === 'error'}
						<p class="note">Could not load the saved teams just now.</p>
					{:else if data.sources.teams === 'unavailable'}
						<p class="note">Saved teams are not set up on this deployment.</p>
					{:else if data.teams.length}
						<ul class="so-list">
							{#each data.teams as t (t.setId)}
								<li class="so-list-row" data-testid="so-team">
									<span class="so-list-main">{t.label}: <strong>{t.teamName}</strong>, a team of {t.size}</span>
									<span class="so-meta">
										{day(t.createdAt)}{t.posted ? ', posted to the class' : ''}{t.edited ? `, ${t.edited.toLowerCase()}` : ''}
									</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="note">Not on any saved team in this class.</p>
					{/if}
				</section>
			{/if}

			{#if layout.shown.coins}
				<section class="card so-card" class:so-noprint={!layout.printed.coins} data-testid="so-coins" aria-labelledby="so-h-coins">
					<div class="so-card-head">
						<h2 id="so-h-coins">Coins and music</h2>
						{@render printToggle('coins', 'Coins and music')}
					</div>
					{#if data.coins && data.songs}
						<p class="so-line">
							IDEA Coin balance, across all classes: <strong>{coinAmount(data.coins.balance)}</strong>.
						</p>
						<p class="so-line" data-testid="so-songs">
							Music requests in this class: {data.songs.requested} asked, {data.songs.approved} approved,
							{data.songs.rejected} turned down, {data.songs.pending} waiting.
						</p>
						{#if data.coins.rows.length < data.coins.total}
							<p class="note">Showing the newest {data.coins.rows.length} of {data.coins.total} transactions.</p>
						{/if}
						<div class="so-coin-rows">
							<CoinTransactionRows transactions={data.coins.rows} kinds={data.coins.kinds} showActor={false} emptyMessage="No IDEA Coin transactions yet." />
						</div>
					{:else}
						<p class="note" data-testid="so-overview-note">{overviewNote}</p>
					{/if}
				</section>
			{/if}

			{#if modelsDrawn}
				<section class="card so-card" class:so-noprint={!layout.printed.models} data-testid="so-models" aria-labelledby="so-h-models">
					<div class="so-card-head">
						<h2 id="so-h-models">Models and apps</h2>
						{@render printToggle('models', 'Models and apps')}
					</div>
					{#if !data.sources.ideacad}
						<p class="note">Could not load their IdeaCAD models just now.</p>
					{:else if data.ideacad.length}
						<h3 class="so-h3">IdeaCAD models for this class</h3>
						<ul class="so-list">
							{#each data.ideacad as d (d.id)}
								<li class="so-list-row" data-testid="so-ideacad">
									<span class="so-list-main">{d.title}{#if d.itemTitle && d.itemTitle !== d.title}<span class="so-meta">, for {d.itemTitle}</span>{/if}</span>
									{#if d.updatedAt}<span class="so-meta">Saved {when(d.updatedAt)}</span>{/if}
									{#if d.archived}<span class="chip tone-muted">Archived</span>{/if}
								</li>
							{/each}
						</ul>
					{/if}
					{#if data.foundry.length}
						<h3 class="so-h3">Apps of theirs you can see in the Foundry gallery</h3>
						<ul class="so-list">
							{#each data.foundry as a (a.id)}
								<li class="so-list-row" data-testid="so-foundry">
									<a class="so-list-main so-link tap-44" href={foundryAppHref(a.slug)}>{a.title}</a>
								</li>
							{/each}
						</ul>
						{#if data.foundryAuthorHref}
							<p class="so-line"><a class="so-link tap-44" href={data.foundryAuthorHref}>Their Foundry page</a></p>
						{/if}
					{/if}
				</section>
			{/if}
		</div>
	{/if}
</main>

<style>
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-split));
		margin: 0 auto;
		padding: var(--space-3, 0.75rem) var(--cr-gutter, 1rem) var(--space-6, 2rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
		/* READ ACROSS A DESK (ledger 0392, Mr. Pina: "the text is way too small
		   to see for a parent-teacher conference"). Every size below is relative
		   to this one. */
		font-size: 1.125rem;
		line-height: 1.5;
	}
	.so-root :global(.card) {
		margin: 0;
	}
	.so-identity {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
	}
	.so-id-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
	}
	.so-avatar {
		flex: none;
	}
	.so-id-text {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.so-name {
		margin: 0;
		font-size: clamp(1.75rem, 5vw, 2.3rem);
		line-height: 1.15;
		color: var(--text-1);
	}
	.so-email,
	.so-class {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.9rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.so-id-chips {
		margin: 0.2rem 0 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.so-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		margin: 0;
	}
	.chip {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		padding: 0.1rem 0.55rem;
		white-space: nowrap;
	}
	.tone-good {
		color: var(--green);
		border-color: var(--green);
	}
	.tone-attention {
		color: var(--amber);
		border-color: var(--amber);
	}
	.tone-info {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.tone-muted {
		color: var(--text-2);
	}
	/* Missing is its own tone, as on the class page: the word leads, and a mark,
	   a fill and the weight set it apart from "In progress". Never colour alone. */
	.tone-missing {
		color: var(--amber);
		border-color: var(--amber);
		background: color-mix(in srgb, var(--amber) 14%, transparent);
		font-weight: 700;
	}
	.work-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
	.chip-mark {
		flex: none;
		width: 0.7rem;
		height: 0.7rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.so-meta {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.so-quiet {
		color: var(--text-2);
	}
	.so-late {
		color: var(--amber);
		font-weight: 700;
	}
	.so-figure {
		font-variant-numeric: tabular-nums;
		color: var(--text-1);
	}

	/* AT A GLANCE: each tile a word and a figure, never colour alone. */
	.so-glance {
		/* The tile minimum, stated once: the auto-fit fallback and the balanced
		   count (`studentTileColumns`, which reads it back) both use it. */
		--so-tile-min: 9rem;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(var(--so-tile-min), 100%), 1fr));
		gap: var(--space-2, 0.5rem);
	}
	.so-glance.so-glance-balanced {
		grid-template-columns: repeat(var(--so-tile-cols), minmax(0, 1fr));
	}
	.so-tile {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 10px);
		background: var(--surface-1, var(--bg1));
		min-width: 0;
	}
	.so-tile-label {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.so-tile-figure {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 1.9rem;
		line-height: 1.15;
		font-weight: 700;
		color: var(--text-1);
		font-variant-numeric: tabular-nums;
	}
	.so-tile-sub {
		font-size: 0.9rem;
		color: var(--text-2);
	}

	/* THE HERO: who they are and their grade beside a slideshow of their work.
	   One column on a phone; side by side once there is room for both. */
	.so-hero {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4, 1rem);
		align-items: start;
	}
	@container so-identity (width >= 52rem) {
		.so-hero {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
		}
		/* THEIR WORK HIDDEN (report bd38fa25): the top is one column, and the
		   grade and Coming up share its width side by side rather than each
		   stretching across the whole card. */
		.so-hero.so-hero-solo,
		.so-hero.so-hero-stack {
			grid-template-columns: minmax(0, 1fr);
		}
		/* A FIGURE HIDDEN BESIDE THE PICTURES (report bd38fa25, round 2). The
		   gallery's height comes from its own width, so a left column that lost
		   the grade or Coming up sat 200 to 400px short of it, an empty block in
		   the first card. Stacked, the pictures run the card's whole width under
		   the identity, at about the height they had beside it, and the figure
		   that is left sits beside the identity and its keys, where the two are
		   about the same height. */
		.so-hero-main.so-hero-duo {
			display: grid;
			/* The identity and its keys take what they need, so the keys keep one
			   line where they fit (at 960 two equal halves wrapped them and left
			   the figure beside them 129px short); never more than 60%, so a long
			   name wraps rather than squeezing the figure. The figure takes the
			   rest up to a reading width, on the card's right edge over the
			   pictures, and any spare space sits between. */
			grid-template-columns: fit-content(60%) minmax(18rem, 1fr);
			column-gap: var(--space-4, 1rem);
			align-items: start;
		}
		.so-hero-duo > * {
			grid-column: 1;
		}
		.so-hero-duo > .so-hero-figures {
			grid-column: 2;
			grid-row: 1 / span 2;
			justify-self: end;
			width: 100%;
			max-width: 44rem;
		}
		.so-hero-duo > .note {
			grid-column: 1 / -1;
		}
		/* STACKED, THE PICTURES KEEP THE SIZE THEY HAVE BESIDE THE IDENTITY
		   (polish round). The stage is 16:9 and capped at 24rem tall; across the
		   card's whole width (1326px at 1440) that left a 4:3 picture 548px wide
		   in a black band with about 390px of black on each side. So the gallery
		   (its heading, the stage, the keys and the strip together) is as wide as
		   a 16:9 stage that tall, about 683px, which a landscape picture fills,
		   and sits in the middle of the card under the identity. */
		.so-hero-stack .so-hero-gallery {
			--sws-stage-max: 24rem;
			justify-self: center;
			width: 100%;
			max-width: calc(var(--sws-stage-max) * 16 / 9);
		}
		/* Each box keeps its own height: stretched to the grade's, a short
		   Coming up was an outlined box with nothing in its lower half. */
		.so-hero-solo .so-hero-figures {
			flex-direction: row;
			align-items: flex-start;
		}
		.so-hero-solo .so-hero-figures > * {
			flex: 1 1 0;
			min-width: 0;
		}
	}
	.so-identity {
		container: so-identity / inline-size;
	}
	.so-hero-main {
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
	}
	.so-hero-figures {
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
	}
	/* The gallery column stretches to the row, so a student with no pictures
	   yet gets an empty-state box the height of the column beside it rather
	   than a short dashed box over 270 to 320px of nothing (the slideshow
	   grows only that box; a gallery with pictures keeps its own height). */
	.so-hero-gallery {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
		align-self: stretch;
	}
	.so-gallery-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.so-gallery-title {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	/* THE GRADE'S STATUS (ledger 0392): the band colors the rule, a faint
	   wash, the figure, the meter and the band's word, one hue each --
	   green for Excellent and Good, amber for Fair, and the room's crimson for
	   Needs improvement, which is a status and the one place this page uses
	   it. No grade yet is the quiet ground with no band at all. */
	.so-grade {
		--so-band: var(--boundary);
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.8rem 1rem;
		border: 1px solid var(--boundary);
		border-left: 4px solid var(--so-band);
		border-radius: var(--radius-card, 10px);
		background: var(--surface-2, var(--bg2));
		isolation: isolate;
	}
	.so-grade[data-band='excellent'],
	.so-grade[data-band='good'] {
		--so-band: var(--green);
	}
	.so-grade[data-band='fair'] {
		--so-band: var(--amber);
	}
	.so-grade[data-band='low'] {
		--so-band: var(--crimson);
	}
	.so-grade:not([data-band='none']) {
		background: color-mix(in srgb, var(--so-band) 7%, var(--surface-2, var(--bg2)));
	}
	/* Words take the band moved a step toward the room's own text color, so
	   they clear 4.5:1 on the washed ground in every theme (crimson alone
	   measured 4.46 on the dark wash); the rule, the meter and the glow keep
	   the band itself. */
	.so-grade {
		--so-band-ink: color-mix(in srgb, var(--so-band) 80%, var(--text-1));
	}
	.so-grade:not([data-band='none']) .so-grade-figure {
		color: var(--so-band-ink);
	}
	/* The glow is its own layer and only its OPACITY moves: two slow breaths
	   (4.8s, under the five seconds WCAG 2.2.2 allows without an off switch)
	   after the figure has counted, then it rests at a soft steady glow. */
	.so-grade-glow {
		position: absolute;
		inset: -1px;
		z-index: -1;
		border-radius: inherit;
		pointer-events: none;
		box-shadow: 0 0 22px 1px color-mix(in srgb, var(--so-band) 34%, transparent);
		opacity: 0.55;
	}
	.so-grade[data-band='none'] .so-grade-glow {
		display: none;
	}
	@media (prefers-reduced-motion: no-preference) {
		.so-grade-glow {
			animation: so-grade-breathe 2.4s ease-in-out 0.9s 2;
		}
		@keyframes so-grade-breathe {
			0%,
			100% {
				opacity: 0.55;
			}
			50% {
				opacity: 1;
			}
		}
	}
	.so-grade-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.3rem 0.8rem;
	}
	.so-band {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.15rem 0.6rem;
		border: 1px solid color-mix(in srgb, var(--so-band) 55%, transparent);
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--so-band-ink);
		background: var(--surface-1, var(--bg1));
	}
	.so-band-mark {
		width: 0.9rem;
		height: 0.9rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.so-grade-meter {
		display: block;
		height: 0.5rem;
		margin: 0.35rem 0 0.2rem;
		border-radius: 999px;
		background: var(--surface-1, var(--bg1));
		border: 1px solid var(--hairline);
		overflow: hidden;
	}
	.so-grade-meter-fill {
		display: block;
		height: 100%;
		background: var(--so-band);
		transform-origin: left center;
	}
	/* The meter and every score bar grow with the count, by transform only,
	   and are drawn whole in their base state, so reduced motion and print
	   see the final length. */
	@media (prefers-reduced-motion: no-preference) {
		.so-grade-meter-fill,
		.so-bar-fill {
			animation: so-grow 0.9s cubic-bezier(0.33, 1, 0.68, 1) both;
		}
		@keyframes so-grow {
			from {
				transform: scaleX(0);
			}
			to {
				transform: scaleX(1);
			}
		}
	}
	.so-grade-label {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.so-grade-figure {
		font-size: 2.8rem;
		font-weight: 700;
		line-height: 1.05;
		color: var(--text-1);
		font-variant-numeric: tabular-nums;
	}
	.so-grade-sub {
		font-size: 1rem;
		color: var(--text-1);
	}
	.so-grade-note {
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.so-upcoming {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.85rem 1.1rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 10px);
	}
	.so-upcoming-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.so-upcoming-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0 0.8rem;
		border-top: 1px solid var(--hairline);
	}
	.so-upcoming-row:first-child {
		border-top: none;
	}
	.so-upcoming-title {
		display: inline-flex;
		align-items: center;
		font-size: 1.05rem;
		min-width: 0;
	}
	.so-upcoming-none {
		margin: 0;
		color: var(--text-2);
	}
	.so-tile-alert {
		border-color: var(--amber);
		border-left-width: 4px;
	}
	.so-tile-alert .so-tile-figure {
		color: var(--amber);
	}
	.so-tile-mark {
		width: 1.4rem;
		height: 1.4rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	/* TWO CARDS OF UNEQUAL HEIGHT SIDE BY SIDE: columns, never a grid row. */
	.so-duo {
		columns: 24rem var(--so-cols, 2);
		column-gap: var(--space-3, 0.75rem);
	}
	.so-duo > .so-card {
		break-inside: avoid;
		margin: 0 0 var(--space-3, 0.75rem);
	}
	.so-all-clear {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--green);
	}
	.so-bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	/* A WIDE SCORES CARD (stacked under Needs attention, or alone) lays its bars
	   in columns, down one and on into the next, so a full-width card is not
	   one 1000px bar per line; capped at the bars it has (CLAUDE.md's multicol
	   rule). Not on paper, where the card is not a size container. */
	@container (width >= 48rem) {
		.so-bars {
			display: block;
			columns: 22rem var(--so-bar-cols, 1);
			column-gap: 1.75rem;
		}
		.so-bar-row {
			break-inside: avoid;
			margin-bottom: 0.45rem;
		}
	}
	/*
	 * A SCORE BAR'S TITLE IS SHOWN WHOLE (polish round C). It was one line cut
	 * with an ellipsis, so at 375 "Old pulley wor..." left the name only in a
	 * `title` a phone cannot hover. It wraps in its column now, and in a card
	 * under 24rem (a phone) the title takes the row's whole width with the bar
	 * and its figure on the line under it, because beside them the title had
	 * about 100px. The `title` stays for a pointer.
	 */
	.so-bar-row {
		display: grid;
		grid-template-columns: minmax(0, 11rem) minmax(4rem, 1fr) auto;
		grid-template-areas: 'title track figure';
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
	.so-bar-title {
		grid-area: title;
		min-width: 0;
		overflow-wrap: break-word;
		color: var(--text-1);
	}
	@container (width < 24rem) {
		.so-bar-row {
			grid-template-columns: minmax(4rem, 1fr) auto;
			grid-template-areas:
				'title title'
				'track figure';
			row-gap: 0.15rem;
		}
	}
	.so-bar-track {
		grid-area: track;
		height: 0.8rem;
		border-radius: 999px;
		background: var(--surface-2, var(--bg2));
		border: 1px solid var(--boundary);
		overflow: hidden;
	}
	.so-bar-fill {
		display: block;
		height: 100%;
		background: var(--green);
	}
	.so-bar-fill {
		transform-origin: left center;
	}
	.so-bar-fill[data-band='fair'] {
		background: var(--amber);
	}
	.so-bar-fill[data-band='low'] {
		background: var(--crimson);
	}
	.so-bar-figure {
		grid-area: figure;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		color: var(--text-1);
	}
	.so-print-label {
		margin: 0;
		font-weight: 700;
	}

	.so-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
		container-type: inline-size;
	}
	.so-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
	}
	.so-card-head h2 {
		margin: 0;
		font-size: 1.35rem;
	}
	.so-h3 {
		margin: 0.4rem 0 0;
		font-size: 0.9rem;
		color: var(--text-1);
	}
	.so-print-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
		cursor: pointer;
	}
	.so-print-toggle input {
		width: 1.1rem;
		height: 1.1rem;
		margin: 0;
	}
	.so-line {
		margin: 0;
		color: var(--text-1);
	}
	.so-coverage {
		margin: 0;
		color: var(--text-2);
		max-width: var(--measure-reading);
	}
	.so-source-note {
		color: var(--amber);
	}
	/* Two classes, so it outranks the list's own ink on a link that is also the
	   row's main text. */
	a.so-link {
		color: var(--body-link, var(--cyan));
	}

	.so-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.so-list-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem 0.6rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--hairline);
		min-width: 0;
	}
	.so-list-row:last-child {
		border-bottom: none;
	}
	/*
	 * A NEEDS ATTENTION ROW (report 08bafda7; polish round). Its Grade and Full
	 * screen keys follow the title ON THE TITLE'S LINE wherever the two fit,
	 * because a line of their own under every title made each row 102px tall
	 * at 960 and the card 590px beside a 163px Scores card. A grid, three ways,
	 * chosen by the card's width:
	 *
	 *  - a wide card (34rem and up): the chip, the title with its keys, and the
	 *    due date at the right, one line;
	 *  - the usual card (a column beside Scores): the chip, then the title with
	 *    its keys, and the due date on a short line of its own under the title,
	 *    which is what gives the title and its keys the row's width (beside the
	 *    date they had about 175px of it and the keys always fell under);
	 *  - a phone's card: the title beside its chip, the keys under it and the
	 *    date under those, so the title keeps the width.
	 *
	 * ONE COLUMN OF DATES (polish round C). A notebook check-in row takes the
	 * same three forms, so in any one list every date sits in one place: all at
	 * the right on the title's line in a wide card, all on their own line under
	 * the title's left edge otherwise. A check-in's words sit in the same 44px
	 * line an assignment's title link does, so its date lands where theirs do.
	 *
	 * THE DATE NEVER SITS INSIDE THE TITLE LINK'S 44px BOX. It used to be pulled
	 * up into the box's lower edge so it read as the title's line, and 7px of
	 * the link's reach answered the date instead (hit-tested at 960). It now
	 * starts where the box ends.
	 *
	 * A TITLE OR A CHECK-IN LABEL THAT WRAPS KEEPS THE ONE-LINE ROW'S AIR
	 * (polish round 1). A one-line title sits centred in its 44px line, so its
	 * date has the half of (44px - one line) below the words; a label that
	 * wrapped filled its box edge to edge and its date sat flush under the last
	 * line, reading as one more line of the label. Both boxes carry that half
	 * as padding instead: a one-line box is still exactly 44px, a wrapped one
	 * keeps the same air above its date, and in the wide form its FIRST line
	 * sits level with the date and the chip.
	 *
	 * Where a long title leaves no room, the keys wrap under it inside the
	 * title's own cell. The chip (in a 44px box) and the wide form's date sit
	 * on the TITLE'S line, never centred on a title and its wrapped keys
	 * together. On paper the card is not a size container and the keys do not
	 * print, so a row is one line: chip, title, date (the print block says so).
	 */
	/*
	 * ONE CHIP COLUMN FOR THE WHOLE LIST (report bd38fa25, round 2). Each row is
	 * its own grid, so a column sized to its own chip put a title after MISSING
	 * 32px to the right of one after LATE, and the keys under them stepped with
	 * them. Every row, the notebook check-ins too, takes the same first column,
	 * at least as wide as the widest chip (MISSING with its mark, 65px), so the
	 * titles and the keys are one clean column. A chip wider than that (a larger
	 * text setting) widens only its own row and never clips.
	 */
	.so-attention-list {
		--so-chip-col: minmax(4.4rem, max-content);
	}
	/* Half of what a 44px line leaves around one line of words; clamped at 0
	   for a text setting whose line is taller than 44px. */
	.so-attention-checkin > .so-list-main,
	.so-attention-title > .so-link {
		padding-block: 0.5rem;
		padding-block: max(0px, calc((44px - 1lh) / 2));
	}
	.so-list-row.so-attention-item,
	.so-list-row.so-attention-checkin {
		display: grid;
		grid-template-columns: var(--so-chip-col) minmax(0, 1fr);
		grid-template-areas:
			'chip title'
			'. date';
		align-items: start;
		gap: 0 0.6rem;
	}
	.so-attention-mark {
		grid-area: chip;
		display: flex;
		align-items: center;
		min-height: 44px;
	}
	/* The check-in's glyph, centred on the 44px line its words sit on. */
	.so-attention-checkin > .so-cell {
		grid-area: chip;
		justify-self: start;
		margin-top: calc((44px - 1.6rem) / 2);
	}
	.so-attention-checkin > .so-list-main {
		grid-area: title;
		display: flex;
		align-items: center;
		min-height: 44px;
	}
	.so-attention-title {
		grid-area: title;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		column-gap: 0.5rem;
		min-width: 0;
	}
	.so-attention-title > .so-link {
		min-width: 0;
	}
	.so-attention-title > .so-row-keys {
		margin: 0;
	}
	/* Under the title, from the bottom of its 44px line. */
	.so-attention-list > li > .so-meta {
		grid-area: date;
		justify-self: start;
	}
	@container (width >= 34rem) {
		.so-list-row.so-attention-item,
		.so-list-row.so-attention-checkin {
			grid-template-columns: var(--so-chip-col) minmax(0, 1fr) auto;
			grid-template-areas: 'chip title date';
		}
		.so-attention-list > li > .so-meta {
			justify-self: end;
			text-align: right;
			display: flex;
			align-items: center;
			min-height: 44px;
		}
	}
	@container (width < 24rem) {
		.so-list-row.so-attention-item {
			grid-template-areas:
				'chip title'
				'. keys'
				'. date';
		}
		.so-attention-title {
			display: contents;
		}
		.so-attention-title > .so-link {
			grid-area: title;
		}
		.so-attention-title > .so-row-keys {
			grid-area: keys;
		}
	}
	.so-list-main {
		flex: 1 1 12rem;
		min-width: 0;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.so-word {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--text-1);
		min-width: 7.5rem;
	}
	.so-cell {
		flex: none;
		width: 1.6rem;
		height: 1.6rem;
		display: inline-grid;
		place-items: center;
		font-family: var(--font-mono);
		font-weight: 700;
		border: 1px solid var(--boundary);
		border-radius: 4px;
		color: var(--text-1);
	}
	.so-cell-on_time {
		color: var(--green);
		border-color: var(--green);
	}
	.so-cell-late,
	.so-cell-missing {
		color: var(--amber);
		border-color: var(--amber);
	}
	.so-cell-flagged {
		color: var(--amber);
		border-color: var(--amber);
		border-style: dashed;
	}

	/* THE ASSIGNMENTS TABLE. A real table where there is room; below 46rem of
	   its own card each row stacks into a labelled block, so a phone never
	   scrolls the page sideways. */
	.so-table-wrap {
		overflow-x: auto;
		min-width: 0;
	}
	.so-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.95rem;
	}
	.so-table th,
	.so-table td {
		text-align: left;
		vertical-align: top;
		padding: 0.45rem 0.5rem;
		border-bottom: 1px solid var(--hairline);
		color: var(--text-1);
	}
	.so-table thead th {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-2);
		white-space: nowrap;
	}
	.so-col-title {
		font-weight: 700;
		min-width: 10rem;
	}
	.so-col-title .chip {
		margin-left: 0.3rem;
	}
	.so-table td .so-meta {
		display: block;
		margin-top: 0.15rem;
	}
	/* THE SORT. Header words are keys (the plate's key list lights `.on`);
	   the Sort by row is the phone's control, where the header is hidden. */
	.so-sort-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		margin: 0 0 0.6rem;
	}
	.so-sort-label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.so-sort-select {
		min-height: 2rem;
		font: inherit;
		font-family: var(--font-display);
		font-size: 0.9rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-1);
		background: var(--surface-2, var(--bg2));
		border: 1px solid var(--boundary);
		border-radius: 0.35rem;
		padding: 0.2rem 0.5rem;
	}
	.so-sort-key {
		all: unset;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 24px;
		cursor: pointer;
		font: inherit;
		color: inherit;
		border-bottom: 1px solid transparent;
	}
	.so-sort-key:hover,
	.so-sort-key:focus-visible {
		color: var(--hover-ink, var(--text-1));
		border-bottom-color: currentColor;
	}
	.so-sort-key:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.so-sort-key.on {
		color: var(--text-1);
	}
	/* A ROW KEY IS 24px TO DRAW AND 44px TO TAP (CLAUDE.md's 44px rule; report
	   bd38fa25, round 2: 24px with no reach on a phone). The reach is the
	   global `.tap-reach-44`, height only, because Grade and Full screen sit
	   6px apart; and the keys' own line is 44px tall, so the reach never hangs
	   over the title above them or the row below and takes their taps. One
	   rule for the table's rows and Needs attention, which share the snippet. */
	.so-row-keys {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		min-height: 44px;
		/* Wrapped onto two lines, the keys' centres sit 44px apart, so their
		   reaches meet and never overlap. */
		gap: 20px 0.35rem;
		margin-left: 0.5rem;
		vertical-align: middle;
	}
	.so-row-key {
		--tap-reach-w: 0px;
		display: inline-flex;
		align-items: center;
		min-height: 24px;
		padding: 0 0.5rem;
		border: 1px solid var(--boundary);
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		font-weight: 400;
		color: var(--text-1);
		text-decoration: none;
	}
	.so-row-key:hover,
	.so-row-key:focus-visible {
		color: var(--hover-ink, var(--green));
		border-color: currentColor;
	}
	@container (width < 46rem) {
		.so-table thead {
			display: none;
		}
		.so-table,
		.so-table tbody,
		.so-table tr,
		.so-table th,
		.so-table td {
			display: block;
			width: auto;
		}
		.so-table tr {
			padding: 0.4rem 0;
			border-bottom: 1px solid var(--boundary);
		}
		.so-table th,
		.so-table td {
			border-bottom: none;
			padding: 0.15rem 0;
		}
		.so-table td:empty {
			display: none;
		}
		.so-table td::before {
			content: attr(data-label) ': ';
			font-family: var(--font-mono);
			font-size: 0.66rem;
			text-transform: uppercase;
			color: var(--text-2);
		}
	}

	/* PANELS OF UNEQUAL HEIGHT GO IN COLUMNS, NEVER A GRID (CLAUDE.md): a grid
	   row is as tall as its tallest panel. Capped at two, so a short pane holds
	   one and a wide one shares the measure. */
	.so-panels {
		columns: 26rem var(--so-cols, 2);
		column-gap: var(--space-3, 0.75rem);
	}
	.so-panels > .so-card {
		break-inside: avoid;
		margin: 0 0 var(--space-3, 0.75rem);
	}
	.so-coin-rows {
		min-width: 0;
	}

	.so-print-only {
		display: none;
	}
	.so-print-line {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
	}

	/* PRINT. Every rule that names something outside this component carries
	   the `body:has(.so-root)` condition, because a route's stylesheet stays in
	   the page after a client-side navigation (CLAUDE.md's DOM trap). */
	@media print {
		/* The glow and the meter are the screen's; the paper keeps the figure,
		   its band word and the rule down the box's edge. */
		.so-grade-glow,
		.so-grade-meter {
			display: none !important;
		}
		.so-grade,
		.so-band {
			background: none !important;
		}
		:global(body:has(.so-root)) :global(:is(.cr-header, .cr-chrome, .bg-fx, .sfb, [data-nav-progress], #bg-canvas, .tour-offer, .install-prompt, .pwp-overlay)) {
			display: none !important;
		}
		/* No ground of the site's own: the paper is the ground. */
		:global(body:has(.so-root)) {
			background: none !important;
		}
		/* WHITE PAPER, DARK INK, WHATEVER THE SCREEN THEME IS (ledger 0380, report
		   0e62e338: "the print function takes up too much ink; the white theme
		   should actually be white for printing"). Space White is a pale grey,
		   not paper: its plate paints a gradient on the whole room wrapper, which
		   this rule used to leave in place, and chips, tiles and borders carried
		   their own fills. So every ground inside the page is cleared, the room
		   wrapper is flat white, the ink is black, borders are a single light
		   grey, and `print-color-adjust: economy` lets the browser's "Background
		   graphics" setting be off without a fill coming back. The theme swap
		   above stays as the belt, so any token still resolves to a dark ink. */
		:global(html:has(.so-root)),
		:global(body:has(.so-root)),
		:global(body:has(.so-root) .cr-root),
		:global(body:has(.so-root) .cr-root > *) {
			background: #fff !important;
			background-image: none !important;
		}
		.so-root,
		.so-root :global(*),
		.so-root :global(*::before),
		.so-root :global(*::after) {
			background: transparent !important;
			background-image: none !important;
			box-shadow: none !important;
			text-shadow: none !important;
			filter: none !important;
			color: #000 !important;
			-webkit-print-color-adjust: economy;
			print-color-adjust: economy;
		}
		.so-root :global(.card),
		.so-root :global(.chip),
		.so-tile,
		.so-grade,
		.so-table th,
		.so-table td,
		.so-list-row {
			border-color: #bbb !important;
		}
		/* The picture is ink and carries nothing the name beside it does not. */
		.so-root :global(.avatar) {
			display: none !important;
		}
		.so-print-only {
			display: block;
		}
		.so-actions,
		.so-print-toggle,
		.so-noprint {
			display: none !important;
		}
		.so-noprint-always {
			display: none !important;
		}

		/* SPACE ON PAPER (ledger 0392, report 6b1f8fc7: "the printed page needs
		   to be far more space efficient"). Measured before at Letter with 0.75in
		   margins: 6 sheets, because the paper is narrower than the table's 46rem
		   container query, so every assignment printed as a stacked block of
		   labelled lines (two and a half sheets for seven rows). The card stops
		   being a size container on paper, so the table prints as a table; the
		   type is set in points with 9pt as the floor and 1.3 leading; tiles sit
		   seven to a row; and the panels share two columns. */
		.so-card,
		.so-identity {
			container-type: normal !important;
		}
		.classroom-page {
			max-width: none;
			padding: 0;
			gap: 0.1in;
			font-size: 9.5pt;
			line-height: 1.3;
		}
		.so-root :global(.card),
		.so-tile {
			box-shadow: none !important;
			background: none !important;
			padding: 0.07in 0.1in !important;
			border-radius: 3px !important;
		}
		.so-hero {
			grid-template-columns: minmax(0, 1fr) !important;
			gap: 0.06in;
		}
		.so-hero-main,
		.so-hero-figures {
			gap: 0.05in;
		}
		.so-hero-figures {
			flex-direction: column !important;
		}
		.so-name {
			font-size: 16pt;
		}
		.so-email,
		.so-class,
		.so-meta,
		.so-root :global(.chip),
		.so-tile-label,
		.so-tile-sub,
		.so-grade-label,
		.so-grade-note,
		.so-print-line,
		.so-coverage,
		.so-word,
		.so-table thead th,
		.so-root :global(.note) {
			font-size: 9pt !important;
			line-height: 1.3 !important;
		}
		.so-id-chips {
			margin: 0;
		}
		.so-grade {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: baseline;
			gap: 0 0.12in;
			padding: 0.05in 0.1in !important;
			border-left-width: 3px;
		}
		.so-grade-figure,
		.so-tile-figure,
		.so-name {
			line-height: 1.25 !important;
		}
		.so-grade-figure {
			font-size: 16pt;
		}
		.so-grade-sub {
			font-size: 9.5pt;
		}
		.so-glance {
			grid-template-columns: repeat(var(--so-tiles-print, 7), minmax(0, 1fr)) !important;
			gap: 0.05in;
		}
		.so-tile {
			padding: 0.04in 0.06in !important;
			gap: 0;
		}
		.so-tile-figure {
			font-size: 12pt;
		}
		.so-tile-mark {
			width: 10pt;
			height: 10pt;
		}
		.so-card {
			gap: 0.04in;
		}
		.so-card-head h2 {
			font-size: 11pt;
			line-height: 1.3;
		}
		.so-duo,
		.so-panels {
			columns: var(--so-cols-print, 2) !important;
			column-gap: 0.12in;
		}
		.so-duo > .so-card,
		.so-panels > .so-card {
			margin: 0 0 0.1in;
		}
		.so-list-row {
			padding: 0.02in 0;
			gap: 0 0.08in;
		}
		/* A Needs attention row is one line on paper (its keys do not print):
		   the chip, the title and the due date at the right, a check-in too. */
		.so-list-row.so-attention-item,
		.so-list-row.so-attention-checkin {
			grid-template-columns: var(--so-chip-col) minmax(0, 1fr) auto;
			grid-template-areas: 'chip title date';
			align-items: center;
		}
		.so-attention-mark,
		.so-attention-checkin > .so-list-main {
			min-height: 0;
		}
		.so-attention-checkin > .so-list-main,
		.so-attention-title > .so-link {
			padding-block: 0;
		}
		.so-attention-checkin > .so-cell {
			margin-top: 0;
		}
		.so-attention-list > li > .so-meta {
			justify-self: end;
			text-align: right;
			min-height: 0;
		}
		/* A finger's 44px reach is no use on paper. */
		.so-root :global(.tap-44),
		.so-root :global(.btn) {
			min-height: 0 !important;
		}
		.so-list-main {
			flex-basis: 1.4in;
		}
		.so-cell {
			width: 13pt;
			height: 13pt;
			font-size: 9pt;
		}
		.so-word {
			min-width: 0;
		}
		.so-bars {
			gap: 0.03in;
		}
		.so-bar-row {
			grid-template-columns: minmax(0, 1.6in) minmax(0.5in, 1fr) auto;
			grid-template-areas: 'title track figure';
			gap: 0.06in;
		}
		.so-bar-track {
			height: 7pt;
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}
		.so-bar-fill {
			background: #555 !important;
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}
		/* A CARD NEVER BREAKS AROUND A SHORT LIST, and a long one may: held whole,
		   the assignments card pushed the whole table to the next sheet and left
		   two-thirds of the first blank (measured). A row never breaks, and the
		   table's head repeats on each sheet. */
		.so-root :global(.card),
		.so-tile {
			break-inside: avoid;
		}
		.so-root .so-assignments-card {
			break-inside: auto;
		}
		.so-table-wrap {
			overflow: visible;
		}
		.so-table {
			font-size: 9pt;
		}
		.so-table th,
		.so-table td {
			padding: 0.03in 0.05in;
			line-height: 1.3;
		}
		.so-col-title {
			min-width: 0;
		}
		.so-table thead {
			display: table-header-group;
		}
		.so-table tr {
			break-inside: avoid;
		}
		.so-when {
			white-space: nowrap;
		}
		.so-coin-rows :global(*) {
			font-size: 9pt !important;
			line-height: 1.3 !important;
		}
		a.so-link {
			color: inherit;
			text-decoration: none;
		}
	}
</style>
