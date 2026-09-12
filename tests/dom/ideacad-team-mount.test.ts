// tests/dom/ideacad-team-mount.test.ts
//
// THE SECOND WIRE, AND IT IS THE SAME OMISSION `ideacad-mount.test.ts` OPENS ON.
//
// Ledger 0190 built `SharePanel`, `PartsPanel` and `checkout.ts`, proved all
// three on `/dev/ideacad-team`, and mounted none of them: the only route to a
// Blade surface is `ItemDetail.svelte`, which was another lane's file. So
// `0205` and `0207` were applied to production -- fourteen RPCs -- two panels
// were written and tested, and no student could reach any of it. The harness
// proved the PANELS; nothing proved the JOIN, which is exactly the surface
// that was missing.
//
// So every assertion here mounts the REAL `ItemDetail` and asks what a person
// sitting in front of a real classroom item would see. A panel test would pass
// unchanged on the day the mount was deleted.
//
// ---------------------------------------------------------------------------
// A VIEWER IS NEVER SHOWN A CONTROL THAT WILL BE REFUSED, AND THAT IS PROVED
// ON THIS PAGE RATHER THAN ONLY ON THE HARNESS.
// ---------------------------------------------------------------------------
//
// `0205` gives view-only and editor grants and `0207` decides who may hold a
// part; both answers arrive in the payload as `assembly.canWrite` and
// `assembly.isOwner`, and NOTHING in the page or the component re-derives
// either. The read-only direction is therefore asserted here against the same
// three parts as the writable one, and BOTH counts are reported -- zero alone
// is a selector that might simply be wrong, which is this repo's own rule for
// an exclusion sweep.
//
// WHAT THIS FILE DELIBERATELY DOES NOT ASSERT: any width, any ratio, any tap
// target. happy-dom has no layout engine, so every one of those reads zero and
// passes vacuously (`tests/dom/README.md`). Those are measured against a real
// Chromium in `npm run verify:browser`.

import { afterEach, describe, expect, it } from 'vitest';
import ItemDetail from '../../src/lib/classroom/ItemDetail.svelte';
import { SECTION, ITEMS } from '../../src/routes/dev/classroom-split/fixture';
import type { ClassroomItem } from '../../src/lib/classroom/classroom';
import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '$lib/ideacad/blade/materials';
import type { IdeacadAssembly } from '$lib/ideacad/assembly';
import type { IdeacadGrant } from '$lib/ideacad/sharing';
import { IDEACAD_SHARING_UNAVAILABLE } from '$lib/ideacad/sharing';
import { IDEACAD_CHECKOUT_VIEW_ONLY } from '$lib/ideacad/checkout';
import { mountInto, type Mounted } from './mount';

const OWNER = 'ana@boscotech.net';
const MATE = 'luis@boscotech.net';

/**
 * A SCHEMA-4 ASSIGNMENT, built from the split fixture's own published
 * assignment rather than typed out. `ideacadMount` is the one predicate that
 * decides whether a Blade surface renders at all, and it reads
 * `assignment_schema_version === 4`; a hand-written item is a shape the
 * fixture's producer never emits.
 */
const BLADE: ClassroomItem = (() => {
	const found = ITEMS.find((i) => i.kind === 'assignment' && i.published);
	if (!found) throw new Error('the split fixture has no published assignment');
	return { ...found, assignment_schema_version: 4 } as ClassroomItem;
})();

/** The load's payload, which is what `ideacadMount` needs to be non-null. */
const PAYLOAD = {
	document: { id: 'doc-1', active_concept_id: 'c1' },
	concepts: [{ id: 'c1', name: 'Concept 1', features: structuredClone(DEFAULT_BLADE_TREE) }],
	config: DEFAULT_BLADE_CONFIG
};

const part = (id: string, position: number, name: string, heldBy: string | null) => ({
	id,
	documentId: 'doc-1',
	position,
	name,
	conceptId: null,
	heldBy,
	// A hold this instant, so `holdLive` is true and the row is genuinely taken.
	heldAt: heldBy ? new Date().toISOString() : null,
	holdRevision: heldBy ? 1 : 0,
	holdLive: !!heldBy
});

/** Three parts, one of them held by a classmate, which is the mixed case. */
const PARTS = () => [
	part('p1', 1, 'Blade body', MATE),
	part('p2', 2, 'Hub', null),
	part('p3', 3, 'Fastener stack', null)
];

function assembly(over: Partial<IdeacadAssembly> = {}): IdeacadAssembly {
	return {
		documentId: 'doc-1',
		viewer: OWNER,
		isOwner: true,
		canWrite: true,
		holdWindowSeconds: 600,
		holdRevisionTotal: 1,
		parts: PARTS(),
		...over
	} as IdeacadAssembly;
}

const GRANTS: IdeacadGrant[] = [
	{ granteeEmail: MATE, role: 'editor', grantedBy: OWNER, grantedAt: '2026-09-11T17:00:00Z' }
];

/**
 * The team prop exactly as `+page.svelte` builds it. `writable` is what the
 * page derives from `assembly.canWrite` / `assembly.isOwner`, so a fixture
 * flipping the payload flips the callbacks with it -- restating them
 * independently would let this file assert a combination the page cannot
 * produce.
 */
function team(over: { canWrite?: boolean; isOwner?: boolean; sharingReady?: boolean } = {}) {
	const canWrite = over.canWrite ?? true;
	const isOwner = over.isOwner ?? true;
	const sharingReady = over.sharingReady ?? true;
	const asm = assembly({ canWrite, isOwner });
	return {
		role: 'owner' as const,
		ownerEmail: OWNER,
		grants: GRANTS,
		sharingReady,
		onshare: sharingReady ? async () => {} : undefined,
		onunshare: sharingReady ? async () => {} : undefined,
		assembly: asm,
		myPartId: null,
		secondsLeft: null,
		phase: 'idle' as const,
		notice: null,
		teammates: GRANTS.map((g) => g.granteeEmail),
		onclaim: canWrite ? () => {} : undefined,
		onrelease: canWrite ? () => {} : undefined,
		onassign: isOwner ? () => {} : undefined,
		ondismiss: () => {}
	};
}

/** Mount the REAL ItemDetail as a student on a schema-4 assignment. */
function mountBlade(ideacadTeam: unknown, over: Record<string, unknown> = {}): Mounted {
	return mountInto(ItemDetail as never, {
		section: SECTION,
		item: BLADE,
		canManage: false,
		transports: null,
		ideacad: PAYLOAD,
		ideacadTeam,
		...over
	});
}

let open: Mounted[] = [];
const track = (m: Mounted) => {
	open.push(m);
	return m;
};
afterEach(async () => {
	for (const m of open) await m.stop();
	open = [];
});

/* ------------------------------------------------------------------ */
/* The join itself                                                     */
/* ------------------------------------------------------------------ */

describe('the item page mounts both team panels, which is what ledger 0190 could not do', () => {
	it('renders the parts list and the share panel on a real schema-4 assignment', () => {
		const m = track(mountBlade(team()));
		expect(m.all('[data-testid="ideacad-parts"]')).toHaveLength(1);
		expect(m.all('[data-testid="ideacad-share"]')).toHaveLength(1);
		expect(m.all('[data-testid="ideacad-part-row"]')).toHaveLength(3);
	});

	it('puts part checkout ABOVE the editor and sharing BELOW it', () => {
		// The ordering decision this bundle owns, asserted structurally rather
		// than described: which part is mine GATES the modelling, so a student
		// must not have to scroll past the editor to find it.
		const m = track(mountBlade(team()));
		const parts = m.one('[data-testid="ideacad-parts"]');
		const share = m.one('[data-testid="ideacad-share"]');
		const host = m.one('.engine-host');
		const order = Array.from(host.children);
		const iParts = order.findIndex((el) => el.contains(parts));
		const iShare = order.findIndex((el) => el.contains(share));
		expect(iParts).toBeGreaterThanOrEqual(0);
		expect(iShare).toBeGreaterThan(iParts);
		// And the editor sits between them. UNCONDITIONAL: a `if (editor)` guard
		// here would pass vacuously on the day the editor stopped rendering,
		// which is the one thing this ordering claim is about.
		const editor = m.one('[data-testid="ideacad-editor"]');
		const iEditor = order.findIndex((el) => el.contains(editor));
		expect(iEditor).toBeGreaterThan(iParts);
		expect(iEditor).toBeLessThan(iShare);
	});

	it('renders NEITHER panel when the page hands down no team, which is a manager and an unopened document alike', () => {
		const m = track(mountBlade(null));
		expect(m.all('[data-testid="ideacad-parts"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-share"]')).toHaveLength(0);
		// The POSITIVE CONTROL: the surface itself is on screen, so the two
		// zeroes above are an absence rather than a mount that never happened.
		expect(m.all('.engine-host')).toHaveLength(1);
	});

	it('renders the share panel but NO parts list when 0207 is not deployed', () => {
		// `probeIdeacadAssembly` answers unavailable and the page builds no
		// controller, so `assembly` is null. Absence is the mechanism; the
		// sharing half is untouched by it.
		const m = track(mountBlade({ ...team(), assembly: null }));
		expect(m.all('[data-testid="ideacad-parts"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-share"]')).toHaveLength(1);
	});
});

/* ------------------------------------------------------------------ */
/* A viewer is never shown a control that would be refused             */
/* ------------------------------------------------------------------ */

describe('read-only access on the REAL page, both directions on the same three parts', () => {
	/** Every control a part row can offer, counted by what it does. */
	function partControls(m: Mounted) {
		const buttons = m.all<HTMLButtonElement>('[data-testid="ideacad-parts"] button');
		const text = (b: HTMLButtonElement) => (b.textContent ?? '').trim();
		return {
			rows: m.all('[data-testid="ideacad-part-row"]').length,
			take: buttons.filter((b) => /take/i.test(text(b))).length,
			release: buttons.filter((b) => /release/i.test(text(b))).length,
			assign: m.all('[data-testid="ideacad-part-assign"]').length,
			viewOnly: m.target.textContent?.includes(IDEACAD_CHECKOUT_VIEW_ONLY) ?? false
		};
	}

	it('a writable owner gets the controls, which is the positive control', () => {
		const m = track(mountBlade(team()));
		const c = partControls(m);
		expect(c.rows).toBe(3);
		// p1 is held by a classmate, so two of the three are claimable.
		expect(c.take).toBe(2);
		expect(c.assign).toBe(3);
		expect(c.viewOnly).toBe(false);
		expect(m.all('[data-testid="ideacad-share-form"]')).toHaveLength(1);
	});

	it('a view-only caller gets the SAME three rows and no control at all', () => {
		// `canWrite: false` is the database's answer, and it is the only thing
		// that moved: same parts, same document, same mount.
		const m = track(mountBlade(team({ canWrite: false, isOwner: false })));
		const c = partControls(m);
		expect(c.rows).toBe(3);
		expect(c.take).toBe(0);
		expect(c.release).toBe(0);
		expect(c.assign).toBe(0);
		// And it SAYS why, because a list with nothing pressable and no
		// explanation reads as broken rather than as read-only.
		expect(c.viewOnly).toBe(true);
	});

	it('an editor who is not the owner may hold a part and may not reassign one', () => {
		// The middle rung, which a two-state fixture would miss entirely: write
		// and share are two different grants and `0205` keeps them apart.
		const m = track(mountBlade(team({ canWrite: true, isOwner: false })));
		const c = partControls(m);
		expect(c.rows).toBe(3);
		expect(c.take).toBe(2);
		expect(c.assign).toBe(0);
		expect(c.viewOnly).toBe(false);
	});

	it('refuses on the PAYLOAD even when every callback is handed in, which is the layer that matters', () => {
		// THE ONE ASSERTION THAT DOES NOT TRUST THIS FILE'S OWN FIXTURE. Every
		// other case here withholds the callbacks the way `+page.svelte` does,
		// which means it is partly asserting a copy of the page's rule. This one
		// hands ALL FOUR in over a read-only payload -- the state a page bug
		// would produce -- and the controls are still absent, because
		// `partRows` reads `assembly.canWrite` and the picker reads
		// `assembly.isOwner`. Defence in depth, measured rather than argued.
		const m = track(
			mountBlade({
				...team({ canWrite: false, isOwner: false }),
				onclaim: () => {},
				onrelease: () => {},
				onassign: () => {}
			})
		);
		expect(m.all('[data-testid="ideacad-part-row"]')).toHaveLength(3);
		const buttons = m.all<HTMLButtonElement>('[data-testid="ideacad-parts"] button');
		expect(buttons.filter((b) => /take|release/i.test(b.textContent ?? ''))).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-part-assign"]')).toHaveLength(0);
		expect(m.target.textContent).toContain(IDEACAD_CHECKOUT_VIEW_ONLY);
	});

	it('a pre-0205 deployment gets the sentence and no share form', () => {
		const m = track(mountBlade(team({ sharingReady: false })));
		expect(m.all('[data-testid="ideacad-share-form"]')).toHaveLength(0);
		expect(m.target.textContent).toContain(IDEACAD_SHARING_UNAVAILABLE);
		// The parts half is a different migration and is unaffected.
		expect(m.all('[data-testid="ideacad-part-row"]')).toHaveLength(3);
	});
});
