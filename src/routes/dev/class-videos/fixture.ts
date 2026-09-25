/**
 * Fixture for /dev/class-videos (ledger 0298, R08).
 *
 * ONE CLASS, TWO UNITS, AND A YOUTUBE LINK IN EVERY PLACE A TEACHER WRITES ONE,
 * each with the reading it must produce on the Videos section:
 *   - a link that ENDS a sentence in a material's body ("Reading a dial
 *     caliper"), which keeps its words as the card's title;
 *   - a bare pasted address in a list item ("Watch on YouTube", because a URL
 *     is no title);
 *   - a link in the MIDDLE of a sentence in an assignment, at a timestamp,
 *     which the body renderer leaves as a link and the index still lists;
 *   - the calipers video AGAIN, in an announcement's Links list: one card, and
 *     the announcement under "Also in". The announcement is FIRST in the
 *     array and in no unit, so it comes AFTER the material on the page -- the
 *     card must follow the page's order, not the array's;
 *   - a non-YouTube page whose query carries an 11-character `v=`, a Vimeo
 *     link, and a YouTube CHANNEL page (no video): none of them is a card;
 *   - an item with no link at all.
 *
 * AS THE TEACHER (`manage`), two more items are loaded, as a manager's read
 * loads them: a DRAFT with its own video, which is held back and counted, and
 * an item whose INSTRUCTOR-ONLY links carry a video, which is never listed.
 *
 * The video ids are made up (eleven legal characters each). The harness
 * blocks every non-loopback request, so no still loads here either way.
 */
import type { ClassroomItem, ClassroomSection, ClassroomUnit } from '$lib/classroom/classroom';

export const CLOCK = { now: '2026-09-25T17:00:00.000Z', today: '2026-09-25' };
export const BASE = '/dev/class-videos';
export const TEACHER = 'pina@boscotech.edu';

export const SECTION: ClassroomSection = {
	id: 's-videos',
	course_id: 'c-idea',
	label: 'Period 2',
	block: 'B',
	teacher_email: TEACHER,
	active: true,
	course: { id: 'c-idea', code: 'IDEA100', title: 'Introduction to Engineering Design', active: true }
};

export const UNITS: ClassroomUnit[] = [
	{ id: 'u-measure', course_id: 'c-idea', name: 'Measurement', sort_order: 1 },
	{ id: 'u-gears', course_id: 'c-idea', name: 'Gears', sort_order: 2 }
];

export const VIDEO = {
	caliper: 'Cal1perDial',
	zeroing: 'Zero1ngStep',
	gears: 'GearRat1o42',
	draft: 'Bear1ngsNxt',
	answerKey: 'AnswerKey01'
} as const;

function item(id: string, title: string, over: Partial<ClassroomItem> = {}): ClassroomItem {
	return {
		id,
		kind: 'material',
		title,
		body: '',
		body_doc: null,
		points: null,
		due_at: null,
		category: null,
		author_email: TEACHER,
		author_name: 'A. Pina',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		first_published_at: '2026-09-20T15:00:00.000Z',
		edited_at: null,
		created_at: '2026-09-20T15:00:00.000Z',
		updated_at: '2026-09-20T15:00:00.000Z',
		links: [],
		attachments: [],
		postings: [{ section_id: 's-videos' }],
		viewed_at: null,
		...over
	} as ClassroomItem;
}

/** The class as a student's read carries it. */
export const STUDENT_ITEMS: ClassroomItem[] = [
	item('post-reminder', 'Reminder: the caliper video', {
		kind: 'post',
		body: 'Watch the caliper video before Monday.',
		body_doc: [{ type: 'p', runs: [{ text: 'Watch the caliper video before Monday.' }] }],
		links: [{ label: 'Caliper video again', url: `https://youtu.be/${VIDEO.caliper}` }],
		created_at: '2026-09-24T15:00:00.000Z'
	}),
	item('mat-calipers', 'Day 3: calipers', {
		unit_id: 'u-measure',
		body: 'Watch before class: Reading a dial caliper',
		body_doc: [
			{
				type: 'p',
				runs: [
					{ text: 'Watch before class: ' },
					{ text: 'Reading a dial caliper', href: `https://www.youtube.com/watch?v=${VIDEO.caliper}` }
				]
			},
			{
				type: 'ul',
				items: [
					[
						{ text: 'Zeroing it first: ' },
						{ text: `https://youtu.be/${VIDEO.zeroing}`, href: `https://youtu.be/${VIDEO.zeroing}` }
					],
					[{ text: 'Measure the three blocks on your bench.' }]
				]
			}
		]
	}),
	item('mat-safety', 'Shop safety rules', {
		unit_id: 'u-measure',
		sort_order: 1,
		body: 'Eye protection on at every bench.',
		body_doc: [{ type: 'p', runs: [{ text: 'Eye protection on at every bench.' }] }]
	}),
	item('as-gears', 'Gear ratio worksheet', {
		kind: 'assignment',
		unit_id: 'u-gears',
		points: 10,
		due_at: '2026-10-02T06:59:00.000Z',
		body: 'If you get stuck, this gear video covers the ratio step. Reference: the gear table.',
		body_doc: [
			{
				type: 'p',
				runs: [
					{ text: 'If you get stuck, ' },
					{ text: 'this gear video', href: `https://www.youtube.com/watch?v=${VIDEO.gears}&t=42s` },
					{ text: ' covers the ratio step.' }
				]
			},
			{
				type: 'p',
				runs: [
					{ text: 'Reference: ' },
					{ text: 'the gear table', href: 'https://example.com/watch?v=GearTable01' }
				]
			}
		]
	}),
	item('mat-tour', 'Shop tour', {
		unit_id: 'u-gears',
		sort_order: 1,
		body: 'More from the channel.',
		body_doc: [
			{
				type: 'p',
				runs: [
					{ text: 'More from ' },
					{ text: 'the channel', href: 'https://www.youtube.com/@ideabosco' },
					{ text: '.' }
				]
			}
		],
		links: [{ label: 'Tour on Vimeo', url: 'https://vimeo.com/76979871' }]
	})
];

/** What a manager's read adds: a draft, and an item carrying instructor-only links. */
export const MANAGER_EXTRA: ClassroomItem[] = [
	item('as-bearings-draft', 'Next week: bearings', {
		kind: 'assignment',
		unit_id: 'u-gears',
		sort_order: 2,
		published: false,
		first_published_at: null,
		body: 'Bearing video',
		body_doc: [
			{ type: 'p', runs: [{ text: 'Bearing video', href: `https://www.youtube.com/watch?v=${VIDEO.draft}` }] }
		]
	}),
	item('mat-key', 'Caliper quiz', {
		unit_id: 'u-measure',
		sort_order: 2,
		body: 'Five readings.',
		body_doc: [{ type: 'p', runs: [{ text: 'Five readings.' }] }],
		instructorLinks: [{ label: 'Answer key walkthrough', url: `https://www.youtube.com/watch?v=${VIDEO.answerKey}` }],
		instructorAttachments: []
	})
];

/** A class with links and no video anywhere: the Videos section must not exist. */
export const NO_VIDEO_ITEMS: ClassroomItem[] = STUDENT_ITEMS.filter((i) => i.id === 'mat-safety' || i.id === 'mat-tour');
