// tests/db/cluster.ts
//
// ONE embedded Postgres for the whole run, booted in vitest's main process by
// `globalSetup` and shared by every DB test file.
//
// WHY THIS EXISTS. Each DB suite used to boot its own cluster in `beforeAll`.
// Measured, initdb + postmaster start cost 5.58s on average and the migration
// pass only 0.31s, so 47 boots spent ~262s of a ~317s run doing the one thing
// that is identical every time. Booting once and giving each file its own
// DATABASE on the shared cluster keeps every guarantee the per-file cluster
// gave and pays the 5.58s once.
//
// WHY globalSetup RATHER THAN A MODULE-LEVEL CACHE IN harness.ts. A cached
// promise only helps while the files share a process, and that is a vitest
// pool/isolation detail no test should depend on -- if workers were ever
// isolated the cache would silently go back to one cluster per file and the
// only symptom would be a slow suite. globalSetup runs once per RUN by
// contract, in the main process, and hands the address to the workers through
// `provide`/`inject`. It cannot regress to per-file without the config
// changing.
//
// FILE PARALLELISM STAYS OFF. The documented trap is that parallel files
// starve each other's beforeAll; the fix for that is fewer boots, which is
// this, not more concurrency.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import type { TestProject } from 'vitest/node';

export interface ClusterAddress {
	host: string;
	port: number;
	user: string;
	password: string;
	/** The maintenance database. Never used by a test; only to CREATE/DROP. */
	maintenanceDatabase: string;
}

declare module 'vitest' {
	export interface ProvidedContext {
		pgCluster: ClusterAddress;
	}
}

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (address === null || typeof address === 'string') {
				server.close();
				reject(new Error('Could not determine a free port.'));
				return;
			}
			const { port } = address;
			server.close(() => resolve(port));
		});
	});
}

let postgres: EmbeddedPostgres | undefined;
let dataDir: string | undefined;

export async function setup(project: TestProject): Promise<void> {
	dataDir = mkdtempSync(join(tmpdir(), 'idea-pg-cluster-'));
	const port = await freePort();

	postgres = new EmbeddedPostgres({
		databaseDir: dataDir,
		user: 'postgres',
		password: 'postgres',
		port,
		persistent: false,
		onLog: () => {},
		onError: (messageOrError) => {
			const text = String(messageOrError);
			if (/FATAL|PANIC|could not/i.test(text)) console.error(text);
		}
	});

	await postgres.initialise();
	await postgres.start();

	project.provide('pgCluster', {
		host: '127.0.0.1',
		port,
		user: 'postgres',
		password: 'postgres',
		maintenanceDatabase: 'postgres'
	});
}

export async function teardown(): Promise<void> {
	await postgres?.stop().catch(() => {});
	postgres = undefined;
	if (dataDir) {
		rmSync(dataDir, { recursive: true, force: true });
		dataDir = undefined;
	}
}
