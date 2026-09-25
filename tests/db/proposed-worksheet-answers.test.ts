// tests/db/proposed-worksheet-answers.test.ts
//
// THE PROPOSED `classroom_worksheet_answers` (ledger 0298), APPLIED FROM ITS
// PROPOSED PATH OVER THE REAL CHAIN -- every migration in supabase/migrations
// on 2026-09-25, 0001 to 0224. It is not a migration and nothing applies it;
// `docs/feedback/2026-09-25/overnight/proposed/README.md` says how to promote it.
//
// WHAT IS PINNED. The function exists to let a teacher's class-wide surfaces
// (the Grades tab, the home tally) read finished worksheets without paying the
// per-row policy on every answer, and the one thing it must never do is reach
// further than that policy does. So its answer is compared, caller by caller,
// against what `classroom_responses` and `classroom_submission_files` return to
// the SAME caller through RLS, less the caller's own rows (the function is a
// reviewer's read, not a student's) -- in both directions, on a CO-POSTED
// worksheet where the two teachers must each receive their own class and
// nothing of the other's, with an inactive student who must still be read
// (the review predicate does not filter on active), a student who must receive
// nothing though her own RLS read returns her rows, and anon, who cannot call it.
//
// AND THE VERDICT STAYS THE CLIENT'S. The rows are judged with
// `worksheetCompletedAt`, the student's own read's judgment, so the test also
// says the function hands over enough to decide "complete" the same way.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';
import { worksheetCompletedAt, worksheetKey } from '../../src/lib/classroom/student-work';
import type { HtmlAssignmentManifest } from '../../src/lib/classroom/html-assignment/manifest';

/** THE ONE LINE TO CHANGE ON PROMOTION. */
const PROPOSAL = fileURLToPath(
	new URL('../../docs/feedback/2026-09-25/overnight/proposed/NNNN_classroom_worksheet_answers.sql', import.meta.url)
);
/** Production's chain as it stands: every numbered migration. On promotion, bound it below the new number. */
const DEPLOYED = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

const level = (points: number, label: string) => ({ points, label, short: label, descriptor: `${label} work, recorded.` });
const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Gear train',
	course: 'IDEA100',
	points: 4,
	header: [],
	modules: [
		{
			id: 'm1',
			title: 'Ratio',
			points: 2,
			audience: 'individual',
			blocks: [{ id: 'm1-ratio', field: 'ratio', type: 'text' }],
			criteria: [{ id: 'c1', text: 'Ratio', points: 2, levels: [level(2, 'Full'), level(1, 'Part'), level(0, 'None')] }]
		},
		{
			id: 'm2',
			title: 'Why',
			points: 2,
			audience: 'individual',
			blocks: [{ id: 'm2-why', field: 'why', type: 'longText', minSentences: 2 }],
			criteria: [{ id: 'c2', text: 'Why', points: 2, levels: [level(2, 'Full'), level(1, 'Part'), level(0, 'None')] }]
		}
	]
} as unknown as HtmlAssignmentManifest;
const DOCUMENT = [
	'<html><head><title>Gear train</title></head><body>',
	'  <form><input data-field="ratio"><textarea data-field="why"></textarea></form>',
	`  <script type="application/json" id="idea-manifest">${JSON.stringify(MANIFEST)}<\/script>`,
	'</body></html>'
].join('\n');
const WHY = 'The driver has 12 teeth. The driven gear has 36.';

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let otherTeacher: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let cruz: SeededUser;
let dora: SeededUser;
let luis: SeededUser;
let sectionA: string;
let sectionB: string;
/** Posted to BOTH classes. */
let shared: string;
/** Posted to class B only. */
let onlyB: string;

async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => (await q<{ result: T }>(`select ${call} as result`, params)).rows[0].result);
}

interface Payload {
	answers: { item_id: string; student_email: string; block_id: string; value: unknown; updated_at: string }[];
	files: { id: string; item_id: string; student_email: string; block_id: string; created_at: string }[];
}

const call = (user: SeededUser, ids: string[] = [shared, onlyB], sectionId: string | null = null) =>
	rpc<Payload>(user, 'public.classroom_worksheet_answers($1::uuid[], $2::uuid)', [ids, sectionId]);

/** What RLS gives the same caller, less their own rows: the reviewer's reach. */
async function viaPolicy(user: SeededUser, ids: string[] = [shared, onlyB]) {
	return db.asUser(user.id, async (q) => {
		const answers = await q<{ k: string }>(
			`select item_id || '|' || student_email || '|' || block_id as k from public.classroom_responses
			  where item_id = any($1::uuid[]) and student_email <> $2 order by 1`,
			[ids, user.email]
		);
		const files = await q<{ k: string }>(
			`select f.id::text as k from public.classroom_submission_files f
			   join public.classroom_submissions s on s.id = f.submission_id
			  where s.item_id = any($1::uuid[]) and s.student_email <> $2 and f.block_id is not null order by 1`,
			[ids, user.email]
		);
		return { answers: answers.rows.map((r) => r.k), files: files.rows.map((r) => r.k) };
	});
}

const keys = (p: Payload) => ({
	answers: p.answers.map((a) => `${a.item_id}|${a.student_email}|${a.block_id}`).sort(),
	files: p.files.map((f) => f.id).sort()
});

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...DEPLOYED]);
	admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
	teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
	otherTeacher = await createUser(db, 'oyelaran@boscotech.edu', 'T. Oyelaran');
	ana = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
	ben = await createUser(db, 'ben.ortiz@boscotech.net', 'Ben Ortiz');
	cruz = await createUser(db, 'cruz.diaz@boscotech.net', 'Cruz Diaz');
	dora = await createUser(db, 'dora.kim@boscotech.net', 'Dora Kim');
	luis = await createUser(db, 'luis.gomez@boscotech.net', 'Luis Gomez');
	await db.sql('insert into public.app_admins (email, granted_by) values ($1, $1) on conflict do nothing', [admin.email]);
	sectionA = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', label: 'Period 3', teacherEmail: teacher.email });
	sectionB = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', label: 'Period 5', teacherEmail: otherTeacher.email });
	for (const s of [ana, ben, dora]) await enrollStudent(db, { as: teacher, sectionId: sectionA, email: s.email, displayName: s.email });
	await enrollStudent(db, { as: otherTeacher, sectionId: sectionB, email: cruz.email, displayName: cruz.email });

	const create = async (as: SeededUser, sections: string[], title: string) =>
		(
			await rpc<{ item_id: string }>(
				as,
				`public.classroom_create_item(p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
					p_body => 'Body.', p_points => 6, p_due_at => $3::timestamptz, p_published => true)`,
				[sections, title, new Date(Date.now() + 3 * 86_400_000).toISOString()]
			)
		).item_id;
	shared = await create(admin, [sectionA, sectionB], 'Gear train, both periods');
	onlyB = await create(otherTeacher, [sectionB], 'Gear train, period 5');
	for (const id of [shared, onlyB]) {
		await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [id, DOCUMENT, JSON.stringify(MANIFEST), 'gear-train.html']);
	}
	const save = async (who: SeededUser, item: string, block: string, text: string) =>
		expect((await rpc<{ ok: boolean }>(who, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [item, block, JSON.stringify({ text })])).ok).toBe(true);
	// The real write path. Ana finishes; Ben does half; Dora finishes and is then
	// deactivated (her work is still her teacher's to grade); Cruz, in the other
	// class, finishes both worksheets.
	await save(ana, shared, 'm1-ratio', '3:1');
	await save(ana, shared, 'm2-why', WHY);
	await save(ben, shared, 'm1-ratio', '2:1');
	await save(dora, shared, 'm1-ratio', '3:1');
	await save(dora, shared, 'm2-why', WHY);
	await save(cruz, shared, 'm1-ratio', '3:1');
	await save(cruz, shared, 'm2-why', WHY);
	await save(cruz, onlyB, 'm1-ratio', '3:1');
	await enrollStudent(db, { as: teacher, sectionId: sectionA, email: dora.email, displayName: dora.email, active: false });
	// A block photograph for Ana and one for Cruz, as rows (the bytes are not this test's).
	for (const who of [ana, cruz]) {
		const sub = await db.sql<{ id: string }>(
			`insert into public.classroom_submissions (item_id, student_email) values ($1, $2)
			 on conflict (item_id, student_email) do update set updated_at = now() returning id`,
			[shared, who.email]
		);
		await db.sql(
			`insert into public.classroom_submission_files (submission_id, block_id, drive_file_id, filename, mime_type)
			 values ($1, 'm1-ratio', 'drive-' || $2, 'bench.jpg', 'image/jpeg')`,
			[sub.rows[0].id, who.email]
		);
	}

	const sql = readFileSync(PROPOSAL, 'utf8');
	await db.sql(sql);
	// Re-pasting a proposal is ordinary; it must re-apply.
	await db.sql(sql);
}, 300_000);

afterAll(async () => {
	await db?.stop();
});

describe('the reach is the review policy, caller by caller', () => {
	it('the section teacher receives their class on the co-posted worksheet, the inactive student included, and nobody from the other class', async () => {
		const got = keys(await call(teacher));
		expect(got).toEqual(await viaPolicy(teacher));
		expect(got.answers).toEqual(
			[`${shared}|${ana.email}|m1-ratio`, `${shared}|${ana.email}|m2-why`, `${shared}|${ben.email}|m1-ratio`, `${shared}|${dora.email}|m1-ratio`, `${shared}|${dora.email}|m2-why`].sort()
		);
		expect(got.answers.some((k) => k.includes(cruz.email))).toBe(false);
		expect(got.files).toHaveLength(1);
	});

	it('the other teacher receives their own student on both worksheets and nothing of the first class', async () => {
		const got = keys(await call(otherTeacher));
		expect(got).toEqual(await viaPolicy(otherTeacher));
		expect(got.answers).toEqual([`${onlyB}|${cruz.email}|m1-ratio`, `${shared}|${cruz.email}|m1-ratio`, `${shared}|${cruz.email}|m2-why`].sort());
		expect(got.answers.some((k) => k.includes(ana.email) || k.includes(dora.email))).toBe(false);
		expect(got.files).toHaveLength(1);
	});

	it('an admin receives everybody, which is what the policy gives an admin', async () => {
		const got = keys(await call(admin));
		expect(got).toEqual(await viaPolicy(admin));
		expect(got.answers).toHaveLength(8);
		expect(got.files).toHaveLength(2);
	});

	it('a student receives nothing, although her own read of the table returns her rows (the positive control)', async () => {
		expect(keys(await call(ana))).toEqual({ answers: [], files: [] });
		const own = await db.asUser(ana.id, (q) => q<{ n: string }>('select count(*)::text as n from public.classroom_responses where item_id = $1', [shared]));
		expect(own.rows[0].n).toBe('2');
		expect(keys(await call(luis))).toEqual({ answers: [], files: [] });
	});

	it('anon cannot call it at all; authenticated can', async () => {
		await expect(db.asAnon((q) => q('select public.classroom_worksheet_answers($1::uuid[])', [[shared]]))).rejects.toThrow(/permission denied/);
		const acl = await db.sql<{ anon: boolean; auth: boolean; n: string }>(
			`select has_function_privilege('anon', 'public.classroom_worksheet_answers(uuid[], uuid)', 'execute') as anon,
			        has_function_privilege('authenticated', 'public.classroom_worksheet_answers(uuid[], uuid)', 'execute') as auth,
			        (select count(*)::text from pg_proc where proname = 'classroom_worksheet_answers') as n`
		);
		expect(acl.rows[0]).toEqual({ anon: false, auth: true, n: '1' });
	});

	it('one class narrows the reach to that class, and a class the caller does not manage to nothing', async () => {
		const adminA = keys(await call(admin, [shared, onlyB], sectionA));
		expect(adminA.answers).toEqual(keys(await call(teacher)).answers);
		expect(adminA.answers.some((k) => k.includes(cruz.email))).toBe(false);
		const adminB = keys(await call(admin, [shared, onlyB], sectionB));
		expect(adminB.answers).toEqual(keys(await call(otherTeacher)).answers);
		// The teacher of A asking about B: B's students are not theirs to read.
		expect(keys(await call(teacher, [shared, onlyB], sectionB))).toEqual({ answers: [], files: [] });
		// And the same teacher asking about their own class gets exactly the unnarrowed answer.
		expect(keys(await call(teacher, [shared, onlyB], sectionA))).toEqual(keys(await call(teacher)));
	});

	it('an empty list is an empty answer; more than 200 is refused', async () => {
		expect(await call(teacher, [])).toEqual({ answers: [], files: [] });
		const many = Array.from({ length: 201 }, () => shared);
		await expect(call(teacher, many)).rejects.toThrow(/At most 200/);
	});
});

describe('the verdict stays the client\'s: the rows judge the same way the student\'s own read does', () => {
	it('Ana and Dora finished, Ben did not, judged by worksheetCompletedAt over the returned rows', async () => {
		const p = await call(teacher, [shared]);
		const by = new Map<string, Payload['answers']>();
		for (const a of p.answers) {
			const k = worksheetKey(a.item_id, a.student_email);
			by.set(k, [...(by.get(k) ?? []), a]);
		}
		const done = [ana, ben, dora].map((s) => [s.email, worksheetCompletedAt(MANIFEST, (by.get(worksheetKey(shared, s.email)) ?? []) as never, []) !== null]);
		expect(done).toEqual([
			[ana.email, true],
			[ben.email, false],
			[dora.email, true]
		]);
	});
});
