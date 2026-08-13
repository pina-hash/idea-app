// tests/notebook-note-route.test.ts
//
// The written-note entry route (/api/notebook/note), driven as the REAL
// shipped POST handler against a REAL Postgres with the REAL 0078
// notebook_create_note_entry applied.
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
// notebook-notes.test.ts already covers): the route is where "signed in" is
// enforced, where the argument object is built, and -- since 0078 -- where
// the SANITIZER runs. All three are easy to break silently; a dropped claims
// check in particular has no visible symptom for the signed-in developer
// testing it.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { POST } from '../src/routes/api/notebook/note/+server';

let db: TestDb;
let student: SeededUser;
let sectionId: string;

/** What the editor actually posts: a ProseMirror document. */
const editorDoc = (text: string) => ({
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
});

beforeAll(async () => {
	db = await startTestDb();
	student = await createUser(db, 'ramona.pike@boscotech.net', 'Ramona Pike');
	const teacher = await createUser(db, 'chair@boscotech.edu', 'Dana Chair');

	// Since 0094 the notebook hangs off a CLASSROOM section, and "the
	// instructor" is its teacher of record. Created through the real 0082 RPC.
	sectionId = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 2',
		teacherEmail: teacher.email
	});
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
			expect(fn).toBe('notebook_create_note_entry');
			const names = Object.keys(args);
			const placeholders = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
			return db.asUser(userId, async (q) => {
				try {
					const { rows } = await q<{ result: unknown }>(
						`select public.${fn}(${placeholders}) as result`,
						// jsonb parameters have to arrive as JSON text, which is what
						// the supabase client does over the wire too.
						names.map((n) => {
							const value = args[n];
							return value !== null && typeof value === 'object'
								? JSON.stringify(value)
								: value;
						})
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

function noteText(entryId: string) {
	return db
		.sql<{ text: string }>(
			`select content -> 0 -> 'runs' -> 0 ->> 'text' as text
			   from public.notebook_entry_notes where entry_id = $1`,
			[entryId]
		)
		.then((r) => r.rows[0]?.text ?? null);
}

describe('POST /api/notebook/note', () => {
	it('creates a photo-less entry plus its first note, for the signed-in caller', async () => {
		const res = await callRoute(
			{ content: editorDoc('Talked through the gearbox ratio'), custom_label: 'Gearbox chat' },
			student.id
		);
		expect(res.status).toBe(200);

		const body = (await res.json()) as { ok: boolean; entry: { entry_id: string } };
		expect(body.ok).toBe(true);

		const { rows } = await db.sql<{
			student_id: string;
			custom_label: string;
			session_id: string | null;
			photos: string;
			notes: string;
		}>(
			`select e.student_id, e.custom_label, e.session_id,
			        (select count(*) from public.notebook_entry_photos p where p.entry_id = e.id)::text as photos,
			        (select count(*) from public.notebook_entry_notes n where n.entry_id = e.id)::text as notes
			   from public.notebook_entries e where e.id = $1`,
			[body.entry.entry_id]
		);
		expect(rows[0].student_id).toBe(student.id);
		expect(rows[0].custom_label).toBe('Gearbox chat');
		expect(rows[0].session_id).toBeNull();
		expect(Number(rows[0].photos)).toBe(0);
		expect(Number(rows[0].notes)).toBe(1);
		expect(await noteText(body.entry.entry_id)).toBe('Talked through the gearbox ratio');
	});

	// custom_label is a TITLE now, so an untitled note is the ordinary case.
	it('accepts a note with no title', async () => {
		const res = await callRoute({ content: editorDoc('No page to shoot yet.') }, student.id);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { entry: { entry_id: string } };
		const { rows } = await db.sql<{ custom_label: string | null }>(
			`select custom_label from public.notebook_entries where id = $1`,
			[body.entry.entry_id]
		);
		expect(rows[0].custom_label).toBeNull();
	});

	// THE AUTH BOUNDARY. No session, no write -- and no database touch at all:
	// the shim is only ever built for a caller with a claims object, so a
	// handler that skipped the check would fail on a null client, loudly.
	it('401s with no session, and writes nothing', async () => {
		const before = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries`
		);
		const res = await callRoute({ content: editorDoc('anonymous note') }, null);
		expect(res.status).toBe(401);
		const after = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries`
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);
	});

	it('refuses a note with nothing in it, and writes nothing', async () => {
		const before = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries`
		);
		for (const body of [{}, { content: editorDoc('   ') }, { custom_label: 'title only' }]) {
			const res = await callRoute(body, student.id);
			expect(res.status).toBe(400);
			expect(((await res.json()) as { error: string }).error).toMatch(/needs some text/i);
		}
		const after = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries`
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);
	});

	// THE SANITIZER, END TO END. The editor cannot produce these, but a hand
	// -rolled POST can -- and what lands in the database must be the closed
	// note shape either way.
	it('stores only the closed shape, whatever the body carried', async () => {
		const res = await callRoute(
			{
				content: {
					type: 'doc',
					content: [
						{
							type: 'paragraph',
							content: [
								{
									type: 'text',
									text: 'click me',
									marks: [
										{ type: 'link', attrs: { href: 'javascript:alert(1)' } },
										{ type: 'evil', attrs: { onclick: 'alert(1)' } }
									]
								}
							]
						},
						{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Heading' }] },
						{ type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } }
					]
				}
			},
			student.id
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { entry: { entry_id: string } };

		const { rows } = await db.sql<{ content: unknown }>(
			`select content from public.notebook_entry_notes where entry_id = $1`,
			[body.entry.entry_id]
		);
		// The dangerous link is gone but the WORDS survive; the heading became
		// a paragraph; the image contributed nothing at all.
		expect(rows[0].content).toEqual([
			{ type: 'p', runs: [{ text: 'click me' }] },
			{ type: 'p', runs: [{ text: 'Heading' }] }
		]);
	});

	it('accepts an optional section and stores it', async () => {
		const res = await callRoute(
			{ content: editorDoc('Shop layout notes'), section_id: sectionId },
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

	it('rejects a malformed id, a non-JSON body and an over-long title', async () => {
		expect(
			(await callRoute({ content: editorDoc('x'), section_id: 'nope' }, student.id)).status
		).toBe(400);
		expect((await callRoute(null, student.id, 'not json at all')).status).toBe(400);
		// An over-long title is refused here rather than by the column's own
		// 200-char CHECK, so the student gets a sentence instead of a
		// constraint name.
		const long = await callRoute(
			{ content: editorDoc('x'), custom_label: 'x'.repeat(201) },
			student.id
		);
		expect(long.status).toBe(400);
		expect(((await long.json()) as { error: string }).error).toMatch(/200 characters/i);
	});
});
