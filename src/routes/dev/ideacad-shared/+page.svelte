<script lang="ts">
	/**
	 * Dev harness for the REAL `SharedDocuments` panel and the REAL
	 * `createIdeacadStore` shared-open path -- never a copy of either. The store
	 * is the shipping one, driven by an in-memory transport that answers exactly
	 * what `0205`'s two RPCs answer, refusals included.
	 *
	 * A NEW ROUTE RATHER THAN A STATE ON `/dev/ideacad` OR `/dev/ideacad-team`.
	 * Those belong to ledgers 0171 and 0190; a new URL collides with nobody, and
	 * `tools/browser-verify/routes.mjs` derives a spec's filename from its own
	 * path, so two lanes adding two routes always produce two different files.
	 *
	 * States by query string:
	 *   role=editor            a shared EDITOR: the list, one document open, and
	 *                          a store that writes
	 *   role=viewer            VIEW ONLY -- the state whose whole point is that
	 *                          not one control that would be refused is on screen
	 *   role=viewer&state=callbacks
	 *                          THE PAGE-BUG STATE. Every callback is handed in
	 *                          over a read-only payload, which is exactly what a
	 *                          wiring mistake produces, and the controls must
	 *                          STILL be absent -- because the gate is the role's
	 *                          own `canWrite` and not the presence of a handler
	 *   state=empty            nobody has shared anything: the normal state that
	 *                          must render no placeholder
	 *   state=unavailable      a deployment with no `0205`: a different absence
	 *                          with a different sentence
	 *   state=lost             the grant was removed while the document was open,
	 *                          which is the case a student has to SEE rather than
	 *                          discover on a refused write
	 *
	 * THE TRANSPORT ENFORCES NOTHING. The database is the boundary; a harness
	 * that re-implemented `_ideacad_can_write_document` would be a second copy of
	 * the rule under test. What it does is ANSWER the shapes, including the
	 * refusal `0205` raises for a revoked grantee.
	 */
	import SharedDocuments from '$lib/ideacad/ui/SharedDocuments.svelte';
	import { createIdeacadStore, type IdeacadStoreState } from '$lib/ideacad/store';
	import {
		ideacadSharedOff,
		ideacadSharedOn,
		ideacadSharedRows,
		type IdeacadSharedRow
	} from '$lib/ideacad/shared-open';
	import type {
		IdeacadConceptRow,
		IdeacadDocumentRow,
		IdeacadOpenSharedResult,
		IdeacadTransports
	} from '$lib/ideacad/transports';
	import type { IdeacadSharedDocument } from '$lib/ideacad/sharing';

	/* READ ONCE INTO A `const`. This file declares `$state`, so it is in runes
	   mode, and a plain `let` reassigned after declaration and then read in the
	   template earns `non_reactive_update` -- which would move the repository's
	   warning baseline for a value that never changes after the first frame.
	   Ledger 0190 hit exactly this on `/dev/ideacad-team`. */
	function query(key: string, fallback: string): string {
		if (typeof window === 'undefined') return fallback;
		return new URLSearchParams(location.search).get(key) ?? fallback;
	}
	const role = query('role', 'editor');
	const variant = query('state', '');

	const OWNER = 'ana.reyes@boscotech.net';
	const OTHER = 'luis.ortega@boscotech.net';
	const ITEM = '99999999-8888-7777-6666-555555555555';
	const DOC_A = '11111111-2222-3333-4444-555555555555';
	const DOC_B = '22222222-3333-4444-5555-666666666666';

	const grantRole = role === 'viewer' ? 'viewer' : 'editor';

	/** Exactly what `ideacad_shared_with_me` returns, ordered by owner address. */
	const shared: IdeacadSharedDocument[] =
		variant === 'empty'
			? []
			: [
					{
						documentId: DOC_A,
						ownerEmail: OWNER,
						role: grantRole,
						grantedAt: '2026-09-12T17:00:00.000Z',
						updatedAt: '2026-09-13T00:10:00.000Z'
					},
					{
						documentId: DOC_B,
						ownerEmail: OTHER,
						role: 'viewer',
						grantedAt: '2026-09-11T15:30:00.000Z',
						updatedAt: '2026-09-12T20:45:00.000Z'
					}
				];

	const rows: IdeacadSharedRow[] = ideacadSharedRows(shared);
	const capability = variant === 'unavailable' ? ideacadSharedOff() : ideacadSharedOn();

	/* NAMED `documentRow`, NOT `document`. A local `document` shadows the global
	   one inside this module, so every geometry probe below silently loses the
	   DOM -- which type-checks as an error here but would be a runtime mystery in
	   a file without types. */
	function documentRow(id: string, owner: string): IdeacadDocumentRow {
		return {
			id,
			item_id: ITEM,
			student_email: owner,
			active_concept_id: `concept-${id}`,
			created_at: '2026-09-10T12:00:00.000Z',
			updated_at: '2026-09-13T00:10:00.000Z'
		};
	}
	function concept(documentId: string): IdeacadConceptRow {
		return {
			id: `concept-${documentId}`,
			document_id: documentId,
			name: 'Concept 1',
			position: 1,
			features: { schema: 1, features: [] },
			revision: 4,
			committed_at: null,
			deleted_at: null,
			created_at: '2026-09-10T12:00:00.000Z',
			updated_at: '2026-09-13T00:10:00.000Z'
		};
	}

	/** Set once the harness has deliberately revoked the grant. */
	let revoked = $state(false);

	const shell = () =>
		({
			live: { subscribe: () => () => {}, destroy: () => {} },
			setEditor: async () => ({}),
			openDocument: async () => {
				throw new Error('This harness only opens shared documents.');
			},
			newConcept: async () => concept(DOC_A),
			saveConcept: async (_id: string, features: unknown, revision: number) => {
				// The refusal `0205` raises for a caller whose role has become null.
				// The role is null by then, so it does NOT take the viewer arm.
				if (revoked) throw new Error('You can only save your own concept.');
				return {
					ok: true as const,
					concept: { ...concept(DOC_A), features, revision }
				};
			},
			updateConceptMeta: async () => concept(DOC_A),
			deleteConcept: async () => ({ ok: true as const, activeConceptId: `concept-${DOC_A}` }),
			setActive: async () => ({ ok: true as const }),
			setPrediction: async () => ({
				document_id: DOC_A,
				predicted_concept_id: `concept-${DOC_A}`,
				rationale: '',
				made_at: '2026-09-13T00:00:00.000Z'
			}),
			commitConcept: async () => concept(DOC_A),
			roster: async () => [],
			openSharedDocument: async (documentId: string): Promise<IdeacadOpenSharedResult> => {
				const owner = documentId === DOC_A ? OWNER : OTHER;
				const rowRole = documentId === DOC_A ? grantRole : 'viewer';
				return {
					document: documentRow(documentId, owner),
					concepts: [concept(documentId)],
					prediction: null,
					config: null,
					role: rowRole,
					canWrite: rowRole === 'editor'
				};
			},
			// THE NON-THROWING ANSWER `accessWasRevoked` ASKS. A revoked grantee
			// simply gets a list with the document missing, which is what makes a
			// successful call a DECISION and a failed one undecided.
			sharedWithMe: async (): Promise<IdeacadSharedDocument[]> =>
				revoked ? shared.filter((row) => row.documentId !== DOC_A) : shared
		}) as unknown as IdeacadTransports;

	const store = createIdeacadStore(shell());
	let snapshot = $state<IdeacadStoreState>(store.state);
	store.subscribe((next) => {
		snapshot = next;
	});

	let log = $state<string[]>([]);

	async function open(documentId: string) {
		try {
			await store.openShared(documentId);
			log = [...log, `opened ${documentId}`];
		} catch (error) {
			log = [...log, `refused: ${error instanceof Error ? error.message : String(error)}`];
		}
	}

	/* THE HARNESS DRIVES THE REAL PATH TO REACH `lost`. It opens the document,
	   revokes the grant behind the scenes, then edits -- so the terminal state is
	   produced by the shipping store reacting to the shipping refusal, not by
	   setting a flag. Ledger 0190's `state=expiring` learned this lesson: a
	   fixture that seeds the state directly proves nothing about the mechanism. */
	$effect(() => {
		if (variant !== 'lost') return;
		void (async () => {
			await open(DOC_A);
			revoked = true;
			try {
				store.edit({ schema: 1, features: [{ kind: 'noop' }] });
				await store.save();
			} catch {
				// A refused write is the point of this state.
			}
		})();
	});

	/* THE DEFAULT OPEN, and `callbacks` is excluded because its own effect opens
	   the document first. Without that exclusion both effects opened it and the
	   log read "opened ..." twice, which is a harness saying something happened
	   twice that only happened once. */
	$effect(() => {
		if (variant === 'lost' || variant === 'empty' || variant === 'unavailable' || variant === 'callbacks')
			return;
		void open(DOC_A);
	});

	/**
	 * THE PAGE-BUG STATE, AND WHAT IT ACTUALLY PROVES.
	 *
	 * `SharedDocuments` has exactly one control and opening is a READ, so a
	 * viewer legitimately gets it -- there is no write callback on that panel to
	 * withhold. The viewer gate that matters lives one layer down, in the STORE,
	 * and this is where it is put to the test: with a viewer's document open,
	 * every one of the store's nine write methods is called anyway, which is
	 * exactly what a wiring mistake produces. Each must come back refused with
	 * `0205`'s own sentence, and the document's revision must not move.
	 *
	 * IT ASSERTS THE COUNT, so a probe that attempted nothing cannot read as a
	 * clean pass.
	 */
	let attempted = $state(0);
	let refused = $state(0);
	let revisionAfter = $state<number | null>(null);

	$effect(() => {
		if (variant !== 'callbacks') return;
		void (async () => {
			await open(DOC_A);
			const conceptId = snapshot.activeConceptId ?? `concept-${DOC_A}`;
			const attempts: (() => unknown)[] = [
				() => store.edit({ schema: 1, features: [{ kind: 'noop' }] }),
				() => store.create('Concept 2', { schema: 1, features: [] }),
				() => store.rename(conceptId, 'Renamed'),
				() => store.reposition(conceptId, 2),
				() => store.delete(conceptId),
				() => store.setActive(conceptId),
				() => store.setPrediction(conceptId, 'because'),
				() => store.commit(conceptId),
				() => store.undo()
			];
			for (const attempt of attempts) {
				attempted += 1;
				try {
					await attempt();
					log = [...log, 'WROTE (this is the defect)'];
				} catch (error) {
					refused += 1;
					log = [...log, `refused: ${error instanceof Error ? error.message : String(error)}`];
				}
			}
			revisionAfter = store.state.concepts[0]?.revision ?? null;
		})();
	});

	/* =====================================================================
	 * THE GEOMETRY PROBES.
	 *
	 * THIS CHROMIUM PAINTS NO SCROLLBAR INTO A SCREENSHOT AT ANY COLOUR, so a
	 * row or a control past its panel's edge is invisible to the eye AND to
	 * every content check -- ledger 0186 found a panel 446px over its box that
	 * way, and ledger 0190 found a select 103px inside a 176px field. Only a
	 * geometric read tells them apart, so the claims that matter are computed
	 * here and read by the browser spec rather than looked at.
	 * ================================================================== */
	function box(selector: string): DOMRect | null {
		const el = document.querySelector(selector);
		return el ? el.getBoundingClientRect() : null;
	}
	function all(selector: string): HTMLElement[] {
		return Array.from(document.querySelectorAll<HTMLElement>(selector));
	}

	function verdicts(): string[] {
		const out: string[] = [];
		const say = (label: string, ok: boolean) => out.push(`${label} ${ok ? 'ok' : 'FAIL'}`);
		const panel = box('[data-testid="ideacad-shared"]');
		say('the shared list is on screen', !!panel && panel.width > 0 && panel.height > 0);
		say(
			'nothing is wider than the window',
			document.documentElement.scrollWidth <= window.innerWidth + 1
		);
		if (panel) {
			/* EVERY CONTROL INSIDE ITS OWN PANEL. An Open button past the right
			   edge is a control a student cannot reach and cannot see is there. */
			say(
				'every control sits inside the panel that owns it',
				all('[data-testid="ideacad-shared"] button').every((el) => {
					const r = el.getBoundingClientRect();
					return r.width > 0 && r.left >= panel.left - 0.5 && r.right <= panel.right + 0.5;
				})
			);
			/* AND EVERY ROW. An address is one long word, so a row whose
			   `min-width: 0` was dropped pushes the whole panel wider. */
			say(
				'every row sits inside the panel',
				all('[data-testid="ideacad-shared-row"]').every((el) => {
					const r = el.getBoundingClientRect();
					return r.width > 0 && r.right <= panel.right + 0.5;
				})
			);
		}
		/* THE OWNER ADDRESS IS NOT CLIPPED. It is the one thing on the row a
		   student uses to tell two documents apart, and at 375 it is longer than
		   the column. `overflow-wrap: anywhere` is what keeps it whole; a row
		   that clipped it would look deliberate. */
		const owner = document.querySelector('.owner');
		if (owner) {
			const r = owner.getBoundingClientRect();
			const row = owner.closest('li')!.getBoundingClientRect();
			say('the owner address is inside its row', r.right <= row.right + 0.5);
			say('the owner address has height', r.height > 0);
		}
		/* THE OPEN CONTROL AND THE "Open now" MARK NEVER BOTH APPEAR ON ONE ROW.
		   One primary control per row is the rule; two would be two answers to
		   one question, and only a per-row read can see it. */
		say(
			'no row carries both an Open control and the Open-now mark',
			all('[data-testid="ideacad-shared-row"]').every(
				(li) =>
					!(
						li.querySelector('[data-testid="ideacad-shared-open"]') &&
						li.querySelector('[data-testid="ideacad-shared-current"]')
					)
			)
		);
		return out;
	}

	/**
	 * Whether anything that would be refused is on screen, with the row count
	 * beside it as the in-route positive control. An ABSENCE claim alone is a
	 * selector that might simply be wrong.
	 */
	function writeControls(): Record<string, number> {
		const n = (sel: string) => document.querySelectorAll(sel).length;
		return {
			rows: n('[data-testid="ideacad-shared-row"]'),
			open: n('[data-testid="ideacad-shared-open"]'),
			current: n('[data-testid="ideacad-shared-current"]'),
			viewonly: n('[data-testid="ideacad-shared-viewonly"]'),
			lost: n('[data-testid="ideacad-shared-access-lost"]'),
			empty: n('[data-testid="ideacad-shared-empty"]'),
			unavailable: n('[data-testid="ideacad-shared-unavailable"]')
		};
	}

	if (typeof window !== 'undefined') {
		const w = window as unknown as Record<string, unknown>;
		w.__ideacadSharedVerdicts = verdicts;
		w.__ideacadSharedControls = writeControls;
		w.__ideacadSharedStore = () => ({
			phase: snapshot.phase,
			canWrite: snapshot.canWrite,
			role: snapshot.role,
			accessLost: snapshot.accessLost,
			documentId: snapshot.document?.id ?? null,
			revision: snapshot.concepts[0]?.revision ?? null,
			attempted,
			refused
		});
	}
</script>

<main class="harness">
	<h1>IdeaCAD: a document shared with you</h1>
	<p class="ctx">
		role={role} state={variant || 'default'} &middot; store phase={snapshot.phase} &middot;
		canWrite={String(snapshot.canWrite)} &middot; documentRole={snapshot.role ?? 'none'}
	</p>

	<SharedDocuments
		{rows}
		{capability}
		openDocumentId={snapshot.document?.id ?? null}
		accessLost={snapshot.accessLost}
		onopen={open}
	/>

	<section class="probe" data-testid="ideacad-shared-probe">
		<h2>Store</h2>
		<p data-testid="ideacad-shared-phase">{snapshot.phase}</p>
		<p data-testid="ideacad-shared-canwrite">{String(snapshot.canWrite)}</p>
		<p data-testid="ideacad-shared-error">{snapshot.error ?? ''}</p>
		<p data-testid="ideacad-shared-attempted">{attempted}</p>
		<p data-testid="ideacad-shared-refused">{refused}</p>
		<p data-testid="ideacad-shared-revision">{revisionAfter ?? ''}</p>
		<ul>
			{#each log as line, index (index)}
				<li>{line}</li>
			{/each}
		</ul>
	</section>
</main>

<style>
	.harness {
		display: grid;
		gap: 1rem;
		padding: 1rem;
		max-width: 60rem;
	}
	h1 {
		margin: 0;
		font-size: 1.25rem;
		color: var(--text-1);
	}
	h2 {
		margin: 0;
		font-size: 1rem;
		color: var(--text-1);
	}
	.ctx {
		margin: 0;
		font: 12px 'Share Tech Mono', monospace;
		color: var(--text-2);
	}
	.probe {
		display: grid;
		gap: 0.3rem;
		padding: 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-1);
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.probe p,
	.probe ul {
		margin: 0;
	}
	.probe ul {
		padding-left: 1.2rem;
	}
</style>
