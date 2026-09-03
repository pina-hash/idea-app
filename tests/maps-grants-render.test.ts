// tests/maps-grants-render.test.ts
//
// WHAT A GRANTED EDITOR SEES, AND WHAT THEY DO NOT, asserted from
// `svelte/server` render() markup of the REAL MapsEditor over the REAL harness
// fixture -- rendered output, never source text. A grep of a component's
// source proves only that the source contains a string.
//
// EVERY CLAIM CARRIES BOTH DIRECTIONS WITH COUNTS. "The grantee has no publish
// controls" is not a result; "0 publish panels with a control against 4 on the
// same fixture rendered as an admin" is. The admin render is the positive
// control for every absence below, and it is taken from the SAME fixture in
// the SAME call shape, so the only difference between the two numbers is the
// scope and the transports.
//
// THIS IS THE CONVENIENCE LAYER. The boundary is 0172's RLS policies, driven
// as a real grantee in tests/db/maps-grants-boundary.test.ts. What this file
// asserts is the other half of the same rule: that a control whose only
// possible outcome is a refusal is never put in front of somebody.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import MapsEditor from '../src/lib/maps/MapsEditor.svelte';
import GrantAdmin from '../src/lib/maps/GrantAdmin.svelte';
import { FIX, mapsEditFixture, memoryMapsTransports } from '../src/routes/dev/maps-edit/fixture';
import { mapsGranteeScope, memoryGrantTransports } from '../src/routes/dev/maps-grants/fixture';
import { MAPS_ADMIN_SCOPE, mapsCaps, mapsEditableNodeIds, mapsVisibleNodeIds } from '../src/lib/maps/grants';
import type { MapsEditorScope } from '../src/lib/maps/grants';
import type { MapsSelection as Selection } from '../src/lib/maps/maps';

type Role = 'admin' | 'grantee';

function renderEditor(role: Role, initialSelection: Selection | null = null): string {
	const fixture = mapsEditFixture();
	const full = memoryMapsTransports(fixture);
	// THE GRANTEE'S TRANSPORTS OMIT `publish`, which is how the real route
	// builds them (`mapsTransportsFor`). The absence IS the removal.
	const { publish: _publish, ...withoutPublish } = full;
	void _publish;
	return render(MapsEditor, {
		props: {
			initial: fixture,
			transports: role === 'admin' ? full : withoutPublish,
			initialSelection,
			scope: role === 'admin' ? MAPS_ADMIN_SCOPE : mapsGranteeScope()
		}
	}).body;
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('the publish controls are ABSENT for a grantee, not present and failing', () => {
	it('0 publish buttons for a grantee against a non-zero count for an admin, on four surfaces', () => {
		const surfaces: Array<[string, Selection | null]> = [
			['a draft container', { kind: 'node', id: FIX.drawer2 }],
			['a published container with a staged edit', { kind: 'node', id: FIX.millRoom }],
			['a draft item type', { kind: 'type', id: FIX.bladeType }],
			['a new container', { kind: 'new-node', parentId: FIX.machineShop, presetKind: 'unit' }]
		];
		const report: string[] = [];
		for (const [label, selection] of surfaces) {
			const admin = renderEditor('admin', selection);
			const grantee = renderEditor('grantee', selection);
			// `publish-actions` is the panel's own control row and `&amp; publish`
			// is the Save-and-publish button. NOT a bare `>Publish` -- that is a
			// prefix of `>Published`, the status CHIP, which put five phantom
			// hits on a grantee's page and would have reported a passing gate as
			// broken (or, one render later, the reverse).
			const adminPublish = count(admin, 'publish-actions') + count(admin, '&amp; publish');
			const granteePublish = count(grantee, 'publish-actions') + count(grantee, '&amp; publish');
			report.push(`${label}: admin ${adminPublish}, grantee ${granteePublish}`);
			expect(adminPublish, `${label}: the admin control is the positive control`).toBeGreaterThan(0);
			expect(granteePublish, `${label}: a grantee is offered no publish`).toBe(0);
		}
		console.log('publish controls -- ' + report.join(' | '));
	});

	it('the publish PANEL stays and says who publishes, rather than vanishing', () => {
		// A control absent for a reason says the reason. The state sentence is
		// the half a grantee needs MOST -- it is what tells somebody at a
		// toolbox that what they typed is not on the public map yet.
		const grantee = renderEditor('grantee', { kind: 'node', id: FIX.drawer2 });
		const admin = renderEditor('admin', { kind: 'node', id: FIX.drawer2 });
		expect(count(grantee, 'maps-who-publishes')).toBe(1);
		expect(count(admin, 'maps-who-publishes')).toBe(0);
		expect(grantee).toContain('A site admin publishes this');
		// And the panel itself is on both, so the state is still stated.
		expect(count(grantee, 'publish-panel')).toBeGreaterThan(0);
		expect(count(admin, 'publish-panel')).toBeGreaterThan(0);
	});

	it('the subtree publish plan is absent for a grantee and present for an admin', () => {
		const selection: Selection = { kind: 'node', id: FIX.machineShop };
		expect(count(renderEditor('admin', selection), 'maps-subtree-publish')).toBe(1);
		expect(count(renderEditor('grantee', selection), 'maps-subtree-publish')).toBe(0);
	});
});

describe('scope: what a grantee may edit, and what they may only read', () => {
	it('a container INSIDE the grant is editable; one OUTSIDE is read-only, with the reason', () => {
		const inside = renderEditor('grantee', { kind: 'node', id: FIX.drawer2 });
		const outside = renderEditor('grantee', { kind: 'node', id: FIX.protoLab });
		// Inside: a save, an add-child section, no refusal note.
		expect(count(inside, 'Save draft')).toBe(1);
		expect(count(inside, 'maps-add-child')).toBe(1);
		expect(count(inside, 'maps-readonly-note')).toBe(0);
		// Outside: no save, no add-child, and the reason in words.
		expect(count(outside, 'Save draft')).toBe(0);
		expect(count(outside, 'maps-add-child')).toBe(0);
		expect(count(outside, 'maps-readonly-note')).toBe(1);
		console.log(
			`scope -- inside: 1 save / 1 add-child / 0 notes; outside: 0 / 0 / 1 note`
		);
	});

	it('a PUBLISHED container inside the grant is read-only too: the draft ceiling', () => {
		// Drawer 1 is inside Machine Shop AND published. Scope alone is not
		// enough, which is the half a subtree-only check would get wrong.
		const html = renderEditor('grantee', { kind: 'node', id: FIX.drawer1 });
		expect(count(html, 'Save draft')).toBe(0);
		expect(count(html, 'Save (not public yet)')).toBe(0);
		expect(count(html, 'maps-readonly-note')).toBe(1);
		// Positive control: the same node, same fixture, as an admin.
		const admin = renderEditor('admin', { kind: 'node', id: FIX.drawer1 });
		expect(count(admin, 'Save (not public yet)')).toBe(1);
		expect(count(admin, 'maps-readonly-note')).toBe(0);
	});

	it('the root add controls are absent for a grantee: a subtree grant never reaches the root', () => {
		expect(count(renderEditor('admin'), 'maps-add-root')).toBe(1);
		expect(count(renderEditor('grantee'), 'maps-add-root')).toBe(0);
	});

	it('the scope is stated in words, by PATH, before anything is touched', () => {
		const grantee = renderEditor('grantee');
		expect(count(grantee, 'maps-scope-note')).toBe(1);
		// The containment path, never a uuid. A uuid on this line would be
		// unreadable and is the thing mapsNodePath exists to prevent.
		expect(grantee).toContain('IDEA Building / Machine Shop');
		expect(grantee).not.toContain(FIX.machineShop);
		expect(count(renderEditor('admin'), 'maps-scope-note')).toBe(0);
	});

	it('the tree hides drafts outside the grant and keeps the ancestor spine', () => {
		const grantee = renderEditor('grantee');
		const admin = renderEditor('admin');
		// The spine and the subtree.
		expect(grantee).toContain('IDEA Building');
		expect(grantee).toContain('Machine Shop');
		expect(grantee).toContain('Drawer 2');
		// Mill Room is PUBLISHED, so everyone reads it -- 0161's public read,
		// which is not this tier's doing and must not be read as one.
		expect(grantee).toContain('Mill Room');
		// Prototype Lab is a DRAFT outside the grant: the real exclusion.
		expect(admin).toContain('Prototype Lab');
		expect(grantee).not.toContain('Prototype Lab');
		const adminRows = count(admin, 'tree-row');
		const granteeRows = count(grantee, 'tree-row');
		console.log(`tree rows -- admin ${adminRows}, grantee ${granteeRows}`);
		expect(granteeRows).toBeLessThan(adminRows);
		expect(granteeRows).toBeGreaterThan(0);
	});
});

describe('the grant console', () => {
	it('renders the roster by containment path, never by uuid', () => {
		const fixture = mapsEditFixture();
		const html = render(GrantAdmin, {
			props: { nodes: fixture.nodes, transports: memoryGrantTransports() }
		}).body;
		expect(html).toContain('maps-grant-form');
		expect(html).toContain('maps-grant-email');
		expect(html).toContain('maps-grant-node');
		// The picker's options are paths.
		expect(html).toContain('IDEA Building / Machine Shop');
		// No raw node id anywhere a person reads. The <option value> carries
		// one by necessity; the LABELS must not.
		const labels = html.split('<option value="').slice(1).map((s) => s.split('</option>')[0]);
		const idsInLabels = labels.filter((l) => l.split('>')[1]?.includes(FIX.machineShop));
		expect(idsInLabels).toEqual([]);
	});
});

describe('the pure scope arithmetic', () => {
	const nodes = mapsEditFixture().nodes;
	const scope: MapsEditorScope = mapsGranteeScope();

	it('a grant covers its whole subtree and nothing above or beside it', () => {
		const editable = mapsEditableNodeIds(nodes, scope);
		expect(editable).not.toBeNull();
		const ids = editable as ReadonlySet<string>;
		// The granted node, and every depth below it.
		for (const id of [FIX.machineShop, FIX.toolChest, FIX.drawer1, FIX.drawer2, FIX.workbench]) {
			expect(ids.has(id), `${id} is inside the grant`).toBe(true);
		}
		// The ancestor and the siblings.
		for (const id of [FIX.building, FIX.millRoom, FIX.protoLab]) {
			expect(ids.has(id), `${id} is outside the grant`).toBe(false);
		}
		console.log(`editable ids -- ${ids.size} of ${nodes.length} nodes`);
	});

	it('an admin is NO LIMIT (null), which is not the same as an empty set', () => {
		// Conflating the two hands an admin an empty editor, which is the
		// failure this distinction exists to prevent.
		expect(mapsEditableNodeIds(nodes, MAPS_ADMIN_SCOPE)).toBeNull();
		expect(mapsVisibleNodeIds(nodes, MAPS_ADMIN_SCOPE)).toBeNull();
		expect(mapsEditableNodeIds(nodes, { admin: false, grants: [] })?.size).toBe(0);
	});

	it('visibility adds the ancestor spine and every published node, editability does not', () => {
		const editable = mapsEditableNodeIds(nodes, scope) as ReadonlySet<string>;
		const visible = mapsVisibleNodeIds(nodes, scope) as ReadonlySet<string>;
		expect(visible.has(FIX.building)).toBe(true); // the spine
		expect(editable.has(FIX.building)).toBe(false); // but not writable
		expect(visible.has(FIX.protoLab)).toBe(false); // a draft outside: neither
	});

	it('the draft ceiling and the publish rule are separate answers', () => {
		const caps = mapsCaps(nodes, scope);
		const drawer1 = nodes.find((n) => n.id === FIX.drawer1)!;
		const drawer2 = nodes.find((n) => n.id === FIX.drawer2)!;
		expect(drawer1.status).toBe('published');
		expect(drawer2.status).toBe('draft');
		expect(caps.canEditNode(drawer1)).toBe(false); // in scope, but public
		expect(caps.canEditNode(drawer2)).toBe(true); // in scope, and draft
		expect(caps.canEditAt(FIX.drawer1)).toBe(true); // a DRAFT item may go in it
		expect(caps.canPublish).toBe(false);
		expect(mapsCaps(nodes, MAPS_ADMIN_SCOPE).canPublish).toBe(true);
	});
});
