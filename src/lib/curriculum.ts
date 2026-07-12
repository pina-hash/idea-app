/**
 * 2026-27 IDEA curriculum: the single source of truth for what courses exist,
 * their per-year sections, and the discontinued courses now in the archive.
 *
 * This module is PLAIN DATA with no `?raw` / `$lib/legacy` imports, so it is
 * safe to import into client components without dragging legacy HTML (the
 * 428 KB VANGUARD game, assignment bodies) into the browser bundle.
 *
 * New 2026-27 courses have no assignment content yet; their cards render a
 * "coming soon" state until assignments are added.
 */

export type Term = 'T1' | 'T2' | 'T3' | 'S1' | 'Summer';
export type Year = 1 | 2 | 3 | 4;
export type SectionStatus = 'live' | 'upcoming' | 'planned';

export interface Assignment {
	slug: string;
	title: string;
}

export interface Section {
	/** Stable slug used as `profiles.section_id` and in URLs. */
	id: string;
	/** Course code, e.g. "IDEA 209H". */
	course: string;
	/** Human title, e.g. "Engineering I Honors". */
	title: string;
	/** Year band 1-4 (Freshman..Senior). */
	year: Year;
	yearLabel: string;
	instructor: string;
	term: Term;
	honors?: boolean;
	/** New course or new term for 2026-27 (red in the planning sheet). */
	isNew?: boolean;
	status: SectionStatus;
	note?: string;
	/** Assignments for this section. Empty until content is added. */
	assignments?: Assignment[];
	/** Optional link to a dedicated class hub page (e.g. FSP's plugin + project page). */
	href?: string;
}

/**
 * Every 2026-27 section. Sections of the same course are listed separately so a
 * signed-in student can pick and see their own (they may differ slightly).
 *
 * NOTE: the Freshman Summer Program title/dates are placeholders. Edit them
 * here when the real details are known.
 */
export const SECTIONS: Section[] = [
	{
		id: 'summer-2026',
		course: 'IDEA FSP',
		title: 'Freshman Summer Program',
		year: 1,
		yearLabel: 'Incoming Freshman',
		instructor: 'Pina',
		term: 'Summer',
		isNew: true,
		status: 'live',
		note: '3-day intensive. The next live course.',
		href: '/fsp'
	},
	{
		id: 'intro-100-1',
		course: 'IDEA 100-1',
		title: 'Intro to IDEA',
		year: 1,
		yearLabel: 'Freshman',
		instructor: 'Pina',
		term: 'T1',
		isNew: true,
		status: 'upcoming'
	},
	{
		id: 'intro-100-2',
		course: 'IDEA 100-2',
		title: 'Intro to IDEA',
		year: 1,
		yearLabel: 'Freshman',
		instructor: 'Pina',
		term: 'T2',
		isNew: true,
		status: 'upcoming'
	},
	{
		id: 'intro-100-3',
		course: 'IDEA 100-3',
		title: 'Intro to IDEA',
		year: 1,
		yearLabel: 'Freshman',
		instructor: 'Pina',
		term: 'T3',
		isNew: true,
		status: 'upcoming'
	},
	{
		id: 'eng1h-sophomore',
		course: 'IDEA 209H',
		title: 'Engineering I Honors',
		year: 2,
		yearLabel: 'Sophomore',
		instructor: 'Pina',
		term: 'S1',
		honors: true,
		isNew: true,
		status: 'upcoming'
	},
	{
		id: 'eng1-sophomore',
		course: 'IDEA 209',
		title: 'Engineering I',
		year: 2,
		yearLabel: 'Sophomore',
		instructor: 'Pina',
		term: 'S1',
		isNew: true,
		status: 'upcoming'
	},
	{
		id: 'eng1h-junior',
		course: 'IDEA 209H',
		title: 'Engineering I Honors',
		year: 3,
		yearLabel: 'Junior',
		instructor: 'Pina',
		term: 'S1',
		honors: true,
		isNew: true,
		status: 'upcoming'
	},
	{
		id: 'eng1-junior',
		course: 'IDEA 209',
		title: 'Engineering I',
		year: 3,
		yearLabel: 'Junior',
		instructor: 'Pina',
		term: 'S1',
		isNew: true,
		status: 'upcoming'
	},
	{
		id: 'eng1h-senior',
		course: 'IDEA 209H',
		title: 'Engineering I Honors',
		year: 4,
		yearLabel: 'Senior',
		instructor: 'Cosso',
		term: 'S1',
		honors: true,
		isNew: true,
		status: 'upcoming'
	},
	{
		id: 'eng1-senior',
		course: 'IDEA 209',
		title: 'Engineering I',
		year: 4,
		yearLabel: 'Senior',
		instructor: 'Cosso',
		term: 'S1',
		isNew: true,
		status: 'upcoming'
	}
];

const YEAR_LABELS: Record<Year, string> = {
	1: 'Freshman',
	2: 'Sophomore',
	3: 'Junior',
	4: 'Senior'
};

/** The highlighted "next live course" (first section with status 'live'). */
export function nextLiveCourse(): Section | undefined {
	return SECTIONS.find((s) => s.status === 'live');
}

/** Look up a section by its id (a student's saved `section_id`). */
export function sectionById(id: string | null | undefined): Section | undefined {
	if (!id) return undefined;
	return SECTIONS.find((s) => s.id === id);
}

export interface YearGroup {
	year: Year;
	yearLabel: string;
	sections: Section[];
}

/**
 * The curriculum grid: school-year sections grouped by year (1-4). The Summer
 * program is excluded here because it is surfaced as the standalone
 * {@link nextLiveCourse} callout.
 */
export function sectionsByYear(): YearGroup[] {
	const years: Year[] = [1, 2, 3, 4];
	return years.map((year) => ({
		year,
		yearLabel: YEAR_LABELS[year],
		sections: SECTIONS.filter((s) => s.year === year && s.term !== 'Summer')
	}));
}

export interface SelectOptionGroup {
	label: string;
	sections: Section[];
}

/**
 * Sections grouped for the "choose your class" picker. Includes the Summer
 * program (incoming freshmen) so every student can find their class.
 */
export function selfSelectOptions(): SelectOptionGroup[] {
	const groups: SelectOptionGroup[] = [];
	const summer = SECTIONS.filter((s) => s.term === 'Summer');
	if (summer.length) groups.push({ label: 'Summer', sections: summer });
	([1, 2, 3, 4] as Year[]).forEach((year) => {
		const sections = SECTIONS.filter((s) => s.year === year && s.term !== 'Summer');
		if (sections.length) groups.push({ label: YEAR_LABELS[year], sections });
	});
	return groups;
}

/** Total distinct course codes offered in 2026-27 (for the hero stat). */
export function activeCourseCount(): number {
	return new Set(SECTIONS.map((s) => s.course)).size;
}

// ---------------------------------------------------------------------------
// Archive: discontinued 2025-26 courses (IDEA-113/208/303/403).
//
// Plain metadata only. Assignment bodies are still served by the public
// `/assignments/<slug>` endpoint; here we just link to them. Slugs match files
// in `src/lib/legacy/assignments/`.
// ---------------------------------------------------------------------------

export interface ArchiveCourse {
	id: string;
	title: string;
	gradeLabel: string;
	blockLabel: string;
	classroomUrl?: string;
	assignments: Assignment[];
}

export const ARCHIVE_COURSES: ArchiveCourse[] = [
	{
		id: 'IDEA-113',
		title: 'IDEA-Blade',
		gradeLabel: 'Freshman',
		blockLabel: 'Block 1',
		classroomUrl: 'https://classroom.google.com/c/ODM4MDY5NDA1NjMy',
		assignments: [
			{ slug: 'IDEA-Blade_Rulebook_v2_2', title: 'IDEA-Blade - Official Rulebook v2.2' },
			{ slug: 'idea113-blade-05', title: 'Assignment 05: Competition Record & Final Presentation' },
			{ slug: 'idea113-blade-05-qr', title: 'Assignment 05: QR Submission' },
			{ slug: 'idea113-blade-04', title: 'Assignment 04: Manufacturing, Assembly & Match Readiness' },
			{ slug: 'idea113-blade-03', title: 'Assignment 03: CAD Design Package' },
			{ slug: 'idea113-blade-02', title: 'Assignment 02: Build Strategy' },
			{ slug: 'idea113-blade-01', title: 'Assignment 01: Concept Package' }
		]
	},
	{
		id: 'IDEA-208',
		title: 'MSET-Mold',
		gradeLabel: 'Sophomore',
		blockLabel: 'Block 2',
		classroomUrl: 'https://classroom.google.com/c/ODQ4Mjc3MzUwMTE1',
		assignments: [
			{ slug: 'mset-mold-02', title: 'Assignment 02: Mold Body Design' },
			{ slug: 'MSET-Mold-01', title: 'Assignment 01: Part Concept & Model' }
		]
	},
	{
		id: 'IDEA-303',
		title: 'Junior Engineering',
		gradeLabel: 'Junior',
		blockLabel: 'Block 3',
		classroomUrl: 'https://classroom.google.com/c/ODM4MTUxNzk3NDgw',
		assignments: []
	},
	{
		id: 'IDEA-403',
		title: 'Senior Project',
		gradeLabel: 'Senior',
		blockLabel: 'Block 4',
		classroomUrl: 'https://classroom.google.com/c/ODM4MDc0ODE5MzI3',
		assignments: [
			{ slug: 'idea403-senior-final', title: 'Senior Final: Project Deliverable Package' },
			{ slug: 'idea403-senior-progress', title: 'Senior Project - Progress Check' }
		]
	}
];
