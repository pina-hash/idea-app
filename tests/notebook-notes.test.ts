// tests/notebook-notes.test.ts
//
// The 0078 written-note layer, against a REAL Postgres with the REAL
// migrations applied unmodified.
//
// WHY THIS EARNS A TEST when most of this repo is verified by dev harnesses:
// every guarantee here fails SILENTLY. A note that can be edited on a
// scheduled check-in still saves, still renders, and still looks completely
// correct to the student doing it -- the only symptom is that reviewed work
// changed after it was reviewed. Same for the revision chain (an UPDATE in
// place loses history with no error), the ownership checks, and the content
// gate (a note reaching the RPC through PostgREST never touches the route
// that sanitizes it).
//
// The route layer is deliberately NOT shimmed here: these are the database's
// own rules, asserted as `authenticated` with the request.jwt.claims GUC set,
// exactly the way PostgREST issues a call.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

let db: TestDb;
let student: SeededUser;
let other: SeededUser;
let teacher: SeededUser;
let sectionId: string;
let sessionId: string;

/** The canonical doc shape, as src/lib/notebook-notes.ts defines it. */
const doc = (text: string) => JSON.stringify([{ type: 'p', runs: [{ text }] }]);

beforeAll(async () => {
	db = await startTestDb();
	student = await createUser(db, 'ramona.pike@boscotech.net', 'Ramona Pike');
	other = await createUser(db, 'devon.hale@boscotech.net', 'Devon Hale');
	teacher = await createUser(db, 'chair@boscotech.edu', 'Dana Chair');

	// Since 0094 the notebook hangs off a CLASSROOM section, and "the
	// instructor" is its teacher of record. Created through the real 0082 RPC.
	sectionId = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 2',
		teacherEmail: teacher.email
	});

	// Since 0098 a check-in is a canonical row plus one posting per section,
	// so it is seeded through the real RPC rather than by hand.
	const session = await db.asUser(teacher.id, (q) =>
		q<{ result: { session_id: string } }>(
			'select public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4) as result',
			[[sectionId], 3, '2026-10-14', 'Bearing teardown']
		)
	);
	sessionId = session.rows[0].result.session_id;
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

/** Calls an RPC the way PostgREST does: named parameters, as `authenticated`. */
function rpc<T = Record<string, string>>(
	userId: string,
	fn: string,
	args: Record<string, unknown>
): Promise<T> {
	const names = Object.keys(args);
	const placeholders = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(
			`select public.${fn}(${placeholders}) as result`,
			names.map((n) => args[n])
		);
		return rows[0].result;
	});
}

/** A session-linked entry with one photo, owned by `student`. */
async function sessionEntry(): Promise<string> {
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.notebook_entries (student_id, section_id, session_id)
		 values ($1, $2, $3) returning id`,
		[student.id, sectionId, sessionId]
	);
	await db.sql(
		`insert into public.notebook_entry_photos (entry_id, drive_file_id, variant, sequence_order)
		 values ($1, 'drive-x', 'original', 1)`,
		[rows[0].id]
	);
	return rows[0].id;
}

describe('notebook_create_note_entry', () => {
	it('creates a free-form entry and its first revision in one go', async () => {
		const result = await rpc(student.id, 'notebook_create_note_entry', {
			p_content: doc('Talked through the gearbox ratio with Mr. Pina.'),
			p_custom_label: 'Gearbox chat'
		});

		const { rows } = await db.sql<{
			custom_label: string;
			session_id: string | null;
			photos: string;
			notes: string;
		}>(
			`select e.custom_label, e.session_id,
			        (select count(*) from public.notebook_entry_photos p where p.entry_id = e.id)::text as photos,
			        (select count(*) from public.notebook_entry_notes n where n.entry_id = e.id)::text as notes
			   from public.notebook_entries e where e.id = $1`,
			[result.entry_id]
		);
		expect(rows[0].custom_label).toBe('Gearbox chat');
		expect(rows[0].session_id).toBeNull();
		expect(Number(rows[0].photos)).toBe(0);
		expect(Number(rows[0].notes)).toBe(1);

		// Revision 1 is its own root and replaced nothing.
		const note = await db.sql<{
			id: string;
			note_id: string;
			revision: number;
			supersedes_id: string | null;
			author_id: string;
		}>(
			`select id, note_id, revision, supersedes_id, author_id
			   from public.notebook_entry_notes where entry_id = $1`,
			[result.entry_id]
		);
		expect(note.rows[0].note_id).toBe(note.rows[0].id);
		expect(note.rows[0].revision).toBe(1);
		expect(note.rows[0].supersedes_id).toBeNull();
		expect(note.rows[0].author_id).toBe(student.id);
	});

	// A titleless note is the ordinary case: custom_label is a TITLE now, and
	// 0075's "a free-form entry needs a photo or a label" must not resurface
	// here as a required title.
	it('accepts a note with no title at all', async () => {
		const result = await rpc(student.id, 'notebook_create_note_entry', {
			p_content: doc('No page to shoot yet.')
		});
		const { rows } = await db.sql<{ custom_label: string | null }>(
			`select custom_label from public.notebook_entries where id = $1`,
			[result.entry_id]
		);
		expect(rows[0].custom_label).toBeNull();
	});

	it('writes nothing when the content is refused', async () => {
		const before = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries`
		);
		await expect(
			rpc(student.id, 'notebook_create_note_entry', { p_content: JSON.stringify([]) })
		).rejects.toThrow(/not a valid note/i);
		const after = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries`
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);
	});
});

describe('notebook_add_note', () => {
	it('adds notes to one entry over time, each its own chain', async () => {
		const entry = await rpc(student.id, 'notebook_create_note_entry', {
			p_content: doc('Day one.')
		});

		const second = await rpc(student.id, 'notebook_add_note', {
			p_entry_id: entry.entry_id,
			p_content: doc('Day two, same entry.')
		});
		const third = await rpc(student.id, 'notebook_add_note', {
			p_entry_id: entry.entry_id,
			p_content: doc('Day three.')
		});

		expect(new Set([entry.note_id, second.note_id, third.note_id]).size).toBe(3);
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entry_notes where entry_id = $1`,
			[entry.entry_id]
		);
		expect(Number(rows[0].n)).toBe(3);
	});

	// Notes are welcome on a check-in; only EDITING one is refused.
	it('allows a note on a session-linked entry', async () => {
		const entryId = await sessionEntry();
		const note = await rpc(student.id, 'notebook_add_note', {
			p_entry_id: entryId,
			p_content: doc('Ran out of time to finish the second page.')
		});
		expect(note.note_id).toBeTruthy();
	});

	// notebook_add_photo flips a flagged entry to pending_review; a note is not
	// a page, so it must not.
	it('leaves a flagged entry flagged', async () => {
		const entry = await rpc(student.id, 'notebook_create_note_entry', {
			p_content: doc('Original.')
		});
		await db.sql(`update public.notebook_entries set status = 'flagged' where id = $1`, [
			entry.entry_id
		]);
		await rpc(student.id, 'notebook_add_note', {
			p_entry_id: entry.entry_id,
			p_content: doc('Answering the flag.')
		});
		const { rows } = await db.sql<{ status: string }>(
			`select status from public.notebook_entries where id = $1`,
			[entry.entry_id]
		);
		expect(rows[0].status).toBe('flagged');
	});

	it("refuses another student's entry, and an entry that does not exist", async () => {
		const entry = await rpc(student.id, 'notebook_create_note_entry', {
			p_content: doc('Mine.')
		});
		await expect(
			rpc(other.id, 'notebook_add_note', {
				p_entry_id: entry.entry_id,
				p_content: doc('Not yours.')
			})
		).rejects.toThrow(/does not exist or is not yours/i);
		await expect(
			rpc(student.id, 'notebook_add_note', {
				p_entry_id: '00000000-0000-0000-0000-000000000000',
				p_content: doc('Nowhere.')
			})
		).rejects.toThrow(/does not exist or is not yours/i);
	});
});

describe('notebook_edit_note', () => {
	it('appends a revision instead of overwriting, keeping every earlier version', async () => {
		const entry = await rpc(student.id, 'notebook_create_note_entry', {
			p_content: doc('First draft.')
		});
		const second = await rpc(student.id, 'notebook_edit_note', {
			p_note_id: entry.note_id,
			p_content: doc('Second draft.')
		});
		const third = await rpc(student.id, 'notebook_edit_note', {
			p_note_id: entry.note_id,
			p_content: doc('Third draft.')
		});
		expect(second.revision).toBe(2);
		expect(third.revision).toBe(3);

		const { rows } = await db.sql<{
			revision: number;
			text: string;
			supersedes_id: string | null;
			id: string;
			note_id: string;
		}>(
			`select revision, content -> 0 -> 'runs' -> 0 ->> 'text' as text, supersedes_id, id, note_id
			   from public.notebook_entry_notes where note_id = $1 order by revision`,
			[entry.note_id]
		);
		expect(rows.map((r) => r.text)).toEqual(['First draft.', 'Second draft.', 'Third draft.']);
		// The chain is genuinely linked, not merely numbered.
		expect(rows[0].supersedes_id).toBeNull();
		expect(rows[1].supersedes_id).toBe(rows[0].id);
		expect(rows[2].supersedes_id).toBe(rows[1].id);
		// And the note's identity survived every edit.
		expect(new Set(rows.map((r) => r.note_id)).size).toBe(1);
	});

	// THE RULE THIS FILE EXISTS FOR. The UI hides the control; the database is
	// what makes it a rule.
	it('REFUSES an edit on a session-linked entry, and writes nothing', async () => {
		const entryId = await sessionEntry();
		const note = await rpc(student.id, 'notebook_add_note', {
			p_entry_id: entryId,
			p_content: doc('What I got through today.')
		});

		await expect(
			rpc(student.id, 'notebook_edit_note', {
				p_note_id: note.note_id,
				p_content: doc('Rewritten after the fact.')
			})
		).rejects.toThrow(/scheduled check-in cannot be edited/i);

		const { rows } = await db.sql<{ n: string; text: string }>(
			`select count(*)::text as n,
			        max(content -> 0 -> 'runs' -> 0 ->> 'text') as text
			   from public.notebook_entry_notes where note_id = $1`,
			[note.note_id]
		);
		expect(Number(rows[0].n)).toBe(1);
		expect(rows[0].text).toBe('What I got through today.');
	});

	// Detaching a session (notebook_admin_delete_session) makes an entry
	// free-form, and its notes editable again -- the restriction is about what
	// the entry IS, not a permanent brand on the note.
	it('allows the edit once the entry is no longer session-linked', async () => {
		const entryId = await sessionEntry();
		const note = await rpc(student.id, 'notebook_add_note', {
			p_entry_id: entryId,
			p_content: doc('Before the detach.')
		});
		await db.sql(
			`update public.notebook_entries set session_id = null, custom_label = 'Detached'
			  where id = $1`,
			[entryId]
		);
		const edited = await rpc(student.id, 'notebook_edit_note', {
			p_note_id: note.note_id,
			p_content: doc('After the detach.')
		});
		expect(edited.revision).toBe(2);
	});

	it("refuses another student's note and an unknown note", async () => {
		const entry = await rpc(student.id, 'notebook_create_note_entry', {
			p_content: doc('Private.')
		});
		await expect(
			rpc(other.id, 'notebook_edit_note', {
				p_note_id: entry.note_id,
				p_content: doc('Tampering.')
			})
		).rejects.toThrow(/not yours/i);
		await expect(
			rpc(student.id, 'notebook_edit_note', {
				p_note_id: '00000000-0000-0000-0000-000000000000',
				p_content: doc('Nowhere.')
			})
		).rejects.toThrow(/does not exist/i);
	});

	// An instructor reads notes; they never rewrite one.
	it('refuses the section instructor', async () => {
		const entryId = await sessionEntry();
		await db.sql(`update public.notebook_entries set session_id = null where id = $1`, [entryId]);
		const note = await rpc(student.id, 'notebook_add_note', {
			p_entry_id: entryId,
			p_content: doc("Student's own words.")
		});
		await expect(
			rpc(teacher.id, 'notebook_edit_note', {
				p_note_id: note.note_id,
				p_content: doc('Instructor rewrite.')
			})
		).rejects.toThrow(/not yours/i);
	});
});

describe('the content gate (a caller that skips the route entirely)', () => {
	const refused: [string, unknown][] = [
		['a bare string', 'just some text'],
		['a number', 42],
		['an object instead of an array', { type: 'p', runs: [] }],
		['an unknown block type', [{ type: 'script', runs: [{ text: 'x' }] }]],
		['a heading smuggled in', [{ type: 'h1', runs: [{ text: 'x' }] }]],
		['an extra key on a block', [{ type: 'p', runs: [{ text: 'x' }], onclick: 'alert(1)' }]],
		['an extra key on a run', [{ type: 'p', runs: [{ text: 'x', style: 'color:red' }] }]],
		['a non-string text', [{ type: 'p', runs: [{ text: { toString: 1 } }] }]],
		['a javascript: link', [{ type: 'p', runs: [{ text: 'x', href: 'javascript:alert(1)' }] }]],
		['a data: link', [{ type: 'p', runs: [{ text: 'x', href: 'data:text/html,<script>' }] }]],
		[
			'a scheme split by a newline',
			[{ type: 'p', runs: [{ text: 'x', href: 'java\nscript:alert(1)' }] }]
		],
		['a truthy-but-not-true flag', [{ type: 'p', runs: [{ text: 'x', bold: 'yes' }] }]],
		['a list item that is not an array', [{ type: 'ul', items: [{ text: 'x' }] }]],
		['nothing at all', []],
		['blocks with no text', [{ type: 'p', runs: [] }]]
	];

	for (const [name, content] of refused) {
		it(`refuses ${name}`, async () => {
			await expect(
				rpc(student.id, 'notebook_create_note_entry', { p_content: JSON.stringify(content) })
			).rejects.toThrow(/not a valid note/i);
		});
	}

	it('accepts the full shape the editor can actually produce', async () => {
		const content = JSON.stringify([
			{
				type: 'p',
				runs: [
					{ text: 'Plain, ' },
					{ text: 'bold', bold: true },
					{ text: ', ' },
					{ text: 'italic', italic: true },
					{ text: ', and a ' },
					{ text: 'link', href: 'https://example.com/a?b=c#d' }
				]
			},
			{ type: 'ul', items: [[{ text: 'first' }], [{ text: 'second', bold: true }]] },
			{ type: 'ol', items: [[{ text: 'step one' }]] },
			{ type: 'p', runs: [{ text: 'mail me', href: 'mailto:someone@boscotech.edu' }] }
		]);
		const result = await rpc(student.id, 'notebook_create_note_entry', { p_content: content });
		expect(result.entry_id).toBeTruthy();
	});

	it('refuses a note past the character cap', async () => {
		const long = JSON.stringify([{ type: 'p', runs: [{ text: 'x'.repeat(20_001) }] }]);
		await expect(
			rpc(student.id, 'notebook_create_note_entry', { p_content: long })
		).rejects.toThrow(/not a valid note/i);
	});
});

describe('privileges', () => {
	it('grants no client write path to the table itself', async () => {
		const entry = await rpc(student.id, 'notebook_create_note_entry', {
			p_content: doc('Owned by me.')
		});
		await db.asUser(student.id, async (q) => {
			await expect(
				q(
					`insert into public.notebook_entry_notes (id, entry_id, note_id, revision, content, author_id)
					 values (gen_random_uuid(), $1, gen_random_uuid(), 1, '[]'::jsonb, $2)`,
					[entry.entry_id, student.id]
				)
			).rejects.toMatchObject({ code: '42501' });
			await expect(
				q(`update public.notebook_entry_notes set content = '[]'::jsonb where note_id = $1`, [
					entry.note_id
				])
			).rejects.toMatchObject({ code: '42501' });
			await expect(
				q(`delete from public.notebook_entry_notes where note_id = $1`, [entry.note_id])
			).rejects.toMatchObject({ code: '42501' });
		});
	});

	// Photo visibility already delegates to notebook_can_read_entry; notes use
	// the SAME function, so the two can never diverge.
	it('scopes reads to whoever may read the entry', async () => {
		const entryId = await sessionEntry();
		await rpc(student.id, 'notebook_add_note', {
			p_entry_id: entryId,
			p_content: doc('Section work.')
		});

		const count = (uid: string) =>
			db.asUser(uid, async (q) => {
				const { rows } = await q<{ n: string }>(
					`select count(*)::text as n from public.notebook_entry_notes where entry_id = $1`,
					[entryId]
				);
				return Number(rows[0].n);
			});

		expect(await count(student.id)).toBe(1);
		expect(await count(teacher.id)).toBe(1);
		expect(await count(other.id)).toBe(0);
	});

	it('holds no execute grant for anon', async () => {
		const { rows } = await db.sql<{ fn: string; ok: boolean }>(
			`select fn, has_function_privilege('anon', fn, 'execute') as ok
			   from (values
			     -- The 4-arg signature is the one that ships: 0088 dropped 0078's
			     -- 3-arg version outright when it added the folder. This suite used
			     -- to pin the dead one, which only passed because 0088 was not in
			     -- its chain.
			     ('public.notebook_create_note_entry(jsonb, text, uuid, uuid)'),
			     ('public.notebook_add_note(uuid, jsonb)'),
			     ('public.notebook_edit_note(uuid, jsonb)')
			   ) as t(fn)`
		);
		for (const row of rows) expect(row.ok).toBe(false);
	});
});
