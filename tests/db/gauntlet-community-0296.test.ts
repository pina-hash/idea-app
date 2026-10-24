// tests/db/gauntlet-community-0296.test.ts
//
// 0296, ledger 0433 items 14 and 15, on the FULL chain read off disk. The chain
// boots SHORT of 0296, the class, its team set, a tournament with a hand-made
// entry (the report's "set up twice" state) and the GAUNTLET runs are seeded
// through the REAL pre-0296 RPCs where one exists, then 0296 goes over the top
// TWICE.
//
// ITEM 14, class teams are the source of truth:
//   * taking a team set makes one entry per team, LINKS the hand-made entry
//     with the same name instead of doubling it (keeping its banner), and puts
//     every member with an account on their team;
//   * a member's save on the class page shows in the bracket, and a save from
//     the tournament side writes the class team;
//   * a teacher's move follows into the tournament; the name stops following
//     once the bracket exists; an unlinked entry behaves exactly as before;
//   * WHO SEES WHAT (both directions): the link table is closed to every
//     client, the bracket learns only WHICH entries follow a class, the class
//     page's shared read refuses a student outside the class, and a student
//     outside a team cannot edit it through the tournament.
// ITEM 15, the five parts and community speedruns:
//   * the parts are stored exactly as gauntlet_speedrun_seed.json says, and each
//     volume is recomputed here from the file's geometry;
//   * a speedrun's board holds only players RANKED on every part, by total; a
//     held run, a failed run and a test account stay off it;
//   * a private speedrun opens by link and is on nobody else's list; listing it
//     takes a GAUNTLET author; editing a listed one sends it back for review.
//
// GAUNTLET_0296_SQL swaps in a permissive copy for the mutation proofs, which
// are recorded in docs/history/0433-gauntlet-tournament-teams.md.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';

const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FILE = '0296_class_team_tournaments_and_community_speedruns.sql';
const ALL = readdirSync(DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();
const SQL = readFileSync(process.env.GAUNTLET_0296_SQL ?? join(DIR, FILE), 'utf8');
const SEED = JSON.parse(
	readFileSync(fileURLToPath(new URL('../../gauntlet_speedrun_seed.json', import.meta.url)), 'utf8')
) as {
	series: string;
	challenges: Array<{
		slug: string;
		title: string;
		difficulty: number;
		material: string;
		density_g_cm3: number;
		par_time: number;
		tolerance_pct: number;
		target_volume_mm3: number;
		target_mass_g: number;
		drawing_svg: string;
		geometry: Array<Record<string, number | string>>;
	}>;
};

async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (error) {
		return (error as Error).message;
	}
}

let db: TestDb;
let admin: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let cy: SeededUser;
let dee: SeededUser;
let outsider: SeededUser;
let tester: SeededUser;
let section: string;
let teamSet: string;
let teamIds: string[];
let tournament: string;
let handEntry: string;

const one = async <T>(as: SeededUser, sql: string, params: unknown[] = []) =>
	(await db.asUser(as.id, (q) => q<{ r: T }>(sql, params))).rows[0].r;

beforeAll(async () => {
	db = await startTestDb(['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < FILE)]);
	admin = await createUser(db, 'apina@boscotech.edu', 'Owner');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana A');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben B');
	cy = await createUser(db, 'cy@boscotech.net', 'Cy C');
	dee = await createUser(db, 'dee@boscotech.net', 'Dee D');
	outsider = await createUser(db, 'out@boscotech.net', 'Out O');
	tester = await createUser(db, 'probe@test.ideabosco.com', 'Test Account');
	await db.sql(
		`insert into public.test_accounts (email, user_id, label, created_by) values ($1, $2, 'probe', 'apina@boscotech.edu')`,
		[tester.email, tester.id]
	);

	section = await createClassroomSection(db, {
		as: admin,
		courseCode: 'IDEA100',
		label: 'Block 1',
		teacherEmail: admin.email
	});
	for (const [u, n] of [
		[ana, 'Ana'],
		[ben, 'Ben'],
		[cy, 'Cy'],
		[dee, 'Dee']
	] as const) {
		await enrollStudent(db, { as: admin, sectionId: section, email: u.email, displayName: n });
	}
	await enrollStudent(db, { as: admin, sectionId: section, email: 'nologin@boscotech.net', displayName: 'No Login' });
	teamSet = await one<string>(
		admin,
		'select public.classroom_save_team_set($1::uuid, $2, $3::bigint, $4, $5::integer, $6::jsonb) as r',
		[
			section,
			'IDEA-Blade teams',
			42,
			'count',
			2,
			JSON.stringify([
				{ team_number: 1, members: [ana.email, ben.email, 'nologin@boscotech.net'] },
				{ team_number: 2, members: [cy.email, dee.email] }
			])
		]
	);
	await one(admin, `select public.classroom_post_team_set($1::uuid, null) as r`, [teamSet]);
	teamIds = (
		await db.sql<{ id: string }>(`select id from public.classroom_teams where team_set_id = $1 order by team_number`, [
			teamSet
		])
	).rows.map((r) => r.id);
	// Team 2 already named itself on the class page, through the real write.
	await one(cy, `select public.classroom_set_team_style($1, 'Blade Breakers', null, null, null, null, null, null) as r`, [
		teamIds[1]
	]);

	tournament = await one<string>(admin, `select public.tournament_create('IDEA-Blade Rotation 2', '', $1::jsonb) as r`, [
		JSON.stringify({ team_size: 4 })
	]);
	await one(admin, `select public.tournament_set_status($1, 'registration_open') as r`, [tournament]);
	// The same team, made a second time by hand, with a banner of its own.
	handEntry = await one<string>(
		admin,
		`select public.tournament_host_add_entry($1, 'Blade Breakers', 'made by hand', null, null) as r`,
		[tournament]
	);
	await one(admin, `select public.tournament_set_entry_style($1, 'solid', '"#224466"'::jsonb, '#3f8f5f', 'bolt', null, 'Spin to win') as r`, [
		handEntry
	]);

	await db.sql(SQL);
	await db.sql(SQL);
}, 900_000);

afterAll(async () => {
	await db?.stop();
});

type Entry = { id: string; display_name: string; description: string; thumbnail_url: string | null };
const entries = async () =>
	(
		await db.sql<Entry>(
			`select id, display_name, description, thumbnail_url from public.tournament_entries where tournament_id = $1 order by seed`,
			[tournament]
		)
	).rows;
const rosterOf = async (entryId: string) =>
	(
		await db.sql<{ user_id: string | null; name: string }>(
			`select user_id, name from public.tournament_entry_members where entry_id = $1 order by created_at, id`,
			[entryId]
		)
	).rows;

describe('0296: a tournament takes its teams from a class (item 14)', () => {
	let result: Record<string, number>;
	let team1Entry: string;

	beforeAll(async () => {
		result = await one(admin, `select public.tournament_take_team_set($1, $2) as r`, [tournament, teamSet]);
		team1Entry = (await entries()).find((e) => e.display_name === 'Team 1')!.id;
	});

	it('makes one entry per team and links the hand-made one instead of doubling it', async () => {
		expect(result).toMatchObject({ created: 1, linked: 1, already: 0, players_added: 4, no_account: 1 });
		expect((await entries()).map((e) => e.display_name)).toEqual(['Blade Breakers', 'Team 1']);
		const again = await one<Record<string, number>>(admin, `select public.tournament_take_team_set($1, $2) as r`, [
			tournament,
			teamSet
		]);
		expect(again).toMatchObject({ created: 0, linked: 0, already: 2 });
	});

	it('puts every member with an account on their team, and nobody else', async () => {
		expect((await rosterOf(team1Entry)).map((m) => m.user_id).sort()).toEqual([ana.id, ben.id].sort());
		const hand = await rosterOf(handEntry);
		expect(hand.filter((m) => m.user_id).map((m) => m.user_id).sort()).toEqual([cy.id, dee.id].sort());
	});

	it('keeps the banner the hand-made entry already had, now on the class team', async () => {
		const t = (await db.sql(`select accent_color, tagline, badge, description from public.classroom_teams where id = $1`, [teamIds[1]]))
			.rows[0];
		expect(t).toMatchObject({ accent_color: '#3f8f5f', tagline: 'Spin to win', badge: 'bolt', description: 'made by hand' });
	});

	it('shows a class-page save in the bracket', async () => {
		await one(ana, `select public.classroom_set_team_style($1, 'Edge Lords', '#aa3366', 'gradient', '["#112233","#445566"]'::jsonb, 'star', null, 'Sharp') as r`, [
			teamIds[0]
		]);
		await one(ben, `select public.classroom_set_team_details($1, 'We spin fast', 'https://example.org/t1.png') as r`, [teamIds[0]]);
		const e = (await entries()).find((x) => x.id === team1Entry)!;
		expect(e).toMatchObject({ display_name: 'Edge Lords', description: 'We spin fast', thumbnail_url: 'https://example.org/t1.png' });
		const s = (await db.sql(`select accent_color, badge, tagline, background_type from public.tournament_entry_styles where entry_id = $1`, [team1Entry]))
			.rows[0];
		expect(s).toMatchObject({ accent_color: '#aa3366', badge: 'star', tagline: 'Sharp', background_type: 'gradient' });
	});

	it('writes the class team when a member saves from the tournament side', async () => {
		await one(cy, `select public.tournament_update_entry($1, 'Breakers', 'Renamed in the bracket', null) as r`, [handEntry]);
		const t = (await db.sql(`select name, description from public.classroom_teams where id = $1`, [teamIds[1]])).rows[0];
		expect(t).toEqual({ name: 'Breakers', description: 'Renamed in the bracket' });
		expect((await entries()).find((x) => x.id === handEntry)!.display_name).toBe('Breakers');
		await one(cy, `select public.tournament_set_entry_style($1, 'solid', '"#101010"'::jsonb, '#202020', null, null, null) as r`, [handEntry]);
		const ct = (await db.sql(`select accent_color, badge, tagline from public.classroom_teams where id = $1`, [teamIds[1]])).rows[0];
		expect(ct).toEqual({ accent_color: '#202020', badge: null, tagline: null });
	});

	it('refuses a student who is not on the team, from either side', async () => {
		const sentence = 'This team comes from a class. A student on the team or a teacher of the class can change it.';
		expect(await refusal(db.asUser(ana.id, (q) => q(`select public.tournament_update_entry($1, 'Hijack', null, null)`, [handEntry])))).toBe(
			sentence
		);
		expect(
			await refusal(db.asUser(outsider.id, (q) => q(`select public.tournament_set_entry_style($1, null, null, '#000000', null, null, null)`, [handEntry])))
		).toBe(sentence);
		expect(await refusal(db.asUser(outsider.id, (q) => q(`select public.classroom_set_team_details($1, 'x', null)`, [teamIds[0]])))).toBe(
			'Team not found.'
		);
		expect((await entries()).find((x) => x.id === handEntry)!.display_name).toBe('Breakers');
	});

	it('follows a teacher moving a student between teams', async () => {
		await one(admin, `select public.classroom_move_team_member($1, $2, $3) as r`, [teamSet, ben.email, teamIds[1]]);
		expect((await rosterOf(team1Entry)).map((m) => m.user_id)).toEqual([ana.id]);
		expect((await rosterOf(handEntry)).map((m) => m.user_id)).toContain(ben.id);
	});

	it('lets the bracket name hold once the tournament is live, while the style still follows', async () => {
		await db.sql(`update public.tournaments set status = 'live' where id = $1`, [tournament]);
		await one(ana, `select public.classroom_set_team_style($1, 'Late Name', '#123456', null, null, null, null, null) as r`, [teamIds[0]]);
		const e = (await entries()).find((x) => x.id === team1Entry)!;
		expect(e.display_name).toBe('Edge Lords');
		expect((await db.sql(`select accent_color from public.tournament_entry_styles where entry_id = $1`, [team1Entry])).rows[0].accent_color).toBe(
			'#123456'
		);
		await db.sql(`update public.tournaments set status = 'registration_open' where id = $1`, [tournament]);
	});

	it('leaves a separately made tournament working exactly as before', async () => {
		const other = await one<string>(admin, `select public.tournament_create('Open cup', '', $1::jsonb) as r`, [
			JSON.stringify({ team_size: 2 })
		]);
		await one(admin, `select public.tournament_set_status($1, 'registration_open') as r`, [other]);
		const mine = await one<string>(outsider, `select public.tournament_register_entry($1, 'Solo Spin', '', null) as r`, [other]);
		await one(outsider, `select public.tournament_update_entry($1, 'Solo Spin 2', null, null) as r`, [mine]);
		expect((await db.sql(`select display_name from public.tournament_entries where id = $1`, [mine])).rows[0].display_name).toBe('Solo Spin 2');
		expect(await one<string[]>(outsider, `select public.tournament_class_linked_entries($1) as r`, [other])).toEqual([]);
	});

	it('refuses a team bigger than the tournament allows, and writes nothing', async () => {
		const small = await one<string>(admin, `select public.tournament_create('Duo cup', '', $1::jsonb) as r`, [
			JSON.stringify({ team_size: 2 })
		]);
		await one(admin, `select public.tournament_set_status($1, 'registration_open') as r`, [small]);
		const msg = await refusal(db.asUser(admin.id, (q) => q(`select public.tournament_take_team_set($1, $2)`, [small, teamSet])));
		expect(msg).toMatch(/has 3 students and this tournament takes teams of up to 2/);
		expect((await db.sql(`select count(*)::int n from public.tournament_entries where tournament_id = $1`, [small])).rows[0].n).toBe(0);
	});

	describe('who sees what', () => {
		it('keeps the link table closed to every client', async () => {
			expect(await refusal(db.asAnon((q) => q(`select * from public.tournament_entry_class_teams`)))).toMatch(/permission denied/);
			expect(await refusal(db.asUser(ana.id, (q) => q(`select * from public.tournament_entry_class_teams`)))).toMatch(/permission denied/);
		});

		it('tells a signed-in player which entries follow a class, and nothing more; nothing to anon', async () => {
			const ids = await one<string[]>(outsider, `select public.tournament_class_linked_entries($1) as r`, [tournament]);
			expect([...ids].sort()).toEqual([handEntry, team1Entry].sort());
			expect(await refusal(db.asAnon((q) => q(`select public.tournament_class_linked_entries($1)`, [tournament])))).toMatch(/permission denied/);
		});

		it('gives the class page its shared fields, to the class only', async () => {
			const shared = await one<Array<{ team_id: string; description: string | null; tournaments: Array<{ name: string }> }>>(
				ana,
				`select public.classroom_team_shared($1) as r`,
				[section]
			);
			expect(shared).toHaveLength(2);
			const t1 = shared.find((s) => s.team_id === teamIds[0])!;
			expect(t1.description).toBe('We spin fast');
			expect(t1.tournaments.map((t) => t.name)).toEqual(['IDEA-Blade Rotation 2']);
			expect(await refusal(db.asUser(outsider.id, (q) => q(`select public.classroom_team_shared($1)`, [section])))).toBe('Not found.');
			expect(await refusal(db.asAnon((q) => q(`select public.classroom_team_shared($1)`, [section])))).toMatch(/permission denied/);
		});

		it("lists a host's team sets to the host only", async () => {
			const mine = await one<Array<{ id: string; teams: number }>>(admin, `select public.tournament_team_set_options($1) as r`, [tournament]);
			expect(mine.map((s) => s.id)).toEqual([teamSet]);
			expect(await one(ana, `select public.tournament_team_set_options($1) as r`, [tournament])).toEqual([]);
		});
	});
});

// ---------------------------------------------------------------- item 15

function geometryVolume(ops: Array<Record<string, number | string>>): number {
	const n = (o: Record<string, number | string>, k: string) => Number(o[k]);
	const strip = (R: number, a: number) => a * Math.sqrt(R * R - a * a) + R * R * Math.asin(a / R);
	let v = 0;
	for (const o of ops) {
		switch (o.op) {
			case 'box':
				v += n(o, 'x') * n(o, 'y') * n(o, 'z');
				break;
			case 'hex_prism':
				v += (Math.sqrt(3) / 2) * n(o, 'flats') ** 2 * n(o, 'length');
				break;
			case 'angle':
				v += (n(o, 'leg_a') * n(o, 't') + (n(o, 'leg_b') - n(o, 't')) * n(o, 't')) * n(o, 'length');
				break;
			case 'ring':
				v += Math.PI * ((n(o, 'od') / 2) ** 2 - (n(o, 'id') / 2) ** 2) * n(o, 'length');
				break;
			case 'cut_cylinder':
				v -= n(o, 'count') * Math.PI * (n(o, 'd') / 2) ** 2 * n(o, 'length');
				break;
			case 'cut_corner_fillet':
				v -= n(o, 'count') * (n(o, 'r') ** 2 * (1 - Math.PI / 4)) * n(o, 'length');
				break;
			case 'cut_ring_slot':
				v -= (strip(n(o, 'od') / 2, n(o, 'width') / 2) - strip(n(o, 'id') / 2, n(o, 'width') / 2)) * n(o, 'length');
				break;
			default:
				throw new Error(`unknown op ${String(o.op)}`);
		}
	}
	return v;
}

describe('0296: five new Speedrun parts (item 15)', () => {
	it('stores each part exactly as the seed file says, once, published, in one series', async () => {
		const rows = (
			await db.sql<{ title: string; difficulty: number; status: string; prompt: Record<string, unknown>; answer: Record<string, unknown>; series: string }>(
				`select c.title, c.difficulty, c.status, c.prompt, c.answer, s.name as series
				 from public.challenges c join public.gauntlet_series s on s.id = c.series_id
				 where c.mode = 'speedrun' and c.prompt ->> 'slug' = any($1) order by c.series_order`,
				[SEED.challenges.map((c) => c.slug)]
			)
		).rows;
		expect(rows).toHaveLength(SEED.challenges.length);
		expect(SEED.challenges.length).toBeGreaterThanOrEqual(4);
		expect(SEED.challenges.length).toBeLessThanOrEqual(6);
		rows.forEach((r, i) => {
			const c = SEED.challenges[i];
			expect(r).toMatchObject({ title: c.title, difficulty: c.difficulty, status: 'published', series: SEED.series });
			expect(r.prompt).toMatchObject({ slug: c.slug, material: c.material, unit_system: 'MMGS', par_time: c.par_time });
			expect(r.answer).toMatchObject({
				drawing: c.drawing_svg,
				target_volume_mm3: c.target_volume_mm3,
				target_mass: c.target_mass_g,
				density: c.density_g_cm3,
				tolerance_pct: 0.1
			});
			// The answer never rides in the public prompt (0153).
			expect(Object.keys(r.prompt)).not.toContain('target_volume_mm3');
			expect(Object.keys(r.prompt)).not.toContain('density');
		});
		expect((await db.sql(`select count(*)::int n from public.gauntlet_series where name = $1`, [SEED.series])).rows[0].n).toBe(1);
	});

	it('has a volume that matches its own geometry and a mass that matches its density', () => {
		for (const c of SEED.challenges) {
			expect(Math.abs(geometryVolume(c.geometry) - c.target_volume_mm3), c.slug).toBeLessThan(0.0001);
			expect(Math.abs((c.target_volume_mm3 / 1000) * c.density_g_cm3 - c.target_mass_g), c.slug).toBeLessThan(0.0001);
			expect(c.drawing_svg.startsWith('<svg ')).toBe(true);
			expect(c.drawing_svg).not.toMatch(/<script|on[a-z]+=/i);
		}
	});
});

describe('0296: community speedruns (item 15)', () => {
	let parts: string[];
	let draftPart: string;
	let route: string;
	let author: SeededUser;

	const run = (u: SeededUser, cid: string, ok: boolean, ms: number) =>
		db.sql(
			`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source)
			 values ($1, $2, 'speedrun', $3::jsonb, $4, $5, 'macro')`,
			[u.id, cid, JSON.stringify({ elapsed_ms: ms }), ok, ms / 1000]
		);

	beforeAll(async () => {
		parts = (
			await db.sql<{ id: string }>(
				`select id from public.challenges where mode = 'speedrun' and prompt ->> 'slug' = any($1) order by series_order limit 2`,
				[SEED.challenges.map((c) => c.slug)]
			)
		).rows.map((r) => r.id);
		draftPart = (
			await db.sql<{ id: string }>(
				`insert into public.challenges (mode, title, difficulty, prompt, answer, status) values ('speedrun', 'Draft', 1, '{}', '{}', 'draft') returning id`
			)
		).rows[0].id;
		author = await createUser(db, 'author@boscotech.edu', 'Gauntlet Author');
		await db.sql(`insert into public.gauntlet_authors (email, granted_by) values ($1, 'apina@boscotech.edu')`, [author.email]);

		await run(ana, parts[0], true, 60000);
		await run(ana, parts[1], true, 90000);
		await run(ben, parts[0], true, 50000);
		await run(ben, parts[1], true, 4000); // under the floor: held
		await run(cy, parts[0], true, 70000);
		await run(cy, parts[1], false, 80000); // failed
		await run(tester, parts[0], true, 40000);
		await run(tester, parts[1], true, 40000);

		route = await one<string>(dee, `select public.gauntlet_route_save(null, 'Shop sprint', 'Two parts, go', $1::uuid[]) as r`, [parts]);
	});

	it('refuses a speedrun of a draft part, a repeated part or a single part', async () => {
		const save = (ids: string[]) =>
			refusal(db.asUser(dee.id, (q) => q(`select public.gauntlet_route_save(null, 'x', '', $1::uuid[])`, [ids])));
		expect(await save([parts[0], draftPart])).toBe('Every part must be a published Speedrun part.');
		expect(await save([parts[0], parts[0]])).toBe('Each part can be in a speedrun once.');
		expect(await save([parts[0]])).toBe('Pick at least 2 parts.');
	});

	it('ranks only players ranked on every part, by total time', async () => {
		const r = await one<{ board: Array<{ rank: number; player: string; total_seconds: number }> }>(ana, `select public.gauntlet_route($1) as r`, [route]);
		expect(r.board.map((b) => [b.player, Number(b.total_seconds), b.rank])).toEqual([['Ana A', 150, 1]]);
	});

	it('shows a test account its own place and nobody else', async () => {
		const own = await one<{ board: Array<{ player: string; me: boolean }> }>(tester, `select public.gauntlet_route($1) as r`, [route]);
		expect(own.board.map((b) => b.player)).toEqual(['Test Account', 'Ana A']);
	});

	it('opens a private speedrun by link and lists it to nobody else', async () => {
		const list = await one<{ routes: Array<{ id: string }> }>(ana, `select public.gauntlet_routes() as r`);
		expect(list.routes.map((x) => x.id)).not.toContain(route);
		const owner = await one<{ routes: Array<{ id: string; status: string }> }>(dee, `select public.gauntlet_routes() as r`);
		expect(owner.routes.find((x) => x.id === route)?.status).toBe('private');
		const byLink = await one<{ title: string; status: string | null }>(ana, `select public.gauntlet_route($1) as r`, [route]);
		expect(byLink).toMatchObject({ title: 'Shop sprint', status: null });
	});

	it('lists it for everyone only after a GAUNTLET author approves it', async () => {
		expect(await one(dee, `select public.gauntlet_route_share($1, true) as r`, [route])).toBe('pending');
		expect((await one<{ routes: Array<{ id: string }> }>(ana, `select public.gauntlet_routes() as r`)).routes.map((x) => x.id)).not.toContain(route);
		expect(await refusal(db.asUser(ana.id, (q) => q(`select public.gauntlet_route_review($1, 'list')`, [route])))).toBe('Speedrun not found.');
		const queue = await one<{ can_review: boolean; routes: Array<{ id: string; status: string }> }>(author, `select public.gauntlet_routes() as r`);
		expect(queue.can_review).toBe(true);
		expect(queue.routes.find((x) => x.id === route)?.status).toBe('pending');
		expect(await one(author, `select public.gauntlet_route_review($1, 'list') as r`, [route])).toBe('listed');
		expect((await one<{ routes: Array<{ id: string }> }>(ana, `select public.gauntlet_routes() as r`)).routes.map((x) => x.id)).toContain(route);
	});

	it('sends an edited listed speedrun back for review', async () => {
		await one(dee, `select public.gauntlet_route_save($1, 'Shop sprint 2', 'Edited', $2::uuid[]) as r`, [route, parts]);
		expect((await one<{ routes: Array<{ id: string }> }>(ana, `select public.gauntlet_routes() as r`)).routes.map((x) => x.id)).not.toContain(route);
		expect(await refusal(db.asUser(ana.id, (q) => q(`select public.gauntlet_route_save($1, 'mine now', '', $2::uuid[])`, [route, parts])))).toBe(
			'Speedrun not found.'
		);
	});

	it('closes a speedrun a reviewer hid to everyone but its owner and reviewers', async () => {
		await one(author, `select public.gauntlet_route_review($1, 'hide') as r`, [route]);
		expect(await refusal(db.asUser(ana.id, (q) => q(`select public.gauntlet_route($1)`, [route])))).toBe('Speedrun not found.');
		expect((await one<{ title: string }>(dee, `select public.gauntlet_route($1) as r`, [route])).title).toBe('Shop sprint 2');
		expect(await refusal(db.asUser(dee.id, (q) => q(`select public.gauntlet_route_share($1, true)`, [route])))).toBe(
			'A teacher took this speedrun down. Make a new one to share.'
		);
		expect(await refusal(db.asAnon((q) => q(`select public.gauntlet_routes()`)))).toMatch(/permission denied/);
	});
});
