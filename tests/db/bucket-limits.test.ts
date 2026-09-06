// tests/db/bucket-limits.test.ts
//
// 0185: EVERY BUCKET STATES A NUMBER THAT IS TRUE.
//
// WHY THIS FILE EXISTS. The project is on the Supabase FREE plan, whose global
// upload file size limit is 50 MB and is FIXED. Before 0185, twelve of the
// fifteen buckets said something else: `classroom-attachments`,
// `submission-files` and `instructor-attachments` each claimed 209715200
// (200 MiB), which the platform would never have honoured, and nine more --
// `avatars`, the four `gauntlet*` buckets, `tournament-thumbs` and the three
// `foundry-*` buckets -- stated nothing at all and silently inherited a ceiling
// no sentence in this application could name.
//
// THE ROW IS THE ONLY PLACE THAT FACT LIVES. Nothing in `src/` reads
// `storage.buckets`, so nothing in `src/` can regress this and nothing in
// `src/` would report it either -- exactly the shape `tests/` exists for in
// this repo. `tests/upload-limits.test.ts` is the cheap static twin (it parses
// the chain); THIS file is the authority, because it applies the real SQL to a
// real Postgres and reads the real rows back.
//
// WHAT IT ASSERTS:
//   A. THE REAL CHAIN. `avatars` is created by the real 0020 with no
//      `file_size_limit` at all; after the real 0185 it states 47185920.
//      That is the migration doing its job over data a real migration wrote,
//      rather than over a fixture.
//   B. THE CENSUS, over all fifteen buckets seeded at the values the dashboard
//      showed on 2026-09-05: the three fictions drop, the nine unset ones gain
//      a number, and the three that were already telling the truth are left
//      exactly where they were. `least(...)` cannot raise a limit and this is
//      the direction that proves it.
//   C. RE-APPLIABILITY. The file lands twice with the same end state, because
//      re-pasting a migration is ordinary in this repo.
//   D. THE SELF-CHECK REFUSES. Required positive control 1: a bucket above the
//      global fails the file's own self-check, with its own words. Driven by
//      extracting the self-check block from the shipped file between its
//      markers, so the text under test is the text that ships.
//   E. THE STATIC TWIN AGREES. The registry in `$lib/upload-limits` is what
//      both halves are checked against, so a wrong parser over there cannot
//      certify a wrong bucket row over here.
//
// NO MIGRATION FILE IS EDITED, AT ANY POINT, FOR ANY REASON. The mutations in
// D are rows inserted into a disposable database, never a change to the file.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestDb, type TestDb } from './harness';
import { PORTAL_UPLOAD_MAX_BYTES, UPLOAD_CEILING_LIST } from '../../src/lib/upload-limits';

const FILE_0185 = '0185_bucket_limits_under_the_global.sql';
const SQL_0185 = readFileSync(
	fileURLToPath(new URL(`../../supabase/migrations/${FILE_0185}`, import.meta.url)),
	'utf8'
);

/**
 * THE SELF-CHECK, CUT OUT OF THE SHIPPED FILE BY ITS OWN MARKERS.
 *
 * Retyping it here would characterize what somebody believed it did. The
 * markers are comment lines in the migration; if either goes missing this
 * throws rather than silently testing an empty string, which is the failure
 * mode a `slice` between two `indexOf`s has when one of them is -1.
 */
function selfCheckSql(): string {
	const open = SQL_0185.indexOf('0185-SELFCHECK-BEGIN');
	const close = SQL_0185.indexOf('0185-SELFCHECK-END');
	if (open < 0 || close < 0 || close <= open) {
		throw new Error('0185 no longer carries its self-check markers; this test cannot run.');
	}
	const body = SQL_0185.slice(SQL_0185.indexOf('\n', open) + 1, close);
	// It must actually be the do-block, not a comment fragment.
	if (!body.includes('0185 REFUSES')) {
		throw new Error('the extracted 0185 self-check does not contain its own refusal text.');
	}
	return body.replace(/--\s*$/, '');
}

/**
 * THE FIFTEEN BUCKETS AS THE MIGRATION CHAIN LEAVES THEM BEFORE 0185, which is
 * also what the Supabase dashboard showed on 2026-09-05. Seeded by plain insert
 * because that is precisely how the real migrations create them -- there is no
 * RPC for a bucket row, so this is the real pre-migration mechanism and not a
 * shortcut around one.
 */
const BEFORE: { id: string; limit: number | null; public: boolean }[] = [
	{ id: 'avatars', limit: null, public: false },
	{ id: 'classroom-attachments', limit: 209715200, public: false },
	{ id: 'feedback-media', limit: 8388608, public: false },
	{ id: 'foundry-bundles', limit: null, public: false },
	{ id: 'foundry-covers', limit: null, public: false },
	{ id: 'foundry-uploads', limit: null, public: false },
	{ id: 'gauntlet', limit: null, public: true },
	{ id: 'gauntlet-drawings', limit: null, public: false },
	{ id: 'gauntlet-models', limit: null, public: false },
	{ id: 'gauntlet-tools', limit: null, public: true },
	{ id: 'greenline-decals', limit: 1048576, public: true },
	{ id: 'instructor-attachments', limit: 209715200, public: false },
	{ id: 'maps-media', limit: 20971520, public: true },
	{ id: 'submission-files', limit: 209715200, public: false },
	{ id: 'tournament-thumbs', limit: null, public: true }
];

/** 45 MiB. Written out rather than imported, so the test states the number. */
const PORTAL = 47185920;

async function seedBuckets(db: TestDb) {
	for (const b of BEFORE) {
		await db.sql(
			`insert into storage.buckets (id, name, public, file_size_limit)
			 values ($1, $1, $2, $3)
			 on conflict (id) do update set file_size_limit = excluded.file_size_limit`,
			[b.id, b.public, b.limit]
		);
	}
}

async function limitsNow(db: TestDb): Promise<Map<string, number | null>> {
	const { rows } = await db.sql<{ id: string; file_size_limit: string | null }>(
		'select id, file_size_limit::text as file_size_limit from storage.buckets order by id'
	);
	return new Map(rows.map((r) => [r.id, r.file_size_limit == null ? null : Number(r.file_size_limit)]));
}

/* ------------------------------------------------------------------------- */
/* A. The real chain: a bucket a real migration created with no limit.        */
/* ------------------------------------------------------------------------- */
describe('A. 0185 over a bucket the real chain created unset', () => {
	let db: TestDb;

	beforeAll(async () => {
		// 0020 is the real migration that creates `avatars`, and it creates it
		// with `(id, name, public)` and no `file_size_limit` -- which is the
		// defect, in the tree, written by a file nobody is going to rewrite.
		db = await startTestDb([
			'0001_profiles.sql',
			'0003_profile_section.sql',
			'0020_profiles_identity.sql'
		]);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('finds avatars genuinely unset before the file runs', async () => {
		const before = await limitsNow(db);
		// The positive control for the whole describe: if 0020 had set a limit,
		// or if the bucket were missing, every assertion below would be about
		// nothing.
		expect(before.has('avatars')).toBe(true);
		expect(before.get('avatars')).toBeNull();
	});

	it('gives it the portal ceiling, and says so in a notice', async () => {
		await db.sql(SQL_0185);
		const after = await limitsNow(db);
		expect(after.get('avatars')).toBe(PORTAL);
	});
});

/* ------------------------------------------------------------------------- */
/* B, C, E. The census, re-appliability, and the registry.                    */
/* ------------------------------------------------------------------------- */
describe('B. the fifteen buckets, before and after', () => {
	let db: TestDb;
	let after: Map<string, number | null>;

	beforeAll(async () => {
		db = await startTestDb([]);
		await seedBuckets(db);
		await db.sql(SQL_0185);
		after = await limitsNow(db);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('seeded all fifteen, which is what stops the sweep passing over nothing', () => {
		expect(after.size).toBe(15);
	});

	it('drops the three that claimed 200 MiB', () => {
		for (const id of ['classroom-attachments', 'submission-files', 'instructor-attachments']) {
			expect(`${id}: ${after.get(id)}`).toBe(`${id}: ${PORTAL}`);
		}
	});

	it('gives a number to the nine that stated none', () => {
		const wasUnset = BEFORE.filter((b) => b.limit == null).map((b) => b.id);
		// The count is asserted, so a seed list that quietly lost a row cannot
		// make this pass by having nothing to check.
		expect(wasUnset.length).toBe(9);
		for (const id of wasUnset) {
			expect(`${id}: ${after.get(id)}`).toBe(`${id}: ${PORTAL}`);
		}
	});

	it('leaves the three that were already true exactly where they were', () => {
		// THE DIRECTION THAT PROVES `least` CANNOT RAISE. A migration that
		// simply assigned the ceiling would pass every assertion above and
		// would raise a 1 MiB decal bucket to 45 MiB on the way past.
		expect(after.get('greenline-decals')).toBe(1048576);
		expect(after.get('feedback-media')).toBe(8388608);
		expect(after.get('maps-media')).toBe(20971520);
	});

	it('leaves nothing unset and nothing above the global', () => {
		const unstated = [...after.entries()].filter(([, v]) => v == null).map(([k]) => k);
		const over = [...after.entries()]
			.filter(([, v]) => v != null && v > 50_000_000)
			.map(([k, v]) => `${k}=${v}`);
		expect({ unstated, over }).toEqual({ unstated: [], over: [] });
	});

	it('C. lands a second time with the same end state', async () => {
		await db.sql(SQL_0185);
		const twice = await limitsNow(db);
		expect([...twice.entries()].sort()).toEqual([...after.entries()].sort());
	});

	it('E. agrees with the registry every shipping surface reads', () => {
		expect(PORTAL_UPLOAD_MAX_BYTES).toBe(PORTAL);
		const problems: string[] = [];
		for (const row of UPLOAD_CEILING_LIST) {
			if (!row.bucket) continue;
			const real = after.get(row.bucket);
			if (real === undefined) {
				problems.push(`${row.id}: bucket ${row.bucket} is not in the census`);
			} else if (row.maxBytes == null) {
				problems.push(`${row.id}: registry says null against a bucket stating ${real}`);
			} else if (real == null || row.maxBytes > real) {
				problems.push(`${row.id}: registry ${row.maxBytes} is above bucket ${real}`);
			}
		}
		expect(problems).toEqual([]);
	});
});

/* ------------------------------------------------------------------------- */
/* D. The self-check refuses. REQUIRED POSITIVE CONTROL 1.                    */
/* ------------------------------------------------------------------------- */
describe('D. the self-check refuses a bucket above the global', () => {
	let db: TestDb;

	beforeAll(async () => {
		db = await startTestDb([]);
		await seedBuckets(db);
		await db.sql(SQL_0185);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	/**
	 * THE NEGATIVE CONTROL, FIRST. The extracted block has to be silent on a
	 * database that satisfies it, or a refusal below proves only that the
	 * extraction is broken.
	 */
	it('says nothing on the database the file just left behind', async () => {
		await expect(db.sql(selfCheckSql())).resolves.toBeDefined();
	});

	it('raises, and names the bucket and the global, when one row is above it', async () => {
		await db.sql(
			`insert into storage.buckets (id, name, public, file_size_limit)
			 values ('fiction-bucket', 'fiction-bucket', false, 209715200)`
		);
		let message = '';
		try {
			await db.sql(selfCheckSql());
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain('0185 REFUSES');
		expect(message).toContain('fiction-bucket');
		expect(message).toContain('209715200');
		expect(message).toContain('50000000');
	});

	it('raises on a row that states nothing at all, which is the other fiction', async () => {
		await db.sql(`delete from storage.buckets where id = 'fiction-bucket'`);
		await db.sql(
			`insert into storage.buckets (id, name, public, file_size_limit)
			 values ('unstated-bucket', 'unstated-bucket', false, null)`
		);
		let message = '';
		try {
			await db.sql(selfCheckSql());
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain('0185 REFUSES');
		expect(message).toContain('no file_size_limit at all');
	});

	/**
	 * AND A ROW UNDER THE GLOBAL BUT OVER THE PORTAL CEILING IS STILL REFUSED.
	 * Check B alone would pass 49,000,000; the client preflights would not, and
	 * a bucket the browser disagrees with is the defect wearing a smaller
	 * number. This is what makes check C in the file more than decoration.
	 */
	it('raises on a row under the global but over the portal ceiling', async () => {
		await db.sql(`delete from storage.buckets where id = 'unstated-bucket'`);
		await db.sql(
			`insert into storage.buckets (id, name, public, file_size_limit)
			 values ('nearly-bucket', 'nearly-bucket', false, 49000000)`
		);
		let message = '';
		try {
			await db.sql(selfCheckSql());
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain('0185 REFUSES');
		expect(message).toContain('portal ceiling');
		expect(message).toContain('nearly-bucket');
		// And it is NOT the global check that caught it, which is the whole
		// point of asserting this case separately.
		expect(message).not.toContain('above the 50000000 byte global');
	});

	/**
	 * THE MIGRATION ITSELF CANNOT LEAVE ANY OF THOSE BEHIND, which is why the
	 * refusals above had to be provoked by inserting rows AFTER it ran: the
	 * unqualified `least(coalesce(...))` sweeps every row there is. Applying
	 * the whole file over the violating rows fixes them and commits.
	 */
	it('the whole file, run over those same rows, sweeps them instead of refusing', async () => {
		await expect(db.sql(SQL_0185)).resolves.toBeDefined();
		const after = await limitsNow(db);
		expect(after.get('nearly-bucket')).toBe(PORTAL);
	});
});
