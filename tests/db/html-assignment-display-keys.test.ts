// tests/db/html-assignment-display-keys.test.ts
//
// LEDGER 0360: THE THREE DISPLAY KEYS NEED NO MIGRATION, PROVEN AGAINST THE REAL
// GATES RATHER THAN ARGUED.
//
// `prompt`, `link` and `optional` are optional keys on a manifest block. The
// claim this whole lane rests on is that every gate in the database ignores a
// block key it does not name: 0195's `_classroom_check_html_manifest` reads id,
// field, type and minSentences and stores the manifest verbatim, and 0197's
// `classroom_save_response` resolves a block by id and checks its TYPE. If that
// claim were false in either direction the cost would be silent: a manifest
// refused at import (a re-upload adding a prompt that fails for a teacher), or
// a `link` key that started deciding what a student may write.
//
// So: the real chain, the real import RPC, the real save RPC, as the real
// student role. The positive control is an id the manifest does not declare,
// refused as it always was, so "every save succeeded" cannot be what a gate
// that stopped checking anything would also produce.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';
import { hxStoredValue } from '../../src/lib/classroom/html-assignment/answers';
import {
	hxBlockIsOptional,
	hxBlockLinkKind,
	hxBlockPrompt,
	validateHtmlManifest
} from '../../src/lib/classroom/html-assignment/manifest';

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
	'0122_rich_text_nested_lists.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql',
	'0137_anon_execute_sweep.sql',
	'0176_classroom_item_images.sql',
	'0195_classroom_html_assignments.sql',
	'0197_classroom_html_assignment_write_gate.sql'
] as const;

const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Pitch deck',
	course: 'IDEA100',
	points: 2,
	header: [{ id: 'who', field: 'studentName', type: 'text', prompt: 'Your name' }],
	modules: [
		{
			id: 'deck',
			title: 'Deck',
			points: 2,
			audience: 'individual',
			blocks: [
				{ id: 'deck-link', field: 'deckLink', type: 'text', link: 'presentation', prompt: 'Link to your deck' },
				{ id: 'deck-extra', field: 'extra', type: 'longText', optional: true, prompt: 'Anything else?' }
			],
			criteria: [
				{
					id: 'opens',
					text: 'The deck opens for the class',
					points: 2,
					levels: [
						{ points: 2, label: 'Complete', short: 'Opens for everyone', descriptor: 'Anyone with the link can open it.' },
						{ points: 1, label: 'Developing', short: 'Opens for some', descriptor: 'Opens only with a request.' },
						{ points: 0, label: 'Absent', short: 'Does not open', descriptor: 'No working link.' }
					]
				}
			]
		}
	]
};

function documentFor(m: typeof MANIFEST): string {
	const fields = [...m.header.map((b) => b.field), ...m.modules.flatMap((mod) => mod.blocks.map((b) => b.field))];
	return [
		'<!doctype html><html><head><title>Pitch deck</title></head><body>',
		...fields.map((f) => `<input data-field="${f}">`),
		`<script type="application/json" id="idea-manifest">${JSON.stringify(m)}<\/script>`,
		`<script>parent.postMessage({ type: 'idea:ready', schemaVersion: 3 }, '*');<\/script>`,
		'</body></html>'
	].join('\n');
}

describe('0360 display keys against the real import and write gates', () => {
	let db: TestDb;
	let admin: SeededUser;
	let teacher: SeededUser;
	let student: SeededUser;
	let section: string;
	let item: string;

	async function rpc<T = Record<string, unknown>>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
		return db.asUser(user.id, async (q) => {
			const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
			return rows[0].result;
		});
	}
	async function refusal(user: SeededUser, call: string, params: unknown[] = []): Promise<string | null> {
		try {
			await rpc(user, call, params);
			return null;
		} catch (e) {
			return (e as Error).message;
		}
	}

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
		teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
		student = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
		await db.sql('insert into public.app_admins (email, granted_by) values ($1, $1) on conflict do nothing', [
			admin.email
		]);
		section = await createClassroomSection(db, {
			as: admin,
			courseCode: 'IDEA100',
			courseTitle: 'Introduction to Engineering',
			label: 'Period 3',
			teacherEmail: teacher.email
		});
		await enrollStudent(db, { as: teacher, sectionId: section, email: student.email, displayName: 'Ana Perez' });
		const created = await rpc<{ item_id: string }>(
			teacher,
			`public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
				p_body => $3, p_points => 2, p_published => true)`,
			[[section], 'Pitch deck', 'Present your deck.']
		);
		item = created.item_id;
	});

	afterAll(async () => {
		await db?.stop();
	});

	it('the client validator accepts the manifest too, with no error and no warning', () => {
		const result = validateHtmlManifest(documentFor(MANIFEST));
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	it('classroom_set_html_assignment stores a manifest carrying all three keys, verbatim', async () => {
		const stored = await rpc<{ ok: boolean }>(
			admin,
			'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)',
			[item, documentFor(MANIFEST), JSON.stringify(MANIFEST), 'pitch.html']
		);
		expect(stored.ok).toBe(true);
		const { rows } = await db.sql<{ link: string; prompt: string; optional: boolean; header_prompt: string }>(
			`select manifest->'modules'->0->'blocks'->0->>'link' as link,
			        manifest->'modules'->0->'blocks'->0->>'prompt' as prompt,
			        (manifest->'modules'->0->'blocks'->1->>'optional')::boolean as optional,
			        manifest->'header'->0->>'prompt' as header_prompt
			   from public.classroom_html_assignments where item_id = $1`,
			[item]
		);
		expect(rows).toEqual([
			{ link: 'presentation', prompt: 'Link to your deck', optional: true, header_prompt: 'Your name' }
		]);
	});

	it('the readers read the STORED copy the way the client wrote it', async () => {
		const { rows } = await db.sql<{ manifest: typeof MANIFEST }>(
			'select manifest from public.classroom_html_assignments where item_id = $1',
			[item]
		);
		const blocks = rows[0].manifest.modules[0].blocks;
		expect(hxBlockLinkKind(blocks[0])).toBe('presentation');
		expect(hxBlockPrompt(blocks[0])).toBe('Link to your deck');
		expect(hxBlockIsOptional(blocks[1])).toBe(true);
		expect(hxBlockLinkKind(blocks[1])).toBeNull();
	});

	it('a link field takes ANY text: the key never gates a write', async () => {
		for (const text of ['not a link at all', 'https://docs.google.com/presentation/d/x/edit', '']) {
			const res = await rpc<{ ok: boolean }>(student, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
				item,
				'deck-link',
				JSON.stringify(hxStoredValue(text))
			]);
			expect(res.ok, text).toBe(true);
		}
		// An optional block and a prompted header block save like any other.
		for (const [block, text] of [
			['deck-extra', 'Nothing else.'],
			['who', 'Ana Perez']
		]) {
			const res = await rpc<{ ok: boolean }>(student, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
				item,
				block,
				JSON.stringify(hxStoredValue(text))
			]);
			expect(res.ok, block).toBe(true);
		}
		const { rows } = await db.sql<{ block_id: string }>(
			'select block_id from public.classroom_responses where item_id = $1 order by block_id',
			[item]
		);
		expect(rows.map((r) => r.block_id)).toEqual(['deck-extra', 'deck-link', 'who']);
	});

	it('the positive control: an id the manifest does not declare is still refused', async () => {
		const message = await refusal(student, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
			item,
			'no-such-block',
			JSON.stringify(hxStoredValue('x'))
		]);
		expect(message).toContain('Unknown block "no-such-block"');
	});
});
