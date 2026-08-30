// tests/gauntlet-landing-authoring-gate.test.ts
//
// 0155 gave GAUNTLET authoring its own allowlisted tier (`gauntlet_can_author`),
// separate from `is_admin`. The author routes and /gauntlet/rooms were already
// re-gated on it (see gauntlet-author-tier-routes.test.ts), but the /gauntlet
// LANDING page's Authoring card was still gated on `isAdmin` -- so an allowlisted
// author had the capability and no way to reach it except typing the URL by
// hand. This file covers the landing page's own gate.
//
// MUTATION PROOF: an author who is NOT an admin must see the card. A gate that
// silently reverted to `isAdmin` would pass every OTHER test in this repo (the
// author routes re-check server-side regardless) while quietly hiding the one
// link that gets a real author there in the first place.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { load as GAUNTLET_LOAD } from '../src/routes/gauntlet/+page.server';
import GauntletPage from '../src/routes/gauntlet/+page.svelte';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0004_gauntlet.sql',
	'0005_gauntlet_speedrun.sql',
	'0006_gauntlet_macro.sql',
	'0007_gauntlet_modeling_modes.sql',
	'0008_gauntlet_knowledge_modes.sql',
	'0009_gauntlet_authoring.sql',
	'0010_gauntlet_rooms.sql',
	'0015_gauntlet_speedrun_formalize.sql',
	'0016_gauntlet_speedrun_start.sql',
	'0017_gauntlet_run_status.sql',
	'0018_gauntlet_speedrun_units.sql',
	'0019_gauntlet_purge_demo.sql',
	'0021_gauntlet_progression.sql',
	'0022_gauntlet_drawing_series.sql',
	'0023_gauntlet_reveal_focus_regions.sql',
	'0024_gauntlet_leaderboards.sql',
	'0025_gauntlet_room_delete.sql',
	'0026_gauntlet_material_gate.sql',
	'0027_gauntlet_material_density_gate.sql',
	'0028_gauntlet_room_code_and_host_play.sql',
	'0029_gauntlet_drop_tiers.sql',
	'0030_gauntlet_unit_system.sql',
	'0031_gauntlet_tools_bucket.sql',
	'0033_gauntlet_speedrun_attempts.sql',
	'0034_gauntlet_volume_only_verification.sql',
	'0035_gauntlet_run_events.sql',
	'0036_gauntlet_volume_tolerance_0_1.sql',
	'0061_gauntlet_target_disclosure.sql',
	'0137_anon_execute_sweep.sql',
	'0146_gauntlet_reveal_all_modeling_modes.sql',
	'0147_gauntlet_close_target_disclosure.sql',
	'0148_gauntlet_knowledge_clock.sql',
	'0150_gauntlet_connect_run_analysis.sql',
	'0151_gauntlet_meter_practice.sql',
	'0155_gauntlet_authoring_tier.sql'
] as const;

type ForeignKeys = Awaited<ReturnType<typeof loadForeignKeys>>;

let db: TestDb;
let fks: ForeignKeys;

let admin: SeededUser;
let author: SeededUser;
let teacher: SeededUser;
let student: SeededUser;

function client(who: SeededUser) {
	return createPostgrestShim(db, fks, who.id);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function driveLanding(who: SeededUser): Promise<any> {
	return (await GAUNTLET_LOAD({
		locals: {
			supabase: client(who),
			claims: { sub: who.id, email: who.email, role: 'authenticated' }
		}
	} as any)) as any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

beforeAll(async () => {
	db = await startTestDb(CHAIN as unknown as string[]);
	fks = await loadForeignKeys(db);

	admin = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	author = await createUser(db, 'mcosso@boscotech.edu', 'Author Teacher');
	teacher = await createUser(db, 'notonthelist@boscotech.edu', 'Plain Teacher');
	student = await createUser(db, 'kid@boscotech.net', 'A Student');
	await db.asUser(admin.id, (q) => q(`select public.gauntlet_author_grant($1)`, [author.email]));
}, 300_000);

afterAll(async () => {
	await db?.stop();
});

describe('/gauntlet landing gates the Authoring card on the author tier, not on admin', () => {
	it('canAuthorGauntlet mirrors gauntlet_can_author for each caller', async () => {
		expect((await driveLanding(admin)).canAuthorGauntlet).toBe(true);
		expect((await driveLanding(author)).canAuthorGauntlet).toBe(true);
		expect((await driveLanding(teacher)).canAuthorGauntlet).toBe(false);
		expect((await driveLanding(student)).canAuthorGauntlet).toBe(false);
	});

	it('POSITIVE CONTROL: an admin without the load bearing flag would still see nothing wrong on its own -- render an admin and confirm the card is there', async () => {
		const data = await driveLanding(admin);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { body } = render(GauntletPage, { props: { data: data as any } });
		expect(body).toContain('Open authoring');
	});

	it('MUTATION TARGET: a non-admin author still gets the link to /gauntlet/author', async () => {
		// This is the case the audit found broken: an allowlisted author who is
		// not in app_admins. If the landing page's gate ever reverts to isAdmin,
		// this is the assertion that reddens -- author.email is deliberately not
		// an admin.
		const data = await driveLanding(author);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { body } = render(GauntletPage, { props: { data: data as any } });
		expect(body).toContain('Open authoring');
		expect(body).toContain('/gauntlet/author');
	});

	it('a plain teacher (not an author, not an admin) gets no authoring link', async () => {
		const data = await driveLanding(teacher);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { body } = render(GauntletPage, { props: { data: data as any } });
		expect(body).not.toContain('Open authoring');
	});

	it('a student gets no authoring link either', async () => {
		const data = await driveLanding(student);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { body } = render(GauntletPage, { props: { data: data as any } });
		expect(body).not.toContain('Open authoring');
	});
});
