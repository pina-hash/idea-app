// tests/db/html-assignment-wiring.test.ts
//
// THE WALK. Not "do the pieces work" -- five lanes proved that -- but "is the
// feature reachable", which until ledger 0139 it was not: no route supplied
// `htmlAssignmentTransports`, so the import control was gated on a prop nobody
// passed, `createHtmlAnswerTransports` had no caller, and a schema-3 item
// mounted read-only. This file drives the objects the two routes now build,
// against a REAL embedded Postgres with the REAL migration files applied
// unmodified, as the REAL roles (`asUser` -- SET ROLE authenticated with the
// JWT claims GUC, which is what PostgREST does).
//
// WHAT IS REAL HERE, EXACTLY, BECAUSE THE VALUE OF A WALK IS IN THE ANSWER TO
// THAT AND NOTHING ELSE:
//
//   * `stageHtmlDocument` -- the composer's own import path, minus the `File`
//     read, so the manifest under test is the one the validator produced from a
//     document rather than an object typed out here.
//   * `applyStagedHtmlAssignment` -- the composer's own apply, unchanged.
//   * `createHtmlAssignmentTransports` -- the factory this bundle added, over
//     the postgrest shim, so `classroom_set_html_assignment` and
//     `classroom_set_rubric` are called in NAMED notation exactly as PostgREST
//     calls them. A parameter this bundle spelled wrong is a failure here.
//   * `createHtmlAnswerTransports` -- likewise, for `classroom_save_response`
//     and `classroom_set_submission_file_caption`.
//   * `HxAnswers` -- the answer controller, with its real debounce collapsed by
//     `flush()`, exactly as a navigation guard collapses it.
//   * `hxValuesFromResponses` / `hxImagesFromFiles` / `hxFileIdsByField` -- the
//     three seeds `+page.svelte` builds from `data.engine`, given the rows a
//     student's own RLS-scoped read returns.
//
// WHAT IS NOT REAL, AND WHY IT CANNOT BE: `uploadSubmissionFile` and
// `deleteSubmissionFile` are HTTP routes, not RPCs, so the shim cannot reach
// them. The upload stand-in below does what
// `src/routes/api/classroom/submission-file/+server.ts` does and nothing else
// -- the EIGHT-argument `classroom_add_submission_file`, `p_drive_file_id`
// null, `p_mime_type` 'application/octet-stream' -- so what this proves is the
// ARITY and the round trip, never the sign-and-PUT hop, which is
// `$lib/classroom/file-upload`'s and is shared with every other hand-in.
//
// WHERE THE EXPECTED VALUES COME FROM: every answer is a string typed out in
// `ANSWERS` below and read back with a plain select under RLS, as the student.
// Nothing is compared against anything the controller derived.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';
import { createPostgrestShim, loadForeignKeys } from './postgrest-shim';
import {
	createHtmlAnswerTransports,
	createHtmlAssignmentTransports
} from '../../src/lib/classroom/transports';
import {
	applyStagedHtmlAssignment,
	stageHtmlDocument
} from '../../src/lib/classroom/html-assignment/store';
import {
	HxAnswers,
	hxFileIdsByField,
	hxImagesFromFiles,
	hxValuesFromResponses
} from '../../src/lib/classroom/html-assignment/answers';
import type { SubmissionFileRow } from '../../src/lib/classroom/assignment-spec';
import type { RubricCriterion } from '../../src/lib/classroom/assignment-spec';
import { storageObjectKey } from '../../src/lib/server/classroom-attachments';
import { load as classroomLayoutLoad } from '../../src/routes/classroom/+layout.server';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The classroom chain through 0197, in production order -- the same one the
    round-trip file boots, for the same reason: 0137 sits where it sits in
    production and 0195/0197 follow it and revoke for themselves. */
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

// ---------------------------------------------------------------------------
// A DOCUMENT CARRYING ALL SIX BLOCK TYPES.
//
// Six modules, one criterion each with three descending levels, the top at the
// criterion maximum and the bottom at zero -- IDEA_RUBRIC_STANDARDS' shape,
// which `validateHtmlManifest` enforces. Every declared field appears in the
// document body, because the validator refuses a field the document does not
// carry and refuses a `[data-field]` no manifest names.
//
// SIX TYPES RATHER THAN THE THREE A REAL PORT HAPPENS TO USE. The shipped
// fixture (`src/routes/dev/html-assignment/fixtures/idea100-blade-01.ported.html`)
// declares `text`, `longText` and `image` only, so a walk built on it would
// leave `checkbox`, `radio` and `table` -- half the vocabulary -- with no write
// behind them on this path.
// ---------------------------------------------------------------------------

interface Answer {
	blockId: string;
	field: string;
	type: string;
	value: string | boolean;
}

const ANSWERS: readonly Answer[] = [
	{ blockId: 'm1-setup', field: 'setup', type: 'text', value: '2.50 mm' },
	{
		blockId: 'm2-why',
		field: 'why',
		type: 'longText',
		value: 'The fixture was the larger error. The stock itself measured flat.'
	},
	{ blockId: 'm3-done', field: 'done', type: 'checkbox', value: true },
	{ blockId: 'm4-pick', field: 'pick', type: 'radio', value: 'six-mill' },
	{
		blockId: 'm5-rows',
		field: 'rows',
		type: 'table',
		value: '[["pass","reading"],["1","2.50"],["2","2.51"]]'
	},
	{ blockId: 'm6-shot', field: 'shot', type: 'image', value: '' }
] as const;

/** The block a photograph is attached to. `image` is the manifest's spelling of
    the spec format's `imageZone`, and 0197's manifest arm requires it. */
const IMAGE = ANSWERS[5];

function criterion(id: string, text: string, points: number) {
	return {
		id,
		text,
		points,
		levels: [
			{ points, label: 'Complete', short: 'Fully done', descriptor: 'Done in full, with the value recorded.' },
			{ points: Math.max(1, points - 1), label: 'Developing', short: 'Partly done', descriptor: 'Partly done, or recorded without a value.' },
			{ points: 0, label: 'Absent', short: 'Not done', descriptor: 'Not attempted.' }
		]
	};
}

function manifest() {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Bench setup, six ways',
		course: 'IDEA100',
		points: 12,
		header: [{ id: 'hd-name', field: 'studentName', type: 'text' }],
		modules: ANSWERS.map((a, i) => ({
			id: `m${i + 1}`,
			title: `Module ${i + 1}`,
			points: 2,
			audience: 'individual',
			blocks: [
				a.type === 'longText'
					? { id: a.blockId, field: a.field, type: a.type, minSentences: 2 }
					: { id: a.blockId, field: a.field, type: a.type }
			],
			criteria: [criterion(`c${i + 1}`, `Module ${i + 1} is recorded`, 2)]
		}))
	};
}

function documentFor(json: string): string {
	const fields = ['studentName', ...ANSWERS.map((a) => a.field)];
	const inputs = fields.map((f) => `    <input data-field="${f}">`).join('\n');
	return [
		'<html><head><title>Bench setup, six ways</title></head><body>',
		'  <h1>Bench setup, six ways</h1>',
		'  <p>Record each measurement as you take it.</p>',
		'  <form>',
		inputs,
		'  </form>',
		`  <script type="application/json" id="idea-manifest">${json}<\/script>`,
		/*
			THE HANDSHAKE, BECAUSE THIS FIXTURE STANDS FOR A DOCUMENT THAT WORKS.
			`validateHtmlManifest` (and the import gate behind it) refuses a
			document that never sends `idea:ready`: without it the parent posts no
			`idea:state`, nothing is seeded, and every answer arrives before
			anything is listening. Until ledger 0141 nothing checked, and this
			builder emitted a document with no bridge code in it at all.
		*/
		`  <script>parent.postMessage({ type: 'idea:ready', schemaVersion: 3 }, '*');<\/script>`,
		'</body></html>'
	].join('\n');
}

describe('the HTML-assignment wiring, end to end', () => {
	let db: TestDb;
	let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
	let admin: SeededUser;
	let teacher: SeededUser;
	let student: SeededUser;
	let section: string;
	let itemId: string;
	let refusedItemId: string;
	const html = documentFor(JSON.stringify(manifest()));

	/**
	 * The client the ROUTES build, at one identity. `createHtmlAssignmentTransports`
	 * and `createHtmlAnswerTransports` take a `SupabaseClient`; the shim is the
	 * subset of that surface they touch, resolved against the real catalog.
	 *
	 * THE JSON STEP IS THE INSTRUMENT'S, NOT THE APP'S, and it is worked around
	 * HERE rather than in `tests/db/postgrest-shim.ts` -- exactly as
	 * `tests/frc-quiz-route.test.ts` does, for exactly the same gap.
	 * node-postgres serializes a JS ARRAY as a Postgres array literal (`{...}`),
	 * so `p_criteria` -- a `RubricCriterion[]` bound to a `jsonb` parameter --
	 * arrives as text jsonb cannot parse and every rubric write fails with
	 * "invalid input syntax for type json". PostgREST does not do that: it sends
	 * the body as JSON and lets Postgres cast. This restores that one behaviour
	 * and changes nothing else, so what is under test is still the real factory
	 * calling the real function with the real parameter names.
	 */
	const clientFor = (user: SeededUser) => {
		const base = createPostgrestShim(db, fks, user.id);
		/** A jsonb-shaped argument: an object, or an array containing one. */
		const isJsonish = (v: unknown) =>
			v !== null &&
			typeof v === 'object' &&
			(!Array.isArray(v) || v.some((e) => e !== null && typeof e === 'object'));
		return {
			from: base.from,
			rpc: (name: string, args?: Record<string, unknown>) =>
				base.rpc(
					name,
					args &&
						Object.fromEntries(
							Object.entries(args).map(([k, v]) => [k, isJsonish(v) ? JSON.stringify(v) : v])
						)
				)
		} as unknown as SupabaseClient;
	};

	async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
		return db.asUser(user.id, async (q) => {
			const r = await q<{ result: T }>(`select ${call} as result`, params);
			return r.rows[0].result;
		});
	}

	async function createAssignment(title: string): Promise<string> {
		const r = await rpc<{ item_id: string }>(
			teacher,
			`public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
				p_body => $3, p_points => 12, p_published => true)`,
			[[section], title, `${title} body.`]
		);
		return r.item_id;
	}

	/** The student's own read path: RLS-scoped, no identity filter, the columns
	    `loadStudentEngineData` asks for. The policy IS the filter. */
	async function readBack(id: string) {
		return db.asUser(student.id, async (q) => {
			const responses = await q<{ block_id: string; value: Record<string, unknown> }>(
				'select block_id, value from public.classroom_responses where item_id = $1 order by block_id',
				[id]
			);
			const files = await q<SubmissionFileRow>(
				`select f.id, f.submission_id, f.block_id, f.caption, f.filename, f.mime_type,
				        f.size_bytes, f.sort_order, f.storage_key
				 from public.classroom_submission_files f
				 join public.classroom_submissions s on s.id = f.submission_id
				 where s.item_id = $1
				 order by f.sort_order`,
				[id]
			);
			return { responses: responses.rows, files: files.rows };
		});
	}

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		fks = await loadForeignKeys(db);
		admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
		teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
		student = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
		await db.sql(
			'insert into public.app_admins (email, granted_by) values ($1, $1) on conflict do nothing',
			[admin.email]
		);
		section = await createClassroomSection(db, {
			as: admin,
			courseCode: 'IDEA100',
			courseTitle: 'Introduction to Engineering',
			label: 'Period 3',
			teacherEmail: teacher.email
		});
		await enrollStudent(db, {
			as: teacher,
			sectionId: section,
			email: student.email,
			displayName: 'Ana Perez'
		});
		itemId = await createAssignment('Bench setup (ported)');
		refusedItemId = await createAssignment('Bench setup (a teacher tries)');
	}, 240_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// LEG 1. AN ADMIN IMPORTS A DOCUMENT AND THE ITEM BECOMES A PORTED ONE.
	// -----------------------------------------------------------------------

	it('the document the validator produced is what the composer stages', () => {
		const staged = stageHtmlDocument('bench-six.html', html);
		expect(staged.errors).toEqual([]);
		expect(staged.staged).not.toBeNull();
		// SIX TYPES, COUNTED OFF THE STAGED MANIFEST rather than off the object
		// above it: what reaches the database is what the validator returned.
		const types = (staged.staged?.manifest.modules ?? []).flatMap((m) =>
			m.blocks.map((b) => b.type)
		);
		expect([...types].sort()).toEqual(
			['checkbox', 'image', 'longText', 'radio', 'table', 'text'].sort()
		);
	});

	it('an admin imports a document through the real transports and the item is created', async () => {
		const staged = stageHtmlDocument('bench-six.html', html);
		const applied = await applyStagedHtmlAssignment(
			itemId,
			staged.staged,
			createHtmlAssignmentTransports(clientFor(admin))
		);
		expect(applied.failures).toEqual([]);
		expect(applied.staged).toBeNull();

		const { rows: itemRows } = await db.sql<{ assignment_schema_version: number | null }>(
			'select assignment_schema_version from public.classroom_items where id = $1',
			[itemId]
		);
		expect(itemRows[0].assignment_schema_version).toBe(3);

		const { rows: docRows } = await db.sql<{
			document: string;
			filename: string;
			manifest: Record<string, unknown>;
			imported_by: string;
		}>(
			'select document, filename, manifest, imported_by from public.classroom_html_assignments where item_id = $1',
			[itemId]
		);
		expect(docRows).toHaveLength(1);
		// STORED VERBATIM. A byte the import path rewrote is a document a
		// reviewer never sees and a student never runs.
		expect(docRows[0].document).toBe(html);
		expect(docRows[0].filename).toBe('bench-six.html');
		expect(docRows[0].imported_by).toBe(admin.email);
		expect((docRows[0].manifest as { title?: string }).title).toBe('Bench setup, six ways');
	});

	it('and the rubric rode along, because a document owns the criteria it is graded against', async () => {
		const { rows } = await db.sql<{ criteria: RubricCriterion[] }>(
			'select criteria from public.classroom_rubrics where item_id = $1',
			[itemId]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].criteria).toHaveLength(6);
		expect(rows[0].criteria.reduce((n, c) => n + (c.points ?? 0), 0)).toBe(12);
	});

	it('a NON-ADMIN teacher of record is refused by the database, and nothing is written', async () => {
		// THE POSITIVE CONTROL FOR THE GATE. The route hands a non-admin no
		// transport at all, so this call is one nobody can make through the UI --
		// which is exactly why it is worth making here: the season gate has to be
		// the database's, not the absence of a button.
		const staged = stageHtmlDocument('bench-six.html', html);
		const applied = await applyStagedHtmlAssignment(
			refusedItemId,
			staged.staged,
			createHtmlAssignmentTransports(clientFor(teacher))
		);
		expect(applied.failures).toHaveLength(1);
		expect(applied.failures[0]).toContain('limited to site admins');
		// STILL STAGED, so a retry retries rather than losing the file.
		expect(applied.staged).not.toBeNull();

		const { rows } = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_html_assignments where item_id = $1',
			[refusedItemId]
		);
		expect(rows[0].n).toBe('0');
		const { rows: itemRows } = await db.sql<{ assignment_schema_version: number | null }>(
			'select assignment_schema_version from public.classroom_items where id = $1',
			[refusedItemId]
		);
		expect(itemRows[0].assignment_schema_version).toBeNull();
	});

	// -----------------------------------------------------------------------
	// LEG 5, THE HALF A MOUNT CANNOT SEE: THE SIGNAL THE ROUTE GATES ON.
	//
	// `tests/dom/html-assignment-import-gate-mount.test.ts` proves what the
	// composer renders for each combination of the two props. It cannot prove
	// which combination a real viewer gets, because that comes from a load. So
	// the REAL `/classroom` layout load is driven here, against real Postgres,
	// as each of the three people -- and `navIsAdmin` is the one flag
	// `[sectionId]/+layout.svelte` feeds into BOTH props.
	// -----------------------------------------------------------------------

	it('the route gates on a signal only an admin gets', async () => {
		const seen: Record<string, unknown> = {};
		for (const user of [admin, teacher, student]) {
			const data = await classroomLayoutLoad({
				locals: {
					supabase: clientFor(user),
					claims: { sub: user.id, email: user.email }
				}
			} as never);
			seen[user.email] = (data as { navIsAdmin?: unknown }).navIsAdmin;
		}
		expect(seen).toEqual({
			[admin.email]: true,
			// THE TEACHER OF RECORD IS THE CASE THAT MATTERS. `teacher` is granted
			// by email domain and manages this very section; it grants nothing
			// here, which is the ADMIN TIER rule and the whole reason the import
			// panel is not simply a manager control.
			[teacher.email]: false,
			[student.email]: false
		});
	});

	// -----------------------------------------------------------------------
	// LEGS 3 AND 4. A STUDENT TYPES, A PICTURE LANDS, AND A RELOAD RESTORES.
	// -----------------------------------------------------------------------

	describe('a student works inside the document', () => {
		/**
		 * THE TWO ROUTES `uploadClassroomFile` CALLS, WITH THE HTTP AND THE
		 * BUCKET PUT TAKEN OUT AND NOTHING ELSE CHANGED.
		 *
		 *   1. `/api/classroom/submission-file/sign` opens the submission
		 *      (`classroom_open_submission`, which is where a LOCKED one is
		 *      refused) and mints the key with `storageObjectKey` -- the REAL
		 *      one, imported here rather than spelled out, because the key
		 *      LAYOUT is the authorization: every storage policy and the write
		 *      RPC both read the first path segment and ask whether it names
		 *      the caller's own submission. The first draft of this stand-in
		 *      invented a random uuid there and the RPC refused it by name
		 *      ("That storage key does not belong to this submission."), which
		 *      is the check doing its job and is why the real minter is used.
		 *   2. `/api/classroom/submission-file` records the row through the
		 *      EIGHT-argument `classroom_add_submission_file` -- `p_drive_file_id`
		 *      null, `p_mime_type` 'application/octet-stream' by the route's own
		 *      hand and never from `File.type`. 0086's seven-argument wrapper is
		 *      deliberately not reached.
		 */
		async function recordUpload(
			file: File,
			blockId: string | null,
			caption: string | null
		): Promise<{ ok: true; data: { file?: SubmissionFileRow } } | { ok: false; message: string }> {
			try {
				const opened = await rpc<{ ok?: boolean; reason?: string; submission_id?: string }>(
					student,
					'public.classroom_open_submission($1::uuid)',
					[itemId]
				);
				if (opened?.ok === false) return { ok: false, message: opened.reason ?? 'refused' };
				const key = storageObjectKey(opened.submission_id ?? '', file.name);
				const res = await rpc<{ ok?: boolean; reason?: string; file_id?: string }>(
					student,
					`public.classroom_add_submission_file(
						p_item_id => $1::uuid, p_drive_file_id => null, p_filename => $2,
						p_mime_type => 'application/octet-stream', p_size_bytes => $3::bigint,
						p_block_id => $4, p_caption => $5, p_storage_key => $6)`,
					[itemId, file.name, file.size, blockId, caption, key]
				);
				if (res?.ok === false) return { ok: false, message: res.reason ?? 'refused' };
				const { rows } = await db.sql<SubmissionFileRow>(
					`select id, submission_id, block_id, caption, filename, mime_type,
					        size_bytes, sort_order, storage_key
					   from public.classroom_submission_files where id = $1`,
					[res.file_id]
				);
				return { ok: true, data: { file: rows[0] } };
			} catch (e) {
				return { ok: false, message: (e as Error).message };
			}
		}

		function controller() {
			const real = createHtmlAnswerTransports(clientFor(student));
			return new HxAnswers({
				itemId,
				manifest: stageHtmlDocument('bench-six.html', html).staged!.manifest,
				transports: {
					saveResponse: real.saveResponse,
					setFileCaption: real.setFileCaption,
					deleteSubmissionFile: real.deleteSubmissionFile,
					uploadSubmissionFile: (async (
						_itemId: string,
						file: File,
						blockId?: string | null,
						caption?: string | null
					) => recordUpload(file, blockId ?? null, caption ?? null)) as never
				},
				// The debounce is collapsed by `flush()` below, exactly as the
				// navigation guard and Submit collapse it; a shorter one here
				// would be a second number that is not the shipped one.
				wait: async () => {}
			});
		}

		it('every one of the six block types saves and comes back', async () => {
			const hx = controller();
			for (const answer of ANSWERS) {
				if (answer.type === 'image') continue;
				hx.change({ blockId: answer.blockId, field: answer.field, value: answer.value });
			}
			await hx.flush();
			expect(hx.saved?.ok).toBe(true);

			const { responses } = await readBack(itemId);
			// FIVE ROWS, not six: the image block's value is the FILE, and there is
			// no response row behind a photograph.
			expect(responses).toHaveLength(5);

			// THE RELOAD. The rows the student's own read returns, through the seed
			// `+page.svelte` builds, is the `idea:state` a reopened document gets.
			const restored = hxValuesFromResponses(
				stageHtmlDocument('bench-six.html', html).staged!.manifest,
				responses
			);
			for (const answer of ANSWERS) {
				if (answer.type === 'image') continue;
				expect(restored[answer.field]).toEqual(answer.value);
			}
			hx.destroy();
		});

		it('a picture lands on its block and comes back on the field it was taken for', async () => {
			const hx = controller();
			// One transparent PNG, as base64 -- what the bridge sends up.
			const bytes =
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
			await hx.image({ blockId: IMAGE.blockId, field: IMAGE.field, name: 'vise.png', bytes });
			expect(hx.saved?.ok).toBe(true);

			const { files } = await readBack(itemId);
			expect(files).toHaveLength(1);
			expect(files[0].block_id).toBe(IMAGE.blockId);
			// STORED AS `application/octet-stream` BY THE ROUTE'S OWN HAND, never
			// from `File.type`, which is a guess the uploader chooses.
			expect(files[0].mime_type).toBe('application/octet-stream');

			const manifestNow = stageHtmlDocument('bench-six.html', html).staged!.manifest;
			const images = hxImagesFromFiles(manifestNow, files);
			expect(Object.keys(images)).toEqual([IMAGE.field]);
			expect(images[IMAGE.field].name).toBe('vise.png');
			const ids = hxFileIdsByField(manifestNow, files);
			expect(ids.get(IMAGE.field)).toBe(files[0].id);
			hx.destroy();
		});

		it('a caption written into the document reaches the row the picture is', async () => {
			const { files } = await readBack(itemId);
			const hx = controller();
			// The controller has to know which row stands for the field, which is
			// what `fileIds` seeds -- the item page's third seed.
			const seeded = new HxAnswers({
				itemId,
				manifest: stageHtmlDocument('bench-six.html', html).staged!.manifest,
				transports: {
					...createHtmlAnswerTransports(clientFor(student)),
					uploadSubmissionFile: (async () => ({ ok: false, message: 'not used' })) as never
				},
				images: hxImagesFromFiles(
					stageHtmlDocument('bench-six.html', html).staged!.manifest,
					files
				),
				fileIds: hxFileIdsByField(
					stageHtmlDocument('bench-six.html', html).staged!.manifest,
					files
				),
				wait: async () => {}
			});
			await seeded.imageCaption({
				blockId: IMAGE.blockId,
				field: IMAGE.field,
				caption: 'The vise, square to the table.'
			});
			expect(seeded.saved?.ok).toBe(true);
			const after = await readBack(itemId);
			expect(after.files[0].caption).toBe('The vise, square to the table.');
			seeded.destroy();
			hx.destroy();
		});
	});
});
