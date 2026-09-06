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
//
// ---------------------------------------------------------------------------
// 0072 CHANGED WHAT "AGREES" MEANS, AND THE ASSERTIONS WERE GENERALIZED RATHER
// THAN DELETED.
//
// The project is on the Supabase FREE plan, whose global upload limit is 50 MB
// and is FIXED. Twelve of the fifteen buckets stated something else -- three
// claimed 200 MiB, nine stated nothing at all -- so a registry row that agreed
// EXACTLY with its migration was agreeing with a number the platform would
// never honour. `0185_bucket_limits_under_the_global.sql` writes the true one.
//
// So two assertions changed shape:
//
//   * `agrees with its enforcing module` became `is its enforcing module's
//     number CAPPED at the portal ceiling`. The classroom trio are the case:
//     `CLASSROOM_UPLOAD_MAX_BYTES` is still 209715200 in a directory this
//     bundle does not own, and the registry now says 45 MiB because that is
//     what a student actually meets. The gap is asserted in that shape, so it
//     reddens when somebody closes it -- which is the follow-up.
//   * `agrees with the migration chain` became `is never ABOVE its bucket's
//     limit`, with the rows that are deliberately BELOW named in a pinned list
//     and required to carry a browser guard. Equality alone would refuse the
//     avatar row, whose real ceiling is a 2 MB check in `ProfileMenu.svelte`
//     sitting in front of a 45 MiB bucket.
//
// AND `maxBytes: null` IS NOW A TRIPWIRE RATHER THAN A LIVE STATE. No row
// carries it, which is asserted; the branch that renders
// `PROJECT_CEILING_SENTENCE` is therefore unreachable through the public API
// today, and that is the point rather than an oversight -- a bucket added
// tomorrow with no `file_size_limit` puts a row back in that state and this
// file is what will say so.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	PORTAL_UPLOAD_MAX_BYTES,
	PROJECT_CEILING_SENTENCE,
	SUPABASE_PROJECT_FILE_SIZE_LIMIT_BYTES,
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
			// STOP AT `on conflict`. Everything between `values` and the `;` is
			// scanned for tuples, and `on conflict (id) do update` is a `(id)`
			// that parses as a one-column tuple whose first element is the bare
			// word `id` -- so the sweep invented a sixteenth bucket called
			// "id". Harmless while every assertion only ever looked up a bucket
			// the registry named; NOT harmless now that a sweep walks the whole
			// map asking whether any bucket is left unstated, where a phantom
			// with no limit is a failure about a bucket that does not exist.
			const body = m[2].split(/\bon\s+conflict\b/i)[0];
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

		// THE CAP FORM, WHICH 0185 IS. An UNQUALIFIED
		// `update storage.buckets set file_size_limit = least(coalesce(file_size_limit, N), N)`
		// means one thing and this models exactly that one thing: every bucket
		// that exists at this point in the chain is lowered to at most N, and a
		// bucket that stated nothing is given N. It cannot raise anything,
		// which is why 1 MiB, 8 MiB and 20 MiB survive it.
		//
		// THIS IS A SECOND IMPLEMENTATION OF SQL AND IT IS ONLY SAFE BECAUSE
		// SOMETHING FAILS WHEN IT DISAGREES: `tests/db/bucket-limits.test.ts`
		// applies the REAL file to a REAL Postgres and asserts the resulting
		// rows against the same registry these assertions read. If this parser
		// were wrong, the database half would still redden. Keep both.
		const cap =
			/update\s+storage\.buckets\s+set\s+file_size_limit\s*=\s*least\s*\(\s*coalesce\s*\(\s*file_size_limit\s*,\s*(\d+)\s*\)\s*,\s*(\d+)\s*\)\s*;/gi;
		let c: RegExpExecArray | null;
		while ((c = cap.exec(code))) {
			// The two literals are the same number in the shipped file; if a
			// future edit makes them differ, the `coalesce` default is what an
			// unset bucket gets and the outer one is the cap.
			const fallback = Number(c[1]);
			const ceiling = Number(c[2]);
			for (const [id, value] of [...limits.entries()]) {
				limits.set(id, Math.min(value ?? fallback, ceiling));
			}
		}
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

	/**
	 * THE GLOBAL AND THE PORTAL CEILING, AND THE ORDER THEY HAVE TO BE IN.
	 *
	 * This is the assertion the whole 0072 bundle rests on: the number every
	 * bucket carries has to sit UNDER the number the platform refuses at, or
	 * the application is back to promising a ceiling nobody honours. Both are
	 * stated once, here they are checked against each other, and the margin is
	 * printed as a number rather than described.
	 */
	it('states the global once, and keeps the portal ceiling under it', () => {
		expect(SUPABASE_PROJECT_FILE_SIZE_LIMIT_BYTES).toBe(50_000_000);
		expect(PORTAL_UPLOAD_MAX_BYTES).toBe(45 * 1024 * 1024);
		expect(PORTAL_UPLOAD_MAX_BYTES).toBeLessThan(SUPABASE_PROJECT_FILE_SIZE_LIMIT_BYTES);
		// The margin, so a future raise cannot quietly spend all of it: a
		// multipart envelope is under a kilobyte and this is 2.8 MB.
		expect(SUPABASE_PROJECT_FILE_SIZE_LIMIT_BYTES - PORTAL_UPLOAD_MAX_BYTES).toBe(2_814_080);
		// And no row anywhere may exceed either.
		for (const row of UPLOAD_CEILING_LIST) {
			if (row.maxBytes == null) continue;
			expect(`${row.id}: ${row.maxBytes}`).toBe(
				`${row.id}: ${Math.min(row.maxBytes, PORTAL_UPLOAD_MAX_BYTES)}`
			);
		}
	});

	/**
	 * Every row's number against the module that actually enforces it, CAPPED
	 * AT THE PORTAL CEILING -- see the header. The cap is what makes the
	 * classroom trio pass while `CLASSROOM_UPLOAD_MAX_BYTES` is still 200 MiB,
	 * and it is not a way of ignoring that: the gap gets its own assertion
	 * below, which reddens when it closes.
	 */
	it.each([
		['classroom-attachment', CLASSROOM_UPLOAD_MAX_BYTES],
		['classroom-submission', CLASSROOM_UPLOAD_MAX_BYTES],
		['classroom-instructor', CLASSROOM_UPLOAD_MAX_BYTES],
		['classroom-deck', DECK_UPLOAD_MAX_ZIP_BYTES],
		['notebook-photo', MAX_PHOTO_BYTES],
		['maps-photo', MAPS_MEDIA_MAX_BYTES],
		['feedback-screenshot', FEEDBACK_SCREENSHOT_MAX_BYTES],
		['greenline-decal', DECAL_MAX_BYTES]
	] as [UploadPathId, number][])(
		'%s is its enforcing module capped at the portal ceiling',
		(id, enforced) => {
			expect(uploadCeiling(id).maxBytes).toBe(Math.min(enforced, PORTAL_UPLOAD_MAX_BYTES));
		}
	);

	/**
	 * THE ONE GAP THIS BUNDLE COULD NOT CLOSE, ASSERTED SO IT CANNOT BE
	 * FORGOTTEN. `$lib/classroom/file-upload` is outside what 0072 owns, so its
	 * browser guard still refuses at 200 MiB in front of a 45 MiB bucket: a
	 * classroom pick in between passes the browser, transfers, and is refused
	 * at the far end. That is the Foundry defect one directory over.
	 *
	 * WHEN SOMEBODY FIXES IT THIS REDDENS, which is the intent -- the fix is
	 * one constant, and the reader is then told to delete this test rather than
	 * left to wonder whether the gap was deliberate.
	 */
	it('still has a classroom browser guard looser than the classroom bucket', () => {
		expect(CLASSROOM_UPLOAD_MAX_BYTES).toBeGreaterThan(PORTAL_UPLOAD_MAX_BYTES);
		expect(uploadCeiling('classroom-submission').maxBytes).toBe(PORTAL_UPLOAD_MAX_BYTES);
	});

	/**
	 * FOUNDRY WAS THE ROW WHOSE CLIENT NUMBER DELIBERATELY DID NOT MATCH ITS
	 * BUCKET, AND THAT IS WHAT 0072 CLOSED. It used to read: browser 75 MiB,
	 * bucket null, so anything in between transferred whole and was refused by
	 * a ceiling nobody here could name. Now the two are the same number and the
	 * refusal happens before a byte moves.
	 *
	 * The three statements of it -- this constant, the registry row, and the
	 * bucket row 0185 writes -- exist separately because `preflight.ts` is
	 * imported by a Deno isolate that cannot resolve a `$lib` alias. This is
	 * the assertion that keeps them one number.
	 */
	it('refuses a foundry zip at the same number the bucket carries', () => {
		expect(FOUNDRY_LIMITS.maxZipBytes).toBe(PORTAL_UPLOAD_MAX_BYTES);
		expect(uploadCeiling('foundry-bundle').maxBytes).toBe(PORTAL_UPLOAD_MAX_BYTES);
		expect(uploadCeiling('foundry-bundle').guards).toContain('browser');
		expect(uploadCeiling('foundry-bundle').guards).toContain('bucket');
		expect(uploadCeiling('foundry-bundle').guards).not.toContain('project');
	});

	/**
	 * `maxTotalBytes` IS A DIFFERENT AXIS AND WAS NOT MOVED. Pinned so a future
	 * session lowering the zip cap again does not take the unpacked cap with it
	 * on the assumption that they are the same fact. They are not: one bounds
	 * the wire and Storage, the other bounds the ingest function's memory.
	 */
	it('leaves the unpacked cap alone, and it is still the larger of the two', () => {
		expect(FOUNDRY_LIMITS.maxTotalBytes).toBe(110 * 1024 * 1024);
		expect(FOUNDRY_LIMITS.maxTotalBytes).toBeGreaterThan(FOUNDRY_LIMITS.maxZipBytes);
	});

	/**
	 * THE ROWS THAT ARE DELIBERATELY TIGHTER THAN THEIR BUCKET, BY NAME.
	 *
	 * A registry number BELOW its bucket's is legitimate exactly when a browser
	 * guard in front of the bucket is what a person actually meets -- the
	 * avatar picker refuses at 2 MB and Storage is never asked. Pinned as a list
	 * so a new one has to be declared: an undeclared row that drifted low is
	 * indistinguishable from this, and a registry that quietly under-reports a
	 * ceiling refuses files that would have worked.
	 */
	const TIGHTER_THAN_ITS_BUCKET: UploadPathId[] = ['avatar'];

	it('never states a ceiling ABOVE the bucket the migration chain gives it', () => {
		const chain = bucketLimitsFromChain();
		// A positive control for the sweep itself: if this parse came back
		// empty, or missed the buckets that DO carry a limit, every assertion
		// below would pass vacuously. `least(...)` in 0185 is why the first
		// three are what they are and the fourth is untouched.
		expect(chain.get('classroom-attachments')).toBe(PORTAL_UPLOAD_MAX_BYTES);
		expect(chain.get('foundry-uploads')).toBe(PORTAL_UPLOAD_MAX_BYTES);
		expect(chain.get('avatars')).toBe(PORTAL_UPLOAD_MAX_BYTES);
		expect(chain.get('greenline-decals')).toBe(1048576);

		const problems: string[] = [];
		for (const row of UPLOAD_CEILING_LIST) {
			if (!row.bucket) continue;
			const chainValue = chain.has(row.bucket) ? chain.get(row.bucket)! : null;
			if (chainValue == null) {
				problems.push(`${row.id}: bucket ${row.bucket} still carries no file_size_limit`);
				continue;
			}
			if (row.maxBytes == null) {
				problems.push(`${row.id}: registry says null against a bucket that states ${chainValue}`);
				continue;
			}
			if (row.maxBytes > chainValue) {
				problems.push(`${row.id}: registry ${row.maxBytes} is ABOVE bucket ${chainValue}`);
				continue;
			}
			if (row.maxBytes < chainValue && !TIGHTER_THAN_ITS_BUCKET.includes(row.id)) {
				problems.push(
					`${row.id}: registry ${row.maxBytes} is below bucket ${chainValue} and is not a declared browser guard`
				);
			}
		}
		expect(problems).toEqual([]);
	});

	/** Every declared tighter row has to actually have the guard it claims. */
	it('backs every deliberately-tighter row with a browser guard', () => {
		for (const id of TIGHTER_THAN_ITS_BUCKET) {
			expect(`${id}: ${uploadCeiling(id).guards.join(',')}`).toContain('browser');
		}
	});

	/**
	 * 0185's WHOLE CLAIM, READ BACK OFF THE CHAIN: no bucket the chain creates
	 * is left without a limit, and none states one above the global. This is
	 * the file-level twin of the migration's own self-check, and it is the
	 * assertion that would have caught the defect in the first place.
	 */
	it('leaves no bucket in the chain unstated or above the global', () => {
		const chain = bucketLimitsFromChain();
		// Positive control: the sweep found the buckets at all.
		expect(chain.size).toBeGreaterThanOrEqual(15);

		const unstated = [...chain.entries()].filter(([, v]) => v == null).map(([k]) => k);
		const overGlobal = [...chain.entries()]
			.filter(([, v]) => v != null && v > SUPABASE_PROJECT_FILE_SIZE_LIMIT_BYTES)
			.map(([k, v]) => `${k}=${v}`);
		expect({ unstated, overGlobal }).toEqual({ unstated: [], overGlobal: [] });
	});

	/**
	 * THE TRIPWIRE. No row carries `null` today, so `PROJECT_CEILING_SENTENCE`
	 * is unreachable through the public API -- which is the outcome 0072 was
	 * for. A row appearing with null is a bucket back in the old state, and the
	 * assertion below is what says so; the guard rule stays either way.
	 */
	it('has no unstated ceiling left, and still requires the project guard if one returns', () => {
		expect(UPLOAD_CEILING_LIST.filter((r) => r.maxBytes == null).map((r) => r.id)).toEqual([]);
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
	 * picked a 40 MB video for a 45 MB bucket and was refused by RLS must not
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
			sizeBytes: 60 * 1024 * 1024
		});
		expect(big).toContain('60.0 MB');
		// 45 MB, not 200 MB. The bucket said 200 MiB for two migrations and the
		// platform never honoured a byte of it.
		expect(big).toContain('45 MB');
		expect(big).not.toContain('200 MB');
	});

	/**
	 * THE SENTENCE A FOUNDRY STUDENT NOW READS, AND THE ONE THEY USED TO.
	 *
	 * It used to be `PROJECT_CEILING_SENTENCE` -- "a site admin sets the limit
	 * outside this app" -- because the bucket had no ceiling and naming the
	 * browser's 75 MB would have been inventing one. That was the honest answer
	 * to a dishonest situation. Now the bucket states 45 MB, the browser
	 * refuses at the same number, and the sentence names it.
	 */
	it('names the real foundry ceiling now that the bucket states one', () => {
		const message = uploadFailureMessage({
			id: 'foundry-bundle',
			status: 413,
			detail: 'The object exceeded the maximum allowed size',
			sizeBytes: 60 * 1024 * 1024
		});
		expect(message).toContain('60.0 MB');
		expect(message).toContain('45 MB');
		expect(message).toContain(uploadCeiling('foundry-bundle').advice);
		// The two numbers that must NOT appear: the old browser ceiling, and
		// the deferral to an admin, which is now a sentence about a limit this
		// application does state.
		expect(message).not.toContain('75 MB');
		expect(message).not.toContain(PROJECT_CEILING_SENTENCE);
	});

	/**
	 * AND THE SENTENCE ITSELF IS STILL RIGHT, for the row that does not exist
	 * today. Asserted on the constant rather than through a call, because no
	 * row can reach it -- see the tripwire above.
	 */
	it('keeps a sentence for an unstated ceiling, naming no number', () => {
		expect(PROJECT_CEILING_SENTENCE).toMatch(/site-wide/);
		expect(PROJECT_CEILING_SENTENCE).toMatch(/admin/);
		expect(PROJECT_CEILING_SENTENCE).not.toMatch(/\d+\s*MB/);
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

	it('refuses before sending, on every path, now that every path has a number', () => {
		expect(uploadSizeRefusal('maps-photo', MAPS_MEDIA_MAX_BYTES + 1)).toMatch(/20 MB/);
		expect(uploadSizeRefusal('maps-photo', MAPS_MEDIA_MAX_BYTES)).toBeNull();
		// This used to be null: no ceiling was known, so a pre-send refusal
		// would have been a guess. 0185 gave the bucket a number, so the honest
		// answer changed from "cannot tell" to the number.
		expect(uploadSizeRefusal('tournament-thumb', 500 * 1024 * 1024)).toMatch(/45 MB/);
		expect(uploadSizeRefusal('tournament-thumb', PORTAL_UPLOAD_MAX_BYTES)).toBeNull();
		// Every row, both directions, in one sweep: at the ceiling is fine and
		// one byte over is not. A path that answered null to both would pass a
		// pair of assertions written one at a time.
		for (const row of UPLOAD_CEILING_LIST) {
			const max = row.maxBytes;
			expect(`${row.id} at:  ${uploadSizeRefusal(row.id, max!) === null}`).toBe(
				`${row.id} at:  true`
			);
			expect(`${row.id} over: ${uploadSizeRefusal(row.id, max! + 1) !== null}`).toBe(
				`${row.id} over: true`
			);
		}
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
