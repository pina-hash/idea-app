import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
import type { FeedSubmission } from '$lib/classroom/feed';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the HOME PAGE'S SECTION ORDER (404s in production; no
 * auth, no Supabase).
 *
 * It mounts the REAL `src/routes/+page.svelte` -- not a copy of its markup --
 * and hands it the shape its own `+page.server.ts` returns, so the thing under
 * test is the shipping page's own `managesAnySection` derivation running on
 * data of a chosen shape. A harness that rebuilt the two blocks itself would
 * prove nothing about the page.
 *
 * `?role=` picks the viewer, `?classes=` how many sections, `?rows=` how many
 * ranked rows each card carries. Those three are exactly the variables in the
 * offset this bundle exists to measure.
 *
 * THE KEYS ARE RETURNED AT PAGE LEVEL ON PURPOSE. Page data merges over layout
 * data, so `claims`, `userProfile` and `isAdmin` reach not just the page's own
 * `data` prop but `page.data`, which is where AppLauncher and ProfileMenu read
 * them -- the same path production uses. `supabase` is deliberately absent:
 * nothing on this page touches it until something is clicked.
 */
export const prerender = false;

const TEACHER = 'tvargas@boscotech.edu';
const STUDENT = 'alice@boscotech.net';
const OTHER_STUDENT = 'bob@boscotech.net';

/** Frozen, so a measurement taken today and one taken next term agree. */
const NOW = new Date('2026-10-15T12:00:00Z');

function section(i: number, teacherEmail: string): ClassroomSection {
	return {
		id: `sec-${i}`,
		course_id: 'c1',
		label: `Period ${i}`,
		block: i % 2 === 0 ? 'Block B' : 'Block A',
		teacher_email: teacherEmail,
		active: true,
		course: { id: 'c1', code: 'IDEA100', title: 'Intro to Engineering Design', active: true }
	};
}

function item(sectionId: string, n: number): ClassroomItem {
	const id = `${sectionId}-i${n}`;
	return {
		id,
		kind: 'assignment',
		title: `Checkpoint ${n}: sketch, measure, and record the result`,
		body: '',
		body_doc: null,
		points: 10,
		due_at: null,
		category: null,
		author_email: TEACHER,
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: n,
		created_at: new Date(NOW.getTime() - n * 86_400_000).toISOString(),
		edited_at: null,
		last_viewed_at: null,
		postings: [{ section_id: sectionId }],
		attachments: [],
		links: []
	} as unknown as ClassroomItem;
}

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');

	const role = url.searchParams.get('role') === 'teacher' ? 'teacher' : 'student';
	const classes = Math.max(0, Math.min(8, Number(url.searchParams.get('classes') ?? '1') || 0));
	const rows = Math.max(0, Math.min(6, Number(url.searchParams.get('rows') ?? '3') || 0));

	const isTeacher = role === 'teacher';
	const me = isTeacher ? TEACHER : STUDENT;

	// A teacher of record on every section, or somebody else's teacher.
	const sections = Array.from({ length: classes }, (_, i) =>
		section(i + 1, isTeacher ? TEACHER : TEACHER)
	);
	const items = sections.flatMap((s) => Array.from({ length: rows }, (_, n) => item(s.id, n + 1)));

	/**
	 * ONE ROW PER ITEM, FOR EITHER ROLE, through the real ranking rules rather
	 * than by handing the feed pre-ranked entries:
	 *   - a student has no submission on an undated assignment -> `unsubmitted`
	 *   - a teacher has ANOTHER student's submission awaiting grade -> `ungraded`
	 * The other student's row is never the viewer's own, so it cannot leak into
	 * the student case.
	 */
	const submissions: FeedSubmission[] = items.map((i) => ({
		item_id: i.id,
		student_email: OTHER_STUDENT,
		state: 'submitted',
		submitted_at: new Date(NOW.getTime() - 3600_000).toISOString(),
		returned_at: null,
		graded_at: null
	}));

	return {
		// What the page's own server load returns.
		classroomReady: true,
		feedSections: sections,
		feedItems: items,
		feedSubmissions: submissions,
		// What the root layout normally supplies, overridden here so the page and
		// the launcher both see a signed-in viewer of the chosen role.
		claims: { sub: 'harness-user', email: me },
		userProfile: {
			id: 'harness-user',
			role: isTeacher ? 'teacher' : 'student',
			display_name: isTeacher ? 'T. Vargas' : 'Alice Alvarez',
			avatar: null,
			pathway: 'IDEA',
			preferences: {}
		},
		isAdmin: false,
		harness: { role, classes, rows }
	};
};
