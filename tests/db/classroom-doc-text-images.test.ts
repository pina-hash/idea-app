// tests/db/classroom-doc-text-images.test.ts
//
// 0178: an image contributes its DESCRIPTION to the plain-text projection --
// in SQL and in TypeScript, against REAL embedded Postgres with the REAL
// migration files applied unmodified.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness.
//
//   * THE FAILURE IS SILENT IN BOTH DIRECTIONS. `_classroom_doc_text` derives
//     `classroom_items.body` inside the write RPCs; `richDocText` is the
//     client's mirror of it, and `$lib/server/classroom-doc` sends its output
//     as `p_body` -- which the RPC ignores when a document is supplied, EXCEPT
//     on the pre-0108 degrade path, where it is stored verbatim. So a
//     disagreement between the two is a client contradicting the column the
//     stream, the headline and the export all read, and nothing type-checks a
//     mirror. 0176's own test recorded that they agree BY CONSTRUCTION and that
//     "widening either one alone would be what broke them". This file is the
//     assertion that they were widened together.
//   * THE HALF THAT IS EASY TO BREAK IS THE OTHER ONE. A projection feeds
//     surfaces nobody is looking at, so a widening that quietly changed what a
//     body with NO image projects would not be found by looking at a picture.
//     Every case in the corpus is therefore measured against the DEPLOYED
//     function first, 0178 is applied over the same database, and the two
//     readings are compared case for case -- the shape CLAUDE.md requires of a
//     widened gate, applied to a widened projection for the same reason.
//
// THE POSITIVE CONTROL IS THE BEFORE READING ITSELF. A corpus that produced
// the same answer on both sides of the migration would prove the migration did
// nothing; the counts are asserted, so a run in which no case moved reddens.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { docText, type ItemDoc } from '../../src/lib/classroom/classroom-doc';

/** The classroom chain through 0122. 0176 and 0178 are applied over the top. */
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

const migrationsDir = join(fileURLToPath(new URL('../../', import.meta.url)), 'supabase/migrations');
const MIGRATION_0176 = readFileSync(join(migrationsDir, '0176_classroom_item_images.sql'), 'utf8');
const MIGRATION_0178 = readFileSync(
	join(migrationsDir, '0178_classroom_doc_text_image_alt.sql'),
	'utf8'
);

/**
 * A document loose enough to hold shapes the closed union cannot name.
 *
 * The point of the file is what the DATABASE does with a stored document, and
 * `_classroom_doc_text` is reachable with anything jsonb-shaped -- so the
 * corpus deliberately includes values the editor could never emit. `docText`
 * takes `ItemDoc`, so each case is cast once at the call.
 */
type LooseDoc = Record<string, unknown>[];

/**
 * ONE CORPUS, put to both sides and to both sides of the migration.
 *
 * `moves` is the claim: does 0178 change this case's answer? It is asserted
 * rather than merely recorded, because "nothing regressed" and "the fix landed"
 * are two different counts and a corpus that silently stopped exercising one of
 * them would still pass every comparison in this file.
 */
const CORPUS: { name: string; doc: LooseDoc; moves: boolean }[] = [
	// ---- the cases 0178 is for ------------------------------------------
	{
		name: 'an image on its own',
		doc: [{ type: 'img', src: 'attachment:caliper.png', alt: 'A caliper reading 12.7 mm' }],
		moves: true
	},
	{
		name: 'an image between two paragraphs',
		doc: [
			{ type: 'p', runs: [{ text: 'Above' }] },
			{ type: 'img', src: 'attachment:bearing.jpg', alt: 'The bearing, exploded' },
			{ type: 'p', runs: [{ text: 'Below' }] }
		],
		moves: true
	},
	{
		name: 'two images, both described',
		doc: [
			{ type: 'img', src: 'attachment:a.png', alt: 'First' },
			{ type: 'img', src: '/idea/b.png', alt: 'Second' }
		],
		moves: true
	},
	{
		name: 'a description carrying a newline of its own',
		doc: [{ type: 'img', src: 'attachment:a.png', alt: 'One\nTwo' }],
		moves: true
	},
	{
		name: 'a description that is only whitespace (the gate refuses it; the column still has to answer)',
		doc: [{ type: 'img', src: 'attachment:a.png', alt: '   ' }],
		// `btrim` at the end of the projection eats a lone whitespace line, so
		// this is '' before AND after. Kept because it is the case where a
		// mirror written with JavaScript's `trim()` would diverge.
		moves: false
	},
	{
		name: 'a non-string description (unreachable through the gate, mirrored anyway)',
		doc: [{ type: 'img', src: 'attachment:a.png', alt: 12.7 }],
		moves: true
	},
	{
		name: 'an image with no description at all',
		doc: [
			{ type: 'p', runs: [{ text: 'a' }] },
			{ type: 'img', src: 'attachment:a.png' },
			{ type: 'p', runs: [{ text: 'b' }] }
		],
		// A blank line either way -- what changes is nothing, which is the
		// point: an image with no words must not start being SKIPPED.
		moves: false
	},
	{
		name: 'an image whose description is JSON null',
		doc: [
			{ type: 'p', runs: [{ text: 'a' }] },
			{ type: 'img', src: 'attachment:a.png', alt: null },
			{ type: 'p', runs: [{ text: 'b' }] }
		],
		moves: false
	},

	// ---- everything 0178 must leave exactly where it was ------------------
	{ name: 'an empty document', doc: [], moves: false },
	{
		name: 'one paragraph',
		doc: [{ type: 'p', runs: [{ text: 'Measure twice.' }] }],
		moves: false
	},
	{
		name: 'headings and paragraphs',
		doc: [
			{ type: 'h3', runs: [{ text: 'Setup' }] },
			{ type: 'p', runs: [{ text: 'Clamp the stock.' }] },
			{ type: 'h4', runs: [{ text: 'Note' }] }
		],
		moves: false
	},
	{
		name: 'a runless block that is not an image (still a blank line)',
		doc: [
			{ type: 'p', runs: [{ text: 'a' }] },
			{ type: 'h3' },
			{ type: 'p', runs: [{ text: 'b' }] }
		],
		moves: false
	},
	{
		name: 'a list with no items (still SKIPPED, not blank)',
		doc: [
			{ type: 'p', runs: [{ text: 'a' }] },
			{ type: 'ul', items: [] },
			{ type: 'p', runs: [{ text: 'b' }] }
		],
		moves: false
	},
	{
		name: 'a flat bulleted list',
		doc: [{ type: 'ul', items: [[{ text: 'one' }], [{ text: 'two' }]] }],
		moves: false
	},
	{
		name: 'nested lists, the 0122 shape',
		doc: [
			{
				type: 'ul',
				items: [[{ text: 'one' }, { type: 'ol', items: [[{ text: 'deeper' }]] }]]
			}
		],
		moves: false
	},
	{
		name: 'an item that is only a sublist (the leading newline btrim must NOT eat)',
		doc: [{ type: 'ul', items: [[{ type: 'ol', items: [[{ text: 'deeper' }]] }]] }],
		moves: false
	},
	{
		name: 'marks do not reach the plain text',
		doc: [
			{
				type: 'p',
				runs: [
					{ text: 'bold', bold: true },
					{ text: ' and ' },
					{ text: 'linked', href: 'https://example.com' }
				]
			}
		],
		moves: false
	},
	{
		name: 'a block type nothing recognises',
		doc: [
			{ type: 'p', runs: [{ text: 'a' }] },
			{ type: 'somethingelse', runs: [{ text: 'kept' }] }
		],
		moves: false
	}
];

describe('0178: an image contributes its description to the plain-text projection', () => {
	let db: TestDb;
	let teacher: SeededUser;
	let section: string;
	/** The DEPLOYED (0176, pre-0178) answer per case, keyed by name. */
	const before = new Map<string, string>();

	/**
	 * The projection, read AS THE CONNECTION OWNER rather than as a client.
	 *
	 * `_classroom_doc_text` is a PRIVATE helper: 0137 revoked it from `anon`
	 * and `authenticated` alike, and 0178 restates that end state by name --
	 * which is what a `create or replace` on a hosted Supabase project needs,
	 * since the bootstrapped default privileges hand a re-created function a
	 * fresh `anon` grant and `from public` would remove one entry it never
	 * had. So a client role genuinely CANNOT call this, and a test that called
	 * it as `authenticated` would only be measuring a chain that stops short of
	 * 0137. What is under test is what the function COMPUTES; who may reach it
	 * is asserted below, on its own.
	 */
	async function sqlDocText(doc: LooseDoc): Promise<string> {
		const { rows } = await db.sql<{ t: string }>(
			'select public._classroom_doc_text($1::jsonb) as t',
			[JSON.stringify(doc)]
		);
		return rows[0].t;
	}

	/** The REAL create RPC, so the table's own CHECK is in the path. */
	async function createPost(doc: LooseDoc): Promise<string> {
		return db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { item_id: string } }>(
				`select public.classroom_create_item(
					p_kind => 'post', p_section_ids => $1::uuid[], p_title => null,
					p_body => '', p_body_doc => $2::jsonb) as result`,
				[[section], JSON.stringify(doc)]
			);
			return rows[0].result.item_id;
		});
	}

	async function storedBody(itemId: string): Promise<string> {
		return db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ body: string }>(
				'select body from public.classroom_items where id = $1::uuid',
				[itemId]
			);
			return rows[0].body;
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

		// 0176 makes an image STORABLE. It does not touch the projection, which
		// is the gap this file is about.
		await db.sql(MIGRATION_0176);
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// Part 1. The world as 0176 left it.
	// -----------------------------------------------------------------------
	describe('before 0178', () => {
		it('an image contributes an EMPTY LINE, in SQL and in TypeScript alike', async () => {
			// This is 0176's own recorded finding, re-measured here so the file
			// has a baseline of its own rather than trusting another file's.
			expect(
				await sqlDocText([{ type: 'img', src: 'attachment:x.jpg', alt: 'A bearing' }])
			).toBe('');
			expect(
				await sqlDocText([
					{ type: 'p', runs: [{ text: 'Above' }] },
					{ type: 'img', src: 'attachment:x.jpg', alt: 'A bearing' },
					{ type: 'p', runs: [{ text: 'Below' }] }
				])
			).toBe('Above\n\nBelow');
		});

		it('records the deployed answer for every case in the corpus', async () => {
			for (const c of CORPUS) before.set(c.name, await sqlDocText(c.doc));
			expect(before.size, 'every case measured exactly once').toBe(CORPUS.length);
			expect(CORPUS.length, 'the corpus generated cases at all').toBeGreaterThan(15);
		});

		it('AN ANNOUNCEMENT WHOSE CONTENT IS A PICTURE CANNOT BE SAVED AT ALL', async () => {
			// The consequence that makes this a fix rather than a nicety.
			// `constraint classroom_items_post_body` (0085) is
			// `kind <> 'post' or btrim(body) <> ''` -- a TABLE check, under the
			// RPC's own field check. The gate 0176 opened is closed again one
			// layer down, and the teacher who wrote a description is told their
			// announcement has no body.
			await expect(
				createPost([{ type: 'img', src: 'attachment:teardown.jpg', alt: 'The teardown' }])
			).rejects.toThrow();
		});
	});

	// -----------------------------------------------------------------------
	// Part 2. 0178 applied over the same database.
	// -----------------------------------------------------------------------
	describe('after 0178', () => {
		beforeAll(async () => {
			await db.sql(MIGRATION_0178);
		}, 60_000);

		it('re-applies cleanly -- a migration that only works once fails exactly when it is re-pasted', async () => {
			await expect(db.sql(MIGRATION_0178)).resolves.not.toThrow();
		});

		it('stays a PRIVATE helper: neither client role may execute it, and service_role still may', async () => {
			// ASSERT THE ACL, NOT THE MIGRATION'S OWN VERDICT. `create or
			// replace` on a hosted Supabase project runs under bootstrapped
			// default privileges that write a DIRECT `anon` grant into a new
			// function's proacl, so a widening that re-created this helper
			// without naming the roles would silently re-open a private
			// projection to signed-out callers. Read back from the catalog.
			const { rows } = await db.sql<{
				anon: boolean;
				authed: boolean;
				svc: boolean;
			}>(
				`select
					has_function_privilege('anon', 'public._classroom_doc_text(jsonb)', 'execute') as anon,
					has_function_privilege('authenticated', 'public._classroom_doc_text(jsonb)', 'execute') as authed,
					has_function_privilege('service_role', 'public._classroom_doc_text(jsonb)', 'execute') as svc`
			);
			expect(rows[0].anon, 'anon must not reach a private helper').toBe(false);
			expect(rows[0].authed, 'authenticated must not reach a private helper').toBe(false);
			// POSITIVE CONTROL: the revoke narrowed rather than emptied. A
			// CHECK constraint's function runs as the WRITING role, so
			// service_role is never touched (0131).
			expect(rows[0].svc, 'service_role keeps execute').toBe(true);
		});

		it('THE MIRROR AND THE COLUMN AGREE, case for case, over the whole corpus', async () => {
			// The assertion the two sides move together FOR. One corpus, both
			// implementations, compared per case with the case named.
			let compared = 0;
			for (const c of CORPUS) {
				const fromSql = await sqlDocText(c.doc);
				expect(docText(c.doc as unknown as ItemDoc), `TS mirror vs column: ${c.name}`).toBe(
					fromSql
				);
				compared += 1;
			}
			expect(compared, 'every case compared').toBe(CORPUS.length);
		});

		it('an image now projects its description, and the cases that must not move did not', async () => {
			let moved = 0;
			let held = 0;
			for (const c of CORPUS) {
				const now = await sqlDocText(c.doc);
				const was = before.get(c.name) as string;
				if (c.moves) {
					expect(now, `${c.name} was meant to change`).not.toBe(was);
					moved += 1;
				} else {
					expect(now, `${c.name} was meant to be untouched`).toBe(was);
					held += 1;
				}
			}
			// POSITIVE CONTROL ON BOTH HALVES. A run where nothing moved would
			// mean the migration did nothing; a run where nothing held would
			// mean it moved everything.
			expect(moved, 'cases the widening was for').toBe(CORPUS.filter((c) => c.moves).length);
			expect(held, 'cases that had to be left alone').toBe(
				CORPUS.filter((c) => !c.moves).length
			);
			expect(moved).toBeGreaterThan(3);
			expect(held).toBeGreaterThan(8);
			console.log(`[0178 projection] cases=${CORPUS.length} moved=${moved} unchanged=${held}`);
		});

		it('the measured values, stated rather than only compared', async () => {
			expect(
				await sqlDocText([{ type: 'img', src: 'attachment:x.jpg', alt: 'A bearing' }])
			).toBe('A bearing');
			expect(
				await sqlDocText([
					{ type: 'p', runs: [{ text: 'Above' }] },
					{ type: 'img', src: 'attachment:x.jpg', alt: 'A bearing' },
					{ type: 'p', runs: [{ text: 'Below' }] }
				])
			).toBe('Above\nA bearing\nBelow');
		});

		it('AN ANNOUNCEMENT WHOSE CONTENT IS A PICTURE NOW SAVES, and its body is the description', async () => {
			// End to end through the REAL RPC and the REAL table check: the
			// refusal in Part 1 is gone, and what lands in the column is what
			// `itemTitle` will use as the headline on the feed card, the stream
			// row, the page title, the breadcrumb and the export filename.
			const id = await createPost([
				{ type: 'img', src: 'attachment:teardown.jpg', alt: 'The gearbox, opened' }
			]);
			expect(await storedBody(id)).toBe('The gearbox, opened');
		});

		it('a body with words and a picture keeps its words, in order', async () => {
			const id = await createPost([
				{ type: 'p', runs: [{ text: 'Bring goggles.' }] },
				{ type: 'img', src: 'attachment:bench.jpg', alt: 'The bench, laid out' }
			]);
			expect(await storedBody(id)).toBe('Bring goggles.\nThe bench, laid out');
		});

		it('an announcement with no words and no description is STILL refused', async () => {
			// The widening must not have turned the announcement rule off. An
			// image with no description projects a blank line, `btrim` eats it,
			// and the table check refuses the row exactly as before.
			await expect(createPost([{ type: 'img', src: 'attachment:x.jpg' }])).rejects.toThrow();
		});
	});
});
