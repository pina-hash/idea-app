// tests/dom/ideacad-shared-mount.test.ts
//
// THE THIRD WIRE, AND THE LAST ONE BETWEEN DECISION 24 AND A WORKING FEATURE.
//
// `0205` shipped `ideacad_shared_with_me` and `ideacad_open_shared_document`.
// Ledger 0190 built the panel a student GRANTS from, ledger 0195 mounted it,
// and ledger 0201 built every remaining piece -- `shared-open.ts`,
// `SharedDocuments.svelte`, `store.openShared`, `refuseWrite` -- and could mount
// NONE of it, because `ItemDetail.svelte` was outside its Owns. So for three
// days the grant was live, the surface existed, every part of it was tested,
// and a student still could not reach a document a classmate had shared with
// them: `ideacad_shared_with_me` is a grantee's ONLY route to a document id,
// since the roster is teacher-only and a classmate's document appears on no
// surface they can already read.
//
// A PANEL TEST PASSES UNCHANGED ON THE DAY THE MOUNT IS DELETED, which is
// exactly the state this file was written to end. So every assertion here
// mounts the REAL `ItemDetail` on a real schema-4 assignment and asks what a
// student sitting in front of a classroom item would see.
//
// ---------------------------------------------------------------------------
// THE VIEWER CASE IS PROVED AGAINST THE PAYLOAD, NEVER AGAINST A MISSING
// CALLBACK.
// ---------------------------------------------------------------------------
//
// Ledger 0195's shape, and ledgers 0201 and 0211 both kept it. A wiring mistake
// hands every callback down regardless, so a proof resting on absence cannot
// see the case that matters. The read-only cases here therefore hand in a FULL
// `IdeacadEditorWrites` -- every one of the nine, plus `undo` and `redo` -- over
// a payload whose `role` is `viewer`, and the write controls must still be
// absent, because the gate is `canWrite` and not what was passed.
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
import type { IdeacadHistoryRow } from '$lib/ideacad/history';
import type { IdeacadDocumentRole, IdeacadSharedDocument } from '$lib/ideacad/sharing';
import {
	IDEACAD_SHARED_ACCESS_LOST,
	IDEACAD_SHARED_HEADING,
	IDEACAD_SHARED_UNAVAILABLE,
	ideacadSharedOff,
	ideacadSharedOn,
	ideacadSharedRows
} from '$lib/ideacad/shared-open';
import { mountInto, type Mounted } from './mount';

const ME = 'ana@boscotech.net';
const MATE = 'luis@boscotech.net';
const OTHER = 'zoe@boscotech.net';
const MINE_DOC = 'doc-mine';
const SHARED_DOC = 'doc-luis';

/**
 * A SCHEMA-4 ASSIGNMENT, built from the split fixture's own published
 * assignment rather than typed out -- `ideacadMount` reads
 * `assignment_schema_version === 4`, and a hand-written item is a shape the
 * fixture's producer never emits.
 */
const BLADE: ClassroomItem = (() => {
	const found = ITEMS.find((i) => i.kind === 'assignment' && i.published);
	if (!found) throw new Error('the split fixture has no published assignment');
	return { ...found, assignment_schema_version: 4 } as ClassroomItem;
})();

/** The LOAD's payload: this student's OWN document, which is what the manager
 *  arm renders and what a viewer's mount must NOT fall back to. */
const PAYLOAD = {
	document: { id: MINE_DOC, active_concept_id: 'c1' },
	concepts: [{ id: 'c1', name: 'My concept', features: structuredClone(DEFAULT_BLADE_TREE) }],
	config: DEFAULT_BLADE_CONFIG
};

/**
 * A two-row action log, built through the real row shape. `origin` plus one
 * `set` is enough for `buildTimeline` to have something to count, which is all
 * this file asks of it -- the timeline's own arithmetic is
 * `ideacad-timeline-mount.test.ts`'s subject and is not re-proved here.
 */
const LOG: IdeacadHistoryRow[] = [
	{
		seq: 0,
		kind: 'origin',
		path: '',
		before: null,
		after: structuredClone(DEFAULT_BLADE_TREE),
		actor: MATE,
		at: '2026-09-13T15:00:00Z'
	},
	{
		seq: 1,
		kind: 'set',
		path: '/name',
		before: 'Blade',
		after: 'Blade v2',
		actor: ME,
		at: '2026-09-13T15:04:00Z'
	}
];

/**
 * The store's snapshot for a document that is OPEN, shaped exactly as
 * `createIdeacadStore` publishes it. `canWrite` is written out rather than
 * derived from the role, because a payload that contradicts itself is a state
 * the store itself guards against and this file has to be able to produce one.
 */
function snapshot(over: {
	documentId?: string;
	role?: IdeacadDocumentRole | null;
	canWrite?: boolean;
	accessLost?: boolean;
	history?: IdeacadHistoryRow[];
} = {}) {
	const documentId = over.documentId ?? SHARED_DOC;
	const role = over.role === undefined ? ('editor' as const) : over.role;
	return {
		itemId: BLADE.id,
		document: { id: documentId, item_id: BLADE.id, active_concept_id: 'k1' },
		concepts: [
			{
				id: 'k1',
				name: 'Their concept',
				features: structuredClone(DEFAULT_BLADE_TREE),
				committed_at: null
			}
		],
		activeConceptId: 'k1',
		prediction: null,
		config: DEFAULT_BLADE_CONFIG,
		phase: over.accessLost ? ('conflict' as const) : ('saved' as const),
		error: over.accessLost ? IDEACAD_SHARED_ACCESS_LOST : null,
		conflictedServerConcept: null,
		role,
		canWrite: over.canWrite ?? (role === 'owner' || role === 'editor'),
		accessLost: over.accessLost ?? false,
		historyReady: true,
		history: over.history ?? LOG,
		canUndo: true,
		canRedo: true
	};
}

/**
 * EVERY WRITE, HANDED IN UNCONDITIONALLY. This is the fixture the read-only
 * cases use, and it is the whole point of them: a page bug hands all of these
 * down whatever the role is, so a proof that withheld them would be asserting a
 * copy of the page's rule rather than the component's own gate.
 */
const ALL_WRITES = {
	edit: () => {},
	create: async () => ({ id: 'k2', name: 'new' }),
	rename: async () => {},
	reposition: async () => {},
	remove: async () => ({ activeConceptId: 'k1' }),
	activate: async () => {},
	setPrediction: async () => ({}),
	commit: async () => ({}),
	undo: async () => {},
	redo: async () => {}
};

/** `ideacad_shared_with_me`'s own row shape, put through the shipped shaper so
 *  the order and the labels are the ones a student actually sees. */
const SHARED: IdeacadSharedDocument[] = [
	{
		documentId: SHARED_DOC,
		ownerEmail: MATE,
		role: 'editor',
		grantedAt: '2026-09-12T10:00:00Z',
		updatedAt: '2026-09-12T10:00:00Z'
	} as IdeacadSharedDocument,
	{
		documentId: 'doc-zoe',
		ownerEmail: OTHER,
		role: 'viewer',
		grantedAt: '2026-09-12T11:00:00Z',
		updatedAt: '2026-09-12T11:00:00Z'
	} as IdeacadSharedDocument
];

/** The shared prop exactly as `+page.svelte` builds it. */
function shared(
	over: {
		rows?: IdeacadSharedDocument[];
		ready?: boolean;
		openDocumentId?: string | null;
		accessLost?: boolean;
		onopen?: ((documentId: string) => void) | undefined;
		onreturn?: (() => void) | undefined;
		omitReturn?: boolean;
	} = {}
) {
	const ready = over.ready ?? true;
	return {
		rows: ideacadSharedRows(over.rows ?? SHARED),
		capability: ready ? ideacadSharedOn() : ideacadSharedOff(),
		openDocumentId: over.openDocumentId ?? null,
		accessLost: over.accessLost ?? false,
		busy: false,
		onopen: 'onopen' in over ? over.onopen : ready ? () => {} : undefined,
		onreturn: over.omitReturn ? undefined : (over.onreturn ?? (() => {}))
	};
}

/**
 * The team prop as `+page.svelte` builds it, with the role read off the STORE
 * rather than hardcoded -- which is the fix this bundle made on that page. A
 * literal `'owner'` there would have put a share form under a document the
 * caller does not own.
 */
function team(role: IdeacadDocumentRole | null) {
	return {
		role,
		ownerEmail: ME,
		grants: [],
		sharingReady: true,
		onshare: async () => {},
		onunshare: async () => {},
		assembly: null,
		myPartId: null,
		secondsLeft: null,
		phase: 'idle' as const,
		notice: null,
		teammates: []
	};
}

/** Mount the REAL ItemDetail as a student on a schema-4 assignment. */
function mountBlade(over: Record<string, unknown> = {}): Mounted {
	return mountInto(ItemDetail as never, {
		section: SECTION,
		item: BLADE,
		canManage: false,
		transports: null,
		ideacad: PAYLOAD,
		ideacadViewerEmail: ME,
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

describe('the item page mounts the shared list, which is what ledger 0201 could not do', () => {
	it('renders the panel and both rows on a real schema-4 assignment', () => {
		const m = track(mountBlade({ ideacadShared: shared() }));
		expect(m.all('[data-testid="ideacad-shared"]')).toHaveLength(1);
		expect(m.all('[data-testid="ideacad-shared-row"]')).toHaveLength(2);
		expect(m.all('[data-testid="ideacad-shared-open"]')).toHaveLength(2);
		expect(m.target.textContent).toContain(IDEACAD_SHARED_HEADING);
	});

	it('renders NOTHING when the page hands down no shared prop, which is a manager and a page with no IdeaCAD item alike', () => {
		const m = track(mountBlade({ ideacadShared: null }));
		expect(m.all('[data-testid="ideacad-shared"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-shared-row"]')).toHaveLength(0);
		// THE POSITIVE CONTROL: the surface itself is on screen, so the two
		// zeroes above are an absence rather than a mount that never happened.
		expect(m.all('.engine-host')).toHaveLength(1);
	});

	it('sits BELOW the editor and ABOVE the share panel', () => {
		// The ordering decision this bundle owns, asserted structurally rather
		// than described. Inbound before outbound, and neither above a student's
		// own work -- the empty list is the normal case and must not push the
		// editor down to say nothing.
		const m = track(
			mountBlade({
				ideacadShared: shared(),
				ideacadTeam: {
					role: 'owner',
					ownerEmail: ME,
					grants: [],
					sharingReady: true,
					assembly: null,
					myPartId: null,
					secondsLeft: null,
					phase: 'idle',
					notice: null,
					teammates: []
				}
			})
		);
		const host = m.one('.engine-host');
		const order = Array.from(host.children);
		const at = (sel: string) => {
			const el = m.one(sel);
			return order.findIndex((child) => child.contains(el));
		};
		const iEditor = at('[data-testid="ideacad-editor"]');
		const iShared = at('[data-testid="ideacad-shared"]');
		const iShare = at('[data-testid="ideacad-share"]');
		expect(iEditor).toBeGreaterThanOrEqual(0);
		expect(iShared).toBeGreaterThan(iEditor);
		expect(iShare).toBeGreaterThan(iShared);
	});

	it('does NOT mount the Sharing panel on a classmate\'s document, because it would say one thing twice', () => {
		// `ideacadCanShare` is true for `owner` alone, so on a shared document
		// `SharePanel` can only render a heading, a role chip and
		// `IDEACAD_ROLE_NOTES.editor` -- which is BYTE-IDENTICAL to the note the
		// shared row for the same document renders just above it, and which the
		// banner says a third time. Found by rasterizing this mount at 1440.
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'editor' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC }),
				ideacadTeam: team('editor')
			})
		);
		expect(m.all('[data-testid="ideacad-share"]')).toHaveLength(0);
		// The two surfaces that DO own the role and its note are still there,
		// which is what makes the removal a de-duplication rather than a loss.
		expect(m.all('[data-testid="ideacad-reading-shared"]')).toHaveLength(1);
		expect(m.all('[data-testid="ideacad-shared-rolenote"]')).toHaveLength(1);
	});

	it('DOES mount it on the caller\'s own document, which is the positive control', () => {
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ documentId: MINE_DOC, role: 'owner' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: MINE_DOC }),
				ideacadTeam: team('owner')
			})
		);
		expect(m.all('[data-testid="ideacad-share"]')).toHaveLength(1);
		expect(m.all('[data-testid="ideacad-share-form"]')).toHaveLength(1);
	});

	it('is mounted independently of the team prop, because they are two migrations', () => {
		// A deployment can answer 0205's list and not 0207's assembly, and a
		// student can have something shared with them on an item whose own
		// document has not opened. One `{#if}` covering both would let each
		// absence hide the other.
		const m = track(mountBlade({ ideacadShared: shared(), ideacadTeam: null }));
		expect(m.all('[data-testid="ideacad-shared"]')).toHaveLength(1);
		expect(m.all('[data-testid="ideacad-share"]')).toHaveLength(0);
	});
});

/* ------------------------------------------------------------------ */
/* The ladder, and the empty list                                      */
/* ------------------------------------------------------------------ */

describe('a deployment that cannot ask says so, and never answers "nothing is shared"', () => {
	it('renders the ladder sentence and no rows before 0205', () => {
		const m = track(mountBlade({ ideacadShared: shared({ ready: false }) }));
		expect(m.all('[data-testid="ideacad-shared-unavailable"]')).toHaveLength(1);
		expect(m.target.textContent).toContain(IDEACAD_SHARED_UNAVAILABLE);
		expect(m.all('[data-testid="ideacad-shared-row"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-shared-open"]')).toHaveLength(0);
		// And no COUNT, which is the defect rasterizing caught in ledger 0201:
		// a confident number two lines above a sentence saying the question
		// could not be asked.
		expect(m.all('[data-testid="ideacad-shared-summary"]')).toHaveLength(0);
	});

	it('an empty list is a normal state with its own sentence, not the ladder sentence', () => {
		const m = track(mountBlade({ ideacadShared: shared({ rows: [] }) }));
		expect(m.all('[data-testid="ideacad-shared-empty"]')).toHaveLength(1);
		expect(m.all('[data-testid="ideacad-shared-unavailable"]')).toHaveLength(0);
		expect(m.target.textContent).not.toContain('0 documents');
	});

	it('the summary counts the list when the deployment could answer, which is the positive control for both zeroes above', () => {
		const m = track(mountBlade({ ideacadShared: shared() }));
		const chip = m.one('[data-testid="ideacad-shared-summary"]');
		expect(chip.textContent).toContain('2 documents shared with you');
		expect(chip.textContent).toContain('1 you can edit');
		expect(chip.textContent).toContain('1 to look at');
	});
});

/* ------------------------------------------------------------------ */
/* A viewer is never shown a control that would be refused             */
/* ------------------------------------------------------------------ */

describe('the editor a shared document opens into, both directions on one seed', () => {
	/** What the editor is offering, counted by what it does. */
	function editorControls(m: Mounted) {
		const buttons = m.all<HTMLButtonElement>('[data-testid="ideacad-editor"] button');
		const label = (b: HTMLButtonElement) => (b.textContent ?? '').trim();
		return {
			editors: m.all('[data-testid="ideacad-editor"]').length,
			undo: buttons.filter((b) => label(b) === 'Undo').length,
			redo: buttons.filter((b) => label(b) === 'Redo').length,
			history: m.all('[data-testid="ideacad-history-toggle"]').length,
			// ACCEPT/CANCEL IS THE CONTROL `readOnly` OWNS ALONE. Undo and Redo
			// are gated on BOTH the withheld transport and `readOnly`, so counting
			// only those would make one of the two layers invisible to this file
			// -- and a redundant check nothing can observe is one somebody deletes
			// as dead. `{#if !readOnly && !editing}` is the footer's whole gate.
			accept: buttons.filter((b) => /^✓/.test(label(b))).length,
			// The concept name the editor actually opened, which is the one thing
			// that says WHICH document is on screen.
			heading: m.one('[data-testid="ideacad-editor"] h2').textContent?.trim() ?? ''
		};
	}

	it('an EDITOR grant gets the writable editor over the shared document, which is the positive control', () => {
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'editor' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC })
			})
		);
		const c = editorControls(m);
		expect(c.editors).toBe(1);
		expect(c.undo).toBe(1);
		expect(c.redo).toBe(1);
		expect(c.accept).toBe(1);
		// The SHARED document is on screen, not the load payload's own concept.
		expect(c.heading).toBe('Their concept');
	});

	it('a VIEWER grant gets the same document read-only WITH EVERY CALLBACK HANDED IN, which is the layer that matters', () => {
		// THE ONE ASSERTION THAT DOES NOT TRUST THIS FILE'S OWN FIXTURE. The
		// writes object is byte-identical to the writable case above; the only
		// thing that moved is the DATABASE's answer in the payload.
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'viewer' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC })
			})
		);
		const c = editorControls(m);
		expect(c.editors).toBe(1);
		expect(c.undo).toBe(0);
		expect(c.redo).toBe(0);
		// THE SECOND LAYER, MEASURED SEPARATELY. Undo and Redo go when the
		// transports are withheld; Accept and Cancel go only because `readOnly`
		// is set. Both are asserted so neither layer can be opened unnoticed.
		expect(c.accept).toBe(0);
		// And it is STILL the shared document, not a fallback to the student's
		// own payload -- which is the trap the manager arm would have been.
		expect(c.heading).toBe('Their concept');
	});

	it('a payload that contradicts itself opens read-only, because a control whose only outcome is a refusal is not offered', () => {
		// role `editor` with `canWrite` false is what a future role, or a bad
		// deploy, produces. "Cannot tell" must never render as the permissive
		// answer.
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'editor', canWrite: false }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC })
			})
		);
		const c = editorControls(m);
		expect(c.undo).toBe(0);
		expect(c.accept).toBe(0);
	});

	it('a role this build does not know opens read-only too', () => {
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: null, canWrite: false }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC })
			})
		);
		const c = editorControls(m);
		expect(c.undo).toBe(0);
		expect(c.accept).toBe(0);
	});

	it('the caller\'s OWN document is unchanged by any of this', () => {
		// `open` publishes `role: 'owner'` and can publish nothing else, so the
		// one arm that existed before this bundle must still be the one taken.
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ documentId: MINE_DOC, role: 'owner' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: MINE_DOC })
			})
		);
		const c = editorControls(m);
		expect(c.undo).toBe(1);
		expect(c.redo).toBe(1);
		expect(c.accept).toBe(1);
	});
});

/* ------------------------------------------------------------------ */
/* Decision 27: the timeline reaches a shared document                 */
/* ------------------------------------------------------------------ */

describe('a shared document opened through this mount reaches the attributed timeline (decision 27)', () => {
	const openTimeline = (m: Mounted) => {
		m.one<HTMLButtonElement>('[data-testid="ideacad-history-toggle"]').click();
	};

	it('an editor on a classmate\'s document gets the timeline, with both people named', async () => {
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'editor' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC })
			})
		);
		openTimeline(m);
		await Promise.resolve();
		expect(m.all('[data-testid="ideacad-timeline"]')).toHaveLength(1);
		const text = m.one('[data-testid="ideacad-timeline"]').textContent ?? '';
		// TWO REAL EDITORS ON ONE SHARED DOCUMENT, which is the case ledger 0211
		// named as never having been driven and which only this mount makes
		// reachable. `timelineActors` resolves the reader to "You" and the other
		// person to their local part.
		expect(text).toContain('You');
		expect(text).toContain('luis');
		expect(text).not.toContain(ME);
	});

	it('a VIEWER gets the timeline and no undo, because reading a history is not writing to one', async () => {
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'viewer' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC })
			})
		);
		expect(m.all('[data-testid="ideacad-history-toggle"]')).toHaveLength(1);
		openTimeline(m);
		await Promise.resolve();
		expect(m.all('[data-testid="ideacad-timeline"]')).toHaveLength(1);
		expect(m.all('[data-testid="ideacad-timeline-undo"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-timeline-redo"]')).toHaveLength(0);
	});

	it('a deployment with no log renders no timeline at all, which is the control for both counts above', () => {
		const m = track(
			mountBlade({
				ideacadDoc: { ...snapshot({ role: 'editor' }), historyReady: false, history: [] },
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC })
			})
		);
		expect(m.all('[data-testid="ideacad-history-toggle"]')).toHaveLength(0);
	});
});

/* ------------------------------------------------------------------ */
/* The revoked grant reaches the page                                  */
/* ------------------------------------------------------------------ */

describe('a grant removed mid-session is rendered, which is what 0201 chose shared_with_me for', () => {
	it('the terminal notice is on the page, and the open row stops claiming its role', () => {
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'editor', canWrite: false, accessLost: true }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC, accessLost: true })
			})
		);
		expect(m.all('[data-testid="ideacad-shared-access-lost"]')).toHaveLength(1);
		expect(m.target.textContent).toContain(IDEACAD_SHARED_ACCESS_LOST);
		// The row is REPLACED rather than softened: no role chip it can no
		// longer stand behind, no Open-now mark, no control.
		expect(m.all('[data-testid="ideacad-shared-row-lost"]')).toHaveLength(1);
		expect(m.all('[data-testid="ideacad-shared-current"]')).toHaveLength(0);
		// And no count, for the same reason one level up.
		expect(m.all('[data-testid="ideacad-shared-summary"]')).toHaveLength(0);
	});

	it('the SAME fixture with the grant intact says all three of those things, which is the positive control', () => {
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'editor' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC })
			})
		);
		expect(m.all('[data-testid="ideacad-shared-access-lost"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-shared-row-lost"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-shared-current"]')).toHaveLength(1);
		expect(m.all('[data-testid="ideacad-shared-summary"]')).toHaveLength(1);
	});

	it('the save chip does not say "Changed elsewhere" when it was the ACCESS that changed', () => {
		// `store.ts` reuses `phase: 'conflict'` because the CONSEQUENCE is
		// identical, and `shared-open.ts` gives the state its own SENTENCE for
		// exactly this reason: nothing changed elsewhere, the access did. The
		// one-word chip was still reading the phase, so the editor header claimed
		// "Changed elsewhere" 1200px above a notice saying the access was removed
		// (measured at 375). Both claims present, both clearing contrast, and
		// nothing compares two claims for agreement.
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'editor', canWrite: false, accessLost: true }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC, accessLost: true })
			})
		);
		const header = m.one('[data-testid="ideacad-editor"] header').textContent ?? '';
		expect(header).toContain('Not saved');
		expect(header).not.toContain('Changed elsewhere');
	});

	it('and it DOES say "Changed elsewhere" for an ordinary stale revision, which is the positive control', () => {
		// The phase word is not deleted, it is answered differently for one
		// cause. A conflict with no access loss still reads as it always has.
		const m = track(
			mountBlade({
				ideacadDoc: { ...snapshot({ role: 'editor' }), phase: 'conflict' as const },
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC })
			})
		);
		expect(m.one('[data-testid="ideacad-editor"] header').textContent ?? '').toContain(
			'Changed elsewhere'
		);
	});

	it('the EDITOR is not swapped out under the student, because that would destroy the refused edit', () => {
		// THE SUBTLE ONE. `store.ts` takes `canWrite` false with `accessLost`, so
		// a branch keyed on `canWrite` alone would unmount the writable editor at
		// exactly the moment a write was refused and re-seed from the last SAVED
		// state -- silently losing the work `IDEACAD_SHARED_ACCESS_LOST` promises
		// in words is still on screen. The floor is `store.ts`'s `refuseWrite`,
		// which throws that same sentence at every press.
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'editor', canWrite: false, accessLost: true }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC, accessLost: true })
			})
		);
		const buttons = m.all<HTMLButtonElement>('[data-testid="ideacad-editor"] button');
		expect(buttons.filter((b) => (b.textContent ?? '').trim() === 'Undo')).toHaveLength(1);
	});
});

/* ------------------------------------------------------------------ */
/* The way back out                                                    */
/* ------------------------------------------------------------------ */

describe('opening a classmate\'s document is not a one-way door', () => {
	it('says whose document is on screen and offers the way back', () => {
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'editor' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC })
			})
		);
		const line = m.one('[data-testid="ideacad-reading-shared"]');
		expect(line.textContent).toContain(MATE);
		expect(line.textContent).toContain('Your own blade is not on screen');
		expect(m.all('[data-testid="ideacad-return-mine"]')).toHaveLength(1);
	});

	it('calls back exactly once when pressed', () => {
		let calls = 0;
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'editor' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({
					openDocumentId: SHARED_DOC,
					onreturn: () => {
						calls += 1;
					}
				})
			})
		);
		m.one<HTMLButtonElement>('[data-testid="ideacad-return-mine"]').click();
		expect(calls).toBe(1);
	});

	it('is ABSENT on the caller\'s own document, which is every student on every ordinary assignment', () => {
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ documentId: MINE_DOC, role: 'owner' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: MINE_DOC })
			})
		);
		expect(m.all('[data-testid="ideacad-reading-shared"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-return-mine"]')).toHaveLength(0);
		// The positive control: the editor really is mounted, so the two zeroes
		// are an absence rather than a surface that never rendered.
		expect(m.all('[data-testid="ideacad-editor"]')).toHaveLength(1);
	});

	it('withholding the callback removes the control and says what to do instead', () => {
		// Absence is the mechanism, and a control missing with no explanation
		// reads as a bug rather than as a rule.
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'editor' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ openDocumentId: SHARED_DOC, omitReturn: true })
			})
		);
		expect(m.all('[data-testid="ideacad-return-mine"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-return-absent"]')).toHaveLength(1);
		expect(m.one('[data-testid="ideacad-return-absent"]').textContent).toContain('Reload');
	});

	it('names no owner when the list cannot say who it is, rather than inventing one', () => {
		// The list is fetched once, so a document opened before a refresh has no
		// row to name. A placeholder there would be this file inventing an
		// identity.
		const m = track(
			mountBlade({
				ideacadDoc: snapshot({ role: 'editor' }),
				ideacadWrites: ALL_WRITES,
				ideacadShared: shared({ rows: [], openDocumentId: SHARED_DOC })
			})
		);
		const line = m.one('[data-testid="ideacad-reading-shared"]');
		expect(line.textContent).toContain('a classmate shared with you');
		expect(line.textContent).not.toContain('@');
	});
});

/* ------------------------------------------------------------------ */
/* The open control                                                    */
/* ------------------------------------------------------------------ */

describe('the Open control, which is the whole path that did not exist', () => {
	it('hands the document id back, and it is the row\'s own id', () => {
		const opened: string[] = [];
		const m = track(
			mountBlade({
				ideacadShared: shared({ onopen: (id: string) => opened.push(id) })
			})
		);
		const buttons = m.all<HTMLButtonElement>('[data-testid="ideacad-shared-open"]');
		expect(buttons).toHaveLength(2);
		buttons[0].click();
		// `ideacadSharedRows` orders on the normalized owner address, so luis
		// sorts before zoe and the FIRST row is the shared editor document.
		expect(opened).toEqual([SHARED_DOC]);
	});

	it('offers no Open on the row already on screen, and says why instead', () => {
		const m = track(mountBlade({ ideacadShared: shared({ openDocumentId: SHARED_DOC }) }));
		expect(m.all('[data-testid="ideacad-shared-open"]')).toHaveLength(1);
		expect(m.all('[data-testid="ideacad-shared-current"]')).toHaveLength(1);
	});

	it('withholding the callback removes every Open control, which is a surface with no store', () => {
		const m = track(mountBlade({ ideacadShared: shared({ onopen: undefined }) }));
		expect(m.all('[data-testid="ideacad-shared-open"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-shared-row"]')).toHaveLength(2);
	});
});
