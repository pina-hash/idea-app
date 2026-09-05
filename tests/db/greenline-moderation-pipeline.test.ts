/**
 * GREENLINE moderation, end to end, as a real student and a real teacher.
 *
 * WHY THIS FILE EXISTS. GREENLINE takes two kinds of student submission that
 * then wait on a teacher -- a custom decal (0051) and a community track
 * (0057/0058/0059) -- and until this suite neither pipeline had ever been
 * driven. Both are the kind of failure that is SILENT in both directions if it
 * exists: a student can use their own pending decal in their own garage and can
 * race their own pending track, so "I submitted it" and "I can see it" are both
 * true for them while nobody else can see anything, and nothing tells a teacher
 * a queue has anything in it. A pipeline nobody has driven is not a working
 * pipeline, it is an untested one.
 *
 * WHAT IS ASSERTED, and it is the six steps of a real round trip for each of
 * them: the submission exists and in what state; it reaches a teacher's queue;
 * an approval reaches OTHER students; a send-back reaches the AUTHOR with the
 * teacher's words; and a resubmission returns to pending.
 *
 * THE POSITIVE CONTROLS ARE THE POINT OF THE ABSENCE ROWS. Every "another
 * student cannot see this" assertion is paired with a run over a database
 * whose gate has been opened in the PERMISSIVE direction, on which the same
 * assertion must FAIL -- otherwise a fixture that simply has no rows in it
 * passes every exclusion in the file. The three controls are built the way
 * CLAUDE.md requires: a mutated COPY of the migration text applied to its own
 * database, never an edit to a file on disk, so there is nothing to restore
 * and `git checkout --` is never reached for.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { startTestDb, type TestDb } from './harness';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * The GREENLINE dependency chain, not the whole history. 0001/0003/0020 are
 * profiles and the role derivation; 0067 is the ADMIN tier, and it is why this
 * file grants through `app_admins` rather than by setting `profiles.role` --
 * post-0067 `is_teacher()` RETURNS `is_admin()`, so a `teacher` role grants
 * nothing at all and a suite that seeded one would be asserting about a caller
 * with no permissions while believing it had a teacher. 0049-0056 are the
 * GREENLINE tables 0057's chain sits on (0052's wallets and 0049's results are
 * both written by the submit RPC 0058/0059 recreate). 0137 goes LAST because it
 * is a sweep over whatever the chain above it created.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0049_greenline_accounts.sql',
	'0050_greenline_loadout_slots.sql',
	'0051_greenline_decals.sql',
	'0052_greenline_economy.sql',
	'0054_greenline_race_telemetry.sql',
	'0055_greenline_phase8g_weapon_prices.sql',
	'0056_greenline_aero_part_prices.sql',
	'0057_greenline_community_tracks.sql',
	'0058_greenline_track_featuring.sql',
	'0059_greenline_track_review.sql',
	'0067_admin_tier.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const AVA = '11111111-1111-4111-8111-111111111111'; // student, the author
const BEN = '22222222-2222-4222-8222-222222222222'; // student, everybody else
const TEACHER = '33333333-3333-4333-8333-333333333333';
const OUTSIDER = '44444444-4444-4444-8444-444444444444'; // signed in, no grant

const PEOPLE: ReadonlyArray<readonly [string, string, string]> = [
	[AVA, 'ava@boscotech.net', 'student'],
	[BEN, 'ben@boscotech.net', 'student'],
	[TEACHER, 'teach@boscotech.edu', 'teacher'],
	// Domain-derived `teacher` with NO admin grant: the caller who proves the
	// role is not the gate. 0067 made every elevated capability an explicit
	// grant, so this person is staff by email and nothing by permission.
	[OUTSIDER, 'nogrant@boscotech.edu', 'teacher']
];

const TRACK_DATA = JSON.stringify({ v: 2, name: 'seed' });

/** Seeding + the storage grants the stub does not carry (see the avatar suites). */
async function prepare(d: TestDb) {
	await d.sql(`grant select, insert, update, delete on storage.objects to authenticated`);
	await d.sql(`grant select on storage.buckets to authenticated`);
	for (const [id, email, role] of PEOPLE) {
		await d.sql(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
		await d.sql(
			`insert into public.profiles (id, email, role) values ($1, $2, $3)
			 on conflict (id) do update set email = excluded.email, role = excluded.role`,
			[id, email, role]
		);
	}
	// THE grant. `app_admins` is keyed by lowercased email, not by user id.
	await d.sql(
		`insert into public.app_admins (email) values ('teach@boscotech.edu') on conflict do nothing`
	);
}

/**
 * Publish a track the way production does: through the SERVICE ROLE, because
 * `greenline_tracks` has no client insert grant or policy at all and the only
 * writer is the SvelteKit endpoint holding the service key (0057's header says
 * why -- authoritative validation runs the game's real TypeScript). Driving it
 * as `authenticated` would be testing a path that does not exist.
 */
async function publishTrack(d: TestDb, author: string, name: string): Promise<string> {
	const r = await d.asServiceRole((q) =>
		q<{ id: string }>(
			`insert into public.greenline_tracks (author_id, author_name, name, data, length_m)
			 values ($1, $2, $3, $4::jsonb, 900) returning id`,
			[author, 'Ava', name, TRACK_DATA]
		)
	);
	return r.rows[0].id;
}

async function uploadDecal(d: TestDb, uid: string, tag: string): Promise<string> {
	const path = `${uid}/${tag}.png`;
	await d.asUser(uid, async (q) => {
		await q(`insert into storage.objects (bucket_id, name) values ('greenline-decals', $1)`, [
			path
		]);
		await q(
			`insert into public.greenline_decals (user_id, path, status, reviewer_feedback, submitted_at, reviewed_at)
			 values ($1, $2, 'pending', '', now(), null)
			 on conflict (user_id) do update
			   set path = excluded.path, status = 'pending', reviewer_feedback = '', reviewed_at = null`,
			[uid, path]
		);
	});
	return path;
}

/** How many `greenline_tracks` rows this caller can SELECT at all. */
const visibleTracks = (d: TestDb, uid: string) =>
	d.asUser(uid, async (q) => (await q(`select id from public.greenline_tracks`)).rows.length);

/** How many decal OBJECTS this caller can read out of the private bucket. */
const visibleDecalObjects = (d: TestDb, uid: string) =>
	d.asUser(
		uid,
		async (q) =>
			(await q(`select name from storage.objects where bucket_id = 'greenline-decals'`)).rows
				.length
	);

// ---------------------------------------------------------------------------
// The round trip, on the real migrations.
// ---------------------------------------------------------------------------
describe('GREENLINE moderation round trip', () => {
	let d: TestDb;
	beforeAll(async () => {
		d = await startTestDb(CHAIN);
		await prepare(d);
	}, 180_000);
	afterAll(async () => {
		await d?.stop();
	});

	it('0067 is why the grant is on app_admins: the email domain alone is not staff', async () => {
		const asks = async (uid: string) =>
			d.asUser(uid, async (q) => (await q(`select public.is_teacher() as t`)).rows[0].t);
		expect(await asks(TEACHER)).toBe(true);
		// A @boscotech.edu account with no app_admins row. If this ever comes
		// back true, every "teachers only" assertion below is being made about a
		// caller half the school qualifies as.
		expect(await asks(OUTSIDER)).toBe(false);
		expect(await asks(AVA)).toBe(false);
	});

	describe('a custom decal (0051)', () => {
		let path = '';
		beforeAll(async () => {
			path = await uploadDecal(d, AVA, 'first');
		});

		it('1. exists, pending, and its author can already use it', async () => {
			const own = await d.asUser(AVA, (q) =>
				q<{ status: string }>(`select status from public.greenline_decals`)
			);
			expect(own.rows).toHaveLength(1);
			expect(own.rows[0].status).toBe('pending');
			// The author reads their OWN object at any status: that is what makes
			// a decal usable in their own garage before anybody has looked at it,
			// and it is exactly what makes the silence expensive.
			expect(await visibleDecalObjects(d, AVA)).toBe(1);
		});

		it('2. reaches the teacher queue, and reaches nobody else', async () => {
			const queue = await d.asUser(TEACHER, (q) =>
				q(`select user_id from public.greenline_decals where status = 'pending'`)
			);
			expect(queue.rows).toHaveLength(1);
			// The absence half. Its positive control is the permissive run below.
			const row = await d.asUser(BEN, (q) => q(`select user_id from public.greenline_decals`));
			expect(row.rows).toHaveLength(0);
			expect(await visibleDecalObjects(d, BEN)).toBe(0);
		});

		it('3. an approval reaches another student, image included', async () => {
			const r = await d.asUser(TEACHER, (q) =>
				q<{ s: string }>(`select public.greenline_decal_review($1, 'approve', '') as s`, [AVA])
			);
			expect(r.rows[0].s).toBe('approved');
			const row = await d.asUser(BEN, (q) => q(`select user_id from public.greenline_decals`));
			expect(row.rows).toHaveLength(1);
			expect(await visibleDecalObjects(d, BEN)).toBe(1);
		});

		it('4. a send-back reaches the author WITH the words, and revokes the image', async () => {
			const r = await d.asUser(TEACHER, (q) =>
				q<{ s: string }>(
					`select public.greenline_decal_review($1, 'needs_revision', 'Trim the logo.') as s`,
					[AVA]
				)
			);
			expect(r.rows[0].s).toBe('needs_revision');
			const own = await d.asUser(AVA, (q) =>
				q<{ status: string; reviewer_feedback: string }>(
					`select status, reviewer_feedback from public.greenline_decals`
				)
			);
			expect(own.rows[0].status).toBe('needs_revision');
			expect(own.rows[0].reviewer_feedback).toBe('Trim the logo.');
			// Losing approval takes the image back with it, in the same statement.
			expect(await visibleDecalObjects(d, BEN)).toBe(0);
			// And the author keeps theirs, which is what "never a blunt reject"
			// means at the data layer: the work is still there to fix.
			expect(await visibleDecalObjects(d, AVA)).toBe(1);
		});

		it('5. a revision request cannot be sent empty', async () => {
			await expect(
				d.asUser(TEACHER, (q) =>
					q(`select public.greenline_decal_review($1, 'needs_revision', '   ')`, [AVA])
				)
			).rejects.toThrow(/Feedback is required/i);
		});

		it('6. re-uploading returns it to the teacher queue', async () => {
			const next = await uploadDecal(d, AVA, 'second');
			expect(next).not.toBe(path);
			const queue = await d.asUser(TEACHER, (q) =>
				q(`select user_id from public.greenline_decals where status = 'pending'`)
			);
			expect(queue.rows).toHaveLength(1);
		});

		it('a student cannot review anybody, including themselves', async () => {
			await expect(
				d.asUser(BEN, (q) => q(`select public.greenline_decal_review($1, 'approve', '')`, [AVA]))
			).rejects.toThrow(/forbidden/i);
			await expect(
				d.asUser(AVA, (q) => q(`select public.greenline_decal_review($1, 'approve', '')`, [AVA]))
			).rejects.toThrow(/forbidden/i);
		});

		it('a student write can never set a status: the WITH CHECK forces pending', async () => {
			await expect(
				d.asUser(AVA, (q) =>
					q(`update public.greenline_decals set status = 'approved' where user_id = $1`, [AVA])
				)
			).rejects.toThrow(/row-level security/i);
		});
	});

	describe('a community track (0057/0059)', () => {
		let track = '';
		beforeAll(async () => {
			track = await publishTrack(d, AVA, 'Sunset Loop');
		});

		it('1. exists, pending by default, and its author can already race it', async () => {
			const own = await d.asUser(AVA, (q) =>
				q<{ status: string }>(`select status from public.greenline_tracks where id = $1`, [track])
			);
			expect(own.rows[0].status).toBe('pending');
			// `attempt_start` is the play gate. The author may open an attempt on
			// their own unreviewed track -- which is what lets them test-race it,
			// and what makes "I can see it, so it must be published" so easy to
			// believe.
			const id = await d.asUser(AVA, (q) =>
				q<{ a: string }>(`select public.greenline_track_attempt_start($1) as a`, [track])
			);
			expect(typeof id.rows[0].a).toBe('string');
		});

		it('2. reaches the teacher queue, and reaches nobody else', async () => {
			const list = await d.asUser(TEACHER, (q) =>
				q<{ l: Array<{ status: string }> }>(`select public.greenline_track_list() as l`)
			);
			expect(list.rows[0].l.map((t) => t.status)).toEqual(['pending']);

			// The absence half, at BOTH layers: the list RPC a browse screen calls,
			// and the RLS policy that actually governs playability (the client
			// selects `data` straight off the table).
			const bensList = await d.asUser(BEN, (q) =>
				q<{ l: unknown[] }>(`select public.greenline_track_list() as l`)
			);
			expect(bensList.rows[0].l).toEqual([]);
			expect(await visibleTracks(d, BEN)).toBe(0);
			await expect(
				d.asUser(BEN, (q) => q(`select public.greenline_track_attempt_start($1)`, [track]))
			).rejects.toThrow(/Unknown track/i);
		});

		it('3. an approval reaches another student, and only then can it be featured', async () => {
			// Ranked play is a superset of visible play: featuring is refused
			// while the track is unapproved, and that refusal is 0059's, not the
			// route's.
			const early = await d.asUser(TEACHER, (q) =>
				q<{ f: boolean }>(`select public.greenline_track_set_featured($1, true) as f`, [track])
			);
			expect(early.rows[0].f).toBe(false);

			const r = await d.asUser(TEACHER, (q) =>
				q<{ r: { ok: boolean; status: string } }>(
					`select public.greenline_track_review($1, 'approve', null) as r`,
					[track]
				)
			);
			expect(r.rows[0].r).toEqual({ ok: true, status: 'approved' });

			expect(await visibleTracks(d, BEN)).toBe(1);
			const bensList = await d.asUser(BEN, (q) =>
				q<{ l: Array<{ status: string }> }>(`select public.greenline_track_list() as l`)
			);
			expect(bensList.rows[0].l.map((t) => t.status)).toEqual(['approved']);

			const now = await d.asUser(TEACHER, (q) =>
				q<{ f: boolean }>(`select public.greenline_track_set_featured($1, true) as f`, [track])
			);
			expect(now.rows[0].f).toBe(true);
		});

		it('4. a send-back reaches the author WITH the words, and drops featuring', async () => {
			const r = await d.asUser(TEACHER, (q) =>
				q<{ r: { ok: boolean; status: string } }>(
					`select public.greenline_track_review($1, 'reject', 'Add a runoff at turn 3.') as r`,
					[track]
				)
			);
			expect(r.rows[0].r).toEqual({ ok: true, status: 'rejected' });

			const own = await d.asUser(AVA, (q) =>
				q<{ l: Array<{ status: string; review_feedback: string; featured: boolean }> }>(
					`select public.greenline_track_list() as l`
				)
			);
			const mine = own.rows[0].l[0];
			expect(mine.status).toBe('rejected');
			// The teacher's OWN sentence, carried to the author on the same call
			// the browse screen already makes. This is the field the garage now
			// renders as visible copy rather than as a `title` attribute.
			expect(mine.review_feedback).toBe('Add a runoff at turn 3.');
			// A track that loses approval cannot stay ranked.
			expect(mine.featured).toBe(false);

			expect(await visibleTracks(d, BEN)).toBe(0);
		});

		it('5. a rejection cannot be sent without a note', async () => {
			const r = await d.asUser(TEACHER, (q) =>
				q<{ r: { ok: boolean; reason: string } }>(
					`select public.greenline_track_review($1, 'reject', '   ') as r`,
					[track]
				)
			);
			expect(r.rows[0].r).toEqual({ ok: false, reason: 'feedback_required' });
		});

		it('6. resubmitting is a NEW row, and it lands pending in the queue', async () => {
			// There is deliberately no author-side status write: `greenline_tracks`
			// carries a select grant and nothing else, so "fix it and submit
			// again" goes back through the publish endpoint, which is what
			// re-runs the real validation on the new geometry.
			await expect(
				d.asUser(AVA, (q) =>
					q(`update public.greenline_tracks set status = 'pending' where id = $1`, [track])
				)
			).rejects.toThrow(/permission denied/i);

			await publishTrack(d, AVA, 'Sunset Loop v2');
			const list = await d.asUser(TEACHER, (q) =>
				q<{ l: Array<{ name: string; status: string }> }>(`select public.greenline_track_list() as l`)
			);
			const pending = list.rows[0].l.filter((t) => t.status === 'pending');
			expect(pending.map((t) => t.name)).toEqual(['Sunset Loop v2']);
		});

		it('an unapproved track cannot be rated or reported by anyone', async () => {
			const fresh = await publishTrack(d, AVA, 'Quiet One');
			const rated = await d.asUser(BEN, (q) =>
				q<{ r: { reason: string } }>(`select public.greenline_track_rate($1, 5) as r`, [fresh])
			);
			expect(rated.rows[0].r.reason).toBe('not_found');
			const reported = await d.asUser(BEN, (q) =>
				q<{ r: { reason: string } }>(`select public.greenline_track_report($1) as r`, [fresh])
			);
			expect(reported.rows[0].r.reason).toBe('not_found');
		});

		it('a student cannot review, feature or moderate anything', async () => {
			await expect(
				d.asUser(BEN, (q) => q(`select public.greenline_track_review($1, 'approve', null)`, [track]))
			).rejects.toThrow(/Teachers only/i);
			await expect(
				d.asUser(BEN, (q) => q(`select public.greenline_track_set_featured($1, true)`, [track]))
			).rejects.toThrow(/Teachers only/i);
			// Removal is the one moderation verb an AUTHOR legitimately shares, so
			// it refuses by finding nothing rather than by raising.
			const removed = await d.asUser(BEN, (q) =>
				q<{ r: boolean }>(`select public.greenline_track_remove($1) as r`, [track])
			);
			expect(removed.rows[0].r).toBe(false);
		});
	});
});

// ---------------------------------------------------------------------------
// The three positive controls.
//
// Each applies a PERMISSIVELY MUTATED COPY of the real migration text to its
// own database and asserts the corresponding absence assertion now FAILS. A
// mutation that fails CLOSED (a policy deleted outright) reddens almost
// nothing and proves almost nothing, so each of these opens the gate rather
// than removing it. Nothing on disk is touched: the copies live in a temp
// directory that is deleted afterwards, so there is no restore step and
// therefore no `git checkout --` to reach for. The unmutated source files are
// md5-compared at the end of the run to prove that.
// ---------------------------------------------------------------------------
describe('positive controls: each gate, opened', () => {
	const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
	const SOURCES = ['0051_greenline_decals.sql', '0057_greenline_community_tracks.sql', '0059_greenline_track_review.sql'];
	const before = new Map(SOURCES.map((f) => [f, md5(join(MIGRATIONS_DIR, f))]));

	let scratch = '';
	beforeAll(() => {
		scratch = mkdtempSync(join(tmpdir(), 'gl-mutants-'));
	});
	afterAll(() => {
		if (scratch) rmSync(scratch, { recursive: true, force: true });
		// The files this suite READ are byte-identical to what it started with.
		for (const f of SOURCES) expect(md5(join(MIGRATIONS_DIR, f))).toBe(before.get(f));
	});

	/**
	 * Apply the chain with one file's TEXT replaced, from a copy. `startTestDb`
	 * resolves names against supabase/migrations, so the mutant is written into
	 * the scratch dir and its SQL is applied by hand over the un-mutated chain
	 * instead -- which is closer to the real thing anyway: a `create or replace`
	 * or a `drop policy ... create policy` over an applied database is exactly
	 * how a leak would arrive.
	 */
	async function withOpenedGate(sql: string): Promise<TestDb> {
		const d = await startTestDb(CHAIN);
		await prepare(d);
		const file = join(scratch, `mutant-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
		writeFileSync(file, sql);
		await d.sql(readFileSync(file, 'utf8'));
		return d;
	}

	it('CONTROL 1: open the decal approval predicate and a pending decal starts leaking', async () => {
		const d = await withOpenedGate(`
			drop policy if exists "greenline decal select approved" on public.greenline_decals;
			create policy "greenline decal select approved"
				on public.greenline_decals for select to authenticated using (true);
			drop policy if exists "greenline decals read gated" on storage.objects;
			create policy "greenline decals read gated"
				on storage.objects for select to authenticated
				using (bucket_id = 'greenline-decals');
		`);
		try {
			await uploadDecal(d, AVA, 'leaky');
			// The real database answers 0 and 0 here (asserted above). With the
			// approval clause replaced by `true`, Ben reads a pending row AND its
			// image -- so the gate, not the fixture, is what those zeros measure.
			const rows = await d.asUser(BEN, (q) => q(`select user_id from public.greenline_decals`));
			expect(rows.rows).toHaveLength(1);
			expect(await visibleDecalObjects(d, BEN)).toBe(1);
		} finally {
			await d.stop();
		}
	}, 180_000);

	it('CONTROL 2: open the track visibility predicate and a pending track starts listing', async () => {
		const d = await withOpenedGate(`
			drop policy if exists "select visible greenline tracks" on public.greenline_tracks;
			create policy "select visible greenline tracks"
				on public.greenline_tracks for select to authenticated using (not removed);
			create or replace function public.greenline_track_list()
			returns jsonb language sql stable security definer set search_path = '' as $mut$
				select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'status', t.status)), '[]'::jsonb)
				from public.greenline_tracks t where not t.removed;
			$mut$;
		`);
		try {
			await publishTrack(d, AVA, 'Leaky Loop');
			// The real database answers 0 and [] here.
			expect(await visibleTracks(d, BEN)).toBe(1);
			const list = await d.asUser(BEN, (q) =>
				q<{ l: unknown[] }>(`select public.greenline_track_list() as l`)
			);
			expect(list.rows[0].l).toHaveLength(1);
		} finally {
			await d.stop();
		}
	}, 180_000);

	it('CONTROL 3: open the review gate and a teacher of no section can moderate', async () => {
		const d = await withOpenedGate(`
			create or replace function public.greenline_track_review(
				p_track_id uuid, p_action text, p_feedback text default null
			) returns jsonb language plpgsql security definer set search_path = '' as $mut$
			begin
				-- is_teacher() removed: the ONLY thing this control changes.
				update public.greenline_tracks t set status = 'approved' where t.id = p_track_id;
				if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
				return jsonb_build_object('ok', true, 'status', 'approved');
			end;
			$mut$;
			create or replace function public.greenline_decal_review(
				p_user_id uuid, p_action text, p_feedback text default ''
			) returns text language plpgsql security definer set search_path = '' as $mut$
			begin
				update public.greenline_decals set status = 'approved' where user_id = p_user_id;
				return 'approved';
			end;
			$mut$;
		`);
		try {
			const track = await publishTrack(d, AVA, 'Ungated');
			await uploadDecal(d, AVA, 'ungated');
			// OUTSIDER is @boscotech.edu with no app_admins row: is_teacher() is
			// false for them on the real database, which is what makes them the
			// right control subject rather than a plain student. On the real
			// database both of these raise (asserted above).
			const r = await d.asUser(OUTSIDER, (q) =>
				q<{ r: { ok: boolean } }>(
					`select public.greenline_track_review($1, 'approve', null) as r`,
					[track]
				)
			);
			expect(r.rows[0].r.ok).toBe(true);
			const s = await d.asUser(OUTSIDER, (q) =>
				q<{ s: string }>(`select public.greenline_decal_review($1, 'approve', '') as s`, [AVA])
			);
			expect(s.rows[0].s).toBe('approved');
			// And a plain student too, so the control cannot be read as being
			// about the email domain.
			const b = await d.asUser(BEN, (q) =>
				q<{ r: { ok: boolean } }>(
					`select public.greenline_track_review($1, 'approve', null) as r`,
					[track]
				)
			);
			expect(b.rows[0].r.ok).toBe(true);
		} finally {
			await d.stop();
		}
	}, 180_000);
});
