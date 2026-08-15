// tests/classroom-rich-body.test.ts
//
// 0108: item bodies as rich documents, against real embedded Postgres with the
// real migration files applied unmodified.
//
// WHAT EARNS A TEST HERE is the half of the feature that fails SILENTLY.
//
//   * THE SQL GATE. The normalizer in $lib/server is what makes a real paste
//     survive, but it is not the boundary -- classroom_create_item and
//     classroom_update_item are granted to `authenticated` and reachable
//     straight through PostgREST, so a caller can skip the route entirely.
//     `_classroom_doc_ok` is what refuses them, and it is asserted below WITH
//     RLS OUT OF THE WAY (as the connection owner), so nothing but the gate
//     itself can be what does the refusing.
//   * THE TWO COLUMNS AGREEING. `body` is the plain-text projection and
//     `body_doc` the document. If they ever disagree the rendered body and the
//     announcement's fallback title say different things, and nothing errors.
//   * THE BACKFILL. Content authored before rich text existed must come out
//     reading the way it always did. A backfill that flattened every paragraph
//     into one block would look like a working migration.
//   * 0104'S RULE, WHICH THIS FILE REWRITES `classroom_update_item` UNDER. An
//     "Updated" badge must still mean a student missed something -- and must
//     now ALSO fire for a formatting-only edit, which changes the document and
//     not one character of the text.
//
// MUTATION-CHECKED BOTH WAYS (manually, during this session -- not left as
// runnable code, the classroom-attachment-route.test.ts convention). Against
// this exact file, measured:
//   * `_classroom_doc_ok` accepting everything reddened 13 -- every refusal
//     case plus the two that go through the real RPCs;
//   * refusing everything reddened 19 write paths;
//   * dropping `v_doc is distinct from ...` from update_item's change test
//     reddened EXACTLY ONE, the formatting-only edit, and nothing else --
//     which is precisely the assertion that term exists for;
//   * deriving `body` from `p_body` instead of from the document (the "trust
//     the caller" version) reddened exactly the caller-lied-about-the-text
//     assertion, which is the one that can tell those two apart.
// 0108 was restored byte-identical (md5 a69993e7ca9a23da1cf4a1f905c15e94)
// after each and this file re-run fully green.
//
// A REAL BUG THIS FOUND, before any of that: the gate's type checks were
// written `jsonb_typeof(x) <> 'string'`, which is NULL -- not true -- when the
// key is ABSENT, so the guard fell straight through and a run carrying no
// `text` key at all was accepted. The same `is distinct from` trap 0097 hit.
// Every type check in the gate is `is distinct from` now.
//
// NOT COVERED HERE, deliberately, and verified in the browser instead: the
// COMPOSER's sequencing -- that a staged deck and a staged spec are applied
// with the id the create call just returned, only after it succeeded, and are
// kept rather than discarded when one of them fails. Those are facts about a
// Svelte component's ordering, not about the database; the deck ingest itself
// cannot observe how old the item it is given is. See classroom-decks.test.ts
// for the ingest, and the dev harness's verbatim transport log for the order.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { ITEM_SELECT_RICH } from '../src/lib/classroom/transports';
import { normalizeItemRow, isUpdatedForViewer } from '../src/lib/classroom/classroom';
import { docText, itemBodyDoc, type ItemDoc } from '../src/lib/classroom/classroom-doc';
import { itemBodyColumns } from '../src/lib/server/classroom-doc';

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0090_classroom_instructor_materials.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0101_classroom_decks.sql',
	'0102_classroom_deck_uploads.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql'
] as const;

/** Everything except 0108 -- the world an item authored before rich text lived in. */
const PRE_0108 = MIGRATIONS.filter((m) => m !== '0108_classroom_rich_body.sql');

/** The migration under test, applied by hand over real pre-0108 data. */
const MIGRATION_0108 = readFileSync(
	join(fileURLToPath(new URL('..', import.meta.url)), 'supabase', 'migrations', '0108_classroom_rich_body.sql'),
	'utf8'
);

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
let owner: SeededUser;
let teacher: SeededUser;
let otherTeacher: SeededUser;
let student: SeededUser;
let section: string;

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[]
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

/** The editor's own output shape, as the composer would hand it over. */
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const heading = (level: number, t: string) => ({
	type: 'heading',
	attrs: { level },
	content: [{ type: 'text', text: t }]
});
const bullets = (...items: string[]) => ({
	type: 'bulletList',
	content: items.map((t) => ({
		type: 'listItem',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }]
	}))
});
const text = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });

/**
 * Create an item the way the SAVE ROUTE does: sanitize first, then send BOTH
 * the document and the plain text it derived. Going through `itemBodyColumns`
 * rather than hand-writing a payload is what makes these tests exercise the
 * shipping pipeline instead of an idealized version of it.
 */
async function createItem(
	editorDoc: unknown,
	over: { kind?: string; title?: string | null; published?: boolean } = {}
): Promise<string> {
	const shaped = itemBodyColumns(editorDoc);
	if (!shaped.ok) throw new Error(`fixture body refused: ${shaped.error}`);
	const res = await rpc<{ item_id: string }>(
		teacher.id,
		"public.classroom_create_item($1, $2::uuid[], $3, $4, null, null, null, $5::boolean, '[]'::jsonb, false, $6::jsonb)",
		[
			over.kind ?? 'post',
			[section],
			over.title ?? null,
			shaped.body,
			over.published ?? true,
			JSON.stringify(shaped.doc)
		]
	);
	return res.item_id;
}

/** The same, for an update. */
async function updateItem(
	itemId: string,
	editorDoc: unknown,
	over: { title?: string | null; published?: boolean | null } = {}
): Promise<Record<string, unknown>> {
	const shaped = itemBodyColumns(editorDoc);
	if (!shaped.ok) throw new Error(`fixture body refused: ${shaped.error}`);
	return rpc(
		teacher.id,
		'public.classroom_update_item($1::uuid, $2, $3, null, null, null, $4::boolean, $5::jsonb, $6::jsonb)',
		[
			itemId,
			over.title ?? null,
			shaped.body,
			over.published ?? true,
			JSON.stringify([]),
			JSON.stringify(shaped.doc)
		]
	);
}

async function columns(itemId: string): Promise<{ body: string; body_doc: ItemDoc | null }> {
	const { rows } = await db.sql<{ body: string; body_doc: ItemDoc | null }>(
		'select body, body_doc from public.classroom_items where id = $1',
		[itemId]
	);
	return rows[0];
}

async function editedAt(itemId: string): Promise<string | null> {
	const { rows } = await db.sql<{ edited_at: string | null }>(
		'select edited_at from public.classroom_items where id = $1',
		[itemId]
	);
	return rows[0].edited_at;
}

/** Does the SQL gate accept this document? Asked with RLS out of the way. */
async function gateAccepts(value: unknown): Promise<boolean> {
	const { rows } = await db.sql<{ ok: boolean }>(
		'select public._classroom_doc_ok($1::jsonb) as ok',
		[value === undefined ? null : JSON.stringify(value)]
	);
	return rows[0].ok;
}

async function seed(migrations: readonly string[]): Promise<void> {
	db = await startTestDb(migrations);
	fks = await loadForeignKeys(db);
	owner = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
	teacher = await createUser(db, 'vargas@boscotech.edu', 'T. Vargas');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'O. Teacher');
	student = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');

	const course = await rpc<{ course_id: string }>(
		teacher.id,
		"public.classroom_upsert_course('IDEA209H', 'Engineering')",
		[]
	);
	// Created BY the teacher, so they are the teacher of record -- which is what
	// every authority assertion below turns on.
	const sec = await rpc<{ section_id: string }>(
		teacher.id,
		"public.classroom_upsert_section($1::uuid, 'Period 2', 'B')",
		[course.course_id]
	);
	section = sec.section_id;
	await rpc(
		teacher.id,
		"public.classroom_set_enrollment($1::uuid, 'alice@boscotech.net', 'Alice', true)",
		[section]
	);
}

describe('0108 over content that already existed', () => {
	beforeAll(async () => {
		// The two-halves shape (0085/0095/0096): bring the schema up SHORT of
		// 0108, author real items through the REAL pre-0108 RPC, and only then
		// apply the migration over the top. It is the only way to assert what
		// the backfill actually did to rows that were already there.
		await seed(PRE_0108);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('backfills a multi-paragraph body into real paragraphs', async () => {
		const before = await rpc<{ item_id: string }>(
			teacher.id,
			"public.classroom_create_item('post', $1::uuid[], null, $2, null, null, null, true, '[]'::jsonb, false)",
			[[section], 'Bring a ruler.\n\nMeasure the span, then\nrecord it.\n\nDue Friday.']
		);
		const single = await rpc<{ item_id: string }>(
			teacher.id,
			"public.classroom_create_item('post', $1::uuid[], null, $2, null, null, null, true, '[]'::jsonb, false)",
			[[section], 'One line only.']
		);

		await db.sql(MIGRATION_0108);

		const many = await columns(before.item_id);
		expect(many.body_doc).toEqual([
			{ type: 'p', runs: [{ text: 'Bring a ruler.' }] },
			{ type: 'p', runs: [{ text: 'Measure the span, then record it.' }] },
			{ type: 'p', runs: [{ text: 'Due Friday.' }] }
		]);
		// Nothing lost: the text column is untouched and the document says the
		// same thing.
		expect(many.body).toBe('Bring a ruler.\n\nMeasure the span, then\nrecord it.\n\nDue Friday.');
		expect(docText(many.body_doc!)).toContain('Due Friday.');

		const one = await columns(single.item_id);
		expect(one.body_doc).toEqual([{ type: 'p', runs: [{ text: 'One line only.' }] }]);
	});

	it('renders a backfilled body identically to how it always read', async () => {
		const { rows } = await db.sql<{ id: string }>(
			"select id from public.classroom_items where body like 'Bring a ruler.%'"
		);
		const shim = createPostgrestShim(db, fks, student.id);
		const { data } = await shim.from('classroom_items').select(ITEM_SELECT_RICH).eq('id', rows[0].id);
		const item = normalizeItemRow((data as Record<string, unknown>[])[0]);
		// Three paragraphs, in order, with every word of the original.
		expect(itemBodyDoc(item)).toHaveLength(3);
		expect(docText(itemBodyDoc(item))).toBe(
			'Bring a ruler.\nMeasure the span, then record it.\nDue Friday.'
		);
	});

	it('re-applies cleanly and does not clobber an authored document', async () => {
		const id = await createItem(doc(heading(3, 'Steps'), bullets('One', 'Two')));
		const authored = (await columns(id)).body_doc;

		// Migrations here are pasted in by hand, so a re-run is ordinary -- and
		// a backfill without `where body_doc is null` would flatten this item's
		// real headings and lists back into paragraphs.
		await db.sql(MIGRATION_0108);
		await db.sql(MIGRATION_0108);

		expect((await columns(id)).body_doc).toEqual(authored);
	});

	it('leaves exactly one signature for each re-signed function', async () => {
		// Adding a parameter changes the REAL signature, so the old arity had to
		// be dropped -- two overloads differing only by a defaulted trailing
		// parameter make PostgREST unable to resolve the call AT ALL.
		for (const name of ['classroom_create_item', 'classroom_update_item']) {
			const { rows } = await db.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p
				 join pg_namespace ns on ns.oid = p.pronamespace
				 where ns.nspname = 'public' and p.proname = $1`,
				[name]
			);
			expect(rows[0].n, name).toBe('1');
		}
	});
});

describe('0108 on a fresh schema', () => {
	beforeAll(async () => {
		await seed(MIGRATIONS);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	describe('the SQL gate, with RLS out of the way entirely', () => {
		it('accepts the shapes the sanitizer produces', async () => {
			const shaped = itemBodyColumns(
				doc(
					heading(3, 'Steps'),
					para(text('Do '), text('this', [{ type: 'bold' }])),
					bullets('One', 'Two'),
					para(text('link', [{ type: 'link', attrs: { href: 'https://x.test' } }]))
				)
			);
			expect(shaped.ok).toBe(true);
			if (!shaped.ok) return;
			expect(await gateAccepts(shaped.doc)).toBe(true);
		});

		it('accepts absent and empty', async () => {
			expect(await gateAccepts(undefined)).toBe(true);
			expect(await gateAccepts([])).toBe(true);
		});

		it.each([
			['an unknown block type', [{ type: 'script', runs: [{ text: 'x' }] }]],
			['a heading level a body may not use', [{ type: 'h1', runs: [{ text: 'x' }] }]],
			['an unknown key on a block', [{ type: 'p', runs: [{ text: 'x' }], onclick: 'y()' }]],
			['an unknown key on a run', [{ type: 'p', runs: [{ text: 'x', onerror: 'y()' }] }]],
			['a run with no text', [{ type: 'p', runs: [{ bold: true }] }]],
			['a non-string text', [{ type: 'p', runs: [{ text: 42 }] }]],
			['a javascript href', [{ type: 'p', runs: [{ text: 'x', href: 'javascript:alert(1)' }] }]],
			['a data href', [{ type: 'p', runs: [{ text: 'x', href: 'data:text/html,<script>' }] }]],
			['a truthy-but-not-true flag', [{ type: 'p', runs: [{ text: 'x', bold: 'yes' }] }]],
			['a list whose items are not run lists', [{ type: 'ul', items: [{ text: 'x' }] }]],
			['a bare object instead of an array', { type: 'p', runs: [] }],
			['a string', 'hello']
		])('refuses %s', async (_label, value) => {
			expect(await gateAccepts(value)).toBe(false);
		});

		it('refuses the same shapes through the real RPCs, not merely in the helper', async () => {
			// The gate is only worth anything where a caller can actually reach.
			// This is the direct-PostgREST route the composer never takes.
			await expect(
				rpc(
					teacher.id,
					"public.classroom_create_item('post', $1::uuid[], null, 'text', null, null, null, true, '[]'::jsonb, false, $2::jsonb)",
					[[section], JSON.stringify([{ type: 'p', runs: [{ text: 'x', href: 'javascript:alert(1)' }] }])]
				)
			).rejects.toThrow(/could not be read/i);

			const id = await createItem(doc(para(text('fine'))));
			await expect(
				rpc(
					teacher.id,
					'public.classroom_update_item($1::uuid, null, $2, null, null, null, true, null, $3::jsonb)',
					[id, 'text', JSON.stringify([{ type: 'evil', runs: [] }])]
				)
			).rejects.toThrow(/could not be read/i);
			// And nothing was written by the attempt.
			expect((await columns(id)).body_doc).toEqual([{ type: 'p', runs: [{ text: 'fine' }] }]);
		});
	});

	describe('the two columns cannot disagree', () => {
		it('derives the text from the document, ignoring what the caller said it was', async () => {
			const res = await rpc<{ item_id: string }>(
				teacher.id,
				"public.classroom_create_item('post', $1::uuid[], null, $2, null, null, null, true, '[]'::jsonb, false, $3::jsonb)",
				[
					[section],
					'A LIE THE CALLER TOLD',
					JSON.stringify([
						{ type: 'p', runs: [{ text: 'The real body.' }] },
						{ type: 'ul', items: [[{ text: 'A point' }]] }
					])
				]
			);
			const cols = await columns(res.item_id);
			expect(cols.body).toBe('The real body.\nA point');
			expect(cols.body).not.toContain('LIE');
		});

		it('derives the document from the text for a caller that predates 0108', async () => {
			// The route degrades to this when the migration is not applied yet;
			// so does any client that never learned about the column.
			const res = await rpc<{ item_id: string }>(
				teacher.id,
				"public.classroom_create_item('post', $1::uuid[], null, $2, null, null, null, true, '[]'::jsonb, false)",
				[[section], 'Old style.\n\nTwo paragraphs.']
			);
			expect((await columns(res.item_id)).body_doc).toEqual([
				{ type: 'p', runs: [{ text: 'Old style.' }] },
				{ type: 'p', runs: [{ text: 'Two paragraphs.' }] }
			]);
		});

		it('keeps them in step through an update', async () => {
			const id = await createItem(doc(para(text('First.'))));
			await updateItem(id, doc(heading(3, 'Now'), bullets('A', 'B')));
			const cols = await columns(id);
			expect(cols.body).toBe('Now\nA\nB');
			expect(cols.body_doc).toEqual([
				{ type: 'h3', runs: [{ text: 'Now' }] },
				{ type: 'ul', items: [[{ text: 'A' }], [{ text: 'B' }]] }
			]);
			expect(docText(cols.body_doc!)).toBe(cols.body);
		});
	});

	describe("0104's rule still holds, and now covers formatting", () => {
		it('stamps nothing when a published item is saved unchanged', async () => {
			const id = await createItem(doc(para(text('Steady.'))), { published: true });
			expect(await editedAt(id)).toBeNull();
			await updateItem(id, doc(para(text('Steady.'))));
			expect(await editedAt(id)).toBeNull();
		});

		it('stamps an edit when the words change', async () => {
			const id = await createItem(doc(para(text('Before.'))), { published: true });
			await updateItem(id, doc(para(text('After.'))));
			expect(await editedAt(id)).not.toBeNull();
		});

		it('STAMPS A FORMATTING-ONLY EDIT, which changes no text at all', async () => {
			// The term 0108 adds. Turning three lines into a numbered list, or
			// bolding a step, is a change every student can see and leaves the
			// plain-text projection byte-identical -- so comparing only `body`
			// would silently stop stamping the badge for precisely the edits
			// this migration exists to make possible.
			const id = await createItem(doc(para(text('One')), para(text('Two'))), { published: true });
			const plain = (await columns(id)).body;
			expect(await editedAt(id)).toBeNull();

			await updateItem(id, doc(bullets('One', 'Two')));

			expect((await columns(id)).body).toBe(plain); // the text did NOT move
			expect(await editedAt(id)).not.toBeNull(); // the badge still fired
		});

		it('does not treat publishing a draft as an edit', async () => {
			const id = await createItem(doc(para(text('Draft.'))), { published: false });
			await updateItem(id, doc(para(text('Draft.'))), { published: true });
			expect(await editedAt(id)).toBeNull();
		});

		it('shows the student the badge only for a real change', async () => {
			const id = await createItem(doc(para(text('v1'))), { published: true });
			const shim = createPostgrestShim(db, fks, student.id);
			const read = async () => {
				const { data } = await shim.from('classroom_items').select(ITEM_SELECT_RICH).eq('id', id);
				return normalizeItemRow((data as Record<string, unknown>[])[0]);
			};
			expect(isUpdatedForViewer(await read())).toBe(false);
			await updateItem(id, doc(para(text('v1'))));
			expect(isUpdatedForViewer(await read())).toBe(false);
			await updateItem(id, doc(para(text('v2'))));
			expect(isUpdatedForViewer(await read())).toBe(true);
		});
	});

	describe('what a student actually reads', () => {
		it('carries the document through the shipping select', async () => {
			const id = await createItem(
				doc(heading(3, 'Bring'), bullets('Ruler', 'Graph paper'), para(text('Due Friday.')))
			);
			const shim = createPostgrestShim(db, fks, student.id);
			const { data } = await shim.from('classroom_items').select(ITEM_SELECT_RICH).eq('id', id);
			const item = normalizeItemRow((data as Record<string, unknown>[])[0]);
			expect(itemBodyDoc(item)).toEqual([
				{ type: 'h3', runs: [{ text: 'Bring' }] },
				{ type: 'ul', items: [[{ text: 'Ruler' }], [{ text: 'Graph paper' }]] },
				{ type: 'p', runs: [{ text: 'Due Friday.' }] }
			]);
		});

		it('cannot be written by a student, or by a teacher of another class', async () => {
			// Authority is 0085's, untouched by this migration -- asserted because
			// the function was REWRITTEN, and a rewrite is exactly when a check
			// goes missing.
			await expect(
				rpc(
					student.id,
					"public.classroom_create_item('post', $1::uuid[], null, 'x', null, null, null, true, '[]'::jsonb, false, null)",
					[[section]]
				)
			).rejects.toThrow();

			const id = await createItem(doc(para(text('Mine.'))));
			await expect(
				rpc(
					otherTeacher.id,
					'public.classroom_update_item($1::uuid, null, $2, null, null, null, true, null, null)',
					[id, 'theirs']
				)
			).rejects.toThrow(/teacher of record/i);
			expect((await columns(id)).body).toBe('Mine.');
		});

		it('gives no direct write path on the new column', async () => {
			for (const role of [student, teacher, owner]) {
				await expect(
					db.asUser(role.id, (q) =>
						q("update public.classroom_items set body_doc = '[]'::jsonb")
					)
				).rejects.toThrow();
			}
		});
	});

	describe('a duplicate keeps its formatting', () => {
		it('copies the document, not just the flattened text', async () => {
			// classroom_duplicate_item copies the authored columns BY NAME, so a
			// column it does not name is silently lost -- and a copy that came
			// back as one flat paragraph would look like the duplicate worked.
			const id = await createItem(doc(heading(3, 'Lab'), bullets('Step one', 'Step two')), {
				kind: 'assignment',
				title: 'Unit 4 lab'
			});
			const copy = await rpc<{ item_id: string }>(
				teacher.id,
				'public.classroom_duplicate_item($1::uuid)',
				[id]
			);
			expect((await columns(copy.item_id)).body_doc).toEqual((await columns(id)).body_doc);
		});
	});

	describe('a spec imported while the assignment is being written', () => {
		const spec = {
			schemaVersion: 1,
			meta: {
				assignmentId: 'IDEA209H-U4-L1',
				title: 'Bridge load test',
				course: 'IDEA209H',
				totalPoints: 10
			},
			modules: [
				{
					id: 'm1',
					title: 'Setup',
					points: 10,
					blocks: [{ id: 'b1', type: 'textField', prompt: 'What did you measure?' }],
					rubric: [
						{
							criterion: 'Setup recorded',
							levels: [
								{ label: 'Full', points: 10, descriptor: 'All of it' },
								{ label: 'Some', points: 5, descriptor: 'Partly' },
								{ label: 'None', points: 0, descriptor: 'Not recorded' }
							]
						}
					]
				}
			]
		};

		it('lands byte-identically to one attached afterwards', async () => {
			// The composer stages the spec and attaches it the instant the create
			// call returns an id; the item page attaches it to an item that has
			// been sitting there. Same RPC, same result -- which is the claim,
			// and it is worth pinning because the composer path is new.
			const atCreation = await createItem(doc(para(text('Do the lab.'))), {
				kind: 'assignment',
				title: 'Lab A'
			});
			await rpc(teacher.id, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
				atCreation,
				JSON.stringify(spec)
			]);

			const later = await createItem(doc(para(text('Do the lab.'))), {
				kind: 'assignment',
				title: 'Lab B'
			});
			await updateItem(later, doc(para(text('Do the lab.'))), { title: 'Lab B' });
			await rpc(teacher.id, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
				later,
				JSON.stringify(spec)
			]);

			const { rows } = await db.sql<{ item_id: string; spec: unknown }>(
				'select item_id, spec from public.classroom_assignment_specs where item_id = any($1::uuid[]) order by item_id',
				[[atCreation, later]]
			);
			expect(rows).toHaveLength(2);
			expect(JSON.stringify(rows[0].spec)).toBe(JSON.stringify(rows[1].spec));
		});

		it('is still validated server-side, unchanged', async () => {
			const id = await createItem(doc(para(text('x'))), { kind: 'assignment', title: 'Lab C' });
			const broken = { ...spec, meta: { ...spec.meta, totalPoints: 999 } };
			await expect(
				rpc(teacher.id, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
					id,
					JSON.stringify(broken)
				])
			).rejects.toThrow();
		});

		it('refuses a teacher who does not manage the assignment', async () => {
			const id = await createItem(doc(para(text('x'))), { kind: 'assignment', title: 'Lab D' });
			await expect(
				rpc(otherTeacher.id, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
					id,
					JSON.stringify(spec)
				])
			).rejects.toThrow();
		});
	});

	describe('a deck attached while the item is being created', () => {
		it('authorizes against the freshly-made item exactly as against an old one', async () => {
			// The composer opens the upload slot with the id the create call just
			// returned. The slot is where authorization happens, so this is the
			// part that could differ; the ingest itself cannot observe how old
			// the item is (see classroom-decks.test.ts for that path).
			const fresh = await createItem(doc(para(text('Lecture.'))), {
				kind: 'material',
				title: 'Deck host'
			});
			const slot = await rpc<{ upload_id: string }>(
				teacher.id,
				'public.classroom_deck_upload_start($1::uuid)',
				[fresh]
			);
			expect(slot.upload_id).toBeTruthy();

			await expect(
				rpc(otherTeacher.id, 'public.classroom_deck_upload_start($1::uuid)', [fresh])
			).rejects.toThrow();
			await expect(
				rpc(student.id, 'public.classroom_deck_upload_start($1::uuid)', [fresh])
			).rejects.toThrow();
		});
	});
});
