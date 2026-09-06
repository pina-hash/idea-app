// tests/apply-migration.test.ts
//
// The parts of `tools/apply-migration.mjs` that decide WITHOUT a database: the
// statement splitter, the client-side refusal, the object derivation, the
// ordering verdict, and the proxy bypass list.
//
// WHY THESE ARE HERE AT ALL, given that automated tests in this repo are the
// exception. Every one of them is a guarantee whose regression is SILENT. A
// splitter that stops respecting dollar quoting reports a `drop table` inside a
// function body and refuses a perfectly good migration -- or, far worse, stops
// SEEING one at the top level and sends it. A refusal list that quietly stops
// matching looks exactly like a file with nothing wrong in it. Nothing on
// screen says either happened.
//
// THE SWEEP OVER THE REAL MIGRATIONS IS THE POINT OF THE FILE. Fixtures prove
// the scanner does what its author meant; putting all 180 committed migrations
// through it proves it agrees with what this repository actually contains, and
// pins the SEVEN files it refuses by name. A scanner nobody has pointed at the
// corpus is a scanner whose false-refusal rate is unknown.
//
// THE SCANNER IS NOW THE ONLY REFUSAL THAT EXISTS. It used to be the outer half
// of a pair, with an event-trigger guard in the database behind it. That guard
// was never installed and cannot be: `create event trigger` needs superuser and
// Supabase's `postgres` is not one. See `supabase/roles/idea_migrator.sql`,
// section "WHAT DOES NOT PROTECT YOU". So a statement this file lets through is
// a statement nothing anywhere refuses, which is why the comment-hiding controls
// below exist and why the corpus sweep matters more than it did.
//
// The database-driven controls -- a self-check raising, nothing being left
// behind, the post-apply verification, and the honest recording of what the role
// can now do unopposed -- are `tests/apply-migration-guard.test.ts`, because they
// need a real Postgres.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	splitStatements,
	head,
	headLine,
	scanFile,
	claims,
	orderVerdict,
	bypassesProxy,
	resolveMigration,
	parseArgs,
	EXIT,
	URL_VAR,
	GUARD_FUNCTION
} from '../tools/apply-migration.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIONS = join(REPO_ROOT, 'supabase', 'migrations');
const migrationFiles = readdirSync(MIGRATIONS)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();

describe('splitStatements', () => {
	it('does not end a statement on a `;` inside a dollar-quoted body', () => {
		const sql = `create function f() returns int language plpgsql as $$
begin
	drop table public.t;
	return 1;
end $$;
select 2;`;
		const out = splitStatements(sql);
		expect(out).toHaveLength(2);
		expect(head(out[0].text)).toMatch(/^create function f\(\)/);
		expect(head(out[1].text)).toBe('select 2;');
	});

	it('respects a named dollar tag, a doubled quote, an identifier and both comment forms', () => {
		const sql = `-- a comment with a ; in it
/* and a block one; too */
select 'it''s; fine' as "a;b";
do $guard$ begin raise notice 'x;y'; end $guard$;`;
		const out = splitStatements(sql);
		expect(out).toHaveLength(2);
		expect(head(out[1].text)).toMatch(/^do \$guard\$/);
	});

	it('reports the line the statement TEXT starts on, and headLine the line its code does', () => {
		const sql = ['select 1;', '', '-- prose', '-- more prose', 'select 2;'].join('\n');
		const out = splitStatements(sql);
		// 3, not 2: a leading blank line belongs to nothing, so the statement's
		// text starts at its first comment.
		expect(out[1].line).toBe(3);
		expect(headLine(out[1].text, out[1].line)).toBe(5);
	});
});

describe('scanFile is the ONLY refusal there is, so it refuses everything destructive', () => {
	const cases: [string, string][] = [
		['drop table public.t;', 'drop table'],
		['truncate public.t;', 'truncate'],
		['delete from public.t where id = 1;', 'top-level delete'],
		['drop schema public cascade;', 'drop schema'],
		['alter table public.t drop column c;', 'alter table ... drop column'],
		['create extension if not exists pg_trgm;', 'create extension'],
		['drop event trigger idea_applier_guard_start;', 'drop event trigger'],
		['create role sneaky login password %L;'.replace('%L', "'x'"), 'role management'],
		['grant postgres to idea_migrator;', 'granting role membership']
	];
	for (const [sql, what] of cases) {
		it(`refuses ${what}`, () => {
			const findings = scanFile(sql).findings.filter((f) => f.kind === 'refuse');
			expect(findings.map((f) => f.what)).toContain(what);
		});
	}

	it('marks top-level DML releasable rather than unconditional, and every refusal carries a reason', () => {
		// `kind: 'warn'` does NOT mean "sent". `main()` returns EXIT.refused for a
		// warn too; what the kind decides is whether `--allow-dml` can release it,
		// which it can for these two and cannot for `delete` or `truncate`. The
		// census is the reason the release exists: 2 inserts and 1 update across
		// the last twenty migrations, all against `storage.buckets`.
		const scan = scanFile(`insert into storage.buckets (id) values ('x');\nupdate storage.buckets set public = false;`);
		expect(scan.findings.every((f) => f.kind === 'warn')).toBe(true);
		expect(scan.findings).toHaveLength(2);
		// The pair that has no release, as the positive control beside it.
		expect(
			scanFile('delete from public.t;\ntruncate public.t;').findings.map((f) => f.kind)
		).toEqual(['refuse', 'refuse']);
		for (const f of scanFile('drop table public.t;').findings) {
			expect(f.why.length).toBeGreaterThan(20);
		}
	});

	it('does NOT refuse the drops a migration legitimately makes', () => {
		const sql = [
			'drop policy if exists p on public.t;',
			'drop trigger if exists tg on public.t;',
			'drop index if exists public.ti;',
			'drop function if exists public.f(uuid, text);',
			'drop view if exists public.v;',
			'alter table public.t add column if not exists c text;',
			'revoke all on function public.f() from public, anon, authenticated, service_role;',
			'grant execute on function public.f() to authenticated;'
		].join('\n');
		expect(scanFile(sql).findings).toEqual([]);
	});

	it('sees a `drop table` only at the top level, never inside a function body', () => {
		const inBody = `create or replace function public.f() returns void language plpgsql as $$
begin
	drop table public.t;
	truncate public.u;
	delete from public.v;
end $$;`;
		expect(scanFile(inBody).findings).toEqual([]);
		// The positive control: the same three statements OUTSIDE a body are
		// all refused, so the emptiness above is the splitter working rather
		// than the scanner failing to look.
		expect(
			scanFile('drop table public.t;\ntruncate public.u;\ndelete from public.v;')
				.findings.filter((f) => f.kind === 'refuse')
		).toHaveLength(3);
	});

	it('notices a file that opens its own transaction', () => {
		expect(scanFile('begin;\nselect 1;\ncommit;').selfManagedTransaction).toBe(true);
		expect(scanFile('select 1;').selfManagedTransaction).toBe(false);
	});
});

describe('a keyword cannot be hidden from the scanner by a comment', () => {
	// THE FOUR CONTROLS FROM PROMPT 0065, AND THE REASON THEY ARE HERE. Until
	// this bundle the scanner stripped comments only from the FRONT of a
	// statement, so a comment in the MIDDLE hid the keyword pair the refusal
	// list matches on. Measured against the shipping scanner before the fix:
	// `drop table public.b;` was refused, and `drop /* sneaky */ table public.b;`
	// and `drop -- sneaky\ntable public.b;` were both SENT. That was survivable
	// while an event-trigger guard stood behind it. There is no guard -- it
	// cannot be installed on Supabase, see `supabase/roles/idea_migrator.sql` --
	// so a statement this scanner sends is a statement nothing else refuses.
	const refusals = (sql: string) =>
		scanFile(sql)
			.findings.filter((f) => f.kind === 'refuse')
			.map((f) => f.what);

	it('control 1: a top-level drop table is refused before anything is sent', () => {
		expect(refusals('create table public.a (id int);\ndrop table public.b;')).toEqual([
			'drop table'
		]);
	});

	it('control 2: the same text inside a body, a comment or a string is NOT refused', () => {
		// Migrations legitimately contain all of these, and refusing them would
		// be a false refusal on a real file rather than a safe default.
		for (const sql of [
			"do $$ begin execute 'drop table public.b'; end $$;",
			'create or replace function f() returns void language plpgsql as $b$ begin drop table public.b; end $b$;',
			'-- drop table public.b\nselect 1;',
			'/* drop table public.b */\nselect 1;',
			"insert into log(msg) values ('drop table public.b');",
			'create function g() returns void language plpgsql as $body$ begin truncate public.b; end $body$;'
		]) {
			expect(refusals(sql)).toEqual([]);
		}
	});

	it('control 3: split across lines, or with a comment inside it, is still refused', () => {
		const hidden: [string, string][] = [
			['drop\n\ttable public.b;', 'drop table'],
			['drop /* sneaky */ table public.b;', 'drop table'],
			['drop -- sneaky\ntable public.b;', 'drop table'],
			// Postgres block comments NEST, so an inner `*/` must not end the outer.
			['drop /* a /* b */ c */ table public.b;', 'drop table'],
			['truncate /* x */ public.b;', 'truncate'],
			['delete /* x */ from public.b;', 'top-level delete'],
			['drop /* x */\nschema public cascade;', 'drop schema'],
			['drop /* x */ owned by idea_migrator;', 'drop owned'],
			['alter table public.b /* x */ drop column c;', 'alter table ... drop column']
		];
		for (const [sql, what] of hidden) expect(refusals(sql)).toContain(what);
		expect(hidden).toHaveLength(9);
	});

	it('control 4: an ordinary migration is sent, comments and all', () => {
		const clean = `-- 0184: a perfectly ordinary migration.
begin;
create table if not exists public.thing (id uuid primary key);
alter table public.thing enable row level security;
drop policy if exists thing_read on public.thing;
create policy thing_read on public.thing for select to authenticated using (true);
create or replace function public.thing_count() returns integer language sql stable as $$
  select count(*)::integer from public.thing;
$$;
revoke all on function public.thing_count() from public, anon, authenticated, service_role;
grant execute on function public.thing_count() to authenticated;
do $$ begin raise notice 'applied'; end $$;
commit;`;
		expect(scanFile(clean).findings).toEqual([]);
	});

	it('strips a comment without welding two tokens together', () => {
		// A comment becomes a SPACE, not nothing: `drop/*x*/table` is one token
		// to a naive join and two to Postgres.
		expect(head('drop/*x*/table public.b;')).toBe('drop table public.b;');
		// And a `--` inside a string literal is not a comment.
		expect(head("insert into t values ('a--b');")).toBe("insert into t values ('a--b');");
	});
});

describe('the whole committed corpus, put through the scanner', () => {
	// A sweep with no case count asserted is a sweep that can silently generate
	// nothing and pass.
	it('has 180-odd migrations to look at', () => {
		expect(migrationFiles.length).toBeGreaterThanOrEqual(180);
	});

	const scans = migrationFiles.map(
		(f) => [f, scanFile(readFileSync(join(MIGRATIONS, f), 'utf8'))] as const
	);

	// THE LIST IS NOT PINNED, AND THAT IS DELIBERATE. A pinned list of refused
	// files is a RATCHET: every future migration that lands reddens it and the
	// fix offered each time is to write down whatever the new set is, which
	// records what happened rather than checking anything. What is asserted
	// instead is the RULE -- that every refusal is corroborated, independently
	// of the scanner, by the destructive keyword actually appearing at the head
	// of a line in the file -- plus three named anchors so the sweep cannot pass
	// by finding nothing.
	const KEYWORD = {
		'drop table': /^drop table\b/im,
		'drop schema': /^drop schema\b/im,
		'drop database': /^drop database\b/im,
		'drop owned': /^drop owned\b/im,
		truncate: /^truncate\b/im,
		'top-level delete': /^delete\b/im,
		'create extension': /^create extension\b/im,
		'alter table ... drop column': /^alter table\b[\s\S]*?\bdrop column\b/im,
		'drop event trigger': /^drop event trigger\b/im,
		'alter event trigger / alter system': /^alter (event trigger|system)\b/im,
		'role management': /^(create|alter|drop) role\b/im,
		'granting role membership': /^grant \w+ to\b/im
	} as const;

	it('corroborates every refusal against the file text, and refuses at most a handful', () => {
		const refused = scans.filter(([, s]) => s.findings.some((f) => f.kind === 'refuse'));
		expect(refused.length).toBeGreaterThan(0);
		// A scanner refusing a large fraction of the corpus is one nobody will
		// use; a number rather than a list, so a new migration cannot redden it.
		expect(refused.length / scans.length).toBeLessThan(0.1);
		for (const [file, scan] of refused) {
			const text = readFileSync(join(MIGRATIONS, file), 'utf8');
			for (const f of scan.findings.filter((f) => f.kind === 'refuse')) {
				const re = KEYWORD[f.what as keyof typeof KEYWORD];
				expect(re, `${file}: no corroborating pattern for "${f.what}"`).toBeDefined();
				expect(re.test(text), `${file}: refused for ${f.what} but the file has no such line`).toBe(
					true
				);
			}
		}
	});

	it('holds at three named anchors, so the sweep cannot pass by finding nothing', () => {
		const at = (f: string) => scans.find(([n]) => n === f)?.[1];
		expect(at('0162_maps_search.sql')?.findings.map((f) => f.what)).toEqual(['create extension']);
		expect(at('0085_classroom_canonical_items.sql')?.findings.map((f) => f.what)).toContain(
			'drop table'
		);
		expect(at('0174_classroom_hall_pass_limits.sql')?.findings).toEqual([]);
	});

	it('leaves the great majority of the corpus sendable with no flag at all', () => {
		const clean = scans.filter(([, s]) => s.findings.length === 0);
		expect(clean.length / scans.length).toBeGreaterThan(0.7);
	});

	it('derives at least one object from all but a handful of the files it does not refuse', () => {
		const sendable = scans.filter(([, s]) => !s.findings.some((f) => f.kind === 'refuse'));
		const barren = sendable
			.map(([f]) => [f, claims(readFileSync(join(MIGRATIONS, f), 'utf8')).length] as const)
			.filter(([, n]) => n === 0)
			.map(([f]) => f);
		// A migration this tool can apply and then say nothing about is a real
		// gap, so the count is bounded -- but the identities are not pinned, for
		// the ratchet reason above. Each one is corroborated instead: a file
		// naming no object must genuinely create none.
		expect(barren.length).toBeLessThan(15);
		for (const file of barren) {
			const text = readFileSync(join(MIGRATIONS, file), 'utf8');
			expect(
				/^create (table|schema|policy|index|unique index|or replace view)\b/im.test(text),
				`${file} derived no object but creates one at the top level`
			).toBe(false);
			expect(
				/^alter table\b[\s\S]*?\badd column\b/im.test(text),
				`${file} derived no object but adds a column at the top level`
			).toBe(false);
		}
	});
});

describe('claims', () => {
	it('names each kind of object a migration creates, and asks pg_catalog about it', () => {
		const sql = `
create table if not exists public.t (id uuid primary key);
alter table public.t add column if not exists a text, add column if not exists b int;
create unique index if not exists t_a on public.t (a);
create policy t_read on public.t for select using (true);
create or replace function public.f(p uuid default null) returns int language sql as $$ select 1 $$;
create trigger t_tg before insert on public.t for each row execute function public.f();
create schema if not exists s;
create or replace view public.v as select 1;`;
		const got = claims(sql).map((c) => `${c.kind} ${c.name}`);
		expect(got).toEqual([
			'table public.t',
			'column public.t.a',
			'column public.t.b',
			'index public.t_a',
			'policy public.t:t_read',
			'function public.f',
			'trigger public.t:t_tg',
			'schema s',
			'view public.v'
		]);
		expect(claims(sql).every((c) => c.sql.startsWith('exists (select 1 from pg_catalog.'))).toBe(
			true
		);
	});

	it('reads the real 0174 the way a person would', () => {
		const got = claims(readFileSync(join(MIGRATIONS, '0174_classroom_hall_pass_limits.sql'), 'utf8'));
		expect(got.map((c) => `${c.kind} ${c.name}`)).toEqual([
			'function public._classroom_hall_pass_limits',
			'column public.classroom_hall_passes.opened_by',
			'function public.classroom_hall_pass_open',
			'function public.classroom_hall_pass_open_for',
			'function public.classroom_hall_pass_state'
		]);
	});
});

describe('orderVerdict', () => {
	const f = (num: string, state: string) => ({ num, file: `${num}_x.sql`, object: 'o', state, why: '' });

	it('passes when every file below the target is applied and the target is not', () => {
		expect(orderVerdict([f('0179', 'applied'), f('0180', 'not-applied')], '0180')).toEqual({
			ok: true
		});
	});

	it('refuses a file that is not the lowest unapplied one', () => {
		const v = orderVerdict([f('0178', 'not-applied'), f('0179', 'applied'), f('0180', 'not-applied')], '0180');
		expect(v.ok).toBe(false);
		expect(v.ok === false && v.why).toMatch(/not the lowest unapplied/);
	});

	it('refuses a target that is already applied', () => {
		const v = orderVerdict([f('0180', 'applied')], '0180');
		expect(v.ok).toBe(false);
		expect(v.ok === false && v.why).toMatch(/ALREADY applied/);
	});

	it('treats CANNOT SAY as a refusal, below the target and at it', () => {
		expect(orderVerdict([f('0179', 'unknown'), f('0180', 'not-applied')], '0180').ok).toBe(false);
		expect(orderVerdict([f('0180', 'unknown')], '0180').ok).toBe(false);
		expect(orderVerdict([f('0179', 'applied')], '0180').ok).toBe(false);
	});
});

describe('the connection string and the file argument', () => {
	it('reads the URL from IDEA_MIGRATION_URL and nowhere else', () => {
		expect(URL_VAR).toBe('IDEA_MIGRATION_URL');
		const source = readFileSync(join(REPO_ROOT, 'tools', 'apply-migration.mjs'), 'utf8');
		// The service key and the read-only probe URL are other people's
		// credentials; this tool must not reach for either.
		expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
		expect(source).not.toContain('SUPABASE_ACCESS_TOKEN');
		expect(source).not.toContain('DEPLOY_PROBE_URL');
		// And it never shells out to the CLI whose one forbidden command this
		// whole tool exists to be an alternative to.
		expect(source).not.toMatch(/spawnSync\(\s*'supabase'|execFileSync\(\s*'supabase'/);
	});

	it('names the guard it fingerprints', () => {
		expect(GUARD_FUNCTION).toBe('idea_guard.applier_guard()');
	});

	it('takes one migration, by number or by name, and nothing else', () => {
		expect(resolveMigration('0180', MIGRATIONS).file).toBe('0180_notebook_grid_avatar.sql');
		expect(resolveMigration('180', MIGRATIONS).file).toBe('0180_notebook_grid_avatar.sql');
		expect(resolveMigration('supabase/migrations/0180_notebook_grid_avatar.sql', MIGRATIONS).num).toBe(
			'0180'
		);
		expect(() => resolveMigration('9999', MIGRATIONS)).toThrow();
		expect(() => resolveMigration('supabase/migrations/', MIGRATIONS)).toThrow();
	});

	it('has no flag that takes a range, a directory or more than one file', () => {
		expect(() => parseArgs(['0179', '0180'])).toThrow(/exactly one/);
		expect(() => parseArgs([])).toThrow(/name the migration/);
		expect(() => parseArgs(['--all'])).toThrow(/unknown argument/);
		expect(parseArgs(['0180', '--dry-run']).dryRun).toBe(true);
	});

	it('gives a refusal and a failure different exit statuses, and neither is 0', () => {
		expect(EXIT.applied).toBe(0);
		const codes = [EXIT.cannotRun, EXIT.refused, EXIT.raised, EXIT.unverified];
		expect(new Set(codes).size).toBe(4);
		expect(codes.every((c) => c > 0)).toBe(true);
	});
});

describe('bypassesProxy', () => {
	const NO_PROXY =
		'localhost,127.0.0.1,::1,127.0.0.0/8,api.anthropic.com,registry.npmjs.org,.svc.cluster.local,*.svc.cluster.local';

	it('bypasses what NO_PROXY names, exactly and by suffix', () => {
		expect(bypassesProxy('localhost', NO_PROXY)).toBe(true);
		expect(bypassesProxy('a.svc.cluster.local', NO_PROXY)).toBe(true);
	});

	it('does NOT bypass a database host, which is the case that matters', () => {
		expect(bypassesProxy('aws-0-us-east-1.pooler.supabase.com', NO_PROXY)).toBe(false);
		expect(bypassesProxy('db.abcdefgh.supabase.co', NO_PROXY)).toBe(false);
		expect(bypassesProxy('anything', '')).toBe(false);
	});
});
