// tests/notebook-note-route.test.ts
//
// The photo-less notebook entry route (/api/notebook/note), driven as the
// REAL shipped POST handler against a REAL Postgres with the REAL 0075
// notebook_create_entry applied.
//
// WHAT IS SHIMMED AND WHAT IS NOT. Only PostgREST's wire format: the shim's
// .rpc(name, args) forwards the route's OWN argument object, verbatim and
// unread, into a real named-parameter call to the real SQL function, executed
// as `authenticated` with the request.jwt.claims GUC set -- the way PostgREST
// issues one. It asserts the function NAME and nothing about the arguments,
// so the route cannot pass this test by sending something the database would
// have refused. Postgres decides; the test asks.
//
// THE POINT OF DRIVING THE ROUTE rather than just the RPC (which
// notebook-entry-photo-rule.test.ts already covers): the route is where
// "signed in" is enforced and where the argument object is built. Both are
// easy to break silently -- a dropped claims check has no visible symptom for
// the signed-in developer testing it.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { POST } from '../src/routes/api/notebook/note/+server';

let db: TestDb;
let student: SeededUser;
let sectionId: string;
let sessionId: string;

beforeAll(async () => {
	db = await startTestDb();
	student = await createUser(db, 'ramona.pike@boscotech.net', 'Ramona Pike');
	const teacher = await createUser(db, 'chair@boscotech.edu', 'Dana Chair');

	const section = await db.sql<{ id: string }>(
		`insert into public.notebook_sections (course_id, section_label, instructor_id)
		 values ('eng1h-sophomore', 'Period 2', $1) returning id`,
		[teacher.id]
	);
	sectionId = section.rows[0].id;

	const session = await db.sql<{ id: string }>(
		`insert into public.notebook_sessions (section_id, unit_number, session_date, session_label)
		 values ($1, 3, current_date, 'Bearing teardown') returning id`,
		[sectionId]
	);
	sessionId = session.rows[0].id;
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

/**
 * PostgREST's .rpc(), translated to SQL. The argument object is passed
 * through as given -- the keys become the named parameters -- so whatever the
 * route builds is what the function receives.
 */
function supabaseFor(userId: string) {
	return {
		async rpc(fn: string, args: Record<string, unknown>) {
			expect(fn).toBe('notebook_create_entry');
			const names = Object.keys(args);
			const placeholders = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
			return db.asUser(userId, async (q) => {
				try {
					const { rows } = await q<{ result: unknown }>(
						`select public.${fn}(${placeholders}) as result`,
						names.map((n) => args[n])
					);
					return { data: rows[0].result, error: null };
				} catch (e) {
					// PostgREST surfaces a raised exception as an error object,
					// not a throw, which is what the route branches on.
					return { data: null, error: { message: (e as Error).message } };
				}
			});
		}
	};
}

/** Calls the REAL route handler the way SvelteKit would. */
function callRoute(body: unknown, userId: string | null, raw?: string): Promise<Response> {
	return (POST as unknown as (event: unknown) => Promise<Response>)({
		request: new Request('http://localhost/api/notebook/note', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: raw ?? JSON.stringify(body)
		}),
		locals: {
			supabase: userId ? supabaseFor(userId) : null,
			claims: userId ? { sub: userId, role: 'authenticated' } : null
		}
	});
}

function entryCount(label: string) {
	return db
		.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries where custom_label = $1`,
			[label]
		)
		.then((r) => Number(r.rows[0].n));
}

describe('POST /api/notebook/note', () => {
	it('creates a photo-less entry for the signed-in caller', async () => {
		const res = await callRoute({ custom_label: 'Talked through the gearbox ratio' }, student.id);
		expect(res.status).toBe(200);

		const body = (await res.json()) as { ok: boolean; entry: { entry_id: string } };
		expect(body.ok).toBe(true);
		expect(body.entry.entry_id).toBeTruthy();

		const { rows } = await db.sql<{
			student_id: string;
			custom_label: string;
			session_id: string | null;
			photos: string;
		}>(
			`select e.student_id, e.custom_label, e.session_id,
			        (select count(*) from public.notebook_entry_photos p where p.entry_id = e.id)::text as photos
			   from public.notebook_entries e where e.id = $1`,
			[body.entry.entry_id]
		);
		expect(rows[0].student_id).toBe(student.id);
		expect(rows[0].custom_label).toBe('Talked through the gearbox ratio');
		expect(rows[0].session_id).toBeNull();
		expect(Number(rows[0].photos)).toBe(0);
	});

	// THE AUTH BOUNDARY. No session, no write -- and no database touch at all:
	// the shim is only ever built for a caller with a claims object, so a
	// handler that skipped the check would fail on a null client, loudly.
	it('401s with no session, and writes nothing', async () => {
		const before = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries`
		);
		const res = await callRoute({ custom_label: 'anonymous note' }, null);
		expect(res.status).toBe(401);
		const after = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries`
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);
		expect(await entryCount('anonymous note')).toBe(0);
	});

	// The route passes session_id THROUGH rather than blocking it, so this is
	// the RPC's rule being enforced end to end and not a second copy of it.
	it('surfaces the RPC refusal for a session-linked note', async () => {
		const res = await callRoute(
			{ custom_label: 'no page today', session_id: sessionId },
			student.id
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toMatch(/Drive file id is required/i);
		expect(await entryCount('no page today')).toBe(0);
	});

	it('surfaces the RPC refusal when there is nothing to record', async () => {
		const res = await callRoute({}, student.id);
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toMatch(/photo or a label/i);
	});

	it('accepts an optional section and stores it', async () => {
		const res = await callRoute(
			{ custom_label: 'Shop layout notes', section_id: sectionId },
			student.id
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { entry: { entry_id: string } };
		const { rows } = await db.sql<{ section_id: string }>(
			`select section_id from public.notebook_entries where id = $1`,
			[body.entry.entry_id]
		);
		expect(rows[0].section_id).toBe(sectionId);
	});

	it('rejects a malformed id and a non-JSON body before reaching the database', async () => {
		expect((await callRoute({ custom_label: 'x', session_id: 'nope' }, student.id)).status).toBe(
			400
		);
		expect((await callRoute({ custom_label: 'x', section_id: 'nope' }, student.id)).status).toBe(
			400
		);
		expect((await callRoute(null, student.id, 'not json at all')).status).toBe(400);
		// An over-long label is refused here rather than by the column's own
		// 200-char CHECK, so the student gets a sentence instead of a
		// constraint name.
		const long = await callRoute({ custom_label: 'x'.repeat(201) }, student.id);
		expect(long.status).toBe(400);
		expect(((await long.json()) as { error: string }).error).toMatch(/200 characters/i);
	});
});
