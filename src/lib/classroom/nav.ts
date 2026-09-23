/**
 * Where a /classroom URL sits, as plain data (the curriculum.ts convention: no
 * Svelte, no Supabase, nothing that enforces anything).
 *
 * The module grew feature by feature and every capability got its own route with
 * no structure between them, so moving from a class to an item to grading to the
 * roster meant going back to a hub and drilling down again. This is what the
 * persistent shell reads to answer two questions on every page: where am I, and
 * what is one click away.
 *
 * IT DECIDES NOTHING ABOUT ACCESS. `tabs` lists what a MANAGER of the section
 * would see; whether the caller is one is the server's answer, and the People
 * and Grades routes 404 for anybody else regardless of what this returns.
 */

export interface Crumb {
	label: string;
	/** Absent on the last crumb -- you are already there. */
	href?: string;
}

export type SectionTabId = 'class' | 'notebook' | 'people' | 'grades' | 'duplicates';

export interface SectionTab {
	id: SectionTabId;
	label: string;
	href: string;
	/** Manager-only tabs. A student is never offered these and cannot load them. */
	manageOnly: boolean;
	/**
	 * LEAVES /classroom ENTIRELY, so it can never be the active tab and must not
	 * look like one.
	 *
	 * `activeTab` reads a `ClassroomLocation`, and `locateClassroom` only ever
	 * describes a /classroom path -- a tab whose href is somewhere else is
	 * therefore null on every route the bar renders on, forever. That is the
	 * honest answer rather than a gap: the destination is another room, and a
	 * tab that silently never highlights reads as a broken tab. The shell marks
	 * these with a trailing guillemet and withholds `aria-current` from them,
	 * exactly as the class stream marks a link out.
	 *
	 * NO TAB CARRIES IT TODAY (ledger 0297). The one that did, "Check-ins", went
	 * to `/notebook/review` in another room; the notebook is a tab of the class
	 * now, so every tab is a view of this class and the flag has no user. It is
	 * kept because the shell still honours it, and a door out that comes back
	 * must be marked as one.
	 */
	external?: boolean;
	/**
	 * A COUNT ON THE TAB, WITH ITS WORD (ledger 0297): the Notebook tab's "3 to
	 * do" for a student, "3 behind" for a manager. Never a bare number, whose
	 * meaning would live in a tooltip a phone cannot hover. Set by the layout
	 * from numbers the page already loaded; `sectionTabs` never sets it.
	 */
	count?: { count: number; word: string } | null;
}

export type ClassroomPlace =
	| 'home'
	| 'section'
	| 'people'
	| 'grades'
	| 'duplicates'
	| 'item'
	| 'item-grade'
	| 'item-deck'
	/** A class's own notebook: the student's notebook in this class, or a manager's review of it. */
	| 'notebook'
	/** The student's whole notebook, every class (`/classroom/notebook`). */
	| 'notebook-home'
	/** The all-sections review console (`/classroom/notebook/review`). */
	| 'notebook-review'
	/** One student's whole notebook, read-only, for a reviewer. */
	| 'notebook-student'
	| 'admin'
	| 'updates'
	| 'feedback'
	| 'todo'
	| 'view-as'
	| 'other';

export interface ClassroomLocation {
	place: ClassroomPlace;
	sectionId: string | null;
	itemId: string | null;
}

/**
 * VIEW-AS IS ITS OWN WORLD AND IS MATCHED FIRST.
 *
 * `/classroom/view-as/<email>/...` looks exactly like a section route two
 * segments along, and it must never be read as one: that tree renders one
 * student's own notebook under an impersonation banner, with its own admin gate
 * and its own chrome. The shell drops to a minimal mode there rather than
 * offering a switcher listing the ADMIN's own sections beside a student's name.
 *
 * The head match is what makes this safe as the tree shrinks: the class and
 * item previews that once lived under it are gone, and nothing here had to
 * change for that.
 */
export function locateClassroom(pathname: string): ClassroomLocation {
	const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
	// parts[0] === 'classroom'
	const rest = parts.slice(1);
	const none: ClassroomLocation = { place: 'other', sectionId: null, itemId: null };
	if (parts[0] !== 'classroom') return none;
	if (rest.length === 0) return { place: 'home', sectionId: null, itemId: null };

	const head = rest[0];
	if (head === 'view-as') return { place: 'view-as', sectionId: null, itemId: null };
	/*
	 * THE NOTEBOOK'S OWN PLACES, BEFORE THE SECTION BRANCH (ledger 0297). They
	 * are static segments and a section id is a uuid, so the two can never be
	 * the same string -- but read after the section branch, `/classroom/notebook`
	 * would be a section called "notebook", exactly the way view-as would be.
	 */
	if (head === 'notebook') {
		if (rest[1] === 'review') {
			if (rest[2] === 'student' && rest[3]) return { place: 'notebook-student', sectionId: null, itemId: null };
			return { place: 'notebook-review', sectionId: null, itemId: null };
		}
		return { place: 'notebook-home', sectionId: null, itemId: null };
	}
	if (head === 'admin' || head === 'manage') return { place: 'admin', sectionId: null, itemId: null };
	if (head === 'updates') return { place: 'updates', sectionId: null, itemId: null };
	if (head === 'feedback') return { place: 'feedback', sectionId: null, itemId: null };
	// The cross-class to-do (ledger 0297). Matched BEFORE the section branch, or
	// `/classroom/todo` would read as a class whose id is "todo".
	if (head === 'todo') return { place: 'todo', sectionId: null, itemId: null };

	const sectionId = head;
	if (rest.length === 1) return { place: 'section', sectionId, itemId: null };
	if (rest[1] === 'people') return { place: 'people', sectionId, itemId: null };
	if (rest[1] === 'grades') return { place: 'grades', sectionId, itemId: null };
	if (rest[1] === 'duplicates') return { place: 'duplicates', sectionId, itemId: null };
	if (rest[1] === 'notebook') return { place: 'notebook', sectionId, itemId: null };
	if (rest[1] === 'item' && rest[2]) {
		const itemId = rest[2];
		if (rest[3] === 'grade') return { place: 'item-grade', sectionId, itemId };
		if (rest[3] === 'deck') return { place: 'item-deck', sectionId, itemId };
		return { place: 'item', sectionId, itemId };
	}
	return { place: 'other', sectionId, itemId: null };
}

/**
 * A section's tabs, in reading order: the class, its notebook, then the
 * manager's views of people, marks and duplicate drafts.
 *
 * THE NOTEBOOK IS A TAB OF THE CLASS, FOR EVERYBODY IN IT (ledger 0297, Mr.
 * Pina's words: "Integrate the notebook into IDEA Classroom with IDEA
 * Classroom being the driving force"). It is NOT `manageOnly`: a student's tab
 * is their own notebook filtered to this class, with the composer, and a
 * manager's is this class's review -- the compliance grid, the check-in
 * manager and the Documentation Check -- locked to this section. The route
 * decides which from the server's own `canManage`, so the tab is one href and
 * the destination is the gate.
 *
 * IT REPLACED A DEPARTURE. The manager's way to the check-in manager used to
 * be a "Check-ins" tab that LEFT the classroom for `/notebook/review`, a
 * second app with its own masthead and no class switcher. That tab is gone
 * rather than re-pointed: a class with two doors to the same console is a
 * class a teacher has to learn twice. Its old address still answers, by
 * redirect, for every link and bookmark that holds it.
 *
 * SECOND, NOT LAST. For a student the bar is "Class | Notebook" whichever slot
 * it takes; for a manager the class's two working surfaces come before the
 * three reports, and it is the reports that wrap to a second row on a phone.
 *
 * THE DUPLICATES TAB AND ITS PAGE STAND OR FALL TOGETHER, asserted in BOTH
 * directions by `tests/classroom-nav-doors.test.ts`. A new tab takes six
 * edits -- this union, this list, `ClassroomPlace`, `locateClassroom`'s
 * `rest[1]` branch, `activeTab`'s case and `classroomCrumbs`'s -- plus a
 * `classroomMeasure` case wherever `page` is the wrong width.
 */
export function sectionTabs(sectionId: string, basePath = '/classroom'): SectionTab[] {
	return [
		{ id: 'class', label: 'Class', href: `${basePath}/${sectionId}`, manageOnly: false },
		{ id: 'notebook', label: 'Notebook', href: classNotebookHref(sectionId, basePath), manageOnly: false },
		{ id: 'people', label: 'People', href: `${basePath}/${sectionId}/people`, manageOnly: true },
		{ id: 'grades', label: 'Grades', href: `${basePath}/${sectionId}/grades`, manageOnly: true },
		{
			id: 'duplicates',
			label: 'Duplicates',
			href: `${basePath}/${sectionId}/duplicates`,
			manageOnly: true
		}
	];
}

/**
 * A CLASS'S NOTEBOOK, as a URL. One spelling, read by the tab above, the class
 * page's own notebook link, a check-in's deep link and the item page's check-in
 * block, so none of them can point somewhere the tab does not.
 */
export function classNotebookHref(sectionId: string, basePath = '/classroom'): string {
	// Encoded as a path segment: a section id is a uuid in every real row,
	// and this is what keeps a harness id or a hand-typed one from ever
	// becoming two segments.
	return `${basePath}/${encodeURIComponent(sectionId)}/notebook`;
}

/**
 * THE STUDENT'S WHOLE NOTEBOOK, every class, inside the classroom shell. The
 * class a student came from rides along as `?section=`, which the load
 * validates against their own classes and uses only as the default class a
 * free entry is filed to.
 */
export function notebookHomeHref(fromSectionId: string | null = null, basePath = '/classroom'): string {
	return fromSectionId
		? `${basePath}/notebook?section=${encodeURIComponent(fromSectionId)}`
		: `${basePath}/notebook`;
}

/** The all-sections review console, for a reviewer with more than one class or none they manage. */
export function notebookReviewHref(sectionId: string | null = null, basePath = '/classroom'): string {
	return sectionId
		? `${basePath}/notebook/review?section=${encodeURIComponent(sectionId)}`
		: `${basePath}/notebook/review`;
}

/** One student's whole notebook, read-only, for a reviewer; `?section=` is the way back. */
export function studentNotebookHref(
	email: string,
	fromSectionId: string | null = null,
	basePath = '/classroom'
): string {
	const href = `${basePath}/notebook/review/student/${encodeURIComponent(email)}`;
	return fromSectionId ? `${href}?section=${encodeURIComponent(fromSectionId)}` : href;
}

/**
 * THE DUPLICATE-DATE REFUSAL, WITH ITS DESTINATION (prompt 0081 wrote the
 * sentence, prompt 0086 corrected where it points, prompt 0098 landed it,
 * ledger 0297 moved it into the class).
 *
 * `ItemDetail` refuses a second check-in on a date an item already has one.
 * The existing one lives in the check-in manager, which is a MODE of this
 * class's Notebook tab for a manager -- NOT the Duplicates tab, which is about
 * duplicate DRAFTS, a different object. The address is the notebook tab's own
 * href from `sectionTabs` plus `?mode=checkins`, which the tab reads to open
 * straight on the manager, so the sentence and the tab cannot point two
 * different ways. And it is a LINK, not only a sentence: the section tab bar
 * does not render on the item page (`activeTab` is null for `item`), so a
 * sentence alone would name chrome that is not on screen.
 */
export function checkInDuplicateRefusal(
	sectionId: string,
	basePath = '/classroom'
): { message: string; href: string; linkLabel: string } {
	const tab = sectionTabs(sectionId, basePath).find((t) => t.id === 'notebook');
	if (!tab) throw new Error('sectionTabs no longer carries a notebook tab');
	return {
		message:
			'This item already has a check-in on that date. Pick a different date, or edit the ' +
			"existing one in the check-in manager, on this class's Notebook tab. A duplicate " +
			"would put a second column on every affected class's grid and ask students for the same " +
			'page twice.',
		href: `${tab.href}?mode=checkins`,
		linkLabel: 'Open the check-in manager'
	};
}

/**
 * WHICH OF A SECTION'S TABS THIS CALLER IS OFFERED.
 *
 * ONE IMPLEMENTATION, and it moved here from inside `ClassroomShell` for the
 * ordinary reason: the filter is the sentence "a manage-only tab is offered to
 * a manager", and a second spelling of it -- in a test, in a second shell, in
 * a harness -- is the copy that stops agreeing with the one on screen. The
 * shell calls this; nothing re-derives it.
 *
 * IT IS NOT A GATE AND MUST NEVER BE READ AS ONE. Every manage-only
 * destination refuses a non-manager itself: `/classroom/<id>/people` and
 * `/classroom/<id>/grades` 404, and a class's Notebook tab decides from the
 * server's own `canManage` whether it is the student's notebook or the review.
 * What this decides is what a caller is SHOWN, which is a different job from
 * what they may reach, and `tests/classroom-nav-doors.test.ts` opens this
 * predicate to prove the tests are watching it rather than the fixture.
 */
export function visibleSectionTabs(tabs: SectionTab[], canManage: boolean): SectionTab[] {
	return tabs.filter((t) => !t.manageOnly || canManage);
}

/**
 * A PATHNAME AS `locateClassroom` READS IT, whatever base the surface is
 * mounted under. The dev harnesses mount the real classroom shell under
 * `/dev/classroom-split`, and a location read off the raw pathname there is
 * `other` for every page -- which is how the nav-collapse control (prompt
 * 0098, item H) came to render on the shipping route and never on the harness
 * meant to measure it. One normalisation, read by the shell and by
 * `navKeepsComposer`, so the two cannot disagree about where they are.
 */
export function classroomPathname(pathname: string, basePath = '/classroom'): string {
	return basePath === '/classroom' ? pathname : pathname.replace(basePath, '/classroom');
}

/**
 * DOES THIS NAVIGATION KEEP THE COMPOSER ALIVE?
 *
 * The composer is owned by the SECTION LAYOUT, which is not remounted while you
 * move around inside one class's two-pane shell -- so clicking through items
 * with a half-written post open is fine, and warning about it would be a lie
 * that quickly teaches people to click through the warning.
 *
 * Anything else unmounts it and takes the staged Files with it: another class,
 * People, Grades, the grading console, the deck viewer, My Classes, the world
 * outside /classroom. Those are the navigations worth stopping.
 */
export function navKeepsComposer(sectionId: string, pathname: string, basePath = '/classroom'): boolean {
	const loc = locateClassroom(classroomPathname(pathname, basePath));
	if (loc.sectionId !== sectionId) return false;
	return loc.place === 'section' || loc.place === 'item';
}

/**
 * Which tab a location sits on, or null when it is not a section-level route.
 *
 * The notebook tab activates on its own place, like every other tab: it is a
 * route of the class now, not a departure (see `sectionTabs`).
 */
export function activeTab(loc: ClassroomLocation): SectionTabId | null {
	if (loc.place === 'section') return 'class';
	if (loc.place === 'notebook') return 'notebook';
	if (loc.place === 'people') return 'people';
	if (loc.place === 'grades') return 'grades';
	if (loc.place === 'duplicates') return 'duplicates';
	return null;
}

/**
 * IS THE CLASS'S LIST OF OTHER ITEMS EVEN ON SCREEN BESIDE SOMETHING, HERE.
 *
 * The nav-collapse control ($lib/classroom/nav-collapse.ts,
 * ClassroomShell's toggle) only means anything on the one place where a list
 * pane sits beside an open item: `item`. On `section` nothing is selected, so
 * the list already has the whole split to itself (see split.css's
 * `:not(.has-detail)` rule) and there is nothing beside it to put away.
 * `people`, `grades`, `item-grade`, `item-deck` and everywhere else never
 * split at all (`src/routes/classroom/[sectionId]/+layout.svelte`'s own
 * `split` only turns on for `section` and `item`).
 */
export function canCollapseNav(loc: ClassroomLocation): boolean {
	return loc.place === 'item';
}

/**
 * HOW WIDE THE PAGE IS, answered in the same place as "where am I".
 *
 * The shell's breadcrumbs and tabs used to be pinned at 60rem while the content
 * under them could be 46rem (an item) or 62rem (grading), so the chrome only
 * lined up with the page on the routes that happened to be 60rem too. Both now
 * read `--cr-measure`, and this is the one function that decides it -- the
 * content measure a place wants, as a design-system token name.
 *
 * The two-pane shell is NOT decided here: whether a section route splits
 * depends on the viewport, which is a media query's job, so classroom.css
 * widens `--cr-measure` to `--measure-split` when a split is actually on
 * screen. See the `.cr-split` rules there.
 */
export type ClassroomMeasure = 'reading' | 'form' | 'panel' | 'page' | 'wide' | 'split' | 'console';

export function classroomMeasure(loc: ClassroomLocation): ClassroomMeasure | null {
	switch (loc.place) {
		case 'item':
		case 'updates':
			return 'reading';
		case 'feedback':
			return 'form';
		case 'admin':
			return 'panel';
		/**
		 * A CONSOLE, not a column. Grading is three regions worked side by
		 * side -- the roster, the student's response, the rubric -- and it used
		 * to take `wide` (62rem), which at 1440px left the rubric column 228px
		 * of content: a level's descriptor wrapped to five lines and the
		 * decision it exists to inform was made against a sliver. `console` is
		 * the window less the room's gutter, which is what an application
		 * surface takes. classroom.css is what resolves it past the split's own
		 * override; see the `.cr-console` rule there.
		 */
		case 'item-grade':
			return 'console';
		/**
		 * THE TO-DO IS A LIST OF GROUPS LAID OUT IN COLUMNS, so it takes the
		 * width a two-pane class page takes (`--measure-split`) rather than a
		 * single reading column capped in the middle of a wide window.
		 */
		case 'todo':
			return 'split';
		/**
		 * THE NOTEBOOK IS A WORKING SURFACE AND USES THE WINDOW (ledger 0297).
		 * A student's notebook is a list beside an open entry or the composer,
		 * and a manager's is the review console -- a grid beside an entry -- so
		 * each is an application frame, not a column: the same answer grading
		 * takes, for the same reason. The read-only notebook a reviewer opens
		 * for one student takes it too; its page scrolls inside the frame's body
		 * rather than the document.
		 */
		case 'notebook':
		case 'notebook-home':
		case 'notebook-review':
		case 'notebook-student':
			return 'console';
		/**
		 * NULL, not a width. `view-as` is one place covering two genuinely
		 * different pages -- the 46rem student picker and a notebook mounted
		 * under somebody else's shell -- and it runs the shell in minimal mode,
		 * so it has no crumbs or tabs to align with anything. Every component
		 * there keeps its own fallback, which is exactly what it had before this
		 * existed.
		 */
		case 'view-as':
		case 'other':
			return null;
		default:
			return 'page';
	}
}

/**
 * The trail back up, most general first. The last crumb has no href because you
 * are standing on it.
 *
 * Every page below a section carries its class, so nothing in this module is
 * reachable only by a URL somebody had to already know -- which is the whole
 * point of the trail rather than a single "back" button that guesses.
 */
export function classroomCrumbs(
	loc: ClassroomLocation,
	labels: {
		section?: string | null;
		item?: string | null;
		/** The student whose notebook a reviewer is reading (`notebook-student`). */
		student?: string | null;
		/**
		 * WHERE A READ-ONLY STUDENT NOTEBOOK GOES BACK TO. That page has no class
		 * in its path, so the class grid it was opened from arrives as crumbs the
		 * load built (it validates the class and knows whether the viewer manages
		 * it); without them the way back is the all-sections console.
		 */
		returnTo?: Crumb[] | null;
	} = {},
	basePath = '/classroom'
): Crumb[] {
	const home: Crumb = { label: 'My Classes', href: basePath };
	const section = (last: boolean): Crumb => ({
		label: labels.section || 'Class',
		href: last ? undefined : `${basePath}/${loc.sectionId}`
	});

	switch (loc.place) {
		case 'home':
			return [{ label: 'My Classes' }];
		case 'section':
			return [home, section(true)];
		case 'people':
			return [home, section(false), { label: 'People' }];
		case 'grades':
			return [home, section(false), { label: 'Grades' }];
		case 'duplicates':
			return [home, section(false), { label: 'Duplicates' }];
		case 'notebook':
			return [home, section(false), { label: 'Notebook' }];
		case 'notebook-home':
			return [home, { label: 'My notebook' }];
		case 'notebook-review':
			return [home, { label: 'Notebook review' }];
		case 'notebook-student':
			return [
				home,
				...(labels.returnTo?.length
					? labels.returnTo
					: [{ label: 'Notebook review', href: `${basePath}/notebook/review` }]),
				{ label: labels.student || 'Student notebook' }
			];
		case 'item':
			return [home, section(false), { label: labels.item || 'Item' }];
		case 'item-grade':
			return [
				home,
				section(false),
				{ label: labels.item || 'Item', href: `${basePath}/${loc.sectionId}/item/${loc.itemId}` },
				{ label: 'Grading' }
			];
		case 'item-deck':
			return [
				home,
				section(false),
				{ label: labels.item || 'Item', href: `${basePath}/${loc.sectionId}/item/${loc.itemId}` },
				{ label: 'Deck' }
			];
		case 'admin':
			return [home, { label: 'Courses & setup' }];
		case 'updates':
			return [home, { label: "What's new" }];
		case 'feedback':
			return [home, { label: 'Feedback' }];
		case 'todo':
			return [home, { label: 'To-do' }];
		default:
			return [home];
	}
}
