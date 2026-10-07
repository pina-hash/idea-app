// tests/db/armory-v3-helpers.ts
//
// What the three Armory v0.3 suites (armory-v3, armory-v3-purge,
// armory-v3-reports) share, and nothing they assert. Each suite boots its own
// database: the whole tree short of 0233 (chain-0233's PRE_0233), seeds
// through the REAL 0231 and 0232 RPCs, then applies the 0233 file on top.

import { randomUUID } from 'node:crypto';
import { createUser, type SeededUser, type TestDb } from './harness';

/** A 64-character hex content hash made of one repeated digit. */
export const hash = (c: string): string => c.repeat(64);
/** The storage key the website signs for a hash (backend.ts contentObjectKey). */
export const key = (h: string): string => `blobs/sha256/${h.slice(0, 2)}/${h.slice(2, 4)}/${h}`;

export interface Refusal {
	code: string;
	message: string;
	detail?: string;
}

export function armoryRpc(db: TestDb) {
	async function one<T = Record<string, unknown>>(user: SeededUser, sql: string, params: unknown[] = []): Promise<T> {
		return db.asUser(user.id, async (q) => (await q(sql, params)).rows[0] as T);
	}
	async function rows<T = Record<string, unknown>>(user: SeededUser, sql: string, params: unknown[] = []): Promise<T[]> {
		return db.asUser(user.id, async (q) => (await q(sql, params)).rows as T[]);
	}
	async function fails(user: SeededUser, sql: string, params: unknown[] = []): Promise<Refusal> {
		try {
			await one(user, sql, params);
		} catch (e) {
			return e as Refusal;
		}
		throw new Error(`expected a refusal from: ${sql}`);
	}
	const device = async (u: SeededUser, name: string): Promise<string> =>
		(await one<{ id: string }>(u, 'select public.armory_register_device($1, $2) as id', [name, randomUUID()])).id;
	const project = async (u: SeededUser, name: string): Promise<string> =>
		(await one<{ id: string }>(u, `select public.armory_create_project($1, 2026::smallint, $2) as id`, [name, randomUUID()])).id;
	const member = (u: SeededUser, p: string, email: string, role: string) =>
		one(u, 'select public.armory_add_member($1, $2, $3::public.armory_member_role, $4)', [p, email, role, randomUUID()]);
	const createFile = async (u: SeededUser, p: string, dev: string, folder: string, name: string): Promise<string> =>
		(await one<{ id: string }>(u, 'select public.armory_create_file($1, $2, $3, $4, $5) as id', [p, folder, name, dev, randomUUID()])).id;
	const lock = async (u: SeededUser, file: string, dev: string | null): Promise<boolean> =>
		(await one<{ ok: boolean }>(u, 'select public.armory_acquire_lock($1, $2, $3) as ok', [file, dev, randomUUID()])).ok;
	const release = async (u: SeededUser, file: string, dev: string): Promise<boolean> =>
		(await one<{ ok: boolean }>(u, 'select public.armory_release_lock($1, $2, $3) as ok', [file, dev, randomUUID()])).ok;
	const commit = (u: SeededUser, file: string, parent: string | null, h: string, dev: string, bytes = 100) =>
		one<{ version_id: string; advanced: boolean }>(u, 'select * from public.armory_commit_version($1, $2, $3, $4, $5, $6, $7)', [
			file,
			parent,
			key(h),
			h,
			bytes,
			dev,
			randomUUID()
		]);
	const side = async (u: SeededUser, file: string, parent: string | null, h: string, dev: string, bytes = 50): Promise<string> =>
		(
			await one<{ id: string }>(u, `select public.armory_save_side_version($1, $2, $3, $4, $5, 'test side', $6, $7) as id`, [
				file,
				parent,
				key(h),
				h,
				bytes,
				dev,
				randomUUID()
			])
		).id;
	const tombstone = async (u: SeededUser, file: string, parent: string | null, dev: string): Promise<boolean> =>
		(await one<{ ok: boolean }>(u, 'select public.armory_tombstone($1, $2, $3, $4) as ok', [file, parent, dev, randomUUID()])).ok;
	return { one, rows, fails, device, project, member, createFile, lock, release, commit, side, tombstone };
}

/** Adds an address to the admin roster directly (the owner's job), the way other suites seed a second admin. */
export async function makeAdmin(db: TestDb, email: string): Promise<void> {
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [email]);
}

/** Creates a signed-in account, optionally with a chosen display name. */
export async function person(db: TestDb, email: string, fullName: string, displayName?: string): Promise<SeededUser> {
	const u = await createUser(db, email, fullName);
	if (displayName !== undefined) {
		await db.sql('update public.profiles set display_name = $2 where id = $1', [u.id, displayName]);
	}
	return u;
}

/**
 * Waits until at least `n` other backends in this database are blocked on a
 * heavyweight lock, which is the moment a race has its interleaving. Fails
 * loudly rather than proceeding on a guess.
 */
export async function waitForLockWait(db: TestDb, n = 1, timeoutMs = 15_000): Promise<void> {
	const start = Date.now();
	for (;;) {
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from pg_catalog.pg_stat_activity
			 where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()`
		);
		if (rows[0].n >= n) return;
		if (Date.now() - start > timeoutMs) throw new Error(`no backend waited on a lock within ${timeoutMs}ms`);
		await new Promise((r) => setTimeout(r, 50));
	}
}
