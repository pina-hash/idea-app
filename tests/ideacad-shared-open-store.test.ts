// tests/ideacad-shared-open-store.test.ts
//
// THE SHARED-OPEN PATH IN `store.ts`. `0205` shipped
// `ideacad_open_shared_document` with no caller and the store had no
// `openShared`, so a grant was unreachable: the person it was given to could not
// put the document on screen at all.
//
// WHY THIS IS AUTOMATED RATHER THAN LEFT TO A HARNESS. Every claim below is one
// whose regression is INVISIBLE in normal use, which is the only bar CLAUDE.md
// sets for a test:
//
//   * A VIEWER'S STORE WRITING. It would work perfectly on screen -- the local
//     copy updates, the editor responds -- and the refusal arrives from the
//     database afterwards, or on somebody else's document. Nothing looks wrong.
//
//   * AN UNRECOGNISED ROLE OPENING WRITEABLE. A payload role this build does not
//     know must fail CLOSED. A build that coerced it would look identical until
//     a future role shipped.
//
//   * A REVOKED GRANT REPORTED AS RETRYABLE. The student keeps pressing save on
//     a document that can never accept one again, and the only symptom is a
//     "Not saved" they learn to ignore.
//
//   * AN UNDECIDED ROUND TRIP REPORTED AS A PERMANENT LOSS. The opposite error,
//     and just as silent: a network blip ends the session with a sentence saying
//     their access is gone when it is not.
//
// THE EXPECTED VALUES DO NOT COME FROM THE IMPLEMENTATION. The refusal sentence
// is read from `sharing.ts`, which pins it against `0205`'s own text in
// `tests/db/ideacad-sharing-pure.test.ts`; the payload shapes are read off the
// migration's `jsonb_build_object` calls.

import { describe, expect, it, vi } from 'vitest';
import { createIdeacadStore } from '../src/lib/ideacad/store';
import { IDEACAD_VIEW_ONLY_REFUSAL } from '../src/lib/ideacad/sharing';
import { IDEACAD_SHARED_ACCESS_LOST } from '../src/lib/ideacad/shared-open';
import type {
	IdeacadConceptRow,
	IdeacadOpenSharedResult,
	IdeacadTransports
} from '../src/lib/ideacad/transports';
import type { IdeacadSharedDocument } from '../src/lib/ideacad/sharing';

const DOC = 'document-shared';
const ITEM = 'item-1';
const OWNER = 'ana.reyes@boscotech.net';

const row = (features: unknown, revision = 1): IdeacadConceptRow => ({
	id: 'concept-1',
	document_id: DOC,
	name: 'Concept 1',
	position: 1,
	features,
	revision,
	committed_at: null,
	deleted_at: null,
	created_at: '2026-01-01',
	updated_at: '2026-01-01'
});

/** Exactly `ideacad_open_shared_document`'s payload, role and canWrite included. */
const sharedPayload = (role: unknown, canWrite: boolean): IdeacadOpenSharedResult =>
	({
		document: {
			id: DOC,
			item_id: ITEM,
			student_email: OWNER,
			active_concept_id: 'concept-1',
			created_at: '2026-01-01',
			updated_at: '2026-01-01'
		},
		concepts: [row({ value: 0 })],
		prediction: null,
		config: {},
		role,
		canWrite
	}) as unknown as IdeacadOpenSharedResult;

interface Options {
	role?: unknown;
	canWrite?: boolean;
	/** Omit to model a deployment with no 0205 at all. */
	withOpenShared?: boolean;
	/** Omit to model a deployment that cannot answer the revocation question. */
	withSharedWithMe?: boolean;
	/** What `sharedWithMe` answers; throwing models an undecided round trip. */
	sharedWithMe?: () => Promise<IdeacadSharedDocument[]>;
	saveConcept?: IdeacadTransports['saveConcept'];
}

function transport(options: Options = {}) {
	const calls = { saveConcept: 0, sharedWithMe: 0 };
	const save: IdeacadTransports['saveConcept'] =
		options.saveConcept ??
		(async (_id, features, revision) => {
			calls.saveConcept += 1;
			return { ok: true as const, concept: row(features, revision) };
		});
	const wrapped: IdeacadTransports['saveConcept'] = async (id, features, revision) => {
		if (!options.saveConcept) return save(id, features, revision);
		calls.saveConcept += 1;
		return save(id, features, revision);
	};
	const transports = {
		live: {
			sendPing() {},
			subscribePings: () => () => {},
			sendFrame() {},
			subscribeFrames: () => () => {},
			destroy() {}
		},
		setEditor: vi.fn(),
		openDocument: vi.fn(),
		newConcept: vi.fn(async () => row({}, 1)),
		saveConcept: wrapped,
		updateConceptMeta: vi.fn(async () => row({}, 1)),
		deleteConcept: vi.fn(async () => ({ ok: true as const, activeConceptId: 'concept-1' })),
		setActive: vi.fn(async () => ({ ok: true as const })),
		setPrediction: vi.fn(async () => ({
			document_id: DOC,
			predicted_concept_id: 'concept-1',
			rationale: '',
			made_at: '2026-01-01'
		})),
		commitConcept: vi.fn(async () => row({}, 1)),
		roster: vi.fn()
	} as unknown as IdeacadTransports;

	if (options.withOpenShared !== false) {
		(transports as { openSharedDocument?: unknown }).openSharedDocument = vi.fn(
			async () => sharedPayload(options.role ?? 'editor', options.canWrite ?? true)
		);
	}
	if (options.withSharedWithMe !== false) {
		(transports as { sharedWithMe?: unknown }).sharedWithMe = vi.fn(async () => {
			calls.sharedWithMe += 1;
			if (options.sharedWithMe) return options.sharedWithMe();
			return [
				{
					documentId: DOC,
					ownerEmail: OWNER,
					role: 'editor',
					grantedAt: '2026-09-12T17:00:00Z',
					updatedAt: '2026-09-13T00:00:00Z'
				}
			] as IdeacadSharedDocument[];
		});
	}
	return { transports, calls };
}

describe('opening a document somebody shared with you', () => {
	it('replaces the snapshot and takes the item id off the document row', async () => {
		const { transports } = transport({ role: 'editor', canWrite: true });
		const store = createIdeacadStore(transports);
		await store.openShared(DOC);
		expect(store.state.document?.id).toBe(DOC);
		// THE ITEM IS NOT A PARAMETER. A surface passing it separately would be a
		// second statement of which item this document belongs to.
		expect(store.state.itemId).toBe(ITEM);
		expect(store.state.concepts.length).toBe(1);
		expect(store.state.activeConceptId).toBe('concept-1');
		// `saved` and not `idle`: nothing is outstanding, and `idle` reads as
		// unsaved work.
		expect(store.state.phase).toBe('saved');
		expect(store.state.role).toBe('editor');
		expect(store.state.canWrite).toBe(true);
		expect(store.state.accessLost).toBe(false);
	});

	it('REFUSES on a deployment with no 0205 rather than resolving quietly', async () => {
		const { transports } = transport({ withOpenShared: false });
		const store = createIdeacadStore(transports);
		await expect(store.openShared(DOC)).rejects.toThrow(/cannot open a shared/i);
		// Nothing was published: a store that resolved would leave the surface
		// showing an empty editor for a document it never read.
		expect(store.state.document).toBeNull();
		expect(store.state.canWrite).toBe(false);
	});

	it('starts CLOSED before anything is opened', () => {
		const { transports } = transport();
		const store = createIdeacadStore(transports);
		// "Cannot tell" must never render as the permissive answer.
		expect(store.state.role).toBeNull();
		expect(store.state.canWrite).toBe(false);
	});
});

describe('a viewer cannot write, whatever the surface hands in', () => {
	/**
	 * THE STATE A PAGE BUG PRODUCES. Ledger 0195's shape: the gate is proven
	 * against the payload's `canWrite`, never against the presence of a callback,
	 * so the fixture hands EVERY write in over a read-only document and asserts
	 * they are all still refused.
	 */
	it('refuses all nine write methods with 0205\'s own sentence', async () => {
		const { transports, calls } = transport({ role: 'viewer', canWrite: false });
		const store = createIdeacadStore(transports);
		await store.openShared(DOC);
		expect(store.state.canWrite).toBe(false);

		const attempts: [string, () => unknown][] = [
			['edit', () => store.edit({ value: 1 })],
			['create', () => store.create('Concept 2', {})],
			['rename', () => store.rename('concept-1', 'Renamed')],
			['reposition', () => store.reposition('concept-1', 2)],
			['delete', () => store.delete('concept-1')],
			['setActive', () => store.setActive('concept-1')],
			['setPrediction', () => store.setPrediction('concept-1', 'because')],
			['commit', () => store.commit('concept-1')],
			['undo', () => store.undo()]
		];
		const refused: string[] = [];
		for (const [name, attempt] of attempts) {
			try {
				await attempt();
			} catch (error) {
				if ((error as Error).message === IDEACAD_VIEW_ONLY_REFUSAL) refused.push(name);
			}
		}
		// THE COUNT IS ASSERTED so a run that attempted nothing cannot pass, and
		// the NAMES so a method silently dropped from the list is visible.
		expect(refused).toEqual(attempts.map(([name]) => name));
		expect(refused.length).toBe(9);
		// NOTHING REACHED THE WIRE. The positive control for that zero is the
		// editor case below, which puts exactly one write on it.
		expect(calls.saveConcept).toBe(0);
		expect(store.state.concepts[0].revision).toBe(1);
	});

	it('POSITIVE CONTROL: the identical fixture as an editor writes', async () => {
		vi.useFakeTimers();
		const { transports, calls } = transport({ role: 'editor', canWrite: true });
		const store = createIdeacadStore(transports, { debounceMs: 10 });
		await store.openShared(DOC);
		store.edit({ value: 1 });
		await vi.advanceTimersByTimeAsync(20);
		vi.useRealTimers();
		expect(calls.saveConcept).toBe(1);
		expect(store.state.phase).toBe('saved');
	});

	it('fails CLOSED on a role this build does not recognise, even when the payload says canWrite', async () => {
		// The payload is deliberately self-contradictory, which is the shape a
		// future role or a bad deploy produces. `ideacadRoleFromPayload` drops it
		// and `ideacadCanWrite(null)` is false, so the AND refuses.
		const { transports, calls } = transport({ role: 'co-owner', canWrite: true });
		const store = createIdeacadStore(transports);
		await store.openShared(DOC);
		expect(store.state.role).toBeNull();
		expect(store.state.canWrite).toBe(false);
		expect(() => store.edit({ value: 1 })).toThrow(IDEACAD_VIEW_ONLY_REFUSAL);
		expect(calls.saveConcept).toBe(0);
	});

	it('refuses when the payload alone withholds the write, with a recognised role', async () => {
		// The other direction of the same AND: the role reads `editor` but the
		// database said no. Either one saying no is a no.
		const { transports } = transport({ role: 'editor', canWrite: false });
		const store = createIdeacadStore(transports);
		await store.openShared(DOC);
		expect(store.state.role).toBe('editor');
		expect(store.state.canWrite).toBe(false);
	});
});

describe('a grant removed while the document is open', () => {
	const revokedSave: IdeacadTransports['saveConcept'] = async () => {
		// `0205`'s own refusal for a caller whose role has become null. It does NOT
		// take the viewer arm, because the role is null rather than 'viewer'.
		throw new Error('You can only save your own concept.');
	};

	it('goes TERMINAL with its own sentence once the database confirms the loss', async () => {
		vi.useFakeTimers();
		const { transports, calls } = transport({
			role: 'editor',
			canWrite: true,
			saveConcept: revokedSave,
			// The grant is gone, so the list comes back without the document.
			sharedWithMe: async () => []
		});
		const store = createIdeacadStore(transports, { debounceMs: 10 });
		await store.openShared(DOC);
		store.edit({ value: 1 });
		await vi.advanceTimersByTimeAsync(20);
		vi.useRealTimers();

		expect(store.state.phase).toBe('conflict');
		expect(store.state.accessLost).toBe(true);
		// THE SENTENCE IS ITS OWN, not `conflict`'s. "This concept changed
		// elsewhere" would be a lie: nothing changed elsewhere, the access did.
		expect(store.state.error).toBe(IDEACAD_SHARED_ACCESS_LOST);
		expect(store.state.error).not.toMatch(/changed elsewhere/i);
		// The work on screen is untouched, which is what the sentence promises.
		expect(store.state.concepts[0].features).toEqual({ value: 1 });
		// It asked the database rather than parsing the refusal text.
		expect(calls.sharedWithMe).toBe(1);

		// TERMINAL MEANS TERMINAL FOR EVERY WRITE, not only for the autosave that
		// discovered it. `conflict` alone stops the MACHINE; these are explicit
		// presses that go straight to their RPC, and with `canWrite` left true
		// `refuseWrite` waved all of them through to a raw database error.
		expect(store.state.canWrite).toBe(false);
		await expect(store.create('Concept 2', {})).rejects.toThrow(IDEACAD_SHARED_ACCESS_LOST);
		await expect(store.rename('concept-1', 'x')).rejects.toThrow(IDEACAD_SHARED_ACCESS_LOST);
		await expect(store.delete('concept-1')).rejects.toThrow(IDEACAD_SHARED_ACCESS_LOST);
		expect(() => store.edit({ value: 2 })).toThrow(IDEACAD_SHARED_ACCESS_LOST);
		// AND THE SENTENCE IS THE ACCESS ONE, not the view-only one: telling this
		// student they have "view-only access" describes a state they were never
		// in and says nothing about the work still on their screen.
		expect(() => store.edit({ value: 3 })).not.toThrow(IDEACAD_VIEW_ONLY_REFUSAL);
	});

	it('counts a NARROWED grant as a loss of the write, not only a removed one', async () => {
		vi.useFakeTimers();
		const { transports } = transport({
			role: 'editor',
			canWrite: true,
			saveConcept: revokedSave,
			// Still shared, but demoted to view-only.
			sharedWithMe: async () => [
				{
					documentId: DOC,
					ownerEmail: OWNER,
					role: 'viewer',
					grantedAt: '2026-09-12T17:00:00Z',
					updatedAt: '2026-09-13T00:00:00Z'
				}
			]
		});
		const store = createIdeacadStore(transports, { debounceMs: 10 });
		await store.openShared(DOC);
		store.edit({ value: 1 });
		await vi.advanceTimersByTimeAsync(20);
		vi.useRealTimers();
		expect(store.state.accessLost).toBe(true);
		expect(store.state.error).toBe(IDEACAD_SHARED_ACCESS_LOST);
	});

	it('an UNDECIDED round trip is NOT a lost grant: the error stays retryable', async () => {
		vi.useFakeTimers();
		const { transports } = transport({
			role: 'editor',
			canWrite: true,
			saveConcept: revokedSave,
			// The re-ask itself failed, so nothing was decided.
			sharedWithMe: async () => {
				throw new Error('network');
			}
		});
		const store = createIdeacadStore(transports, { debounceMs: 10 });
		await store.openShared(DOC);
		store.edit({ value: 1 });
		await vi.advanceTimersByTimeAsync(20);
		vi.useRealTimers();

		// `error`, NOT `conflict`: reporting an undecided round trip as a terminal
		// loss is the lie `checkout.ts` names for a failed heartbeat.
		expect(store.state.phase).toBe('error');
		expect(store.state.accessLost).toBe(false);
		expect(store.state.error).not.toBe(IDEACAD_SHARED_ACCESS_LOST);
		expect(store.state.error).toBe('You can only save your own concept.');
	});

	it('leaves an OWNER alone: their own grant cannot be revoked, so no round trip', async () => {
		vi.useFakeTimers();
		const { transports, calls } = transport({
			role: 'editor',
			canWrite: true,
			saveConcept: revokedSave
		});
		// Open the caller's OWN document instead, which publishes role 'owner'.
		(transports as { openDocument: unknown }).openDocument = vi.fn(async () => ({
			document: {
				id: DOC,
				item_id: ITEM,
				student_email: 'me@boscotech.net',
				active_concept_id: 'concept-1',
				created_at: '2026-01-01',
				updated_at: '2026-01-01'
			},
			concepts: [row({ value: 0 })],
			prediction: null,
			config: {}
		}));
		const store = createIdeacadStore(transports, { debounceMs: 10 });
		await store.open(ITEM);
		expect(store.state.role).toBe('owner');
		store.edit({ value: 1 });
		await vi.advanceTimersByTimeAsync(20);
		vi.useRealTimers();
		// The refusal stands as an ordinary error and NO question was asked.
		expect(store.state.phase).toBe('error');
		expect(calls.sharedWithMe).toBe(0);
	});

	it('cannot ask at all on a deployment with no sharedWithMe, and says nothing it does not know', async () => {
		vi.useFakeTimers();
		const { transports } = transport({
			role: 'editor',
			canWrite: true,
			saveConcept: revokedSave,
			withSharedWithMe: false
		});
		const store = createIdeacadStore(transports, { debounceMs: 10 });
		await store.openShared(DOC);
		store.edit({ value: 1 });
		await vi.advanceTimersByTimeAsync(20);
		vi.useRealTimers();
		expect(store.state.phase).toBe('error');
		expect(store.state.accessLost).toBe(false);
	});
});
