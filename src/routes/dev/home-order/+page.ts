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
 * `?due=` IS THE FOURTH, AND IT EXISTS BECAUSE THE DEFAULT CANNOT REACH TWO OF
 * THE FOUR URGENCY STEPS. Rows are dated n days out for n = 1..rows, which
 * produces `imminent` and `soon` and never `today` or `overdue` -- so a harness
 * without it would drive half the mechanism and a browser pass over it would
 * report the treatment working while the two steps that matter most had never
 * rendered. It takes a comma-separated list of DAY OFFSETS, one per row,
 * negative for a deadline already past: `?due=-1,0,1,5` is one row of each
 * step. Offsets are applied in order and reused cyclically when there are more
 * rows than offsets.
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

function item(sectionId: string, n: number, dueAt?: string): ClassroomItem {
	const id = `${sectionId}-i${n}`;
	return {
		id,
		kind: 'assignment',
		title: `Checkpoint ${n}: sketch, measure, and record the result`,
		body: '',
		body_doc: null,
		points: 10,
		/**
		 * DATED INSIDE THE DUE-SOON WINDOW, OFF THE REAL CLOCK, and it used to be
		 * null.
		 *
		 * An undated assignment with no submission row used to rank under
		 * `unsubmitted`; `studentReason` no longer emits that (an item cannot say
		 * whether it collects a hand-in, so the reason was a false count). Left
		 * undated, every student row here would be gone and this harness would
		 * measure the section offset against two empty cards.
		 *
		 * `Date.now()` AND NOT `NOW`, WHICH IS THE TRAP. This route mounts the
		 * REAL `src/routes/+page.svelte`, and that page ranks with
		 * `const now = new Date()` -- the live clock, which no fixture can
		 * freeze. Dated off `NOW` instead, these items were ~50 days out by the
		 * time anyone opened the page, ranked `later`, and produced exactly the
		 * empty cards this line exists to prevent. Measured in a browser: 0 rows
		 * dated off `NOW`, 6 dated off `Date.now()`.
		 *
		 * `NOW` still stamps `created_at`, where a frozen value is right: that is
		 * only the final tiebreak in `compare`, and a fixed DUE date is the half
		 * that goes stale.
		 *
		 * n stays inside DUE_SOON_DAYS for every value `?rows=` allows, so each
		 * item ranks `due-soon` -- the surviving reason carrying the retired
		 * one's tone (`info`) and its actionable-ness, so the header's count chip
		 * still counts these. Distinct per item, so the deadline tiebreak is
		 * decided.
		 */
		due_at: dueAt ?? new Date(Date.now() + n * 86_400_000).toISOString(),
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
	/**
	 * `?admin=1` renders the three admin-only cards as well. It is the fourth
	 * variable the page actually has: `isAdmin` reaches the launcher's
	 * `visibleApps`, and without it three of the eleven cards never mount, so a
	 * sweep over the cards on screen silently measures eight of them and comes
	 * back clean. It is NOT an access decision -- the real page reads this off
	 * the root layout, and this route 404s in production either way.
	 */
	const admin = url.searchParams.get('admin') === '1';

	/**
	 * Day offsets for the ranked rows. Empty (the default) keeps the historical
	 * behaviour exactly: row n is due n days out.
	 */
	const dueOffsets = (url.searchParams.get('due') ?? '')
		.split(',')
		.map((v) => Number(v.trim()))
		.filter((v) => Number.isFinite(v));

	/**
	 * An offset lands at the END of its calendar day, and 0 is why.
	 *
	 * `Date.now() + 0 days` is already in the past by the time the page paints,
	 * so it ranks `overdue` and the `today` step -- a deadline later TODAY, the
	 * one a student most needs to see -- would be unreachable from this harness.
	 * End of day makes every non-negative offset a future instant on the calendar
	 * day it names, and -1 an instant safely in the past, so each offset produces
	 * exactly the step it reads as.
	 *
	 * The DEFAULT path is untouched and still dates row n at `Date.now() + n
	 * days` (see `item`), because that is what the section-offset measurements
	 * this route exists for were taken against.
	 */
	const dueAtFor = (days: number) => {
		const d = new Date();
		d.setDate(d.getDate() + days);
		d.setHours(23, 59, 0, 0);
		return d.toISOString();
	};

	/**
	 * `?pending=N` puts N in the launcher's Foundry review badge. Admin-gated
	 * exactly as the real payload is (the home load answers null for anyone
	 * else), so `?pending=3` without `?admin=1` is the negative case: no badge.
	 */
	const pendingRaw = Number(url.searchParams.get('pending') ?? '');
	const pending = admin && Number.isFinite(pendingRaw) ? Math.max(0, pendingRaw) : null;

	const isTeacher = role === 'teacher';
	const me = isTeacher ? TEACHER : STUDENT;

	// A teacher of record on every section, or somebody else's teacher.
	const sections = Array.from({ length: classes }, (_, i) =>
		section(i + 1, isTeacher ? TEACHER : TEACHER)
	);
	const items = sections.flatMap((s) =>
		Array.from({ length: rows }, (_, n) =>
			item(
				s.id,
				n + 1,
				dueOffsets.length ? dueAtFor(dueOffsets[n % dueOffsets.length]) : undefined
			)
		)
	);

	/**
	 * ONE ROW PER ITEM, FOR EITHER ROLE, through the real ranking rules rather
	 * than by handing the feed pre-ranked entries:
	 *   - a student has no submission on an assignment due inside the window -> `due-soon`
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
		isAdmin: admin,
		foundryReviewPending: pending,
		harness: { role, classes, rows, admin, due: dueOffsets }
	};
};
