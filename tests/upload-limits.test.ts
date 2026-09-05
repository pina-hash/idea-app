// tests/upload-limits.test.ts
//
// THE CEILINGS ARE STATED IN ONE PLACE AND ENFORCED IN NINE. This is what
// makes that safe.
//
// `$lib/upload-limits` transcribes a number that is ALSO written in a
// migration and in the module that enforces it. Three of those modules are in
// directories this bundle may not edit (`src/lib/classroom/**`, and the
// server-only notebook module), so the registry cannot simply import them and
// the numbers genuinely exist twice. CLAUDE.md permits exactly that shape --
// "the client's is derived from the same constant the migration used, or a
// test asserts they agree" -- and this is that test. A number changed on one
// side and not the other reddens here rather than shipping as a message that
// promises a limit the bucket does not have.
//
// AND IT ASSERTS THE NULLS, WHICH IS THE HALF THAT FOUND THE BUG. A row whose
// `maxBytes` is null is claiming its bucket carries no `file_size_limit` at
// all, which is a claim about a migration and is checkable: the sweep below
// reads every `insert into storage.buckets` in the chain and refuses a
// registry that says "no limit" about a bucket that has one, OR a number about
// a bucket that has none. That second direction is the one the students hit --
// a client refusing at 75 MB against a bucket whose real ceiling nobody here
// can read.
//
// THE TWO POSITIVE CONTROLS THE BUNDLE OWES ARE `derives the sentence` and
// `does not mention size`, at the bottom, and both are mutation-proved in the
// history entry rather than asserted to have been.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	PROJECT_CEILING_SENTENCE,
	UPLOAD_CEILING_LIST,
	UPLOAD_CEILINGS,
	uploadCeiling,
	uploadFailureMessage,
	uploadSizeRefusal,
	uploadTooLargeMessage,
	type UploadPathId
} from '../src/lib/upload-limits';
import { notebookPhotoRefusal } from '../src/lib/notebook/photo-prepare';
import { CLASSROOM_UPLOAD_MAX_BYTES } from '../src/lib/classroom/file-upload';
import { DECK_UPLOAD_MAX_ZIP_BYTES } from '../src/lib/classroom/deck';
import { MAPS_MEDIA_MAX_BYTES } from '../src/lib/maps/media';
import { FEEDBACK_SCREENSHOT_MAX_BYTES } from '../src/lib/feedback/screenshot';
import { DECAL_MAX_BYTES } from '../src/lib/greenline/decals';
import { MAX_PHOTO_BYTES } from '../src/lib/server/notebook-upload';
import { FOUNDRY_LIMITS } from '../src/lib/foundry/preflight';

const MIGRATIONS = path.resolve(__dirname, '../supabase/migrations');

/**
 * Every `file_size_limit` the migration chain sets, per bucket, read from the
 * files rather than from anybody's memory of them. A bucket absent from this
 * map is a bucket created with no limit, which is the interesting case.
 *
 * The chain is read in NUMERIC ORDER, so a later migration that moves a limit
 * (0168 restates 0163's) is the value that wins, exactly as it does when the
 * files are applied by hand.
 */
function bucketLimitsFromChain(): Map<string, number | null> {
	const limits = new Map<string, number | null>();
	const files = readdirSync(MIGRATIONS)
		.filter((f) => f.endsWith('.sql'))
		.sort();
	for (const file of files) {
		const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
		// Strip line comments so a migration DISCUSSING a limit in prose
		// cannot be read as one setting it -- 0168 does exactly that in its
		// own header, which is how a naive sweep gets the wrong answer.
		const code = sql
			.split('\n')
			.filter((line) => !line.trim().startsWith('--'))
			.join('\n');
		// `insert into storage.buckets (...) values (...)`: pick up the bucket
		// id and, when the column list carries one, the file_size_limit.
		const re = /insert\s+into\s+storage\.buckets\s*\(([^)]*)\)\s*values\s*([\s\S]*?);/gi;
		let m: RegExpExecArray | null;
		while ((m = re.exec(code))) {
			const cols = m[1].split(',').map((c) => c.trim().toLowerCase());
			const sizeIdx = cols.indexOf('file_size_limit');
			const body = m[2];
			const tupleRe = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
			let t: RegExpExecArray | null;
			while ((t = tupleRe.exec(body))) {
				const parts = splitTopLevel(t[1]);
				const id = parts[0]?.trim().replace(/^'|'$/g, '');
				if (!id || !/^[a-z0-9-]+$/.test(id)) continue;
				const raw = sizeIdx >= 0 ? parts[sizeIdx]?.trim() : undefined;
				const value = raw && /^\d+$/.test(raw) ? Number(raw) : null;
				if (!limits.has(id) || value !== null) limits.set(id, value);
			}
		}
		// `on conflict ... do update set file_size_limit = N` restates it, and
		// a bare `update storage.buckets set file_size_limit = N where id = 'x'`
		// moves it. Both are the live value once applied.
		const upd = /update\s+storage\.buckets\s+set\s+file_size_limit\s*=\s*(\d+)[\s\S]*?where\s+id\s*=\s*'([a-z0-9-]+)'/gi;
		let u: RegExpExecArray | null;
		while ((u = upd.exec(code))) limits.set(u[2], Number(u[1]));
	}
	return limits;
}

/** Split a SQL tuple body on top-level commas (an `array[...]` has its own). */
function splitTopLevel(body: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let quoted = false;
	let cur = '';
	for (let i = 0; i < body.length; i += 1) {
		const ch = body[i];
		if (quoted) {
			cur += ch;
			if (ch === "'") quoted = false;
			continue;
		}
		if (ch === "'") { quoted = true; cur += ch; continue; }
		if (ch === '(' || ch === '[') depth += 1;
		if (ch === ')' || ch === ']') depth -= 1;
		if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
		cur += ch;
	}
	out.push(cur);
	return out;
}

describe('the registry is a transcription, not a second opinion', () => {
	/**
	 * Pinned, so a row ADDED without an agreement assertion below reddens.
	 * A registry that grew a row nobody checked is a registry back to being a
	 * place numbers are typed.
	 */
	it('covers exactly the thirteen upload paths this sweep knows about', () => {
		expect(UPLOAD_CEILING_LIST.map((c) => c.id)).toEqual([
			'classroom-attachment',
			'classroom-submission',
			'classroom-instructor',
			'classroom-deck',
			'notebook-photo',
			'maps-photo',
			'feedback-screenshot',
			'greenline-decal',
			'foundry-bundle',
			'foundry-cover',
			'avatar',
			'tournament-thumb',
			'gauntlet-asset'
		]);
	});

	/** Every row's number against the module that actually enforces it. */
	it.each([
		['classroom-attachment', CLASSROOM_UPLOAD_MAX_BYTES],
		['classroom-submission', CLASSROOM_UPLOAD_MAX_BYTES],
		['classroom-instructor', CLASSROOM_UPLOAD_MAX_BYTES],
		['classroom-deck', DECK_UPLOAD_MAX_ZIP_BYTES],
		['notebook-photo', MAX_PHOTO_BYTES],
		['maps-photo', MAPS_MEDIA_MAX_BYTES],
		['feedback-screenshot', FEEDBACK_SCREENSHOT_MAX_BYTES],
		['greenline-decal', DECAL_MAX_BYTES]
	] as [UploadPathId, number][])('%s agrees with its enforcing module', (id, enforced) => {
		expect(uploadCeiling(id).maxBytes).toBe(enforced);
	});

	/**
	 * FOUNDRY IS THE ONE ROW WHOSE CLIENT NUMBER IS DELIBERATELY NOT THE
	 * REGISTRY'S. `FOUNDRY_LIMITS` is read-only to this bundle and is the
	 * BROWSER's refusal; the bucket has no ceiling at all, so the registry
	 * says null and the two are not supposed to match. Asserted in that shape
	 * so the gap is a fact the suite states rather than something a reader has
	 * to notice.
	 */
	it('foundry refuses at 75 MB in the browser against a bucket with no ceiling', () => {
		expect(FOUNDRY_LIMITS.maxZipBytes).toBe(75 * 1024 * 1024);
		expect(uploadCeiling('foundry-bundle').maxBytes).toBeNull();
		expect(uploadCeiling('foundry-bundle').guards).toContain('project');
	});

	it('every row naming a bucket agrees with the migration chain, in both directions', () => {
		const chain = bucketLimitsFromChain();
		// A positive control for the sweep itself: if this parse came back
		// empty, or missed the buckets that DO carry a limit, every assertion
		// below would pass vacuously.
		expect(chain.get('classroom-attachments')).toBe(209715200);
		expect(chain.get('feedback-media')).toBe(8388608);
		expect(chain.get('greenline-decals')).toBe(1048576);
		expect(chain.get('maps-media')).toBe(20971520);

		const disagreements: string[] = [];
		for (const row of UPLOAD_CEILING_LIST) {
			if (!row.bucket) continue;
			const chainValue = chain.has(row.bucket) ? chain.get(row.bucket)! : null;
			if (row.maxBytes !== chainValue) {
				disagreements.push(
					`${row.id}: registry ${row.maxBytes ?? 'null'} vs migration ${chainValue ?? 'null'}`
				);
			}
		}
		expect(disagreements).toEqual([]);
	});

	it('a null maxBytes always says the project limit is the guard', () => {
		for (const row of UPLOAD_CEILING_LIST) {
			if (row.maxBytes == null) expect(row.guards).toContain('project');
			else expect(row.guards).not.toContain('project');
		}
	});

	it('every row carries advice, and it is not the same sentence twice over', () => {
		for (const row of UPLOAD_CEILING_LIST) {
			expect(row.advice.length).toBeGreaterThan(20);
			expect(row.advice.trim().endsWith('.')).toBe(true);
			// CLAUDE.md: no em dashes in user-facing copy.
			expect(row.advice).not.toMatch(/—/);
			expect(row.label).not.toMatch(/—/);
		}
	});
});

describe('a refusal names what was wrong, the limit, and what to do', () => {
	/**
	 * POSITIVE CONTROL 1 (required by the bundle): the sentence is DERIVED
	 * from the ceiling, not typed beside it. Moving the constant has to move
	 * the sentence, or the message is a literal that will one day promise a
	 * limit nobody enforces.
	 *
	 * The mutation that proves it bites: change `maxBytes` on the
	 * `feedback-screenshot` row from 8388608 to 4194304 and this reddens on
	 * the "8 MB" expectation. Done, reddened, restored from a `cp` copy and
	 * md5-verified; the run is in the history entry.
	 */
	it('derives the sentence from the ceiling rather than repeating it', () => {
		const ceiling = uploadCeiling('feedback-screenshot').maxBytes!;
		const message = uploadTooLargeMessage('feedback-screenshot', ceiling + 1);

		// The three things it owes the reader.
		expect(message).toContain('8.0 MB'); // the file
		expect(message).toContain('8 MB'); // the limit
		expect(message).toContain(uploadCeiling('feedback-screenshot').advice); // what to do

		// And it MOVES with the constant. Same function, a different row whose
		// ceiling is a different number: nothing in the sentence can be a
		// literal that happens to read correctly for one of them.
		const other = uploadTooLargeMessage('greenline-decal', 2 * 1024 * 1024);
		expect(other).toContain('1 MB');
		expect(other).not.toContain('8 MB');
		expect(other).toContain(uploadCeiling('greenline-decal').advice);
	});

	/**
	 * POSITIVE CONTROL 2 (required by the bundle): a file UNDER the ceiling
	 * that fails for another reason is not told about size. A student who
	 * picked a 40 MB video for a 200 MB bucket and was refused by RLS must not
	 * read a sentence about how big their file is.
	 *
	 * The mutation that proves it bites: drop the `tooBig` guard in
	 * `uploadFailureMessage` so every failure takes the size branch. Done,
	 * reddened, restored; the run is in the history entry.
	 */
	it('does not mention size when size was not the problem', () => {
		const denied = uploadFailureMessage({
			id: 'classroom-submission',
			status: 403,
			detail: 'new row violates row-level security policy',
			sizeBytes: 40 * 1024 * 1024
		});
		expect(denied).not.toMatch(/limit/i);
		expect(denied).not.toContain('40.0 MB');
		expect(denied).toContain('row-level security');
		expect(denied).toContain('403');

		// And the discrimination is not "any status": a 413 with the same size
		// DOES say it, which is what makes the absence above meaningful.
		const big = uploadFailureMessage({
			id: 'classroom-submission',
			status: 413,
			detail: 'The object exceeded the maximum allowed size',
			sizeBytes: 40 * 1024 * 1024
		});
		expect(big).toContain('40.0 MB');
		expect(big).toContain('200 MB');
	});

	it('names the site-wide limit, and no number, when the ceiling is not ours', () => {
		const message = uploadFailureMessage({
			id: 'foundry-bundle',
			status: 413,
			detail: 'The object exceeded the maximum allowed size',
			sizeBytes: 30 * 1024 * 1024
		});
		expect(message).toContain('30.0 MB');
		expect(message).toContain(PROJECT_CEILING_SENTENCE);
		// The thing that must NOT happen: inventing a ceiling for a path that
		// has none. 75 MB is the BROWSER's number and is not what refused this.
		expect(message).not.toContain('75 MB');
	});

	it('keeps an unanticipated message verbatim rather than paraphrasing it', () => {
		const message = uploadFailureMessage({
			id: 'maps-photo',
			status: 500,
			detail: 'Internal error while writing object'
		});
		expect(message).toBe('Internal error while writing object (HTTP 500)');
	});

	it('says something useful even when the server said nothing at all', () => {
		expect(uploadFailureMessage({ id: 'avatar', status: 500, detail: '' })).toContain('500');
		expect(uploadFailureMessage({ id: 'avatar', status: 0, detail: null })).not.toBe('');
	});

	it('refuses before sending only where a ceiling is actually known', () => {
		expect(uploadSizeRefusal('maps-photo', MAPS_MEDIA_MAX_BYTES + 1)).toMatch(/20 MB/);
		expect(uploadSizeRefusal('maps-photo', MAPS_MEDIA_MAX_BYTES)).toBeNull();
		// No ceiling here, so a pre-send refusal would be a guess that stops
		// files which would have worked. Null is the honest answer.
		expect(uploadSizeRefusal('tournament-thumb', 500 * 1024 * 1024)).toBeNull();
	});
});

describe('the notebook photo gate', () => {
	it('reads the same cap the route enforces', () => {
		expect(notebookPhotoRefusal({ size: MAX_PHOTO_BYTES })).toBeNull();
		const over = notebookPhotoRefusal({ size: MAX_PHOTO_BYTES + 1 });
		expect(over).toContain('4 MB');
		expect(over).toContain('4.0 MB');
		expect(over).toContain('camera button');
	});

	it('treats an empty pick as empty, never as oversize', () => {
		const empty = notebookPhotoRefusal({ size: 0 });
		expect(empty).toContain('empty');
		expect(empty).not.toMatch(/limit/i);
	});
});

describe('the routes that still surface a raw upstream sentence', () => {
	/**
	 * A TRIPWIRE OVER A CRISP SHAPE, NOT A CENSUS OF EVERY DEFECT.
	 *
	 * What it matches is one thing, statable in a sentence: in a file that
	 * uploads to Storage, an upstream `.message` either INTERPOLATED into a
	 * template literal, or assigned straight to something named like an error.
	 * Both are "render whatever the far end said, verbatim", which is the shape
	 * that put a number this application never set in front of a student.
	 *
	 * WHAT IT DELIBERATELY DOES NOT CATCH, said here so nobody reads the list
	 * as complete: `/foundry/submit`'s zip and cover uploads reach the same
	 * outcome through a local `fail(err)` helper that pulls `.message` off an
	 * `unknown`, and no regex that catches that stays crisp. (The file appears
	 * below anyway, for its ingest sentence, which is the same shape said out
	 * loud.) The audit table in the history entry is the complete list; this is
	 * the half a machine can watch.
	 *
	 * `$lib/upload-limits`' `uploadFailureMessage` is what each of these should
	 * be calling; removing a name from this array is the whole of adopting it.
	 * A NEW name appearing is a new path that tells a student nothing.
	 */
	it('is exactly the set the audit found, and no larger', () => {
		const root = path.resolve(__dirname, '../src');
		const files: string[] = [];
		const walk = (dir: string) => {
			for (const e of readdirSync(dir, { withFileTypes: true })) {
				const p = path.join(dir, e.name);
				if (e.isDirectory()) walk(p);
				else if (/\.(ts|svelte)$/.test(e.name)) files.push(p);
			}
		};
		walk(root);

		const INTERPOLATED = /\$\{[^}]*\.message\b/;
		const ASSIGNED_TO_AN_ERROR = /\berror[A-Za-z]*\s*[:=]\s*[A-Za-z_$][\w$.]*\.message\b/i;

		const hits: string[] = [];
		for (const file of files) {
			const src = readFileSync(file, 'utf8');
			if (!src.includes('.upload(')) continue;
			const rel = path.relative(root, file).replace(/\\/g, '/');
			for (const [i, line] of src.split('\n').entries()) {
				const t = line.trim();
				if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) continue;
				if (INTERPOLATED.test(line) || ASSIGNED_TO_AN_ERROR.test(line)) hits.push(`${rel}:${i + 1}`);
			}
		}

		// POSITIVE CONTROL for the sweep itself. A pattern that matched nothing
		// would report a clean tree, and clean is what nobody investigates.
		expect(hits.length).toBeGreaterThan(0);
		expect(hits).toContain('routes/tournaments/[id]/+page.svelte:182');

		const seen = [...new Set(hits.map((h) => h.split(':')[0]))].sort();
		expect(seen).toEqual([
			'lib/ProfileMenu.svelte',
			'lib/gauntlet/ChallengeForm.svelte',
			'lib/greenline/decals.ts',
			'lib/maps/transports.ts',
			'routes/foundry/submit/+page.svelte',
			'routes/tournaments/[id]/+page.svelte'
		]);
	});
});
