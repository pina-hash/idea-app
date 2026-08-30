// tests/db/maps-fixture.ts
//
// The IDEA Maps chain and the fixture corpus both suites share.
//
// THE ROWS ARE WRITTEN THE WAY THE EDITOR WRITES THEM, NOT WITH `db.sql`.
// 0161's header states the deviation this feature makes from the repo's
// every-write-is-a-definer-RPC default: P1's editor is admin-only and writes
// through the RLS policies directly, with `maps_publish` as the one RPC
// because promote-and-retain has to be atomic. So the fixture inserts as a
// signed-in ADMIN (role `authenticated`, claims set, policies live) and
// publishes through the real `public.maps_publish`. A corpus seeded with the
// owner connection would bypass RLS and every CHECK-predicate grant with it,
// and would then be a corpus the real producer cannot emit -- rule 1 of
// IDEA_VERIFICATION_ADDENDA, which is the rule this repo has broken most.
//
// A DRAFT IS AN OBJECT THAT WAS SIMPLY NEVER PUBLISHED. There is no "set
// status = draft" anywhere here: `status` defaults to 'draft' and only
// `maps_publish` moves it. That is what makes the draft rows in this corpus
// the same thing a real unpublished edit is.
//
// THE CHAIN IS PRODUCTION ORDER, AND 0137 IS NOT LAST IN IT. CLAUDE.md's rule
// that the anon-EXECUTE sweep goes last is about a chain that STOPS at 0137:
// it is a sweep over whatever the migrations above it created. 0161-0163 are
// numbered after it, ship their own `revoke ... from public, anon,
// authenticated` on every function they create, and 0162's public search
// surface is granted to `anon` deliberately -- a grant 0137's keep-list
// predates and would therefore revoke. Applying 0137 after them would model a
// world that does not exist: on production 0137 was applied first and the maps
// files after it. Numeric order IS production order here.
//
// (Rule 28: this chain is a world. What it deliberately leaves out is every
// migration no maps object names -- the classroom, notebook, coin, GAUNTLET
// and Foundry lanes. 0161's only cross-feature dependency is `public.is_admin`
// from 0067, and 0163's is the `storage` schema the stub provides.)

import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

/** Applied in this order. See the header for why 0137 is not last. */
export const MAPS_MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0137_anon_execute_sweep.sql',
	'0161_maps_core.sql',
	'0162_maps_search.sql',
	'0163_maps_media.sql'
] as const;

/** The pinned owner constant from 0067. `is_admin()` self-heals to it. */
export const OWNER_EMAIL = 'apina@boscotech.edu';

/** The four content tables the draft-and-publish machinery covers. */
export const CONTENT_TABLES = [
	'maps_nodes',
	'maps_item_types',
	'maps_items',
	'maps_stock'
] as const;
export type ContentTable = (typeof CONTENT_TABLES)[number];

export interface MapsWorld {
	db: TestDb;
	/** In `app_admins`: writes and publishes. */
	admin: SeededUser;
	/** Signed in, `@boscotech.edu` (so `role = 'teacher'`), NOT an admin. */
	nonAdmin: SeededUser;
	/** node name -> id */
	node: Record<string, string>;
	/** item type name -> id */
	type: Record<string, string>;
	/** item label -> id */
	item: Record<string, string>;
	/** `${typeName}@${nodeName}` -> stock id */
	stock: Record<string, string>;
}

export async function startMapsDb(): Promise<TestDb> {
	return startTestDb(MAPS_MIGRATIONS);
}

/** Publishes one object through the real RPC and refuses a non-ok answer. */
export async function publish(
	db: TestDb,
	admin: SeededUser,
	table: ContentTable,
	id: string
): Promise<Record<string, unknown>> {
	const result = await db.asUser(admin.id, async (q) => {
		const { rows } = await q<{ r: Record<string, unknown> }>(
			'select public.maps_publish($1, $2) as r',
			[table, id]
		);
		return rows[0].r;
	});
	if (result.ok !== true) {
		throw new Error(`maps_publish(${table}, ${id}) refused: ${JSON.stringify(result)}`);
	}
	return result;
}

/**
 * The corpus of spec 5.5: overlapping vocabulary across several item types,
 * aliases that share no token with their canonical name, function-describing
 * tags, brands, part numbers, serials, the same stocked type in more than one
 * place, objects at more than one depth, and a draft of every kind.
 *
 * WHY EACH ADVERSARIAL PIECE IS HERE is stated at the row that carries it, so
 * a later reader can tell a deliberate trap from a row somebody needed.
 */
export async function seedMapsWorld(db: TestDb): Promise<MapsWorld> {
	const admin = await createUser(db, OWNER_EMAIL, 'Site Owner');
	const nonAdmin = await createUser(db, 'staff@boscotech.edu', 'Staff Member');
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		OWNER_EMAIL
	]);

	const node: Record<string, string> = {};
	const type: Record<string, string> = {};
	const item: Record<string, string> = {};
	const stock: Record<string, string> = {};

	const insertNode = async (
		name: string,
		kind: string,
		parent: string | null,
		extra: Record<string, unknown> = {}
	): Promise<string> => {
		const id = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`insert into public.maps_nodes
					(parent_id, kind, name, subtype, description, outline, position_x_in, position_y_in,
					 elevation_order, elevation_h_in, elevation_w_in)
				 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
				 returning id`,
				[
					parent,
					kind,
					name,
					(extra.subtype as string) ?? null,
					(extra.description as string) ?? null,
					extra.outline ? JSON.stringify(extra.outline) : null,
					(extra.x as number) ?? null,
					(extra.y as number) ?? null,
					(extra.elevationOrder as number) ?? null,
					(extra.elevationH as number) ?? null,
					(extra.elevationW as number) ?? null
				]
			);
			return rows[0].id;
		});
		node[name] = id;
		return id;
	};

	// --- The published tree. Depth 1 building, 2 rooms, 3 units, 4 compartments.
	const building = await insertNode('IDEA Building', 'building', null, {
		outline: { kind: 'rect', w: 1200, h: 800 },
		description: 'The main Bosco Tech IDEA building.'
	});
	const machineShop = await insertNode('Machine Shop', 'room', building, {
		outline: { kind: 'rect', w: 400, h: 300 },
		x: 0,
		y: 0
	});
	const millRoom = await insertNode('Mill Room', 'room', building, {
		outline: { kind: 'rect', w: 300, h: 300 },
		x: 400,
		y: 0
	});
	const toolChest = await insertNode('Tool Chest A', 'unit', machineShop, {
		outline: { kind: 'rect', w: 30, h: 18 },
		x: 12,
		y: 12
	});
	const drawerOne = await insertNode('Drawer 1', 'compartment', toolChest, {
		subtype: 'drawer',
		elevationOrder: 1,
		elevationH: 3,
		elevationW: 28
	});
	await insertNode('Drawer 2', 'compartment', toolChest, {
		subtype: 'drawer',
		elevationOrder: 2,
		elevationH: 5,
		elevationW: 28
	});
	const benchCabinet = await insertNode('Bench Cabinet', 'unit', millRoom, {
		outline: { kind: 'rect', w: 36, h: 24 },
		x: 5,
		y: 5
	});

	// THE DRAFT ANCESTOR. `Prototype Lab` is never published; `Lab Cart` under
	// it IS published, which is the case spec 5.2's invoker-security note calls
	// structural -- a published thing under an unpublished room cannot stage a
	// route, so anon must not see it.
	const protoLab = await insertNode('Prototype Lab', 'room', building, {
		outline: { kind: 'rect', w: 200, h: 200 },
		x: 0,
		y: 400
	});
	const labCart = await insertNode('Lab Cart', 'unit', protoLab, {
		outline: { kind: 'rect', w: 24, h: 18 },
		x: 2,
		y: 2
	});

	// A plain draft node of its own, for the draft-invisibility pair.
	const draftRoom = await insertNode('Fabrication Annex', 'room', building, {
		outline: { kind: 'rect', w: 250, h: 250 },
		x: 700,
		y: 0
	});

	for (const id of [
		building,
		machineShop,
		millRoom,
		toolChest,
		drawerOne,
		node['Drawer 2'],
		benchCabinet,
		labCart
	]) {
		await publish(db, admin, 'maps_nodes', id);
	}
	// protoLab and draftRoom stay draft, deliberately.

	const insertType = async (
		name: string,
		fields: {
			aliases?: string[];
			tags?: string[];
			category?: string;
			brand?: string;
			model?: string;
			partNumber?: string;
			description?: string;
		}
	): Promise<string> => {
		const id = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`insert into public.maps_item_types
					(name, aliases, tags, category, brand, model, part_number, description)
				 values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
				[
					name,
					fields.aliases ?? [],
					fields.tags ?? [],
					fields.category ?? null,
					fields.brand ?? null,
					fields.model ?? null,
					fields.partNumber ?? null,
					fields.description ?? null
				]
			);
			return rows[0].id;
		});
		type[name] = id;
		return id;
	};

	// ALIASES THAT SHARE NO TOKEN WITH THE CANONICAL NAME are the whole point
	// of the alias query: "allen wrenches" has no word in common with "Hex Key
	// Set", so a match can only have come through the alias band.
	const hexKeys = await insertType('Hex Key Set', {
		aliases: ['Allen wrenches', 'Allen keys'],
		tags: ['fastening', 'driving'],
		category: 'Hand Tools',
		brand: 'Bondhus',
		model: 'HX-13',
		partNumber: 'BD-10937',
		description: 'Ball end hex driver set, inch sizes.'
	});
	// BRAND AND CATEGORY OVERLAP with the micrometer below, so a brand-only
	// query cannot be satisfied by there being exactly one Mitutoyo thing.
	const caliper = await insertType('Dial Caliper', {
		aliases: ['vernier caliper'],
		tags: ['measuring', 'metrology'],
		category: 'Measurement',
		brand: 'Mitutoyo',
		model: 'CD-6',
		partNumber: '505-742',
		description: 'Six inch dial caliper reading to one thousandth.'
	});
	const micrometer = await insertType('Digital Micrometer', {
		aliases: ['mic'],
		tags: ['measuring', 'metrology'],
		category: 'Measurement',
		brand: 'Mitutoyo',
		model: 'MDC-1',
		partNumber: '293-340',
		description: 'Outside micrometer, zero to one inch.'
	});
	// THE FUNCTION QUERY'S TARGET: nothing in its NAME says aluminium. The only
	// route from "cuts aluminium" to this row is the tag band.
	const bandSaw = await insertType('Horizontal Band Saw', {
		aliases: ['cutoff saw'],
		tags: ['cutting', 'cuts aluminum', 'cuts steel', 'sawing'],
		category: 'Sawing',
		brand: 'DoAll',
		model: 'C-916',
		partNumber: 'DA-C916',
		description: 'Floor standing horizontal band saw for bar and tube stock.'
	});

	// A DRAFT ITEM TYPE, never published.
	const draftType = await insertType('Prototype Widget', {
		aliases: ['secret widget'],
		tags: ['unreleased'],
		category: 'Prototype',
		brand: 'Bosco',
		partNumber: 'PW-0001',
		description: 'Not published.'
	});

	for (const id of [hexKeys, caliper, micrometer, bandSaw]) {
		await publish(db, admin, 'maps_item_types', id);
	}

	const insertItem = async (
		label: string,
		fields: { typeId?: string; nodeId: string; name?: string; serial?: string; notes?: string }
	): Promise<string> => {
		const id = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`insert into public.maps_items (item_type_id, node_id, name, serial, notes)
				 values ($1, $2, $3, $4, $5) returning id`,
				[
					fields.typeId ?? null,
					fields.nodeId,
					fields.name ?? null,
					fields.serial ?? null,
					fields.notes ?? null
				]
			);
			return rows[0].id;
		});
		item[label] = id;
		return id;
	};

	// A UNIQUE ITEM WITH A SERIAL, typeless, so the serial query can only
	// resolve through the item's own band B.
	const mill = await insertItem('Bridgeport Mill', {
		nodeId: millRoom,
		name: 'Bridgeport Series I Mill',
		serial: 'BP-1998-4471',
		notes: 'Knee mill with a digital readout.'
	});
	// A TYPED unique item: its vocabulary is its own plus its type's.
	const shopCaliper = await insertItem('Shop Caliper', {
		typeId: caliper,
		nodeId: drawerOne,
		serial: 'MIT-505-0099'
	});
	// A DRAFT ITEM under a PUBLISHED node, and a PUBLISHED item under the DRAFT
	// room -- the two halves of the draft-exclusion pair.
	const draftItem = await insertItem('Unreleased Gadget', {
		typeId: draftType,
		nodeId: machineShop,
		name: 'Unreleased Gadget',
		serial: 'UG-0001'
	});
	const cartItem = await insertItem('Lab Cart Caliper', {
		typeId: caliper,
		nodeId: labCart,
		serial: 'MIT-505-0100'
	});

	for (const id of [mill, shopCaliper, cartItem]) {
		await publish(db, admin, 'maps_items', id);
	}
	// draftItem stays draft.

	const insertStock = async (
		typeName: string,
		nodeName: string,
		qty: number
	): Promise<string> => {
		const id = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`insert into public.maps_stock (item_type_id, node_id, qty)
				 values ($1, $2, $3) returning id`,
				[type[typeName], node[nodeName], qty]
			);
			return rows[0].id;
		});
		stock[`${typeName}@${nodeName}`] = id;
		return id;
	};

	// THE SAME STOCKED TYPE AT TWO DEPTHS: room (depth 2) and drawer (depth 4).
	// Identical vocabulary, so the two rows score identically and only the
	// shallower-wins tie break of spec 5.2 can order them.
	const hexShallow = await insertStock('Hex Key Set', 'Machine Shop', 2);
	const hexDeep = await insertStock('Hex Key Set', 'Drawer 1', 6);
	// THE SAME STOCKED TYPE IN TWO ROOMS AT EQUAL DEPTH, so the place-narrowed
	// query is decided by the ancestor band alone and not by depth.
	const calMill = await insertStock('Dial Caliper', 'Mill Room', 1);
	const calShop = await insertStock('Dial Caliper', 'Machine Shop', 3);
	const sawStock = await insertStock('Horizontal Band Saw', 'Machine Shop', 1);
	const micStock = await insertStock('Digital Micrometer', 'Bench Cabinet', 2);
	// A DRAFT STOCK ROW under a published node.
	const draftStock = await insertStock('Hex Key Set', 'Bench Cabinet', 4);

	for (const id of [hexShallow, hexDeep, calMill, calShop, sawStock, micStock]) {
		await publish(db, admin, 'maps_stock', id);
	}
	// draftStock stays draft.
	void draftItem;
	void draftStock;
	void draftRoom;

	return { db, admin, nonAdmin, node, type, item, stock };
}

export interface SearchRow {
	result_kind: string;
	result_id: string;
	item_type_id: string | null;
	label: string;
	detail: Record<string, unknown>;
	node_id: string;
	chain: Array<Record<string, unknown>>;
	depth: number;
	score: number;
}

/** `maps_search` as a caller sees it. `userId` null is the anonymous reader. */
export async function search(
	db: TestDb,
	userId: string | null,
	query: string,
	limit = 20
): Promise<SearchRow[]> {
	const run = async (q: Parameters<Parameters<TestDb['asAnon']>[0]>[0]) => {
		const { rows } = await q<SearchRow>('select * from public.maps_search($1, $2)', [
			query,
			limit
		]);
		return rows;
	};
	return userId === null ? db.asAnon(run) : db.asUser(userId, run);
}
