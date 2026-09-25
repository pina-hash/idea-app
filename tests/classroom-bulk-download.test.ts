// tests/classroom-bulk-download.test.ts
//
// "DOWNLOAD ALL FILES" (ledger 0298, A6), READ BACK OUT OF THE ZIP IT PRODUCES.
//
// WHY THIS IS A TEST AND NOT ONLY A HARNESS. Two of its guarantees fail
// SILENTLY, which is CLAUDE.md's bar for a test:
//
//  1. A FILE THAT IS NOT IN THE ZIP HAS TO BE IN `index.csv`, and a student not
//     on the roster has to be FILED, not dropped. A zip holding 40 of 42 files
//     reads exactly like a class that handed in 40, and nobody opening it can
//     tell.
//  2. NO TWO FILES MAY SHARE A PATH, and no path may carry an address. Two
//     entries with one name are a zip every unzipper opens without complaint --
//     it just keeps one of them, so a student's work vanishes on extraction.
//     And a folder named from `jose@...` is the address disclosure the roster
//     rule exists to prevent.
//
// EVERY EXPECTED VALUE BELOW IS WRITTEN OUT BY HAND from the fixture, not
// derived from the module: a name the plan produced, compared against the
// plan, cannot fail. The zip is read back with Foundry's own reader
// (`readCentralDirectory` / `inflateEntry`), the mirror of the writer.

import { describe, expect, it } from 'vitest';
import {
	BULK_INDEX_HEADER,
	blockLabelsFromManifest,
	blockLabelsFromSpec,
	buildBulkZip,
	bulkCountLine,
	bulkDownloadPlan,
	bulkNotes,
	bulkZipName,
	schoolStamp,
	type BulkDownloadInput
} from '../src/lib/classroom/bulk-download';
import { SUBMISSION_FILES_BUCKET_NAME } from '../src/lib/classroom/bulk-download-source';
import {
	SUBMISSION_FILES_BUCKET,
	downloadFilename as serverDownloadFilename
} from '../src/lib/server/classroom-attachments';
import { downloadFilename } from '../src/lib/download-name';
import { inflateEntry, readCentralDirectory } from '../src/lib/foundry/zip';
import type {
	AssignmentSpec,
	SubmissionFileRow,
	SubmissionRow
} from '../src/lib/classroom/assignment-spec';
import type {
	ClassroomEnrollment,
	ClassroomItem,
	ClassroomSection
} from '../src/lib/classroom/classroom';

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

const course = { id: 'c-1', code: 'IDEA100', title: 'Engineering Essentials', active: true };
const S1: ClassroomSection = {
	id: 's1',
	course_id: 'c-1',
	label: 'Period 1',
	block: '1',
	teacher_email: 't@boscotech.edu',
	course
};
const S3: ClassroomSection = { ...S1, id: 's3', label: 'Period 3', block: '3' };

const ITEM = {
	id: 'item-1',
	kind: 'assignment',
	title: 'Blade CAD 01: Root & Hub',
	body: '',
	points: 10,
	// 23:59 Pacific on Saturday 19 September.
	due_at: '2026-09-20T06:59:00Z'
} as unknown as ClassroomItem;

const MANIFEST = {
	schemaVersion: 3,
	header: [{ id: 'b-team', field: 'teamName', type: 'text' }],
	modules: [
		{
			id: 'm1',
			title: 'Sketches',
			blocks: [
				{ id: 'b-photo', field: 'bladePhoto', type: 'image' },
				{ id: 'b-notes', field: 'notes', type: 'longText' }
			]
		},
		{ id: 'm2', title: 'Hub', blocks: [{ id: 'b-hub', field: 'hubPhoto', type: 'image' }] }
	]
};

const enrol = (
	section_id: string,
	student_email: string,
	display_name: string,
	extra: Partial<ClassroomEnrollment> = {}
): ClassroomEnrollment => ({ section_id, student_email, display_name, active: true, manages: false, ...extra });

/** The cross-class console's roster: both classes. */
const ROSTER: ClassroomEnrollment[] = [
	enrol('s1', 'eva@boscotech.net', 'Eva Reyes'),
	enrol('s1', 'jose1@boscotech.net', 'José Pérez'),
	enrol('s1', 'jose2@boscotech.net', 'Jose Perez'),
	enrol('s1', 'dana@boscotech.net', 'Kim, Dana', { active: false }),
	enrol('s1', 'blank@boscotech.net', '   '),
	enrol('s1', 'teacher@boscotech.edu', 'Mr Teacher', { manages: true }),
	enrol('s3', 'ana@boscotech.net', 'Ana Alvarez')
];

const sub = (id: string, student_email: string, extra: Partial<SubmissionRow> = {}): SubmissionRow =>
	({
		id,
		item_id: ITEM.id,
		student_email,
		state: 'draft',
		submitted_at: null,
		returned_at: null,
		rubric_scores: null,
		criterion_comments: null,
		score: null,
		teacher_comment: null,
		graded_by: null,
		graded_at: null,
		...extra
	}) as SubmissionRow;

const SUBMISSIONS: SubmissionRow[] = [
	sub('sub-eva', 'eva@boscotech.net', { state: 'returned', score: 8 }),
	sub('sub-jose1', 'jose1@boscotech.net'),
	sub('sub-jose2', 'jose2@boscotech.net'),
	sub('sub-dana', 'dana@boscotech.net', { state: 'submitted' }),
	sub('sub-blank', 'blank@boscotech.net'),
	sub('sub-teacher', 'teacher@boscotech.edu'),
	sub('sub-ana', 'ana@boscotech.net'),
	sub('sub-ghost', 'ghost@boscotech.net')
];

const file = (
	id: string,
	submission_id: string,
	block_id: string | null,
	filename: string,
	extra: Partial<SubmissionFileRow> = {}
): SubmissionFileRow => ({
	id,
	submission_id,
	block_id,
	caption: null,
	filename,
	mime_type: 'application/octet-stream',
	size_bytes: 100,
	sort_order: 1,
	storage_key: `${submission_id}/${id}.bin`,
	...extra
});

const FILES: SubmissionFileRow[] = [
	file('f1', 'sub-eva', 'b-photo', 'IMG_0001.JPG', { sort_order: 1, size_bytes: 1000 }),
	file('f2', 'sub-eva', 'b-photo', 'IMG_0002.jpg', { sort_order: 2, size_bytes: 2000 }),
	file('f3', 'sub-eva', 'b-hub', 'hub (final).png', { size_bytes: 500 }),
	// A LEGACY DRIVE ROW: no key, no recorded size.
	file('f4', 'sub-eva', null, 'Blade Assembly.SLDASM', { storage_key: null, size_bytes: null }),
	// A BLOCK THE MANIFEST DOES NOT KNOW.
	file('f5', 'sub-eva', 'b-retired', 'old.pdf', { size_bytes: 10 }),
	file('f6', 'sub-jose1', 'b-photo', 'foto.heic'),
	file('f7', 'sub-jose2', 'b-photo', 'photo.jpg'),
	file('f8', 'sub-dana', null, 'notes.txt', { size_bytes: 5 }),
	file('f9', 'sub-blank', 'b-photo', 'x.png', { size_bytes: 5 }),
	// LEFT OUT: the teacher's own file, and a student in the other class.
	file('f10', 'sub-teacher', 'b-photo', 'key.png'),
	file('f11', 'sub-ana', 'b-photo', 'ana.png'),
	// NOT ON ANY ROSTER, and a file whose submission never arrived.
	file('f12', 'sub-ghost', 'b-photo', 'ghost.png'),
	file('f13', 'sub-missing', null, 'orphan.bin')
];

const input = (over: Partial<BulkDownloadInput> = {}): BulkDownloadInput => ({
	item: ITEM,
	data: { roster: ROSTER, submissions: SUBMISSIONS, files: FILES },
	sections: [S1, S3],
	scopeSectionId: 's1',
	blocks: blockLabelsFromManifest(MANIFEST),
	...over
});

const TITLE = 'Blade_CAD_01_Root_Hub';

/** Every path in the Period 1 zip, in the order it is written. Typed by hand. */
const EXPECTED_PATHS = [
	'index.csv',
	`Kim, Dana/Kim_Dana - ${TITLE} - hand-in - 1.txt`,
	`Perez, Jose/Perez_Jose - ${TITLE} - bladePhoto - 1.jpg`,
	`Perez, Jose (2)/Perez_Jose - ${TITLE} - bladePhoto - 1.heic`,
	`Reyes, Eva/Reyes_Eva - ${TITLE} - bladePhoto - 1.JPG`,
	`Reyes, Eva/Reyes_Eva - ${TITLE} - bladePhoto - 2.jpg`,
	`Reyes, Eva/Reyes_Eva - ${TITLE} - hubPhoto - 1.png`,
	// f5 is the failing fetch below, so it is in the index and NOT in the zip.
	`Reyes, Eva/Reyes_Eva - ${TITLE} - hand-in - 1.SLDASM`,
	`Unnamed student 1/Unnamed_student_1 - ${TITLE} - bladePhoto - 1.png`,
	`_not-on-roster/student-1/student-1 - ${TITLE} - bladePhoto - 1.png`,
	`_not-on-roster/student-2/student-2 - ${TITLE} - hand-in - 1.bin`
];

/** RFC 4180, enough for the index: quoted fields, doubled quotes, CRLF. */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < text.length; i += 1) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				cell += '"';
				i += 1;
			} else if (c === '"') quoted = false;
			else cell += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			row.push(cell);
			cell = '';
		} else if (c === '\r') continue;
		else if (c === '\n') {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += c;
	}
	if (cell || row.length) {
		row.push(cell);
		rows.push(row);
	}
	return rows;
}

async function readZip(zip: Uint8Array) {
	const records = readCentralDirectory(zip);
	if (!records) throw new Error('the zip did not read back');
	const out = new Map<string, Uint8Array>();
	for (const r of records) out.set(r.name, await inflateEntry(zip, r, r.name));
	return { names: records.map((r) => r.name), files: out };
}

const UPLOADED = new Map([
	['f1', '2026-09-19T20:00:00Z'], // 13:00 Pacific on the 19th: before the due time
	['f2', '2026-09-20T08:30:00Z'] // 01:30 Pacific on the 20th: after it
]);

// ---------------------------------------------------------------------------

describe('the plan: who is in, who is filed separately, who is left out', () => {
	const plan = bulkDownloadPlan(input());

	it('writes every folder and file name the fixture should produce, and no other', () => {
		expect(plan.entries.map((e) => e.path)).toEqual([
			...EXPECTED_PATHS.slice(1, 7),
			`Reyes, Eva/Reyes_Eva - ${TITLE} - b-retired - 1.pdf`,
			...EXPECTED_PATHS.slice(7)
		]);
	});

	it('counts both directions: 11 in, 2 of them strangers; 1 other-class and 1 teacher file out', () => {
		expect(plan.entries).toHaveLength(11);
		expect(plan.students).toBe(5);
		expect(plan.notOnRoster).toEqual({ files: 2, people: 2 });
		expect(plan.otherClasses).toEqual({ files: 1, students: 1 });
		expect(plan.managers).toEqual({ files: 1 });
		// The positive control for the two exclusions: in the OTHER class's zip,
		// Ana's file is in and every Period 1 file is out.
		const other = bulkDownloadPlan(input({ scopeSectionId: 's3' }));
		expect(other.entries.map((e) => e.file.id)).toEqual(['f11', 'f12', 'f13']);
		expect(other.otherClasses.files).toBe(9);
	});

	it('never writes an address into a path, a folder or a student column', () => {
		const addresses = [...ROSTER.map((r) => r.student_email), 'ghost@boscotech.net'];
		const locals = addresses.map((a) => a.split('@')[0]);
		for (const e of plan.entries) {
			for (const text of [e.path, e.folder, e.student]) {
				expect(addresses.some((a) => text.includes(a))).toBe(false);
				// "blank", "ghost" and "jose1" are local parts nothing else in the
				// fixture spells, so finding one would be the address leaking.
				for (const local of ['blank', 'ghost', 'jose1', 'jose2']) {
					expect(locals).toContain(local);
					expect(text.toLowerCase().includes(local)).toBe(false);
				}
			}
		}
		// The positive control: the names ARE there.
		expect(plan.entries.map((e) => e.student)).toContain('Eva Reyes');
	});

	it('gives every file a unique path, case-insensitively, and keeps every name under 200', () => {
		const lower = plan.entries.map((e) => e.path.toLowerCase());
		expect(new Set(lower).size).toBe(lower.length);
		for (const e of plan.entries) expect(e.path.split('/').pop()!.length).toBeLessThan(200);
	});

	it('a selection is exactly the ticked students, with no strangers and nothing counted out', () => {
		const sel = bulkDownloadPlan(input({ selected: ['eva@boscotech.net', 'ana@boscotech.net'] }));
		expect(sel.scope).toBe('selection');
		expect(sel.entries.map((e) => e.file.id)).toEqual(['f11', 'f1', 'f2', 'f3', 'f5', 'f4']);
		expect(sel.notOnRoster.files).toBe(0);
		expect(sel.otherClasses.files).toBe(0);
		expect(sel.managers.files).toBe(0);
		expect(bulkCountLine(sel)).toBe('6 files from 2 selected students');
	});

	it('the per-class console recognises a student of another class through the wider roster', () => {
		// The per-section console's payload holds ONE class's roster, and the
		// work of every class the item is posted to.
		const narrow = input({ data: { roster: ROSTER.filter((r) => r.section_id === 's1'), submissions: SUBMISSIONS, files: FILES }, sections: [S1] });
		const without = bulkDownloadPlan(narrow);
		expect(without.notOnRoster).toEqual({ files: 3, people: 3 });
		const withWider = bulkDownloadPlan({ ...narrow, managedRoster: ROSTER });
		expect(withWider.notOnRoster).toEqual({ files: 2, people: 2 });
		expect(withWider.otherClasses).toEqual({ files: 1, students: 1 });
		expect(withWider.entries.map((e) => e.path)).toEqual(plan.entries.map((e) => e.path));
	});

	it('says the count and every exclusion in words', () => {
		expect(bulkCountLine(plan)).toBe('11 files from 5 students');
		expect(bulkNotes(plan)).toEqual([
			'2 files from 2 people not on this class roster go in a separate _not-on-roster folder, numbered rather than named.',
			'1 file from 1 student in your other classes is not in this download. Download it from that class.',
			'1 file from people who teach this class is left out.',
			'1 older file has no recorded size, so the total may be larger.'
		]);
		expect(bulkZipName(ITEM, 'IDEA100 · Period 1 · Block 1', 1, 1)).toBe(
			'blade-cad-01-root-hub-idea100-period-1-block-1-files.zip'
		);
	});

	it('splits by student, never through one, past the byte budget', () => {
		// Eva's five files hold 3510 known bytes; everybody else holds 100 or less.
		// Folders in order hold 5, 100, 100, 3510, 5, 100 and 100 known bytes, so
		// under 3600 the cuts fall before Eva and before the first stranger.
		const split = bulkDownloadPlan(input({ budgetBytes: 3600 }));
		expect(split.parts.map((p) => [p.firstFolder, p.lastFolder])).toEqual([
			['Kim, Dana', 'Perez, Jose (2)'],
			['Reyes, Eva', 'Unnamed student 1'],
			['_not-on-roster/student-1', '_not-on-roster/student-2']
		]);
		expect(split.parts.map((p) => p.knownBytes)).toEqual([205, 3515, 200]);
		expect(split.parts.flatMap((p) => p.entries).length).toBe(11);
		expect(bulkNotes(split).some((n) => n.includes('comes as 3 zips split by student'))).toBe(true);
		expect(bulkZipName(ITEM, 'Period 1', 2, 2)).toBe('blade-cad-01-root-hub-period-1-files-2-of-2.zip');
	});
});

describe('the zip, read back with the repo reader', () => {
	it('holds every fetched file under its planned path, and the index names the one that failed', async () => {
		const plan = bulkDownloadPlan(input());
		const seen: [number, number][] = [];
		const result = await buildBulkZip({
			item: ITEM,
			part: plan.parts[0],
			deps: {
				async fetchFile(f) {
					if (f.id === 'f5') return { ok: false, reason: 'The file is no longer in storage.' };
					return { ok: true, bytes: new TextEncoder().encode(`bytes of ${f.filename}`) };
				},
				async uploadTimes() {
					return UPLOADED;
				}
			},
			standingOf: (email) => (email === 'eva@boscotech.net' ? 'Returned · 8/10' : 'In progress'),
			outOf: 10,
			onProgress: (done, total) => seen.push([done, total])
		});
		expect(result).toMatchObject({ included: 10, total: 11 });
		expect(seen.at(-1)).toEqual([11, 11]);

		const { names, files } = await readZip(result.zip);
		expect(names).toEqual(EXPECTED_PATHS);
		// CONTENT, not only shape: each path holds that student's own bytes.
		expect(new TextDecoder().decode(files.get(EXPECTED_PATHS[3]))).toBe('bytes of foto.heic');
		expect(new TextDecoder().decode(files.get(EXPECTED_PATHS[7]))).toBe('bytes of Blade Assembly.SLDASM');

		const raw = files.get('index.csv')!;
		// THE BOM EXCEL NEEDS TO OPEN AN ACCENTED NAME, read as bytes: a
		// `TextDecoder` consumes it, so a decoded string cannot show it.
		expect([...raw.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
		const csv = new TextDecoder().decode(raw);
		const rows = parseCsv(csv);
		expect(rows[0]).toEqual([...BULK_INDEX_HEADER]);
		// ONE ROW PER FILE THE PART NAMED, INCLUDED OR NOT.
		expect(rows).toHaveLength(12);
		const byName = new Map(rows.slice(1).map((r) => [r[7], r] as const));
		expect(byName.get('IMG_0001.JPG')).toEqual([
			'Eva Reyes',
			'active',
			'IDEA100 · Period 1 · Block 1',
			`Reyes, Eva/Reyes_Eva - ${TITLE} - bladePhoto - 1.JPG`,
			'b-photo',
			'Sketches',
			'bladePhoto',
			'IMG_0001.JPG',
			'2026-09-19 13:00',
			// "bytes of IMG_0001.JPG" is 21 bytes: the size is what ARRIVED.
			'21',
			'No',
			'Returned · 8/10',
			'8',
			'10',
			'Yes'
		]);
		expect(byName.get('IMG_0002.jpg')?.slice(8, 11)).toEqual(['2026-09-20 01:30', '21', 'Yes']);
		// THE FAILED FETCH: no path, its recorded size, and the reason.
		expect(byName.get('old.pdf')).toEqual([
			'Eva Reyes',
			'active',
			'IDEA100 · Period 1 · Block 1',
			'',
			'b-retired',
			'',
			'',
			'old.pdf',
			'',
			'10',
			'',
			'Returned · 8/10',
			'8',
			'10',
			'No: The file is no longer in storage.'
		]);
		expect(byName.get('notes.txt')?.slice(0, 5)).toEqual([
			'Kim, Dana',
			'left the class',
			'IDEA100 · Period 1 · Block 1',
			`Kim, Dana/Kim_Dana - ${TITLE} - hand-in - 1.txt`,
			'hand-in'
		]);
		expect(byName.get('ghost.png')?.slice(0, 3)).toEqual([
			'Not on this class roster (student-1)',
			'not on this roster',
			''
		]);
		// No address anywhere in the index either.
		expect(csv.includes('@')).toBe(false);
	});

	it('a transport that throws costs one file, not the zip', async () => {
		const plan = bulkDownloadPlan(input({ selected: ['dana@boscotech.net'] }));
		const result = await buildBulkZip({
			item: ITEM,
			part: plan.parts[0],
			deps: {
				async fetchFile() {
					throw new Error('boom');
				}
			},
			outOf: 10
		});
		expect(result).toMatchObject({ included: 0, total: 1 });
		const { names, files } = await readZip(result.zip);
		expect(names).toEqual(['index.csv']);
		expect(new TextDecoder().decode(files.get('index.csv'))).toContain('No: The file could not be downloaded.');
	});

	it("takes the upload time off the row's own created_at, and asks for nothing more when every row has one", async () => {
		const withTime = FILES.map((f) => (f.id === 'f8' ? { ...f, created_at: '2026-09-20T08:30:00Z' } : f));
		const plan = bulkDownloadPlan(
			input({
				selected: ['dana@boscotech.net'],
				data: { roster: ROSTER, submissions: SUBMISSIONS, files: withTime }
			})
		);
		let asked = 0;
		const result = await buildBulkZip({
			item: ITEM,
			part: plan.parts[0],
			deps: {
				async fetchFile() {
					return { ok: true, bytes: new Uint8Array([1, 2, 3]) };
				},
				async uploadTimes() {
					asked += 1;
					return new Map();
				}
			},
			outOf: 10
		});
		expect(asked).toBe(0);
		const { files } = await readZip(result.zip);
		const row = parseCsv(new TextDecoder().decode(files.get('index.csv'))).find((r) => r[7] === 'notes.txt');
		// 01:30 Pacific on the 20th, after the 23:59 due time on the 19th.
		expect(row?.slice(8, 11)).toEqual(['2026-09-20 01:30', '3', 'Yes']);
	});
});

describe('block names, the one fold, and the bucket', () => {
	it('names a ported block by its module and field, and a spec block by its module', () => {
		expect([...blockLabelsFromManifest(MANIFEST)]).toEqual([
			['b-team', { module: 'Identity', field: 'teamName' }],
			['b-photo', { module: 'Sketches', field: 'bladePhoto' }],
			['b-notes', { module: 'Sketches', field: 'notes' }],
			['b-hub', { module: 'Hub', field: 'hubPhoto' }]
		]);
		expect(blockLabelsFromManifest({ modules: 'not a list' }).size).toBe(0);
		const spec = {
			modules: [
				{ id: 'm1', title: 'Build', blocks: [{ type: 'instructions', text: 'x' }, { type: 'imageZone', id: 'z1' }] }
			]
		} as unknown as AssignmentSpec;
		expect([...blockLabelsFromSpec(spec)]).toEqual([['z1', { module: 'Build', field: '' }]]);
	});

	it('a module 0195 stores with a NUMBER for a title names its block instead of throwing', () => {
		// `btrim(v_mod->>'title')` accepts 5, because `->>` renders a number as
		// text. The plan runs while the grading console renders, so a throw here
		// would take the console down for the assignment.
		const labels = blockLabelsFromManifest({
			modules: [{ id: 'm9', title: 5, blocks: [{ id: 'b9', field: '', type: 'image' }] }]
		});
		expect([...labels]).toEqual([['b9', { module: '5', field: '' }]]);
		const plan = bulkDownloadPlan(
			input({
				blocks: labels,
				data: { roster: ROSTER, submissions: SUBMISSIONS, files: [file('f90', 'sub-eva', 'b9', 'x.png')] }
			})
		);
		expect(plan.entries.map((e) => e.path)).toEqual([`Reyes, Eva/Reyes_Eva - ${TITLE} - 5 - 1.png`]);
	});

	it('the server and the browser use ONE fold, and name ONE bucket', () => {
		expect(serverDownloadFilename).toBe(downloadFilename);
		expect(downloadFilename('Estudio (final) café.SLDPRT')).toBe('Estudio_final_cafe.SLDPRT');
		expect(SUBMISSION_FILES_BUCKET_NAME).toBe(SUBMISSION_FILES_BUCKET);
	});

	it('prints an instant on the school clock', () => {
		// 8pm Pacific, where the UTC day is already the next one.
		expect(schoolStamp('2026-08-28T03:00:00Z')).toBe('2026-08-27 20:00');
		expect(schoolStamp(null)).toBe('');
	});
});
