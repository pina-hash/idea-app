/**
 * A WHOLE CLASS FOR `/dev/class-header?view=class&items=class` (ledger 0396,
 * part 7): the class page Mr. Pina screenshotted on 2026-10-16 (IDEA209H,
 * Section 1, Block 2), close enough that the space between the banner and
 * the first unit is measured over the page he was looking at.
 *
 * What makes it that page: three units and the unfiled group, one unit folded
 * (Documents and references), twenty-one items a teacher can select in the
 * open groups, and seven YouTube videos posted across them, so the toolbar
 * under the banner holds the search, the kind filter, the Videos key and
 * Select all at once. One draft gives a teacher the Drafts chip as well, the
 * widest a teacher's toolbar gets before anything is ticked (`withDraft`; the
 * harness's `?drafts=0` leaves it out, which is the toolbar in his screenshot).
 *
 * The video ids are made up (eleven legal characters each); the harness
 * blocks every request off loopback, so no still loads either way.
 */
import type { ClassroomItem, ClassroomSection, ClassroomUnit } from '$lib/classroom/classroom';

const DAY = 86_400_000;

export const CLASS_FIXTURE_FOLDED = ['u-docs'];

export function classFixture(section: ClassroomSection, now: number, withDraft: boolean, withVideos = true) {
	const courseId = section.course_id;
	const units: ClassroomUnit[] = [
		{ id: 'u-3', course_id: courseId, name: 'Unit 3', sort_order: 1 },
		{ id: 'u-1', course_id: courseId, name: 'Unit 1', sort_order: 2 },
		{ id: 'u-docs', course_id: courseId, name: 'Documents and references', sort_order: 3 },
		{ id: 'u-2', course_id: courseId, name: 'Unit 2', sort_order: 4 }
	];
	const iso = (ms: number) => new Date(ms).toISOString();
	let order = 0;
	const item = (
		id: string,
		title: string,
		unit: string | null,
		over: Partial<ClassroomItem> = {}
	): ClassroomItem => ({
		id,
		kind: 'assignment',
		title,
		body: '',
		body_doc: null,
		points: 25,
		due_at: iso(now + 3 * DAY),
		category: 'Unit assignments',
		author_email: section.teacher_email,
		author_name: 'Mr. Pina',
		published: true,
		pinned: false,
		unit_id: unit,
		sort_order: order++,
		first_published_at: iso(now - 20 * DAY),
		edited_at: null,
		created_at: iso(now - 20 * DAY),
		updated_at: iso(now - 20 * DAY),
		links: [],
		attachments: [],
		postings: [{ section_id: section.id }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		...over
	});
	/* `withVideos: false` (the harness's `?videos=0`) posts the same links to
	   a page that is not YouTube, so the class has no video and no Videos key:
	   the toolbar most classes have (review round 4). */
	const video = (label: string, id: string) => ({
		label,
		url: withVideos ? `https://www.youtube.com/watch?v=${id}` : `https://example.org/notes/${id}`
	});
	const material = { kind: 'material' as const, points: null, due_at: null, category: null };

	const items: ClassroomItem[] = [
		item('a-build-log', 'Shop Fix: Build Log', 'u-3', { due_at: iso(now - DAY), category: 'Engineering documentation' }),
		item('a-design', 'Shop Fix: Design', 'u-3', { points: 50, links: [video('Design review walkthrough', 'DesignRev01')] }),
		item('a-presentation', 'Shop Fix: Presentation', 'u-3', { points: 50, due_at: iso(now + 5 * DAY) }),
		item('a-fit-lab', 'Shop Fix: Fit Lab', 'u-3', { points: 50, due_at: iso(now + 5 * DAY), category: 'Unit labs' }),
		item('a-u1-final', 'Unit 1 Final: Report, Presentation, and Reflection', 'u-1', { due_at: iso(now - 40 * DAY) }),
		item('a-cp2', 'Unit 1 Assignment: Checkpoint 2, Forces on a Truss', 'u-1', {
			points: 30,
			due_at: iso(now - 44 * DAY),
			links: [video('Method of joints', 'JointsMeth1')]
		}),
		item('a-cp1', 'Unit 1 Assignment: Checkpoint 1, Forces and Moments', 'u-1', {
			points: 45,
			due_at: iso(now - 47 * DAY),
			links: [video('Free body diagrams', 'FreeBodyDg1')]
		}),
		item('m-loading', 'Unit 1 Assignment: Loading Scenario', 'u-1', { ...material }),
		item('m-fasteners', 'Fasteners and Hardware', 'u-1', { ...material, links: [video('Thread callouts', 'ThreadCall1')] }),
		item('a-u1-lab', 'Unit 1 Lab, Final: Conclusion and Materials', 'u-1', { due_at: iso(now - 49 * DAY) }),
		item('m-calipers', 'Reading a Dial Caliper', 'u-1', { ...material, links: [video('Reading a dial caliper', 'Cal1perDial')] }),
		item('p-shop', 'Shop is closed Friday for the fire drill', 'u-1', { kind: 'post', points: null, due_at: null, category: null }),
		item('m-syllabus', 'Course syllabus', 'u-docs', { ...material }),
		item('m-safety', 'Shop safety contract', 'u-docs', { ...material }),
		item('a-trophy', 'Shop Trophy: Portfolio Presentation', 'u-2', { due_at: iso(now - 22 * DAY) }),
		item('a-trophy-cad', 'Shop Trophy: CAD Model', 'u-2', { points: 40, due_at: iso(now - 24 * DAY), links: [video('Revolve and sweep', 'RevolveSwp1')] }),
		item('m-trophy-pack', 'Shop Trophy: Reference Pack', 'u-2', { ...material }),
		item('a-trophy-sketch', 'Shop Trophy: Sketches', 'u-2', { points: 20, due_at: iso(now - 28 * DAY) }),
		item('m-trophy', 'The Shop Trophy', null, { ...material, links: [video('Last year’s trophies', 'TrophyReel1')] }),
		item('m-mascot', 'IDEA Mascot Pack', null, { ...material }),
		item('m-ai-levels', 'AI Levels: Live Verification, Notebook', null, { ...material }),
		item('m-glossary', 'Engineering glossary', null, { ...material })
	];
	/* A manager's read carries drafts; a student's never does. */
	if (withDraft) {
		items.push(item('a-next-draft', 'Unit 4: Gear train worksheet', 'u-3', { published: false, first_published_at: null }));
	}
	return { units, items };
}
