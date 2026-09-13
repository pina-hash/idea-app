/**
 * 0211: the realtime.messages policies that make IdeaCAD's two broadcast topics
 * private. Mr. Pina's decision 25, option B.
 *
 * WHAT IS ACTUALLY UNDER TEST HERE, because there are two layers and only one of
 * them is the boundary. Section A drives the two WRAPPER FUNCTIONS, which is
 * where the rule is written. Section B drives the REAL POLICIES on
 * realtime.messages -- an actual `select` and an actual `insert` as an actual
 * `authenticated` role with the topic GUC set the way Realtime sets it -- which
 * is what a client's join and broadcast reduce to. A wrapper that is right and a
 * policy that never calls it would pass section A alone.
 *
 * THE CAST IS 0205's, REUSED RATHER THAN REBUILT (buildSharingFixture). The
 * member that matters most is `classmate`: a student enrolled in the same
 * section, on the same posted item, with NO grant on the document. Decision 25
 * asked for "a roster predicate" on the student side, and `classmate` is exactly
 * who a roster predicate would have ADMITTED to another student's live frame
 * channel. Section A pins them out.
 *
 * SECTION D IS THE MUTATION PROOF AND IT RUNS EVERY TIME. It replaces each
 * wrapper with `select true` -- the PERMISSIVE direction, which is the one that
 * reproduces the real leak; a policy commented out entirely fails closed and
 * reddens almost nothing -- re-asks the same questions, and asserts the refusals
 * FLIP. Then it restores the real definitions from the migration file's own text
 * and asserts the refusals come back. Without it, every `false` in sections A
 * and B could be a missing grant, a typo'd topic or a wrapper that returns false
 * for everyone, and all three read exactly like a working gate.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSharingFixture, type SharingFixture } from './ideacad-sharing-fixture';
import type { SeededUser } from './harness';

const MIGRATION_0211 = fileURLToPath(
	new URL('../../supabase/migrations/0211_ideacad_realtime_policy.sql', import.meta.url)
);

let f: SharingFixture;
let frameTopic: string;
let pingTopic: string;

/** Ask one wrapper, as one person, about one topic. The GUC is set on the same
 *  connection first, because `realtime.topic()` is how the policy learns the
 *  channel name and there is no other way in. */
async function ask(
	user: SeededUser,
	fn: 'read' | 'send',
	topic: string
): Promise<boolean | null> {
	return f.db.asUser(user.id, async (q) => {
		await q(`select set_config('realtime.topic', $1, false)`, [topic]);
		const { rows } = await q<{ v: boolean | null }>(
			`select public._ideacad_realtime_can_${fn}(realtime.topic()) as v`
		);
		await q(`select set_config('realtime.topic', '', false)`);
		return rows[0].v;
	});
}

/** Drive the REAL policy. `receive` mirrors a join's read check: can this person
 *  see a broadcast row already on the topic? `send` mirrors a broadcast: does the
 *  insert land, or does RLS refuse it? */
async function throughPolicy(
	user: SeededUser,
	topic: string
): Promise<{ receive: boolean; send: boolean }> {
	return f.db.asUser(user.id, async (q) => {
		await q(`select set_config('realtime.topic', $1, false)`, [topic]);
		const { rows } = await q<{ n: string }>(
			`select count(*) as n from realtime.messages where topic = $1 and extension = 'broadcast'`,
			[topic]
		);
		let send = false;
		try {
			await q(
				`insert into realtime.messages (topic, extension, event, private) values ($1, 'broadcast', 'probe', true)`,
				[topic]
			);
			send = true;
		} catch {
			send = false;
		}
		await q(`select set_config('realtime.topic', '', false)`);
		return { receive: Number(rows[0].n) > 0, send };
	});
}

beforeAll(async () => {
	f = await buildSharingFixture('rt');
	frameTopic = `ideacad-doc:${f.documentId}`;
	pingTopic = `ideacad-live:${f.itemId}`;

	// The grants 0205 makes, through the real RPC, as the owner.
	await f.call(f.owner, "public.ideacad_share_document($1::uuid, $2, 'viewer')", [
		f.documentId,
		f.viewer.email
	]);
	await f.call(f.owner, "public.ideacad_share_document($1::uuid, $2, 'editor')", [
		f.documentId,
		f.editor.email
	]);

	// One broadcast row on each topic, seeded as the CONNECTION OWNER so RLS is
	// out of the way for the seed. Section B's `receive` reads these back as
	// `authenticated`, where the policy is the only thing that can hide them.
	for (const topic of [frameTopic, pingTopic]) {
		await f.db.sql(
			`insert into realtime.messages (topic, extension, event, private) values ($1, 'broadcast', 'seed', true)`,
			[topic]
		);
	}
}, 120_000);

afterAll(async () => {
	await f?.db.stop();
});

describe('0211 section A -- the rule, through the wrappers', () => {
	it('gates the FRAME topic on the document, not on the roster', async () => {
		const table = [
			// who,               label,                        read,  send
			[f.owner, 'owner', true, true],
			[f.editor, 'shared editor', true, true],
			[f.viewer, 'shared viewer', true, false],
			[f.classmate, 'in-class classmate, no grant', false, false],
			[f.stranger, 'out-of-class student', false, false],
			[f.teacher, 'teacher of record', true, false],
			[f.otherTeacher, 'teacher of another section', false, false]
		] as const;

		const got: string[] = [];
		for (const [user, label, wantRead, wantSend] of table) {
			const read = await ask(user as SeededUser, 'read', frameTopic);
			const send = await ask(user as SeededUser, 'send', frameTopic);
			got.push(`${label}: read=${read} send=${send}`);
			expect({ label, read, send }).toEqual({ label, read: wantRead, send: wantSend });
		}
		// Reported so the whole table is in the output, not just the first failure.
		expect(got).toHaveLength(7);
	});

	it('gates the PING topic asymmetrically: students send, only the manager receives', async () => {
		const table = [
			[f.owner, 'owner', false, true],
			[f.classmate, 'in-class classmate', false, true],
			[f.viewer, 'shared viewer, enrolled', false, true],
			[f.stranger, 'out-of-class student', false, false],
			[f.teacher, 'teacher of record', true, true],
			[f.otherTeacher, 'teacher of another section', false, false]
		] as const;

		for (const [user, label, wantRead, wantSend] of table) {
			const read = await ask(user as SeededUser, 'read', pingTopic);
			const send = await ask(user as SeededUser, 'send', pingTopic);
			expect({ label, read, send }).toEqual({ label, read: wantRead, send: wantSend });
		}
	});

	it('answers false, never null, for a malformed or foreign topic', async () => {
		// NULL is the outcome that matters here: a boolean gate returning NULL
		// does not stop a caller that asks `if not <gate>`, so this asserts
		// false explicitly rather than falsy. CLAUDE.md's jsonb_typeof lesson.
		for (const topic of [
			'ideacad-doc:not-a-uuid',
			'ideacad-live:',
			'ideacad-doc:',
			'some-other-feature:00000000-0000-0000-0000-000000000001',
			`classroom-live:${f.sectionA}`,
			'',
			'ideacad-doc:00000000-0000-0000-0000-000000000009'
		]) {
			expect({ topic, read: await ask(f.owner, 'read', topic) }).toEqual({ topic, read: false });
			expect({ topic, send: await ask(f.owner, 'send', topic) }).toEqual({ topic, send: false });
		}
	});

	it('refuses anon EXECUTE on all three new functions', async () => {
		const { rows } = await f.db.sql<{ sig: string; anon_x: boolean; auth_x: boolean }>(
			`select p.oid::regprocedure::text as sig,
			        has_function_privilege('anon', p.oid, 'execute') as anon_x,
			        has_function_privilege('authenticated', p.oid, 'execute') as auth_x
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname in
			   ('_ideacad_realtime_topic_id','_ideacad_realtime_can_read','_ideacad_realtime_can_send')
			 order by p.proname`
		);
		expect(rows.map((r) => r.sig)).toHaveLength(3);
		expect(rows.filter((r) => r.anon_x).map((r) => r.sig)).toEqual([]);
		// The two named in a policy MUST hold authenticated or the join fails
		// with "permission denied for function" rather than being refused.
		expect(rows.filter((r) => r.auth_x).map((r) => r.sig).sort()).toEqual([
			'_ideacad_realtime_can_read(text)',
			'_ideacad_realtime_can_send(text)'
		]);

		// The positive control for the anon sweep. Without it, "no anon grants"
		// is indistinguishable from has_function_privilege never returning true.
		const { rows: control } = await f.db.sql<{ v: boolean }>(
			`select has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute') as v`
		);
		expect(control[0].v, 'positive control: a known anon grant must read as true').toBe(true);
	});
});

describe('0211 section B -- the real policies on realtime.messages', () => {
	it('is enforcing rather than merely present', async () => {
		const { rows } = await f.db.sql<{ rls: boolean; policies: string }>(
			`select c.relrowsecurity as rls,
			        (select count(*) from pg_policy p where p.polrelid = c.oid)::text as policies
			 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'realtime' and c.relname = 'messages'`
		);
		// RLS off would make both policies inert while the catalog listing below
		// looks identical. This is the distinction the verification query exists
		// to make on production.
		expect(rows[0].rls).toBe(true);

		const { rows: pols } = await f.db.sql<{ polname: string; cmd: string; expr: string }>(
			`select polname, polcmd::text as cmd,
			        coalesce(pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)) as expr
			 from pg_policy where polrelid = 'realtime.messages'::regclass order by polname`
		);
		expect(pols.map((p) => `${p.polname}:${p.cmd}`)).toEqual([
			'ideacad realtime receive:r',
			'ideacad realtime send:a'
		]);
		// The expression, not the count. A policy reduced to `true` still counts.
		expect(pols[0].expr).toContain('_ideacad_realtime_can_read');
		expect(pols[1].expr).toContain('_ideacad_realtime_can_send');
	});

	it('lets the owner and a shared editor broadcast, and refuses everyone else', async () => {
		expect(await throughPolicy(f.owner, frameTopic)).toEqual({ receive: true, send: true });
		expect(await throughPolicy(f.editor, frameTopic)).toEqual({ receive: true, send: true });
		expect(await throughPolicy(f.viewer, frameTopic)).toEqual({ receive: true, send: false });
		expect(await throughPolicy(f.teacher, frameTopic)).toEqual({ receive: true, send: false });
		expect(await throughPolicy(f.classmate, frameTopic)).toEqual({ receive: false, send: false });
		expect(await throughPolicy(f.stranger, frameTopic)).toEqual({ receive: false, send: false });
	});

	it('lets an enrolled student ping and only the manager read pings', async () => {
		expect(await throughPolicy(f.owner, pingTopic)).toEqual({ receive: false, send: true });
		expect(await throughPolicy(f.classmate, pingTopic)).toEqual({ receive: false, send: true });
		expect(await throughPolicy(f.teacher, pingTopic)).toEqual({ receive: true, send: true });
		expect(await throughPolicy(f.stranger, pingTopic)).toEqual({ receive: false, send: false });
	});

	it('gives a signed-out caller nothing on either topic', async () => {
		for (const topic of [frameTopic, pingTopic]) {
			const out = await f.db.asAnon(async (q) => {
				await q(`select set_config('realtime.topic', $1, false)`, [topic]);
				const { rows } = await q<{ n: string }>(
					`select count(*) as n from realtime.messages where topic = $1`,
					[topic]
				);
				let send = false;
				try {
					await q(
						`insert into realtime.messages (topic, extension, event) values ($1, 'broadcast', 'anon')`,
						[topic]
					);
					send = true;
				} catch {
					send = false;
				}
				await q(`select set_config('realtime.topic', '', false)`);
				return { receive: Number(rows[0].n) > 0, send };
			});
			expect({ topic, ...out }).toEqual({ topic, receive: false, send: false });
		}
	});
});

describe('0211 section C -- the file re-applies', () => {
	it('is a no-op the second time, because re-pasting a migration is ordinary', async () => {
		// A first attempt that failed partway gets retried, and somebody re-pastes.
		// A migration that only works once fails exactly then, with the schema
		// half-built -- so this applies the shipped text over a database that
		// already carries it and asserts the self-check still passes.
		const sqlText = readFileSync(MIGRATION_0211, 'utf8');
		await expect(f.db.sql(sqlText)).resolves.toBeDefined();

		// And the world is unchanged afterwards: still exactly two policies, and
		// the gate still discriminates rather than having been widened by the
		// second pass.
		const { rows } = await f.db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policy where polrelid = 'realtime.messages'::regclass`
		);
		expect(rows[0].n).toBe('2');
		expect(await ask(f.owner, 'read', frameTopic)).toBe(true);
		expect(await ask(f.classmate, 'read', frameTopic)).toBe(false);
	});
});

describe('0211 section D -- mutation proof, both directions', () => {
	const REAL = readFileSync(MIGRATION_0211, 'utf8');

	/** Re-apply the two wrapper definitions out of the migration's own text, so
	 *  the restore is the shipped source rather than a retyping of it. */
	async function restore() {
		for (const tag of ['canread', 'cansend']) {
			const m = REAL.match(
				new RegExp(`create or replace function public\\._ideacad_realtime_can_\\w+[\\s\\S]*?\\$${tag}\\$;`)
			);
			if (!m) throw new Error(`could not recover the ${tag} definition from 0211`);
			await f.db.sql(m[0]);
		}
	}

	it('reddens when the read gate is opened, and recovers when it is closed', async () => {
		// Baseline: the two people a leak would reach are refused.
		expect(await ask(f.classmate, 'read', frameTopic)).toBe(false);
		expect(await ask(f.stranger, 'read', frameTopic)).toBe(false);
		expect((await throughPolicy(f.classmate, frameTopic)).receive).toBe(false);

		await f.db.sql(
			`create or replace function public._ideacad_realtime_can_read(p_topic text)
			 returns boolean language sql stable security definer set search_path = ''
			 as 'select true'`
		);

		// PERMISSIVE mutation: if the assertions above were passing for any
		// reason other than the policy, these would still be false.
		expect(await ask(f.classmate, 'read', frameTopic)).toBe(true);
		expect(await ask(f.stranger, 'read', frameTopic)).toBe(true);
		expect((await throughPolicy(f.classmate, frameTopic)).receive).toBe(true);

		await restore();
		expect(await ask(f.classmate, 'read', frameTopic)).toBe(false);
		expect((await throughPolicy(f.classmate, frameTopic)).receive).toBe(false);
	});

	it('reddens when the send gate is opened, and recovers when it is closed', async () => {
		expect(await ask(f.viewer, 'send', frameTopic)).toBe(false);
		expect(await ask(f.classmate, 'send', frameTopic)).toBe(false);
		expect((await throughPolicy(f.classmate, frameTopic)).send).toBe(false);

		await f.db.sql(
			`create or replace function public._ideacad_realtime_can_send(p_topic text)
			 returns boolean language sql stable security definer set search_path = ''
			 as 'select true'`
		);

		expect(await ask(f.viewer, 'send', frameTopic)).toBe(true);
		expect(await ask(f.classmate, 'send', frameTopic)).toBe(true);
		expect((await throughPolicy(f.classmate, frameTopic)).send).toBe(true);

		await restore();
		expect(await ask(f.viewer, 'send', frameTopic)).toBe(false);
		expect((await throughPolicy(f.classmate, frameTopic)).send).toBe(false);
	});

	it('proves the policy, not the grant, is what refuses', async () => {
		// If the client roles lacked DML on realtime.messages, every refusal in
		// section B would be a missing GRANT and would prove nothing about 0211.
		const { rows } = await f.db.sql<{ role: string; sel: boolean; ins: boolean }>(
			`select r.role_name as role,
			        has_table_privilege(r.role_name, 'realtime.messages', 'select') as sel,
			        has_table_privilege(r.role_name, 'realtime.messages', 'insert') as ins
			 from (values ('anon'), ('authenticated')) as r(role_name)`
		);
		expect(rows.every((r) => r.sel && r.ins)).toBe(true);
	});
});
