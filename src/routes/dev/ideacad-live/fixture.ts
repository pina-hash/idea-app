/**
 * ONE IN-MEMORY "DATABASE" FOR TWO WORKSPACES (feedback R34's harness).
 *
 * It stands in for the three things the live layer touches, with the server's
 * own rules rather than a looser copy of them: a save is refused as stale when
 * its expected revision is not the current one (0216's `p_expected_revision`
 * check), a replayed operation id is a duplicate rather than a second write,
 * every row carries the saving person's address as `actor` (0209), the revision
 * is one plus the number of operations, and the history read repeats the
 * origin row on every page exactly as `ideacad_direct_concept_history` does.
 * The broadcast bus is the REAL in-memory `IdeacadLive`, adapted by the real
 * `connectIdeacadLive`, so the harness exercises the same filter the route
 * does.
 */
import { applyActions, diffTrees } from '$lib/ideacad/history';
import { canonical, type DirectRow } from '$lib/ideacad/solid/history';
import { SolidConflict } from '$lib/ideacad/solid/transport';
import { artifactHashes, connectIdeacadLive, readHistoryAfter, type SolidLiveTransport } from '$lib/ideacad/solid/live-sync';
import { createMemoryIdeacadLive, type IdeacadLive } from '$lib/ideacad/live';
import { emptyManifest, type GeometryArtifact, type SolidDocument, type SolidManifest, type SolidTransport } from '$lib/ideacad/solid/types';

export const DOCUMENT_ID = 'dev-live-document', CONCEPT_ID = 'dev-live-concept';
export interface LiveLogEntry { event: 'save' | 'refused' | 'pull' | 'head'; actor: string; revision: number; at: number }

export function createLiveServer(latencyMs = 120) {
	let manifest: SolidManifest = emptyManifest();
	manifest = { ...manifest, title: 'Shared bracket' };
	let revision = 1;
	let history: DirectRow[] = [{ seq: 0, kind: 'origin', path: '', after: manifest, actor: 'ana.reyes@boscotech.net' }];
	const store = new Map<string, GeometryArtifact>();
	const bus: IdeacadLive = createMemoryIdeacadLive();
	const log: LiveLogEntry[] = [];
	const wait = () => new Promise((r) => setTimeout(r, latencyMs));
	const clone = <T>(v: T): T => structuredClone(v);

	function snapshotDocument(): SolidDocument {
		return { id: DOCUMENT_ID, title: manifest.title, conceptId: CONCEPT_ID, revision, canWrite: true, owner: 'ana.reyes@boscotech.net', archivedAt: null, snapshot: { manifest: clone(manifest), artifacts: [...store.values()] }, history: clone(history) };
	}

	/** One person's transport. `hold` makes this person's saves fail on the wire (a retryable failure), which is how the harness keeps a session dirty on purpose. */
	function transportFor(actor: string, hold: () => boolean): SolidTransport {
		return {
			create: async () => snapshotDocument(),
			open: async () => { await wait(); return snapshotDocument(); },
			save: async (input) => {
				await wait();
				if (hold()) throw Error('Failed to fetch');
				let expected = input.expectedRevision;
				for (const a of input.snapshot.artifacts) store.set(a.hash, a);
				for (const operation of input.actions) {
					const done = history.find((h) => h.operationId === operation.id && h.operationStart);
					if (done) { expected = done.resultRevision ?? expected; continue; }
					if (expected !== revision) { log.push({ event: 'refused', actor, revision, at: performance.now() }); throw new SolidConflict('This model changed in another session. Export a backup, then reopen it before continuing.'); }
					const patches = operation.changes ?? diffTrees(operation.before, operation.after);
					const next = applyActions(manifest, patches);
					if (canonical(next) !== canonical(operation.after)) throw Error('The history actions do not produce the saved model.');
					const start = history.length;
					revision += 1;
					history = [...history, ...patches.map((p, i) => ({ ...clone(p), seq: start + i, actor, operationId: operation.id, operationStart: i === 0, operationLabel: i === 0 ? operation.label : null, resultRevision: i === 0 ? revision : null, at: new Date().toISOString() }))];
					manifest = next;
					expected = revision;
				}
				log.push({ event: 'save', actor, revision, at: performance.now() });
				return { revision: expected };
			}
		};
	}

	/** One person's live layer: the shared bus (or a refused one), the revision as the poll reads it, and the history read after a position. */
	function liveFor(actor: string, options: { refused?: boolean } = {}): SolidLiveTransport {
		return {
			viewerEmail: actor,
			connect: (documentId, handlers) => {
				if (options.refused) { handlers.status('refused'); return { send() {}, close() {} }; }
				return connectIdeacadLive(bus, documentId, handlers);
			},
			head: async () => { await wait(); log.push({ event: 'head', actor, revision, at: performance.now() }); return revision; },
			pull: async ({ afterSeq, have, artifacts }) => {
				const read = await readHistoryAfter(async (after, limit) => {
					await wait();
					return { rows: clone([history[0], ...history.filter((r) => r.seq > after)].slice(0, limit)), newestSeq: history.length - 1, total: history.length };
				}, afterSeq);
				log.push({ event: 'pull', actor, revision, at: performance.now() });
				const wanted = artifacts ? [...artifactHashes(read.rows)].filter((h) => !have.has(h)) : [];
				return { ...read, artifacts: wanted.map((h) => store.get(h)).filter((a): a is GeometryArtifact => !!a) };
			}
		};
	}

	return { snapshotDocument, transportFor, liveFor, log, get revision() { return revision; }, get manifest() { return manifest; } };
}
