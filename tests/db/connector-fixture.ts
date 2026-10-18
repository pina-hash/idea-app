// tests/db/connector-fixture.ts
//
// What the connector's database suites share, and nothing they assert: the
// whole tree read off disk behind the fixture completion (the chain-0230
// shape, so 0270 is applied over exactly the database production holds), a
// site admin who teaches two IDEA209H blocks, a teacher who is NOT an admin,
// students with a deliberately ambiguous pair of names, the connector's local
// backend over the test database, and a tool context acting as any of them.
//
// THE ADMIN IS AN ALLOWLIST ROW, NEVER THE PINNED OWNER: the connector must
// work for any admin and identify nobody by a constant.

import { readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { inject } from 'vitest';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { localPgBackend } from '../../src/lib/server/connector/backend-local';
import { registryRows } from '../../src/lib/server/connector/registry';
import type { ConnectorBackend } from '../../src/lib/server/connector/types';
import type { ToolContext } from '../../src/lib/server/connector/context';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

export const ALL = readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();

/** The whole tree: what production holds once 0270 and 0271 are applied. */
export const WITH_CONNECTOR: readonly string[] = [FIXTURE_COMPLETION, ...ALL];

export interface ConnectorWorld {
	db: TestDb;
	pool: pg.Pool;
	backend: ConnectorBackend;
	admin: SeededUser;
	teacher: SeededUser;
	student: SeededUser;
	block2: string;
	block4: string;
	teacherSection: string;
	students: Record<'mateo' | 'danielR' | 'danielV' | 'leo', string>;
	ctx(user: SeededUser, now?: () => number): Promise<ToolContext>;
	stop(): Promise<void>;
}

export async function connectorWorld(): Promise<ConnectorWorld> {
	const db = await startTestDb(WITH_CONNECTOR);
	const cluster = inject('pgCluster');
	const pool = new pg.Pool({
		host: cluster.host,
		port: cluster.port,
		user: cluster.user,
		password: cluster.password,
		database: db.databaseName,
		max: 4
	});
	const admin = await createUser(db, 'chair@boscotech.edu', 'Chair Person');
	await db.sql(`insert into public.app_admins (email, granted_by) values ('chair@boscotech.edu', 'test') on conflict do nothing`);
	const teacher = await createUser(db, 'colleague@boscotech.edu', 'Colleague Teacher');
	const student = await createUser(db, 'mateo.reyes@boscotech.net', 'Mateo Reyes');

	const block2 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering I Honors', label: 'Block 2', teacherEmail: admin.email });
	const block4 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering I Honors', label: 'Block 4', teacherEmail: admin.email });
	const teacherSection = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering Foundations', label: 'Block 1', teacherEmail: teacher.email });

	const students = {
		mateo: 'mateo.reyes@boscotech.net',
		danielR: 'daniel.ruiz@boscotech.net',
		danielV: 'daniel.vega@boscotech.net',
		leo: 'leo.lee@boscotech.net'
	};
	await enrollStudent(db, { as: admin, sectionId: block2, email: students.mateo, displayName: 'Reyes, Mateo' });
	await enrollStudent(db, { as: admin, sectionId: block2, email: students.danielR, displayName: 'Ruiz, Daniel' });
	await enrollStudent(db, { as: admin, sectionId: block4, email: students.danielV, displayName: 'Vega, Daniel' });
	await enrollStudent(db, { as: admin, sectionId: block4, email: students.leo, displayName: 'Lee, Leo' });
	await enrollStudent(db, { as: admin, sectionId: teacherSection, email: 'ana.reyes@boscotech.net', displayName: 'Reyes, Ana' });

	const backend = localPgBackend(pool);
	await backend.syncRegistry(registryRows());

	return {
		db,
		pool,
		backend,
		admin,
		teacher,
		student,
		block2,
		block4,
		teacherSection,
		students,
		async ctx(user, now = () => Date.now()) {
			return {
				backend,
				session: await backend.mintSession({ id: user.id, email: user.email }),
				token: null,
				now,
				random: (n) => randomBytes(n),
				cache: new Map()
			};
		},
		async stop() {
			await pool.end().catch(() => {});
			await db.stop();
		}
	};
}

/** Every row in every log table, as JSON, for a before/after diff that shares nothing with 0270's own read. */
export async function logSnapshot(q: (t: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>): Promise<Map<string, string[]>> {
	const { rows: tables } = await q(`select table_name from public.connector_log_tables order by 1`);
	const out = new Map<string, string[]>();
	for (const t of tables) {
		const name = String(t.table_name);
		const { rows } = await q(`select to_jsonb(x)::text as j from public.${name} x`);
		out.set(name, rows.map((r) => String(r.j)));
	}
	return out;
}

/**
 * Rows present after and not before, per table, and rows present before and
 * gone after, marked `removed:`. An update shows as one of each.
 */
export function logDiff(before: Map<string, string[]>, after: Map<string, string[]>): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const t of new Set([...before.keys(), ...after.keys()])) {
		const prior = new Set(before.get(t) ?? []);
		const next = new Set(after.get(t) ?? []);
		const added = [...next].filter((r) => !prior.has(r));
		const removed = [...prior].filter((r) => !next.has(r)).map((r) => `removed:${r}`);
		if (added.length || removed.length) out.set(t, [...added, ...removed]);
	}
	return out;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TS = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?|Z)?/g;

/** A row with its ids and timestamps blanked: what "identical apart from ids and timestamps" compares. */
export function normalizeRow(json: string): string {
	return json.replace(UUID, '<id>').replace(TS, '<ts>');
}
