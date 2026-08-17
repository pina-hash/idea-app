/**
 * Fixture data for the two-pane harness. Deliberately small: this harness is
 * about the SHELL -- geometry, which pane is on screen, and what survives
 * opening an item -- not about the content components, which /dev/classroom
 * already drives at length.
 *
 * The two `loads` counters are the point of the file. They are module-level, so
 * they survive client-side navigation, and each load bumps its own -- which is
 * how "opening an item re-runs the item load and NOT the class load" becomes a
 * number you can read rather than a claim.
 */
import type { ClassroomItem, ClassroomSection, ClassroomUnit } from '$lib/classroom/classroom';
import type { ClassroomDeck } from '$lib/classroom/deck';
import type { ReferenceSpec } from '$lib/classroom/reference-spec';
import { SAMPLE_REFERENCE } from '$lib/classroom/dev-reference-fixture';

export const loads = { layout: 0, item: 0 };

export const SECTION: ClassroomSection = {
	id: 's-1',
	course_id: 'c-1',
	label: 'Period 2',
	block: 'B',
	teacher_email: 'vargas@boscotech.edu',
	active: true,
	course: { id: 'c-1', code: 'ENG1H', title: 'Engineering 1 Honors', active: true }
};

export const UNITS: ClassroomUnit[] = [
	{ id: 'u-1', course_id: 'c-1', name: 'Unit 1 · Sketching', sort_order: 1 },
	{ id: 'u-2', course_id: 'c-1', name: 'Unit 2 · Bridges', sort_order: 2 }
];

function daysFromNow(n: number): string {
	// A FIXED epoch, not Date.now(): a harness whose fixture drifts with the
	// clock produces measurements that cannot be compared across runs.
	return new Date(Date.UTC(2026, 7, 16) + n * 86400000).toISOString();
}

function item(
	over: Partial<ClassroomItem> & { id: string; kind: ClassroomItem['kind'] }
): ClassroomItem {
	return {
		title: null,
		body: '',
		body_doc: null,
		points: null,
		due_at: null,
		category: null,
		author_email: 'vargas@boscotech.edu',
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		first_published_at: daysFromNow(-3),
		edited_at: null,
		created_at: daysFromNow(-3),
		updated_at: daysFromNow(-3),
		links: [],
		attachments: [],
		postings: [{ section_id: 's-1' }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		...over
	};
}

/**
 * THE CROWDED CASE, so "the row fits its two lines" and "the inspector holds
 * everything" are measurements rather than assumptions.
 *
 * Every dimension that competes for the pane's width at once: a title far
 * longer than 26rem can show, a pin, a due date, points, a category, files,
 * links, an export failure's own chip -- plus, on the item page, a deck, a
 * reference document, instructor-only material and a revision history, which
 * between them are every block the inspector can hold.
 */
export const CROWDED_ID = 'i-crowded';

export const DECK: ClassroomDeck = {
	id: 'deck-1',
	item_id: CROWDED_ID,
	title: 'Truss geometry and load paths',
	entry_path: 'index.html',
	thumbnail_path: null,
	file_count: 31,
	total_bytes: 23_500_000,
	has_state_file: false,
	slides: [
		{ index: 0, label: 'Why triangles' },
		{ index: 1, label: 'Tension and compression' },
		{ index: 2, label: 'Joints' }
	]
};

export const REFERENCE: ReferenceSpec = SAMPLE_REFERENCE;

/**
 * Enough rows that the navigation pane genuinely overflows its own height at
 * 1440x900 -- otherwise "the panes scroll independently" is untestable, because
 * neither of them scrolls.
 */
export const ITEMS: ClassroomItem[] = [
	item({ id: 'i-1', kind: 'post', title: 'Welcome to the bridge unit', unit_id: 'u-1' }),
	item({
		id: CROWDED_ID,
		kind: 'assignment',
		title:
			'Truss bridge analysis and member sizing, with the full stackup written up in your notebook',
		unit_id: 'u-1',
		pinned: true,
		points: 40,
		category: 'Unit Labs',
		due_at: daysFromNow(4),
		body: 'Work through the member sizing for the span you sketched, then justify every choice.',
		links: [
			{ id: 'l-1', label: 'Truss reference', url: 'https://example.com/truss' },
			{ id: 'l-2', label: 'Load tables', url: 'https://example.com/loads' }
		],
		attachments: [
			{ id: 'a-1', filename: 'truss-worksheet.pdf', mime_type: 'application/pdf' },
			{ id: 'a-2', filename: 'span-photo.jpg', mime_type: 'image/jpeg' }
		],
		instructorLinks: [{ id: 'il-1', label: 'Answer key', url: 'https://example.com/key' }],
		instructorAttachments: [
			{ id: 'ia-1', filename: 'solutions.pdf', mime_type: 'application/pdf' }
		]
	}),
	item({
		id: 'i-2',
		kind: 'material',
		title: 'Course syllabus',
		unit_id: 'u-1',
		// A public material: the one item whose inspector strip carries the
		// public-link chip, and the one that reaches the reference importer.
		is_public: true,
		attachments: [{ id: 'a-3', filename: 'syllabus.pdf', mime_type: 'application/pdf' }]
	}),
	// The two remaining strip states, so "state rides the collapsed strip" is a
	// measurement rather than a claim about markup that never ran.
	item({ id: 'i-draft', kind: 'assignment', title: 'Load testing writeup', published: false, points: 25, unit_id: 'u-2' }),
	item({
		id: 'i-sched',
		kind: 'post',
		title: 'Field trip details',
		published: true,
		publish_at: daysFromNow(5),
		unit_id: 'u-2'
	}),
	...Array.from({ length: 14 }, (_, n) =>
		item({
			id: `i-${n + 3}`,
			kind: n % 3 === 0 ? 'assignment' : n % 3 === 1 ? 'post' : 'material',
			title: `Bridge sketch ${n + 1}`,
			points: n % 3 === 0 ? 20 : null,
			due_at: n % 3 === 0 ? daysFromNow(n) : null,
			unit_id: n < 7 ? 'u-1' : 'u-2',
			// Long ON PURPOSE: "the panes scroll independently" is untestable if
			// neither pane overflows, so both are given more than they can show.
			body:
				`Sketch the truss bridge from three views, then label every member.\n\n` +
				Array.from(
					{ length: 45 },
					(_, k) =>
						`Step ${k + 1}. Measure the span, mark the joint, cut to the line, then check it against the drawing before you glue anything.`
				).join('\n')
		})
	)
];

export function itemById(id: string): ClassroomItem | null {
	return ITEMS.find((i) => i.id === id) ?? null;
}
