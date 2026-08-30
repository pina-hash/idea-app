/**
 * Fixture + in-memory store for /dev/classroom's `class-bulk` views.
 *
 * ITS OWN STORE, NOT THE HARNESS'S SHARED ONE, and that is the whole point of
 * the file: the surface under test here is a class big enough that the bulk
 * actions and the unit grouping stop being optional, and folding twenty-plus
 * rows and a foreign co-posting into the arrays every other view in
 * /dev/classroom reads would change the People tab, the grading console, the
 * admin list, the composer's posting checklist and the route specs already
 * driving them. This one is reachable from two view ids and nothing else.
 *
 * The transports are the real interface, answering the real refusals -- a
 * SECURITY DEFINER RPC's job, mirrored: `setPublished` refuses an item posted
 * to a section this teacher does not manage, which is what makes "a partial
 * bulk failure leaves the failures selected" a measurement rather than a claim
 * about a code path nothing ever entered.
 */
import {
	UNFILED_GROUP_ID,
	type ClassroomComposerTransports,
	type ClassroomItem,
	type ClassroomSection,
	type ClassroomUnit,
	type ClassroomUnitTransports
} from '$lib/classroom/classroom';

const TEACHER = 't.vargas@boscotech.edu';
const FOREIGN = 'r.okonkwo@boscotech.edu';

/** A FIXED epoch, not `Date.now()`: a fixture that drifts with the clock
 *  produces measurements that cannot be compared between runs. */
function day(n: number): string {
	return new Date(Date.UTC(2026, 7, 16, 17) + n * 86400000).toISOString();
}

export const BULK_SECTION: ClassroomSection = {
	id: 's-b',
	course_id: 'c-b',
	label: 'Period 3',
	block: 'Block B',
	teacher_email: TEACHER,
	active: true,
	course: { id: 'c-b', code: 'IDEA209H', title: 'Engineering Design', active: true }
};

/** The other section the crowded draft is co-posted to. Owned by somebody
 *  else, which is the whole reason it exists. */
export const FOREIGN_SECTION: ClassroomSection = {
	id: 's-b9',
	course_id: 'c-b',
	label: 'Period 9',
	block: null,
	teacher_email: FOREIGN,
	active: true,
	course: { id: 'c-b', code: 'IDEA209H', title: 'Engineering Design', active: true }
};

/** THREE, and the third is EMPTY: a manager sees an empty unit (it is a
 *  filing target and has to be visible to be one) and a student does not. */
export const BULK_UNITS: ClassroomUnit[] = [
	{ id: 'ub-1', course_id: 'c-b', name: 'Unit 1 · Sketching and orthographic views', sort_order: 1 },
	{ id: 'ub-2', course_id: 'c-b', name: 'Unit 2 · Bridges', sort_order: 2 },
	{ id: 'ub-3', course_id: 'c-b', name: 'Rotation 1 · Shop induction', sort_order: 3 }
];

/** The row every width measurement in this harness is about. */
export const CROWDED_ID = 'ib-crowded';
/** Co-posted to Period 9, so a bulk publish over it is REFUSED. */
export const REFUSED_ID = CROWDED_ID;

function item(over: Partial<ClassroomItem> & { id: string; kind: ClassroomItem['kind'] }): ClassroomItem {
	return {
		title: null,
		body: '',
		body_doc: null,
		points: null,
		due_at: null,
		category: null,
		author_email: TEACHER,
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		first_published_at: day(-30),
		edited_at: null,
		created_at: day(-30),
		updated_at: day(-30),
		links: [],
		attachments: [],
		postings: [{ section_id: 's-b' }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		...over
	};
}

/**
 * TWENTY-TWO ROWS IN ONE UNIT, plus a second unit, an empty third, and three
 * unfiled. Twenty-two rather than "a few" because the defect this harness is
 * for is that selecting a unit is thirty clicks -- an assertion about
 * select-all that ran over three rows would pass on a control that only
 * happened to reach the three it could see.
 */
export const BULK_ITEMS: ClassroomItem[] = [
	item({
		id: CROWDED_ID,
		kind: 'assignment',
		// EVERY DIMENSION COMPETING FOR THE ROW AT ONCE: a name far longer than
		// the 356px column, a pin, a draft chip, an updated chip, points, a due
		// date, a category, two files and two links.
		title:
			'Truss bridge analysis and member sizing, with the full load stackup written up in your engineering notebook before Friday',
		unit_id: 'ub-1',
		pinned: true,
		published: false,
		points: 40,
		category: 'Unit Labs',
		due_at: day(4),
		edited_at: day(-1),
		body: 'Work through the member sizing for the span you sketched, then justify every choice.',
		links: [
			{ id: 'lb-1', label: 'Truss reference', url: 'https://example.com/truss' },
			{ id: 'lb-2', label: 'Load tables', url: 'https://example.com/loads' }
		],
		attachments: [
			{ id: 'ab-1', filename: 'truss-worksheet.pdf', mime_type: 'application/pdf' },
			{ id: 'ab-2', filename: 'span-photo.jpg', mime_type: 'image/jpeg' }
		],
		// The refusal's cause, and it is a real one: this teacher does not manage
		// Period 9, so the RPC will not let them publish it.
		postings: [{ section_id: 's-b' }, { section_id: 's-b9' }]
	}),
	item({ id: 'ib-note', kind: 'post', title: 'Bring your notebook every day this week', unit_id: 'ub-1' }),
	...Array.from({ length: 20 }, (_, n) =>
		item({
			id: `ib-u1-${n + 1}`,
			kind: n % 3 === 0 ? 'assignment' : n % 3 === 1 ? 'post' : 'material',
			title: `Sketch set ${n + 1}: isometric to third-angle`,
			unit_id: 'ub-1',
			published: n % 7 !== 3,
			points: n % 3 === 0 ? 20 : null,
			due_at: n % 3 === 0 ? day(n - 10) : null,
			body: `Third-angle projection practice, sheet ${n + 1}.`
		})
	),
	...Array.from({ length: 4 }, (_, n) =>
		item({
			id: `ib-u2-${n + 1}`,
			kind: n % 2 === 0 ? 'material' : 'assignment',
			title: `Bridge build log, session ${n + 1}`,
			unit_id: 'ub-2',
			points: n % 2 === 1 ? 15 : null
		})
	),
	item({ id: 'ib-free-1', kind: 'post', title: 'Welcome to Engineering Design' }),
	item({ id: 'ib-free-2', kind: 'material', title: 'Course syllabus', is_public: true }),
	item({ id: 'ib-free-3', kind: 'assignment', title: 'Safety quiz', points: 10, due_at: day(-20) })
];

function refusal(message: string) {
	return { ok: false as const, message };
}

/**
 * The store. Plain `$state` in a `.svelte.ts` module so both views and the
 * transports read one array -- there are no effects here, which is what keeps
 * it outside the injected-callback rule entirely.
 */
export function createBulkStore(log: (line: string) => void) {
	let items = $state<ClassroomItem[]>(BULK_ITEMS.map((i) => ({ ...i })));
	let units = $state<ClassroomUnit[]>(BULK_UNITS.map((u) => ({ ...u })));

	const managed = new Set([BULK_SECTION.id]);
	function manages(i: ClassroomItem): boolean {
		return i.postings.every((p) => managed.has(p.section_id));
	}
	function patch(id: string, over: Partial<ClassroomItem>) {
		items = items.map((i) => (i.id === id ? { ...i, ...over } : i));
	}
	function unsupported(name: string) {
		log(`${name} (not wired in this view)`);
		return refusal('That is not wired up in this harness view.');
	}

	const transports: ClassroomComposerTransports = {
		async createItem() {
			return unsupported('createItem');
		},
		async updateItem() {
			return unsupported('updateItem');
		},
		async deleteItem(id) {
			log(`deleteItem ${id}`);
			const current = items.find((i) => i.id === id);
			if (!current) return refusal('That item does not exist.');
			if (!manages(current)) {
				return refusal(
					'Only the teacher of record for every class this is posted to can change it.'
				);
			}
			items = items.filter((i) => i.id !== id);
			return { ok: true, data: undefined };
		},
		async duplicateItem() {
			return unsupported('duplicateItem');
		},
		async addPostings() {
			return unsupported('addPostings');
		},
		async removePosting() {
			return unsupported('removePosting');
		},
		async setPublished(itemId, published) {
			log(`setPublished ${itemId} ${published}`);
			const current = items.find((i) => i.id === itemId);
			if (!current) return refusal('That item does not exist.');
			// THE REAL REFUSAL, not a flag: this teacher does not manage Period 9,
			// and the crowded draft is posted there too.
			if (!manages(current)) {
				return refusal(
					'Only the teacher of record for every class this is posted to can change it.'
				);
			}
			patch(itemId, { published, updated_at: day(0) });
			return { ok: true, data: undefined };
		},
		async setPinned(itemId, pinned) {
			log(`setPinned ${itemId} ${pinned}`);
			patch(itemId, { pinned });
			return { ok: true, data: undefined };
		},
		async setOrder(itemIds) {
			log(`setOrder ${itemIds.length} ids`);
			itemIds.forEach((id, index) => patch(id, { sort_order: index + 1 }));
			return { ok: true, data: undefined };
		},
		async uploadAttachment() {
			return unsupported('uploadAttachment');
		},
		async deleteAttachment() {
			return unsupported('deleteAttachment');
		},
		async uploadInstructorAttachment() {
			return unsupported('uploadInstructorAttachment');
		},
		async deleteInstructorAttachment() {
			return unsupported('deleteInstructorAttachment');
		},
		async setInstructorResources() {
			return unsupported('setInstructorResources');
		},
		async markViewed(itemId) {
			log(`markViewed ${itemId}`);
			patch(itemId, { viewed_at: day(0) });
			return { ok: true, data: undefined };
		}
	};

	const unitTransports: ClassroomUnitTransports = {
		async upsertUnit(courseId, name, id = null) {
			log(`upsertUnit ${name}`);
			const clash = units.find(
				(u) => u.course_id === courseId && u.name.toLowerCase() === name.toLowerCase() && u.id !== id
			);
			if (clash) return { ok: true, data: { unitId: null, created: false, duplicate: true } };
			if (id) {
				units = units.map((u) => (u.id === id ? { ...u, name } : u));
				return { ok: true, data: { unitId: id, created: false, duplicate: false } };
			}
			const next = Math.max(0, ...units.map((u) => u.sort_order)) + 1;
			const unitId = `ub-new-${next}`;
			units = [...units, { id: unitId, course_id: courseId, name, sort_order: next }];
			return { ok: true, data: { unitId, created: true, duplicate: false } };
		},
		async deleteUnit(id) {
			log(`deleteUnit ${id}`);
			const unfiled = items.filter((i) => i.unit_id === id).length;
			items = items.map((i) => (i.unit_id === id ? { ...i, unit_id: null } : i));
			units = units.filter((u) => u.id !== id);
			return { ok: true, data: { unfiled } };
		},
		async setUnitOrder(courseId, unitIds) {
			log(`setUnitOrder ${unitIds.length}`);
			units = units.map((u) => {
				const at = unitIds.indexOf(u.id);
				return at < 0 ? u : { ...u, sort_order: at + 1 };
			});
			return { ok: true, data: undefined };
		},
		async setItemUnit(itemId, unitId) {
			log(`setItemUnit ${itemId} -> ${unitId ?? UNFILED_GROUP_ID}`);
			const current = items.find((i) => i.id === itemId);
			if (!current) return refusal('That item does not exist.');
			if (unitId && !units.some((u) => u.id === unitId)) {
				return { ok: true, data: { ok: false, reason: 'wrong_course' } };
			}
			patch(itemId, { unit_id: unitId });
			return { ok: true, data: { ok: true } };
		},
		async reloadUnits() {
			return { ok: true, data: units.map((u) => ({ ...u })) };
		}
	};

	return {
		get items() {
			return items;
		},
		get units() {
			return units;
		},
		transports,
		unitTransports,
		reset() {
			items = BULK_ITEMS.map((i) => ({ ...i }));
			units = BULK_UNITS.map((u) => ({ ...u }));
		}
	};
}
