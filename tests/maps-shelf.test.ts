// tests/maps-shelf.test.ts
//
// THE ARITHMETIC BEHIND ITEM ENTRY AT THE SHELF: what a photo is allowed to
// be, where its bytes are named, and which rows an entry turns into. Pure
// functions from `$lib/maps/media` and `$lib/maps/shelf`, over the REAL
// harness fixture the surface itself mounts.
//
// WHERE THE EXPECTED VALUES COME FROM. The photo numbers are read out of
// `supabase/migrations/0163_maps_media.sql` ITSELF at test time -- the bucket's
// `file_size_limit` literal and its `storage_key` CHECK regex -- rather than
// retyped here, because these constants are a MIRROR of that migration and a
// mirror compared against a description proves only that somebody typed the
// description twice (IDEA_VERIFICATION_ADDENDA rule 8). The plan cases are
// derived from spec 4.2's three tables and 0161's named-or-typed rule.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	MAPS_MEDIA_BUCKET,
	MAPS_MEDIA_MAX_BYTES,
	describeBytes,
	mapsImageMime,
	mapsPhotoKey,
	mapsPhotoRefusal,
	mapsPhotoUrl
} from '../src/lib/maps/media';
import {
	mapsExactTypeMatch,
	mapsShelfBlank,
	mapsShelfHasWork,
	mapsShelfPlan,
	mapsShelfProblems,
	mapsTypeSuggestions
} from '../src/lib/maps/shelf';
import { FIX, mapsEditFixture } from '../src/routes/dev/maps-edit/fixture';
import type { MapsNode } from '../src/lib/maps/maps';

const MIGRATION = readFileSync('supabase/migrations/0163_maps_media.sql', 'utf8');

const fixture = () => mapsEditFixture();
const nodeIn = (id: string): MapsNode => {
	const found = fixture().nodes.find((n) => n.id === id);
	if (!found) throw new Error(`fixture has no node ${id}`);
	return found;
};

describe('the photo rules mirror 0163 rather than restating it', () => {
	it('takes its size ceiling from the migration\'s own literal', () => {
		// `insert into storage.buckets (...) values ('maps-media', ..., 20971520, ...)`
		const limit = MIGRATION.match(/values \('maps-media',[^)]*?(\d{6,}),/)?.[1];
		expect(limit).toBeDefined();
		expect(MAPS_MEDIA_MAX_BYTES).toBe(Number(limit));
		// And the bucket name the module uploads to is the one created there.
		expect(MIGRATION).toContain(`'${MAPS_MEDIA_BUCKET}'`);
	});

	it('produces keys the migration\'s own CHECK accepts', () => {
		// The check, read out of 0163 rather than retyped:
		//   storage_key ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
		const source = MIGRATION.match(/storage_key ~ '(\^\[[^']+)'/)?.[1];
		expect(source).toBeDefined();
		const shape = new RegExp(source as string);
		const uuid = '3f6b1c2e-0a4d-4e21-9b77-5c8de1f04a92';
		for (const owner of ['node', 'item_type', 'item'] as const) {
			for (const ext of ['jpg', 'heic', 'png', '', 'JPG!']) {
				const key = mapsPhotoKey(owner, uuid, ext);
				expect(shape.test(key), `${key} must satisfy 0163's key shape`).toBe(true);
				expect(key.includes('..')).toBe(false);
				expect(key.length).toBeLessThanOrEqual(1024);
			}
		}
		expect(mapsPhotoKey('item_type', uuid, 'jpg')).toBe(`type/${uuid}.jpg`);
		expect(mapsPhotoKey('item', uuid, 'HEIC')).toBe(`item/${uuid}.heic`);
		// An extension the resolver could not name still produces a legal key
		// rather than a trailing dot.
		expect(mapsPhotoKey('node', uuid, '')).toBe(`node/${uuid}.img`);
	});
});

describe('the media type an upload declares, which 0163 makes this bundle\'s job', () => {
	it('uses the declared type when the browser gave a usable one', () => {
		expect(mapsImageMime({ name: 'IMG_1.jpg', type: 'image/jpeg' })).toEqual({
			ok: true,
			mimeType: 'image/jpeg',
			ext: 'jpg'
		});
	});

	it('RESOLVES AN EMPTY TYPE FROM THE EXTENSION, which is the iPhone HEIC case', () => {
		// The File API REQUIRES an empty string where the platform cannot
		// determine a type, and an empty type uploads as
		// application/octet-stream, which this bucket refuses. 0163 names this
		// as the case to get right so it is not found in the field.
		expect(mapsImageMime({ name: 'IMG_0042.HEIC', type: '' })).toEqual({
			ok: true,
			mimeType: 'image/heic',
			ext: 'heic'
		});
		expect(mapsImageMime({ name: 'photo.jpeg', type: '' }).ok).toBe(true);
	});

	it('REFUSES AN SVG BY TYPE AND BY EXTENSION, which the bucket\'s wildcard would admit', () => {
		const byType = mapsImageMime({ name: 'x', type: 'image/svg+xml' });
		const byExt = mapsImageMime({ name: 'diagram.svg', type: '' });
		expect(byType.ok).toBe(false);
		expect(byExt.ok).toBe(false);
		// Either spelling can be the only one present, so both directions
		// refuse -- and the sentence says why rather than naming a policy.
		expect(byType.ok === false && byType.problem).toContain('document rather than a photograph');
		// The positive control, in the same read: the wildcard's other members
		// are accepted, so this is a narrowing and not a broken predicate.
		expect(mapsImageMime({ name: 'a.png', type: 'image/png' }).ok).toBe(true);
		expect(mapsImageMime({ name: 'a.avif', type: '' }).ok).toBe(true);
		// And 0163's bucket really is the permissive wildcard this narrows.
		expect(MIGRATION).toContain("array['image/*']");
	});

	it('refuses a non-image, and says what it saw', () => {
		const pdf = mapsImageMime({ name: 'manual.pdf', type: 'application/pdf' });
		expect(pdf.ok).toBe(false);
		expect(pdf.ok === false && pdf.problem).toContain('application/pdf');
		const unknown = mapsImageMime({ name: 'thing', type: '' });
		expect(unknown.ok).toBe(false);
		expect(unknown.ok === false && unknown.problem).toContain('did not say what it is');
	});
});

describe('the refusal happens before a byte moves, and states the size AND the limit', () => {
	it('refuses an over-limit photo with both numbers in the sentence', () => {
		const refusal = mapsPhotoRefusal({ name: 'huge.jpg', type: 'image/jpeg', size: 25 * 1024 * 1024 });
		expect(refusal).not.toBeNull();
		expect(refusal).toContain('25 MB');
		expect(refusal).toContain('20 MB');
		// "too large" with no number is a guessing game (CLAUDE.md).
		expect(refusal).toContain('limit');
	});

	it('accepts a photo one byte under the ceiling and refuses one byte over', () => {
		const under = { name: 'a.jpg', type: 'image/jpeg', size: MAPS_MEDIA_MAX_BYTES };
		const over = { name: 'a.jpg', type: 'image/jpeg', size: MAPS_MEDIA_MAX_BYTES + 1 };
		expect(mapsPhotoRefusal(under)).toBeNull();
		expect(mapsPhotoRefusal(over)).not.toBeNull();
	});

	it('refuses an empty file rather than uploading nothing', () => {
		expect(mapsPhotoRefusal({ name: 'a.jpg', type: 'image/jpeg', size: 0 })).toContain('empty');
	});

	it('describes sizes the way a person reads them', () => {
		expect(describeBytes(20971520)).toBe('20 MB');
		expect(describeBytes(3.4 * 1024 * 1024)).toBe('3.4 MB');
		expect(describeBytes(120 * 1024)).toBe('120 KB');
	});

	it('builds a public object URL, and answers empty rather than a broken one', () => {
		expect(mapsPhotoUrl('https://example-ref.supabase.co', 'item/abc.jpg')).toBe(
			'https://example-ref.supabase.co/storage/v1/object/public/maps-media/item/abc.jpg'
		);
		expect(mapsPhotoUrl('https://example-ref.supabase.co/', 'item/abc.jpg')).toContain(
			'/storage/v1/object/public/maps-media/item/abc.jpg'
		);
		expect(mapsPhotoUrl('', 'item/abc.jpg')).toBe('');
		expect(mapsPhotoUrl('https://x', '')).toBe('');
	});
});

describe('what an entry turns into: the three tables, from one card', () => {
	const drawer = () => nodeIn(FIX.drawer1);
	const types = () => fixture().itemTypes;

	it('a one-off with no vocabulary mints NO item type, and carries its own name', () => {
		const draft = { ...mapsShelfBlank(), name: 'Mystery Fixture Plate' };
		const plan = mapsShelfPlan(draft, drawer(), types());
		expect(plan.steps.map((s) => s.table)).toEqual(['maps_items']);
		// 0161's named-or-typed rule allows it and 0162 indexes `i.name` at
		// weight A, so the thing is findable by what was typed. Minting an
		// empty type per one-off would fill the vocabulary with rows nothing
		// will ever reuse.
		expect(plan.steps[0].content).toMatchObject({
			item_type_id: null,
			node_id: FIX.drawer1,
			name: 'Mystery Fixture Plate',
			serial: null
		});
		expect(plan.photoOwner).toBe('item');
	});

	it('a one-off WITH vocabulary mints the type first and points the item at it', () => {
		const draft = {
			...mapsShelfBlank(),
			name: 'Dial Indicator',
			aliases: ['DTI'],
			tags: ['measuring']
		};
		const plan = mapsShelfPlan(draft, drawer(), types());
		expect(plan.steps.map((s) => s.table)).toEqual(['maps_item_types', 'maps_items']);
		expect(plan.steps[0].content).toMatchObject({
			name: 'Dial Indicator',
			aliases: ['DTI'],
			tags: ['measuring']
		});
		expect(plan.steps[1].usesNewType).toBe(true);
		// A TYPED item takes its name from the type: writing the same string
		// into both is how a later rename leaves a stale copy on every item.
		expect(plan.steps[1].content).toMatchObject({ name: null, node_id: FIX.drawer1 });
	});

	it('"several" ALWAYS mints a type, because stock cannot exist without one', () => {
		const draft = { ...mapsShelfBlank(), name: 'M3 Cap Screw', kind: 'several' as const, qty: 40 };
		const plan = mapsShelfPlan(draft, drawer(), types());
		expect(plan.steps.map((s) => s.table)).toEqual(['maps_item_types', 'maps_stock']);
		expect(plan.steps[1].content).toMatchObject({ node_id: FIX.drawer1, qty: 40 });
		expect(plan.steps[1].usesNewType).toBe(true);
		// 0163 has no stock photos: a stocked placement shows its TYPE's.
		expect(plan.photoOwner).toBe('item_type');
	});

	it('picking an EXISTING type reuses it and mints nothing', () => {
		const draft = { ...mapsShelfBlank(), name: 'Hex Key Set', typeId: FIX.hexKeyType };
		const plan = mapsShelfPlan(draft, drawer(), types());
		expect(plan.steps.map((s) => s.table)).toEqual(['maps_items']);
		expect(plan.steps[0].content).toMatchObject({ item_type_id: FIX.hexKeyType, name: null });
		expect(plan.steps[0].usesNewType).toBeFalsy();
		// A stocked placement of an existing type is one row too.
		const several = mapsShelfPlan(
			{ ...draft, kind: 'several', qty: 4 },
			drawer(),
			types()
		);
		expect(several.steps.map((s) => s.table)).toEqual(['maps_stock']);
		expect(several.steps[0].content).toMatchObject({ item_type_id: FIX.hexKeyType, qty: 4 });
	});

	it('says what the save will make BEFORE it is pressed, from the same function that makes it', () => {
		const plan = mapsShelfPlan(
			{ ...mapsShelfBlank(), name: 'M3 Cap Screw', kind: 'several', qty: 40 },
			drawer(),
			types()
		);
		expect(plan.summary).toBe('40 × M3 Cap Screw in Drawer 1 and a new item type for it.');
	});
});

describe('the refusals a person reads, in their terms', () => {
	it('asks for a container and a name, and nothing else, on a blank card', () => {
		expect(mapsShelfProblems(mapsShelfBlank(), null, [])).toEqual([
			'Choose the container this is going into.',
			'Give it a name.'
		]);
	});

	it('accepts a picked type with no typed name', () => {
		const draft = { ...mapsShelfBlank(), name: '', typeId: FIX.hexKeyType };
		expect(mapsShelfProblems(draft, nodeIn(FIX.drawer1), fixture().itemTypes)).toEqual([]);
	});

	it('refuses a quantity that is not a whole number of things', () => {
		const base = { ...mapsShelfBlank(), name: 'Screw', kind: 'several' as const };
		const drawer = nodeIn(FIX.drawer1);
		expect(mapsShelfProblems({ ...base, qty: 0 }, drawer, [])).toContain(
			'How many are here? It has to be a whole number, at least 1.'
		);
		expect(mapsShelfProblems({ ...base, qty: 1 }, drawer, [])).toEqual([]);
	});

	it('names a type that vanished under the card rather than saving against nothing', () => {
		const draft = { ...mapsShelfBlank(), name: 'x', typeId: 'type-that-was-deleted' };
		expect(mapsShelfProblems(draft, nodeIn(FIX.drawer1), fixture().itemTypes)).toContain(
			'That item type is no longer there. Pick another, or type a new name.'
		);
	});

	it('knows whether there is anything to lose', () => {
		expect(mapsShelfHasWork(mapsShelfBlank(), false)).toBe(false);
		// A staged photo alone is work: the card is empty and the picture is not.
		expect(mapsShelfHasWork(mapsShelfBlank(), true)).toBe(true);
		expect(mapsShelfHasWork({ ...mapsShelfBlank(), tags: ['a'] }, false)).toBe(true);
	});
});

describe('reusing the vocabulary that is already there', () => {
	it('finds a type by its ALIAS, which is the point of aliases', () => {
		// "allen keys" is an alias of Hex Key Set in the fixture; somebody at a
		// drawer types what they call it, not what it was catalogued as.
		expect(mapsTypeSuggestions(fixture().itemTypes, 'allen').map((t) => t.name)).toEqual([
			'Hex Key Set'
		]);
	});

	it('finds a type by its TAG, so a function query lands too', () => {
		expect(mapsTypeSuggestions(fixture().itemTypes, 'cutting').map((t) => t.name)).toEqual([
			'Bandsaw Blade'
		]);
	});

	it('ranks a name that starts with what is typed above one that merely contains it', () => {
		const types = [
			{ ...fixture().itemTypes[0], id: 'a', name: 'Precision Caliper', aliases: [], tags: [] },
			{ ...fixture().itemTypes[0], id: 'b', name: 'Caliper Stand', aliases: [], tags: [] }
		];
		expect(mapsTypeSuggestions(types, 'caliper').map((t) => t.id)).toEqual(['b', 'a']);
	});

	it('answers nothing for an empty query rather than the whole catalogue', () => {
		expect(mapsTypeSuggestions(fixture().itemTypes, '   ')).toEqual([]);
	});

	it('spots a name that would mint a SECOND type with a name one already has', () => {
		expect(mapsExactTypeMatch(fixture().itemTypes, '  hex key set ')?.id).toBe(FIX.hexKeyType);
		expect(mapsExactTypeMatch(fixture().itemTypes, 'Hex Key')).toBeNull();
	});
});
