// tests/maps-constraint-refusals.test.ts
//
// THE 23505 THAT IS A RULE, NOT A RACE -- the second obligation 0168 handed
// forward, asserted end to end.
//
// WHY THIS FILE EXISTS. `$lib/pg-errors` has SQLSTATE 23505 on its TRANSIENT
// whitelist, which is right for the case it was found in (nine concurrent
// `classroom_open_submission` calls, two of them stranded on a lost upsert)
// and wrong for a unique index that encodes a RULE. Two of IDEA Maps' do:
// `maps_stock_one_row_per_placement` says one placement per item type per
// container, and `maps_nodes_elevation_slot` (0168) says one published
// compartment per elevation slot. Those refuse identically on every attempt,
// so a caller reading the SQLSTATE alone retries a permanent answer until it
// gives up. 0168's own header names this as the editor bundle's fix and names
// the shape of it: "recognise this index by name and say 'that elevation slot
// is taken', not to widen the transient list."
//
// THE REGRESSION IS SILENT, WHICH IS WHY IT IS AUTOMATED RATHER THAN DRIVEN.
// A wrongly-retryable refusal looks, on screen, exactly like a correctly
// retryable one: the same sentence, a Retry that can be pressed, and an answer
// that never changes. Nothing renders `retryable`.
//
// WHERE THE EXPECTED VALUES COME FROM, WHICH IS THE WHOLE POINT OF DRIVING A
// REAL DATABASE FOR A CLIENT-SIDE CLASSIFICATION: the constraint NAMES and the
// exact wording of the error Postgres emits are not typed in here as strings
// somebody believed. Each duplicate is genuinely provoked against the real
// migration chain, through the real RLS policies as a real admin, and the
// driver's own `code`/`message`/`detail` are then handed to the REAL
// `mapsTransports` write path. A test that hand-wrote
// `'duplicate key value violates unique constraint "..."'` would be asserting
// that my parser agrees with my own guess about PostgREST's wording.
//
// WHAT IS PINNED:
//   A. `constraintNameOf` reads the name Postgres actually emitted.
//   B. The two rule-shaped duplicates come back NOT retryable, worded.
//   C. The RACE-shaped one (`maps_revisions_*_slot`) is untouched: it never
//      reaches the classifier, because `stagePending` answers it by updating
//      the winner's row, which is the correct move for a real race.
//   D. Every other transient SQLSTATE is still transient, so this is a
//      partition and not a narrowing of the shared whitelist.
//   E. `isTransientSqlstate` and `rpcErrorStatus` are byte-for-byte unchanged
//      for every caller outside maps -- `$lib/classroom/upload-errors.ts`
//      imports the first and may not be edited by this bundle.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAPS_MIGRATIONS, OWNER_EMAIL } from './db/maps-fixture';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import {
	constraintNameOf,
	isTransientDbError,
	isTransientSqlstate,
	rpcErrorStatus
} from '../src/lib/pg-errors';
import { MAPS_PERMANENT_UNIQUE, mapsTransports } from '../src/lib/maps/transports';
import type { MapsTable } from '../src/lib/maps/maps';

const FILE_0168 = '0168_maps_media_types_and_plan_frame.sql';

/** The shape a PostgREST client hands a caller. */
interface CapturedError {
	code: string;
	message: string;
	details?: string;
}

/**
 * A `MapsWriteClient` whose every write answers with ONE captured error.
 *
 * This is the seam that lets a REAL Postgres failure drive the REAL client
 * classification without the shim needing an insert path (it has none: it is a
 * select shim). The transports under test are the shipped ones, imported from
 * their own module -- what is faked is the wire, not the decision.
 */
function clientAnswering(error: CapturedError) {
	const answer = { data: null, error };
	const builder = {
		insert: () => builder,
		update: () => builder,
		delete: () => builder,
		eq: () => builder,
		select: () => builder,
		single: () => Promise.resolve(answer),
		then: (resolve: (v: typeof answer) => unknown) => Promise.resolve(answer).then(resolve)
	};
	return {
		from: () => builder,
		rpc: () => Promise.resolve(answer)
	} as unknown as Parameters<typeof mapsTransports>[0];
}

/** Runs `sql` as the admin and returns the driver's error, refusing a success. */
async function provoke(
	db: TestDb,
	admin: SeededUser,
	sql: string,
	params: unknown[]
): Promise<CapturedError> {
	return db.asUser(admin.id, async (q) => {
		try {
			await q(sql, params);
		} catch (cause) {
			const e = cause as { code?: string; message?: string; detail?: string };
			// `detail` is node-postgres's spelling; PostgREST forwards the same
			// line as `details`, which is what the client type names.
			return { code: e.code ?? '', message: e.message ?? '', details: e.detail };
		}
		throw new Error(`expected a refusal, but the statement succeeded: ${sql}`);
	});
}

describe('IDEA Maps -- a unique violation that is a rule is never retried', () => {
	let db: TestDb;
	let admin: SeededUser;
	let stockDuplicate: CapturedError;
	let elevationDuplicate: CapturedError;
	let revisionDuplicate: CapturedError;

	beforeAll(async () => {
		db = await startTestDb([...MAPS_MIGRATIONS, FILE_0168]);
		admin = await createUser(db, OWNER_EMAIL, 'Site Owner');
		await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
			OWNER_EMAIL
		]);

		const world = await db.asUser(admin.id, async (q) => {
			const one = async (sql: string, params: unknown[]) =>
				(await q<{ id: string }>(sql, params)).rows[0].id;
			const building = await one(
				`insert into public.maps_nodes (kind, name) values ('building', 'IDEA Building') returning id`,
				[]
			);
			// The containment rule is the schema's own (0161): a unit sits in a
			// room, never straight in a building.
			const room = await one(
				`insert into public.maps_nodes (kind, name, parent_id) values ('room', 'Shop Floor', $1) returning id`,
				[building]
			);
			const unit = await one(
				`insert into public.maps_nodes (kind, name, parent_id) values ('unit', 'Tool Chest A', $1) returning id`,
				[room]
			);
			const drawerA = await one(
				`insert into public.maps_nodes (kind, name, parent_id, elevation_order)
				 values ('compartment', 'Drawer 1', $1, 1) returning id`,
				[unit]
			);
			const drawerB = await one(
				`insert into public.maps_nodes (kind, name, parent_id, elevation_order)
				 values ('compartment', 'Drawer 2', $1, 2) returning id`,
				[unit]
			);
			const type = await one(
				`insert into public.maps_item_types (name) values ('Dial Caliper') returning id`,
				[]
			);
			await one(
				`insert into public.maps_stock (item_type_id, node_id) values ($1, $2) returning id`,
				[type, drawerA]
			);
			return { unit, drawerA, drawerB, type };
		});

		// A placement of the same type in the same container. A RULE: the second
		// one is wrong on every attempt, forever.
		stockDuplicate = await provoke(
			db,
			admin,
			`insert into public.maps_stock (item_type_id, node_id) values ($1, $2)`,
			[world.type, world.drawerA]
		);

		// 0168's index. Both drawers published, the second moved onto the first's
		// slot. The index covers PUBLISHED compartments only, so both halves have
		// to be real: publish, then collide.
		await db.asUser(admin.id, async (q) => {
			for (const id of [world.drawerA, world.drawerB]) {
				const { rows } = await q<{ r: { ok?: boolean } }>(
					'select public.maps_publish($1, $2) as r',
					['maps_nodes', id]
				);
				if (rows[0].r?.ok !== true) throw new Error(`publish refused: ${JSON.stringify(rows[0].r)}`);
			}
		});
		elevationDuplicate = await provoke(
			db,
			admin,
			`update public.maps_nodes set elevation_order = 1 where id = $1`,
			[world.drawerB]
		);

		// The RACE, for contrast: a second pending revision on one object. This
		// is a real collision between two tabs and the loser's correct move is to
		// update the winner's row, which is what `stagePending` does.
		revisionDuplicate = await db.asUser(admin.id, async (q) => {
			await q(
				`insert into public.maps_revisions (node_id, state, snapshot) values ($1, 'pending', '{}'::jsonb)`,
				[world.drawerA]
			);
			try {
				await q(
					`insert into public.maps_revisions (node_id, state, snapshot) values ($1, 'pending', '{}'::jsonb)`,
					[world.drawerA]
				);
			} catch (cause) {
				const e = cause as { code?: string; message?: string; detail?: string };
				return { code: e.code ?? '', message: e.message ?? '', details: e.detail };
			}
			throw new Error('expected the at-most-one-pending index to refuse the second insert');
		});
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	describe('A. the names come from Postgres, not from this file', () => {
		it('all three are 23505 -- which is exactly why the code cannot decide', () => {
			expect(stockDuplicate.code).toBe('23505');
			expect(elevationDuplicate.code).toBe('23505');
			expect(revisionDuplicate.code).toBe('23505');
		});

		it('constraintNameOf reads the constraint each one actually named', () => {
			expect(constraintNameOf(stockDuplicate)).toBe('maps_stock_one_row_per_placement');
			expect(constraintNameOf(elevationDuplicate)).toBe('maps_nodes_elevation_slot');
			// The positive control for the parser's null branch: an error naming
			// no constraint must answer null rather than something plausible.
			expect(constraintNameOf({ message: 'The photo did not upload.' })).toBeNull();
			expect(constraintNameOf(null)).toBeNull();
		});

		it('and the RACE names a different index, which is how the two are told apart', () => {
			const raced = constraintNameOf(revisionDuplicate);
			expect(raced).toMatch(/^maps_revisions_/);
			expect(Object.keys(MAPS_PERMANENT_UNIQUE)).not.toContain(raced);
		});
	});

	describe('B. the write path refuses them permanently, and says why', () => {
		const drive = async (error: CapturedError, table: MapsTable) =>
			mapsTransports(clientAnswering(error)).insertRow(table, {});

		it('a duplicate placement is not retryable, and reads as a decision', async () => {
			const result = await drive(stockDuplicate, 'maps_stock');
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.retryable).toBe(false);
			expect(result.message).toBe(
				'This item type is already placed in that container. Edit the existing placement instead.'
			);
			// The raw driver message never reaches a person.
			expect(result.message).not.toContain('duplicate key');
		});

		it('an occupied elevation slot is not retryable, and names the slot', async () => {
			const result = await drive(elevationDuplicate, 'maps_nodes');
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.retryable).toBe(false);
			expect(result.message).toContain('elevation slot');
			expect(result.message).not.toContain('duplicate key');
		});

		it('a 23505 naming no constraint on maps_stock still refuses -- the table implies it', async () => {
			// The one table in the write surface with a single reachable unique
			// index. A driver that reports no constraint name (this shim's own
			// select path is one) must not turn a rule back into a race.
			const result = await drive(
				{ code: '23505', message: 'duplicate key value violates a unique constraint' },
				'maps_stock'
			);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.retryable).toBe(false);
		});
	});

	describe('C. the race is untouched', () => {
		it('stagePending answers the pending-slot collision by updating the winner, never by classifying it', async () => {
			/* A client that refuses the first UPDATE (no rows), refuses the INSERT
			   with the REAL pending-slot 23505, then finds the winner's row on the
			   second pass. That is the two-tab case exactly, and the result must be
			   a plain success -- so this path never asks whether 23505 is
			   retryable, which is what keeps the B change from reaching it. */
			let updates = 0;
			const builder = {
				update: () => builder,
				insert: () =>
					Promise.resolve({ data: null, error: updates === 1 ? revisionDuplicate : null }),
				eq: () => builder,
				select: () => Promise.resolve({ data: updates++ === 0 ? [] : [{ id: 'r1' }], error: null })
			};
			const client = { from: () => builder, rpc: () => Promise.resolve({ data: null, error: null }) };
			const result = await mapsTransports(
				client as unknown as Parameters<typeof mapsTransports>[0]
			).stagePending('maps_nodes', 'n1', {});
			expect(result).toEqual({ ok: true, data: null });
			expect(updates).toBe(2);
		});
	});

	describe('D. this is a partition, not a narrowing', () => {
		it('every other transient SQLSTATE is still transient, constraint or no constraint', () => {
			for (const code of ['40001', '40P01', '55P03', '57014', '53300']) {
				expect(isTransientSqlstate(code)).toBe(true);
				expect(
					isTransientDbError({ code, message: 'x' }, Object.keys(MAPS_PERMANENT_UNIQUE))
				).toBe(true);
			}
		});

		it('a 23505 from a constraint nobody named is still a race', () => {
			expect(
				isTransientDbError(
					{
						code: '23505',
						message: 'duplicate key value violates unique constraint "some_other_upsert_key"'
					},
					Object.keys(MAPS_PERMANENT_UNIQUE)
				)
			).toBe(true);
		});

		it('and a considered refusal is still never retried', () => {
			expect(isTransientDbError({ code: 'P0001', message: 'A compartment cannot sit inside a room.' })).toBe(
				false
			);
			expect(isTransientDbError({ code: '42501', message: 'permission denied' })).toBe(false);
			expect(isTransientDbError(null)).toBe(false);
		});
	});

	describe('E. the shared functions did not move', () => {
		it('isTransientSqlstate still answers exactly as it did for 23505', () => {
			// The classroom uploader reads this and may not be edited by this
			// bundle. Its behaviour on the code in question is the assertion.
			expect(isTransientSqlstate('23505')).toBe(true);
			expect(rpcErrorStatus('23505')).toBe(503);
			expect(rpcErrorStatus('P0001')).toBe(400);
			expect(rpcErrorStatus(undefined)).toBe(400);
		});

		it('and neither takes the permanent list -- a caller cannot pass one by accident', () => {
			expect(isTransientSqlstate.length).toBe(1);
			expect(rpcErrorStatus.length).toBe(1);
		});
	});
});
