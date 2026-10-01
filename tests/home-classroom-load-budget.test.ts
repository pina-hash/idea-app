// tests/home-classroom-load-budget.test.ts
//
// WHAT THE HOME PAGE AND /classroom ASK THE DATABASE FOR, COUNTED (ledger 0360,
// report R08: "hella slow, cant open classroom", filed during the 2026-09-29
// outage).
//
// The outage itself was a saturated database, which ledger 0357's polling cut
// and the instance resize address. This file pins three AMPLIFIERS on the
// home-to-classroom path that made a saturated database worse, each of which
// is invisible on screen -- the page renders identically either way, only the
// load moves -- so each is a test rather than a harness drive:
//
//   1. EVERY STUDENT'S HOME LOAD RAN `classroom_section_roster(null)`, which
//      evaluates a definer manage check for every enrollment row in the school
//      and always answers nothing for a student. It now runs only when the
//      caller manages one of the classes the feed lists (`sectionManagedBy`,
//      which is 0138's `_classroom_manages_section_email` without the round
//      trip). The TEACHER is the positive control: their call still happens
//      and their own hand-in is still kept out of their to-grade tally.
//   2. EVERY ITEM BODY SHIPPED TO THE BROWSER, every paragraph of every item in
//      every class, when the only reader on the owed-work surfaces is
//      `feedCover`, which reads the first image. `slimOwedWorkItem` keeps that
//      image and nothing else, and the feed and the to-do come out identical.
//   3. /classroom READ `classroom_sections` TWICE, byte-identically: once in
//      its layout (the switcher) and once in its page (My Classes). The page
//      now takes the layout's list.
//
// HOW. The REAL loads, imported from their own files, called the way SvelteKit
// calls them, against a REAL Postgres carrying the REAL migration chain,
// through the PostgREST shim wrapped in a Proxy that writes down every
// `from:<table>` and `rpc:<name>` it is asked for. The per-load totals are
// printed (console.info) for the history entry and are not pinned: a ladder
// rung or a new feature legitimately moves them.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { buildFeed, feedCover, type FeedSubmission, type SectionFeed } from '../src/lib/classroom/feed';
import { buildTodo } from '../src/lib/classroom/todo';
import { loadClassroomWork, type ClassroomWork } from '../src/lib/classroom/student-work';
import type { ClassroomItem, ClassroomSection } from '../src/lib/classroom/classroom';
import type { ClassCheckIn } from '../src/lib/classroom/class-check-ins';
import { slimOwedWorkItem } from '../src/lib/classroom/owed-work-slim';
import { load as homeLoad } from '../src/routes/+page.server';
import { load as classroomLayoutLoad } from '../src/routes/classroom/+layout.server';
import { load as classroomPageLoad } from '../src/routes/classroom/+page.server';
import { load as todoLoad } from '../src/routes/classroom/todo/+page.server';

/**
 * The home-feed chain (`tests/classroom-feed-false-counts.test.ts`, 0138
 * included) widened with what the item read's wide rungs need -- 0108's rich
 * body, 0109's schedule, 0111's units, 0176's images and 0193's layout -- so
 * `selectItemsWithDoc` answers on its WIDEST rung, the production shape, and
 * the counts below are not inflated by ladder retries. 0137 goes last, as it
 * does in every chain.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0091_notebook_pin_and_activity.sql',
	'0092_classroom_reference_specs.sql',
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql',
	'0098_notebook_session_postings.sql',
	'0101_classroom_decks.sql',
	'0104_classroom_edit_visibility.sql',
	'0106_notebook_instructor_student_access.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0111_classroom_units.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0120_notebook_session_item_link.sql',
	'0121_notebook_review_acknowledged.sql',
	'0122_rich_text_nested_lists.sql',
	'0128_classroom_instructor_copy.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql',
	'0138_classroom_manager_exclusion_and_enrollment_removal.sql',
	'0159_classroom_duplicate_carries_the_spec.sql',
	'0176_classroom_item_images.sql',
	'0193_classroom_resource_layout.sql',
	'0137_anon_execute_sweep.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let teacher: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
let section: string;
const itemIds: Record<string, string> = {};

/** A long paragraph, so the payload a body costs is a real number. */
const PARA = (n: number) =>
	`Paragraph ${n}. Sketch the part in three views, dimension every feature you cut, and ` +
	`record the measured value beside the drawn one. Bring the notebook to the bench and ` +
	`photograph the finished piece in good light before you hand it in.`;
const paras = (k: number) =>
	Array.from({ length: k }, (_, i) => ({ type: 'p', runs: [{ text: PARA(i + 1) }] }));

/** Five bodies, one per way a cover can come out. */
const BODIES: Record<string, unknown[] | null> = {
	imageFirst: [{ type: 'img', src: '/IDEA/icon-192.png', alt: 'The bearing, exploded' }, ...paras(6)],
	imageLater: [...paras(4), { type: 'img', src: '/IDEA/icon-512.png', alt: 'The finished bracket' }, ...paras(2)],
	noImage: paras(8),
	svgImage: [{ type: 'img', src: '/IDEA/diagram.svg', alt: 'A vector diagram' }, ...paras(3)],
	noBodyDoc: null
};

async function rpc<T = Record<string, unknown>>(userId: string, call: string, params: unknown[]): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

/** The shim, wrapped so every request it is asked for is written down. */
function countedClient(user: SeededUser) {
	const calls: string[] = [];
	const inner = createPostgrestShim(db, fks, user.id);
	const client = {
		from(table: string) {
			calls.push(`from:${table}`);
			return inner.from(table);
		},
		rpc(name: string, args?: Record<string, unknown>) {
			calls.push(`rpc:${name}`);
			return inner.rpc(name, args);
		}
	};
	return { client, calls };
}

const claimsOf = (u: SeededUser) => ({ sub: u.id, email: u.email, role: 'authenticated' });
const count = (calls: string[], key: string) => calls.filter((c) => c === key).length;

interface HomeData {
	classroomReady: boolean;
	feedSections: ClassroomSection[];
	feedItems: ClassroomItem[];
	feedSubmissions: FeedSubmission[];
	feedCheckIns: ClassCheckIn[];
	feedManagerEmails: Record<string, string[]>;
	feedClock: ClassroomWork['clock'] | null;
}

async function runHome(user: SeededUser, isAdmin = false) {
	const { client, calls } = countedClient(user);
	const data = await (homeLoad as unknown as (e: unknown) => Promise<HomeData>)({
		locals: { supabase: client, claims: claimsOf(user) },
		parent: async () => ({ isAdmin })
	});
	return { data, calls };
}

/** The /classroom LAYOUT then its PAGE, the page's `parent()` answering with the layout's data over the root's. */
async function runClassroomIndex(user: SeededUser, isAdmin = false) {
	const layoutCalls = countedClient(user);
	const layout = await (classroomLayoutLoad as unknown as (e: unknown) => Promise<Record<string, unknown>>)({
		locals: { supabase: layoutCalls.client, claims: claimsOf(user) },
		depends: () => {}
	});
	const pageCalls = countedClient(user);
	const page = await (classroomPageLoad as unknown as (e: unknown) => Promise<Record<string, unknown>>)({
		locals: { supabase: pageCalls.client, claims: claimsOf(user) },
		parent: async () => ({ isAdmin, ...layout })
	});
	return { layout, page, layoutCalls: layoutCalls.calls, pageCalls: pageCalls.calls };
}

async function runTodo(user: SeededUser, isAdmin = false) {
	const { client, calls } = countedClient(user);
	const data = await (todoLoad as unknown as (e: unknown) => Promise<{ todo: ClassroomWork }>)({
		locals: { supabase: client, claims: claimsOf(user) },
		parent: async () => ({ isAdmin })
	});
	return { data, calls };
}

/** The unslimmed owed-work read, exactly as the loads make it. */
function fullWork(user: SeededUser, isAdmin = false): Promise<ClassroomWork> {
	return loadClassroomWork(createPostgrestShim(db, fks, user.id) as never, {
		userId: user.id,
		email: user.email,
		isAdmin,
		checkIns: true
	});
}

/** A feed with each item replaced by what a card can show of it: its id and its cover. */
function feedShape(feeds: SectionFeed[]) {
	return JSON.parse(
		JSON.stringify(feeds, (key, value) =>
			value && typeof value === 'object' && 'postings' in value && 'kind' in value && 'title' in value
				? { id: (value as ClassroomItem).id, title: (value as ClassroomItem).title, cover: feedCover(value as ClassroomItem) }
				: value
		)
	);
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	fks = await loadForeignKeys(db);

	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Okafor');

	section = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'IDEA100',
		courseTitle: 'Introduction to Engineering Design',
		label: 'Period 1',
		teacherEmail: teacher.email
	});
	for (const s of [alice, bruno]) {
		await enrollStudent(db, { as: teacher, sectionId: section, email: s.email, displayName: s.email });
	}
	// THE MANAGER ENROLLED IN HER OWN CLASS: the state 0138 exists for, and the
	// positive control for the roster skip.
	await enrollStudent(db, { as: teacher, sectionId: section, email: teacher.email, displayName: 'T. Vargas' });

	for (const [name, doc] of Object.entries(BODIES)) {
		const id = (
			await rpc<{ item_id: string }>(
				teacher.id,
				`public.classroom_create_item(
					p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
					p_body => $3, p_points => 10, p_due_at => $4::timestamptz, p_published => true)`,
				[[section], `Checkpoint ${name}`, paras(3).map((p) => p.runs[0].text).join('\n\n'), new Date(Date.now() + 2 * 86_400_000).toISOString()]
			)
		).item_id;
		// The authored document, written as the owner: the shapes under test
		// (an SVG reference among them) are the CLIENT's to judge at render.
		await db.sql('update public.classroom_items set body_doc = $2::jsonb where id = $1', [
			id,
			doc === null ? null : JSON.stringify(doc)
		]);
		itemIds[name] = id;
	}

	// A real hand-in from the teacher and from bruno, so the to-grade tally has
	// something to exclude.
	for (const u of [bruno, teacher]) {
		await rpc(u.id, 'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5, $6, $7)', [
			itemIds.noImage,
			`drive-${u.email}`,
			'work.jpg',
			'image/jpeg',
			1024,
			null,
			null
		]);
	}
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

describe('the seeding', () => {
	it('every body is stored the way the fixture says (positive control on the input)', async () => {
		const { rows } = await db.sql<{ id: string; has_doc: boolean; has_img: boolean }>(
			`select id, body_doc is not null as has_doc,
				coalesce(body_doc @> '[{"type":"img"}]'::jsonb, false) as has_img
			 from public.classroom_items`
		);
		const byId = new Map(rows.map((r) => [r.id, r]));
		expect(byId.get(itemIds.imageFirst)?.has_img).toBe(true);
		expect(byId.get(itemIds.imageLater)?.has_img).toBe(true);
		expect(byId.get(itemIds.svgImage)?.has_img).toBe(true);
		expect(byId.get(itemIds.noImage)?.has_img).toBe(false);
		expect(byId.get(itemIds.noBodyDoc)?.has_doc).toBe(false);
	});

	it('the unslimmed read carries the bodies (the thing the slim takes off)', async () => {
		const work = await fullWork(alice);
		expect(work.items.length).toBe(5);
		expect(work.items.every((i) => i.body.length > 100)).toBe(true);
		expect(work.items.filter((i) => Array.isArray(i.body_doc) && i.body_doc.length > 3).length).toBeGreaterThanOrEqual(3);
	});
});

describe('the home load', () => {
	it('a STUDENT home load runs no roster scan and returns no manager map', async () => {
		const { data, calls } = await runHome(alice);
		console.info(`[load budget] / as a student: ${calls.length} requests: ${calls.join(', ')}`);
		expect(data.classroomReady).toBe(true);
		expect(data.feedSections.map((s) => s.id)).toEqual([section]);
		expect(count(calls, 'rpc:classroom_section_roster')).toBe(0);
		expect(data.feedManagerEmails).toEqual({});
	});

	it('a TEACHER home load still runs it once and keeps her own hand-in out of her tally (positive control)', async () => {
		const { data, calls } = await runHome(teacher);
		console.info(`[load budget] / as a teacher: ${calls.length} requests: ${calls.join(', ')}`);
		expect(count(calls, 'rpc:classroom_section_roster')).toBe(1);
		expect(data.feedManagerEmails[section]).toEqual([teacher.email]);
		const feeds = buildFeed({
			sections: data.feedSections,
			items: data.feedItems,
			submissions: data.feedSubmissions,
			myEmail: teacher.email,
			isAdmin: false,
			managerEmails: data.feedManagerEmails,
			now: new Date()
		});
		expect(feeds[0].manages).toBe(true);
	});

	it('every item the home page ships is slim: no text body, and at most its one cover image', async () => {
		const { data } = await runHome(alice);
		expect(data.feedItems.length).toBe(5);
		for (const item of data.feedItems) {
			expect(item.body).toBe('');
			const doc = item.body_doc;
			expect(doc === null || (Array.isArray(doc) && doc.length === 1 && doc[0].type === 'img')).toBe(true);
		}
		const full = await fullWork(alice);
		const before = JSON.stringify(full.items).length;
		const after = JSON.stringify(data.feedItems).length;
		console.info(`[load budget] / feedItems serialized: ${before} bytes unslimmed, ${after} bytes slimmed, for ${full.items.length} items`);
		expect(after).toBeLessThan(before);
	});

	it('a slimmed item has exactly the cover the full item had, in every one of the five shapes', async () => {
		const full = await fullWork(alice);
		const covers = Object.fromEntries(full.items.map((i) => [i.id, feedCover(i)]));
		// The fixture's own expectation, independent of the slim: two real
		// covers, and none for no-image, an SVG and a body with no document.
		expect(covers[itemIds.imageFirst]?.src).toBe('/IDEA/icon-192.png');
		expect(covers[itemIds.imageLater]?.src).toBe('/IDEA/icon-512.png');
		expect(covers[itemIds.noImage]).toBeNull();
		expect(covers[itemIds.svgImage]).toBeNull();
		expect(covers[itemIds.noBodyDoc]).toBeNull();
		for (const item of full.items) {
			expect(feedCover(slimOwedWorkItem(item))).toEqual(covers[item.id]);
		}
	});

	it('the feed and the to-do built from the slim payload are the ones built from the full read', async () => {
		for (const [user, admin] of [
			[alice, false],
			[teacher, false]
		] as const) {
			const { data } = await runHome(user, admin);
			const full = await fullWork(user, admin);
			const now = new Date(data.feedClock!.now);
			const feedArgs = {
				sections: data.feedSections,
				submissions: data.feedSubmissions,
				myEmail: user.email,
				isAdmin: admin,
				managerEmails: data.feedManagerEmails,
				now
			};
			expect(feedShape(buildFeed({ ...feedArgs, items: data.feedItems }))).toEqual(
				feedShape(buildFeed({ ...feedArgs, items: full.items }))
			);
			const todoArgs = {
				sections: data.feedSections,
				submissions: data.feedSubmissions,
				checkIns: data.feedCheckIns,
				myEmail: user.email,
				isAdmin: admin,
				clock: data.feedClock!
			};
			expect(feedShape(buildTodo({ ...todoArgs, items: data.feedItems }) as never)).toEqual(
				feedShape(buildTodo({ ...todoArgs, items: full.items }) as never)
			);
		}
	});
});

describe('/classroom (My Classes)', () => {
	it('a student: classroom_sections is read by the layout and by the owed-work read, and not a third time', async () => {
		const { layout, page, layoutCalls, pageCalls } = await runClassroomIndex(alice);
		console.info(`[load budget] /classroom layout as a student: ${layoutCalls.length} requests: ${layoutCalls.join(', ')}`);
		console.info(`[load budget] /classroom page as a student: ${pageCalls.length} requests: ${pageCalls.join(', ')}`);
		expect(count(layoutCalls, 'from:classroom_sections')).toBe(1);
		expect(count(pageCalls, 'from:classroom_sections')).toBe(1);
		// Positive control: the page still has its classes and its counts.
		expect(page.ready).toBe(true);
		expect((layout.navSections as ClassroomSection[]).map((s) => s.id)).toEqual([section]);
		expect(page.todo).not.toBeNull();
	});

	it('a teacher: the page reads no section list of its own and still says it is ready', async () => {
		const { page, layoutCalls, pageCalls } = await runClassroomIndex(teacher);
		console.info(`[load budget] /classroom layout as a teacher: ${layoutCalls.length} requests: ${layoutCalls.join(', ')}`);
		console.info(`[load budget] /classroom page as a teacher: ${pageCalls.length} requests: ${pageCalls.join(', ')}`);
		expect(count(pageCalls, 'from:classroom_sections')).toBe(0);
		expect(page.isStaff).toBe(true);
		expect(page.ready).toBe(true);
	});
});

describe('/classroom/todo', () => {
	it('ships slim items too, and the rows are the full read\'s rows', async () => {
		const { data, calls } = await runTodo(alice);
		console.info(`[load budget] /classroom/todo as a student: ${calls.length} requests: ${calls.join(', ')}`);
		expect(data.todo.items.length).toBe(5);
		expect(data.todo.items.every((i) => i.body === '')).toBe(true);
		const full = await fullWork(alice);
		const args = {
			sections: data.todo.sections,
			submissions: data.todo.submissions,
			checkIns: data.todo.checkIns,
			myEmail: alice.email,
			isAdmin: false,
			clock: data.todo.clock
		};
		expect(feedShape(buildTodo({ ...args, items: data.todo.items }) as never)).toEqual(
			feedShape(buildTodo({ ...args, items: full.items }) as never)
		);
	});
});
