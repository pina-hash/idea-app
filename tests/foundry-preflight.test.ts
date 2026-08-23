// tests/foundry-preflight.test.ts
//
// The Foundry ingest preflight. DELIBERATELY NARROW, the same convention as
// classroom-decks.test.ts: this is not a feature suite, it is a suite for the
// things that regress SILENTLY.
//
// Three of those, and the middle one is here because it ALREADY HAPPENED during
// the bundle that wrote this file.
//
//   1. PATH CONTAINMENT. `judgeEntryName` is the boundary between an arbitrary
//      archive and the bucket. A hole in it does not look like anything: the
//      upload succeeds, the app works, and one extra object sits somewhere it
//      should not. The TypeScript rule is also a MIRROR of the SQL
//      `_classroom_deck_path_ok` that the table's CHECK constraint enforces, so
//      the two are compared here against REAL Postgres with the REAL migrations
//      applied -- the expected value comes from the database, not from the
//      implementation under test.
//
//   2. THE ZIP READER ACTUALLY DECOMPRESSING. The central directory's
//      compression method sits at offset +10; reading it at +8 picks up the
//      general-purpose flags instead, which are 0, which means STORED, which
//      means the reader hands back the still-compressed bytes and calls them
//      the file. Every structural check passes (the NAMES are fine), the
//      extension check passes, and the content scanners find no CDN links
//      because they are scanning deflate output rather than HTML. It presents
//      as a clean bundle. That was a real bug in this module, caught only by
//      reading the stored bytes back, so the round trip is pinned here.
//
//   3. THE COMMENT BLANKER AND STRING LITERALS. Every URL contains `//`. A
//      blanker that does not track string state erases the second half of
//      `import x from "https://esm.sh/y"`, and the message the student is
//      handed then quotes the wreckage instead of their import. Also real, also
//      caught by reading the output rather than the assertion.

import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import {
	FOUNDRY_ALLOWED_EXTENSIONS,
	FOUNDRY_LIMITS,
	classifyReference,
	extensionOf,
	foundryMime,
	isOsNoise,
	judgeEntryName,
	planStructure,
	scanCss,
	scanJs,
	stripWrapperDirectory
} from '$lib/foundry/preflight.ts';
import { bundlePathOk } from '$lib/bundle-path.ts';
import { ByteBudget, ZipBudgetError, inflateEntry, readCentralDirectory } from '$lib/foundry/zip.ts';
import { startTestDb, type TestDb } from './db/harness';

/**
 * Just enough of the chain to reach 0101, which DEFINES
 * `_classroom_deck_path_ok`. 0130 calls that same function by name for
 * `student_app_files.path`, so this is the function the Foundry CHECK
 * constraint actually runs -- there is no second copy to drift from.
 */
const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0053_app_feedback.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0090_classroom_instructor_materials.sql',
	'0101_classroom_decks.sql'
] as const;

/* ------------------------------------------------------------------ paths */

/**
 * One corpus, put to BOTH rules. Mixed deliberately: the legal cases are as
 * load-bearing as the illegal ones, because a rule that refuses everything
 * passes every absence assertion ever written about it.
 */
const PATH_CORPUS = [
	'index.html',
	'assets/logo.png',
	'a/b/c/d/e.js',
	'.image-slots.state.json',
	'weird name with spaces.css',
	'UPPER.PNG',
	'../evil.txt',
	'../../evil.txt',
	'a/../../evil.txt',
	'a/../b.txt',
	'/etc/passwd',
	'C:/Windows/x.txt',
	'a//b.png',
	'a/./b.png',
	'./index.html',
	'trailing/',
	'has:colon.txt',
	'back\\slash.png',
	''
];

describe('path containment', () => {
	it('refuses every escape in the corpus and keeps every legal path', () => {
		const verdicts = PATH_CORPUS.map((p) => ({ p, ok: 'path' in judgeEntryName(p, false) }));
		const accepted = verdicts.filter((v) => v.ok).map((v) => v.p);
		const refused = verdicts.filter((v) => !v.ok).map((v) => v.p);

		// Positive control: the gate is not simply refusing everything.
		expect(accepted).toEqual([
			'index.html',
			'assets/logo.png',
			'a/b/c/d/e.js',
			'.image-slots.state.json',
			'weird name with spaces.css',
			'UPPER.PNG',
			'./index.html'
		]);
		expect(refused).toContain('../evil.txt');
		expect(refused).toContain('../../evil.txt');
		expect(refused).toContain('a/../../evil.txt');
		expect(refused).toContain('/etc/passwd');
		expect(refused).toContain('C:/Windows/x.txt');
		expect(refused).toContain('back\\slash.png');
		expect(refused).toContain('');
	});

	it('normalizes ./ to the same file rather than refusing it', () => {
		const judged = judgeEntryName('./index.html', false);
		expect(judged).toEqual({ path: 'index.html' });
	});

	it('refuses anything that is not a regular file', () => {
		expect(judgeEntryName('assets/link', true)).toEqual({ rejection: 'irregular' });
	});
});

describe('the SQL mirror', () => {
	let db: TestDb;
	beforeAll(async () => {
		db = await startTestDb(MIGRATIONS);
	}, 180_000);
	afterAll(async () => {
		await db?.stop();
	});

	it('agrees with _classroom_deck_path_ok on every case in the corpus', async () => {
		// The EXPECTED value comes from the database, which is the thing the
		// column's CHECK constraint actually runs. A path this module accepts
		// and the constraint refuses is an insert that fails at write time,
		// after the bytes are already in the bucket.
		const result = await db.sql<{ path: string; sql_ok: boolean }>(
			`select p as path, public._classroom_deck_path_ok(p) as sql_ok
			   from unnest($1::text[]) as p`,
			[PATH_CORPUS]
		);
		const rows = result.rows;
		expect(rows.length).toBe(PATH_CORPUS.length);

		const disagreements = rows
			.map((r) => ({ path: r.path, sql: r.sql_ok === true, ts: bundlePathOk(r.path) }))
			.filter((r) => r.sql !== r.ts);
		expect(disagreements).toEqual([]);

		// Positive control: the corpus genuinely exercises both answers.
		const sqlTrue = rows.filter((r) => r.sql_ok === true).length;
		expect(sqlTrue).toBeGreaterThan(0);
		expect(sqlTrue).toBeLessThan(PATH_CORPUS.length);
	});

	it('accepts every path the planner would actually store', async () => {
		const plan = planStructure(
			[
				entry('index.html', 200),
				entry('assets/logo.png', 900),
				entry('deep/a/b/c.css', 40)
			],
			1000
		);
		expect(plan.failures).toEqual([]);
		const stored = plan.files.map((f) => f.path);
		const result = await db.sql<{ ok: boolean }>(
			`select bool_and(public._classroom_deck_path_ok(p)) as ok from unnest($1::text[]) as p`,
			[stored]
		);
		expect(result.rows[0].ok).toBe(true);
	});
});

/* -------------------------------------------------------------------- zip */

function entry(name: string, declaredSize: number, irregular = false) {
	return { name, directory: name.endsWith('/'), irregular, declaredSize };
}

describe('the zip reader', () => {
	it('DECOMPRESSES a deflated entry rather than returning the stored bytes', async () => {
		// The regression this exists for: a reader that mistakes DEFLATE for
		// STORE returns compressed bytes and every later check passes on them.
		// Long and repetitive so deflate genuinely engages -- a short string can
		// legitimately come out stored, which would make this pass vacuously.
		const text = `<!doctype html><title>Hello</title>${'<p>the same sentence again</p>'.repeat(200)}`;
		const zip = zipSync({ 'index.html': strToU8(text) }, { level: 6 });

		const records = readCentralDirectory(zip);
		expect(records).not.toBeNull();
		const record = records!.find((r) => r.name === 'index.html');
		expect(record).toBeDefined();

		// The fixture really is compressed; otherwise this proves nothing.
		expect(record!.method).toBe(8);
		expect(record!.compressedSize).toBeLessThan(record!.uncompressedSize);

		const out = await inflateEntry(zip, record!, 'index.html');
		expect(new TextDecoder().decode(out)).toBe(text);
		expect(out.byteLength).toBe(strToU8(text).length);
	});

	it('reads a stored entry unchanged', async () => {
		const bytes = strToU8('plain');
		const zip = zipSync({ 'a.txt': [bytes, { level: 0 }] });
		const records = readCentralDirectory(zip)!;
		const record = records.find((r) => r.name === 'a.txt')!;
		expect(record.method).toBe(0);
		expect(new TextDecoder().decode(await inflateEntry(zip, record, 'a.txt'))).toBe('plain');
	});

	it('is not a zip when the bytes are not a zip', () => {
		expect(readCentralDirectory(strToU8('this is a text file'))).toBeNull();
		expect(readCentralDirectory(new Uint8Array(0))).toBeNull();
	});

	it('aborts the moment the uncompressed budget is crossed, not after', async () => {
		const oneMeg = new Uint8Array(1024 * 1024);
		const files: Record<string, Uint8Array> = {};
		for (let i = 0; i < 6; i++) files[`big${i}.txt`] = oneMeg;
		const zip = zipSync(files, { level: 6 });
		// A tiny archive that unpacks to 6 MB.
		expect(zip.byteLength).toBeLessThan(200 * 1024);

		const budget = new ByteBudget(3 * 1024 * 1024 + 1024);
		const records = readCentralDirectory(zip)!;
		const unpacked: string[] = [];
		let thrown: unknown = null;
		try {
			for (const r of records) {
				await inflateEntry(zip, r, r.name, budget);
				unpacked.push(r.name);
			}
		} catch (err) {
			thrown = err;
		}
		expect(thrown).toBeInstanceOf(ZipBudgetError);
		// PARTWAY: some files came out, and not all of them.
		expect(unpacked.length).toBeGreaterThan(0);
		expect(unpacked.length).toBeLessThan(6);
		expect(budget.used).toBeGreaterThan(budget.limit);
	});
});

/* -------------------------------------------------------------- structure */

describe('structure', () => {
	it('strips a single wrapper directory and reports it', () => {
		const { paths, stripped } = stripWrapperDirectory([
			'my-app/index.html',
			'my-app/styles.css',
			'my-app/assets/x.png'
		]);
		expect(stripped).toBe('my-app');
		expect(paths).toEqual(['index.html', 'styles.css', 'assets/x.png']);
	});

	it('does NOT strip when index.html is already at the top level', () => {
		const { paths, stripped } = stripWrapperDirectory(['index.html', 'sub/a.css']);
		expect(stripped).toBeNull();
		expect(paths).toEqual(['index.html', 'sub/a.css']);
	});

	it('does NOT strip a real single directory whose entry is not inside it', () => {
		const { stripped } = stripWrapperDirectory(['src/a.js', 'src/b.js']);
		expect(stripped).toBeNull();
	});

	it('refuses an archive with no index.html at the top level', () => {
		const plan = planStructure([entry('pages/home.html', 10), entry('a.css', 10)], 100);
		const messages = plan.failures.map((f) => f.message);
		expect(messages.some((m) => m.includes('There is no index.html at the top level'))).toBe(true);
	});

	it('refuses an extension outside the allowlist, and names the allowed set', () => {
		const plan = planStructure([entry('index.html', 10), entry('app.scss', 10)], 100);
		const message = plan.failures.map((f) => f.message).join('\n');
		expect(message).toContain('app.scss is a .scss file');
		for (const ext of FOUNDRY_ALLOWED_EXTENSIONS) expect(message).toContain(ext);
	});

	it('counts files against the cap and refuses over it', () => {
		const many = [entry('index.html', 1)];
		for (let i = 0; i < FOUNDRY_LIMITS.maxFiles; i++) many.push(entry(`f${i}.txt`, 1));
		const plan = planStructure(many, 100);
		expect(plan.failures.some((f) => f.message.includes(`${FOUNDRY_LIMITS.maxFiles + 1} files`))).toBe(
			true
		);
	});

	it('drops operating-system noise and says how many, rather than refusing the zip', () => {
		const plan = planStructure(
			[
				entry('index.html', 10),
				entry('__MACOSX/._index.html', 10),
				entry('.DS_Store', 10),
				entry('Thumbs.db', 10)
			],
			100
		);
		expect(plan.failures).toEqual([]);
		expect(plan.droppedOsNoise).toBe(3);
		expect(plan.notes.join(' ')).toContain('3 files');
		expect(plan.files.map((f) => f.path)).toEqual(['index.html']);
	});

	it('knows which names are noise and which are ordinary dotfiles', () => {
		expect(isOsNoise('.DS_Store')).toBe(true);
		expect(isOsNoise('__MACOSX/x')).toBe(true);
		// A leading dot is NOT noise on its own -- decks rely on exactly this.
		expect(isOsNoise('.image-slots.state.json')).toBe(false);
	});
});

/* ------------------------------------------------------------- references */

describe('reference classification', () => {
	it('permits relative paths, fragments and data URIs', () => {
		for (const v of ['a.css', './a.css', '../shared/a.css', '#top', '?q=1', 'data:image/png;base64,AAA']) {
			expect(classifyReference(v).kind, v).toBe('ok');
		}
	});

	it('permits the one absolute path, and no other', () => {
		expect(classifyReference('/_platform/fonts.css').kind).toBe('ok');
		expect(classifyReference('/assets/logo.png').kind).toBe('absolute');
		expect(classifyReference('/').kind).toBe('absolute');
	});

	it('refuses every scheme and the protocol-relative form', () => {
		expect(classifyReference('https://cdn.example.com/x.js').kind).toBe('scheme');
		expect(classifyReference('//cdn.example.com/x.js').kind).toBe('scheme');
		expect(classifyReference('mailto:a@b.c').kind).toBe('scheme');
	});

	it('names Google Fonts specifically, because the fix is different', () => {
		expect(classifyReference('https://fonts.googleapis.com/css2?family=Inter').kind).toBe(
			'google-fonts'
		);
		expect(classifyReference('//fonts.gstatic.com/s/x.woff2').kind).toBe('google-fonts');
	});
});

describe('content scanning', () => {
	it('quotes the student\'s ACTUAL import, not the wreckage of a comment strip', () => {
		// Every URL contains "//". A blanker that does not track strings turns
		// this message into a quotation of the next line of their program.
		const js = 'import confetti from "https://esm.sh/canvas-confetti@1.9.3";\nconst x = 1;\n';
		const { failures } = scanJs('app.js', js);
		expect(failures).toHaveLength(1);
		expect(failures[0].message).toContain('https://esm.sh/canvas-confetti@1.9.3');
		expect(failures[0].message).not.toContain('const x');
		expect(failures[0].line).toBe(1);
	});

	it('ignores an import that is genuinely inside a comment', () => {
		const js = '// import x from "https://esm.sh/y";\nconst a = 1;\n';
		expect(scanJs('app.js', js).failures).toEqual([]);
	});

	it('treats a network call as a warning and an import as a failure', () => {
		const js = 'const r = await fetch("/api/x");\n';
		const scan = scanJs('app.js', js);
		expect(scan.failures).toEqual([]);
		expect(scan.warnings).toHaveLength(1);
		expect(scan.warnings[0].message).toContain('fetch');
	});

	it('finds a blocked url() in CSS and reports its line', () => {
		const css = 'body { color: red; }\n.x { background: url("https://example.com/bg.png"); }\n';
		const { failures } = scanCss('styles.css', css);
		expect(failures).toHaveLength(1);
		expect(failures[0].line).toBe(2);
		expect(failures[0].message).toContain('https://example.com/bg.png');
	});

	it('does not report a url() sitting inside a CSS comment', () => {
		const css = '/* background: url("https://example.com/x.png"); */\nbody { color: red; }\n';
		expect(scanCss('styles.css', css).failures).toEqual([]);
	});
});

/* ------------------------------------------------------------------ mime */

describe('content types', () => {
	it('gives every allowed extension a type, and js and css executable ones', () => {
		for (const ext of FOUNDRY_ALLOWED_EXTENSIONS) {
			expect(foundryMime(`file.${ext}`), ext).not.toBe('application/octet-stream');
		}
		// A wrong type here stops the browser executing the file at all.
		expect(foundryMime('app.js')).toBe('text/javascript; charset=utf-8');
		expect(foundryMime('a.css')).toBe('text/css; charset=utf-8');
	});

	it('reads the extension case-insensitively and from the last dot', () => {
		expect(extensionOf('A.PNG')).toBe('png');
		expect(extensionOf('a.min.js')).toBe('js');
		expect(extensionOf('noext')).toBe('');
	});
});
