// tests/db/classroom-draft-checkpoint.test.ts
//
// 0061: "I click save draft and instead of just saving one draft it starts
// making infinite copies of that draft."
//
// WHAT THIS FILE IS FOR, and why it is a database test rather than a harness
// drive. The symptom is a ROW COUNT, and a row count is exactly the thing a
// mounted component cannot answer: the composer's own transports are injected,
// so a DOM test can only ever say how many times the client CALLED a create.
// Whether N calls become N rows is a question for `classroom_create_item`, and
// the answer turns out to matter -- see part 2, which measures what an
// accidental second create actually leaves in the table (a fully-formed,
// perfectly ordinary item with a null title, indistinguishable from one a
// teacher meant to make, which is why the cleanup query in the history entry
// cannot key on "looks empty" alone).
//
// THE REAL SAVE PATH, END TO END. This drives `POST /api/classroom/item` --
// the shipped handler, imported from its own file -- against REAL embedded
// Postgres with the REAL migration files applied unmodified, as a real
// signed-in teacher through the PostgREST shim. Nothing about the write is
// reimplemented here: the RPC that runs is the RPC production runs, under the
// caller's own identity, with RLS and the grants in force.
//
// THE POSITIVE CONTROL IS THE POINT OF PART 1. "One row exists after a save"
// passes trivially on a working save and proves nothing about a loop, so the
// shape asserted is the one the defect actually broke: FIVE presses, one row,
// measured against the same five presses issued the way the composer used to
// issue them (five creates), which leaves five.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { createPostgrestShim, loadForeignKeys } from './postgrest-shim';
import { POST } from '../../src/routes/api/classroom/item/+server';

/** The classroom chain, up to and including the rich body the route sends. */
const CHAIN = [
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

/** What the composer's `itemInput()` becomes on the wire, for one draft. */
function draftPayload(extra: Record<string, unknown> = {}) {
	return {
		mode: 'create',
		kind: 'assignment',
		published: false,
		title: 'Bridge lab writeup',
		bodyDoc: [{ type: 'p', runs: [{ text: 'Measure the deflection at 2 N.' }] }],
		points: 20,
		dueAt: null,
		publishAt: null,
		category: 'Unit Labs',
		links: [],
		...extra
	};
}

describe('0061: a draft save is a checkpoint, not a new row every time', () => {
	let db: TestDb;
	let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
	let teacher: SeededUser;
	let section: string;

	/**
	 * THE SHIM, WITH JSON ARGUMENTS SPELLED THE WAY PostgREST SPELLS THEM.
	 *
	 * `createPostgrestShim` calls a function in named notation and hands each
	 * argument to node-postgres as it stands, which is right for `uuid[]` (it
	 * wants a Postgres array literal) and wrong for `jsonb` (node-postgres
	 * serializes a JS array as `{...}`, and Postgres answers "invalid input
	 * syntax for type json"). PostgREST has no such split: it receives one JSON
	 * body and every parameter arrives as JSON text that Postgres casts by the
	 * function's declared type.
	 *
	 * So the types are READ FROM THE CATALOG rather than listed here. A
	 * hardcoded `['p_body_doc', 'p_resources']` would be a second, silent copy
	 * of the RPC's signature -- it would still pass on the day a parameter
	 * changed type, testing the wrong marshalling and reporting green.
	 */
	async function jsonArgNames(fn: string): Promise<Set<string>> {
		const { rows } = await db.sql<{ names: string[] | null }>(
			`select array_agg(a.name) as names
			   from pg_proc p
			   join pg_namespace ns on ns.oid = p.pronamespace,
			        unnest(p.proargnames, p.proargtypes::oid[]) as a(name, typ)
			  where ns.nspname = 'public' and p.proname = $1
			    and format_type(a.typ, null) in ('jsonb', 'json')`,
			[fn]
		);
		return new Set(rows[0]?.names ?? []);
	}

	function jsonAwareShim(userId: string | null): SupabaseClient {
		const inner = createPostgrestShim(db, fks, userId) as unknown as SupabaseClient & {
			rpc(name: string, args?: Record<string, unknown>): Promise<unknown>;
		};
		return {
			...(inner as unknown as Record<string, unknown>),
			from: (t: string) => (inner as unknown as { from(t: string): unknown }).from(t),
			async rpc(name: string, args?: Record<string, unknown>) {
				const jsonArgs = await jsonArgNames(name);
				const shaped = Object.fromEntries(
					Object.entries(args ?? {}).map(([k, v]) => [
						k,
						jsonArgs.has(k) && v !== null && typeof v === 'object' ? JSON.stringify(v) : v
					])
				);
				return inner.rpc(name, shaped);
			}
		} as unknown as SupabaseClient;
	}

	/** The shipped route handler, called the way SvelteKit calls it. */
	async function post(
		body: Record<string, unknown>,
		as: SeededUser | null = teacher
	): Promise<{ status: number; body: Record<string, unknown> }> {
		const supabase = jsonAwareShim(as?.id ?? null);
		const res = await POST({
			request: new Request('http://localhost/api/classroom/item', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			}),
			locals: { supabase, claims: as ? { sub: as.id } : null }
		} as never);
		return { status: res.status, body: (await res.json()) as Record<string, unknown> };
	}

	async function itemCount(): Promise<number> {
		const { rows } = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.classroom_items'
		);
		return Number(rows[0].n);
	}

	async function itemsHere(): Promise<
		{ id: string; title: string | null; body: string; published: boolean }[]
	> {
		const { rows } = await db.sql<{
			id: string;
			title: string | null;
			body: string;
			published: boolean;
		}>(
			`select i.id, i.title, i.body, i.published
			   from public.classroom_items i
			  order by i.created_at, i.id`
		);
		return rows;
	}

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		fks = await loadForeignKeys(db);
		teacher = await createUser(db, 'vargas@boscotech.edu', 'T. Vargas');

		const course = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { course_id: string } }>(
				"select public.classroom_upsert_course('IDEA209H', 'Engineering I Honors') as result"
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
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// Part 1. THE CONTRACT, and the control that makes it mean something.
	// -----------------------------------------------------------------------
	describe('five presses of Save draft', () => {
		it('CONTROL: issued as five creates, the way the composer used to, leaves five rows', async () => {
			const before = await itemCount();
			for (let press = 1; press <= 5; press++) {
				const res = await post(draftPayload({ sectionIds: [section] }));
				expect(res.status).toBe(200);
				expect(res.body.item_id).toBeTruthy();
			}
			// The positive control for the assertion below: the database is
			// perfectly willing to write five, so a later count of one is the
			// CLIENT holding its handle and not the server refusing anything.
			expect(await itemCount()).toBe(before + 5);
		});

		it('issued as one create then four updates, leaves exactly ONE row', async () => {
			const before = await itemCount();

			// Press 1: no handle yet, so a create -- `saveTarget`'s own decision.
			const first = await post(draftPayload({ sectionIds: [section] }));
			expect(first.status).toBe(200);
			const itemId = String(first.body.item_id);
			expect(itemId).toBeTruthy();

			// Presses 2..5: the composer now holds `createdItemId`, so every one
			// of them is an update of the row press 1 made.
			for (let press = 2; press <= 5; press++) {
				const res = await post(
					draftPayload({ mode: 'update', id: itemId, title: `Bridge lab writeup v${press}` })
				);
				expect(res.status).toBe(200);
				expect(res.body.item_id).toBe(itemId);
			}

			expect(await itemCount()).toBe(before + 1);

			// And the row carries the LAST thing typed, not the first: a
			// checkpoint that kept the handle but dropped the content would count
			// correctly here and still lose four presses of work.
			const { rows } = await db.sql<{ title: string | null; published: boolean }>(
				'select title, published from public.classroom_items where id = $1::uuid',
				[itemId]
			);
			expect(rows[0].title).toBe('Bridge lab writeup v5');
			// Still a draft. A checkpoint must not publish anything.
			expect(rows[0].published).toBe(false);
		});

		it('the update path does not need the composer to leave create mode', async () => {
			// `saveTarget` answers `update` for a create-mode composer holding a
			// created id, which is the whole mechanism -- so the wire shape a
			// checkpoint sends is `mode: 'update'` with no `kind` and no
			// `sectionIds`, and the route must accept exactly that.
			const first = await post(draftPayload({ sectionIds: [section] }));
			const itemId = String(first.body.item_id);
			const second = await post({
				mode: 'update',
				id: itemId,
				published: false,
				title: 'Second pass',
				bodyDoc: [{ type: 'p', runs: [{ text: 'More.' }] }],
				points: 20,
				dueAt: null,
				publishAt: null,
				category: 'Unit Labs',
				links: []
			});
			expect(second.status).toBe(200);
			expect(second.body.item_id).toBe(itemId);
		});
	});

	// -----------------------------------------------------------------------
	// Part 2. WHAT THE EMPTIED FORM ACTUALLY DID, measured rather than assumed.
	//
	// The composer used to WIPE every field on a draft save, so the next press
	// went out with a null title and an empty body. The first reading of the
	// DOM reproduction was that those presses wrote empty rows. THE DATABASE
	// SAYS OTHERWISE, and it changes what production is holding: 0085 requires
	// a title on an assignment and a material, and a body on an announcement,
	// so every press after the wipe was REFUSED.
	//
	// That is the second symptom, exactly: press Save draft, watch the writing
	// disappear out of the box, press it again, and be told "A title is
	// required." about work that was in front of you a second ago. Nothing on
	// screen says the row is safe on the server -- so it reads as lost.
	// -----------------------------------------------------------------------
	describe('the press after the form was wiped', () => {
		it('is REFUSED on an assignment, naming a title nobody can see any more', async () => {
			const before = await itemCount();
			const res = await post({
				mode: 'create',
				kind: 'assignment',
				sectionIds: [section],
				published: false,
				title: null,
				bodyDoc: [],
				points: null,
				dueAt: null,
				publishAt: null,
				category: null,
				links: []
			});
			expect(res.status).toBe(400);
			expect(String(res.body.error)).toMatch(/title is required/i);
			expect(await itemCount()).toBe(before);
		});

		it('is REFUSED on an announcement too, for the field that kind requires', async () => {
			// The kinds refuse on DIFFERENT fields (0085: a post needs a body, the
			// other two need a title), so asserting one kind would leave the other
			// free to write an empty row with nothing noticing.
			const before = await itemCount();
			const res = await post({
				mode: 'create',
				kind: 'post',
				sectionIds: [section],
				published: false,
				title: null,
				bodyDoc: [],
				points: null,
				dueAt: null,
				publishAt: null,
				category: null,
				links: []
			});
			expect(res.status).toBe(400);
			expect(String(res.body.error)).toMatch(/needs a body/i);
			expect(await itemCount()).toBe(before);
		});

		it('CONTROL: the same payload WITH the writing still in it is accepted', async () => {
			// Without this the two refusals above would pass just as well against
			// a route that refused everything.
			const before = await itemCount();
			const res = await post(draftPayload({ sectionIds: [section] }));
			expect(res.status).toBe(200);
			expect(await itemCount()).toBe(before + 1);
		});
	});

	// -----------------------------------------------------------------------
	// Part 3. WHAT A SURPLUS COPY LOOKS LIKE, and the query that finds one.
	//
	// A copy is therefore never an empty row -- an empty one could not be
	// written. It is a FULL copy: the same title and body, on the same
	// sections, from the same author, minutes apart, because the failure path
	// left the form intact and the durability net re-issued the whole create.
	// So a cleanup keys on identical content, never on emptiness.
	//
	// The query is in the history entry for a person to run by hand; it is
	// asserted here so that sentence is one somebody executed rather than one
	// somebody wrote down. It FINDS, it never deletes.
	// -----------------------------------------------------------------------
	describe('the surplus-copy query', () => {
		it('groups identical drafts and never names a draft that stands alone', async () => {
			// Two identical drafts, the shape a re-issued create leaves behind.
			const a = await post(draftPayload({ sectionIds: [section], title: 'Deflection writeup' }));
			const b = await post(draftPayload({ sectionIds: [section], title: 'Deflection writeup' }));
			expect(a.status).toBe(200);
			expect(b.status).toBe(200);
			// And one that is genuinely its own item, which must NOT be named.
			const solo = await post(
				draftPayload({ sectionIds: [section], title: 'A different brief entirely' })
			);
			expect(solo.status).toBe(200);

			const { rows } = await db.sql<{
				title: string | null;
				copies: string;
				keep: string;
				surplus: string[];
			}>(
				`select i.title,
				        count(*)::text as copies,
				        (array_agg(i.id order by i.created_at, i.id))[1]::text as keep,
				        (array_agg(i.id order by i.created_at, i.id))[2:] as surplus
				   from public.classroom_items i
				  where i.published = false
				  group by i.author_email, i.kind, i.title, i.body
				 having count(*) > 1
				  order by count(*) desc`
			);

			const dup = rows.find((r) => r.title === 'Deflection writeup');
			expect(dup).toBeTruthy();
			expect(Number(dup!.copies)).toBe(2);
			// It keeps the OLDEST and offers exactly the rest.
			expect(dup!.surplus).toHaveLength(1);
			expect(dup!.surplus[0]).not.toBe(dup!.keep);

			// The negative half, and it is the half that matters: a draft with no
			// twin is never in the result at all.
			expect(rows.some((r) => r.title === 'A different brief entirely')).toBe(false);
		});
	});
});
