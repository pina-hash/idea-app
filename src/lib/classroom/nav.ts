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

export type SectionTabId = 'class' | 'people' | 'grades';

export interface SectionTab {
	id: SectionTabId;
	label: string;
	href: string;
	/** Manager-only tabs. A student is never offered these and cannot load them. */
	manageOnly: boolean;
}

export type ClassroomPlace =
	| 'home'
	| 'section'
	| 'people'
	| 'grades'
	| 'item'
	| 'item-grade'
	| 'item-deck'
	| 'admin'
	| 'updates'
	| 'feedback'
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
	if (head === 'admin' || head === 'manage') return { place: 'admin', sectionId: null, itemId: null };
	if (head === 'updates') return { place: 'updates', sectionId: null, itemId: null };
	if (head === 'feedback') return { place: 'feedback', sectionId: null, itemId: null };

	const sectionId = head;
	if (rest.length === 1) return { place: 'section', sectionId, itemId: null };
	if (rest[1] === 'people') return { place: 'people', sectionId, itemId: null };
	if (rest[1] === 'grades') return { place: 'grades', sectionId, itemId: null };
	if (rest[1] === 'item' && rest[2]) {
		const itemId = rest[2];
		if (rest[3] === 'grade') return { place: 'item-grade', sectionId, itemId };
		if (rest[3] === 'deck') return { place: 'item-deck', sectionId, itemId };
		return { place: 'item', sectionId, itemId };
	}
	return { place: 'other', sectionId, itemId: null };
}

/** The three tabs a section has. Order is the reading order: content, then people, then marks. */
export function sectionTabs(sectionId: string, basePath = '/classroom'): SectionTab[] {
	return [
		{ id: 'class', label: 'Class', href: `${basePath}/${sectionId}`, manageOnly: false },
		{ id: 'people', label: 'People', href: `${basePath}/${sectionId}/people`, manageOnly: true },
		{ id: 'grades', label: 'Grades', href: `${basePath}/${sectionId}/grades`, manageOnly: true }
	];
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
	const normalized = basePath === '/classroom' ? pathname : pathname.replace(basePath, '/classroom');
	const loc = locateClassroom(normalized);
	if (loc.sectionId !== sectionId) return false;
	return loc.place === 'section' || loc.place === 'item';
}

/** Which tab a location sits on, or null when it is not a section-level route. */
export function activeTab(loc: ClassroomLocation): SectionTabId | null {
	if (loc.place === 'section') return 'class';
	if (loc.place === 'people') return 'people';
	if (loc.place === 'grades') return 'grades';
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
export type ClassroomMeasure = 'reading' | 'form' | 'panel' | 'page' | 'wide' | 'console';

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
	labels: { section?: string | null; item?: string | null } = {},
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
		default:
			return [home];
	}
}
