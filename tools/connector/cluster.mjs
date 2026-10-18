// tools/connector/cluster.mjs
//
// The connector's build tools and its local backend need ONE thing the test
// harness already does: an embedded Postgres with the repo's real migration
// files applied, in order, unmodified. This is that, for a plain Node script
// (the harness in tests/db/ is vitest-only: it reads its cluster address
// through `inject`). It applies the same three inputs the full-chain suites
// apply: tests/db/supabase-stub.sql, tests/db/full-chain-fixture-completion.sql
// and every file under supabase/migrations in file order.
//
// It is a tool, never a source of truth about what production holds.

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

export function migrationFiles() {
	return readdirSync(MIGRATIONS_DIR)
		.filter((f) => /^\d{4}_.*\.sql$/.test(f))
		.sort();
}

async function freePort() {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			server.close(() => resolve(port));
		});
	});
}

/**
 * Boots a private cluster, applies the full chain to a fresh database and
 * answers `{ client, port, database, stop }`. `port` lets a caller hand the
 * same database to a second process (the local backend under `vite dev`).
 */
export async function bootFullChain({ port: wantedPort, log = () => {} } = {}) {
	const { default: EmbeddedPostgres } = await import('embedded-postgres');
	const dataDir = mkdtempSync(join(tmpdir(), 'idea-connector-pg-'));
	const port = wantedPort ?? (await freePort());
	const postgres = new EmbeddedPostgres({
		databaseDir: dataDir,
		user: 'postgres',
		password: 'postgres',
		port,
		persistent: false,
		initdbFlags: ['--encoding=UTF8', '--locale=C'],
		createPostgresUser: typeof process.getuid === 'function' && process.getuid() === 0,
		onLog: () => {},
		onError: (m) => {
			const text = String(m);
			if (/FATAL|PANIC/i.test(text)) console.error(text);
		}
	});
	await postgres.initialise();
	await postgres.start();
	const database = 'idea_connector';
	const admin = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'postgres' });
	await admin.connect();
	await admin.query(`create database "${database}"`);
	await admin.end();

	const client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database });
	await client.connect();
	const started = Date.now();
	await client.query(readFileSync(join(REPO_ROOT, 'tests/db/supabase-stub.sql'), 'utf8'));
	await client.query(readFileSync(join(REPO_ROOT, 'tests/db/full-chain-fixture-completion.sql'), 'utf8'));
	const files = migrationFiles();
	for (const file of files) {
		try {
			await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
		} catch (e) {
			throw new Error(`Migration ${file} failed to apply: ${e.message}`);
		}
	}
	log(`applied ${files.length} migrations in ${Date.now() - started}ms`);

	const stop = async () => {
		await client.end().catch(() => {});
		await postgres.stop().catch(() => {});
		rmSync(dataDir, { recursive: true, force: true });
	};
	return { client, port, database, files, stop };
}
