// tests/db/classroom-item-image-gate.test.ts
//
// 0176: the item-body gate widened to accept a picture, against REAL embedded
// Postgres with the REAL migration files applied unmodified.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness. Every failure mode here is silent, and three of them are the kind
// nobody finds by looking:
//
//   * A GATE THAT WIDENED TOO FAR is invisible by construction. The RPCs are
//     granted to `authenticated` and reachable straight through PostgREST, so
//     this predicate is the only thing between a hand-rolled call and the
//     table. An `img` whose `src` is `javascript:` or `https://evil.example/x`
//     that reached `classroom_items.body_doc` would be fetched automatically by
//     every browser in the class, carrying each student's IP and Referer,
//     before anybody decided anything.
//   * A GATE THAT WIDENED FOR THE WRONG COLUMN is invisible too, and it is the
//     one this file exists for most. `_classroom_doc_ok` is SHARED --
//     `notebook_sessions.guidance_doc` calls it -- and the notebook's renderer
//     cannot draw an image. So the wide form must accept one and the NARROW
//     form must still refuse it, and only asking both proves it.
//   * A MIRROR THAT DRIFTED. `_classroom_figure_src_ok` is the SQL twin of
//     `resolveFigureSrc(src, [])`. Two hand-written copies of "what may an
//     `img` load" is exactly the pair this repo's no-duplicate rule warns
//     about, and nothing type-checks a mirror. The corpus below is put to BOTH
//     and the answers must agree case for case.
//
// AND ONE PARITY CLAIM THAT IS NOT ABOUT SAFETY AT ALL. `classroom_items.body`
// is DERIVED from `body_doc` by `_classroom_doc_text` inside the write RPCs, and
// `richDocText` in $lib/rich-text-doc is the client's mirror of it. Neither is
// this bundle's to change -- $lib/rich-text-doc is not an owned file and the
// projection is not widened here -- so what an image contributes to the plain
// text has to be measured rather than assumed, on both sides, and pinned.
//
// THE POSITIVE CONTROLS ARE HERE RATHER THAN IMPLIED. A refusal suite that
// refuses everything, including the thing it is meant to accept, passes every
// assertion it makes. Each half states the count it expects.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { FIGURE_STATIC_PREFIXES, resolveFigureSrc } from '../../src/lib/classroom/classroom';
import { docText } from '../../src/lib/classroom/classroom-doc';
import type { ItemDoc } from '../../src/lib/classroom/classroom-doc';

/** The classroom chain through 0122, plus the migrations 0176 re-signs over. */
const ITEM_CHAIN = [
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
	'0092_classroom_reference_specs.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0101_classroom_decks.sql',
	'0102_classroom_deck_uploads.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0122_rich_text_nested_lists.sql'
] as const;

const MIGRATION_0176 = readFileSync(
	join(
		fileURLToPath(new URL('../..', import.meta.url)),
		'supabase',
		'migrations',
		'0176_classroom_item_images.sql'
	),
	'utf8'
);

function img(src: string, alt = 'The bearing, exploded'): ItemDoc {
	return [{ type: 'img', src, alt }];
}

/**
 * THE SOURCE CORPUS, one case per shape the mirror has to agree about.
 *
 * `want` is what BOTH sides must answer, and it is written from
 * `resolveFigureSrc`'s own documented reasons rather than from the SQL: a
 * refusal of `empty`, `scheme`, `protocol-relative`, `not-absolute`,
 * `off-prefix` or `svg` is structural and must be false on both sides;
 * `unresolved` is about the ATTACHMENT LIST rather than the string, and is
 * therefore storable -- an author writes a reference before the upload lands,
 * a file is re-uploaded under the same name, and an attachment removed next
 * term must not retroactively make a stored body unsavable.
 */
const SRC_CORPUS: { label: string; src: string; want: boolean }[] = [
	{ label: 'an attachment alias', src: 'attachment:teardown-03.jpg', want: true },
	{ label: 'an alias in mixed case', src: 'Attachment:Teardown-03.JPG', want: true },
	{ label: 'an alias naming a file nobody attached', src: 'attachment:missing.jpg', want: true },
	{ label: 'a static path', src: '/IDEA/idea-gear.png', want: true },
	{ label: 'a static path with a query', src: '/IDEA/gear.png?v=2', want: true },
	{ label: 'empty', src: '', want: false },
	{ label: 'whitespace only', src: '   ', want: false },
	{ label: 'an alias with no filename', src: 'attachment:', want: false },
	{ label: 'an SVG alias', src: 'attachment:diagram.svg', want: false },
	{ label: 'a compressed SVG alias', src: 'attachment:diagram.svgz', want: false },
	{ label: 'an SVG static path', src: '/IDEA/logo.svg', want: false },
	{ label: 'an SVG hidden behind a query', src: '/IDEA/logo.svg?a=.png', want: false },
	{ label: 'an https url', src: 'https://evil.example/beacon.png', want: false },
	{ label: 'an http url', src: 'http://evil.example/beacon.png', want: false },
	{ label: 'a javascript scheme', src: 'javascript:alert(1)', want: false },
	{ label: 'a data url', src: 'data:image/png;base64,AAAA', want: false },
	{ label: 'a file scheme', src: 'file:///etc/passwd', want: false },
	{ label: 'protocol relative', src: '//evil.example/beacon.png', want: false },
	{ label: 'a relative path', src: 'gear.png', want: false },
	{ label: 'an absolute path off the prefix list', src: '/api/classroom/attachment/x', want: false },
	{ label: 'traversal out of the prefix', src: '/IDEA/../../etc/passwd', want: false },
	{ label: 'percent-encoded traversal', src: '/IDEA/%2e%2e/secret.png', want: false },
	{ label: 'a windows separator', src: '/IDEA/..\\secret.png', want: false }
];

describe('0176: the item-body image gate', () => {
	let db: TestDb;
	let teacher: SeededUser;
	let section: string;

	/** The gate, at whichever arity the caller names. */
	async function docOk(doc: unknown, allowImage?: boolean): Promise<boolean | null> {
		const json = doc === undefined ? null : JSON.stringify(doc);
		const { rows } =
			allowImage === undefined
				? await db.sql<{ ok: boolean | null }>(
						'select public._classroom_doc_ok($1::jsonb) as ok',
						[json]
					)
				: await db.sql<{ ok: boolean | null }>(
						'select public._classroom_doc_ok($1::jsonb, $2::boolean) as ok',
						[json, allowImage]
					);
		return rows[0].ok;
	}

	async function srcOk(src: string): Promise<boolean | null> {
		const { rows } = await db.sql<{ ok: boolean | null }>(
			'select public._classroom_figure_src_ok($1::text) as ok',
			[src]
		);
		return rows[0].ok;
	}

	async function sqlDocText(doc: unknown): Promise<string> {
		const { rows } = await db.sql<{ t: string }>(
			'select public._classroom_doc_text($1::jsonb) as t',
			[doc === undefined ? null : JSON.stringify(doc)]
		);
		return rows[0].t;
	}

	async function createItem(doc: unknown, body = 'Bench brief'): Promise<string> {
		return db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { item_id: string } }>(
				`select public.classroom_create_item(
					p_kind => 'post', p_section_ids => $1::uuid[], p_title => $2,
					p_body => $3, p_body_doc => $4::jsonb) as result`,
				[[section], 'Lab brief', body, JSON.stringify(doc)]
			);
			return rows[0].result.item_id;
		});
	}

	beforeAll(async () => {
		db = await startTestDb(ITEM_CHAIN);
		teacher = await createUser(db, 'vargas@boscotech.edu', 'T. Vargas');

		const course = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { course_id: string } }>(
				"select public.classroom_upsert_course('IDEA209H', 'Engineering') as result"
			);
			return rows[0].result.course_id;
		});
		section = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { section_id: string } }>(
				"select public.classroom_upsert_section($1::uuid, 'Period 2', 'B') as result",
				[course]
			);
			return rows[0].result.section_id;
		});
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// Part 0. THE WORLD AS DEPLOYED, measured before the file is applied.
	// -----------------------------------------------------------------------
	describe('before 0176', () => {
		it('the gate has exactly one arity, and it refuses an image', async () => {
			const { rows } = await db.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p
				   join pg_namespace ns on ns.oid = p.pronamespace
				  where ns.nspname = 'public' and p.proname = '_classroom_doc_ok'`
			);
			expect(rows[0].n).toBe('1');
			expect(await docOk(img('attachment:teardown-03.jpg'))).toBe(false);
		});

		it('the item RPC refuses a body with a picture in it', async () => {
			await expect(createItem(img('attachment:teardown-03.jpg'))).rejects.toThrow(
				/could not be read/
			);
		});
	});

	// -----------------------------------------------------------------------
	// Part 1. APPLY, and prove it landed before reading anything from it.
	// -----------------------------------------------------------------------
	describe('after 0176', () => {
		beforeAll(async () => {
			await db.sql(MIGRATION_0176);
		});

		it('leaves exactly one 1-arg and one 2-arg gate, with NO defaults on the wide one', async () => {
			// A COUNT OF TWO PASSES ON EXACTLY THE ARRANGEMENT THAT BREAKS EVERY
			// CALL, so the structure is asserted rather than the number. A wide
			// form carrying a default would make the pair ambiguous, which is the
			// 0058/0068/0096 trap.
			const { rows } = await db.sql<{ pronargs: number; pronargdefaults: number }>(
				`select p.pronargs, p.pronargdefaults from pg_proc p
				   join pg_namespace ns on ns.oid = p.pronamespace
				  where ns.nspname = 'public' and p.proname = '_classroom_doc_ok'
				  order by p.pronargs`
			);
			expect(rows.map((r) => r.pronargs)).toEqual([1, 2]);
			expect(rows[1].pronargdefaults).toBe(0);
		});

		it('the narrow form DELEGATES rather than restating the rule', async () => {
			const { rows } = await db.sql<{ prosrc: string }>(
				`select p.prosrc from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
				  where ns.nspname = 'public' and p.proname = '_classroom_doc_ok' and p.pronargs = 1`
			);
			expect(rows).toHaveLength(1);
			expect(rows[0].prosrc).toContain('_classroom_doc_ok(p_doc, false)');
		});

		it('the new helpers are private: no anon and no authenticated EXECUTE', async () => {
			// A new function arrives GRANTED to anon under this project's default
			// privileges (which tests/db/supabase-stub.sql carries), and 0137 is a
			// one-time sweep that cannot cover anything created after it. So each
			// of these has to revoke for itself, and this is what says it did.
			for (const fn of [
				'public._classroom_figure_prefixes()',
				'public._classroom_figure_src_ok(text)',
				'public._classroom_img_ok(jsonb)',
				'public._classroom_doc_ok(jsonb)',
				'public._classroom_doc_ok(jsonb, boolean)'
			]) {
				const { rows } = await db.sql<{ a: boolean; b: boolean }>(
					`select has_function_privilege('anon', $1, 'EXECUTE') as a,
					        has_function_privilege('authenticated', $1, 'EXECUTE') as b`,
					[fn]
				);
				expect(rows[0].a, `${fn} must not be granted to anon`).toBe(false);
				expect(rows[0].b, `${fn} must not be granted to authenticated`).toBe(false);
			}
		});

		// -------------------------------------------------------------------
		// Part 2. THE TWO FORMS DISAGREE ABOUT AN IMAGE AND AGREE ABOUT
		// EVERYTHING ELSE. This is the notebook's whole protection.
		// -------------------------------------------------------------------
		it('the narrow form STILL refuses an image, so guidance documents did not move', async () => {
			expect(await docOk(img('attachment:teardown-03.jpg'))).toBe(false);
			expect(await docOk(img('/IDEA/idea-gear.png'))).toBe(false);
			expect(await docOk(img('attachment:teardown-03.jpg'), false)).toBe(false);
		});

		it('the wide form accepts one, which is the positive control for every refusal below', async () => {
			expect(await docOk(img('attachment:teardown-03.jpg'), true)).toBe(true);
			expect(await docOk(img('/IDEA/idea-gear.png'), true)).toBe(true);
		});

		it('both forms agree about every document with no image in it', async () => {
			const cases: { label: string; doc: unknown; want: boolean }[] = [
				{ label: 'null', doc: null, want: true },
				{ label: 'empty', doc: [], want: true },
				{
					label: 'a paragraph',
					doc: [{ type: 'p', runs: [{ text: 'Bring calipers.' }] }],
					want: true
				},
				{
					label: 'a nested list',
					doc: [{ type: 'ul', items: [[{ text: 'Materials' }, { type: 'ul', items: [[{ text: 'beaker' }]] }]] }],
					want: true
				},
				{ label: 'an unknown block', doc: [{ type: 'table', runs: [] }], want: false },
				{ label: 'an unsafe href', doc: [{ type: 'p', runs: [{ text: 'x', href: 'javascript:alert(1)' }] }], want: false },
				{ label: 'a stray key', doc: [{ type: 'p', runs: [], extra: 1 }], want: false }
			];
			let checked = 0;
			for (const c of cases) {
				expect(await docOk(c.doc), `narrow: ${c.label}`).toBe(c.want);
				expect(await docOk(c.doc, true), `wide: ${c.label}`).toBe(c.want);
				checked += 1;
			}
			expect(checked, 'the corpus generated nothing').toBe(cases.length);
		});

		// -------------------------------------------------------------------
		// Part 3. HOSTILE IMAGES, one case per shape, each refused BY NAME.
		// -------------------------------------------------------------------
		it('refuses every hostile src, and the mirror agrees with resolveFigureSrc case for case', async () => {
			let accepted = 0;
			let refused = 0;
			for (const c of SRC_CORPUS) {
				// The TypeScript side, asked with NO attachments: ok or `unresolved`
				// is storable, every other reason is structural and is not.
				const ts = resolveFigureSrc(c.src, []);
				const tsStorable = ts.ok || ts.reason === 'unresolved';
				expect(tsStorable, `TS: ${c.label}`).toBe(c.want);

				// The SQL mirror, which must answer identically.
				expect(await srcOk(c.src), `SQL: ${c.label}`).toBe(c.want);

				// And the whole gate, which is what actually stands between a
				// hand-rolled PostgREST call and the table.
				expect(await docOk(img(c.src), true), `gate: ${c.label}`).toBe(c.want);
				if (c.want) accepted += 1;
				else refused += 1;
			}
			// BOTH NUMBERS ARE THE RESULT. A suite that refused all 23 would pass
			// every "must be false" assertion it makes.
			console.log(`[0176 src] cases=${SRC_CORPUS.length} storable=${accepted} refused=${refused}`);
			expect(SRC_CORPUS.length).toBe(23);
			expect(accepted).toBe(5);
			expect(refused).toBe(18);
		});

		it('the SQL prefix list is the SAME list as FIGURE_STATIC_PREFIXES', async () => {
			// A prefix on one side and not the other is a body the editor accepts
			// and the renderer refuses, or worse the reverse.
			const { rows } = await db.sql<{ prefixes: string[] }>(
				'select public._classroom_figure_prefixes() as prefixes'
			);
			expect(rows[0].prefixes).toEqual([...FIGURE_STATIC_PREFIXES]);
			expect(FIGURE_STATIC_PREFIXES.length).toBeGreaterThan(0);
		});

		it('refuses an image with no description, a blank one, or a whitespace one', async () => {
			// THE `btrim` TRAP, pinned. `btrim` strips SPACES ONLY, so a
			// description of one newline passes a `btrim`-spelled gate and is
			// empty to everybody who looks at it.
			const blanks = ['', '   ', '\n', '\t', ' \n\t '];
			for (const alt of blanks) {
				expect(
					await docOk([{ type: 'img', src: 'attachment:x.jpg', alt }], true),
					`alt=${JSON.stringify(alt)}`
				).toBe(false);
			}
			// Absent entirely, and the wrong type.
			expect(await docOk([{ type: 'img', src: 'attachment:x.jpg' }], true)).toBe(false);
			expect(await docOk([{ type: 'img', src: 'attachment:x.jpg', alt: 3 }], true)).toBe(false);
			expect(await docOk([{ type: 'img', src: 'attachment:x.jpg', alt: null }], true)).toBe(false);
			// The positive control for all eight.
			expect(await docOk([{ type: 'img', src: 'attachment:x.jpg', alt: 'A' }], true)).toBe(true);
		});

		it('never answers NULL, on any shape, which is the answer that would ACCEPT a write', async () => {
			// `jsonb_typeof(absent) <> 'string'` is NULL, not true, so a guard
			// spelled that way falls through, the NULL propagates out as the
			// function's answer, and every caller's `if not <gate> then raise`
			// does NOT fire on NULL. Asserting `toBe(false)` alone cannot tell
			// those apart -- `toBeNull` is what says which one happened.
			const shapes: unknown[] = [
				[{ type: 'img' }],
				[{ type: 'img', alt: 'A' }],
				[{ type: 'img', src: 'attachment:x.jpg' }],
				[{ type: 'img', src: null, alt: 'A' }],
				[{ type: 'img', src: 'attachment:x.jpg', alt: 'A', width: 100 }],
				[{ type: 'img', src: [], alt: 'A' }],
				['img'],
				[3]
			];
			for (const shape of shapes) {
				const answer = await docOk(shape, true);
				expect(answer, `must not be NULL: ${JSON.stringify(shape)}`).not.toBeNull();
				expect(answer, `must refuse: ${JSON.stringify(shape)}`).toBe(false);
			}
		});

		it('refuses a stray key beside a valid image', async () => {
			expect(
				await docOk([{ type: 'img', src: 'attachment:x.jpg', alt: 'A', runs: [] }], true)
			).toBe(false);
			expect(
				await docOk([{ type: 'img', src: 'attachment:x.jpg', alt: 'A', onerror: 'x' }], true)
			).toBe(false);
		});

		// -------------------------------------------------------------------
		// Part 4. THROUGH THE REAL RPCs, which is the only path a client has.
		// -------------------------------------------------------------------
		it('stores a body with a picture, and reads it back byte-identically', async () => {
			const doc = [
				{ type: 'p', runs: [{ text: 'Measure the race before you press it out.' }] },
				{ type: 'img', src: 'attachment:teardown-03.jpg', alt: 'The bearing, exploded' }
			];
			const id = await createItem(doc);
			const { rows } = await db.sql<{ body_doc: unknown }>(
				'select body_doc from public.classroom_items where id = $1',
				[id]
			);
			expect(rows[0].body_doc).toEqual(doc);
		});

		it('still refuses a hostile picture through the RPC, not merely through the predicate', async () => {
			await expect(createItem(img('https://evil.example/beacon.png'))).rejects.toThrow(
				/could not be read/
			);
			await expect(createItem(img('attachment:logo.svg'))).rejects.toThrow(/could not be read/);
			await expect(createItem(img('attachment:x.jpg', '  '))).rejects.toThrow(
				/could not be read/
			);
		});

		it('an UPDATE takes the same widened gate, in both directions', async () => {
			const id = await createItem([{ type: 'p', runs: [{ text: 'Before.' }] }]);
			// A paragraph rides along because this item is a `post`, whose body is
			// required by 0085's field check and is DERIVED from the document --
			// and an image contributes no text (see the parity case below). The
			// assertion here is about the GATE, so the field check must not be
			// what decides it.
			const doc = [
				{ type: 'p', runs: [{ text: 'After.' }] },
				{ type: 'img', src: '/IDEA/idea-gear.png', alt: 'The IDEA gear' }
			];
			await db.asUser(teacher.id, (q) =>
				q(
					`select public.classroom_update_item(
						p_id => $1::uuid, p_title => 'Lab brief', p_body => 'x',
						p_body_doc => $2::jsonb)`,
					[id, JSON.stringify(doc)]
				)
			);
			const { rows } = await db.sql<{ body_doc: unknown }>(
				'select body_doc from public.classroom_items where id = $1',
				[id]
			);
			expect(rows[0].body_doc).toEqual(doc);

			await expect(
				db.asUser(teacher.id, (q) =>
					q(
						`select public.classroom_update_item(
							p_id => $1::uuid, p_title => 'Lab brief', p_body => 'x',
							p_body_doc => $2::jsonb)`,
						[id, JSON.stringify(img('javascript:alert(1)'))]
					)
				)
			).rejects.toThrow(/could not be read/);
		});

		// -------------------------------------------------------------------
		// Part 5. THE PLAIN-TEXT PARITY CLAIM, measured on both sides.
		// -------------------------------------------------------------------
		it('an image contributes an EMPTY LINE to the plain text, in SQL and in TypeScript alike', async () => {
			// NOT ALT TEXT, and that is a bounded decision rather than an
			// oversight. `richDocText` in $lib/rich-text-doc is the client mirror
			// of `_classroom_doc_text` and is NOT an owned file in this bundle;
			// its `else` arm reads `block.runs`, finds none, and emits ''. The SQL
			// `else` arm aggregates over `jsonb_array_elements(b.value->'runs')`,
			// which is zero rows for an absent key, and `coalesce(...,'')` makes
			// that '' too. So the two already agree, by construction, and
			// widening either one alone would be what broke them.
			const cases: ItemDoc[] = [
				[{ type: 'img', src: 'attachment:x.jpg', alt: 'A bearing' }],
				[
					{ type: 'p', runs: [{ text: 'Above' }] },
					{ type: 'img', src: 'attachment:x.jpg', alt: 'A bearing' },
					{ type: 'p', runs: [{ text: 'Below' }] }
				]
			];
			for (const doc of cases) {
				const fromSql = await sqlDocText(doc);
				expect(docText(doc), 'the TS mirror must equal the column').toBe(fromSql);
			}
			// And the measured values, stated rather than only compared, so a
			// reader of this file knows what an image-only body's `body` column
			// actually holds.
			expect(docText(cases[0])).toBe('');
			expect(docText(cases[1])).toBe('Above\n\nBelow');
		});

		it('an item whose body is ONLY a picture stores an empty body column, and an announcement still needs words', async () => {
			// The consequence of the line above, said out loud. A `post` with no
			// text at all is refused by 0085's field check, exactly as it was
			// before images existed -- which is the right answer, because an
			// announcement nobody can read as text is not an announcement.
			await expect(
				createItem(img('attachment:teardown-03.jpg'), '')
			).rejects.toThrow();
		});
	});
});
