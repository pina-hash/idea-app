// tests/db/hx-optional-blocks-data.test.ts
//
// supabase/data/0360-hx-optional-blocks.sql, RUN AGAINST THE REAL CHAIN
// (ledger 0360, reports d983e776 and 8f78d5bd).
//
// The file is pasted by hand into the production SQL editor, so what it does
// when pasted UNEDITED is the property that matters most, and it is invisible:
// a correction that wrote a default nobody chose would look exactly like one
// that wrote nothing. So the file is executed verbatim twice over one seeded
// worksheet: once as it stands (the blind paste), and once with its two item
// ids pointed at the seeded item and one block list filled in.
//
// WHERE THE EXPECTED VALUES COME FROM. The manifest is written out by hand;
// "which blocks carry optional" is read back off the stored jsonb, and the
// revision count off `classroom_content_revisions`, as the connection owner.

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClassroomSection, createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import type { HtmlAssignmentManifest } from '../../src/lib/classroom/html-assignment/manifest';

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
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0112_classroom_sentence_count_fix.sql',
	'0122_rich_text_nested_lists.sql',
	'0128_classroom_instructor_copy.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql',
	'0137_anon_execute_sweep.sql',
	'0176_classroom_item_images.sql',
	'0195_classroom_html_assignments.sql',
	'0197_classroom_html_assignment_write_gate.sql'
] as const;

const FILE = readFileSync('supabase/data/0360-hx-optional-blocks.sql', 'utf8');
const LIVE_E4 = 'e4c5d7ad-940b-4355-8bba-7cc9e0c9128a';
const LIVE_7C = '7c374ff3-7d0f-4329-bc90-b41191ce679b';

const MANIFEST: HtmlAssignmentManifest = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Portfolio capture',
	course: 'IDEA209H',
	points: 4,
	header: [{ id: 'who', field: 'studentName', type: 'text' }],
	modules: [
		{
			id: 'assembly',
			title: 'Assembly',
			points: 4,
			audience: 'individual',
			blocks: [
				{ id: 'as-photo-1', field: 'photoOne', type: 'image' },
				{ id: 'as-photo-2', field: 'photoTwo', type: 'image' },
				{ id: 'as-why', field: 'why', type: 'longText', minSentences: 2 }
			],
			criteria: [
				{
					id: 'c',
					text: 'The assembly is recorded',
					points: 4,
					levels: [
						{ points: 4, label: 'Complete', short: 'Recorded', descriptor: 'Photo and reasons.' },
						{ points: 2, label: 'Developing', short: 'Partly', descriptor: 'One of the two.' },
						{ points: 0, label: 'Absent', short: 'Not done', descriptor: 'Not attempted.' }
					]
				}
			]
		}
	]
};

function documentFor(m: HtmlAssignmentManifest): string {
	const fields = [...(m.header ?? []).map((b) => b.field), ...m.modules.flatMap((mod) => mod.blocks.map((b) => b.field))];
	return [
		'<!doctype html>',
		`<html><head><title>${m.title}</title></head><body><form>`,
		...fields.map((f) => `<input data-field="${f}">`),
		`</form><script type="application/json" id="idea-manifest">${JSON.stringify(m)}<\/script>`,
		'</body></html>'
	].join('\n');
}

describe('supabase/data/0360-hx-optional-blocks.sql', () => {
	let db: TestDb;
	let admin: SeededUser;
	let teacher: SeededUser;
	let item: string;

	async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
		return db.asUser(user.id, async (q) => {
			const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
			return rows[0].result;
		});
	}
	const head = async () =>
		(
			await db.sql<{ manifest: HtmlAssignmentManifest; document: string; updated_at: string; document_id: string }>(
				'select manifest, document, updated_at::text, document_id::text from public.classroom_html_assignments where item_id = $1',
				[item]
			)
		).rows[0];
	const revisions = async () =>
		Number(
			(
				await db.sql<{ n: string }>(
					"select count(*)::text as n from public.classroom_content_revisions where item_id = $1 and target = 'html_assignment'",
					[item]
				)
			).rows[0].n
		);
	const optionalIds = (m: HtmlAssignmentManifest) =>
		m.modules.flatMap((mod) => mod.blocks.filter((b) => (b as { optional?: unknown }).optional === true).map((b) => b.id));

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
		teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
		await db.sql('insert into public.app_admins (email, granted_by) values ($1, $1) on conflict do nothing', [admin.email]);
		const section = await createClassroomSection(db, {
			as: admin,
			courseCode: 'IDEA209H',
			courseTitle: 'Engineering II Honors',
			label: 'Block 3',
			teacherEmail: teacher.email
		});
		const created = await rpc<{ item_id: string }>(
			teacher,
			`public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => 'Portfolio capture',
				p_body => 'Body.', p_points => 4, p_published => true)`,
			[[section]]
		);
		item = created.item_id;
		const up = await rpc<{ ok: boolean }>(admin, 'public.classroom_set_html_assignment($1::uuid,$2,$3::jsonb,$4)', [
			item,
			documentFor(MANIFEST),
			JSON.stringify(MANIFEST),
			'portfolio.html'
		]);
		expect(up.ok).toBe(true);
	}, 300000);

	afterAll(async () => {
		await db?.stop();
	});

	it('carries no dollar sign anywhere (the editor splitter trap) and no bare migration DDL', () => {
		expect(FILE).not.toContain('$');
		expect(FILE).not.toMatch(/^\s*(create|alter|drop)\s+(table|function|policy|index)\s+public\./im);
	});

	it('A BLIND PASTE WRITES NOTHING: the file run as it stands leaves the manifest, the stamp and the history alone', async () => {
		const before = await head();
		const revs = await revisions();
		// The file names the two live items; pointed at the seeded one but with
		// its NULL lists left in place, it must still write nothing.
		await db.sql(FILE.split(LIVE_E4).join(item));
		const after = await head();
		expect(after.manifest).toEqual(before.manifest);
		expect(after.updated_at).toBe(before.updated_at);
		expect(await revisions()).toBe(revs);
		expect(optionalIds(after.manifest)).toEqual([]);
	});

	it('FILLED IN: only the named block gains optional, a revision is kept, and nothing else moves', async () => {
		const before = await head();
		const revs = await revisions();
		const filled = FILE.split(LIVE_E4)
			.join(item)
			.replace(
				`('${item}'::uuid,    null::text[])`,
				`('${item}'::uuid,    array['as-photo-2'])`
			);
		expect(filled).not.toBe(FILE.split(LIVE_E4).join(item));
		await db.sql(filled);
		const after = await head();
		expect(optionalIds(after.manifest)).toEqual(['as-photo-2']);
		// Every block id, in order, exactly as it was: the join key never moves.
		expect(after.manifest.modules[0].blocks.map((b) => b.id)).toEqual(['as-photo-1', 'as-photo-2', 'as-why']);
		expect(after.manifest.header).toEqual(before.manifest.header);
		expect(after.document).toBe(before.document);
		expect(after.document_id).toBe(before.document_id);
		// Ledger 0357's document cache keys on the stamp: untouched.
		expect(after.updated_at).toBe(before.updated_at);
		expect(await revisions()).toBe(revs + 1);
		const kept = await db.sql<{ payload: { manifest: HtmlAssignmentManifest } }>(
			"select payload from public.classroom_content_revisions where item_id = $1 and target = 'html_assignment' order by revision desc limit 1",
			[item]
		);
		expect(optionalIds(kept.rows[0].payload.manifest)).toEqual([]);
		// The other live id in the file names no row here and touched nothing.
		expect(FILE).toContain(LIVE_7C);
	});

	it('the edited manifest still passes the database validator, so a re-save through the RPC would accept it', async () => {
		const now = await head();
		await expect(
			db.sql('select public._classroom_check_html_manifest($1::jsonb)', [JSON.stringify(now.manifest)])
		).resolves.toBeTruthy();
	});
});
