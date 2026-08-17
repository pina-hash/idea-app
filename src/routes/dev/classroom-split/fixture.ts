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
 * Enough rows that the navigation pane genuinely overflows its own height at
 * 1440x900 -- otherwise "the panes scroll independently" is untestable, because
 * neither of them scrolls.
 */
export const ITEMS: ClassroomItem[] = [
	item({ id: 'i-1', kind: 'post', title: 'Welcome to the bridge unit', unit_id: 'u-1' }),
	item({ id: 'i-2', kind: 'material', title: 'Course syllabus', unit_id: 'u-1' }),
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
