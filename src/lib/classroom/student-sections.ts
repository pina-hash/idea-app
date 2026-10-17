/**
 * WHICH SECTIONS OF ONE STUDENT'S PAGE A TEACHER SHOWS (report bd38fa25, Mr.
 * Pina 2026-10-16: "Give me options to hide or show different items on this
 * page altogether ... hide notebook check-ins ... since we're not using the
 * notebook system ... hide the coins and music section").
 *
 * Pure: no Svelte, no DOM, no store and no clock. The choice lives in the
 * classroom preference store's `studentPage` group (an ACCOUNT group, so it
 * follows the teacher to any computer and applies to every student page they
 * open; `$lib/preferences/classroom`), read through `readStudentPageHidden`.
 * `StudentOverview` asks `studentPageLayout` what to draw and what to print,
 * and `StudentSectionsMenu` is the one control, in the page header.
 *
 * THE SECTION IDS ARE A STORED VOCABULARY AND ARE APPEND-ONLY. They sit in
 * `profiles.preferences.classroom.studentPage.hidden` on real rows, so
 * renaming one would silently show a section somebody hid. An id a later build
 * removes is dropped on read, never coerced into another (`panel-layout.ts`'s
 * rule and `curriculum.ts`'s reason).
 *
 * A HIDDEN SECTION IS NOT RENDERED AT ALL, so it leaves no gap on the page and
 * nothing on the paper, and EVERYTHING THAT BELONGS TO IT GOES WITH IT: its At
 * a glance tile, and for the notebook its rows in Needs attention, its photos
 * in Their work (`studentGalleryFor`) and the Open full notebook key. What
 * stays is the page's frame: the student's name, their
 * picture, the roster chips and the Print and Back to People keys, which is
 * why the identity block is not a section here.
 *
 * HIDING IS NOT THE PRINT BOX. "Include when printing" is decided per meeting
 * and never stored; hiding is a standing choice that takes the section off the
 * screen and the paper alike. A hidden section therefore has no print box.
 */

export const STUDENT_PAGE_SECTIONS = [
	{ id: 'grade', label: 'Grade so far' },
	{ id: 'upcoming', label: 'Coming up' },
	{ id: 'gallery', label: 'Their work (pictures)' },
	{ id: 'glance', label: 'At a glance' },
	{ id: 'attention', label: 'Needs attention' },
	{ id: 'scores', label: 'Scores on returned work' },
	{ id: 'assignments', label: 'Assignments' },
	{ id: 'notebook', label: 'Notebook' },
	{ id: 'activity', label: 'Activity' },
	{ id: 'hall-passes', label: 'Hall passes' },
	{ id: 'teams', label: 'Teams' },
	{ id: 'coins', label: 'Coins and music' },
	{ id: 'models', label: 'Models and apps' }
] as const;

export type StudentPageSectionId = (typeof STUDENT_PAGE_SECTIONS)[number]['id'];

/** The sections that carry an "Include when printing" box (every section but the three in the page's top). */
export const STUDENT_PRINTABLE_SECTIONS = [
	'gallery',
	'attention',
	'scores',
	'assignments',
	'notebook',
	'activity',
	'hall-passes',
	'teams',
	'coins',
	'models'
] as const satisfies readonly StudentPageSectionId[];
export type StudentPrintableSection = (typeof STUDENT_PRINTABLE_SECTIONS)[number];

/** The At a glance tiles, keyed by the section each belongs to. */
export const STUDENT_TILE_SECTIONS = ['assignments', 'notebook', 'hall-passes', 'coins'] as const satisfies readonly StudentPrintableSection[];
export type StudentTileSection = (typeof STUDENT_TILE_SECTIONS)[number];

/** The cards beside each other under the top, and the panels under the table. */
export const STUDENT_DUO_SECTIONS = ['attention', 'scores'] as const satisfies readonly StudentPrintableSection[];
export const STUDENT_PANEL_SECTIONS = ['notebook', 'activity', 'hall-passes', 'teams', 'coins', 'models'] as const satisfies readonly StudentPrintableSection[];

const ORDER = new Map<string, number>(STUDENT_PAGE_SECTIONS.map((s, i) => [s.id, i]));

export function isStudentPageSectionId(v: unknown): v is StudentPageSectionId {
	return typeof v === 'string' && ORDER.has(v);
}

/** A section's word, as its heading on the page says it. */
export function studentSectionLabel(id: StudentPageSectionId): string {
	return STUDENT_PAGE_SECTIONS[ORDER.get(id) ?? 0].label;
}

/**
 * A STORED HIDDEN LIST to one the page can render: known ids only, each once,
 * in page order (so two lists that hide the same sections are the same value,
 * and the store's sparse comparison sees no change where there is none).
 * Anything that is not a list is "nothing hidden".
 */
export function readStudentPageHidden(raw: unknown): StudentPageSectionId[] {
	if (!Array.isArray(raw)) return [];
	const keep = new Set<StudentPageSectionId>();
	for (const v of raw) if (isStudentPageSectionId(v)) keep.add(v);
	return [...keep].sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0));
}

/** The hidden list after showing or hiding one section. */
export function setStudentSectionShown(
	hidden: readonly StudentPageSectionId[],
	id: StudentPageSectionId,
	shown: boolean
): StudentPageSectionId[] {
	const rest = hidden.filter((h) => h !== id);
	return readStudentPageHidden(shown ? rest : [...rest, id]);
}

/** What the header key says beside its word: nothing while everything shows. */
export function studentHiddenCountWords(hidden: readonly StudentPageSectionId[]): string {
	const n = readStudentPageHidden(hidden).length;
	return n === 0 ? '' : `${n} hidden`;
}

/** True when the teacher has hidden every section, so the page can say why it is nearly empty. */
export function studentEverySectionHidden(hidden: readonly StudentPageSectionId[]): boolean {
	return readStudentPageHidden(hidden).length === STUDENT_PAGE_SECTIONS.length;
}

/**
 * THE PICTURES THEIR WORK SHOWS: notebook photos belong to the Notebook
 * section, so a teacher who hid the notebook does not get notebook pages in
 * the slideshow or on the printed picture row either.
 */
export function studentGalleryFor<T extends { source: string }>(items: readonly T[], notebookShown: boolean): T[] {
	return notebookShown ? items.slice() : items.filter((i) => i.source !== 'notebook');
}

/**
 * HOW MANY COLUMNS THE AT A GLANCE ROW TAKES, so its tiles share the rows
 * evenly instead of leaving one alone on the last (seven at a width that holds
 * six read 6 + 1 with blank space beside IDEA Coins). It never adds a row:
 * the row count is the one the width forces, and the tiles are spread across
 * it (7 at six a row is 4 + 3; 5 at four a row is 3 + 2). Null when there is
 * nothing to measure yet, which leaves the stylesheet's own auto-fit in charge.
 */
export function studentTileColumns(tiles: number, width: number, minTile: number, gap: number): number | null {
	if (!(tiles >= 1) || !(width > 0) || !(minTile > 0) || !(gap >= 0)) return null;
	const fit = Math.max(1, Math.floor((width + gap) / (minTile + gap)));
	const perRow = Math.min(Math.floor(tiles), fit);
	const rows = Math.ceil(tiles / perRow);
	return Math.ceil(tiles / rows);
}

/** The Settings read-out: every section, or which are hidden, by name. */
export function studentHiddenSummary(hidden: readonly StudentPageSectionId[]): string {
	const list = readStudentPageHidden(hidden);
	if (!list.length) return 'Every section shown';
	if (list.length === STUDENT_PAGE_SECTIONS.length) return 'Every section hidden';
	return `Hidden: ${list.map(studentSectionLabel).join(', ')}`;
}

/**
 * A COLUMN COUNT FOR A GROUP OF CARDS: how many are there, capped (CLAUDE.md's
 * multicol rule: multicol has no `auto-fit`, so a two-column container holding
 * one card leaves the second column empty, which is exactly the gap a hidden
 * section must not leave). Never below one.
 */
export function studentColumns(cards: number, max = 2): number {
	return Math.max(1, Math.min(max, Math.floor(cards)));
}

/**
 * ABOUT HOW TALL A ROW IS IN EACH OF THE TWO CARDS SIDE BY SIDE, in px,
 * measured on the harness at 960 (a column beside the other card, 458px):
 * a Needs attention assignment with its keys on the title's line and its due
 * date under it 77, a notebook check-in (its words on the same 44px line, its
 * date under them, polish round C) 77, a score bar 31, and the one line a
 * card says when it has nothing to list 30. Each card's heading is the same
 * height, so it cancels out of the difference.
 */
export const STUDENT_DUO_ROW_PX = { attention: 77, checkIn: 77, score: 31, empty: 30 } as const;

/** The most the two cards may differ, in px, and still sit side by side: about a row and a half. */
export const STUDENT_DUO_STACK_PX = 100;

/**
 * NEEDS ATTENTION AND SCORES SIT SIDE BY SIDE ONLY WHILE THEY ARE ABOUT THE
 * SAME HEIGHT (report 08bafda7, polish round). Two cards of very different
 * heights in two columns leave the shorter one beside a block of nothing as
 * tall as the difference: 428px at 960 and 251px at 1440 for four late or
 * missing pieces of work and two scores. Stacked, each takes the whole width
 * (Needs attention's rows go to one line each and Scores lays its bars in
 * columns) and nothing sits beside either.
 *
 * Decided from the rows each card will list, not from a measurement, so the
 * server render already has the arrangement the page keeps (no shift once the
 * page wakes up) and so it cannot oscillate: stacking changes both cards'
 * heights, and a decision read off the stacked heights would flip it back.
 * The figures are the two-column rows' own (`STUDENT_DUO_ROW_PX`); where a
 * long title wraps, the estimate runs short, never long, which can only leave
 * the pair side by side as it always was. Paper keeps two columns: a hole
 * there costs no sheet, and stacking would.
 */
export function studentDuoStacks(rows: { attention: number; checkIns: number; scores: number }): boolean {
	const px = STUDENT_DUO_ROW_PX;
	const count = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
	const attention = count(rows.attention) * px.attention + count(rows.checkIns) * px.checkIn || px.empty;
	const scores = count(rows.scores) * px.score || px.empty;
	return Math.abs(attention - scores) > STUDENT_DUO_STACK_PX;
}

/**
 * WHERE THE SECTIONS MENU FITS BESIDE ITS KEY (polish round), in px: the
 * rooms above and under the key (each less its margin and gap), the panel's
 * parts other than the list and the note (`chrome`), the note's own space and
 * one row's height, all measured off the open panel by `StudentSectionsMenu`.
 *
 *   room   the panel's height cap: the larger room, never less than the
 *          heading, one row and the two keys (`least`);
 *   tight  true when that room is short of the note and two rows, so the note
 *          steps out of sight and the boxes keep the room;
 *   short  how far one side is from holding even `least` (0 when one does):
 *          what opening the menu scrolls the page by, once.
 *
 * There is no fixed floor: a 300px one put the panel over half its key in a
 * 960x600 window with the key mid-screen, where each side had about 242px.
 */
export function studentSectionsMenuFit(m: {
	above: number;
	under: number;
	chrome: number;
	note: number;
	row: number;
}): { room: number; tight: boolean; short: number; least: number } {
	const least = Math.ceil(m.chrome + m.row);
	const best = Math.floor(Math.max(m.above, m.under));
	return {
		room: Math.max(least, best),
		tight: best < m.chrome + m.note + 2 * m.row,
		short: Math.max(0, least - best),
		least
	};
}

export type StudentHeroArrangement = 'split' | 'stack' | 'solo';

export interface StudentPageLayout {
	/** Whether each section is on the page at all. */
	shown: Record<StudentPageSectionId, boolean>;
	/** Whether each section with a print box goes on the paper: shown, and its box ticked. */
	printed: Record<StudentPrintableSection, boolean>;
	/** The grade box: on the page, and on the paper. */
	grade: { shown: boolean; prints: boolean };
	/** Coming up: on the page, and on the paper. */
	upcoming: { shown: boolean; prints: boolean };
	/** Each At a glance tile, by the section it belongs to. */
	tiles: Record<StudentTileSection, { shown: boolean; prints: boolean }>;
	/** The At a glance row: drawn while any tile is, printed while any tile prints. */
	glance: { shown: boolean; prints: boolean };
	/**
	 * HOW THE TOP CARD IS ARRANGED, one decision (report bd38fa25, round 2):
	 *   split  the pictures beside the identity, the grade and Coming up under it
	 *          (the page as it shipped; both figures shown);
	 *   stack  the pictures UNDER the identity at the card's full width, with
	 *          whatever figure is left beside the identity, because a short
	 *          left column beside the tall gallery left a 200 to 400px hole;
	 *   solo   no pictures: one column, the figures sharing its width.
	 */
	hero: StudentHeroArrangement;
	/** Whether the grade or Coming up is on the page, so the top has a figure column. */
	heroFigures: boolean;
	/** Notebook check-ins listed under Needs attention, and the full-notebook key. */
	notebookExtras: boolean;
}

/**
 * WHAT TO DRAW AND WHAT TO PRINT, from the teacher's hidden list and this
 * visit's print boxes. One function, so the screen and the paper cannot
 * disagree about a section.
 *
 * THE GRADE AND COMING UP HAVE NO PRINT BOX OF THEIR OWN; they follow the
 * sections they summarize, as before: the grade prints while Scores or
 * Assignments does, Coming up while Assignments does. When the sections they
 * follow are HIDDEN (not merely unticked), there is nothing left to follow,
 * and a grade the teacher chose to keep prints on its own.
 */
export function studentPageLayout(
	hidden: readonly StudentPageSectionId[],
	printing: Readonly<Record<StudentPrintableSection, boolean>>
): StudentPageLayout {
	const off = new Set(readStudentPageHidden(hidden));
	const shown = Object.fromEntries(STUDENT_PAGE_SECTIONS.map((s) => [s.id, !off.has(s.id)])) as Record<
		StudentPageSectionId,
		boolean
	>;
	const printed = Object.fromEntries(
		STUDENT_PRINTABLE_SECTIONS.map((id) => [id, shown[id] && printing[id] === true])
	) as Record<StudentPrintableSection, boolean>;
	const gradeFollows = shown.scores || shown.assignments;
	const tiles = Object.fromEntries(
		STUDENT_TILE_SECTIONS.map((id) => {
			const on = shown.glance && shown[id];
			return [id, { shown: on, prints: on && printed[id] }];
		})
	) as Record<StudentTileSection, { shown: boolean; prints: boolean }>;
	const tileList = Object.values(tiles);
	return {
		shown,
		printed,
		grade: { shown: shown.grade, prints: shown.grade && (gradeFollows ? printed.scores || printed.assignments : true) },
		upcoming: { shown: shown.upcoming, prints: shown.upcoming && (shown.assignments ? printed.assignments : true) },
		tiles,
		glance: { shown: tileList.some((t) => t.shown), prints: tileList.some((t) => t.prints) },
		hero: !shown.gallery ? 'solo' : shown.grade && shown.upcoming ? 'split' : 'stack',
		heroFigures: shown.grade || shown.upcoming,
		notebookExtras: shown.notebook
	};
}
