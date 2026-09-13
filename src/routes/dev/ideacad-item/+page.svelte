<script lang="ts">
	/**
	 * Dev harness for the MOUNT, which is the thing ledger 0201 could not build
	 * and the thing no panel harness can see.
	 *
	 * `/dev/ideacad-shared` drives `SharedDocuments` and the real store, and it
	 * passes on the day the panel is mounted nowhere -- which is exactly the
	 * state the repository was in for three days. This route mounts the REAL
	 * `ItemDetail` on a real schema-4 assignment, with the REAL
	 * `createIdeacadStore` behind it, so the questions only the join can answer
	 * get asked at 375 and 1440: does the panel fit inside `.engine-host`
	 * (which is a different container from the harness pane its container query
	 * was measured in), does the editor show the SHARED document rather than the
	 * load payload, and is there a way back out.
	 *
	 * A NEW ROUTE RATHER THAN A STATE ON `/dev/ideacad-shared`, which is ledger
	 * 0190's own argument written into `/dev/ideacad-team`'s header: a new URL
	 * collides with nobody, and `tools/browser-verify/routes.mjs` derives a
	 * spec's filename from its own path, so two lanes adding two routes always
	 * produce two different files.
	 *
	 * States by query string:
	 *   role=editor        a shared EDITOR grant: the writable editor over
	 *                      somebody else's document, the banner and the way back
	 *   role=viewer        VIEW ONLY -- the state whose whole point is that not
	 *                      one control that would be refused is on screen
	 *   role=owner         the caller's OWN document, which is every student on
	 *                      every ordinary assignment: no banner at all
	 *   role=viewer&state=callbacks
	 *                      THE PAGE-BUG STATE. Every write callback is handed in
	 *                      over a read-only payload, which is what a wiring
	 *                      mistake produces, and the write controls must STILL be
	 *                      absent -- because the gate is `canWrite` and not the
	 *                      presence of a handler
	 *   state=lost         the grant removed while the document was open, driven
	 *                      through the real store by a real refusal
	 *   state=conflict     THE STALE SAVE. The server answers `ok: false` with
	 *                      its own newer row, which is `store.ts`'s terminal
	 *                      `conflict` -- a DIFFERENT state from `lost` sharing
	 *                      one phase, and the one no harness reached until now.
	 *                      `lost` is a revoked grant and the call site rewrites
	 *                      its chip to "Not saved"; this one keeps "Changed
	 *                      elsewhere", and for a whole bundle that chip was the
	 *                      only thing on screen saying the document had stopped
	 *                      saving
	 *   state=empty        nobody has shared anything: the normal state
	 *   state=unavailable  a deployment with no `0205`
	 *
	 * THE TRANSPORT ENFORCES NOTHING. The database is the boundary; a harness
	 * that re-implemented `_ideacad_can_write_document` would be a second copy of
	 * the rule under test. It ANSWERS the shapes, refusals included.
	 */
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	/* THE ROOM PRODUCTION IS IN, AND ITS STYLESHEET WITH IT. `ItemDetail` only
	   ever renders under `/classroom/+layout.svelte`, which is `.cr-root` and
	   imports this sheet; a harness without both measures the portal plate and
	   reports numbers from a room the component is never in. A wrapper with no
	   stylesheet behind it is the worse of the two mistakes -- a class that
	   paints nothing -- so the presence row in the spec asserts the room
	   actually mounted rather than trusting the markup. */
	import '$lib/classroom/classroom.css';
	import { SECTION, ITEMS } from '../classroom-split/fixture';
	import type { ClassroomItem } from '$lib/classroom/classroom';
	import { createIdeacadStore, type IdeacadStoreState } from '$lib/ideacad/store';
	import { ideacadEditorSeed, type IdeacadEditorWrites } from '$lib/ideacad/mount';
	import {
		ideacadSharedOff,
		ideacadSharedOn,
		ideacadSharedRows
	} from '$lib/ideacad/shared-open';
	import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '$lib/ideacad/blade/materials';
	import type {
		IdeacadConceptRow,
		IdeacadDocumentRow,
		IdeacadOpenDocumentResult,
		IdeacadOpenSharedResult,
		IdeacadTransports
	} from '$lib/ideacad/transports';
	import type { IdeacadHistoryRow, IdeacadHistoryTransports } from '$lib/ideacad/history';
	import type { IdeacadSharedDocument } from '$lib/ideacad/sharing';

	/* READ ONCE INTO A `const`. This file declares `$state`, so it is in runes
	   mode, and a plain `let` reassigned after declaration and then read in the
	   template earns `non_reactive_update` -- which would move the repository's
	   warning baseline for a value that never changes after the first frame.
	   Ledgers 0190 and 0201 each hit this on their own harness. */
	function query(key: string, fallback: string): string {
		if (typeof window === 'undefined') return fallback;
		return new URLSearchParams(location.search).get(key) ?? fallback;
	}
	const role = query('role', 'editor');
	const variant = query('state', '');

	const ME = 'ana.reyes@boscotech.net';
	const MATE = 'luis.ortega@boscotech.net';
	const OTHER = 'zoe.hernandez@boscotech.net';
	const MINE = '11111111-1111-1111-1111-111111111111';
	const THEIRS = '22222222-2222-2222-2222-222222222222';
	const THIRD = '33333333-3333-3333-3333-333333333333';

	/** A SCHEMA-4 ASSIGNMENT built from the split fixture's own published item,
	 *  never typed out: `ideacadMount` reads `assignment_schema_version === 4`
	 *  and a hand-written item is a shape the fixture's producer never emits. */
	const ITEM: ClassroomItem = (() => {
		const found = ITEMS.find((i) => i.kind === 'assignment' && i.published);
		if (!found) throw new Error('the split fixture has no published assignment');
		return { ...found, assignment_schema_version: 4 } as ClassroomItem;
	})();

	const grantRole = role === 'viewer' ? ('viewer' as const) : ('editor' as const);

	/** Exactly what `ideacad_shared_with_me` returns. */
	const shared: IdeacadSharedDocument[] =
		variant === 'empty'
			? []
			: [
					{
						documentId: THEIRS,
						ownerEmail: MATE,
						role: grantRole,
						grantedAt: '2026-09-12T17:00:00.000Z',
						updatedAt: '2026-09-13T00:10:00.000Z'
					},
					{
						documentId: THIRD,
						ownerEmail: OTHER,
						role: 'viewer',
						grantedAt: '2026-09-11T15:30:00.000Z',
						updatedAt: '2026-09-12T20:45:00.000Z'
					}
				];

	const rows = ideacadSharedRows(shared);
	const capability = variant === 'unavailable' ? ideacadSharedOff() : ideacadSharedOn();

	/* NAMED `documentRow`, NOT `document`. A local `document` shadows the global
	   one, which takes the DOM away from every geometry probe below -- ledger
	   0201 shipped exactly that bug on its own harness and had to fix it. */
	function documentRow(id: string, owner: string): IdeacadDocumentRow {
		return {
			id,
			item_id: ITEM.id,
			student_email: owner,
			active_concept_id: `concept-${id}`,
			created_at: '2026-09-10T12:00:00.000Z',
			updated_at: '2026-09-13T00:10:00.000Z'
		};
	}
	function concept(documentId: string, name: string): IdeacadConceptRow {
		return {
			id: `concept-${documentId}`,
			document_id: documentId,
			name,
			position: 1,
			features: structuredClone(DEFAULT_BLADE_TREE),
			revision: 4,
			committed_at: null,
			deleted_at: null,
			created_at: '2026-09-10T12:00:00.000Z',
			updated_at: '2026-09-13T00:10:00.000Z'
		} as unknown as IdeacadConceptRow;
	}

	/** Two people on one document, which is the case decision 27 is about and
	 *  the case ledger 0211 named as never having been driven. */
	function log(documentId: string): IdeacadHistoryRow[] {
		return [
			{
				seq: 0,
				kind: 'origin',
				path: '',
				before: null,
				after: structuredClone(DEFAULT_BLADE_TREE),
				actor: documentId === MINE ? ME : MATE,
				at: '2026-09-12T18:00:00.000Z'
			},
			{
				seq: 1,
				kind: 'set',
				path: '/features/0/height',
				before: 0.5,
				after: 0.75,
				actor: ME,
				at: '2026-09-13T09:12:00.000Z'
			}
		];
	}

	/** Set once the harness has deliberately revoked the grant. */
	let revoked = $state(false);
	/**
	 * Set once the harness wants the server to answer STALE.
	 *
	 * A REFUSAL AND A STALE REVISION ARE TWO DIFFERENT ANSWERS AND THE STORE
	 * TREATS THEM DIFFERENTLY. `revoked` makes the write THROW, which sends
	 * `store.ts` down `accessWasRevoked` and ends in `accessLost: true`.
	 * `stale` makes it RESOLVE with `ok: false` and the server's own newer row,
	 * which is the ordinary conflict: terminal phase, `accessLost` false,
	 * `canWrite` still true, the local copy untouched. Both publish
	 * `phase: 'conflict'`, which is exactly why a harness that drove only one
	 * of them could not tell the two apart -- and why the conflict chip went a
	 * whole bundle without anybody seeing what it says.
	 */
	let stale = $state(false);

	const shell = () =>
		({
			live: { subscribe: () => () => {}, destroy: () => {} },
			setEditor: async () => ({}),
			openDocument: async (): Promise<IdeacadOpenDocumentResult> => ({
				document: documentRow(MINE, ME),
				concepts: [concept(MINE, 'My concept')],
				prediction: null,
				config: DEFAULT_BLADE_CONFIG
			}),
			newConcept: async () => concept(THEIRS, 'Concept 2'),
			saveConcept: async (_id: string, features: unknown, revision: number) => {
				// The refusal `0205` raises for a caller whose role has become null.
				if (revoked) throw new Error('You can only save your own concept.');
				// THE STALE ANSWER. `ideacad_save_concept` returns `ok: false`
				// with the row as it actually stands when the revision it was
				// sent is behind; it RESOLVES rather than raising, which is the
				// whole difference from the line above.
				if (stale)
					return { ok: false as const, concept: { ...concept(MINE, 'My concept'), revision: revision + 3 } };
				return { ok: true as const, concept: { ...concept(THEIRS, 'Their concept'), features, revision } };
			},
			updateConceptMeta: async () => concept(THEIRS, 'Their concept'),
			deleteConcept: async () => ({ ok: true as const, activeConceptId: `concept-${THEIRS}` }),
			setActive: async () => ({ ok: true as const }),
			setPrediction: async () => ({
				document_id: THEIRS,
				predicted_concept_id: `concept-${THEIRS}`,
				rationale: '',
				made_at: '2026-09-13T00:00:00.000Z'
			}),
			commitConcept: async () => concept(THEIRS, 'Their concept'),
			roster: async () => [],
			openSharedDocument: async (documentId: string): Promise<IdeacadOpenSharedResult> => {
				const rowRole = documentId === THEIRS ? grantRole : 'viewer';
				return {
					document: documentRow(documentId, documentId === THEIRS ? MATE : OTHER),
					concepts: [concept(documentId, 'Their concept')],
					prediction: null,
					config: DEFAULT_BLADE_CONFIG,
					role: rowRole,
					canWrite: rowRole === 'editor'
				};
			},
			// THE NON-THROWING ANSWER `accessWasRevoked` ASKS: a revoked grantee
			// gets a list with the document missing, which is what makes a
			// successful call a DECISION and a failed one undecided.
			sharedWithMe: async (): Promise<IdeacadSharedDocument[]> =>
				revoked ? shared.filter((row) => row.documentId !== THEIRS) : shared
		}) as unknown as IdeacadTransports;

	/**
	 * 0209's PAIR, ANSWERING THE REAL PAYLOAD SHAPES, so the timeline the mount
	 * reaches is the shipping one. Omitting these would publish
	 * `historyReady: false` and remove the whole feature, which is the one thing
	 * this route has to be able to show reaching a SHARED document.
	 */
	const history: IdeacadHistoryTransports<IdeacadConceptRow> = {
		conceptHistory: async (conceptId: string) => {
			const rows = log(conceptId.replace('concept-', ''));
			return {
				conceptId,
				rows,
				total: rows.length,
				newestSeq: rows[rows.length - 1]?.seq ?? null
			};
		},
		/* IT REFUSES WHEN THE GRANT IS GONE, EXACTLY AS `saveConcept` DOES, and
		   forgetting that is what made `state=lost` unreachable on the first
		   run: with 0209's transports present the store's write goes through
		   `applyActions` and NEVER touches `saveConcept`, so a harness that
		   refused in only one of them drove the terminal path in neither. The
		   sentence is `0205`'s own, raised for a caller whose role has become
		   null. */
		applyActions: async (conceptId: string, _actions: unknown, _features: unknown, revision?: number) => {
			if (revoked) throw new Error('You can only save your own concept.');
			/* AND HERE TOO, FOR THE SAME REASON THE REFUSAL IS IN BOTH: with
			   0209's transports present the store's write goes through
			   `applyActions` and NEVER touches `saveConcept`, so a harness that
			   answered stale in only one of them would drive the conflict in
			   neither. */
			if (stale)
				return {
					ok: false,
					concept: { ...concept(MINE, 'My concept'), revision: (revision ?? 0) + 3 },
					appended: 0,
					firstSeq: null,
					lastSeq: null
				};
			return {
				ok: true,
				concept: concept(conceptId.replace('concept-', ''), 'Their concept'),
				appended: 0,
				firstSeq: null,
				lastSeq: null
			};
		}
	};

	const store = createIdeacadStore(shell(), { history });
	let snapshot = $state<IdeacadStoreState>(store.state);
	store.subscribe((next) => {
		snapshot = next;
	});

	let notes = $state<string[]>([]);

	async function openShared(documentId: string) {
		try {
			await store.openShared(documentId);
			notes = [...notes, `opened ${documentId}`];
		} catch (error) {
			notes = [...notes, `refused: ${error instanceof Error ? error.message : String(error)}`];
		}
	}
	async function openMine() {
		try {
			await store.open(ITEM.id);
			notes = [...notes, 'returned to my own document'];
		} catch (error) {
			notes = [...notes, `refused: ${error instanceof Error ? error.message : String(error)}`];
		}
	}

	/* THE HARNESS DRIVES THE REAL PATH TO REACH `lost`: open, revoke behind the
	   scenes, then edit -- so the terminal state is produced by the shipping
	   store reacting to the shipping refusal rather than by setting a flag. */
	$effect(() => {
		if (variant !== 'lost') return;
		void (async () => {
			await openShared(THEIRS);
			revoked = true;
			try {
				store.edit({ schema: 1, features: [] });
				await store.save();
			} catch {
				// A refused write is the point of this state.
			}
		})();
	});

	/* THE STALE PATH, DRIVEN THE WAY A STUDENT REACHES IT: open the document,
	   let the server move underneath, then edit. Everything after that point is
	   the shipping store reacting to the shipping answer -- no flag is set on
	   the editor and no phase is published by hand. */
	$effect(() => {
		if (variant !== 'conflict') return;
		void (async () => {
			await openMine();
			stale = true;
			try {
				store.edit({ schema: 1, features: [] });
				await store.save();
			} catch {
				// A stale answer RESOLVES, so nothing should land here.
			}
		})();
	});

	$effect(() => {
		if (variant === 'lost' || variant === 'unavailable' || variant === 'conflict') return;
		if (role === 'owner') {
			void openMine();
			return;
		}
		if (variant === 'empty') {
			// Nothing is shared, so the student is on their own document and the
			// panel's empty state is what the page renders under it.
			void openMine();
			return;
		}
		void openShared(THEIRS);
	});

	/**
	 * THE PAGE-BUG STATE, ON THE REAL MOUNT. Every write is handed down in every
	 * state below -- that is the point -- so `state=callbacks` is what asks the
	 * store the same question one layer down: with a viewer's document open,
	 * call all nine anyway and count the refusals.
	 */
	let attempted = $state(0);
	let refused = $state(0);

	$effect(() => {
		if (variant !== 'callbacks') return;
		void (async () => {
			await openShared(THEIRS);
			const conceptId = store.state.activeConceptId ?? `concept-${THEIRS}`;
			const attempts: (() => unknown)[] = [
				() => store.edit({ schema: 1, features: [] }),
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
					notes = [...notes, 'WROTE (this is the defect)'];
				} catch (error) {
					refused += 1;
					notes = [...notes, `refused: ${error instanceof Error ? error.message : String(error)}`];
				}
			}
		})();
	});

	/**
	 * EVERY WRITE, HANDED DOWN UNCONDITIONALLY, WHICH IS THE WHOLE POINT OF THIS
	 * HARNESS. `+page.svelte` builds this for any student with an IdeaCAD item,
	 * whatever the role turns out to be, so the read-only states here are driven
	 * with a full boundary in place. A harness that withheld it would be proving
	 * the page's rule instead of the component's gate.
	 */
	const writes: IdeacadEditorWrites = {
		edit: (features) => store.edit(features),
		create: async (name, features) => {
			const row = await store.create(name, features);
			return { id: row.id, name: row.name };
		},
		rename: (conceptId, name) => store.rename(conceptId, name),
		reposition: (conceptId, position) => store.reposition(conceptId, position),
		remove: async (conceptId) => {
			await store.delete(conceptId);
			return { activeConceptId: store.state.activeConceptId ?? conceptId };
		},
		activate: (conceptId) => store.setActive(conceptId),
		setPrediction: (conceptId, rationale) => store.setPrediction(conceptId, rationale),
		commit: (conceptId) => store.commit(conceptId),
		undo: () => store.undo(),
		redo: () => store.redo()
	};

	/** The load's payload: this student's OWN document, which the read-only
	 *  manager arm renders and which a viewer's mount must NOT fall back to. */
	const payload = {
		document: { id: MINE, active_concept_id: `concept-${MINE}` },
		concepts: [concept(MINE, 'My concept')],
		config: DEFAULT_BLADE_CONFIG
	};

	/**
	 * THE SHARING PANEL'S PROP, BUILT THE WAY `+page.svelte` BUILDS IT, and its
	 * absence from the first version of this harness is what hid a real defect:
	 * production mounts `SharePanel` whenever a document is open, so a picture
	 * of this surface without one is a picture of a page nobody sees. `role`
	 * comes off the STORE, which is the fix this bundle made one file over -- it
	 * was a hardcoded `'owner'`, which on a classmate's document would have put
	 * a share form under a document the caller does not own.
	 */
	const teamProp = $derived(
		snapshot.document
			? {
					role: snapshot.role,
					ownerEmail: ME,
					/* EMPTY IS THE HONEST ANSWER FOR A NON-OWNER, and it is what the
					   real page produces: `ideacad_document_grants` refuses a caller
					   who is not the owner, the page catches it and clears the list. */
					grants: snapshot.role === 'owner' ? [{ granteeEmail: MATE, role: 'editor' as const, grantedBy: ME, grantedAt: '2026-09-12T17:00:00.000Z' }] : [],
					sharingReady: capability.ready,
					onshare: capability.ready ? async () => {} : undefined,
					onunshare: capability.ready ? async () => {} : undefined,
					assembly: null,
					myPartId: null,
					secondsLeft: null,
					phase: 'idle' as const,
					notice: null,
					teammates: []
				}
			: null
	);

	const sharedProp = $derived({
		rows,
		capability,
		openDocumentId: snapshot.document?.id ?? null,
		accessLost: snapshot.accessLost,
		busy: false,
		onopen: capability.ready ? (documentId: string) => void openShared(documentId) : undefined,
		onreturn: () => void openMine()
	});

	/* =====================================================================
	 * THE GEOMETRY PROBES.
	 *
	 * THIS CHROMIUM PAINTS NO SCROLLBAR INTO A SCREENSHOT AT ANY COLOUR, so a
	 * row or a control past its container's edge is invisible to the eye AND to
	 * every content check -- ledger 0190 found a select 103px inside a 176px
	 * field that way and ledger 0201 found an 873px "Open" button. Only a
	 * geometric read tells them apart.
	 *
	 * AND THE CONTAINER HERE IS `.engine-host`, WHICH IS THE WHOLE REASON THIS
	 * ROUTE EXISTS. `SharedDocuments` is `container-type: inline-size` and its
	 * threshold was measured against `/dev/ideacad-shared`'s pane; a breakpoint
	 * inside a nested pane is dead code until it is measured there, and nothing
	 * warns.
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
		say(
			'nothing is wider than the window',
			document.documentElement.scrollWidth <= window.innerWidth + 1
		);
		const host = box('.engine-host');
		say('the engine host is on screen', !!host && host.width > 0 && host.height > 0);
		const panel = box('[data-testid="ideacad-shared"]');
		if (host && panel) {
			say(
				'the shared panel sits inside the engine host',
				panel.left >= host.left - 0.5 && panel.right <= host.right + 0.5 && panel.height > 0
			);
			/* THE 873px BUTTON, ASKED DIRECTLY. A control that stretches the whole
			   measure is present, visible, over 44px and correctly labelled, which
			   is every check it has. Only its WIDTH says it is wrong. */
			say(
				'no control in the shared panel is wider than half its panel',
				all('[data-testid="ideacad-shared"] button').every(
					(el) => el.getBoundingClientRect().width <= panel.width / 2 + 0.5
				)
			);
			say(
				'every control sits inside the panel that owns it',
				all('[data-testid="ideacad-shared"] button').every((el) => {
					const r = el.getBoundingClientRect();
					return r.width > 0 && r.left >= panel.left - 0.5 && r.right <= panel.right + 0.5;
				})
			);
			say(
				'every row sits inside the panel',
				all('[data-testid="ideacad-shared-row"]').every(
					(el) => el.getBoundingClientRect().right <= panel.right + 0.5
				)
			);
		}
		const banner = box('[data-testid="ideacad-reading-shared"]');
		if (host && banner) {
			say(
				'the reading-shared banner sits inside the engine host',
				banner.left >= host.left - 0.5 && banner.right <= host.right + 0.5 && banner.height > 0
			);
			const back = box('[data-testid="ideacad-return-mine"]');
			if (back) {
				/* NOT STRETCHED MEANS CONTENT-SIZED, NOT "under half the row",
				   and the first threshold written here was the second thing.
				   At 375 the banner wraps and the control takes its own line at
				   about 190px of a 325px measure -- correct, and over half. The
				   defect this is actually for is ledger 0201's 873px "Open": a
				   wrapped item that STRETCHES has exactly its container's
				   content width, so the diagnostic is being clearly narrower
				   than the banner rather than narrower than half of it. */
				say(
					'the way back is inside the banner and is not stretched across it',
					back.right <= banner.right + 0.5 && back.width <= banner.width - 24
				);
				say('the way back clears 44px', back.height >= 44);
			}
		}
		/* THE TWO CLAIMS ON ONE SCREEN, COMPARED. Ledger 0201's third defect was
		   a row reading "Can edit / Open now" three lines under a notice saying
		   the access was gone; every check passed because nothing compares two
		   claims for agreement. */
		const lost = document.querySelector('[data-testid="ideacad-shared-access-lost"]');
		if (lost) {
			/* THE CLAIM IS ABOUT THE ROW THAT LOST ITS GRANT, NOT ABOUT EVERY
			   ROW, and the first spelling of it here said every row -- which
			   FAILED correctly against a panel doing the right thing. The other
			   grant is untouched: a classmate removing one share says nothing
			   about anybody else's, so that row keeps its Open control and
			   removing it would be the panel over-reporting. What must be gone
			   is the Open-now mark ANYWHERE (the open document is the one that
			   was lost) and any control on the LOST row itself. */
			say(
				'no row claims a role the panel has just withdrawn',
				all('[data-testid="ideacad-shared-row"]').every((li) => {
					const isLost = !!li.querySelector('[data-testid="ideacad-shared-row-lost"]');
					const claimsOpenNow = !!li.querySelector('[data-testid="ideacad-shared-current"]');
					const offersOpen = !!li.querySelector('[data-testid="ideacad-shared-open"]');
					return !claimsOpenNow && (!isLost || !offersOpen);
				})
			);
			say(
				'exactly one row is marked as having lost its grant',
				all('[data-testid="ideacad-shared-row-lost"]').length === 1
			);
		}
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
	 * What is on screen, counted. An ABSENCE claim alone is a selector that
	 * might simply be wrong, so the row and editor counts ride beside it as the
	 * in-route positive control.
	 */
	function controls(): Record<string, number | string> {
		const n = (sel: string) => document.querySelectorAll(sel).length;
		const buttons = all('[data-testid="ideacad-editor"] button').map((b) =>
			(b.textContent ?? '').trim()
		);
		return {
			editors: n('[data-testid="ideacad-editor"]'),
			concept: document.querySelector('[data-testid="ideacad-editor"] h2')?.textContent?.trim() ?? '',
			undo: buttons.filter((t) => t === 'Undo').length,
			redo: buttons.filter((t) => t === 'Redo').length,
			accept: buttons.filter((t) => t.startsWith('✓')).length,
			historyToggle: n('[data-testid="ideacad-history-toggle"]'),
			rows: n('[data-testid="ideacad-shared-row"]'),
			open: n('[data-testid="ideacad-shared-open"]'),
			current: n('[data-testid="ideacad-shared-current"]'),
			viewonly: n('[data-testid="ideacad-shared-viewonly"]'),
			lost: n('[data-testid="ideacad-shared-access-lost"]'),
			empty: n('[data-testid="ideacad-shared-empty"]'),
			unavailable: n('[data-testid="ideacad-shared-unavailable"]'),
			banner: n('[data-testid="ideacad-reading-shared"]'),
			back: n('[data-testid="ideacad-return-mine"]'),
			sharePanel: n('[data-testid="ideacad-share"]'),
			shareForm: n('[data-testid="ideacad-share-form"]'),
			/* THE SENTENCE THAT SAYS SAVING HAS STOPPED. It rides beside the
			   chip's own word so a spec can compare the two claims: a chip
			   reading "Changed elsewhere" with this at 0 is the state this
			   harness was added to catch. */
			saveStopped: n('[data-testid="ideacad-save-stopped"]'),
			saveChip:
				document.querySelector('[data-testid="ideacad-editor"] .save')?.textContent?.trim() ?? ''
		};
	}

	if (typeof window !== 'undefined') {
		const w = window as unknown as Record<string, unknown>;
		w.__ideacadItemVerdicts = verdicts;
		w.__ideacadItemControls = controls;
		w.__ideacadItemStore = () => ({
			phase: snapshot.phase,
			canWrite: snapshot.canWrite,
			role: snapshot.role ?? 'none',
			accessLost: snapshot.accessLost,
			documentId: snapshot.document?.id ?? null,
			revision: snapshot.concepts[0]?.revision ?? null,
			attempted,
			refused
		});
		w.__ideacadItemOpenTimeline = () => {
			const toggle = document.querySelector<HTMLButtonElement>(
				'[data-testid="ideacad-history-toggle"]'
			);
			if (!toggle) return 'no timeline toggle';
			toggle.click();
			return 'clicked';
		};
	}

	const seed = $derived(ideacadEditorSeed(snapshot));
</script>

<div class="cr-root" data-testid="ideacad-item-room">
<main class="harness">
	<h1>IdeaCAD on the real item page</h1>
	<p class="ctx" data-testid="ideacad-item-ctx">
		role={role} state={variant || 'default'} &middot; phase={snapshot.phase} &middot;
		canWrite={String(snapshot.canWrite)} &middot; documentRole={snapshot.role ?? 'none'} &middot;
		seeded={String(!!seed)}
	</p>

	<!--
		THE REAL COMPONENT, NEVER A COPY OF ITS MARKUP. Every prop below is what
		`src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` builds; the
		one thing this file substitutes is the transport layer.
	-->
	<ItemDetail
		section={SECTION}
		item={ITEM}
		canManage={false}
		transports={null}
		ideacad={payload}
		ideacadDoc={snapshot}
		ideacadWrites={writes}
		ideacadViewerEmail={ME}
		ideacadShared={sharedProp}
		ideacadTeam={teamProp}
	/>

	<section class="probe" data-testid="ideacad-item-probe">
		<h2>Store</h2>
		<p data-testid="ideacad-item-attempted">{attempted}</p>
		<p data-testid="ideacad-item-refused">{refused}</p>
		<ul>
			{#each notes as line, index (index)}
				<li>{line}</li>
			{/each}
		</ul>
	</section>
</main>
</div>

<style>
	.harness {
		display: grid;
		gap: 1rem;
		padding: 1rem;
		max-width: 72rem;
	}
	h1 {
		margin: 0;
		font-size: 1.25rem;
		color: var(--text-1);
	}
	.ctx {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.probe {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		padding: 0.6rem;
	}
	.probe h2 {
		margin: 0 0 0.4rem;
		font-size: 0.9rem;
		color: var(--text-1);
	}
	.probe p,
	.probe li {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.probe ul {
		margin: 0.3rem 0 0;
		padding-left: 1rem;
	}
</style>
