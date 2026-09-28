import type { ClassroomItem, ClassroomSection, ClassroomUnit } from '$lib/classroom/classroom';
import type { SubmissionRow } from '$lib/classroom/assignment-spec';

/**
 * THE SAMPLE CLASS BOTH PLATE VIEWS RENDER (ledgers 0341 and 0344). One copy,
 * so round 2's view and round 3's cannot show two different classes and be
 * compared as if they showed one. Plain data: no component reads a clock.
 */

/** Three classes, so the header's class strip has something to shape. */
export const SECTIONS: ClassroomSection[] = [
	{
		id: 's-1',
		course_id: 'c-1',
		label: 'Period 1',
		block: 'P1',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	},
	{
		id: 's-2',
		course_id: 'c-2',
		label: 'Period 3',
		block: 'P3',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'c-2', code: 'IDEA100', title: 'Introduction to Design', active: true }
	},
	{
		id: 's-3',
		course_id: 'c-3',
		label: 'Period 5',
		block: 'P5',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'c-3', code: 'IDEA310', title: 'Engineering Design Studio', active: true }
	}
];

/** A fixed epoch, as the stream harness uses: a row whose date drifts is a
 *  measurement that cannot be compared across runs. */
const at = (n: number) => new Date(Date.UTC(2026, 8, 21) + n * 86400000).toISOString();

export const UNITS: ClassroomUnit[] = [{ id: 'u-3', course_id: 'c-1', name: 'Unit 3 · Materials and testing', sort_order: 3 }];

const TITLES: [ClassroomItem['kind'], string][] = [
	['material', 'Reading: how brackets fail'],
	['assignment', 'Bracket redesign, test report'],
	['assignment', 'Load test data sheet'],
	['post', 'Bring safety glasses on Thursday'],
	['assignment', 'Sketch two alternative supports']
];

export const ITEMS: ClassroomItem[] = TITLES.map(([kind, title], i) => ({
	id: `i-${i + 1}`,
	kind,
	title,
	body: '',
	body_doc: null,
	points: kind === 'assignment' ? 20 : null,
	due_at: kind === 'assignment' ? at(i + 2) : null,
	category: null,
	author_email: 'teacher@boscotech.edu',
	author_name: 'T. Vargas',
	published: true,
	pinned: false,
	unit_id: 'u-3',
	sort_order: i,
	first_published_at: at(-3),
	edited_at: null,
	created_at: at(-3),
	updated_at: at(-3),
	links: [],
	attachments: [],
	postings: [{ section_id: 's-1' }],
	viewed_at: null,
	instructorAttachments: [],
	instructorLinks: []
}));

export const RETURNED: SubmissionRow = {
	id: 'sub-1',
	item_id: 'i-2',
	student_email: 'alice@boscotech.net',
	state: 'returned',
	submitted_at: at(-1),
	returned_at: at(0),
	rubric_scores: null,
	criterion_comments: null,
	score: 18,
	teacher_comment: 'Good photographs of the break. Say why the crack started at the bolt hole.',
	graded_by: 'teacher@boscotech.edu',
	graded_at: at(0)
};

/** The three cards of the composed region: the same card markup as the card
 *  specimen, three times, so the page is judged on real repetition. */
export const CARDS = [
	{ label: 'UNIT 3 · DUE FRI 3:00 PM', title: 'Bracket redesign, test report', body: 'Load the printed bracket until it fails and explain why it broke where it did.', chip: 'Assignment' },
	{ label: 'UNIT 3 · DUE MON 8:00 AM', title: 'Load test data sheet', body: 'Record each load step and the deflection you measured at the tip.', chip: 'Assignment' },
	{ label: 'UNIT 3 · MATERIAL', title: 'Reading: how brackets fail', body: 'Three short case studies. Read before Thursday.', chip: 'Material' }
];
export type PlateCard = (typeof CARDS)[number];

/* THE REGION'S WEEK, round 3 (ledger 0344): two rows of three, so the
   recessed column is full rather than a third empty. The first three are
   CARDS, in order; round 2's view keeps its three. */
export const REGION_CARDS: PlateCard[] = [
	...CARDS,
	{ label: 'UNIT 3 · DUE WED 3:00 PM', title: 'Gusset sketch', body: 'Sketch a gusset that moves the failure away from the bolt hole.', chip: 'Assignment' },
	{ label: 'UNIT 3 · MATERIAL', title: 'Video: reading a load curve', body: 'Six minutes. Pause where the line stops being straight.', chip: 'Material' },
	{ label: 'UNIT 3 · DUE THU 8:00 AM', title: 'Peer check', body: 'Swap data sheets with your partner and mark one reading you doubt.', chip: 'Assignment' }
];
